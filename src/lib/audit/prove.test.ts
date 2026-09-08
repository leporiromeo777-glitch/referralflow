// Test della parte pura dell'audit (§74-§75). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confronta, normalizza, _impostaListeDiProva } from './diff';
import { mediaMobile, statistiche, outlier, percentile } from './metriche';

_impostaListeDiProva(['bisoprololo', 'valsartan', 'aspirina'], ['ipocinesia', 'stenosi']);

// Simulazione della catena senza DB: ogni output va nel registro E alla
// tappa dopo (§3), le versioni non si sovrascrivono (§4), le trasformazioni
// AI→AI non toccano il conteggio della segretaria (§13), il medico è a
// parte (§14), zero-touch solo se revisionato (§36), i retry restano (§43).
type Art = { v: number; label: string; producer: 'AI' | 'SECRETARY' | 'DOCTOR'; testo: string };
function catenaSimulata(tappe: { label: string; f: (t: string) => string }[], ingresso: string) {
  const registro: Art[] = [];
  let corrente = ingresso;
  for (const t of tappe) {
    const uscita = t.f(corrente);
    registro.push({ v: registro.length + 1, label: t.label, producer: 'AI', testo: uscita }); // → DB
    corrente = uscita;                                                                        // → tappa dopo
  }
  return { registro, finale: corrente };
}
function editsRuolo(registro: Art[], ruolo: 'SECRETARY' | 'DOCTOR') {
  const ai = [...registro].reverse().find((a) => a.producer === 'AI')!;
  const umano = [...registro].reverse().find((a) => a.producer === ruolo);
  return umano ? confronta(ai.testo, umano.testo).metriche.edit_count : null;
}

test('pipeline: ogni output è salvato e passato alla tappa dopo', () => {
  const { registro, finale } = catenaSimulata([
    { label: 'whisper', f: () => 'il paziente asume bisoprololo 2.5 mg' },
    { label: 'correzione', f: (t) => t.replace('asume', 'assume') },
    { label: 'bella_copia', f: (t) => `Il ${t.slice(3)}.` },
  ], 'audio');
  assert.equal(registro.length, 3);
  assert.equal(registro[2].testo, finale);
  assert.equal(registro[1].testo, 'il paziente assume bisoprololo 2.5 mg');
});

test('versioning: una versione nuova non sovrascrive la precedente', () => {
  const { registro } = catenaSimulata([{ label: 'a', f: () => 'Versione A' }, { label: 'b', f: () => 'Versione B' }], '');
  assert.deepEqual(registro.map((r) => [r.v, r.testo]), [[1, 'Versione A'], [2, 'Versione B']]);
});

test('caso critico §75: 2.5 mg → 5 mg = 1 REPLACE, dose, CRITICAL', () => {
  const c = confronta('Il paziente assume Bisoprololo 2.5 mg.', 'Il paziente assume Bisoprololo 5 mg.');
  assert.equal(c.metriche.edit_count, 1);
  assert.equal(c.metriche.replacements, 1);
  assert.equal(c.operazioni[0].kind, 'REPLACE');
  assert.equal(c.operazioni[0].from, '2.5 mg');
  assert.equal(c.operazioni[0].to, '5 mg');
  assert.equal(c.operazioni[0].categoria, 'dose');
  assert.equal(c.operazioni[0].severita, 'CRITICAL');
});

test('secretary metric: solo le modifiche della segretaria contano', () => {
  const { registro } = catenaSimulata([
    { label: 'whisper', f: () => 'il pazziente asume bisoprololo 2.5 mg e valsartan' },
    { label: 'correzione', f: () => 'Il paziente assume bisoprololo 2.5 mg e valsartan.' },
    { label: 'clinica', f: () => 'Il paziente assume Bisoprololo 2.5 mg e Valsartan.' },
  ], 'audio');
  registro.push({ v: 4, label: 'segretaria', producer: 'SECRETARY', testo: 'Il paziente assume Bisoprololo 5 mg e Valsartan.' });
  assert.equal(editsRuolo(registro, 'SECRETARY'), 1);
  assert.equal(editsRuolo(registro, 'DOCTOR'), null);
});

test('doctor edits: registrate ma escluse dalla metrica della segretaria', () => {
  const registro: Art[] = [
    { v: 1, label: 'catena_finale', producer: 'AI', testo: 'Controllo fra 6 mesi.' },
    { v: 2, label: 'segretaria', producer: 'SECRETARY', testo: 'Controllo fra 6 mesi.' },
    { v: 3, label: 'medico', producer: 'DOCTOR', testo: 'Controllo fra 12 mesi.' },
  ];
  assert.equal(editsRuolo(registro, 'SECRETARY'), 0);
  assert.equal(editsRuolo(registro, 'DOCTOR'), 1);
});

test('AI edits: le trasformazioni tra AI non aumentano secretary_edit_count', () => {
  const { registro } = catenaSimulata(Array.from({ length: 42 }, (_, i) => ({ label: `ai${i}`, f: (t: string) => `${t} parola${i}` })), 'Testo');
  registro.push({ v: 99, label: 's', producer: 'SECRETARY', testo: registro[registro.length - 1].testo });
  assert.equal(editsRuolo(registro, 'SECRETARY'), 0);
});

test('zero touch: revisionato senza modifiche = 0; mai revisionato = escluso', () => {
  const ai = 'Il paziente sta bene.';
  const revisionato = { status: 'REVIEWED_NO_CHANGES', edits: confronta(ai, ai).metriche.edit_count };
  const maiAperto = { status: 'NOT_REVIEWED', edits: null as number | null };
  const validi = [revisionato, maiAperto].filter((r) => r.status.startsWith('REVIEWED'));
  assert.equal(revisionato.edits, 0);
  assert.equal(validi.length, 1);
});

test('retry: un tentativo fallito e uno riuscito restano entrambi', () => {
  const corse = [{ attempt: 1, status: 'FAILED' }, { attempt: 2, status: 'SUCCESS' }];
  assert.deepEqual(corse.map((c) => c.status), ['FAILED', 'SUCCESS']);
  assert.equal(new Set(corse.map((c) => c.attempt)).size, 2);
});

test('normalizzazione: spazi, a capo e apostrofi tipografici non contano', () => {
  assert.equal(normalizza('Testo   con\r\nspazi ’strani’ '), "Testo con\nspazi 'strani'");
  assert.equal(confronta('A  b.\n\nC d.', 'A b. C d.').metriche.edit_count, 0);
});

test('categorie e severità: virgola LOW, parola MEDIUM, negazione HIGH', () => {
  const ops = confronta('Il soffio è presente e il test negativo', 'Il soffio, è presente e il test non negativo').operazioni;
  assert.deepEqual(ops.map((o) => [o.kind, o.categoria, o.severita]), [['INSERT', 'punctuation', 'LOW'], ['INSERT', 'clinical_meaning', 'HIGH']]);
  const sp = confronta('cardioreabilitazione', 'cardioriabilitazione').operazioni[0];
  assert.equal(sp.severita, 'MEDIUM');
});

test('metriche: media mobile, percentili, outlier', () => {
  assert.deepEqual(mediaMobile([4, 2, 6, 8], 2), [null, 3, 4, 7]);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  const s = statistiche([1, 1, 2, 2, 3, 30]);
  assert.equal(s.mediana, 2);
  assert.equal(s.max, 30);
  const o = outlier([2, 3, 2, 4, 3, 2, 3, 37, 2, 3]);
  assert.equal(o[7], true);
  assert.equal(o.filter(Boolean).length, 1);
});
