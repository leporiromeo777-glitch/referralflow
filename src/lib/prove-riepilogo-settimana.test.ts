// Prove del riepilogo settimanale (29.9.2026): solo numeri, confronti giusti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testoRiepilogo, type DatiSettimana } from './riepilogo-settimana';

const base: DatiSettimana = {
  da: '22.9', a: '28.9', arrivate: 12, confermate: 3, word: 9,
  misurati: 9, mediana100: 3.14, medianaPrima: 4.2, senzaCorrezioni: 2,
  perMedico: [{ medico: 'moccetti', n: 6, mediana100: 2.5 }, { medico: 'moschovitis', n: 3, mediana100: 4 }],
  wordSenzaCorrezioniQui: 0, aperteDaSettimana: 0,
};

test('riepilogo: conteggi, mediana con la virgola, confronto con la settimana prima, per medico', () => {
  const t = testoRiepilogo(base);
  assert.match(t, /^Settimana 22\.9–28\.9/);
  assert.match(t, /Bozze arrivate 12 · Word scaricati 9 · confermate 3/);
  assert.match(t, /mediana\): 3,1 \(settimana prima 4,2, meglio\)/);
  assert.match(t, /Referti misurati 9, senza correzioni 2/);
  assert.match(t, /moccetti 2,5 \(6\) · moschovitis 4 \(3\)/);
  assert.doesNotMatch(t, /Word scaricati senza correzioni/);
});

test('riepilogo: peggio, uguale, un medico solo, nessuna misura', () => {
  assert.match(testoRiepilogo({ ...base, mediana100: 5 }), /settimana prima 4,2, peggio/);
  assert.match(testoRiepilogo({ ...base, mediana100: 4.2 }), /come la settimana prima/);
  assert.doesNotMatch(testoRiepilogo({ ...base, perMedico: [{ medico: 'moccetti', n: 9, mediana100: 3 }] }), /moccetti/);
  const vuoto = testoRiepilogo({ ...base, misurati: 0, mediana100: null, medianaPrima: null, perMedico: [] });
  assert.match(vuoto, /Nessun referto misurato/);
  assert.doesNotMatch(vuoto, /mediana/);
});

test('riepilogo: Word senza correzioni qui e bozze ferme si segnalano', () => {
  const t = testoRiepilogo({ ...base, wordSenzaCorrezioniQui: 7, aperteDaSettimana: 4 });
  assert.match(t, /7 Word scaricati senza correzioni nella piattaforma/);
  assert.match(t, /Bozze aperte da più di 7 giorni: 4/);
});
