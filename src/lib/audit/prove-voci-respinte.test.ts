// Voci del dizionario rimesse com'erano (pura). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esitiVoci, sostituzioniFatte, vociDaRivedere } from './voci-respinte';

const prima = 'il paziente riferisce disnea da sforzo virgola la funzione sensuale è conservata';
const dopo = 'il paziente riferisce dispnea da sforzo, la funzione sistolica è conservata';

test('voci: le sostituzioni si leggono dal confronto, la punteggiatura dettata no', () => {
  const s = sostituzioniFatte(prima, dopo);
  assert.deepEqual(s.map((x) => `${x.da}>${x.a}`).sort(), ['disnea>dispnea', 'sensuale>sistolica']);
});

test('voci: nomi propri e cifre non diventano voci', () => {
  assert.deepEqual(sostituzioniFatte('visto dal dottor Bernasconi oggi', 'visto dal dottor Bernasconti oggi'), []);
  assert.deepEqual(sostituzioniFatte('pressione cento su ottanta', 'pressione 100 su ottanta'), []);
});

test('voci: tenuta, rimessa dalla persona, rimessa dalla catena, sparita', () => {
  const catena = dopo;
  const esiti = esitiVoci([
    { prima, dopo, catena, persona: 'Il paziente riferisce disnea da sforzo. La funzione sistolica è conservata.' },
    { prima, dopo, catena: catena.replace('sistolica', 'sensuale'), persona: 'Riferisce dispnea. La funzione sensuale è conservata.' },
    { prima, dopo, catena, persona: 'Riferisce affanno.' },
  ]);
  const disnea = esiti.find((e) => e.da === 'disnea')!;
  assert.deepEqual([disnea.referti, disnea.tenuta, disnea.rimessa_persona, disnea.sparita], [3, 1, 1, 1]);
  const sensuale = esiti.find((e) => e.da === 'sensuale')!;
  assert.deepEqual([sensuale.tenuta, sensuale.rimessa_catena, sensuale.rimessa_persona], [1, 1, 0]);
  assert.deepEqual(vociDaRivedere(esiti).map((e) => e.da), ['disnea']);
});
