import test from 'node:test';
import assert from 'node:assert/strict';
import { COLONNE, csvPrestazioni, nomeFileCsv, periodoMese, riepilogoPrestazioni, type RigaFattura } from './fatturazione';

const riga = (x: Partial<RigaFattura> = {}): RigaFattura => ({
  id: 'a1', data: '03.09.2026', ora: '09:30', durata: 30, cognome: 'Rossi', nome: 'Mario', nascita: '01.02.1950', assicurazione: 'LAMal', avs: '756.1234.5678.97', n_assicurato: '', in_cartella: true,
  medico: 'Dr. med. X', gln_medico: '', rcc_medico: '', prestazione: 'Visita; controllo', codice_tariffa: '', luogo: 'Sala 1', fatta: true, referto: false, inviante: 'Dr. "Y"', esportato_il: '', ...x,
});

test('fatturazione: CSV con BOM, separatore ; , intestazione fissa, virgolette dove servono, sì/no per i booleani', () => {
  const csv = csvPrestazioni([riga()]);
  assert.ok(csv.startsWith('﻿'));
  const [testa, r1, vuota] = csv.slice(1).split('\r\n');
  assert.equal(testa, COLONNE.join(';'));
  assert.equal(vuota, '');
  assert.ok(r1.includes('"Visita; controllo"'));
  assert.ok(r1.includes('"Dr. ""Y"""'));
  assert.ok(r1.includes(';sì;no;'));
  assert.equal(r1.split(';').length - 1, COLONNE.length - 1 + 1 /* il ; dentro le virgolette */);
});

test('fatturazione: periodo del mese e nome del file', () => {
  assert.deepEqual(periodoMese('2026-09'), { dal: '2026-09-01', al: '2026-10-01' });
  assert.deepEqual(periodoMese('2026-12'), { dal: '2026-12-01', al: '2027-01-01' });
  assert.equal(periodoMese('2026-13'), null);
  assert.equal(periodoMese('settembre'), null);
  assert.equal(nomeFileCsv('2026-09-01', '2026-10-01'), 'prestazioni_2026-09-01_2026-10-01.csv');
});

test('fatturazione: il riepilogo conta nuove, esportate, senza referto, senza cartella, non segnate', () => {
  const r = riepilogoPrestazioni([riga(), riga({ esportato_il: '10.09.2026', referto: true }), riga({ in_cartella: false, fatta: false })]);
  assert.deepEqual(r, { totale: 3, nuove: 2, esportate: 1, senza_referto: 2, senza_cartella: 1, non_segnate: 1 });
});
