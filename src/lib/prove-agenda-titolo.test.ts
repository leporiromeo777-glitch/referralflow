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

test('titolo: una coda lunga non è una sigla, è una nota', () => {
  const t = leggiTitolo('Gialli Marco · da richiamare in settimana');
  assert.equal(t.sigla, '');
  assert.equal(t.nome, 'Gialli Marco');
  assert.equal(t.resto, 'da richiamare in settimana');
});

test('titolo: i caratteri in codice HTML si decodificano («N&#176;» = «N°»)', () => {
  const t = leggiTitolo('Provanota Anna (03.04.1950 / N&#176; 123456) &middot; vpaio');
  assert.deepEqual([t.nome, t.nascita, t.nPaziente, t.resto], ['Provanota Anna', '03.04.1950', '123456', '']);
  assert.equal(leggiTitolo('Provanota &amp; Anna').nome, 'Provanota & Anna');
});

test('titolo: la nota scritta dopo il nome non diventa nome (dallo studio, 19.10)', () => {
  const t = leggiTitolo('Provanota Ljudmila conf. paz il 14.10 (03.04.1950 / N° 123456) · vpaio');
  assert.deepEqual([t.nome, t.resto, t.nascita, t.nPaziente, t.sigla], ['Provanota Ljudmila', 'conf. paz il 14.10', '03.04.1950', '123456', 'vpaio']);
  assert.equal(leggiTitolo('Rossi Rossi Mario Luca richiamare 12.11 (06.03.1942)').nome, 'Rossi Rossi Mario Luca');
  assert.equal(leggiTitolo('PROVANOTA Anna Maria tel. 091 000 00 00').nome, 'PROVANOTA Anna Maria');
  // particelle e nomi composti restano nel nome
  assert.equal(leggiTitolo('Rossi de Luca Anna (06.03.1942)').nome, 'Rossi de Luca Anna');
  assert.equal(leggiTitolo("D'Amico-Bianchi Anna (06.03.1942)").nome, "D'Amico-Bianchi Anna");
  // ciò che non comincia con un nome scritto da nome resta com'è
  assert.equal(leggiTitolo('in vacanza fino al 3.11').nome, 'in vacanza fino al 3.11');
  assert.equal(leggiTitolo('rossi anna 14.10').nome, 'rossi anna 14.10');
  assert.equal(leggiTitolo('Verdi Giuseppe').resto, '');
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
