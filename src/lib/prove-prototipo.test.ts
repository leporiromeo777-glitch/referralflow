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

test('divagazioni: le frasi tolte dalla catena diventano segnalazioni con «Rimetti nel referto» (ripiego: in coda all’ultima sezione)', async () => {
  const { costruisciRevisione } = await import('./prototipo-revisione');
  const r = costruisciRevisione({ testo: 'Anamnesi:\nIl paziente sta bene.\n\nConclusioni:\nControllo fra un anno.', parole: [], payload: { divagazioni: ['allega il duplex per la segretaria', { frase: 'buongiorno a tutti', motivo: 'saluto' }], note_segreteria: ['allegare il duplex'] } });
  const tolte = r.issues.filter((i) => i.title.startsWith('Tolta dalla catena'));
  assert.equal(tolte.length, 2);
  assert.equal(tolte[0].add?.section, r.report[r.report.length - 1].code);
  assert.equal(tolte[0].add?.text, 'allega il duplex per la segretaria');
  assert.match(tolte[1].why, /saluto/);
  assert.deepEqual(tolte[0].opts.map((o) => o.l), ['Lascia fuori', 'Rimetti nel referto']);
  assert.equal(tolte[0].sev, 'suggestion');
});

// «Rimetti» nel punto del dettato (23.9.2026): funzioni del ponte del
// prototipo lette dal file ed eseguite su un referto finto con i tempi.
test('rimetti: la frase tolta torna subito dopo la frase detta prima, e il testo ricomposto la tiene lì', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('public/prototipo/bridge/04-referti-revisione.js', 'utf8');
  const prendi = (nome: string) => {
    const i = src.indexOf(`function ${nome}(`); assert.ok(i >= 0, nome);
    let j = src.indexOf('{', i), liv = 0;
    for (; j < src.length; j++) { if (src[j] === '{') liv++; else if (src[j] === '}' && --liv === 0) break; }
    return src.slice(i, j + 1);
  };
  const RV_TRANSCRIPT = [
    { id: 's1', s: 0, e: 6, tx: 'il paziente sta bene. manda il referto al dottor Bianchi. la pressione è normale.',
      w: [[0, 'il'], [0.4, 'paziente'], [0.9, 'sta'], [1.2, 'bene.'], [2, 'manda'], [2.3, 'il'], [2.5, 'referto'], [2.9, 'al'], [3.1, 'dottor'], [3.4, 'Bianchi.'], [4, 'la'], [4.2, 'pressione'], [4.7, 'è'], [4.9, 'normale.']] },
    { id: 's2', s: 7, e: 9, tx: 'controllo fra un anno.', w: [[7, 'controllo'], [7.5, 'fra'], [7.8, 'un'], [8, 'anno.']] },
  ];
  const RV_REPORT = [
    { code: 'sec1', label: 'Anamnesi', parts: [{ id: 'p1', t: 'Il paziente sta bene.', src: 's1' }, { id: 'p2', t: 'La pressione è normale.', src: 's1' }] },
    { code: 'sec2', label: 'Procedere', parts: [{ id: 'p3', t: 'Controllo fra un anno.', src: 's2' }] },
  ];
  const RV: { text: Record<string, string>; removed: Record<string, boolean>; moved: Record<string, string>; added: { id: string; section: string; after?: string; text: string }[] } = { text: {}, removed: {}, moved: {}, added: [] };
  const corpo = [prendi('rfTokRientro'), prendi('rfTempoDi'), prendi('rfPuntoDiRientro'), prendi('rfTestoRicomposto'),
    'return { rfPuntoDiRientro, rfTestoRicomposto };'].join('\n');
  const f = new Function('RV_TRANSCRIPT', 'RV_REPORT', 'RV', corpo)(RV_TRANSCRIPT, RV_REPORT, RV);
  const pos = f.rfPuntoDiRientro('Manda il referto al dottor Bianchi.');
  assert.deepEqual(pos, { section: 'sec1', after: 'p1' });
  RV.added.push({ id: 'n1', section: pos.section, after: pos.after, text: 'Manda il referto al dottor Bianchi.' });
  assert.equal(f.rfTestoRicomposto(), 'Il paziente sta bene. Manda il referto al dottor Bianchi. La pressione è normale.\n\nControllo fra un anno.');
  // con il secondo già noto (omissioni) e prima di tutto: in testa alla prima sezione
  assert.deepEqual(f.rfPuntoDiRientro('qualunque', 0), { section: 'sec1', after: '^' });
  // frase che non si ritrova nel dettato: null (si fa come prima, in coda)
  assert.equal(f.rfPuntoDiRientro('testo che non c’entra niente con questo'), null);
  // anche se la frase prima è stata tolta, il punto resta quello
  RV.removed.p1 = true;
  assert.equal(f.rfTestoRicomposto(), 'Manda il referto al dottor Bianchi. La pressione è normale.\n\nControllo fra un anno.');
});
