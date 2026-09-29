import 'server-only';
import { query } from './db';
import { percentile } from './audit/metriche';
import { testoRiepilogo, type DatiSettimana } from './riepilogo-settimana';

// Numeri della settimana [da, a) per uno studio. Un referto conta una volta:
// la revisione confermata della segretaria se c'è, se no l'ultima misura al
// Word scaricato (audit.misure_lavoro). Solo conteggi e mediane.
type Riga = { bozza_id: string; medico: string | null; per100: number; edit_count: number; confermata: boolean };

async function misurati(studioId: string, da: Date, a: Date): Promise<Riga[]> {
  return query<Riga>(
    `with conf as (
       select distinct on (h.bozza_id) h.bozza_id, h.medico, h.edits_per_100_words::float as per100, h.edit_count, true as confermata
         from audit.human_edits h
        where h.studio_id = $1 and h.editor_role = 'SECRETARY' and h.created_at >= $2 and h.created_at < $3
        order by h.bozza_id, h.created_at desc),
     lav as (
       select distinct on (m.bozza_id) m.bozza_id, m.medico, m.edits_per_100_words::float as per100, m.edit_count, false as confermata
         from audit.misure_lavoro m
        where m.studio_id = $1 and m.editor_role = 'SECRETARY' and m.created_at >= $2 and m.created_at < $3
          and not exists (select 1 from audit.human_edits h where h.bozza_id = m.bozza_id and h.editor_role = 'SECRETARY')
        order by m.bozza_id, m.created_at desc)
     select bozza_id::text, medico, per100, edit_count, confermata from conf
     union all select bozza_id::text, medico, per100, edit_count, confermata from lav`, [studioId, da, a]);
}

const mediana = (v: number[]) => percentile([...v].sort((x, y) => x - y), 0.5);
const giorno = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;

export async function datiSettimana(studioId: string, da: Date, a: Date): Promise<DatiSettimana> {
  const prima = new Date(da.getTime() - 7 * 86400_000);
  const [righe, righePrima] = await Promise.all([misurati(studioId, da, a), misurati(studioId, prima, da)]);
  const conta = async (sql: string, extra: unknown[] = []) => Number((await query<{ n: number }>(sql, [studioId, ...extra]))[0]?.n ?? 0);
  const [arrivate, confermate, word, aperte] = await Promise.all([
    conta(`select count(*)::int as n from referti_bozze where studio_id = $1 and created_at >= $2 and created_at < $3
             and coalesce(payload->>'ombra', 'false') <> 'true'`, [da, a]),
    conta(`select count(*)::int as n from referti_bozze where studio_id = $1 and stato = 'confermata' and reviewed_at >= $2 and reviewed_at < $3`, [da, a]),
    conta(`select count(distinct bozza_id)::int as n from referti_eventi where studio_id = $1 and azione = 'word_scaricato' and created_at >= $2 and created_at < $3`, [da, a]),
    conta(`select count(*)::int as n from referti_bozze where studio_id = $1 and stato = 'bozza' and created_at < $2
             and coalesce(payload->>'ombra', 'false') <> 'true'`, [new Date(a.getTime() - 7 * 86400_000)]),
  ]);
  const medici = new Map<string, number[]>();
  for (const r of righe) { const k = r.medico ?? '—'; medici.set(k, [...(medici.get(k) ?? []), r.per100]); }
  const fineSettimana = new Date(a.getTime() - 86400_000);
  return {
    da: giorno(da), a: giorno(fineSettimana),
    arrivate, confermate, word,
    misurati: righe.length,
    mediana100: righe.length ? mediana(righe.map((r) => r.per100)) : null,
    medianaPrima: righePrima.length ? mediana(righePrima.map((r) => r.per100)) : null,
    senzaCorrezioni: righe.filter((r) => r.edit_count === 0).length,
    perMedico: [...medici.entries()].map(([medico, v]) => ({ medico, n: v.length, mediana100: mediana(v) })).sort((x, y) => y.n - x.n),
    wordSenzaCorrezioniQui: righe.filter((r) => !r.confermata && r.edit_count === 0).length,
    aperteDaSettimana: aperte,
  };
}

// La settimana appena finita: da lunedì scorso a questo lunedì (ora locale del Mac).
export function settimanaScorsa(oggi = new Date()): { da: Date; a: Date } {
  const a = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  a.setDate(a.getDate() - ((a.getDay() + 6) % 7));
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate() - 7);
  return { da, a };
}

export async function riepilogoSettimana(studioId: string, oggi = new Date()): Promise<string> {
  const { da, a } = settimanaScorsa(oggi);
  return testoRiepilogo(await datiSettimana(studioId, da, a));
}
