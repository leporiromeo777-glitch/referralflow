// Frasi fisse proposte dalle lettere confermate (pure). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frasiCandidate } from './frasi';

const fissa = 'Rimanendo a disposizione Tua e del paziente qualora la clinica richiedesse una rivalutazione anticipata.';
const lettere = [
  { id: 'a', testo: `Caro collega, ho visto il signor Verdi. ${fissa} Controllo fra 12 mesi.`, nomi: ['Verdi Mario'] },
  { id: 'b', testo: `Cara dottoressa,\n${fissa} Il signor Verdi sta bene. Propongo di rivalutare il profilo lipidico fra sei mesi.`, nomi: ['Verdi Mario'] },
  { id: 'c', testo: `${fissa} Propongo di rivalutare il profilo lipidico fra sei mesi.`, nomi: ['Bianchi Anna'] },
  { id: 'd', testo: `${fissa} Cordiali e collegiali saluti.`, nomi: [] },
];

test('frasi ripetute in almeno tre lettere, senza nomi né cifre, escluse quelle già fisse', () => {
  const c = frasiCandidate(lettere, []);
  assert.equal(c[0].frase.startsWith('Rimanendo a disposizione'), true);
  assert.equal(c[0].lettere, 4);
  assert.ok(!c.some((x) => /Verdi|12 mesi/.test(x.frase)));
  assert.ok(!c.some((x) => x.frase.startsWith('Propongo di rivalutare')), 'solo due lettere: sotto soglia');
  const c2 = frasiCandidate(lettere, [fissa]);
  assert.equal(c2.length, 0);
  const c3 = frasiCandidate(lettere, [], { minLettere: 2 });
  assert.ok(c3.some((x) => x.frase.startsWith('Propongo di rivalutare')));
});
