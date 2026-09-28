// «Estrai pagine» (28.9.2026): le pagine scritte a mano → intervalli per qpdf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalliPagine } from './pagine';

test('intervalli validi, trattini lunghi, virgole e spazi', () => {
  assert.deepEqual(intervalliPagine('12-15, 20', 137), { qpdf: '12-15,20', etichetta: '12–15, 20', quante: 5 });
  assert.deepEqual(intervalliPagine('3–4; 7', 10), { qpdf: '3-4,7', etichetta: '3–4, 7', quante: 3 });
  assert.deepEqual(intervalliPagine(' 5 ', 5), { qpdf: '5', etichetta: '5', quante: 1 });
});

test('errori spiegati: vuoto, oltre la fine, al contrario, testo', () => {
  for (const [t, parola] of [['', 'Scrivi'], ['130-140', '137 pagine'], ['9-3', 'più bassa'], ['pagina 3', 'non è una pagina'], ['0', 'più bassa']] as const) {
    const r = intervalliPagine(t, 137);
    assert.ok('errore' in r && r.errore.includes(parola), `${t} → ${JSON.stringify(r)}`);
  }
});
