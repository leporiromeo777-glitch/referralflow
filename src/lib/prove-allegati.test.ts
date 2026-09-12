import test from 'node:test';
import assert from 'node:assert/strict';
import { bloccoAllegato, righeAllegato } from './referti-allegato-blocco';

test('blocco Allegato: una riga per documento agganciato, nota prima del nome file, niente doppioni', () => {
  const note = [
    { riguardaDocumenti: true, candidati: [{ filename: 'duplex_2026-07-29.pdf', nota: 'duplex del 29.07.2026' }, { filename: 'altro.pdf' }] },
    { riguardaDocumenti: true, candidati: [{ filename: 'eco-da-sforzo.pdf', nota: null }] },
    { riguardaDocumenti: true, candidati: [{ filename: 'x.pdf', nota: 'Duplex del 29.07.2026' }] },
    { riguardaDocumenti: false, candidati: [{ filename: 'ignorato.pdf' }] },
    { riguardaDocumenti: true, candidati: [] },
  ];
  assert.deepEqual(righeAllegato(note), ['duplex del 29.07.2026', 'eco da sforzo']);
  assert.equal(bloccoAllegato(note), 'Allegato:\n-duplex del 29.07.2026\n-eco da sforzo');
  assert.equal(bloccoAllegato([]), '');
});
