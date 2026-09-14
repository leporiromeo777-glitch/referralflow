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
