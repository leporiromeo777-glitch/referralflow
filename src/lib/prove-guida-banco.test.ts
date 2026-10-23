// Banco della conoscenza di Cleo (23.10.2026): domande come le fa lo studio → il pezzo giusto della guida vera
// (docs/wiki/Guida) fra i primi tre. Se una pagina della guida cambia e una domanda non trova più la sua risposta, qui si vede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { indicizza, pezziDaPagina, scegliPezzi, type Pezzo } from './guida';

const WIKI = path.join(process.cwd(), 'docs/wiki');
const pezzi: Pezzo[] = [];
for (const [cartella, peso] of [['Guida', 1], ['Piattaforma', 0.6], ['Catena', 0.5], ['Regole', 0.5]] as const)
  for (const f of readdirSync(path.join(WIKI, cartella)).filter((x) => x.endsWith('.md'))) pezzi.push(...pezziDaPagina(`${cartella}/${f}`, readFileSync(path.join(WIKI, cartella, f), 'utf-8'), peso));
const ix = indicizza(pezzi);

const BANCO: [string, RegExp][] = [
  ['come confermo un referto?', /Referti/],
  ['come scarico il word della lettera', /Referti/],
  ['il microfono non viene trovato', /Dittafono|Problemi/],
  ['come collego un tasto dello speechmike ai comandi', /Dittafono/],
  ['come carico un documento nella cartella di un paziente', /Pazienti e documenti/],
  ['come sposto un documento in un\'altra sottocartella', /Pazienti e documenti/],
  ['come importo la lista dei pazienti da MediOnline', /Pazienti e documenti/],
  ['dove vedo le immagini dell\'eco di un paziente', /Immagini/],
  ['la prova da sforzo non arriva nella cartella', /Immagini|Problemi/],
  ['come assegno una lettera della cartella comune', /Cartella comune/],
  ['cosa vuol dire non caricare nella cartella comune', /Cartella comune/],
  ['come divido una cartella scansionata in documenti', /Cartella comune e Dividi|Dividi/],
  ['come vedo l\'agenda di domani', /Agenda/],
  ['come creo un appuntamento', /Agenda/],
  ['come si usa la pressione delle 24 ore', /Pressione/],
  ['dove trovo la saturazione notturna', /Pressione e saturazione|Saturazione/],
  ['come aggiungo una persona del personale e la sua sigla', /Studio e accessi/],
  ['la pagina non si apre dal computer', /Problemi|Studio e accessi/],
  ['cosa sa fare Cleo', /Cleo/],
  ['come stampo un modulo', /Moduli/],
  ['come esporto le prestazioni da fatturare', /Moduli|fatturare/i],
  ['come converto un file dss in mp3', /Moduli|Converti/i],
];

test('guida: ogni domanda del banco trova la sua pagina fra i primi tre pezzi', () => {
  const mancate: string[] = [];
  for (const [d, atteso] of BANCO) {
    const s = scegliPezzi(ix, d, 3).map((x) => `${x.pezzo.fonte} › ${x.pezzo.titolo}`);
    if (!s.some((x) => atteso.test(x))) mancate.push(`${d} → ${s.join(' | ') || 'niente'}`);
  }
  assert.deepEqual(mancate, []);
});
