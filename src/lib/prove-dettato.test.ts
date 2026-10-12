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

// ---- I comandi a voce del dittafono (12.10.2026). Testi INVENTATI. ----
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { corpoDellaLettera, partiDellaLettera, terapiaDellaLettera } from './dittafono-comandi';
const ctx: any = {};
vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public', 'prototipo', 'dittafono-comandi.js'), 'utf-8'), ctx);
const K = ctx.RFComandi;

test('comandi a voce: «per favore» più un comando previsto — e solo quello — viene riconosciuto e tolto', () => {
  const es = 'Il paziente sta bene. Per favore prendi la lettera più recente del paziente e aggiungimela. Clinicamente compensato.';
  const c = K.trova(es);
  assert.equal(c.comando, 'lettera_recente');
  assert.equal(c.frase, 'Per favore prendi la lettera più recente del paziente e aggiungimela.');
  for (const [frase, comando] of [
    ['per favore inserisci l\'ultima lettera', 'lettera_recente'],
    ['Per favore, incollami qui il testo di tutta la lettera precedente grazie', 'lettera_recente'],
    ['perfavore mi riporti la lettera vecchia', null],                       // «riporti» non è fra i verbi previsti
    ['per favore inserisci la terapia dell\'ultima lettera', 'parti'],
    ['per favore aggiungi la terapia', 'parti'],
    ['per favore metti la terapia della lettera precedente qui', 'parti'],
    // «la lettera» e basta è la più recente (12.10.2026): «riprendimi la lettera»
    ['per favore riprendimi la lettera', 'lettera_recente'],
    ['Per favore riprendi la lettera del paziente.', 'lettera_recente'],
    ['per favore prendimi la lettera e aggiungimela qui', 'lettera_recente'],
    ['per favore riprendimi la lettera più recente', 'lettera_recente'],
    ['per favore annulla', 'annulla'],
    ['Per favore togli la lettera', 'annulla'],
  ] as [string, string | null][]) {
    const r = K.trova(frase);
    assert.equal(r ? r.comando : null, comando, frase);
    if (r) assert.equal(r.a, frase.length, `la frase si toglie tutta: ${frase}`);
  }
  // In una lettera vera «per favore» resta dov'è: senza un verbo previsto subito dopo non è un comando.
  for (const frase of [
    'Ti prego per favore di inviarmi copia dell\'ultima lettera del collega.',
    'La paziente chiede per favore un certificato.',
    'Per favore controllare la terapia fra un mese.',
    'Per favore prendi appuntamento con la segreteria per la prossima visita.',
    // frasi da lettera che nominano una parte: il verbo all'infinito, o qualcosa fra il verbo e la parte
    'Per favore aggiungere alla terapia una statina.',
    'Per favore inserire la terapia nel piano di cura.',
    'Per favore metti in pausa la terapia per tre giorni.',
    'Per favore riprendi la terapia anticoagulante dopo l\'intervento.',
    'Per favore riprendi la terapia',
    'Per favore prendi la lettera del collega e portala alla prossima visita.',
    'Per favore metti la lettera di dimissione nella cartella.',
  ]) assert.equal(K.trova(frase), null, frase);
  assert.equal(K.letto('Bene. Per favore inserisce la namnesi'), 'inserisce la namnesi');
  assert.equal(K.letto('Per favore inserisci l\'anamnesi'), null);
  assert.equal(K.nonCapito('Per favore fammi un caffè. Per favore inserisci l\'ultima lettera.'), 1);
  // Un «per favore» senza comando, da solo: la ricerca deve FINIRE (bloccava la pagina, 12.10.2026).
  assert.equal(K.nonCapito('Per favore qualcosa'), 1);
  assert.equal(K.nonCapito('per favore uno. per favore due, per favore'), 3);
  assert.equal(K.nonCapito('Per favore inserisci l\'ultima lettera'), 0);
  // Il secondo comando si trova ripartendo da dopo il primo.
  // Le PARTI della lettera: una o più, nell'ordine in cui sono dette; «da quale lettera» fa parte della richiesta.
  for (const [frase, parti] of [
    ['per favore inserisci l\'anamnesi', ['anamnesi']],
    ['Per favore prendi solo l\'anamnesi dell\'ultima lettera e aggiungimela', ['anamnesi']],
    ['per favore inserisci FRCV e comorbidità della lettera precedente', ['frcv', 'comorbidita']],
    ['per favore inserisci i fattori di rischio cardiovascolari, le comorbidità e le allergie', ['frcv', 'comorbidita', 'allergie']],
    ['per favore metti la conclusione dell\'ultima lettera', ['conclusione']],
    ['per favore incolla l\'ecocardiogramma e l\'ECG', ['eco', 'ecg']],
    ['per favore prendi dall\'ultima lettera l\'anamnesi', ['anamnesi']],
    ['per favore inserisci la terapia', ['terapia']],
    // come può scriverlo un programma di dettatura: punto o a capo dopo la parola d'ordine, pronome attaccato, «puoi…»
    ['Per favore. Inserisci l\'anamnesi.', ['anamnesi']],
    ['Per favore\nInserisci l\'anamnesi', ['anamnesi']],
    ['per favore aggiungimela la conclusione', ['conclusione']],
    ['Per favore, mi puoi inserire le co-morbidità?', ['comorbidita']],
    ['per favore puoi mettermi qui anche l\'ECG', ['ecg']],
    ['per favore dammi la terapia', ['terapia']],
  ] as [string, string[]][]) {
    const r = K.trova(frase);
    assert.deepEqual(r && [r.comando, Array.from(r.parti), r.a >= frase.replace(/[?]$/, '').length], ['parti', parti, true], frase);
  }
  // Una parte nominata più avanti, in un'altra frase o staccata, non entra nel comando.
  assert.deepEqual(Array.from(K.trova('per favore inserisci l\'anamnesi. Poi vediamo l\'ECG').parti), ['anamnesi']);
  assert.deepEqual(Array.from(K.trova('per favore inserisci l\'anamnesi che contiene la diagnosi').parti), ['anamnesi']);
  assert.equal(K.trova('per favore inserisci la lettera più recente').comando, 'lettera_recente');
  assert.equal(K.trova('per favore inserisci la lettera più recente che parlava della terapia nuova').comando, 'lettera_recente');
  const due = 'per favore inserisci la terapia. Poi per favore annulla';
  assert.equal(K.trova(due, K.trova(due).a).comando, 'annulla');
});

