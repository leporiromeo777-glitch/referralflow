import test from 'node:test';
import assert from 'node:assert/strict';
import { costruisciRevisione, segmentiDaParole, sezioniDaTesto } from './prototipo-revisione';

const parole: [string, number][] = [
  ['Caro', 0.2], ['collega,', 0.5], ['il', 1.0], ['paziente', 1.3], ['nega', 1.8], ['dispnea.', 2.3],
  ['La', 5.0], ['FE', 5.3], ['è', 5.5], ['del', 5.7], ['55', 6.0], ['per', 6.3], ['cento.', 6.6],
  ['Cordiali', 9.0], ['saluti.', 9.4],
];
const testo = 'Caro collega,\n\nil paziente riferisce dispnea. La FE è del 55 %.\n\nTerapia:\nConcor 5 mg 1-0-0\n\nCordiali saluti.';

test('segmenti dalle parole: chiusi a fine frase o dopo una pausa, con i tempi', () => {
  const s = segmentiDaParole(parole);
  assert.equal(s.length, 3);
  assert.equal(s[0].tx, 'Caro collega, il paziente nega dispnea.');
  assert.ok(s[1].s >= 5 && s[1].e > 6.6);
});

test('sezioni dal testo: paragrafi con etichetta, frasi come span', () => {
  const sez = sezioniDaTesto(testo);
  assert.deepEqual(sez.map((s) => s.label), ['Apertura', 'Paragrafo 2', 'Terapia', 'Chiusura']);
  assert.equal(sez[1].parts.length, 2);
});

test('revisione: span agganciati alla trascrizione, issue dalla catena con evidenza, riepilogo', () => {
  const r = costruisciRevisione({
    testo, parole, audioUrl: '/api/referti/audio/x',
    payload: {
      divergenze: [{ contesto: 'il paziente riferisce dispnea', versione_a: 'riferisce dispnea', versione_b: 'nega dispnea', pesanti: ['nega'] }],
      riparazioni_applicate: [{ da: 'Concord', a: 'Concor' }],
      frasi_non_supportate: [{ frase: 'La FE è del 55 %.', motivo: 'numero non nel dettato' }],
      numeri: [{ valore: '55', unita: '%', secondo: 6.0, confermato: false }],
      frasi_omesse: [{ frase: 'controllo a sei mesi', pulita: 'Controllo a sei mesi.', secondo: 8.0, cifre: false, farmaco: false, motivo: 'non nel referto', fonte: 'modello' }],
      fiducia: { punteggio: 40, livello: 'bassa', motivi: ['un numero non confermato'] },
    },
  });
  assert.equal(r.audio.url, '/api/referti/audio/x');
  assert.ok(r.audio.dur > 9);
  const p2 = r.report[1].parts[0];
  assert.equal(p2.src, 's1');
  assert.ok(['matched', 'likely'].includes(p2.conf));
  const neg = r.issues.find((i) => i.cat === 'NEGATION');
  assert.ok(neg && neg.sev === 'critical' && neg.span === p2.id && neg.ev && neg.opts[0].apply === 'il paziente nega dispnea.');
  const num = r.issues.find((i) => i.cat === 'NUMERIC');
  assert.ok(num && num.ev && num.ev.focus === 6.0);
  const om = r.issues.find((i) => i.cat === 'OMISSION');
  assert.ok(om && om.audioTx === 'Controllo a sei mesi.' && om.add?.section === 'sec4');
  assert.equal(r.issues[0].sev, 'critical');
  assert.equal(r.riepilogo.state, 'priority');
  assert.ok(r.riepilogo.crit >= 2);
  assert.ok(r.markers.some((m) => m.k === 'num' && m.l === '55 %'));
});
