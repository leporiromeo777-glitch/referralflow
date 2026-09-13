import 'server-only';
import { query } from './db';
import { registraRevisione } from './audit/revisione';
import { estraiSostituzioni } from './referti-learn';
import { misuraRevisione } from './referti-misura';
import { tassonomiaModifiche, conLineage } from './referti-tassonomia';
import { registraEvento, impronta } from './referti-eventi';

// Conferma di una bozza (13.9.2026): il cuore di «Conferma» del wizard della
// piattaforma, spostato qui perché lo usino sia la server action sia
// l'interfaccia nuova (`POST /api/prototipo/referti/[id]/conferma`). Fa
// tutto quello che faceva l'azione: gate pre-firma con presa d'atto,
// stato → confermata, audit (artefatto + human_edits), misura della
// revisione con tassonomia e lineage, proposte di stile e di dizionario,
// evento «conferma». Mai testo clinico nei log.
const MAX_TESTO = 200_000;
const MAX_SUGGERIMENTI = 30;

export type TelemetriaConferma = {
  tempo_revisione_s?: number | null;
  flag_totali?: number | null;
  flag_accettati_senza_riascolto?: number | null;
  flag_critici_totali?: number | null;
  flag_critici_chiusi?: number | null;
  revisione_iniziata_at?: string | null;
  livello_verifica?: string | null;
  presa_atto?: boolean;
  origine?: string;
};

export type EsitoConferma = { ok: true } | { ok: false; errore: 'testo' | 'critici' | 'non_bozza' };

const intero = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : null;
};