test('comandi a voce: il pezzo entra come paragrafo a sé al posto della frase, e si toglie ricucendo', () => {
  const es = 'Il paziente sta bene. Per favore inserisci l\'ultima lettera. Clinicamente compensato.';
  const c = K.trova(es), s = K.sostituisci(es, c.da, c.a, '  Anamnesi inventata.\r\nSeconda riga.  ');
  assert.equal(s.testo, 'Il paziente sta bene.\n\nAnamnesi inventata.\nSeconda riga.\n\nClinicamente compensato.');
  assert.equal(s.testo.slice(s.inizio, s.fine), 'Anamnesi inventata.\nSeconda riga.');
  // annullare: il pezzo sparisce e il testo torna quello di prima senza la frase del comando
  assert.equal(K.sostituisci(s.testo, s.inizio, s.fine, '').testo, 'Il paziente sta bene.\n\nClinicamente compensato.');
  assert.equal(K.sostituisci('Per favore inserisci l\'ultima lettera', 0, 37, 'Corpo.').testo, 'Corpo.', 'in un foglio vuoto resta solo il pezzo');
  assert.equal(K.sostituisci('Uno. per favore annulla due.', 5, 23, '').testo, 'Uno. due.');
  // dal tasto, nel punto del cursore
  assert.equal(K.sostituisci('Prima. Dopo.', 6, 6, 'In mezzo.').testo, 'Prima.\n\nIn mezzo.\n\nDopo.');
});

