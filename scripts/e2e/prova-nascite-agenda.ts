// La data di nascita che manca nella scheda si prende dai titoli degli appuntamenti dell'agenda (15.10.2026): solo se
// tutti dicono la stessa data, mai sopra una data già scritta. Pazienti e appuntamenti INVENTATI, solo sul demo.
import { query, pool } from '../../src/lib/db';
import { riabbinaPazienti } from '../../src/lib/pazienti-abbina';
(async () => {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const [{ id: S }] = await query<{ id: string }>(`select id from studios where slug = 'demo' limit 1`);
  const ids: string[] = [];
  try {
    const mk = async (cognome: string) => { const [{ id }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome) values ($1, $2, 'Anna') returning id`, [S, cognome]); ids.push(id); return id; };
    const a = await mk('Provanascitauno'), b = await mk('Provanascitadue'), c = await mk('Provanascitatre');
    // come arrivano da MediOnline: il nome a parte (senza data) e il titolo intero con la data
    const app = (p: string, t: string) => query(`insert into appointments (studio_id, starts_at, external_uid, patient_id, titolo, paziente_nome) values ($1, now(), 'prova-nascite-' || gen_random_uuid(), $2, $3, split_part($3, ' (', 1))`, [S, p, t]);
    await app(a, 'Provanascitauno Anna (03.04.1950 / N° 1)'); await app(a, 'Provanascitauno Anna (03.04.1950 / N° 1)');
    await app(b, 'Provanascitadue Anna (03.04.1950 / N° 2)'); await app(b, 'Provanascitadue Anna (04.03.1950 / N° 2)');
    await query(`update patients set data_nascita = '1960-01-01' where id = $1`, [c]); await app(c, 'Provanascitatre Anna (03.04.1950 / N° 3)');
    await riabbinaPazienti(S);
    const d = Object.fromEntries((await query<{ cognome: string; n: string | null }>(`select cognome, to_char(data_nascita, 'DD.MM.YYYY') as n from patients where id = any($1::uuid[])`, [ids])).map((x) => [x.cognome, x.n]));
    const ok = d.Provanascitauno === '03.04.1950' && d.Provanascitadue === null && d.Provanascitatre === '01.01.1960';
    console.log(`${ok ? 'ok' : 'NO'} la data di nascita mancante arriva dall'agenda quando è una sola; con due date diverse resta vuota; una data già scritta non cambia (${JSON.stringify(d)})`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await query(`delete from appointments where external_uid like 'prova-nascite-%'`);
    if (ids.length) await query(`delete from patients where id = any($1::uuid[])`, [ids]);
    await pool.end();
  }
})().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
