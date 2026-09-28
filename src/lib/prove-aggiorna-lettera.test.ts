// Aggiornamento della lettera vecchia (28.9.2026). Lettere e dettati inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggiorna, confronta, dividi, eFemminile, frasePerIlControllo, mesiDelControllo } from './aggiorna-lettera';

const VECCHIA = `Caro Luca,

non ritorno sull'anamnesi del paziente in quanto già presente nei miei incarti precedenti. Rivedo in data 14.03.2025 il paziente a margine nell'ambito di un controllo annuale. Egli riferisce di stare bene e nega sintomatologia ascrivibile alla sfera cardiologica. Nel 2019 ECG con blocco di branca destro incompleto. FRCV: ipertensione arteriosa trattata, dislipidemia, ex fumatore. Comorbidità: ipotiroidismo. Clinicamente mi confronto con un paziente di 80 Kg per 175 cm, PA 130/80 mmHg, FC 64 bpm. All'ECG ritmo sinusale. In conclusione, alla luce degli elementi di cui sopra, la situazione è stabile. Dal canto mio un prossimo controllo è da prevedersi non prima di 12 mesi rimanendo a disposizione Tua e del paziente. Cordiali saluti,`;

const DETTATO = `Caro Luca, rivedo in data odierna il paziente a margine per il controllo annuale. Egli riferisce di stare bene. FRCV: ipertensione arteriosa trattata, dislipidemia, ex fumatore. Comorbidità: ipotiroidismo. Da maggio diabete mellito tipo 2 in terapia con metformina. Clinicamente mi confronto con un paziente di 82 Kg per 175 cm, PA 125/78 mmHg, FC 60 bpm. All'ecocardiogramma FE 60%. Frattanto la terapia in atto rimane invariata. Dal canto mio un prossimo controllo è da prevedersi non prima di sei mesi rimanendo a disposizione Tua e del paziente. Cordiali saluti.`;

test('divisione: la visita comincia a «Clinicamente», non all\'ECG raccontato nell\'anamnesi', () => {
  const d = dividi(VECCHIA);
  assert.equal(d.punto, 'clinicamente');
  assert.ok(d.prima.includes('Nel 2019 ECG') && d.prima.endsWith('Comorbidità: ipotiroidismo.'));
  assert.ok(d.dopo.startsWith('Clinicamente mi confronto'));
  assert.equal(dividi('Anamnesi: nulla. Valutazione: stabile.').punto, 'valutazione', 'senza segnali forti vale un segnale debole');
});

test('confronto: simile in grandi linee, la frase nuova segnalata', () => {
  const r = confronta(dividi(VECCHIA).prima, dividi(DETTATO).prima);
  assert.ok(r.somiglianza >= 0.5, String(r.somiglianza));
  assert.deepEqual(r.novita, ['Da maggio diabete mellito tipo 2 in terapia con metformina.']);
});

test('mesi del controllo e frase finale', () => {
  assert.equal(mesiDelControllo('un prossimo controllo non prima di sei mesi'), 6);
  assert.equal(mesiDelControllo('controllo tra 18 mesi'), 18);
  assert.equal(mesiDelControllo('rivederlo fra un anno'), 12);
  assert.equal(mesiDelControllo('nessuna indicazione'), null);
  assert.equal(frasePerIlControllo(12, true, false), 'In conclusione, alla luce degli elementi di cui sopra, propongo un prossimo controllo non prima di 12 mesi rimanendo a disposizione Tua e della paziente qualora la clinica richiedesse una rivalutazione anticipata.');
  assert.ok(frasePerIlControllo(6, false, true).startsWith('Propongo un prossimo controllo non prima di 6 mesi rimanendo a disposizione Tua e del paziente'));
});

