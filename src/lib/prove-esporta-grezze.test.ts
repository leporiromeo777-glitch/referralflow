// Cartella «Trascrizioni grezze» (26.9.2026): nomi e Word. Dati inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { docxSemplice, nomeSottocartella, variantiData, vociNote, xmlSicuro } from './esporta-grezze';

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

test('data di nascita: tutte le forme in cui la può scrivere la catena', () => {
  const v = variantiData('05.03.1950');
  for (const f of ['05.03.1950', '5.3.1950', '1950-03-05', '5 marzo 1950', '05/03/1950']) assert.ok(v.includes(f), f);
  assert.deepEqual(variantiData(''), []);
  assert.ok(variantiData('5 marzo 1950').includes('05.03.1950'));
});

test('voci note: paziente, medici nominati, rubrica solo se il cognome è nel testo con la maiuscola', () => {
  const testi = ['Il signor Aurelio Delmenico, inviato dal dottor Bianchi, riferisce fiato corto. Valle mitralica regolare.', ''];
  const voci = vociNote(testi, { paziente: 'Aurelio Delmenico', nascita: '1.2.1948', medici: ['Dr. med. Marco Moccetti'], rubrica: ['Dr. med. Luca Bianchi', 'Dr. med. Anna Valle', 'Dr. Piero Neri'] });
  const mappa = new Map(voci.map((v) => [v.originale, v.segnaposto]));
  assert.equal(mappa.get('Aurelio Delmenico'), '[paziente]');
  assert.equal(mappa.get('Delmenico'), '[paziente]');
  assert.equal(mappa.get('Moccetti'), '[medico]');
  assert.equal(mappa.get('Bianchi'), '[medico]', 'inviante in rubrica e nel testo');
  assert.equal(mappa.get('Valle'), '[medico]', 'con la maiuscola nel testo: coperto');
  assert.ok(!mappa.has('Neri'), 'cognome che non compare nel testo: niente voce');
  assert.equal(mappa.get('01.02.1948'), '[data di nascita]');
  assert.ok(!mappa.has('med') && !mappa.has('Dr.'), 'titoli mai voci');
  assert.ok(voci[0].originale.length >= voci[voci.length - 1].originale.length, 'le più lunghe prima');
});
