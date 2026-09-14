import test from 'node:test';
import assert from 'node:assert/strict';
import { abbinaPrestazione, catalogoDaPercorsi, tipoDaTesto, type VoceCatalogo } from './prestazioni';
import { caricaPercorsi } from './percorsi';

const voce = (nome: string, parole: string[] = [], tipo: 'visita' | 'esame' | 'procedura' = 'esame'): VoceCatalogo => ({ id: nome, nome, tipo, durata_min: 30, sala: null, parole_chiave: parole, attivo: true });

test('prestazioni: il tipo si stima dal testo (esame, procedura, altrimenti visita)', () => {
  assert.equal(tipoDaTesto('Ecocardiogramma'), 'esame');
  assert.equal(tipoDaTesto('Holter ECG 24h'), 'esame');
  assert.equal(tipoDaTesto('Angioplastica coronarica (PCI)'), 'procedura');
  assert.equal(tipoDaTesto('Controllo'), 'visita');
  assert.equal(tipoDaTesto('Visita cardiologica'), 'visita');
});

test('prestazioni: abbinamento per parola chiave più lunga, poi per nome; accenti e maiuscole ignorati; inattive escluse', () => {
  const cat = [voce('Ecocardiogramma', ['eco', 'ecocardio']), voce('ECG a riposo', ['ecg']), voce('Ergometria', ['ergo', 'sforzo']), voce('Visita cardiologica', [], 'visita'), { ...voce('Vecchia', ['eco']), attivo: false }];
  assert.equal(abbinaPrestazione(cat, 'ECO da stress')?.nome, 'Ecocardiogramma');
  assert.equal(abbinaPrestazione(cat, 'ecocardio + ECG')?.nome, 'Ecocardiogramma');
  assert.equal(abbinaPrestazione(cat, 'Test da sforzo')?.nome, 'Ergometria');
  assert.equal(abbinaPrestazione(cat, 'VISITA CARDIOLÓGICA di controllo')?.nome, 'Visita cardiologica');
  assert.equal(abbinaPrestazione(cat, 'Colloquio'), null);
  assert.equal(abbinaPrestazione(cat, ''), null);
});

test('prestazioni: il catalogo proposto dai percorsi veri ha nomi unici, niente esterne, un tipo e una parola chiave per voce', () => {
  const prop = catalogoDaPercorsi(caricaPercorsi());
  assert.ok(prop.length >= 6, `voci: ${prop.length}`);
  assert.equal(new Set(prop.map((v) => v.nome.toLowerCase())).size, prop.length);
  assert.ok(prop.every((v) => !/estern/i.test(v.nome)));
  assert.ok(prop.every((v) => ['visita', 'esame', 'procedura'].includes(v.tipo) && v.parole_chiave.length === 1 && v.durata_min > 0));
  assert.ok(prop.some((v) => /ecocardiogramma/i.test(v.nome) && v.tipo === 'esame'));
  assert.ok(prop.some((v) => /visita cardiologica/i.test(v.nome) && v.tipo === 'visita'));
});
