import test from 'node:test';
import assert from 'node:assert/strict';
import { EPONIMI, nomiPropri, nonMedica, ripuliRiformulazione, validaGenerale } from './domanda-medica';

const ORIGINALE = 'Per Bernasconi Luca, 62 anni, nato il 03.04.1964, con fibrillazione atriale e clearance 38, che dose di apixaban?';

test('domanda medica: la riformulazione generale passa; i nomi, le date e i numeri la bloccano', () => {
  const buona = validaGenerale(ORIGINALE, "Come si aggiusta la dose di apixaban nell'insufficienza renale moderata in fibrillazione atriale?");
  assert.equal(buona.ok, true);
  assert.deepEqual(buona.blocchi, []);

  const colNome = validaGenerale(ORIGINALE, 'Che dose di apixaban per Bernasconi con clearance ridotta?');
  assert.equal(colNome.ok, false);
  assert.ok(colNome.blocchi.some((b) => b.tipo === 'nome'));

  const conData = validaGenerale(ORIGINALE, 'Dose di apixaban in un caso visto il 03.04.1964 con insufficienza renale?');
  assert.ok(conData.blocchi.some((b) => b.tipo === 'data'));

  const conAvs = validaGenerale(ORIGINALE, 'Dose di apixaban per il 756.1234.5678.97 in insufficienza renale?');
  assert.ok(conAvs.blocchi.some((b) => b.tipo === 'avs'));

  const conMail = validaGenerale(ORIGINALE, 'Dose di apixaban, scrivere a mario.rossi@studio.ch per il seguito?');
  assert.ok(conMail.blocchi.some((b) => b.tipo === 'email'));
});

test('domanda medica: «il paziente» e l\'età precisa avvisano ma non bloccano', () => {
  const e = validaGenerale(ORIGINALE, 'Che dose di apixaban serve in un paziente di 62 anni con insufficienza renale moderata?');
  assert.equal(e.ok, true, 'niente dato identificativo: può partire');
  assert.ok(!e.avvisi.some((a) => a.tipo === 'persona'), '«in un paziente» è un modo normale di porre una domanda generale');
  assert.ok(e.avvisi.some((a) => a.tipo === 'eta'));
});

test('domanda medica: troppo corta o troppo lunga non parte', () => {
  assert.equal(validaGenerale(ORIGINALE, 'apixaban?').ok, false);
  assert.equal(validaGenerale(ORIGINALE, 'a'.repeat(700)).ok, false);
});

test('nomi propri: prende i nomi anche a inizio frase, lascia fuori le sigle cliniche e le parole comuni', () => {
  const n = nomiPropri('Il paziente ha FA e BPCO. Bernasconi è seguito da Moccetti a Lugano in settembre. Questo caso è raro.');
  assert.ok(n.includes('Bernasconi'), 'un nome a inizio frase non deve sfuggire');
  assert.ok(n.includes('Moccetti'));
  assert.ok(n.includes('Lugano'));
  assert.ok(!n.includes('FA') && !n.includes('BPCO'), 'le sigle non sono nomi');
  assert.ok(!n.includes('Il') && !n.includes('Questo'), 'le parole comuni a inizio frase nemmeno');
  assert.ok(!n.some((x) => x.toLowerCase() === 'settembre'), 'i mesi non sono nomi di persona');
});

test('nomi propri: un nome che apre la domanda originale blocca la riformulazione', () => {
  const e = validaGenerale('Bernasconi ha la FA, che anticoagulante?', 'Per Bernasconi quale anticoagulante in fibrillazione atriale?');
  assert.equal(e.ok, false);
  assert.ok(e.blocchi.some((b) => b.tipo === 'nome'));
});

test('domanda medica: il modello può dire che non è una domanda di medicina', () => {
  assert.equal(nonMedica('NON_MEDICA'), true);
  assert.equal(nonMedica(' non_medica \n'), true);
  assert.equal(nonMedica('Come si dosa il warfarin?'), false);
});

test('domanda medica: la riga del modello si ripulisce da virgolette ed etichette', () => {
  assert.equal(ripuliRiformulazione('Domanda riscritta: «Come si dosa il warfarin?»'), 'Come si dosa il warfarin?');
  assert.equal(ripuliRiformulazione('"Qual è la dose?"\nSpiegazione: ...'), 'Qual è la dose?');
});

test('eponimi: «Holter» è il nome di un esame, non di un paziente — non blocca', () => {
  const orig = 'La signora Moretti ha avuto due sincopi: loop recorder o Holter di 7 giorni?';
  const e = validaGenerale(orig, 'In caso di sincopi ricorrenti con ECG normale, è preferibile il loop recorder o un Holter di 7 giorni?');
  assert.equal(e.ok, true);
  assert.ok(EPONIMI.has('holter'));
});

test('il blocco dice QUALE nome è rimasto, così si corregge senza indovinare', () => {
  const e = validaGenerale('Moretti ha la FA', 'Per Moretti quale anticoagulante?');
  const b = e.blocchi.find((x) => x.tipo === 'nome');
  assert.ok(b && b.spiega.includes('«Moretti»'));
});

test('avviso «paziente preciso»: scatta sul determinativo e sul possessivo', () => {
  assert.ok(validaGenerale('x', 'Che dose per questo paziente con insufficienza renale moderata?').avvisi.some((a) => a.tipo === 'persona'));
  assert.ok(validaGenerale('x', 'Che dose nel mio paziente con insufficienza renale moderata?').avvisi.some((a) => a.tipo === 'persona'));
  assert.ok(!validaGenerale('x', 'Che dose in un paziente con insufficienza renale moderata?').avvisi.some((a) => a.tipo === 'persona'));
});
