import test from 'node:test';
import assert from 'node:assert/strict';
import { abbinaPrestazione, catalogoDaPercorsi, tipoDaTesto, type VoceCatalogo, abbinaColore, abbinaPrestazioneAgenda } from './prestazioni';
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

test('abbinamento per colore: esatto, e batte le parole chiave', () => {
  const cat = [
    { id: '1', nome: 'Visita cardiologica', tipo: 'visita' as const, durata_min: 30, sala: null, parole_chiave: ['visita'], attivo: true, colore: '#2ECC40' },
    { id: '2', nome: 'Ecocardiogramma', tipo: 'esame' as const, durata_min: 30, sala: null, parole_chiave: ['eco'], attivo: true, colore: null },
    { id: '3', nome: 'Spenta', tipo: 'esame' as const, durata_min: 30, sala: null, parole_chiave: [], attivo: false, colore: '#0074d9' },
  ];
  assert.equal(abbinaColore(cat, '#2ecc40')?.nome, 'Visita cardiologica', 'maiuscole e minuscole non contano');
  assert.equal(abbinaColore(cat, '#0074d9'), null, 'una voce spenta non abbina');
  assert.equal(abbinaColore(cat, 'verde'), null);
  assert.equal(abbinaColore(cat, ''), null);
  // il colore vince sul testo: il riquadro dice «eco» ma il colore dice visita
  assert.equal(abbinaPrestazioneAgenda(cat, '#2ecc40', 'eco da sforzo')?.nome, 'Visita cardiologica');
  // senza colore si ricade sulle parole chiave
  assert.equal(abbinaPrestazioneAgenda(cat, '', 'eco da sforzo')?.nome, 'Ecocardiogramma');
});
