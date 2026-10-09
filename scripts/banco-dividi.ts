// Banco di «Dividi cartella» (9.10.2026, docs/wiki/Piattaforma/Dividi cartella.md): quanto indovina la
// proposta su una cartella INVENTATA di 21 pagine in cinque sezioni, con le sole regole e con il modello
// locale. Niente di vero: testi scritti apposta, coi casi che alle regole sfuggono (una lettera senza saluto
// né «Luogo, data», due appunti di giorni diversi, un referto che continua con un titolo in maiuscolo).
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/banco-dividi.ts [modello]
// Chiama il modello locale (Ollama sul Mac): nessun costo, niente esce. Non parte se la catena lavora.
import { chiediPagina, MODELLO } from '../src/lib/dividi/analisi';
import { catenaOccupata } from '../src/lib/esporta-grezze';
import { estratti, pagineDaChiedere, type Risposta } from '../src/lib/dividi/sezioni';
import { PAGINE, SEP, misura } from './banco-dividi-dati';

(async () => {
  const modello = process.argv[2] || MODELLO;
  misura('solo regole    ', {});
  if (modello === 'spento') return;
  if (await catenaOccupata()) { console.log('La catena dei referti lavora: il banco col modello si rimanda.'); return; }
  const testi = PAGINE.map((x) => x[0]);
  const risposte: Record<number, Risposta> = {};
  const t0 = Date.now(); let mute = 0;
  const da = pagineDaChiedere(testi, SEP);
  for (const n of da) { const x = await chiediPagina(estratti(testi, SEP, n), modello); if (x) risposte[n] = x; else mute++; }
  const pezzi = misura(`regole + ${modello}`, risposte);
  console.log(`${da.length} pagine chieste, ${mute} senza risposta, ${((Date.now() - t0) / 1000 / da.length).toFixed(1)} s a pagina`);
  console.log(pezzi.map((x) => `  ${x.cartella} · ${x.da}-${x.a} · ${x.titolo}${x.sicurezza === 'media' ? ' (da guardare)' : ''}`).join('\n'));
})();
