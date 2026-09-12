import test from 'node:test';
import assert from 'node:assert/strict';
import { bloccoAllegato, citatoNelTesto, righeAllegato } from './referti-allegato-blocco';

test('blocco Allegato dalle note: solo note che chiedono di allegare, nota del documento prima del nome file, niente doppioni', () => {
  const note = [
    { nota: 'allega il duplex', riguardaDocumenti: true, candidati: [{ filename: 'duplex_2026-07-29.pdf', nota: 'duplex del 29.07.2026' }, { filename: 'altro.pdf' }] },
    { nota: 'allegare anche l\'eco', riguardaDocumenti: true, candidati: [{ filename: 'eco-da-sforzo.pdf', nota: null }] },
    { nota: 'allega di nuovo il duplex', riguardaDocumenti: true, candidati: [{ filename: 'x.pdf', nota: 'Duplex del 29.07.2026' }] },
    { nota: 'lettera per il dottor Bianchi', riguardaDocumenti: true, candidati: [{ filename: 'lettera.docx', nota: 'lettera del 21.07.2026', categoria: 'lettera' }] },
    { riguardaDocumenti: false, candidati: [{ filename: 'ignorato.pdf' }] },
    { nota: 'allega', riguardaDocumenti: true, candidati: [] },
  ];
  assert.deepEqual(righeAllegato(note), ['duplex del 29.07.2026', 'eco da sforzo']);
  assert.equal(bloccoAllegato(note), 'Allegato:\n-duplex del 29.07.2026\n-eco da sforzo');
  assert.equal(bloccoAllegato([]), '');
});

test('documenti citati nel testo: parole specifiche presenti, date facoltative, mai le lettere', () => {
  const testo = 'Il duplex carotideo del 29.07.2026 non mostra stenosi. L\'ecocardiogramma da sforzo (massimale) risulta negativo.';
  assert.equal(citatoNelTesto('duplex del 29.07.2026', testo), true);
  assert.equal(citatoNelTesto('ecocardiogramma da sforzo del 11.08.2026', testo), true);
  assert.equal(citatoNelTesto('holter del 01.01.2026', testo), false);
  assert.equal(citatoNelTesto('esame del 29.07.2026', testo), false);
  const cartella = [
    { filename: 'duplex.txt', nota: 'duplex del 29.07.2026', categoria: 'imaging' },
    { filename: 'eco.txt', nota: 'ecocardiogramma da sforzo del 11.08.2026', categoria: 'referto' },
    { filename: 'lettera.docx', nota: 'lettera del 21.07.2026', categoria: 'lettera' },
    { filename: 'holter-2025.pdf', nota: null, categoria: 'ecg' },
  ];
  assert.equal(bloccoAllegato([], testo, cartella), 'Allegato:\n-duplex del 29.07.2026\n-ecocardiogramma da sforzo del 11.08.2026');
});
