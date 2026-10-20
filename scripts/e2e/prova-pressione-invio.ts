// Prova end-to-end dell'invio dal generatore dei referti Aktiia (20.10.2026) sul
// DB DEMO, con pazienti e misure INVENTATI: la chiave, la regola severa (nome e
// data di nascita, una persona sola), il profilo con giorno/notte del referto,
// il referto Word nei documenti, i doppioni, gli arrivi da assegnare col loro
// referto, i limiti. Poi toglie tutto e rimette la chiave com'era.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-pressione-invio.ts <base> <studio> <segretaria>
import { createHash } from 'crypto';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';

const [base, S, C_SEG] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const URL_INVIO = `${base}/api/pressione/invio`;
const CHIAVE = 'rfp_prova_' + Date.now();
const invia = async (corpo: unknown, chiave = CHIAVE) => {
  const r = await fetch(URL_INVIO, { method: 'POST', headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json', Origin: 'null' }, body: JSON.stringify(corpo) });
  return { stato: r.status, cors: r.headers.get('access-control-allow-origin'), j: await r.json().catch(() => ({})) as any };
};
const due = (n: number) => String(n).padStart(2, '0');
function misure(n: number, passoMin = 40) {
  return Array.from({ length: n }, (_, k) => {
    const min = 8 * 60 + k * passoMin, g = 15 + Math.floor(min / 1440), m = min % 1440;
    return { quando: `2026-10-${due(g)}T${due(Math.floor(m / 60))}:${due(m % 60)}`, sis: 128 + (k % 9), dia: 78 + (k % 6), fc: 66 };
  });
}
const DOCX = Buffer.from('PK\u0003\u0004 referto di prova').toString('base64');
const corpo = (cognome: string, nome: string, nascita: string, extra: Record<string, unknown> = {}) => ({
  paziente: { cognome, nome, data_nascita: nascita }, misure: misure(60), sveglia: '06:30', sonno: '23:00', apparecchio: 'Aktiia',
  referto: { nome_file: `Referto pressione ${cognome} ${nome}.docx`, docx_base64: DOCX }, ...extra,
});

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const [prima] = await query<{ h: string | null; t: string | null }>(`select pressione_token_hash as h, pressione_token_set_at::text as t from studios where id = $1`, [S]);
  const pazienti: string[] = [];
  const chiaviFile: string[] = [];
  try {
    await query(`update studios set pressione_token_hash = $2, pressione_token_set_at = now() where id = $1`, [S, createHash('sha256').update(CHIAVE).digest('hex')]);
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provainvio', 'Lia', '1950-03-04') returning id`, [S]);
    pazienti.push(pa);

    // 1 — la chiave, e il browser che apre il generatore da file://.
    const opz = await fetch(URL_INVIO, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
    const senza = await fetch(URL_INVIO), sbagliata = await fetch(URL_INVIO, { headers: { Authorization: 'Bearer rfp_sbagliata' } }), giusta = await fetch(URL_INVIO, { headers: { Authorization: `Bearer ${CHIAVE}` } });
    verifica(opz.status === 204 && opz.headers.get('access-control-allow-origin') === '*' && /authorization/i.test(opz.headers.get('access-control-allow-headers') ?? ''),
      `il browser può chiedere da file:// (preflight ${opz.status})`);
    verifica(senza.status === 401 && sbagliata.status === 401 && giusta.status === 200, `senza chiave o con una chiave sbagliata no, con quella dello studio sì (${senza.status}, ${sbagliata.status}, ${giusta.status})`);
    const refertiNo = await invia(corpo('Provainvio', 'Lia', '1950-03-04'), 'rfb_non_e_la_chiave_della_pressione');
    verifica(refertiNo.stato === 401, `la chiave delle bozze di referto non vale qui (${refertiNo.stato})`);

    // 2 — paziente riconosciuto (nome nell'altro ordine e senza maiuscole): profilo, giorno/notte, referto.
    const a = await invia(corpo('lia', 'PROVAINVIO', '1950-03-04'));
    verifica(a.stato === 201 && a.j.esito === 'nel_profilo' && a.j.misure === 60 && a.j.referto === true && a.cors === '*', `riconosciuto: profilo con 60 misure e referto (${a.stato} ${a.j.esito ?? a.j.errore})`);
    const [p] = await query<{ sveglia: string; sonno: string; apparecchio: string }>(`select sveglia, sonno, apparecchio from pa_profili where studio_id = $1 and patient_id = $2`, [S, pa]);
    verifica(p?.sveglia === '06:30' && p?.sonno === '23:00' && p?.apparecchio === 'Aktiia', `il profilo prende giorno e notte del referto (${p?.sveglia}–${p?.sonno}, ${p?.apparecchio})`);
    const docs = await query<{ categoria: string; filename: string; storage_key: string }>(`select categoria, filename, storage_key from patient_documents where patient_id = $1`, [pa]);
    docs.forEach((d) => chiaviFile.push(d.storage_key));
    verifica(docs.length === 1 && docs[0].categoria === 'referto' && docs[0].filename.endsWith('.docx'), `il referto Word è fra i documenti del paziente, come referto (${docs.length})`);
    const b = await invia(corpo('Provainvio', 'Lia', '1950-03-04'));
    const docs2 = await query(`select 1 from patient_documents where patient_id = $1`, [pa]);
    verifica(b.stato === 200 && b.j.esito === 'gia_presente' && docs2.length === 1, `rimandato: già presente, niente doppioni (${b.stato} ${b.j.esito})`);

    // 3 — data di nascita diversa: non si indovina, aspetta da assegnare col suo referto.
    const c = await invia(corpo('Provainvio', 'Lia', '1951-03-04'));
    verifica(c.stato === 202 && c.j.esito === 'da_assegnare' && c.j.motivo === 'nascita_diversa', `nascita diversa: da assegnare (${c.stato} ${c.j.esito} ${c.j.motivo})`);
    const d = await invia(corpo('Provainvio', 'Lia', '1951-03-04'));
    verifica(d.stato === 200 && d.j.esito === 'gia_in_attesa', `rimandato mentre aspetta: non si raddoppia (${d.stato} ${d.j.esito})`);
    const [arr] = await query<{ id: string; referto_key: string | null; impostazioni: any }>(`select id, referto_key, impostazioni from pa_arrivi where studio_id = $1 and nome_letto = 'Provainvio Lia' and stato = 'in_attesa'`, [S]);
    verifica(!!arr?.referto_key && arr?.impostazioni?.sveglia === '06:30', 'l’arrivo tiene referto e giorno/notte');
    if (arr?.referto_key) chiaviFile.push(arr.referto_key);

    // 4 — una persona lo assegna: il profilo prende giorno/notte e il referto entra nei documenti.
    const [{ id: pb }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provainvio', 'Bea', '1960-01-01') returning id`, [S]);
    pazienti.push(pb);
    const ass = await fetch(`${base}/api/prototipo/pressione`, { method: 'POST', headers: { cookie: C_SEG, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'assegna', id: arr?.id, patient_id: pb }) });
    const [pB] = await query<{ sveglia: string; apparecchio: string }>(`select sveglia, apparecchio from pa_profili where patient_id = $1`, [pb]);
    const docB = await query<{ categoria: string }>(`select categoria from patient_documents where patient_id = $1`, [pb]);
    const [arr2] = await query<{ stato: string; referto_key: string | null }>(`select stato, referto_key from pa_arrivi where id = $1`, [arr?.id]);
    verifica(ass.status === 200 && pB?.sveglia === '06:30' && pB?.apparecchio === 'Aktiia' && docB.length === 1 && docB[0].categoria === 'referto' && arr2?.stato === 'assegnato' && arr2?.referto_key === null,
      `assegnato da una persona: giorno/notte e referto arrivano con lui (${ass.status})`);

    // 5 — chi non c'è, e poi scartato: il referto in attesa si toglie.
    const e = await invia(corpo('Nessunoprova', 'Ugo', '1940-02-02'));
    const [arrE] = await query<{ id: string; referto_key: string | null }>(`select id, referto_key from pa_arrivi where studio_id = $1 and nome_letto = 'Nessunoprova Ugo' and stato = 'in_attesa'`, [S]);
    const sc = await fetch(`${base}/api/prototipo/pressione`, { method: 'POST', headers: { cookie: C_SEG, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'scarta_arrivo', id: arrE?.id }) });
    const [arrE2] = await query<{ stato: string; referto_key: string | null }>(`select stato, referto_key from pa_arrivi where id = $1`, [arrE?.id]);
    verifica(e.stato === 202 && e.j.motivo === 'nessuno' && sc.status === 200 && arrE2?.stato === 'scartato' && arrE2?.referto_key === null, `nessun paziente: aspetta; scartato, il referto si toglie (${e.stato}, ${sc.status})`);

    // 6 — i limiti.
    const lungo = await invia(corpo('Provainvio', 'Lia', '1950-03-04', { misure: misure(60, 300) }));   // 60 misure ogni 5 ore ≈ 12 giorni
    const poche = await invia(corpo('Provainvio', 'Lia', '1950-03-04', { misure: misure(5) }));
    const senzaNascita = await invia({ ...corpo('Provainvio', 'Lia', ''), paziente: { cognome: 'Provainvio', nome: 'Lia' } });
    const nonWord = await invia(corpo('Provainvio', 'Lia', '1950-03-04', { referto: { nome_file: 'x.docx', docx_base64: Buffer.from('%PDF').toString('base64') } }));
    verifica(lungo.stato === 400 && /otto giorni/.test(lungo.j.errore ?? '') && poche.stato === 400 && senzaNascita.stato === 400 && nonWord.stato === 400,
      `rifiutati con una frase: più di otto giorni, poche misure, senza nascita, non Word (${lungo.stato}, ${poche.stato}, ${senzaNascita.stato}, ${nonWord.stato})`);
    const [reg] = await query<{ n: number }>(`select count(*)::int as n from pa_registro where studio_id = $1 and (dettaglio::text ilike '%provainvio%' or dettaglio::text ~ '"(sis|dia)"')`, [S]);
    verifica(reg.n === 0, 'nel registro nessun nome e nessun valore');
  } finally {
    await query(`delete from pa_arrivi where studio_id = $1 and nome_letto in ('Provainvio Lia', 'Nessunoprova Ugo')`, [S]);
    for (const k of chiaviFile) await deleteFile(k).catch(() => null);
    for (const id of pazienti) await query(`delete from patients where id = $1`, [id]).catch(() => null);
    await query(`update studios set pressione_token_hash = $2, pressione_token_set_at = $3::timestamptz where id = $1`, [S, prima?.h ?? null, prima?.t ?? null]);
    await pool.end();
  }
  console.log(`\n${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
