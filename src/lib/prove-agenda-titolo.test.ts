import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiTitolo, nomePulito } from './agenda-titolo';

test('titolo: nome, data di nascita, numero paziente e sigla', () => {
  const t = leggiTitolo('Rossi Rossi Mario Luca (06.03.1942 / N° 202847) · vpaio');
  assert.equal(t.nascita, '06.03.1942');
  assert.equal(t.nPaziente, '202847');
  assert.equal(t.sigla, 'vpaio');
  assert.equal(t.nome, 'Rossi Rossi Mario Luca');
});

test('titolo: sigle con punti e spazi restano intere', () => {
  assert.equal(leggiTitolo('Bianchi Anna (14.01.1963 / N° 202554) · P-E V').sigla, 'P-E V');
  assert.equal(leggiTitolo('— Formazione (02:00) · M.M.').sigla, 'M.M.');
});

test('titolo: blocco senza paziente — durata sì, nascita no', () => {
  const t = leggiTitolo('— Formazione (02:00) · M.M.');
  assert.equal(t.durata, '02:00');
  assert.equal(t.nascita, '');
  assert.equal(t.nome, 'Formazione');
});

test('titolo: solo nome, senza parentesi né sigla', () => {
  const t = leggiTitolo('Verdi Giuseppe');
  assert.deepEqual([t.nome, t.nascita, t.nPaziente, t.sigla], ['Verdi Giuseppe', '', '', '']);
});

test('titolo: solo numero paziente, senza data di nascita', () => {
  const t = leggiTitolo('Neri Carla (N° 100853) · SF');
  assert.equal(t.nPaziente, '100853');
  assert.equal(t.nascita, '');
  assert.equal(t.nome, 'Neri Carla');
});

test('titolo: una coda lunga non è una sigla', () => {
  const t = leggiTitolo('Gialli Marco · da richiamare in settimana');
  assert.equal(t.sigla, '');
  assert.ok(t.nome.includes('da richiamare'));
});

test('nome: il cognome ripetuto si toglie una volta sola, il doppio cognome resta', () => {
  assert.equal(nomePulito('Rossi Rossi Mario Luca'), 'Rossi Mario Luca');
  assert.equal(nomePulito('Blasi Frallicciardi Giovanna'), 'Blasi Frallicciardi Giovanna');
  assert.equal(nomePulito('Verdi Giuseppe'), 'Verdi Giuseppe');
});
