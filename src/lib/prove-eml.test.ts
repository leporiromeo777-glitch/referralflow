// Mail preparata per l'inviante (26.9.2026): il file .eml. Dati inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { componiEml, eHin, emailValida, intestazione } from './eml';

test('eml: destinatari, copia senza doppioni, oggetto codificato, bozza da inviare', () => {
  const eml = componiEml({
    a: ['uno@hin.ch', 'non valida'], cc: ['UNO@hin.ch', 'due@esempio.ch', ''], oggetto: 'Rapporto del 26.09.2026 – Studio Ùno',
    testo: 'Gentile collega,\nin allegato.', allegati: [], confine: 'CONFINE', data: new Date('2026-09-26T10:00:00Z'),
  });
  assert.ok(!/[^\r]\n/.test(eml), 'solo CRLF');
  assert.match(eml, /\r\nTo: uno@hin\.ch\r\n/);
  assert.match(eml, /\r\nCc: due@esempio\.ch\r\n/, 'il destinatario non torna in copia');
  assert.match(eml, /\r\nX-Unsent: 1\r\n/);
  assert.match(eml, /\r\nSubject: =\?UTF-8\?B\?/);
  const corpo = eml.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--CONFINE')[0].replace(/\r\n/g, '');
  assert.equal(Buffer.from(corpo, 'base64').toString('utf8'), 'Gentile collega,\r\nin allegato.');
  assert.ok(eml.trimEnd().endsWith('--CONFINE--'));
});

test('eml: gli allegati tornano identici, nomi sicuri', () => {
  const dati = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256));
  const eml = componiEml({ a: ['a@hin.ch'], oggetto: 'x', testo: 'y', allegati: [{ nome: 'allegato-1-ecg.pdf', tipo: 'application/pdf', dati }, { nome: 'rapporto "è".docx', tipo: 'x/y', dati: Buffer.from('z') }], confine: 'B' });
  const parti = eml.split('\r\n--B');
  const pdf = parti.find((p) => p.includes('allegato-1-ecg.pdf'))!;
  const b64 = pdf.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.ok(Buffer.from(b64, 'base64').equals(dati));
  assert.ok(pdf.split('\r\n').every((r) => r.length <= 998));
  const doc = parti.find((p) => p.includes('x/y'))!;
  assert.ok(!/filename="[^"]*"[^;]*"/.test(doc.split('filename*=')[0]), 'virgolette neutralizzate');
  assert.match(doc, /filename\*=UTF-8''rapporto%20%22%C3%A8%22\.docx/);
});

test('indirizzi e HIN', () => {
  assert.ok(emailValida('studio.rossi@hin.ch') && emailValida('x@esempio.ch'));
  for (const n of ['', 'x', 'a@b', 'a b@c.ch', '------@']) assert.ok(!emailValida(n), n);
  assert.ok(eHin(' Dr.Rossi@HIN.ch ') && !eHin('rossi@bluewin.ch'));
  assert.equal(intestazione('Solo ASCII'), 'Solo ASCII');
  assert.equal(intestazione('riga\r\nnuova'), 'riga nuova', 'niente intestazioni iniettate');
});
