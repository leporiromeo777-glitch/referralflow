// Rimettere gli appuntamenti già importati nella colonna del medico giusto.
//
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/agenda-riabbina.ts
//
// Serve una volta sola per studio, dopo aver aggiunto alias a medici che ne
// erano senza: da qui in avanti ci pensa la pagina Studio (ogni modifica degli
// alias riabbina da sé). Non stampa nessun nome di paziente: solo codici e
// conteggi. Rieseguibile: non tocca chi un medico ce l'ha già.
import { query } from '../src/lib/db';
import { riabbinaCodici } from '../src/lib/agenda-sync';

async function main() {
  const studi = await query<{ id: string; nome: string }>(`select id, nome from studios where attivo order by nome`);
  for (const st of studi) {
    const r = await riabbinaCodici(st.id);
    console.log(`${st.nome}: ${r.abbinati} appuntamenti riabbinati${r.codici.length ? ` (${r.codici.join(', ')})` : ''}`);
    const orfani = await query<{ codice: string; n: string }>(
      `select coalesce(nullif(trim(luogo), ''), '(vuoto)') as codice, count(*)::text as n
         from appointments where studio_id = $1 and provider_id is null group by 1 order by count(*) desc`, [st.id]);
    for (const o of orfani) console.log(`  senza medico: ${o.codice} → ${o.n}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
