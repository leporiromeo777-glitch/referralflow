import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confronta, osso, type ParolaTempo } from './dettato-confronto';

// Dettatura in tempo reale accanto alla registrazione (11.10.2026). Testi INVENTATI.
const mac = (testo: string, passo = 0.5): ParolaTempo[] => testo.split(/\s+/).map((w, i) => [w, Math.round(i * passo * 10) / 10]);

test('dettato: due testi uguali, a parte maiuscole e punteggiatura, non hanno punti da riascoltare', () => {
  const c = confronta('Egregio collega, ho rivisto la paziente. Sta bene.', mac('egregio collega ho rivisto la paziente sta bene'));
  assert.deepEqual([c.parole_dettato, c.parole_mac, c.uguali, c.punti], [8, 8, 8, 0]);
  assert.deepEqual(c.pezzi, [{ t: 'Egregio collega, ho rivisto la paziente. Sta bene.', uguale: true, s: 0 }]);
  assert.equal(osso('«Bisoprololo»,'), 'bisoprololo');
  assert.equal(osso('2,5'), '2.5');
});

test('dettato: una parola sentita diversa diventa un punto, con ciò che ha sentito il Mac e il secondo da riascoltare', () => {
  const c = confronta('Terapia: bisoprololo 5 mg al mattino, ramipril invariato.', mac('Terapia: bisoprololo 2,5 mg al mattino, ramipril invariato.'));
  assert.equal(c.punti, 1);
  assert.deepEqual(c.pezzi, [
    { t: 'Terapia: bisoprololo', uguale: true, s: 0 },
    { t: '5', uguale: false, s: 1, mac: '2,5' },
    { t: 'mg al mattino, ramipril invariato.', uguale: true, s: 1.5 },
  ]);
  assert.deepEqual([c.parole_dettato, c.uguali], [8, 7]);
});

test('dettato: parole che ha solo uno dei due (saltate o aggiunte) si vedono tutte e due', () => {
  // Dragon non ha scritto «non»: nel suo testo lì non c'è niente, ma il punto c'è, ed è di quelli che contano.
  const saltata = confronta('la paziente riferisce dolori toracici', mac('la paziente non riferisce dolori toracici'));
  assert.deepEqual(saltata.pezzi, [{ t: 'la paziente', uguale: true, s: 0 }, { t: '', uguale: false, s: 1, mac: 'non' }, { t: 'riferisce dolori toracici', uguale: true, s: 1.5 }]);
  // Il Mac non ha sentito una parola che Dragon ha scritto.
  const aggiunta = confronta('controllo fra sei mesi circa', mac('controllo fra sei mesi'));
  assert.deepEqual(aggiunta.pezzi, [{ t: 'controllo fra sei mesi', uguale: true, s: 0 }, { t: 'circa', uguale: false, s: 1.5, mac: '' }]);
  // In coda al Mac c'è altro.
  assert.deepEqual(confronta('saluti', mac('saluti cordiali')).pezzi, [{ t: 'saluti', uguale: true, s: 0 }, { t: '', uguale: false, s: 0.5, mac: 'cordiali' }]);
});

test('dettato: senza l\'uno o l\'altro testo il confronto non inventa niente', () => {
  assert.deepEqual(confronta('', mac('una due tre')).pezzi, [{ t: '', uguale: false, s: 0, mac: 'una due tre' }]);
  const solo = confronta('una due tre', []);
  assert.deepEqual([solo.uguali, solo.punti, solo.parole_mac], [0, 1, 0]);
  assert.equal(solo.pezzi[0].s, null, 'senza le parole del Mac non c\'è un secondo da riascoltare');
  const lungo = confronta(Array.from({ length: 3200 }, (_, i) => `p${i}`).join(' '), mac('p0 p1 p2'));
  assert.equal(lungo.troncato, true);
});

// ---- Il foglio del dittafono (12.10.2026). Testi INVENTATI. ----
import { letteraDalFoglio, nomeDestinatario, pulisciFoglio } from './dittafono-foglio-regole';

test('foglio: dalla lettera sul foglio al testo da rivedere — saluto, corpo, chiusura e firma', () => {
  const foglio = pulisciFoglio({ destinatario: 'Egregio Signor\nDr. med. Altro Inventato\nFMH Medicina interna\nVia e-mail: altro@example.org', data: '12.10.2026', titolo: 'Visita del 12.10.2026', paziente: 'Paziente\nProva Anna – 03.04.1950',
    saluto: 'Caro collega,', chiusura: 'Con i migliori saluti\n\nDr. med. Inventato', copia: 'Copia: alla paziente', altro: 'non previsto', numero: 3 })!;
  assert.deepEqual(Object.keys(foglio).sort(), ['chiusura', 'copia', 'data', 'destinatario', 'paziente', 'saluto', 'titolo'], 'solo le parti previste');
  assert.equal(letteraDalFoglio(foglio, '  ho rivisto la paziente per il controllo annuale.\r\nSta bene.  '), 'Caro collega,\n\nho rivisto la paziente per il controllo annuale.\nSta bene.\n\nCon i migliori saluti\n\nDr. med. Inventato');
  assert.equal(letteraDalFoglio({ saluto: '', chiusura: '' }, 'Solo il corpo.'), 'Solo il corpo.', 'senza saluto né chiusura resta il corpo');
  assert.equal(nomeDestinatario(foglio.destinatario), 'Dr. med. Altro Inventato');
  assert.equal(nomeDestinatario('Egregio Signor\nDr. med. \nVia e-mail'), '', 'un destinatario ancora da compilare non è un nome');
  assert.equal(nomeDestinatario('Gentile Signora\nDr.ssa med. Terza Inventata'), 'Dr.ssa med. Terza Inventata');
  assert.equal(pulisciFoglio(null), null);
  assert.equal(pulisciFoglio({ saluto: '   ' }), null, 'un foglio vuoto non è un foglio');
  assert.equal(pulisciFoglio({ saluto: 'x'.repeat(5000) })!.saluto.length, 300);
});
