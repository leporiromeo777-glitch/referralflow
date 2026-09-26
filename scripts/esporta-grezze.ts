// «Trascrizioni grezze»: un giro a mano, uguale a quello che fa da sola la
// piattaforma ogni quarto d'ora. Parte solo a catena ferma. Solo conteggi.
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/esporta-grezze.ts
import { pool } from '../src/lib/db';
import { cartellaGrezze, giroGrezze } from '../src/lib/esporta-grezze';

async function main() {
  const r = await giroGrezze();
  console.log(r.esito === 'occupata' ? 'la catena sta lavorando: niente da fare adesso' : `${r.fatti} pseudonimizzate, ${r.restano} rimandate`, '·', cartellaGrezze());
  await pool.end();
}
main().catch((e) => { console.error(e?.code ?? e?.message ?? e); process.exit(1); });
