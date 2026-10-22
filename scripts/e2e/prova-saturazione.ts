// Prova end-to-end della saturazione notturna (22.10.2026) sul DB DEMO, con pazienti e notti INVENTATI: la chiave del
// generatore, la regola severa (nome e data di nascita, una persona sola), il rapporto fra i documenti, i doppioni, gli
// invii da assegnare (assegna, crea la cartella, scarta), elenco e dettaglio, i permessi. Poi toglie tutto e rimette la
// chiave com'era.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-saturazione.ts <base> <studio> <segretaria> <tecnico>
import { createHash } from 'crypto';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';

const [base, S, C_SEG, C_TEC] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const URL_INVIO = `${base}/api/saturazione/invio`, URL = `${base}/api/prototipo/saturazione`;
const CHIAVE = 'rfp_prova_sat_' + Date.now();
const invia = async (corpo: unknown, chiave = CHIAVE) => {
  const r = await fetch(URL_INVIO, { method: 'POST', headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json', Origin: 'null' }, body: JSON.stringify(corpo) });
  return { stato: r.status, cors: r.headers.get('access-control-allow-origin'), j: await r.json().catch(() => ({})) as any };
};
const leggi = async (cookie: string, q = '') => { const r = await fetch(`${URL}${q}`, { headers: { cookie } }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
const manda = async (cookie: string, corpo: unknown) => { const r = await fetch(URL, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
// Una notte come la manda il generatore (o2ring.js, «analisi»): inventata.
function notte(giorno: number, ore = 7) {
  const inizio = Date.UTC(2026, 9, giorno, 23, 0), min = ore * 60, nV = min * 15;
  return { inizio, fine: inizio + min * 60000, durata: min, valide: min, passo: 4, spo2: { media: 95, min: 84, max: 98 }, fc: { media: 64, min: 52, max: 88 },
    t90: 6, cad3: 49, cad4: 35, odi3: 7, odi4: 5, hist: { 96: nV - 90, 89: 90 }, nValide: nV,
    serie: Array.from({ length: min * 2 }, (_, k) => ({ m: k / 2, s: k % 50 === 0 ? 86 : 95, f: 64 })), eventi4: [30, 95.5] };
}
const PDF = Buffer.from('%PDF-1.4 rapporto del sonno di prova').toString('base64');
const corpo = (cognome: string, nome: string, nascita: string, notti = [notte(18), notte(19)]) => ({
  paziente: { cognome, nome, data_nascita: nascita }, apparecchio: 'O2Ring', notti, valutazione: 'Valutazione inventata.',
  referto: { nome_file: `Rapporto del sonno ${cognome} ${nome}.pdf`, pdf_base64: PDF },
});

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const [prima] = await query<{ h: string | null; t: string | null }>(`select pressione_token_hash as h, pressione_token_set_at::text as t from studios where id = $1`, [S]);
  const pazienti: string[] = [];
  try {
    await query(`update studios set pressione_token_hash = $2, pressione_token_set_at = now() where id = $1`, [S, createHash('sha256').update(CHIAVE).digest('hex')]);
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provasonno', 'Lia', '1950-03-04') returning id`, [S]);
    pazienti.push(pa);

    // 1 — la chiave del generatore (la stessa della pressione), anche da file://.
    const opz = await fetch(URL_INVIO, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } });
    const senza = await fetch(URL_INVIO), sbagliata = await fetch(URL_INVIO, { headers: { Authorization: 'Bearer rfp_sbagliata' } }), giusta = await fetch(URL_INVIO, { headers: { Authorization: `Bearer ${CHIAVE}` } });
    verifica(opz.status === 204 && senza.status === 401 && sbagliata.status === 401 && giusta.status === 200, `la chiave dello studio sì, senza o sbagliata no; il browser può chiedere da file:// (${opz.status}, ${senza.status}, ${sbagliata.status}, ${giusta.status})`);

    // 2 — riconosciuto (nome nell'altro ordine): nella cartella, col rapporto fra i documenti.
    const a = await invia(corpo('lia', 'PROVASONNO', '04.03.1950'));
    const [r] = await query<{ id: string; stato: string; documento_id: string | null; totale: any; inizio: string }>(`select id, stato, documento_id, totale, inizio::text from sat_registrazioni where studio_id = $1 and patient_id = $2`, [S, pa]);
    const docs = await query<{ categoria: string; filename: string }>(`select categoria, filename from patient_documents where patient_id = $1`, [pa]);
    verifica(a.stato === 201 && a.j.notti === 2 && a.j.referto === true && a.cors === '*' && r?.stato === 'assegnata' && !!r.documento_id && docs.length === 1 && docs[0].categoria === 'referto' && docs[0].filename.endsWith('.pdf'),
      `riconosciuto: due notti nella cartella e il rapporto PDF fra i documenti (${a.stato} ${a.j.esito ?? a.j.errore})`);
    verifica(r?.totale?.notti === 2 && r.totale.cad4 === 70 && r.totale.min === 84 && r.inizio.startsWith('2026-10-18 23:00'), `totali di tutte le notti e ora del paziente (${r?.totale?.cad4}, ${r?.inizio})`);
    const b = await invia(corpo('Provasonno', 'Lia', '1950-03-04'));
    verifica(b.stato === 200 && b.j.esito === 'gia_presente', `lo stesso invio rimandato non raddoppia (${b.stato} ${b.j.esito})`);

    // 3 — elenco e dettaglio, permessi.
    const el = await leggi(C_SEG), elTec = await leggi(C_TEC), fuori = await fetch(URL);
    const det = await leggi(C_SEG, `/${r?.id}`);
    verifica(el.stato === 200 && el.j.registrazioni?.some((x: any) => x.id === r?.id) && elTec.stato === 403 && fuori.status === 401 && det.stato === 200 && det.j.notti?.length === 2 && det.j.notti[0].serie?.length === 840 && det.j.valutazione === 'Valutazione inventata.',
      `elenco e dettaglio con le curve: la segreteria sì, il tecnico no, senza sessione no (${el.stato}, ${elTec.stato}, ${fuori.status}, ${det.stato})`);

    // 4 — chi non c'è: aspetta col suo rapporto; si guarda, si crea la cartella, va a posto.
    const c = await invia(corpo('Nuovasonno', 'Ada', '1944-05-06', [notte(20)]));
    const el2 = await leggi(C_SEG), arr = (el2.j.arrivi ?? []).find((x: any) => x.nome_letto === 'Nuovasonno Ada');
    const pdf = await fetch(`${URL}/${arr?.id}?referto=1`, { headers: { cookie: C_SEG } });
    const crea = await manda(C_SEG, { azione: 'crea_cartella', id: arr?.id, cognome: 'Nuovasonno', nome: 'Ada', data_nascita: '06.05.1944' });
    if (crea.j.patient_id) pazienti.push(crea.j.patient_id);
    const [r2] = await query<{ stato: string; documento_id: string | null; referto_key: string | null }>(`select stato, documento_id, referto_key from sat_registrazioni where id = $1`, [arr?.id]);
    verifica(c.stato === 202 && c.j.motivo === 'nessuno' && pdf.status === 200 && (pdf.headers.get('content-type') ?? '').includes('pdf') && crea.stato === 200 && crea.j.nuova === true && r2?.stato === 'assegnata' && !!r2.documento_id && r2.referto_key === null,
      `nessun paziente: aspetta, il rapporto si apre, «crea la cartella» la mette a posto col rapporto (${c.stato}, ${pdf.status}, ${crea.stato})`);

    // 5 — scartare; i limiti.
    const d = await invia(corpo('Scartasonno', 'Ugo', '1940-02-02', [notte(21)]));
    const arrD = ((await leggi(C_SEG)).j.arrivi ?? []).find((x: any) => x.nome_letto === 'Scartasonno Ugo');
    const scTec = await manda(C_TEC, { azione: 'scarta', id: arrD?.id }), sc = await manda(C_SEG, { azione: 'scarta', id: arrD?.id });
    const senzaNascita = await invia({ ...corpo('A', 'B', ''), paziente: { cognome: 'Provasonno', nome: 'Lia' } });
    const nonPdf = await invia({ ...corpo('Provasonno', 'Lia', '1950-03-04', [notte(22)]), referto: { pdf_base64: Buffer.from('PK....').toString('base64') } });
    const rotta = await invia({ ...corpo('Provasonno', 'Lia', '1950-03-04'), notti: [{ ...notte(23), spo2: { media: 140, min: 80, max: 99 } }] });
    verifica(d.stato === 202 && scTec.stato === 403 && sc.stato === 200 && senzaNascita.stato === 400 && nonPdf.stato === 400 && /Notte 1/.test(rotta.j.errore ?? ''),
      `scartare: il tecnico no, la segreteria sì; rifiutati con una frase senza nascita, non PDF, notte fuori scala (${scTec.stato}, ${sc.stato}, ${senzaNascita.stato}, ${nonPdf.stato}, ${rotta.stato})`);
  } finally {
    const chiavi = await query<{ k: string | null }>(`select referto_key as k from sat_registrazioni where studio_id = $1 and (nome_letto ilike '%sonno%')
      union all select d.storage_key from patient_documents d where d.patient_id = any($2::uuid[])`, [S, pazienti]);
    await query(`delete from sat_registrazioni where studio_id = $1 and nome_letto ilike '%sonno%'`, [S]);
    for (const { k } of chiavi) if (k) await deleteFile(k).catch(() => null);
    for (const id of pazienti) { await query(`delete from patient_documents where patient_id = $1`, [id]).catch(() => null); await query(`delete from patients where id = $1`, [id]).catch(() => null); }
    await query(`update studios set pressione_token_hash = $2, pressione_token_set_at = $3::timestamptz where id = $1`, [S, prima?.h ?? null, prima?.t ?? null]);
    await pool.end();
  }
  console.log(`\n${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
