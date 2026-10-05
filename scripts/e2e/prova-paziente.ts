// Prova end-to-end dell'abbinamento tollerante della bozza alla cartella
// (2.10.2026) sul DB DEMO, nomi inventati: nome trascritto a orecchio + visita
// in agenda → collegata da sola e nome nel testo come in cartella; senza
// visita → proposta, Collega a mano, Scollega che non si rifà. Poi toglie tutto.
import { query, pool } from '../../src/lib/db';
import { abbinaPazienteBozza } from '../../src/lib/paziente-bozza';
import { togliAudit } from './pulizia-audit';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const pazienti: string[] = [], bozze: string[] = [], app: string[] = [];
  const h = { cookie, 'Content-Type': 'application/json' };
  try {
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Zeffirettiprova', 'Marcello', '1950-02-01') returning id`, [S]);
    const [{ id: pb }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Bonnacorsiprova', 'Alfredo', '1962-07-15') returning id`, [S]);
    pazienti.push(pa, pb);
    const [{ id: ap }] = await query<{ id: string }>(`insert into appointments (studio_id, starts_at, external_uid, patient_id, paziente_nome) values ($1, now() - interval '1 day', 'prova-paz-' || gen_random_uuid(), $2, 'Zeffirettiprova Marcello') returning id`, [S, pa]);
    app.push(ap);
    const nuova = async (nome: string) => {
      const testo = `Caro Luca, rivedo il Signor ${nome.split(' ')[0]} per un controllo. Concerne: ${nome}.`;
      const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-paz-' || gen_random_uuid(), $2, 'referto') returning id`,
        [S, JSON.stringify({ testo_corretto: testo, dettato_il: new Date().toISOString(), campi_estratti: { nome_paziente: nome } })]);
      bozze.push(id);
      return id;
    };

    const b1 = await nuova('Zefirettiprova Marcello');
    const e1 = await abbinaPazienteBozza(S, b1);
    const [r1] = await query<{ pid: string | null; t: string; n: string }>(`select patient_id as pid, payload->>'testo_corretto' as t, payload->'campi_estratti'->>'nome_paziente' as n from referti_bozze where id = $1`, [b1]);
    verifica(e1 === 'simile_agenda' && r1.pid === pa, `nome trascritto a orecchio + visita in agenda: collegata da sola (${e1})`);
    verifica(r1.t.includes('Signor Zeffirettiprova') && r1.t.includes('Concerne: Zeffirettiprova Marcello') && r1.n === 'Zeffirettiprova Marcello', 'nome nel testo e nei campi come in cartella');

    const b2 = await nuova('Bonacorsiprova Alfredo');
    const e2 = await abbinaPazienteBozza(S, b2);
    const url = `${base}/api/prototipo/referti/${b2}/paziente`;
    const s2 = await (await fetch(url, { headers: { cookie } })).json();
    verifica(e2 === 'proposte' && s2.paziente == null && s2.proposte?.length === 1 && s2.proposte[0].id === pb, `senza visita in agenda: solo una proposta (${e2})`);
    const c2 = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ azione: 'collega', patient_id: pb }) });
    const [r2] = await query<{ pid: string | null; t: string }>(`select patient_id as pid, payload->>'testo_corretto' as t from referti_bozze where id = $1`, [b2]);
    verifica(c2.status === 200 && r2.pid === pb && r2.t.includes('Concerne: Bonnacorsiprova Alfredo'), 'Collega a mano: cartella e nome come in cartella');
    const s3 = await (await fetch(url, { headers: { cookie } })).json();
    verifica(s3.paziente?.id === pb && s3.modo === 'a_mano', 'la revisione vede la cartella e «scelto a mano»');
    const d2 = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ azione: 'scollega' }) });
    const e3 = await abbinaPazienteBozza(S, b2);
    const [r3] = await query<{ pid: string | null }>(`select patient_id as pid from referti_bozze where id = $1`, [b2]);
    verifica(d2.status === 200 && r3.pid == null && e3 === 'niente', 'Scollega: resta scollegata, non si ricollega da sola');

    const b3 = await nuova('Zeffirettiprova Marco');
    const e4 = await abbinaPazienteBozza(S, b3);
    verifica(e4 === 'niente', `nome diverso (Marco, non Marcello): niente, nemmeno con la visita in agenda (${e4})`);
    // L'agenda al contrario (5.10.2026): la catena non ha riconosciuto il nome,
    // ma un solo paziente dell'agenda di quei giorni compare nel dettato.
    const [{ id: ap2 }] = await query<{ id: string }>(`insert into appointments (studio_id, starts_at, external_uid, titolo, paziente_nome) values ($1, now() - interval '2 days', 'prova-paz-' || gen_random_uuid(), 'VERDIPROVA Giulia (12.03.1961 / N° 999001) · M.M.', 'VERDIPROVA Giulia') returning id`, [S]);
    app.push(ap2);
    const senzaNome = async (testo: string) => {
      const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-paz-' || gen_random_uuid(), $2, 'referto') returning id`,
        [S, JSON.stringify({ testo_corretto: testo, testo_grezzo: testo, dettato_il: new Date().toISOString(), campi_estratti: { nome_paziente: 'non indicato', data_nascita: 'non indicato' } })]);
      bozze.push(id);
      return id;
    };
    const b4 = await senzaNome('Lettera al dottor Bianchi. Paziente Verdiprovva Giulia. Caro collega, rivedo la paziente in controllo.');
    const e5 = await abbinaPazienteBozza(S, b4);
    const [r5] = await query<{ pid: string | null; n: string; dn: string; t: string }>(`select patient_id as pid, payload->'campi_estratti'->>'nome_paziente' as n, payload->'campi_estratti'->>'data_nascita' as dn, payload->>'testo_corretto' as t from referti_bozze where id = $1`, [b4]);
    const [nuovo] = await query<{ id: string; cognome: string; nome: string; nascita: string | null }>(`select id, cognome, nome, data_nascita::text as nascita from patients where studio_id = $1 and cognome = 'Verdiprova'`, [S]);
    if (nuovo) pazienti.push(nuovo.id);
    verifica(e5 === 'agenda_nuova' && !!nuovo && nuovo.nome === 'Giulia' && nuovo.nascita === '1961-03-12' && r5.pid === nuovo.id, `bozza senza nome: trovata nell'agenda, cartella creata con nome e data di nascita (${e5})`);
    verifica(r5.n === 'Verdiprova Giulia' && r5.dn === '12.03.1961' && r5.t.includes('Paziente Verdiprova Giulia'), 'campi e testo col nome dell\'agenda');
    const b5 = await senzaNome('Paziente Verdiprova Giulia. Caro collega, secondo controllo.');
    verifica((await abbinaPazienteBozza(S, b5)) === 'agenda', 'seconda bozza della stessa paziente: cartella già esistente, collegata');
    const b6 = await senzaNome('Paziente Verdiprova Giulia, accompagnata dal Signor Zeffirettiprova Marcello. Caro collega, controllo.');
    const e6 = await abbinaPazienteBozza(S, b6);
    const s6 = await (await fetch(`${base}/api/prototipo/referti/${b6}/paziente`, { headers: { cookie } })).json();
    verifica(e6 === 'proposte' && s6.paziente == null && s6.proposte?.length === 2, `due nomi dell'agenda nel dettato: non si sceglie, due proposte (${e6}, ${s6.proposte?.length})`);
    const k = (s6.proposte ?? []).find((x: any) => /Verdiprova/.test(x.nome));
    const c6 = await fetch(`${base}/api/prototipo/referti/${b6}/paziente`, { method: 'POST', headers: h, body: JSON.stringify({ azione: 'collega_agenda', indice: k?.agenda }) });
    const [r6] = await query<{ pid: string | null }>(`select patient_id as pid from referti_bozze where id = $1`, [b6]);
    verifica(c6.status === 200 && r6.pid === nuovo?.id, 'proposta dall\'agenda collegata a mano');
  } finally {
    await togliAudit(bozze);
    await query('delete from referti_eventi where bozza_id = any($1::uuid[])', [bozze]);
    await query('delete from referti_bozze where id = any($1::uuid[])', [bozze]);
    await query('delete from appointments where id = any($1::uuid[])', [app]);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
