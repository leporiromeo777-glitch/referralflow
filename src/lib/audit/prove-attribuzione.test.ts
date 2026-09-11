// Attribuzione per tappa (pura). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribuisci, riepilogo } from './attribuzione';

const finale = 'Il paziente riferisce dispnea da sforzo. La funzione sistolica è conservata. Controllo fra 12 mesi.';

test('attribuzione: la B e l’audio restano fuori linea, il delta dice chi avvicina', () => {
  const passi = attribuisci([
    { label: 'audio', version_no: 1, testo: '' },
    { label: 'grezzo_a', version_no: 2, testo: 'il paziente riferisce dispnea da sforzo la funzione sensuale è conservata controllo fra dodici mesi' },
    { label: 'grezzo_b', version_no: 3, testo: 'il paziente riferisce dispnea da sforzo' },
    { label: 'dopo_dizionario', version_no: 4, testo: 'il paziente riferisce dispnea da sforzo la funzione sistolica è conservata controllo fra dodici mesi' },
    { label: 'dopo_correzione', version_no: 5, testo: 'Il paziente riferisce dispnea da sforzo. La funzione sistolica è conservata. Controllo fra 12 mesi.' },
    { label: 'confermato_segretaria', version_no: 6, testo: finale, producer_type: 'SECRETARY' },
  ], finale);
  assert.deepEqual(passi.map((p) => p.label), ['grezzo_a', 'dopo_dizionario', 'dopo_correzione']);
  assert.equal(passi[0].delta, null);
  assert.ok(passi[1].delta! > 0, 'il dizionario avvicina');
  assert.ok(passi[2].delta! >= 0 && passi[2].distanza === 0, 'la correzione arriva al finale');
});

test('riepilogo: conta avvicina/allontana per tappa su più referti', () => {
  const r = riepilogo([
    [{ label: 'grezzo_a', producer: 'AI', distanza: 10, delta: null }, { label: 'dopo_arbitro', producer: 'AI', distanza: 8, delta: 2 }],
    [{ label: 'grezzo_a', producer: 'AI', distanza: 6, delta: null }, { label: 'dopo_arbitro', producer: 'AI', distanza: 7, delta: -1 }],
    [{ label: 'grezzo_a', producer: 'AI', distanza: 4, delta: null }, { label: 'dopo_arbitro', producer: 'AI', distanza: 4, delta: 0 }],
  ]);
  const arb = r.find((x) => x.label === 'dopo_arbitro')!;
  assert.deepEqual({ referti: arb.referti, avvicina: arb.avvicina, allontana: arb.allontana, neutro: arb.neutro }, { referti: 3, avvicina: 1, allontana: 1, neutro: 1 });
  assert.equal(arb.delta_medio, 0.3);
  assert.equal(r.find((x) => x.label === 'grezzo_a')!.distanza_media, 6.7);
});
