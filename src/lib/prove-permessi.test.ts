// Chi vede che cosa (23.9.2026). Uso: npm run test:app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEZIONI, sezioniDi, puo, vietato } from './permessi';

import { puoOrch } from './orchestrazione/ruoli';
test('permessi: il tecnico vede tutto, l’amministrazione tutto tranne il dittafono', () => {
  assert.deepEqual(sezioniDi('tecnico'), [...SEZIONI]);
  assert.ok(puo('admin', 'administration') && puo('admin', 'fatturazione'));
  assert.ok(!puo('admin', 'dittafono'));
});

test('permessi: chi cura non vede fatture, invianti, amministrazione; l’aiuto medico non ha i referti', () => {
  for (const r of ['medico', 'assistente']) {
    for (const s of ['fatturazione', 'invianti', 'prestazioni', 'administration', 'anonymize', 'converti'] as const) assert.ok(!puo(r, s), `${r} ${s}`);
    for (const s of ['agenda', 'patients', 'imaging', 'dittafono', 'sale'] as const) assert.ok(puo(r, s), `${r} ${s}`);
  }
  assert.ok(puo('medico', 'reports'));
  assert.ok(!puo('assistente', 'reports'));
});

test('permessi: la segreteria lavora referti e fatture ma non amministra; ruoli sconosciuti non vedono niente', () => {
  assert.ok(puo('segretaria', 'reports') && puo('segretaria', 'fatturazione') && puo('segretaria', 'invianti'));
  assert.ok(!puo('segretaria', 'administration') && !puo('segretaria', 'dittafono'));
  assert.deepEqual(sezioniDi('inviante'), []);
  assert.deepEqual(sezioniDi(undefined), []);
  assert.equal(vietato('segretaria', 'reports'), null);
  assert.equal(vietato('assistente', 'reports')?.status, 403);
  assert.equal(vietato('assistente', 'reports', 'agenda'), null, 'basta una delle sezioni');
});

test('sale: l’aiuto medico registra ciò che succede coi pazienti, ma non cambia il piano', () => {
  for (const r of ['segretaria', 'medico', 'assistente', 'admin']) assert.ok(puoOrch(r, 'operare'), r);
  assert.ok(!puoOrch('tecnico', 'operare') && !puoOrch(null, 'operare') && !puoOrch('inviante', 'operare'));
  assert.ok(!puoOrch('assistente', 'decidere') && puoOrch('segretaria', 'decidere') && puoOrch('medico', 'decidere'));
  assert.ok(puoOrch('admin', 'parametri') && !puoOrch('medico', 'parametri') && !puoOrch('assistente', 'parametri'));
  assert.ok(puoOrch('medico', 'durate') && !puoOrch('assistente', 'durate') && !puoOrch('segretaria', 'durate'));
});
