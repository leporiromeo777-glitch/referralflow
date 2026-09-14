import test from 'node:test';
import assert from 'node:assert/strict';
import { analizzaCsvPazienti, normalizzaAvs, normalizzaData, validaAnagrafica } from './pazienti-import';

test('anagrafica: date e AVS normalizzati, errori sui campi sbagliati, cognome e nome obbligatori', () => {
  assert.equal(normalizzaData('31.12.1950'), '1950-12-31');
  assert.equal(normalizzaData('1/2/1960'), '1960-02-01');
  assert.equal(normalizzaData('1950-12-31T00:00:00'), '1950-12-31');
  assert.equal(normalizzaData('ieri'), null);
  assert.equal(normalizzaAvs('7561234567897'), '756.1234.5678.97');
  const v = validaAnagrafica({ cognome: ' Rossi ', nome: '', data_nascita: 'x', sesso: 'x', email: 'no', npa: '69', avs: '123' });
  assert.deepEqual(Object.keys(v.errori).sort(), ['avs', 'data_nascita', 'email', 'nome', 'npa', 'sesso']);
  assert.equal(v.dati.cognome, 'Rossi');
  const ok = validaAnagrafica({ cognome: 'Rossi', nome: 'Mario', data_nascita: '31.12.1950', sesso: 'm', email: 'M@X.ch', npa: '6900', avs: '756.1234.5678.97' });
  assert.deepEqual(ok.errori, {});
  assert.equal(ok.dati.sesso, 'M');
  assert.equal(ok.dati.email, 'm@x.ch');
});

test('csv pazienti: intestazioni riconosciute in italiano e tedesco, separatore ; con virgolette, colonne ignorate elencate', () => {
  const csv = '﻿Cognome;Vorname;Data di nascita;Telefono;AVS;Cassa malati;Note interne\n"Rossi; Bianchi";Mario;31.12.1950;+41 91 000 00 00;7561234567897;Helsana;bla\nVerdi;;;;;;\n';
  const r = analizzaCsvPazienti(csv);
  assert.deepEqual(r.colonne, ['cognome', 'nome', 'data_nascita', 'telefono', 'avs', 'assicurazione', null]);
  assert.deepEqual(r.ignorate, ['Note interne']);
  assert.equal(r.righe.length, 2);
  assert.equal(r.righe[0].dati.cognome, 'Rossi; Bianchi');
  assert.equal(r.righe[0].dati.avs, '756.1234.5678.97');
  assert.equal(r.righe[0].dati.data_nascita, '1950-12-31');
  assert.deepEqual(r.righe[0].errori, {});
  assert.equal(r.righe[1].errori.nome, 'Obbligatorio.');
  assert.equal(r.righe[1].n, 3);
});

test('csv pazienti: separatore virgola e tabulazione riconosciuti', () => {
  assert.equal(analizzaCsvPazienti('nome,cognome\nA,B').righe[0].dati.cognome, 'B');
  assert.equal(analizzaCsvPazienti('nome\tcognome\nA\tB').righe[0].dati.cognome, 'B');
});
