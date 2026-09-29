// Prova end-to-end delle azioni sulla seconda traccia con istruzioni
// (29.9.2026) sul DB DEMO, dati inventati, senza modello: Annulla ed «Era
// testo da aggiungere in fondo». Poi toglie tutto.
import { query, pool } from '../../src/lib/db';
import { togliAudit, ultimoTestoAI } from './pulizia-audit';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const prima = 'Caro Luca, rivedo il paziente. Terapia invariata.';
  const dopo = 'Caro Luca, rivedo il paziente.';
  const ist = { stato: 'fatta', testo: 'Togli la frase sulla terapia.', note: [], arrivata_il: new Date().toISOString(), esiti: [{ ok: true, descrizione: 'Tolta la frase 2' }], non_capite: [], prima };
  const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo, testo_finale) values ($1, 'prova-istr-' || gen_random_uuid(), $2, 'referto', $3) returning id`, [S, JSON.stringify({ testo_corretto: prima, istruzioni_traccia: ist }), dopo]);
  try {
    const post = (azione: string) => fetch(`${base}/api/prototipo/referti/${id}/istruzioni`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione }) });
    const g = await (await fetch(`${base}/api/prototipo/referti/${id}`, { headers: { cookie } })).json();
    verifica(g.istruzioni_traccia?.stato === 'fatta' && g.istruzioni_traccia?.esiti?.length === 1 && !('prima' in g.istruzioni_traccia), 'la revisione vede stato ed esiti (non il testo di prima)');
    const a = await post('annulla');
    const [x] = await query<{ t: string; s: string }>(`select testo_finale as t, payload->'istruzioni_traccia'->>'stato' as s from referti_bozze where id = $1`, [id]);
    verifica(a.status === 200 && x.t === prima && x.s === 'annullata', 'annulla: torna il testo di prima');
    verifica((await ultimoTestoAI(id)) === prima, 'annulla: per la misura delle correzioni la base torna il testo di prima');
    verifica((await post('annulla')).status === 409, 'annulla due volte: niente da annullare (409)');
    const f = await post('in_fondo');
    const [y] = await query<{ t: string; s: string }>(`select testo_finale as t, payload->'istruzioni_traccia'->>'stato' as s from referti_bozze where id = $1`, [id]);
    verifica(f.status === 200 && y.t === `${prima}\n\nTogli la frase sulla terapia.` && y.s === 'in_fondo', 'era testo da aggiungere: in fondo, come prima');
    verifica((await ultimoTestoAI(id)) === y.t, 'in fondo: la base della misura è il testo con la traccia in fondo');
  } finally {
    await togliAudit([id]);
    await query('delete from referti_eventi where bozza_id = $1', [id]);
    await query('delete from referti_bozze where id = $1', [id]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
