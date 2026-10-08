import test from 'node:test';
import assert from 'node:assert/strict';
import { avvisoColonne, colonneLette } from './ical';
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


test('agenda: il calendario del robot dichiara quali agende aveva davanti, e si capisce quali mancano', () => {
  const cal = (testa: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...testa, 'END:VCALENDAR'].join('\r\n');
  // Robot di prima, o un feed qualunque: nessuna dichiarazione, si fa come sempre.
  assert.equal(colonneLette(cal([])), null);
  assert.equal(avvisoColonne(null), '');
  const piena = colonneLette(cal(['X-RF-COLONNE:M.M.,P-E%20V,DG', 'X-RF-COLONNE-NOTE:M.M.,P-E%20V,DG']))!;
  assert.deepEqual(piena.lette, ['M.M.', 'P-E V', 'DG']);
  assert.deepEqual(piena.mancanti, []);
  assert.equal(avvisoColonne(piena), '');
  const ridotta = colonneLette(cal(['X-RF-COLONNE:DG', 'X-RF-COLONNE-NOTE:M.M.,P-E%20V,DG', 'X-RF-COLONNE-CHIUSE:VECCHIA']))!;
  assert.deepEqual(ridotta.mancanti, ['M.M.', 'P-E V']);
  assert.deepEqual(ridotta.chiuse, ['VECCHIA']);
  assert.match(avvisoColonne(ridotta), /⚠ MediOnline mostra 1 agenda su 3.*mancano: M\.M\., P-E V/);
  // Dichiarazione presente ma vuota: non si è visto niente, e si sa.
  assert.deepEqual(colonneLette(cal(['X-RF-COLONNE:']))!.lette, []);
});
