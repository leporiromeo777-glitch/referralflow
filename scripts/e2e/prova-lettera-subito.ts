// Prova end-to-end della lettera dettata con Dragon che va in revisione SUBITO (19.10.2026) sul DB DEMO, dati inventati:
// all'«Invia» la lettera del foglio è già una bozza; la coda dice alla catena che è un dettato Dragon (catena leggera);
// il controllo che la catena consegna dopo si aggiunge a quella bozza senza toccare la lettera — anche se nel frattempo è
// stata confermata. Poi toglie tutto (token di prova messo e rimesso com'era).
import { createHash, randomBytes } from 'crypto';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';
import { togliAudit } from './pulizia-audit';

const [base, C, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
function wav(): Buffer {
  const n = 16000 * 2, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}
async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const token = randomBytes(24).toString('hex');
  const [{ vecchio }] = await query<{ vecchio: string | null }>('select referti_token_hash as vecchio from studios where id = $1', [S]);
  await query('update studios set referti_token_hash = $2 where id = $1', [S, createHash('sha256').update(token).digest('hex')]);
  const audio: string[] = [], bozze: string[] = [], pazienti: string[] = [];
  try {
    const [{ id: paz }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Subitoprova', 'Anna', '1950-04-03') returning id`, [S]);
    pazienti.push(paz);
    const medici = ((await (await fetch(`${base}/api/referti/upload`, { headers: { cookie: C } })).json()) as any).medici ?? [];
    const corpo = 'ho rivisto la paziente inventata. Pressione arteriosa 130/80 mmHg. Prosegue bisoprololo 2,5 mg al mattino.';
    const foglio = { destinatario: 'Egregio Signor\nDr. med. Altro Inventato\nVia e-mail', data: '19.10.2026', titolo: 'Visita', paziente: 'Paziente\nSubitoprova Anna – 03.04.1950', saluto: 'Caro collega,', chiusura: 'Con i migliori saluti\n\nDr. med. Inventato', copia: 'Copia: alla paziente\nCopia per conoscenza:\n- Dr. med. Copia Inventata, Lugano' };
    const fd = new FormData(); fd.append('audio', new Blob([wav()], { type: 'audio/wav' }), 'prova-subito.wav'); fd.append('tipo', 'referto'); if (medici[0]) fd.append('medico', medici[0].id);
    fd.append('patient_id', paz); fd.append('dettato_testo', corpo); fd.append('dettato_foglio', JSON.stringify(foglio)); fd.append('dettato_fonte', 'dragon');
    const r = await fetch(`${base}/api/referti/upload`, { method: 'POST', headers: { cookie: C }, body: fd });
    const j = (await r.json().catch(() => ({}))) as any; if (j.id) audio.push(j.id); if (j.bozza) bozze.push(j.bozza);
    const [b] = j.bozza ? await query<any>(`select testo_finale as t, payload->'foglio'->>'subito' as subito, payload->>'controllo_audio' as controllo, campi_confermati->>'data_nascita' as nascita, campi_confermati->>'medico_destinatario' as dest, patient_id from referti_bozze where id = $1`, [j.bozza]) : [];
    const [a] = j.id ? await query<any>(`select bozza_id, stato from referti_audio where id = $1`, [j.id]) : [];
    const lettera = `Caro collega,\n\n${corpo}\n\nCon i migliori saluti\n\nDr. med. Inventato`;
    verifica(r.status === 201 && !!j.bozza && b?.t === lettera && b?.subito === 'true' && b?.controllo === 'in_corso' && b?.nascita === '03.04.1950' && b?.dest === 'Dr. med. Altro Inventato' && b?.patient_id === paz && a?.bozza_id === j.bozza && a?.stato === 'in_coda',
      `all'«Invia» la lettera del foglio è già la bozza da rivedere (destinatario, paziente con la data di nascita), l'audio resta in coda per il controllo (${r.status}, ${b?.controllo}, ${a?.stato})`);
    // la copia per conoscenza scritta sul foglio arriva nella bozza (20.10.2026): prima si perdeva
    const [cc] = j.bozza ? await query<{ cc: string | null }>(`select campi_confermati->>'copia_conoscenza' as cc from referti_bozze where id = $1`, [j.bozza]) : [];
    const att = j.bozza ? ((await (await fetch(`${base}/api/prototipo/referti/${j.bozza}/allegati`, { headers: { cookie: C } })).json().catch(() => ({}))) as any) : {};
    verifica(cc?.cc === 'Dr. med. Copia Inventata, Lugano', `la copia per conoscenza del foglio è nella bozza, senza «alla paziente» (${cc?.cc}; ${JSON.stringify(att?.copia?.voci ?? att?.attorno?.copia?.voci ?? null)})`);
    // aggiunta a mano in revisione (come «Aggiungi un medico» nel riquadro): resta salvata, e la revisione la rilegge
    const sa = await fetch(`${base}/api/prototipo/referti/${j.bozza}/testo`, { method: 'POST', headers: { cookie: C, 'Content-Type': 'application/json' }, body: JSON.stringify({ campi: { copia_conoscenza: 'Dr. med. Copia Inventata, Lugano; Dr. med. Seconda Inventata' } }) });
    const att2 = (await (await fetch(`${base}/api/prototipo/referti/${j.bozza}/allegati`, { headers: { cookie: C } })).json().catch(() => ({}))) as any;
    const nomi = (att2?.copia?.voci ?? []).map((x: any) => x.nome);
    verifica(sa.status === 200 && att2?.copia?.fonte === 'revisione' && nomi.length === 2 && nomi.includes('Dr. med. Seconda Inventata'), `copia per conoscenza aggiunta in revisione: salvata e riletta (${sa.status}, ${JSON.stringify(nomi)})`);
    const coda = ((await (await fetch(`${base}/api/referti/coda`, { headers: { Authorization: `Bearer ${token}` } })).json()) as any).coda ?? [];
    const v = coda.find((x: any) => x.id === j.id);
    verifica(v?.dragon === true, `la coda dice alla catena che è un dettato Dragon: catena leggera (${v?.dragon})`);
    const d1 = (await (await fetch(`${base}/api/prototipo/referti/${j.bozza}`, { headers: { cookie: C } })).json()) as any;
    const dati = (await (await fetch(`${base}/api/prototipo/dati`, { headers: { cookie: C } })).json()) as any;
    const scheda = JSON.stringify(dati).includes(`"id":"${j.id}","name":"prova-subito.wav","state":"processing"`);
    verifica(d1.testo_attuale === lettera && d1.dettato?.foglio === true && d1.dettato?.in_attesa === true && d1.dettato?.punti === 0 && !!d1.audio && !scheda,
      `in revisione subito: la lettera, «controllo in corso», nessun punto inventato, l'audio si riascolta; nella coda una scheda sola (${d1.dettato?.in_attesa})`);
    // il controllo della catena arriva: testo del Mac con «2,5» sentito «5» e una nota per la segreteria
    const mac = corpo.replace('2,5', '5').split(' ').map((w, i) => [w, i * 0.4]);
    const consegna = (stato: string) => fetch(`${base}/api/referti/bozza`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: `prova-subito-${stato}-${Date.now()}`, testo_corretto: mac.map((x) => x[0]).join(' '), parole: mac, note_segreteria: ['allega l\'ECG'], catena_leggera: true, richiede_revisione: true, audio_id: j.id }) });
    const c1 = await consegna('a'); const jc = (await c1.json().catch(() => ({}))) as any;
    const [b2] = await query<any>(`select testo_finale as t, payload->>'controllo_audio' as controllo, payload->'foglio'->>'subito' as subito, jsonb_array_length(payload->'parole') as parole, payload->'note_segreteria'->>0 as nota, (select count(*)::int from referti_bozze where file_id like 'prova-subito-%') as nuove from referti_bozze where id = $1`, [j.bozza]);
    const [a2] = await query<any>(`select stato, bozza_id from referti_audio where id = $1`, [j.id]);
    const d2 = (await (await fetch(`${base}/api/prototipo/referti/${j.bozza}`, { headers: { cookie: C } })).json()) as any;
    verifica(c1.status === 201 && jc.id === j.bozza && b2?.t === lettera && b2?.controllo === 'fatto' && b2?.subito === 'true' && b2?.parole === mac.length && b2?.nota === 'allega l\'ECG' && b2?.nuove === 0 && a2?.stato === 'fatto' && a2?.bozza_id === j.bozza
      && d2.dettato?.in_attesa === false && d2.dettato?.punti === 1 && d2.catena_leggera === true && d2.livello_verifica === 'pieno',
      `il controllo della catena si aggiunge alla stessa bozza: la lettera non cambia, arrivano parole coi tempi e note, nessuna bozza nuova; in revisione il punto «2,5»/«5» (${c1.status}, ${d2.dettato?.punti} punti)`);
    // già confermata prima che arrivi il controllo: resta confermata e la lettera non cambia
    await query(`update referti_bozze set stato = 'confermata' where id = $1`, [j.bozza]);
    const c2 = await consegna('b');
    const [b3] = await query<any>(`select stato, testo_finale as t from referti_bozze where id = $1`, [j.bozza]);
    verifica(c2.status === 201 && b3?.stato === 'confermata' && b3?.t === lettera, `se la lettera è già confermata il controllo si aggiunge e basta (${b3?.stato})`);
  } finally {
    const chiavi = audio.length ? await query<{ storage_key: string }>(`select storage_key from referti_audio where id = any($1::uuid[])`, [audio]) : [];
    if (bozze.length) { await togliAudit(bozze).catch(() => null); await query(`delete from referti_eventi where bozza_id = any($1::uuid[])`, [bozze]).catch(() => null); }
    if (audio.length) await query(`delete from referti_audio where id = any($1::uuid[])`, [audio]);
    if (bozze.length) await query(`delete from referti_bozze where id = any($1::uuid[])`, [bozze]);
    if (pazienti.length) await query(`delete from patients where id = any($1::uuid[])`, [pazienti]);
    for (const c of chiavi) await deleteFile(c.storage_key).catch(() => null);
    await query('update studios set referti_token_hash = $2 where id = $1', [S, vecchio]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
