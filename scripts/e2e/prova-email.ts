// Prova end-to-end di «Prepara e-mail» (26.9.2026) sul DB DEMO, con dati
// inventati: inviante e medico in copia con e-mail, paziente, un ECG finto
// nello storage, un referto confermato che li nomina. Controlla anteprima e
// file .eml, poi toglie tutto. Uso (da prova-e2e.sh):
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-email.ts <base> <cookie> <studio>
import JSZip from 'jszip';
import { query, pool } from '../../src/lib/db';
import { deleteFile, putFile } from '../../src/lib/storage';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const ids: Record<string, string> = {};
  try {
    [{ id: ids.inv }] = await query(`insert into referring_doctors (studio_id, nome, email, specialita) values ($1,'Prova Destinatario Finto','prova.destinatario@hin.ch','medicina interna generale') returning id`, [S]);
    [{ id: ids.cc }] = await query(`insert into referring_doctors (studio_id, nome, email) values ($1,'Carla Copiafinta','carla.copia@esempio.invalid') returning id`, [S]);
    [{ id: ids.paz }] = await query(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1,'Emailprova','Paziente','1950-01-01') returning id`, [S]);
    const pdf = Buffer.from('%PDF-1.4\n% ECG finto per la prova\n%%EOF\n');
    const key = await putFile(pdf, 'application/pdf', '.pdf');
    ids.key = key;
    [{ id: ids.doc }] = await query(`insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_at) values ($1,$2,'Tracciato Emailprova.pdf',$3,'ecg','ECG a riposo', now()) returning id`, [S, ids.paz, key]);
    const testo = 'Caro collega Dr. Prova Destinatario Finto, ti ringrazio per avermi inviato il paziente. All\'ECG ritmo sinusale. Copia al dottor Carla Copiafinta.';
    [{ id: ids.boz }] = await query(`insert into referti_bozze (studio_id, file_id, payload, tipo, patient_id, stato, testo_finale) values ($1, 'prova-email-' || gen_random_uuid(), $2, 'referto', $3, 'confermata', $4) returning id`,
      [S, JSON.stringify({ testo_corretto: testo, campi_estratti: { nome_paziente: 'Emailprova Paziente', medico_inviante: 'Dr. Prova Destinatario Finto' }, dettato_il: new Date().toISOString() }), ids.paz, testo]);

    const h = { cookie };
    const r1 = await fetch(`${base}/api/prototipo/referti/${ids.boz}/email?anteprima=1`, { headers: h });
    const p = await r1.json();
    verifica(r1.status === 200, `anteprima 200 (${r1.status}${p.errore ? ' ' + p.errore : ''})`);
    verifica(p.a?.[0]?.email === 'prova.destinatario@hin.ch' && p.a?.[0]?.hin === true, 'destinatario = inviante collegato, HIN');
    verifica(p.cc?.length === 1 && p.cc[0].email === 'carla.copia@esempio.invalid', 'copia per conoscenza con la sua e-mail');
    verifica(p.allegati?.length === 2 && p.allegati[1].file === 'allegato-1-ecg.pdf', 'allegati: Word + ECG con nome neutro');
    verifica(Array.isArray(p.avvisi) && p.avvisi.some((x: string) => /non è un indirizzo HIN/.test(x)), 'avviso per la copia non HIN');
    verifica(!/Emailprova/.test(p.oggetto), 'oggetto senza il paziente');

    const r2 = await fetch(`${base}/api/prototipo/referti/${ids.boz}/email`, { headers: h });
    const eml = await r2.text();
    verifica(r2.status === 200 && /message\/rfc822/.test(r2.headers.get('content-type') ?? ''), 'file .eml');
    verifica(/\r\nTo: prova\.destinatario@hin\.ch\r\n/.test(eml) && /\r\nCc: carla\.copia@esempio\.invalid\r\n/.test(eml) && /\r\nX-Unsent: 1\r\n/.test(eml), 'intestazioni A, Copia, bozza da inviare');
    const confine = /boundary="([^"]+)"/.exec(eml)?.[1] ?? '';
    const parti = eml.split(`\r\n--${confine}`);
    const word = parti.find((x) => /filename="rapporto-/.test(x)) ?? '';
    const zip = await JSZip.loadAsync(Buffer.from(word.split('\r\n\r\n')[1]?.replace(/\r\n/g, '') ?? '', 'base64')).catch(() => null);
    verifica(!!zip?.file('word/document.xml'), 'il Word allegato si apre');
    const ecg = parti.find((x) => /allegato-1-ecg\.pdf/.test(x)) ?? '';
    verifica(Buffer.from(ecg.split('\r\n\r\n')[1]?.replace(/\r\n/g, '') ?? '', 'base64').equals(pdf), 'l\'ECG allegato è identico');
    verifica(!/Emailprova/.test(eml.split('\r\n\r\n')[0]), 'nessun nome del paziente nelle intestazioni');

    // Scelta a mano dell'inviante (28.9.2026: falliva sempre per il tipo di $3).
    const pi = await fetch(`${base}/api/prototipo/referti/${ids.boz}/allegati`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'inviante', referring_doctor_id: ids.cc }) });
    const [sc] = await query<{ rid: string; manuale: boolean }>('select referring_doctor_id as rid, inviante_manuale as manuale from referti_bozze where id = $1', [ids.boz]);
    verifica(pi.status === 200 && sc.rid === ids.cc && sc.manuale === true, `inviante scelto a mano: salvato (${pi.status})`);
    const pa = await fetch(`${base}/api/prototipo/referti/${ids.boz}/allegati`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'inviante', referring_doctor_id: null }) });
    const [sa] = await query<{ rid: string; manuale: boolean }>('select referring_doctor_id as rid, inviante_manuale as manuale from referti_bozze where id = $1', [ids.boz]);
    verifica(pa.status === 200 && sa.rid === ids.inv && sa.manuale === false, 'inviante di nuovo automatico: torna quello del dettato');

    // «Allegati» della revisione (27.9.2026): togli, rimetti, carica.
    const post = (corpo: unknown) => fetch(`${base}/api/prototipo/referti/${ids.boz}/allegati`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const anteprima = async () => (await (await fetch(`${base}/api/prototipo/referti/${ids.boz}/email?anteprima=1`, { headers: h })).json()).allegati ?? [];
    await post({ azione: 'allegato_togli', etichetta: 'ECG a riposo' });
    verifica((await anteprima()).length === 1, 'allegati: l\'ECG tolto non parte');
    const at = await (await fetch(`${base}/api/prototipo/referti/${ids.boz}/allegati`, { headers: h })).json();
    await post({ azione: 'allegato_rimetti', id: at.tolti?.[0]?.id });
    verifica((await anteprima()).length === 2, 'allegati: rimesso');
    const fd = new FormData();
    fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'holter.pdf'); fd.append('categoria', 'referto'); fd.append('nota', 'Referto Holter');
    const rc = await fetch(`${base}/api/prototipo/referti/${ids.boz}/allegati`, { method: 'POST', headers: h, body: fd });
    const jc = await rc.json();
    verifica(rc.status === 201 && jc.in_cartella === true, 'allegati: file caricato, entra anche nella cartella');
    const dopo = await anteprima();
    verifica(dopo.length === 3 && dopo[2].etichetta === 'Referto Holter', 'allegati: il caricato parte con la mail');
    const rw = await fetch(`${base}/api/referti/docx/${ids.boz}`, { headers: h });
    const zw = await JSZip.loadAsync(Buffer.from(await rw.arrayBuffer())).catch(() => null);
    verifica(!!(await zw?.file('word/document.xml')?.async('string'))?.includes('Referto Holter'), 'allegati: il Word lo elenca');
    const at2 = await (await fetch(`${base}/api/prototipo/referti/${ids.boz}/allegati`, { headers: h })).json();
    await post({ azione: 'allegato_togli', id: at2.allegati.find((x: { etichetta: string }) => x.etichetta === 'Referto Holter')?.id });
    verifica((await anteprima()).length === 2, 'allegati: il caricato si toglie');

    await query(`update referti_bozze set stato = 'bozza' where id = $1`, [ids.boz]);
    const r3 = await fetch(`${base}/api/prototipo/referti/${ids.boz}/email?anteprima=1`, { headers: h });
    verifica(r3.status === 409, 'una bozza non confermata non esce (409)');
  } finally {
    await query('delete from referti_eventi where bozza_id = $1', [ids.boz ?? null]);
    await query('delete from referti_bozze where id = $1', [ids.boz ?? null]);
    const altri = await query<{ storage_key: string }>('delete from patient_documents where patient_id = $1 and id <> $2 returning storage_key', [ids.paz ?? null, ids.doc ?? null]);
    for (const x of altri) await deleteFile(x.storage_key).catch(() => null);
    await query('delete from patient_documents where id = $1', [ids.doc ?? null]);
    await query('delete from patients where id = $1', [ids.paz ?? null]);
    if (ids.key) await deleteFile(ids.key).catch(() => null);
    await query('delete from referring_doctors where id = any($1::uuid[])', [[ids.inv, ids.cc].filter(Boolean)]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
