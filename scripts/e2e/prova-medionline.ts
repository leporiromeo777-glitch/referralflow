// Prova end-to-end del CalDAV di MediOnline (29.9.2026) sul DB DEMO, senza
// rete: con la scrittura spenta (di serie) «Fissa» e «Togli» si fermano
// PRIMA di parlare con MediOnline, e la revisione vede la scrittura spenta.
// Il calendario è finto (indirizzo inesistente). Poi toglie tutto.
import { query, pool } from '../../src/lib/db';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const [{ id: cal }] = await query<{ id: string }>(
    `insert into caldav_calendari (studio_id, href, nome, scrivibile) values ($1, '/caldav/calendars/prova-e2e-' || gen_random_uuid() || '/', 'Agenda di prova e2e', true) returning id`, [S]);
  try {
    const url = `${base}/api/prototipo/medionline`;
    const post = (corpo: object) => fetch(url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const g = await fetch(url, { headers: { cookie } });
    const j = await g.json().catch(() => ({}));
    if (g.status === 200 && j.configurato) {
      const c = (j.calendari ?? []).find((x: any) => x.id === cal);
      verifica(j.scrittura === 'spenta' && c && c.scrivibile === false, 'stato: scrittura spenta, il calendario si mostra in sola lettura');
      const domani = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
      const s = await post({ azione: 'scrivi', calendario_id: cal, data: domani, ora: '10:00', durata: 30, titolo: 'Prova', conferma: true });
      const sj = await s.json().catch(() => ({}));
      verifica(s.status === 403 && /spenta/.test(sj.errore ?? ''), `«Fissa» con la scrittura spenta: 403 prima di MediOnline (${s.status})`);
      const [{ n }] = await query<{ n: number }>('select count(*)::int as n from caldav_scritture where calendario_id = $1', [cal]);
      verifica(n === 0, 'niente registrato come scritto');
    } else {
      verifica(g.status === 200 && j.configurato === false && j.scrittura === 'spenta', `senza credenziali sul server: non configurato, scrittura spenta (${g.status})`);
    }
    verifica((await post({ azione: 'scrivi', calendario_id: cal, data: '2030-01-01', ora: '10:00', durata: 30, titolo: 'Prova' })).status === 400, 'senza conferma: 400');
  } finally {
    await query('delete from caldav_scritture where calendario_id = $1', [cal]);
    await query('delete from caldav_calendari where id = $1', [cal]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
