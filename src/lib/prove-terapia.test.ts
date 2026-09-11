// Fusione della terapia (pura). Uso: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fondiTerapia, stessoFarmaco } from './referti-terapia';

const prev = ['ASPIRIN CARDIO 100 mg 1-0-0-0', 'CONCOR 2.5 mg 0-0-1/2-0', 'VALSARTAN 160 mg 1-0-0-0'];

test('modifiche dettate: sospeso via, dose cambiata, il resto dalla precedente', () => {
  const f = fondiTerapia(prev, {
    righe: ['CONCOR 5 mg 0-0-1-0'],
    voci: [{ nome: 'CONCOR', dose: '5 mg', posologia: '0-0-1-0', stato: 'modificato' }],
    sospesi: ['VALSARTAN'],
  }, 'Sospendo il Valsartan e aumento il Concor a 5 mg la sera.');
  assert.equal(f.modo, 'fusione');
  assert.deepEqual(f.righe, [
    { riga: 'ASPIRIN CARDIO 100 mg 1-0-0-0', fonte: 'precedente' },
    { riga: 'CONCOR 5 mg 0-0-1-0', fonte: 'modificata' },
  ]);
  assert.deepEqual(f.sospese, ['VALSARTAN 160 mg 1-0-0-0']);
  assert.equal(f.avvisi.length, 0);
});

test('invariata più un farmaco nuovo: precedente intera più la riga nuova in coda', () => {
  const f = fondiTerapia(prev, {
    righe: ['EZETIMIBE 10 mg 1-0-0-0'],
    voci: [{ nome: 'EZETIMIBE', dose: '10 mg', posologia: '1-0-0-0', stato: 'nuovo' }],
    sospesi: [],
  }, 'La terapia resta invariata, aggiungo Ezetimibe 10 mg al mattino.');
  assert.equal(f.modo, 'fusione');
  assert.equal(f.righe.length, 4);
  assert.deepEqual(f.righe[3], { riga: 'EZETIMIBE 10 mg 1-0-0-0', fonte: 'nuova' });
  assert.ok(f.righe.slice(0, 3).every((r) => r.fonte === 'precedente'));
});

test('terapia ridettata per intero: comanda il dettato, il farmaco non nominato è un avviso', () => {
  const f = fondiTerapia(prev, {
    righe: ['ASPIRIN CARDIO 100 mg 1-0-0-0', 'CONCOR 2.5 mg 0-0-1/2-0'],
    voci: [{ nome: 'ASPIRIN CARDIO', stato: 'in corso' }, { nome: 'CONCOR', stato: 'in corso' }],
    sospesi: [],
  }, 'Prosegue con Aspirina Cardio 100 mg al mattino e Concor 2.5 mg mezza la sera.');
  assert.equal(f.modo, 'dettato');
  assert.equal(f.righe.length, 2);
  assert.equal(f.avvisi.length, 1);
  assert.match(f.avvisi[0], /VALSARTAN/);
});

test('senza lettera precedente: solo il dettato; senza dettato: la precedente', () => {
  const solo = fondiTerapia([], { righe: ['CONCOR 5 mg 0-0-1-0'], voci: [{ stato: 'modificato' }], sospesi: [] }, 'x');
  assert.equal(solo.modo, 'dettato');
  assert.equal(solo.righe[0].fonte, 'dettato');
  const prec = fondiTerapia(prev, null, 'Terapia invariata.');
  assert.equal(prec.modo, 'precedente');
  assert.equal(prec.righe.length, 3);
  assert.equal(fondiTerapia([], null, 'x').modo, 'nessuna');
});

test('sospeso che nella precedente non c’era: avviso, niente righe inventate', () => {
  const f = fondiTerapia(prev, { righe: [], voci: [], sospesi: ['XARELTO'] }, 'Sospendo Xarelto.');
  assert.equal(f.modo, 'fusione');
  assert.equal(f.righe.length, 3);
  assert.equal(f.sospese.length, 0);
  assert.match(f.avvisi[0], /XARELTO/);
});

test('chiavi dei farmaci: dettato e segretaria non scrivono uguale', () => {
  assert.ok(stessoFarmaco('Aspirina Cardio', 'ASPIRIN CARDIO 100 mg 1-0-0-0'));
  assert.ok(stessoFarmaco('Valsartan', 'VALSARTAN 160 mg 1-0-0-0'));
  assert.ok(!stessoFarmaco('Metoprololo', 'METFORMINA 500 mg 1-0-1-0'));
  assert.ok(!stessoFarmaco('', 'CONCOR'));
});