test('lettera aggiornata: vecchia anamnesi con la data di oggi, visita dettata, frase finale, niente doppioni', () => {
  const p = aggiorna({ lettera: VECCHIA, dettato: DETTATO, oggi: '28.09.2026', femminile: false });
  assert.ok(!('errore' in p));
  if ('errore' in p) return;
  assert.equal(p.saluto, 'Caro Luca,');
  assert.ok(p.testo.startsWith('Caro Luca,\n\nnon ritorno sull\'anamnesi'));
  assert.ok(p.vecchia.includes('Rivedo in data 28.09.2026') && !p.vecchia.includes('14.03.2025'), 'data della visita portata a oggi');
  assert.ok(p.vecchia.includes('Nel 2019 ECG'), 'le altre date restano');
  assert.equal(p.data_vecchia, '14.03.2025');
  assert.ok(p.nuova.startsWith('Clinicamente mi confronto con un paziente di 82 Kg') && p.nuova.includes('FE 60%'));
  assert.ok(!/prossimo controllo|Cordiali saluti/.test(p.nuova), 'controllo e saluto dettati tolti: li rimette la frase finale');
  assert.equal(p.mesi, 6); assert.equal(p.mesi_dal_dettato, true);
  assert.ok(p.testo.endsWith('rimanendo a disposizione Tua e del paziente qualora la clinica richiedesse una rivalutazione anticipata.'));
  assert.equal((p.testo.match(/In conclusione, alla luce/g) ?? []).length, 1);
  assert.ok(!p.testo.includes('80 Kg'), 'la visita vecchia non resta');
  assert.deepEqual(p.novita, ['Da maggio diabete mellito tipo 2 in terapia con metformina.']);
});

test('errori spiegati e sesso della paziente', () => {
  const e = aggiorna({ lettera: 'Caro Luca, grazie.', dettato: DETTATO, oggi: '28.09.2026', femminile: false });
  assert.ok('errore' in e);
  assert.equal(eFemminile('F', ''), true);
  assert.equal(eFemminile(null, 'Rivedo la paziente a margine. Ella sta bene.'), true);
  assert.equal(eFemminile(null, 'Rivedo il paziente a margine. Egli sta bene.'), false);
});

test('rapporto a sezioni (Moschovitis): gli a capo restano', () => {
  const vecchia = 'Anamnesi:\nIpertensione dal 2015.\nFRCV: ipertensione, dislipidemia.\nValutazione:\nStabile.';
  const dettato = 'Anamnesi:\nIpertensione dal 2015.\nFRCV: ipertensione, dislipidemia.\nValutazione:\nStabile, FE 55%.\nProssimo controllo tra 12 mesi.';
  const p = aggiorna({ lettera: vecchia, dettato, oggi: '28.09.2026', femminile: false, unParagrafo: false });
  assert.ok(!('errore' in p));
  if ('errore' in p) return;
  assert.ok(p.testo.startsWith('Anamnesi:\nIpertensione dal 2015.\nFRCV: ipertensione, dislipidemia.\n\nValutazione:\nStabile, FE 55%.'), p.testo);
  assert.ok(!p.nuova.includes('Prossimo controllo'));
});

test('lo step parte solo su richiesta: «riprendimi la lettera del…»', async () => {
  const { richiestaAggiornamento } = await import('./aggiorna-lettera');
  const oggi = new Date('2026-09-28T10:00:00');
  assert.deepEqual(richiestaAggiornamento('Lettera al dottor Rossi, riprendimi la lettera del 14 marzo 2025.', [], oggi), { data: { g: 14, m: 3, a: 2025 } });
  assert.deepEqual(richiestaAggiornamento('', ['Aggiorna la lettera del 14.03.2025 alla data di oggi'], oggi), { data: { g: 14, m: 3, a: 2025 } });
  assert.deepEqual(richiestaAggiornamento('Riprendi la lettera precedente.', [], oggi), { data: null });
  assert.deepEqual(richiestaAggiornamento('Riapri la lettera di marzo', [], oggi), { data: { m: 3, a: 2026 } });
  assert.equal(richiestaAggiornamento('Lettera al dottor Rossi. Paziente visto oggi.', ['manda copia al curante'], oggi), null);
});

test('la frase di regia non è una «frase nuova»', () => {
  const p = aggiorna({ lettera: VECCHIA, dettato: 'Lettera al dottor Luca Bianchi. Riprendimi la lettera del 14.03.2025. ' + DETTATO, oggi: '28.09.2026', femminile: false });
  assert.ok(!('errore' in p));
  if ('errore' in p) return;
  assert.deepEqual(p.novita, ['Da maggio diabete mellito tipo 2 in terapia con metformina.']);
  assert.ok(!/Riprendimi|Lettera al dottor/.test(p.testo));
});
