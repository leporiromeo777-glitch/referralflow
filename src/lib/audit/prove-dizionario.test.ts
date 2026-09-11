// Proposte di dizionario dalle correzioni umane (pure). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidata, proposteDizionario } from './dizionario';
import type { Operazione } from './diff';

const op = (from: string, to: string, categoria: Operazione['categoria'] = 'medical_terminology', kind: Operazione['kind'] = 'REPLACE'): Operazione =>
  ({ kind, from, to, posizione: 0, contesto: '', categoria, severita: 'LOW' });

test('candidate: solo REPLACE corti senza cifre, categorie da errore d’ascolto', () => {
  assert.ok(candidata(op('tucarografico', 'elettrocardiografico')));
  assert.ok(candidata(op('e gli giunge', 'egli giunge', 'grammar')));
  assert.ok(!candidata(op('2.5 mg', '5 mg', 'dose')));
  assert.ok(!candidata(op('diminuiti', 'aumentati', 'clinical_meaning')));
  assert.ok(!candidata(op('diminuito', 'diminuiti', 'grammar')), 'solo desinenza');
  assert.ok(!candidata(op('', 'x', 'other', 'INSERT')));
  assert.ok(!candidata(op('Rossi', 'Bianchi', 'patient_information')));
  assert.ok(!candidata(op('una frase davvero troppo lunga per essere', 'una voce', 'other')));
});

test('proposte: raggruppate per medico e voce, contate, con alternative e ordine', () => {
  const p = proposteDizionario([
    { medico: 'moccetti', bozza_id: 'b1', created_at: '2026-09-01', diff: [op('prioricamente', 'periodicamente'), op('Sensuale', 'sinusale')] },
    { medico: 'moccetti', bozza_id: 'b2', created_at: '2026-09-03', diff: [op('prioricamente', 'periodicamente'), op('prioricamente', 'periodicamente,')] },
    { medico: 'moccetti', bozza_id: 'b3', created_at: '2026-09-05', diff: [op('sensuale', 'sinusoidale')] },
    { medico: 'moschovitis', bozza_id: 'b4', created_at: '2026-09-05', diff: [op('prioricamente', 'precocemente')] },
    { medico: null, bozza_id: 'b5', created_at: '2026-09-05', diff: [op('x', 'y')] },
    { medico: 'moccetti', bozza_id: 'b6', created_at: '2026-09-05', diff: 'rotto' },
  ]);
  assert.equal(p.length, 3);
  assert.deepEqual(p[0], { medico: 'moccetti', da: 'prioricamente', a: 'periodicamente', occorrenze: 3, bozze: 2, ultima: '2026-09-03', alternative: [], categoria: 'medical_terminology' });
  const sens = p.find((x) => x.da === 'sensuale')!;
  assert.equal(sens.occorrenze, 2);
  assert.ok(['sinusale', 'sinusoidale'].includes(sens.a) && sens.alternative.length === 1);
  assert.equal(p.find((x) => x.medico === 'moschovitis')!.a, 'precocemente');
});
