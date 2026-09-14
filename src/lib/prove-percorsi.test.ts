import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { analizzaPercorsi, caricaPercorsi, PAGINA_PERCORSI, percorsiPerPrompt, trovaPercorso } from './percorsi';

const MD = `---
tipo: medici
---
# Percorsi

Testo introduttivo senza campi.

## Prova urgente
- Indicazione: caso di prova
- Urgenza: sì se c'è sincope
- Durata: 30'
- Dove: Ambulatorio
- Tempi: entro 7 giorni
- Stato: validato
- Prestazioni:
  1. Visita cardiologica — sempre
  2. ECG a riposo
  3. RM cardiaca (esterna) — se serve
- Nota: una nota.
- Fonti: ESC 2024

## Seconda prova
- Indicazione: altra
- Prestazioni:
  1. Visita cardiologica
`;

test('percorsi: parser puro legge campi, prestazioni con condizione, esterne, urgenza e stato; salta le sezioni di testo', () => {
  const p = analizzaPercorsi(MD);
  assert.equal(p.length, 2);
  assert.equal(p[0].id, 'prova-urgente');
  assert.equal(p[0].urgente, true);
  assert.equal(p[0].stato, 'validato');
  assert.equal(p[0].durata, "30'");
  assert.deepEqual(p[0].prestazioni.map((x) => [x.n, x.nome, x.condizione, x.esterna]), [[1, 'Visita cardiologica', 'sempre', false], [2, 'ECG a riposo', '', false], [3, 'RM cardiaca (esterna)', 'se serve', true]]);
  assert.equal(p[1].urgente, false);
  assert.equal(p[1].stato, 'proposta');
  assert.equal(p[1].tempi, '');
});

test('percorsi: la pagina vera si legge, ogni percorso ha indicazione, almeno 3 prestazioni e fonti; il prompt cita le sequenze', () => {
  assert.ok(fs.existsSync(PAGINA_PERCORSI));
  const p = caricaPercorsi();
  assert.ok(p.length >= 10, `percorsi letti: ${p.length}`);
  for (const x of p) {
    assert.ok(x.indicazione, x.nome);
    assert.ok(x.prestazioni.length >= 3, x.nome);
    assert.ok(x.fonti, x.nome);
    assert.ok(x.prestazioni.every((y) => y.nome), x.nome);
  }
  assert.ok(new Set(p.map((x) => x.id)).size === p.length, 'id unici');
  const prompt = percorsiPerPrompt(p);
  assert.ok(prompt.includes('→'));
  assert.ok(prompt.split('\n').length === p.length);
});

test('percorsi: trovaPercorso riconosce il nome nella domanda e non sceglie se ambiguo', () => {
  const p = analizzaPercorsi(MD);
  assert.equal(trovaPercorso(p, 'che percorso per la prova urgente?')?.id, 'prova-urgente');
  assert.equal(trovaPercorso(p, 'prova'), null);
});