export async function confermaBozzaCore(a: {
  studioId: string; userId: string; ruoloUtente: string; id: string; testo: string;
  campi: Record<string, string>; tele: TelemetriaConferma;
}): Promise<EsitoConferma> {
  const testo = a.testo.slice(0, MAX_TESTO);
  if (!testo.trim()) return { ok: false, errore: 'testo' };
  const criticiTot = intero(a.tele.flag_critici_totali, 1000);
  const criticiChiusi = intero(a.tele.flag_critici_chiusi, 1000);
  const criticiAperti = criticiTot !== null && criticiChiusi !== null ? Math.max(0, criticiTot - criticiChiusi) : 0;
  const livelloVerifica = String(a.tele.livello_verifica ?? '').replace(/[^a-z]/g, '').slice(0, 12);
  const presaAtto = a.tele.presa_atto === true;
  // Gate pre-firma (Ricerca 18 §16.1): con critiche ancora aperte, o con un
  // livello di verifica non pieno, la conferma passa solo con la presa
  // d'atto esplicita, e resta registrata come override.
  if ((criticiAperti > 0 || (livelloVerifica && livelloVerifica !== 'pieno')) && !presaAtto) return { ok: false, errore: 'critici' };

  const campi: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.campi)) if (typeof v === 'string') campi[k.slice(0, 80)] = v.trim().slice(0, 2000);

  const [row] = await query<{ ai_text: string | null; versioni: Record<string, string> | null; grezzo: string | null; pipeline_version: string | null; prompt_version: string | null; medico: string | null }>(
    `update referti_bozze
        set stato = 'confermata', testo_finale = $3, campi_confermati = $4,
            reviewed_by = $5, reviewed_at = now()
      where id = $1 and studio_id = $2 and stato = 'bozza'
      returning payload ->> 'testo_corretto' as ai_text, payload -> 'versioni' as versioni, payload ->> 'testo_grezzo' as grezzo,
                payload -> 'versione_catena' ->> 'pipeline' as pipeline_version, payload -> 'versione_catena' ->> 'prompt' as prompt_version,
                payload -> 'medico' ->> 'id' as medico`,
    [a.id, a.studioId, testo, JSON.stringify(campi), a.userId]
  );
  if (!row) return { ok: false, errore: 'non_bozza' };

  // Audit: la versione confermata diventa un artefatto e il diff con l'ultimo
  // output AI una riga di human_edits, col ruolo di chi firma.
  try {
    const sec = intero(a.tele.tempo_revisione_s, 6 * 3600);
    await registraRevisione({
      studioId: a.studioId, bozzaId: a.id, userId: a.userId, ruoloUtente: a.ruoloUtente, testo,
      secondi: sec, pipelineVersion: row.pipeline_version ?? null, promptVersion: row.prompt_version ?? null, medico: row.medico ?? null,
    });
  } catch (e: any) { console.error('audit revisione:', e?.message || e); }

  // Misura della revisione: quanto la persona ha corretto la catena. Solo numeri.
  if (row.ai_text) {
    try {
      const m: Record<string, unknown> = { ...misuraRevisione(row.ai_text, testo) };
      const t = intero(a.tele.tempo_revisione_s, 6 * 3600);
      const ft = intero(a.tele.flag_totali, 1000);
      const fs = intero(a.tele.flag_accettati_senza_riascolto, 1000);
      if (t !== null) m.tempo_revisione_s = t;
      if (ft !== null) m.flag_totali = ft;
      if (fs !== null) m.flag_accettati_senza_riascolto = fs;
      if (criticiTot !== null) m.flag_critici_totali = criticiTot;
      if (criticiChiusi !== null) m.flag_critici_chiusi = criticiChiusi;
      const iniz = String(a.tele.revisione_iniziata_at ?? '');
      if (/^\d{4}-\d{2}-\d{2}T/.test(iniz)) m.revisione_iniziata_at = iniz.slice(0, 40);
      if (criticiAperti > 0) m.override_critici = criticiAperti;
      if (livelloVerifica) m.livello_verifica = livelloVerifica;
      if (presaAtto) m.presa_atto = true;
      if (a.tele.origine) m.origine = String(a.tele.origine).slice(0, 40);
      try {
        const tx = tassonomiaModifiche(row.ai_text, testo);
        m.classi = tx.classi;
        const versioni: Record<string, string> = { ...(row.versioni ?? {}), finale: row.ai_text };
        if (row.grezzo) versioni.grezzo_a = row.grezzo;
        const lin = conLineage(tx.modifiche, versioni);
        m.modifiche = lin.modifiche;
        m.origini = lin.origini;
        // Memoria di STILE: una riformulazione senza numeri, negazioni o
        // lateralità, di 2-6 parole per lato, diventa una regola PROPOSTA.
        for (const md of tx.modifiche) {
          if (md.classe !== 'STYLE') continue;
          const np = md.prima.trim(), nd = md.dopo.trim();
          const wp = np.split(/\s+/).length, wd = nd.split(/\s+/).length;
          if (wp < 2 || wp > 6 || wd < 2 || wd > 6 || /\d/.test(np + nd)) continue;
          if (np.toLowerCase() === nd.toLowerCase()) continue;
          await query(
            `insert into referti_suggerimenti (studio_id, da, a, tipo)
             values ($1, $2, $3, 'stile')
             on conflict (studio_id, da, a) do update
               set conteggio = referti_suggerimenti.conteggio + 1, updated_at = now(), ignorato = false`,
            [a.studioId, np.slice(0, 200), nd.slice(0, 200)]
          );
        }
      } catch (e: any) { console.error('Tassonomia modifiche fallita:', e?.message || e); }
      await query(`update referti_bozze set payload = jsonb_set(payload, '{revisione}', $3::jsonb) where id = $1 and studio_id = $2`, [a.id, a.studioId, JSON.stringify(m)]);
    } catch (e: any) { console.error('Misura revisione fallita:', e?.message || e); }
  }

  // Impara dalla correzione: sostituzioni ricorrenti → suggerimenti per il dizionario.
  if (row.ai_text && row.ai_text !== testo) {
    try {
      const sost = estraiSostituzioni(row.ai_text, testo).slice(0, MAX_SUGGERIMENTI);
      for (const s of sost) {
        await query(
          `insert into referti_suggerimenti (studio_id, da, a) values ($1, $2, $3)
           on conflict (studio_id, da, a) do update set conteggio = referti_suggerimenti.conteggio + 1, updated_at = now(), ignorato = false`,
          [a.studioId, s.da, s.a]
        );
      }
    } catch (e: any) { console.error('Estrazione suggerimenti referto fallita:', e?.message || e); }
  }

  await registraEvento(a.studioId, a.id, 'conferma', a.userId, {
    impronta_testo: impronta(testo),
    parole_finali: testo.split(/\s+/).filter(Boolean).length,
    campi: Object.keys(campi).length,
    override_critici: criticiAperti,
    livello_verifica: livelloVerifica,
    presa_atto: presaAtto,
    origine: a.tele.origine ?? 'piattaforma',
  });
  return { ok: true };
}
