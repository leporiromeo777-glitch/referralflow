// Una volta (19.10.2026): il nome del paziente salvato con gli appuntamenti già importati, ricalcolato come lo fa ora la
// sincronizzazione — senza la nota scritta dopo il nome né la sigla. Tocca solo la copia locale (MediOnline resta in
// sola lettura), solo dove il nome nuovo è l'inizio di quello vecchio (coi caratteri in codice decodificati). Stampa solo numeri.
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/pulisci-nomi-agenda.ts [--scrivi]
import { query, pool } from '../src/lib/db';
import { extractPatientName } from '../src/lib/agenda-sync';
import { decodificaEntita } from '../src/lib/agenda-titolo';
import { riabbinaPazienti } from '../src/lib/pazienti-abbina';

async function main() {
  const scrivi = process.argv.includes('--scrivi');
  const righe = await query<{ id: string; studio_id: string; titolo: string; paziente_nome: string }>(
    `select id, studio_id, titolo, paziente_nome from appointments where titolo is not null and paziente_nome is not null`);
  let diversi = 0, cambiati = 0; const studi = new Set<string>();
  for (const r of righe) {
    const nuovo = extractPatientName(r.titolo);
    if (!nuovo || nuovo === r.paziente_nome) continue;
    diversi++;
    if (!decodificaEntita(r.paziente_nome).startsWith(nuovo)) continue;
    if (scrivi) { await query(`update appointments set paziente_nome = $2 where id = $1`, [r.id, nuovo]); studi.add(r.studio_id); }
    cambiati++;
  }
  const abb = { appuntamenti: 0 };
  if (scrivi) for (const s of studi) abb.appuntamenti += (await riabbinaPazienti(s)).appuntamenti;
  console.log(JSON.stringify({ appuntamenti: righe.length, nome_diverso: diversi, accorciati: cambiati, scritto: scrivi, riabbinati: abb.appuntamenti }));
  await pool.end();
}
void main();
