// Cartella «Trascrizioni grezze» (26.9.2026): nomi e Word. Dati inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { docxSemplice, nomeSottocartella, xmlSicuro } from './esporta-grezze';

test('sottocartella: ora svizzera, cognome del medico senza titoli, niente paziente', () => {
  assert.equal(nomeSottocartella(new Date('2026-09-26T12:05:00Z'), 'Dr. med. Marco Moccetti', '0c651eba-f874-4d17-9508-cd3c36aa7122'), '2026-09-26 14.05 · Moccetti · 0c651e');
  assert.equal(nomeSottocartella(new Date('2026-12-01T08:00:00Z'), '', 'abcdef12-0000'), '2026-12-01 09.00 · senza medico · abcdef');
  assert.equal(nomeSottocartella(new Date('2026-12-01T08:00:00Z'), 'Dr. Rossi/../x', 'abcdef12'), '2026-12-01 09.00 · Rossix · abcdef', 'niente barre nel nome');
});

test('Word: si apre, contiene titolo e testo, caratteri pericolosi protetti', async () => {
  assert.equal(xmlSicuro('a < b & c\u0001'), 'a &lt; b &amp; c');
  const buf = await docxSemplice('Titolo', ['Riga dati'], 'Prima riga <x>\nSeconda & ultima');
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file('word/document.xml')!.async('string');
  assert.ok(zip.file('[Content_Types].xml') && zip.file('_rels/.rels'));
  for (const t of ['Titolo', 'Riga dati', 'Prima riga &lt;x&gt;', 'Seconda &amp; ultima']) assert.ok(doc.includes(t), t);
});
