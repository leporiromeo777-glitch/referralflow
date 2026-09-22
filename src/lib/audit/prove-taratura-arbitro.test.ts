// Taratura delle decisioni dell'arbitro (pura). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esitiPunti, taratura } from './taratura-arbitro';

const persona = 'Il ritmo è sinusale regolare. Si osserva una lieve insufficienza mitralica. Controllo fra un anno.';

test('taratura: la versione tenuta dalla persona si riconosce col contesto accanto', () => {
  const e = esitiPunti([
    { contesto_prima: 'Il ritmo è', contesto_dopo: 'regolare.', versione_a: 'sensuale', versione_b: 'sinusale', p_b: 0.97, scelta_arbitro: 'b' },
    { contesto_prima: 'Si osserva una', contesto_dopo: 'insufficienza mitralica', versione_a: 'lieve', versione_b: 'severa', p_b: 0.2, scelta_arbitro: 'b', pesanti: ['severa'] },
    { contesto_prima: 'Controllo fra', contesto_dopo: 'anno', versione_a: 'un', versione_b: 'uno', p_b: 0.6 },
    { versione_a: 'x', versione_b: 'y' }, // senza probabilità: fuori
  ], persona);
  assert.equal(e.length, 3);
  assert.deepEqual(e.map((x) => x.persona), ['b', 'a', 'a']);
  assert.equal(esitiPunti(null, persona).length, 0);
});

test('taratura: fasce, confronto con l’arbitro e pesanti dati per sicuri ma sbagliati', () => {
  const t = taratura([[
    { p_b: 0.97, scelta_arbitro: 'b', persona: 'b', pesante: false },
    { p_b: 0.2, scelta_arbitro: 'b', persona: 'a', pesante: true },
    { p_b: 0.02, scelta_arbitro: 'a', persona: 'b', pesante: true },
    { p_b: 0.6, scelta_arbitro: null, persona: null, pesante: false },
  ]]);
  assert.equal(t.punti, 4); assert.equal(t.con_esito, 3);
  assert.equal(t.giuste_probabilita, 2);
  assert.equal(t.giuste_arbitro, 1); assert.equal(t.arbitro_valutate, 3);
  assert.equal(t.pesanti_sicuri_sbagliati, 1);
  const alta = t.fasce.find((f) => f.fascia === '0,9–0,99')!;
  assert.deepEqual([alta.punti, alta.giuste], [2, 1]);
});
