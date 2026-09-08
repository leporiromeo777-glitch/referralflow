import 'server-only';
import { query } from '../db';
import { confronta } from './diff';
import { nuovoArtefatto, ultimoArtefattoAI } from './lineage';

// Revisione umana (§11-§16, §36-§39): stati per ruolo e diff tra l'ultimo
// output AI e la versione confermata. La metrica principale legge SOLO le
// righe con editor_role = 'SECRETARY'; il medico è registrato a parte.

export type RuoloRevisore = 'SECRETARY' | 'DOCTOR';

// Chi fa da segretaria: per default i ruoli «segretaria» e «admin» (nello
// studio pilota l'admin rivede i referti). Configurabile via env.
export function ruoloRevisore(ruoloUtente: string | null | undefined): RuoloRevisore {
  const segr = (process.env.AUDIT_RUOLI_SEGRETARIA ?? 'segretaria,admin').split(',').map((s) => s.trim());
  if (ruoloUtente === 'medico') return 'DOCTOR';
  return segr.includes(ruoloUtente ?? '') ? 'SECRETARY' : 'SECRETARY';
}

// Apertura del referto: NOT_REVIEWED → IN_REVIEW (una volta per ruolo).
export async function inizioRevisione(studioId: string, bozzaId: string, userId: string, ruoloUtente: string): Promise<void> {
  const role = ruoloRevisore(ruoloUtente);
  await query(
    `insert into audit.report_reviews (studio_id, bozza_id, role, status, user_id, started_at)
       values ($1, $2, $3, 'IN_REVIEW', $4, now())
       on conflict (bozza_id, role) do update
         set status = case when audit.report_reviews.status = 'NOT_REVIEWED' then 'IN_REVIEW' else audit.report_reviews.status end,
             started_at = coalesce(audit.report_reviews.started_at, now()),
             user_id = coalesce(audit.report_reviews.user_id, excluded.user_id),
             updated_at = now()`,
    [studioId, bozzaId, role, userId]
  );
}

// Conferma: la versione della persona diventa un artefatto (immutabile) e il
// confronto con l'ultimo output AI diventa UNA riga di human_edits. Gli
// autosave intermedi non passano di qui (§38: working_draft, mai contati).
export async function registraRevisione(opz: {
  studioId: string; bozzaId: string; userId: string; ruoloUtente: string; testo: string;
  secondi?: number | null; pipelineVersion?: string | null; promptVersion?: string | null; medico?: string | null;
  quando?: string | null;
}): Promise<{ edit_count: number } | null> {
  const role = ruoloRevisore(opz.ruoloUtente);
  const base = await ultimoArtefattoAI(opz.bozzaId);
  if (!base) return null;
  const c = confronta(base.testo, opz.testo);
  const aId = await nuovoArtefatto(opz.studioId, opz.bozzaId, role === 'DOCTOR' ? 'confermato_medico' : 'confermato_segretaria', role, opz.testo, [base.id], base.run_id, opz.quando ?? null);
  const m = c.metriche;
  await query(
    `insert into audit.human_edits (studio_id, bozza_id, run_id, editor_role, editor_user_id, from_artifact_id, to_artifact_id,
        edit_count, insertions, deletions, replacements, characters_changed, words_changed, words_total, edits_per_100_words,
        severity_max, categories, diff, review_seconds, pipeline_version, prompt_version, medico, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, coalesce($23::timestamptz, now()))`,
    [opz.studioId, opz.bozzaId, base.run_id, role, opz.userId, base.id, aId,
     m.edit_count, m.insertions, m.deletions, m.replacements, m.characters_changed, m.words_changed, m.words_total, m.edits_per_100_words,
     m.severity_max, JSON.stringify(m.categories), JSON.stringify(c.operazioni.slice(0, 500)), opz.secondi ?? null,
     opz.pipelineVersion ?? null, opz.promptVersion ?? null, opz.medico ?? null, opz.quando ?? null]
  );
  await query(
    `insert into audit.report_reviews (studio_id, bozza_id, role, status, user_id, started_at, completed_at)
       values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), coalesce($6::timestamptz, now()))
       on conflict (bozza_id, role) do update
         set status = excluded.status, completed_at = excluded.completed_at, user_id = coalesce(audit.report_reviews.user_id, excluded.user_id), updated_at = now()`,
    [opz.studioId, opz.bozzaId, role, m.edit_count === 0 ? 'REVIEWED_NO_CHANGES' : 'REVIEWED_WITH_CHANGES', opz.userId, opz.quando ?? null]
  );
  return { edit_count: m.edit_count };
}
