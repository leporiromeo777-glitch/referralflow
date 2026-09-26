// Collega alla rubrica degli invianti i referti già arrivati (una volta sola,
// dopo la migrazione 076; poi lo fanno da soli l'arrivo della bozza, il
// salvataggio dei campi e ogni inviante nuovo). Stampa solo conteggi.
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/invianti-ricollega.ts
import { query, pool } from '../src/lib/db';
import { collegaInviante, rubricaInvianti } from '../src/lib/referti-inviante';

async function main() {
  const studi = await query<{ id: string }>('select id from studios');
  for (const s of studi) {
    const righe = await rubricaInvianti(s.id);
    const bozze = await query<{ id: string }>(`select id from referti_bozze where studio_id = $1 and not inviante_manuale and stato <> 'scartata'`, [s.id]);
    const conta: Record<string, number> = {};
    for (const b of bozze) { const st = (await collegaInviante(s.id, b.id, righe)) ?? 'nessun nome'; conta[st] = (conta[st] ?? 0) + 1; }
    console.log(`studio ${s.id.slice(0, 8)}: ${bozze.length} referti →`, conta);
  }
  await pool.end();
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
