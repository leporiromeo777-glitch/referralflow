// Prova end-to-end della seconda traccia unita (29.9.2026) sul DB DEMO,
// dati inventati: la traccia arriva dall'endpoint vero della catena
// (/api/referti/bozza, con un token di prova messo e poi tolto), va in fondo
// alla bozza e il testo INTERO diventa la base della misura delle correzioni
// (prima la base diventava il solo testo della traccia). Poi toglie tutto.
import { createHash, randomBytes } from 'crypto';
import { query, pool } from '../../src/lib/db';
import { togliAudit, ultimoTestoAI } from './pulizia-audit';

const [base, , S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const token = randomBytes(24).toString('hex');
  const [{ vecchio }] = await query<{ vecchio: string | null }>('select referti_token_hash as vecchio from studios where id = $1', [S]);
  await query('update studios set referti_token_hash = $2 where id = $1', [S, createHash('sha256').update(token).digest('hex')]);
  const ids: string[] = [];
  const audio: string[] = [];
  const pazienti: string[] = [];
  try {
    const prima = 'Caro Luca, rivedo il paziente per un controllo. Pressione ben controllata.';
    const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-tracce-' || gen_random_uuid(), $2, 'referto') returning id`, [S, JSON.stringify({ testo_corretto: prima })]);
    ids.push(id);
    const [{ a }] = await query<{ a: string }>(`insert into referti_audio (studio_id, tipo, filename, storage_key, stato, aggiunge_a) values ($1, 'referto', 'prova.wav', 'prova/non-esiste', 'fatto', $2) returning id as a`, [S, id]);
    audio.push(a);
    const traccia = 'Ecocardiogramma nella norma.';
    const r = await fetch(`${base}/api/referti/bozza`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: `prova-tracce-2-${Date.now()}`, testo_corretto: traccia, richiede_revisione: true, audio_id: a }),
    });
    const j = await r.json().catch(() => ({}));
    const [b] = await query<{ t: string }>(`select payload->>'testo_corretto' as t from referti_bozze where id = $1`, [id]);
    verifica(r.status === 201 && j.traccia === true && b.t === `${prima}\n\n${traccia}`, `la seconda traccia va in fondo alla stessa bozza (${r.status})`);
    verifica((await ultimoTestoAI(id)) === b.t, 'la base della misura delle correzioni è il testo intero, non la sola traccia');
    // Paziente scelto al caricamento (5.10.2026): la bozza nasce collegata,
    // anche se la catena non ha riconosciuto il nome.
    const [{ id: pz }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome) values ($1, 'Caricaprova', 'Elena') returning id`, [S]);
    pazienti.push(pz);
    const [{ a: a2 }] = await query<{ a: string }>(`insert into referti_audio (studio_id, tipo, filename, storage_key, stato, patient_id) values ($1, 'referto', 'prova2.wav', 'prova/non-esiste-2', 'elaborazione', $2) returning id as a`, [S, pz]);
    audio.push(a2);
    const r2 = await fetch(`${base}/api/referti/bozza`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: `prova-tracce-3-${Date.now()}`, testo_corretto: 'Caro collega, rivedo la Signora Caricaprofa Elena in controllo.', richiede_revisione: true, audio_id: a2, campi_estratti: { nome_paziente: 'non indicato' } }),
    });
    const j2 = await r2.json().catch(() => ({}));
    if (j2.id) ids.push(j2.id);
    const [b2] = await query<{ pid: string | null; modo: string | null; n: string | null }>(`select patient_id as pid, payload->'paziente_abbinamento'->>'modo' as modo, payload->'campi_estratti'->>'nome_paziente' as n from referti_bozze where id = $1`, [j2.id ?? '00000000-0000-0000-0000-000000000000']);
    verifica(r2.status === 201 && b2?.pid === pz && b2.modo === 'al_caricamento' && b2.n === 'Caricaprova Elena', `paziente scelto al caricamento: bozza collegata alla cartella (${r2.status}, ${b2?.modo})`);
  } finally {
    await query('update studios set referti_token_hash = $2 where id = $1', [S, vecchio]);
    await query('update referti_audio set aggiunge_a = null, bozza_id = null where id = any($1::uuid[])', [audio]);
    await query('delete from referti_audio where id = any($1::uuid[])', [audio]);
    await togliAudit(ids);
    await query('delete from referti_eventi where bozza_id = any($1::uuid[])', [ids]);
    await query('delete from referti_bozze where id = any($1::uuid[])', [ids]);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
