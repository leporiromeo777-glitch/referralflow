// Lucchetto delle relazioni (misure cliniche del profilo). Uso: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relazioniIntatte, misureCliniche } from './referti-misure-cliniche';

test('scambio di valori tra due misure: bloccato', () => {
  const prima = 'FE 55%. PAPs 30 mmHg. Pressione arteriosa 130/80.';
  const dopo = 'FE 30%. PAPs 55 mmHg. Pressione arteriosa 130/80.';
  assert.ok(Object.keys(misureCliniche(prima)).length >= 2, 'il profilo delle misure deve caricarsi');
  assert.equal(relazioniIntatte(prima, dopo), false);
});

test('misura riconosciuta solo nella lettera (dettato a parole): passa', () => {
  const dettato = 'frequenza 64 battiti, pressione 128 su 76, frazione di eiezione del 60 per cento';
  const lettera = 'FC 64 bpm, PA 128/76 mmHg, FE 60%';
  assert.equal(relazioniIntatte(dettato, lettera), true);
});

test('stessa misura con valore cambiato: bloccato', () => {
  assert.equal(relazioniIntatte('frazione di eiezione del 60 per cento', 'FE 50%'), false);
});
