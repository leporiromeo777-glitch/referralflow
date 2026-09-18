import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { analizzaModuli, caricaModuli, PAGINA_MODULI, validaCompilazione } from './moduli';

const MD = `# Moduli

Testo senza campi.

## M 099 — Prova
- Chi compila: la segreteria
- Quando: sempre
- Nota: una nota.
- Campi:
  1. Motivo — testo lungo — obbligatorio
  2. Peso (kg) — numero
  3. Fumo — scelta: no | sì | ex
  4. Consenso — sì/no — obbligatorio
  5. Data — data
  6. Libero
`;

test('moduli: parser legge codice, titolo, chi, quando, campi con tipo, opzioni e obbligatorietà; salta le sezioni senza campi', () => {
  const m = analizzaModuli(MD);
  assert.equal(m.length, 1);
  assert.equal(m[0].codice, 'M 099');
  assert.equal(m[0].titolo, 'Prova');
  assert.equal(m[0].chi, 'la segreteria');
  assert.deepEqual(m[0].campi.map((c) => [c.chiave, c.tipo, c.obbligatorio, c.opzioni.length]), [['c1', 'testo_lungo', true, 0], ['c2', 'numero', false, 0], ['c3', 'scelta', false, 3], ['c4', 'si_no', true, 0], ['c5', 'data', false, 0], ['c6', 'testo', false, 0]]);
  assert.deepEqual(m[0].campi[2].opzioni, ['no', 'sì', 'ex']);
});

test('moduli: validazione segnala obbligatori mancanti, numeri e scelte sbagliate, normalizza sì/no e scarta chiavi estranee', () => {
  const [m] = analizzaModuli(MD);
  const e1 = validaCompilazione(m, { c2: 'ottanta', c3: 'forse', c4: 'SI', extra: 'x' });
  assert.equal(e1.completo, false);
  assert.equal(e1.errori.c1, 'Obbligatorio.');
  assert.equal(e1.errori.c2, 'Serve un numero.');
  assert.equal(e1.errori.c3, 'Valore fuori dall’elenco.');
  assert.equal(e1.dati.c4, 'sì');
  assert.equal('extra' in e1.dati, false);
  const e2 = validaCompilazione(m, { c1: 'controllo', c2: '80,5', c3: 'ex', c4: 'no', c5: '2026-09-14' });
  assert.equal(e2.completo, true);
  assert.deepEqual(e2.errori, {});
});

// Un sì/no che non si capisce non diventa «sì». Prima «mai» alla domanda sul
// fumo finiva in cartella come «sì», e il record si scriveva lo stesso.
test('moduli: una risposta sì/no non riconosciuta è un errore, non un «sì»', () => {
  const [m] = analizzaModuli(MD);
  for (const risposta of ['mai', 'nessuno', 'ho smesso', 'forse']) {
    const e = validaCompilazione(m, { c1: 'x', c4: risposta });
    assert.equal(e.errori.c4, 'Serve sì o no.', `«${risposta}» doveva essere un errore`);
    assert.equal('c4' in e.dati, false, `«${risposta}» non deve finire nei dati`);
  }
  // le forme corte invece si capiscono
  assert.equal(validaCompilazione(m, { c1: 'x', c4: 's' }).dati.c4, 'sì');
  assert.equal(validaCompilazione(m, { c1: 'x', c4: 'N' }).dati.c4, 'no');
  // e un numero sbagliato non entra nei dati insieme al suo errore
  assert.equal('c2' in validaCompilazione(m, { c1: 'x', c4: 'no', c2: 'ottanta' }).dati, false);
});

// Le pagine dei moduli le scrive un medico: un elenco numerato a colonna 0 è
// Markdown valido, e prima faceva sparire l'intero modulo senza un avviso.
test('moduli: un elenco numerato non indentato vale come uno indentato', () => {
  const senzaSpazi = MD.split('\n').map((r) => r.replace(/^ {2}(\d+\. )/, '$1')).join('\n');
  const m = analizzaModuli(senzaSpazi);
  assert.equal(m.length, 1);
  assert.equal(m[0].campi.length, analizzaModuli(MD)[0].campi.length);
});

test('moduli: la pagina vera si legge e ogni modulo ha codice, chi compila e almeno 5 campi con almeno un obbligatorio', () => {
  assert.ok(fs.existsSync(PAGINA_MODULI));
  const m = caricaModuli();
  assert.ok(m.length >= 4, `moduli: ${m.length}`);
  for (const x of m) {
    assert.match(x.codice, /^M \d{3}$/, x.titolo);
    assert.ok(x.chi, x.titolo);
    assert.ok(x.campi.length >= 5, x.titolo);
    assert.ok(x.campi.some((c) => c.obbligatorio), x.titolo);
    for (const c of x.campi) if (c.tipo === 'scelta') assert.ok(c.opzioni.length >= 2, `${x.titolo}: ${c.etichetta}`);
  }
  assert.equal(new Set(m.map((x) => x.id)).size, m.length);
});
