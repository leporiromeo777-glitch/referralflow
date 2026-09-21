import test from 'node:test';
import assert from 'node:assert/strict';
import { abbina, chiaveNome, dataIso, daTitoloAgenda, indicePazienti, proponiAnagrafica } from './pazienti-abbina-regole';

const P = [
  { id: 'a', cognome: 'Prova', nome: 'Mario', data_nascita: '1960-05-12' },
  { id: 'b', cognome: 'Prova', nome: 'Mario', data_nascita: '1988-01-02' },        // omonimo
  { id: 'c', cognome: "D'Esempio", nome: 'Anna Lucia', data_nascita: null },
  { id: 'd', cognome: 'Müller-Finto', nome: 'José', data_nascita: '1950-12-31' },
];
const idx = indicePazienti(P);

test('abbina: la chiave ignora accenti, maiuscole, apostrofi e trattini', () => {
  assert.equal(chiaveNome("  D'ESEMPIO   Anna-Lucia "), 'd esempio anna lucia');
  assert.equal(chiaveNome('Müller-Finto José'), 'muller finto jose');
});

test('abbina: le date in tutte le forme diventano ISO', () => {
  assert.equal(dataIso('31.12.1950'), '1950-12-31'); assert.equal(dataIso('1950-12-31'), '1950-12-31');
  assert.equal(dataIso('1/2/60'), '1960-02-01'); assert.equal(dataIso('3/4/12'), '2012-04-03'); assert.equal(dataIso('boh'), ''); assert.equal(dataIso(null), '');
});

test('abbina: nome unico nei due ordini', () => {
  assert.deepEqual(abbina('MÜLLER-FINTO José', null, idx), { id: 'd', motivo: 'unico' });
  assert.deepEqual(abbina('josé müller finto', '', idx), { id: 'd', motivo: 'unico' });
  assert.deepEqual(abbina('Nessuno Mai', null, idx), { id: null, motivo: 'nessuno' });
});

test('abbina: un omonimo NON si indovina; la data di nascita lo decide', () => {
  assert.deepEqual(abbina('Prova Mario', null, idx), { id: null, motivo: 'omonimi' });
  assert.deepEqual(abbina('Prova Mario', '12.05.1960', idx), { id: 'a', motivo: 'unico_per_nascita' });
  assert.deepEqual(abbina('Prova Mario', '1988-01-02', idx), { id: 'b', motivo: 'unico_per_nascita' });
  assert.deepEqual(abbina('Prova Mario', '01.01.1999', idx), { id: null, motivo: 'nascita_diversa' });
});

test('abbina: data scritta ma diversa da quella in cartella → niente; cartella senza data → si abbina', () => {
  assert.deepEqual(abbina('Müller-Finto José', '01.01.1951', idx), { id: null, motivo: 'nascita_diversa' });
  assert.deepEqual(abbina("D'Esempio Anna Lucia", '02.02.1970', idx), { id: 'c', motivo: 'unico' });
});

test('abbina: dal titolo dell’agenda si leggono nome e nascita', () => {
  // come lo scrive MediOnline: cognome ripetuto, nascita e numero fra parentesi, sigla in coda
  const t = daTitoloAgenda('Prova Prova Mario (12.05.1960 / N° 202847) · vpaio');
  assert.deepEqual(t, { nome: 'Prova Mario', nascita: '1960-05-12', nPaziente: '202847', persona: true });
  assert.equal(abbina(t.nome, t.nascita, idx).id, 'a');
  assert.equal(daTitoloAgenda('— Formazione (02:00) · M.M.').persona, false);
  assert.equal(daTitoloAgenda('Prova Anna (N° 100853) · SF').persona, true);
});

test('crea cartella: la proposta separa il cognome in maiuscolo dal nome, e mette le maiuscole giuste', () => {
  assert.deepEqual(proponiAnagrafica('DE PROVA Maria Luisa (03.04.1972 / N° 1) · vpaio'), { cognome: 'De Prova', nome: 'Maria Luisa', data_nascita: '1972-04-03' });
  assert.deepEqual(proponiAnagrafica('Prova Prova Mario Luca (06.03.1942 / N° 202847) · vpaio'), { cognome: 'Prova', nome: 'Mario Luca', data_nascita: '1942-03-06' });
  assert.deepEqual(proponiAnagrafica('Prova Mario'), { cognome: 'Prova', nome: 'Mario', data_nascita: '' });
  assert.deepEqual(proponiAnagrafica("D'ESEMPIO Anna"), { cognome: "D'Esempio", nome: 'Anna', data_nascita: '' });
});
