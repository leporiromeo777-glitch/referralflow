// Guardie del controllo della lettera (pure). Uso: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtraSegnalazioni } from './referto-verifica';

const orig = 'I profili pressori risultano aumentati, 135 su 105 mmHg. Abbiamo concordato la reintroduzione del Valsartan 160 mg.';
const lett = 'I profili pressori risultano leggermente aumentati, con valori di partenza di 135 su 105 mmHg, ragione per cui abbiamo concordato la reintroduzione del Valsartan.';

test('non supportate: frase aggiunta nella lettera passa, riformulazione fedele no', () => {
  const v = filtraSegnalazioni([
    { frase: 'con valori di partenza di 135 su 105 mmHg', motivo: 'aggiunta' },
    { frase: 'abbiamo concordato la reintroduzione del Valsartan', motivo: 'riformulazione' },
    { frase: 'frase che nella lettera non esiste', motivo: 'x' },
  ], lett, orig);
  assert.equal(v.length, 1);
  assert.match(v[0].frase, /valori di partenza/);
});

test('omesse: dato sparito passa, citazione non esatta no', () => {
  const v = filtraSegnalazioni([
    { frase: 'reintroduzione del Valsartan 160 mg', motivo: 'dose persa' },
    { frase: 'Valsartan 160 milligrammi', motivo: 'non è citazione esatta' },
  ], orig, lett);
  assert.equal(v.length, 1);
  assert.match(v[0].frase, /160 mg/);
});

test('guardie: mai più di 10, niente doppioni, risposta non lista = vuoto', () => {
  const tante = Array.from({ length: 20 }, (_, i) => ({ frase: 'reintroduzione del Valsartan 160 mg', motivo: String(i) }));
  assert.equal(filtraSegnalazioni(tante, orig, lett).length, 1);
  assert.deepEqual(filtraSegnalazioni('x', orig, lett), []);
});