test('comandi a voce: della lettera trovata si prende il corpo, e la terapia dal suo blocco', () => {
  const lettera = 'Studio Inventato\nVia Finta 1\n\nEgregio Signor\nDr. med. Altro Inventato\n\nCaro collega,\n\nho rivisto il paziente inventato in data 03.02.2026. Sta bene e non riferisce disturbi; nel testo cito i cordiali saluti del collega.\n\nTerapia:\nFarmacoA 10 mg 1-0-0\nFarmacoB 5 mg 0-0-1\n\nIn conclusione quadro stabile, controllo fra dodici mesi. Rimanendo a disposizione per ulteriori informazioni, porgo cordiali saluti.\n\nDr. med. Inventato';
  const corpo = corpoDellaLettera(lettera);
  assert.ok(corpo.startsWith('ho rivisto il paziente inventato'), 'senza testata, destinatario e saluto');
  assert.ok(corpo.endsWith('controllo fra dodici mesi.'), 'senza saluti e firma');
  assert.ok(corpo.includes('cordiali saluti del collega'), '«cordiali saluti» in mezzo non è la fine');
  assert.equal(terapiaDellaLettera(lettera), 'Terapia:\nFarmacoA 10 mg 1-0-0\nFarmacoB 5 mg 0-0-1');
  assert.equal(terapiaDellaLettera('Caro collega, tutto bene. Terapia attuale: FarmacoA 10 mg, FarmacoB 5 mg. Cordiali saluti'), 'Terapia: FarmacoA 10 mg, FarmacoB 5 mg.');
  assert.equal(terapiaDellaLettera('Caro collega, tutto bene.'), '');
  assert.equal(corpoDellaLettera('Biglietto breve.'), 'Biglietto breve.', 'un testo corto resta intero');
});

test('comandi a voce: le parti della lettera — anamnesi, FRCV, comorbidità, esami, conclusione — una per una', () => {
  // A paragrafi, con le etichette (testo INVENTATO).
  const a = partiDellaLettera('Caro collega,\n\nho rivisto il paziente inventato in data 03.02.2026 per il controllo annuale. Riferisce di stare bene.\n\nFRCV: ipertensione arteriosa, dislipidemia. Ex fumatore.\n\nComorbidità: gonartrosi.\n\nClinicamente compensato, PA 130/80 mmHg.\n\nAll\'ECG ritmo sinusale, 64/min.\n\nEcocardiogramma: funzione sistolica conservata.\n\nTerapia:\nFarmacoA 10 mg 1-0-0\n\nIn conclusione quadro stabile. Controllo fra dodici mesi.\n\nCordiali saluti\n\nDr. med. Inventato');
  assert.equal(a.anamnesi, 'ho rivisto il paziente inventato in data 03.02.2026 per il controllo annuale. Riferisce di stare bene.');
  assert.equal(a.frcv, 'FRCV: ipertensione arteriosa, dislipidemia. Ex fumatore.');
  assert.equal(a.comorbidita, 'Comorbidità: gonartrosi.');
  assert.equal(a.esame, 'Clinicamente compensato, PA 130/80 mmHg.');
  assert.equal(a.ecg, 'All\'ECG ritmo sinusale, 64/min.');
  assert.equal(a.eco, 'Ecocardiogramma: funzione sistolica conservata.');
  assert.equal(a.conclusione, 'In conclusione quadro stabile. Controllo fra dodici mesi.');
  assert.equal(a.terapia, 'Terapia:\nFarmacoA 10 mg 1-0-0');
  assert.equal(a.allergie, undefined, 'una parte che non c\'è non si inventa');
  // Tutta di fila, come esce da una scansione: le parti si riconoscono dall\'etichetta o dalla frase che le apre.
  const b = partiDellaLettera('Caro collega, ho rivisto la paziente inventata per dispnea da sforzo. Fattori di rischio cardiovascolari: ipertensione. Comorbilità: asma. All\'ecocardiogramma odierno: ventricolo sinistro normale. In conclusione nessuna cardiopatia. Cordiali saluti');
  assert.equal(b.anamnesi, 'ho rivisto la paziente inventata per dispnea da sforzo.');
  assert.equal(b.frcv, 'Fattori di rischio cardiovascolari: ipertensione.');
  assert.equal(b.comorbidita, 'Comorbilità: asma.');
  assert.equal(b.eco, 'All\'ecocardiogramma odierno: ventricolo sinistro normale.');
  assert.equal(b.conclusione, 'In conclusione nessuna cardiopatia.');
  // Un biglietto senza parti: resta solo il primo paragrafo come anamnesi.
  assert.deepEqual(Object.keys(partiDellaLettera('Caro collega,\n\nti ringrazio per l\'invio del paziente inventato, che vedrò volentieri il mese prossimo in studio.\n\nA presto')), ['anamnesi']);
});
