import 'server-only';
import { createHash } from 'crypto';
import { query } from '../db';
import { confronta } from './diff';
import { ultimoArtefattoAI } from './lineage';
import { ruoloRevisore } from './revisione';

// Misura delle correzioni anche senza «Conferma» (29.9.2026): quando si
// scarica il Word o si prepara l'e-mail di una bozza NON confermata, il testo
// di quel momento contro l'ultimo output della macchina. Solo numeri in
// audit.misure_lavoro (migrazione 079); una riga per testo diverso, così
// scaricare due volte lo stesso Word non conta due volte. Le bozze già
// confermate hanno la loro riga in human_edits e qui non entrano.
// Best-effort: non blocca mai il download.
export async function misuraAlloScaricamento(opz: {
  studioId: string; bozzaId: string; userId: string | null; ruoloUtente: string | null;
  momento: 'word' | 'email'; quando?: string | null;
}): Promise<{ edit_count: number } | null> {
  try {
    const [b] = await query<{ stato: string; testo: string; medico: string | null }>(
      `select stato, trim(coalesce(testo_finale, payload->>'testo_corretto', '')) as testo, payload->'medico'->>'id' as medico
         from referti_bozze where id = $1 and studio_id = $2`, [opz.bozzaId, opz.studioId]);
    if (!b || b.stato !== 'bozza' || !b.testo) return null;
    const base = await ultimoArtefattoAI(opz.bozzaId);
    if (!base) return null;
    const m = confronta(base.testo, b.testo).metriche;
    await query(
      `insert into audit.misure_lavoro (studio_id, bozza_id, momento, editor_role, editor_user_id, from_artifact_id, testo_hash,
          edit_count, insertions, deletions, replacements, characters_changed, words_changed, words_total, edits_per_100_words,
          severity_max, categories, medico, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, coalesce($19::timestamptz, now()))
         on conflict (bozza_id, testo_hash, from_artifact_id) do nothing`,
      [opz.studioId, opz.bozzaId, opz.momento, ruoloRevisore(opz.ruoloUtente), opz.userId, base.id,
       createHash('sha256').update(b.testo).digest('hex'),
       m.edit_count, m.insertions, m.deletions, m.replacements, m.characters_changed, m.words_changed, m.words_total, m.edits_per_100_words,
       m.severity_max, JSON.stringify(m.categories), b.medico, opz.quando ?? null]);
    return { edit_count: m.edit_count };
  } catch (e: any) {
    console.error(`[misura] ${opz.bozzaId.slice(0, 8)}: ${e?.code ?? e?.name ?? 'errore'}`);
    return null;
  }
}
