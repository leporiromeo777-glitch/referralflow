// Prova della protezione dell'agenda (8.10.2026) sul DB DEMO, con un calendario
// INVENTATO: quando MediOnline mostra meno agende, la sincronizzazione non
// cancella gli appuntamenti delle agende che il robot non aveva davanti.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-agenda-colonne.ts <studio>
import { promises as fs } from 'fs';
import path from 'path';
import { query, pool } from '../../src/lib/db';
import { syncFeed } from '../../src/lib/agenda-sync';

const [S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const NOME = `prova-colonne-${Date.now()}.ics`;
const FILE = path.join(process.cwd(), 'agenda-locale', NOME);
const due = (n: number) => String(n).padStart(2, '0');
const fra = (giorni: number, ora: number) => { const d = new Date(Date.now() + giorni * 86_400_000); return `${d.getFullYear()}${due(d.getMonth() + 1)}${due(d.getDate())}T${due(ora)}0000`; };
const evento = (uid: string, colonna: string, giorni: number, ora: number) =>
  ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART:${fra(giorni, ora)}`, `DTEND:${fra(giorni, ora + 1)}`, `SUMMARY:Prova Colonne ${uid}`, `LOCATION:${colonna}`, 'END:VEVENT'];
const calendario = (testa: string[], eventi: string[][]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//prova//IT', ...testa, ...eventi.flat(), 'END:VCALENDAR'].join('\r\n') + '\r\n';
const conta = async (feed: string) => {
  const r = await query<{ luogo: string; n: number }>(`select luogo, count(*)::int as n from appointments where feed_id = $1 group by 1`, [feed]);
  return Object.fromEntries(r.map((x) => [x.luogo, x.n])) as Record<string, number>;
};

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  let feed = '';
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    [{ id: feed }] = await query<{ id: string }>(`insert into agenda_feeds (studio_id, nome, url, match_field, attivo) values ($1, 'Prova colonne', $2, 'location', true) returning id`, [S, `locale:${NOME}`]);
    const A = [evento('a1', 'AA', 2, 9), evento('a2', 'AA', 3, 9)], B = [evento('b1', 'B B', 2, 10), evento('b2', 'B B', 3, 10)];

    // 1 — vista completa: due agende, quattro appuntamenti.
    await fs.writeFile(FILE, calendario(['X-RF-COLONNE:AA,B%20B', 'X-RF-COLONNE-NOTE:AA,B%20B'], [...A, ...B]));
    const r1 = await syncFeed(feed);
    verifica(r1.ok && JSON.stringify(await conta(feed)) === JSON.stringify({ AA: 2, 'B B': 2 }) || (await conta(feed)).AA === 2 && (await conta(feed))['B B'] === 2, 'vista completa: due agende, due appuntamenti ciascuna');

    // 2 — qualcuno lascia in vista solo l'agenda AA, e intanto un suo appuntamento viene tolto.
    await fs.writeFile(FILE, calendario(['X-RF-COLONNE:AA', 'X-RF-COLONNE-NOTE:AA,B%20B'], [A[0]]));
    await syncFeed(feed);
    const c2 = await conta(feed);
    const [{ last_status: st2 }] = await query<{ last_status: string }>(`select last_status from agenda_feeds where id = $1`, [feed]);
    verifica(c2.AA === 1 && c2['B B'] === 2, `vista ridotta: l'agenda mostrata si aggiorna (AA ${c2.AA}), quella nascosta NON viene svuotata (B B ${c2['B B']})`);
    verifica(/⚠ MediOnline mostra 1 agenda su 2/.test(st2) && /mancano: B B/.test(st2), 'lo stato dell’agenda dice che la vista è ridotta, e quali agende mancano');

    // 3 — la vista torna completa: l'avviso sparisce e l'agenda nascosta si riallinea.
    await fs.writeFile(FILE, calendario(['X-RF-COLONNE:AA,B%20B', 'X-RF-COLONNE-NOTE:AA,B%20B'], [A[0], B[0]]));
    await syncFeed(feed);
    const c3 = await conta(feed);
    const [{ last_status: st3 }] = await query<{ last_status: string }>(`select last_status from agenda_feeds where id = $1`, [feed]);
    verifica(c3.AA === 1 && c3['B B'] === 1 && !/⚠/.test(st3), `vista di nuovo completa: tutto riallineato (B B ${c3['B B']}) e nessun avviso`);

    // 4 — un'agenda mostrata e VUOTA si svuota davvero (visto e vuoto non è «non visto»).
    await fs.writeFile(FILE, calendario(['X-RF-COLONNE:AA,B%20B', 'X-RF-COLONNE-NOTE:AA,B%20B'], [A[0]]));
    await syncFeed(feed);
    verifica((await conta(feed))['B B'] === undefined, 'un’agenda mostrata e senza appuntamenti si svuota');

    // 5 — un'agenda non più vista da 14 giorni è data per chiusa: i suoi appuntamenti futuri si tolgono.
    await fs.writeFile(FILE, calendario(['X-RF-COLONNE:AA,B%20B', 'X-RF-COLONNE-NOTE:AA,B%20B'], [A[0], ...B]));
    await syncFeed(feed);
    await fs.writeFile(FILE, calendario(['X-RF-COLONNE:AA', 'X-RF-COLONNE-NOTE:AA', 'X-RF-COLONNE-CHIUSE:B%20B'], [A[0]]));
    await syncFeed(feed);
    verifica((await conta(feed))['B B'] === undefined && (await conta(feed)).AA === 1, 'agenda chiusa davvero: i suoi appuntamenti futuri si tolgono');

    // 6 — un calendario che non dichiara le colonne (robot di prima, altri feed) si comporta come sempre.
    await fs.writeFile(FILE, calendario([], [...A, ...B]));
    await syncFeed(feed);
    await fs.writeFile(FILE, calendario([], [A[0]]));
    await syncFeed(feed);
    const c6 = await conta(feed);
    verifica(c6.AA === 1 && c6['B B'] === undefined, 'senza la dichiarazione delle colonne vale la regola di prima');
  } finally {
    if (feed) { await query('delete from appointments where feed_id = $1', [feed]); await query('delete from agenda_feeds where id = $1', [feed]); }
    await fs.rm(FILE, { force: true });
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
