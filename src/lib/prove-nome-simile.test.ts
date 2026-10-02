// Abbinamento tollerante del nome dettato (2.10.2026). Nomi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbinaSimile, confrontaNomi, nomeComeInCartella, suono } from './nome-simile';

const P = [
  { id: 'a', cognome: 'Zeffiretti', nome: 'Marcello', data_nascita: '1950-02-01' },
  { id: 'b', cognome: 'Bonnacorsi', nome: 'Alfredo', data_nascita: '1962-07-15' },
  { id: 'c', cognome: 'Rossi', nome: 'Mario', data_nascita: '1970-01-01' },
  { id: 'd', cognome: 'Rossi', nome: 'Maria', data_nascita: '1972-03-03' },
  { id: 'e', cognome: 'Lucchini Fontana', nome: 'Elena', data_nascita: null },
];

test('suono: doppie, h, k/y', () => {
  assert.equal(suono('Zeffiretti'), suono('Zefiretti'));
  assert.equal(suono('Bonnacorsi'), suono('Bonacorsi'));
  assert.equal(suono('Kristian'), suono('Cristian'));
});

test('confronto: errori di trascrizione sì, nomi diversi no', () => {
  assert.ok(confrontaNomi('Zefiretti Marcello', P[0]));
  assert.ok(confrontaNomi('Marcello Zeffireti', P[0]), 'ordine libero');
  assert.ok(confrontaNomi('Bonacorsi Alfredo', P[1]));
  assert.ok(confrontaNomi('Bomacorsi Alfredo', P[1]), 'una lettera diversa in un nome lungo');
  assert.equal(confrontaNomi('Zeffiretti Marco', P[0]), null, 'nome diverso');
  assert.equal(confrontaNomi('Zeffiretti', P[0]), null, 'senza nome');
  assert.equal(confrontaNomi('Rossi Mario', P[3]), null, 'Mario non è Maria (parola corta: niente lettere diverse)');
  assert.ok(confrontaNomi('Lucchini Fontana Elena', P[4]), 'cognome doppio');
  assert.equal(confrontaNomi('Lucchini Elena', P[4]), null, 'cognome doppio a metà: no');
});

test('collega da solo solo con agenda o nascita, se no propone', () => {
  const vuota = new Set<string>();
  const r1 = abbinaSimile('Zefiretti Marcello', null, P, vuota);
  assert.equal(r1.id, null);
  assert.deepEqual('proposte' in r1 ? r1.proposte.map((x) => x.id) : [], ['a'], 'senza segnale: proposta');
  const r2 = abbinaSimile('Zefiretti Marcello', null, P, new Set(['a']));
  assert.equal(r2.id, 'a');
  assert.equal('modo' in r2 && r2.modo, 'simile_agenda');
  const r3 = abbinaSimile('Zefiretti Marcello', '01.02.1950', P, vuota);
  assert.equal('modo' in r3 && r3.modo, 'simile_nascita');
  const r4 = abbinaSimile('Zefiretti Marcello', '05.05.1955', P, new Set(['a']));
  assert.equal(r4.id, null, 'data dettata diversa: mai, nemmeno con l\'agenda');
  assert.deepEqual('proposte' in r4 ? r4.proposte : null, []);
});

test('il nome nel testo come in cartella', () => {
  const c = confrontaNomi('Zefiretti Marcello', P[0])!;
  const r = nomeComeInCartella('Concerne: ZEFIRETTI Marcello. Il Signor Zefiretti sta bene; zefirettiano no.', c.coppie, P[0]);
  assert.equal(r.testo, 'Concerne: ZEFFIRETTI Marcello. Il Signor Zeffiretti sta bene; zefirettiano no.');
  assert.equal(r.cambiate, 2);
});
