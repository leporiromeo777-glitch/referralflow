// Riempie «Trascrizioni grezze» con i dettati della cartella condivisa già
// arrivati (quelli nuovi li scrive da sola la piattaforma). Solo conteggi.
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/esporta-grezze.ts [giorni=7]
import { query, pool } from '../src/lib/db';
import { cartellaGrezze, esportaGrezza } from '../src/lib/esporta-grezze';

async function main() {
  const giorni = Number(process.argv[2] ?? '7');
  const bozze = await query<{ id: string }>(
    `select distinct b.id from referti_bozze b join referti_audio a on a.bozza_id = b.id and a.filename like 'dettato.%'
      where b.created_at > now() - make_interval(days => $1) order by b.id`, [giorni]);
  const conta: Record<string, number> = {};
  for (const b of bozze) { const e = await esportaGrezza(b.id); conta[e] = (conta[e] ?? 0) + 1; }
  console.log(`${bozze.length} dettati della cartella negli ultimi ${giorni} giorni →`, conta, '·', cartellaGrezze());
  await pool.end();
}
main().catch((e) => { console.error(e?.code ?? e?.message ?? e); process.exit(1); });
