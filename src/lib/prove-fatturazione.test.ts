import test from 'node:test';
import assert from 'node:assert/strict';
import { COLONNE, controlloFatturazione, csvPrestazioni, nomeFileCsv, periodoMese, riepilogoPrestazioni, type RigaFattura } from './fatturazione';

const riga = (x: Partial<RigaFattura> = {}): RigaFattura => ({
  id: 'a1', data: '03.09.2026', ora: '09:30', durata: 30, cognome: 'Rossi', nome: 'Mario', nascita: '01.02.1950', assicurazione: 'LAMal', avs: '756.1234.5678.97', n_assicurato: '', in_cartella: true,
  medico: 'Dr. med. X', gln_medico: '', rcc_medico: '', prestazione: 'Visita; controllo', codice_tariffa: '', luogo: 'Sala 1', fatta: true, referto: false, inviante: 'Dr. "Y"', esportato_il: '', stato: '', stato_visto: '', ...x,
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

test('fatturazione: il riepilogo conta nuove, esportate, senza referto, senza cartella, non segnate, fatturate', () => {
  const r = riepilogoPrestazioni([
    riga(),
    riga({ esportato_il: '10.09.2026', referto: true, stato: 'fatturato' }),
    riga({ in_cartella: false, fatta: false, stato: 'da_fatturare' }),
  ]);
  assert.deepEqual(r, {
    totale: 3, nuove: 2, esportate: 1, senza_referto: 2, senza_cartella: 1, non_segnate: 1,
    fatturate: 1, da_fatturare: 1,
  });
});

test('controllo: in sospeso solo la prestazione vecchia ancora con la moneta; annullati e scusati fuori', () => {
  const oggi = new Date(2026, 8, 20); // 20.09.2026
  const c = controlloFatturazione(
    [
      riga({ id: 'vecchia-moneta', data: '07.09.2026', stato: 'da_fatturare' }),
      riga({ id: 'giusto-7-giorni', data: '13.09.2026', stato: 'da_fatturare' }),
      riga({ id: 'sei-giorni', data: '14.09.2026', stato: 'da_fatturare' }),
      riga({ id: 'ieri-moneta', data: '19.09.2026', stato: 'da_fatturare' }),
      riga({ id: 'fatturata', data: '07.09.2026', stato: 'fatturato' }),
      riga({ id: 'annullata', data: '07.09.2026', stato: 'annullato' }),
      riga({ id: 'scusata', data: '07.09.2026', stato: 'scusato' }),
      riga({ id: 'muta', data: '07.09.2026', stato: '' }),
    ],
    oggi,
    7
  );
  // la soglia è «7 giorni o più»: il 13.09 (esattamente 7) conta, il 14.09 no
  assert.deepEqual(c.in_sospeso.map((r) => r.id), ['vecchia-moneta', 'giusto-7-giorni']);
  assert.deepEqual(c.senza_stato.map((r) => r.id), ['muta']);
  assert.equal(c.non_fatturabili, 2);
  assert.equal(c.per_stato.da_fatturare, 4);
  assert.equal(c.per_stato.senza_stato, 1);
});

test('controllo: senza stato nessun allarme se la data non si legge', () => {
  const c = controlloFatturazione([riga({ data: 'boh', stato: '' })], new Date(2026, 8, 20), 7);
  assert.equal(c.in_sospeso.length, 0);
  assert.equal(c.senza_stato.length, 0);
});

test('fatturazione: il CSV porta lo stato dell\'agenda in italiano', () => {
  const csv = csvPrestazioni([riga({ stato: 'fatturato' })]);
  assert.ok(csv.includes(';Fatturato;'));
  assert.equal(csv.split('\r\n')[0].split(';').length, COLONNE.length);
});
