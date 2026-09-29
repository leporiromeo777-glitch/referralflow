// Seconda traccia con istruzioni (29.9.2026). Referti e dettati inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applica, inFrasi, leggiPiano, numerate, ricomponi, sembraIstruzioni, vieneDallaTraccia } from './istruzioni-traccia';

const REFERTO = "Caro Luca,\n\nrivedo il paziente a margine. FRCV: ipertensione arteriosa.\nComorbidità: ipotiroidismo.\n\nClinicamente PA 125/78 mmHg. All'ECG ritmo sinusale. Terapia invariata dal Dr. Rossi.";

test('frasi: si ricompone identico, a capo e paragrafi compresi', () => {
  const p = inFrasi(REFERTO);
  assert.equal(ricomponi(p), REFERTO);
  assert.equal(p.length, 7);
  assert.ok(numerate(p).includes("[6] All'ECG ritmo sinusale."));
  assert.ok(numerate(p).includes('[7] Terapia invariata dal Dr. Rossi.'), 'il punto di «Dr.» non chiude la frase');
});

test('riconoscere le istruzioni', () => {
  assert.equal(sembraIstruzioni("Aggiungi prima dell'ECG la frase: il paziente riferisce dispnea da sforzo."), true);
  assert.equal(sembraIstruzioni('Togli la frase sulla terapia. Al posto di ipotiroidismo scrivi ipertiroidismo.'), true);
  assert.equal(sembraIstruzioni("All'ecocardiogramma FE 60%. Frattanto la terapia rimane invariata."), false, 'continuazione del referto');
});

test('applica: inserisci, sostituisci, togli; il resto identico', () => {
  const traccia = "Aggiungi prima dell'ECG la frase il paziente riferisce dispnea da sforzo. Al posto di ipotiroidismo scrivi ipertiroidismo. Togli la frase sulla terapia.";
  const r = applica(REFERTO, [
    { tipo: 'inserisci', testo: 'il paziente riferisce dispnea da sforzo', prima_della_frase: 6 },
    { tipo: 'sostituisci', frase: 4, da: 'ipotiroidismo', a: 'ipertiroidismo' },
    { tipo: 'togli', frase: 7 },
  ], traccia);
  assert.deepEqual(r.esiti.map((e) => e.ok), [true, true, true]);
  assert.equal(r.testo, "Caro Luca,\n\nrivedo il paziente a margine. FRCV: ipertensione arteriosa.\nComorbidità: ipertiroidismo.\n\nClinicamente PA 125/78 mmHg. Il paziente riferisce dispnea da sforzo. All'ECG ritmo sinusale.");
});

test('guardie: testo non dettato, frase inesistente, parole assenti', () => {
  const traccia = 'Aggiungi dopo la prima frase: controllo tra sei mesi.';
  const r = applica(REFERTO, [
    { tipo: 'inserisci', testo: 'controllo tra dodici mesi', dopo_la_frase: 1 },
    { tipo: 'sostituisci', frase: 4, da: 'diabete', a: 'controllo' },
    { tipo: 'togli', frase: 40 },
    { tipo: 'inserisci', testo: 'controllo tra sei mesi', dopo_la_frase: 1 },
  ], traccia);
  assert.deepEqual(r.esiti.map((e) => [e.ok, e.motivo ?? '']), [[false, 'il testo non è quello dettato'], [false, 'il testo da cambiare non è in quella frase'], [false, 'frase non trovata'], [true, '']]);
  assert.ok(r.testo.startsWith('Caro Luca, Controllo tra sei mesi.') || r.testo.includes('Controllo tra sei mesi.'));
  assert.equal(vieneDallaTraccia('dispnea da sforzo', 'il paziente riferisce, dispnea da sforzo!'), true);
});

test('piano del modello letto con sospetto', () => {
  const p = leggiPiano('{"modifiche":[{"tipo":"togli","frase":3},{"tipo":"riscrivi","testo":"x"},{"tipo":"sostituisci","frase":"2","da":"a","a":"b"}],"non_capite":["sposta il paragrafo"]}');
  assert.deepEqual(p.modifiche, [{ tipo: 'togli', frase: 3 }, { tipo: 'sostituisci', frase: 2, da: 'a', a: 'b' }]);
  assert.deepEqual(p.non_capite, ['sposta il paragrafo']);
  assert.deepEqual(leggiPiano('non json'), { modifiche: [], non_capite: [] });
});
