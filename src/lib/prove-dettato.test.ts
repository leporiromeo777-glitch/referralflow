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
import { letteraDalFoglio, nomeDestinatario, pazienteDalTesto, pulisciFoglio } from './dittafono-foglio-regole';

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
  // il paziente del foglio per il Word (15.10.2026; nomi inventati)
  assert.deepEqual({ ...pazienteDalTesto('Paziente\nProvafoglio Anna – 03.04.1950') }, { nome_paziente: 'Provafoglio Anna', data_nascita: '03.04.1950' });
  assert.deepEqual({ ...pazienteDalTesto('PROVAFOGLIO Anna, 3.4.1950') }, { nome_paziente: 'PROVAFOGLIO Anna', data_nascita: '03.04.1950' });
  assert.deepEqual({ ...pazienteDalTesto('Provafoglio Anna 03.04.1950') }, { nome_paziente: 'Provafoglio Anna', data_nascita: '03.04.1950' });
  assert.deepEqual({ ...pazienteDalTesto('Provafoglio Anna') }, { nome_paziente: 'Provafoglio Anna' });
  assert.deepEqual({ ...pazienteDalTesto('Paziente') }, {});
  assert.equal(pulisciFoglio({ saluto: 'x'.repeat(5000) })!.saluto.length, 300);
});

// ---- I comandi a voce del dittafono (12.10.2026). Testi INVENTATI. ----
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { corpoDellaLettera, letteraFinoA, partiDellaLettera, salutoDellaLettera, terapiaDellaLettera } from './dittafono-comandi';
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
    ['perfavore mi riporti la lettera vecchia', 'lettera_recente'],            // «riporti» non è la forma prevista, ma si capisce
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
  assert.equal(K.letto('Bene. Per favore dimmi che ore sono'), 'dimmi che ore sono');
  assert.equal(K.letto('Bene. Per favore inserisce la namnesi'), null, 'scritto male, ma capito');
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
  // I verbi del guardare aprono la lettera accanto senza mettere niente nel foglio; senza verbo vale se la frase finisce lì.
  for (const [frase, comando, solo] of [
    ['per favore aprimi la lettera', 'lettera_recente', true],
    ['Per favore fammi vedere l\'ultima lettera', 'lettera_recente', true],
    ['per favore mostrami l\'ECG della lettera precedente', 'parti', true],
    ['per favore puoi farmi vedere la lettera', 'lettera_recente', true],
    ['per favore la lettera più recente', 'lettera_recente', false],
    ['Per favore l\'anamnesi.', 'parti', false],
    ['per favore FRCV e comorbidità', 'parti', false],
    ['per favore inserisci la lettera', 'lettera_recente', false],
  ] as [string, string | null, boolean][]) {
    const r = K.trova(frase);
    assert.deepEqual([r ? r.comando : null, r ? r.soloApri : false], [comando, solo], frase);
  }
  for (const frase of ['Per favore la terapia va assunta regolarmente', 'per favore la lettera del collega appena arriva', 'Per favore apri la finestra', 'per favore l\'anamnesi familiare è muta'])
    assert.equal(K.trova(frase), null, frase);
  // Il programma di dettatura non scrive sempre il comando giusto (dal log dello studio: il verbo all'infinito): il
  // verbo vale anche in un'altra forma o un po' storpiato, e così i nomi delle parti — se la frase finisce lì.
  for (const [frase, comando, parti] of [
    ['per favore inserire l\'anamnesi', 'parti', ['anamnesi']],
    ['Per favore inserire l\'anamnesi del paziente', 'parti', ['anamnesi']],
    ['per favore inserisce la namnesi', 'parti', ['anamnesi']],
    ['per favore inserisci mi l\'amnesia', 'parti', ['anamnesi']],
    ['per favore prendere FR CV e con morbidità', 'parti', ['frcv', 'comorbidita']],
    ['per favor inseriscii l\'eco cardiogramma dell\'ultima lettera', 'parti', ['eco']],
    ['per favore aggiungere le conclusioni della lettera', 'parti', ['conclusione']],
    ['per favore incollare i farmaci', 'parti', ['terapia']],
    ['per favore riprendere la lettera', 'lettera_recente', null],
    ['per favore prendere l\'ultima lettera per favore', 'lettera_recente', null],
    ['per favore aprire la lettera', 'lettera_recente', null],
    ['per favore mostrare l\'e c g', 'parti', ['ecg']],
  ] as [string, string, string[] | null][]) {
    const r = K.trova(frase);
    assert.deepEqual([r ? r.comando : null, r && r.parti ? Array.from(r.parti) : null, r ? r.a : 0], [comando, parti, frase.length], frase);
  }
  assert.equal(K.trova('per favore aprire la lettera').soloApri, true);
  // …ma una frase da lettera con lo stesso verbo resta testo: non finisce lì, o è una terapia che si «prende».
  for (const frase of ['Per favore inserire la terapia nel piano di cura.', 'Per favore prendere la terapia.', 'Per favore riprendere la terapia', 'Per favore aggiungere alla terapia una statina.', 'Per favore controllare l\'ECG.', 'Per favore ripetere l\'ecocardiogramma fra un anno.', 'Per favore inserire l\'ECG nella documentazione del paziente.', 'A fine aprile la lettera'])
    assert.equal(K.trova(frase), null, frase);
  // Una parte nominata più avanti, in un'altra frase o staccata, non entra nel comando.
  assert.deepEqual(Array.from(K.trova('per favore inserisci l\'anamnesi. Poi vediamo l\'ECG').parti), ['anamnesi']);
  assert.deepEqual(Array.from(K.trova('per favore inserisci l\'anamnesi che contiene la diagnosi').parti), ['anamnesi']);
  assert.equal(K.trova('per favore inserisci la lettera più recente').comando, 'lettera_recente');
  assert.equal(K.trova('per favore inserisci la lettera più recente che parlava della terapia nuova').comando, 'lettera_recente');
  const due = 'per favore inserisci la terapia. Poi per favore annulla';
  assert.equal(K.trova(due, K.trova(due).a).comando, 'annulla');
});

test('comandi a voce: «per favore» può stare in mezzo al comando, dopo il verbo — e il dettato prima non si tocca', () => {
  for (const [testo, frase, comando, soloApri] of [
    ['Sta bene. Prendimi per favore l\'anamnesi', 'Prendimi per favore l\'anamnesi', 'parti', false],
    ['senza dolore prendimi per favore l\'anamnesi', 'prendimi per favore l\'anamnesi', 'parti', false],      // senza punto prima: il verbo è scritto giusto
    ['Puoi per favore riprendermi la lettera', 'Puoi per favore riprendermi la lettera', 'lettera_recente', false],
    ['Compensato.\nmi puoi per favore aprire l\'ultima lettera', 'mi puoi per favore aprire l\'ultima lettera', 'lettera_recente', true],
    ['Fammi per favore vedere l\'ECG.', 'Fammi per favore vedere l\'ECG.', 'parti', true],
    ['Mostrami per favore la conclusione', 'Mostrami per favore la conclusione', 'parti', true],
    ['Prendimi, per favore, la terapia dell\'ultima lettera', 'Prendimi, per favore, la terapia dell\'ultima lettera', 'parti', false],
    ['Ora inseriscimi per favore FRCV e comorbidità grazie', 'Ora inseriscimi per favore FRCV e comorbidità grazie', 'parti', false],
    ['Bene. Inserire per favore l\'anamnesi', 'Inserire per favore l\'anamnesi', 'parti', false],             // verbo in un'altra forma: solo a inizio frase
    ['Toglimi per favore la lettera', 'Toglimi per favore la lettera', 'annulla', false],
  ] as [string, string, string, boolean][]) {
    const r = K.trova(testo);
    assert.equal(r ? r.comando : null, comando, testo);
    assert.equal(r.frase, frase, testo);
    assert.equal(r.soloApri, soloApri, testo);
    assert.equal(K.nonCapito(testo), 0, testo);
  }
  // Il verbo in un'altra forma e NON a inizio frase resta nel testo: vale solo ciò che segue «per favore», come prima.
  for (const testo of [
    'Le chiedo di prendere per favore l\'anamnesi',
    'Riprende la terapia per favore l\'anamnesi',
    'Il paziente riprende la terapia. Per favore l\'anamnesi',
  ]) { const r = K.trova(testo); assert.equal(r.comando, 'parti', testo); assert.equal(r.da, testo.toLowerCase().indexOf('per favore'), testo); }
  // La cosa chiesta sta dopo la parola d'ordine: in fondo alla frase non è previsto; e le frasi da lettera restano tali.
  for (const testo of [
    'Prendimi l\'anamnesi per favore',
    'La paziente prende per favore la terapia regolarmente',
    'Alla segretaria: copia per favore la lettera al medico curante',
    'Riprendi per favore la terapia anticoagulante dopo l\'intervento.',
    'Metti per favore in pausa la terapia per tre giorni.',
  ]) assert.equal(K.trova(testo), null, testo);
  const es = 'Sta bene. Prendimi per favore l\'anamnesi. Poi ECG.', c = K.trova(es);
  assert.equal(K.sostituisci(es, c.da, c.a, 'Anamnesi inventata.').testo, 'Sta bene.\n\nAnamnesi inventata.\n\nPoi ECG.');
});

test('comandi a voce: «riprendimi per favore» seguito da una parte toglie anche il verbo; «fino a» una parte', () => {
  // 15.10.2026, dallo studio: «riprendimi per favore l'anamnesi» lasciava scritto «riprendimi».
  for (const [testo, frase, parti] of [
    ['riprendimi per favore l\'anamnesi', 'riprendimi per favore l\'anamnesi', 'anamnesi'],
    ['Bene. Riprendimi, per favore, la terapia.', 'Riprendimi, per favore, la terapia.', 'terapia'],
    ['senza dolore riprendimi per favore FRCV e comorbidità', 'riprendimi per favore FRCV e comorbidità', 'frcv,comorbidita'],
  ] as [string, string, string][]) { const r = K.trova(testo); assert.equal(r.comando, 'parti', testo); assert.equal(r.frase, frase, testo); assert.equal(Array.from(r.parti).join(), parti, testo); }
  // «riprendi» resta una frase da lettera quando dopo la parte il discorso continua
  assert.equal(K.trova('Riprendi per favore la terapia anticoagulante dopo l\'intervento.'), null);
  for (const [testo, parte, escluso, frase] of [
    ['per favore riprendimi la lettera fino alla terapia', 'terapia', false, null],
    ['Riprendimi per favore fino alle comorbidità', 'comorbidita', false, null],
    ['per favore riprendimi fino a prima dell\'esame clinico', 'esame', true, null],
    ['per favore riprendimi la lettera fino all\'ECG escluso. Poi detto io.', 'ecg', true, 'per favore riprendimi la lettera fino all\'ECG escluso.'],
    ['per favore riprendimi l\'ultima lettera fino alle conclusioni compresa', 'conclusione', false, null],
    ['per favore la lettera fino a FRCV', 'frcv', false, null],
    // 15.10.2026, dallo studio: «…la lettera del paziente fino ai fattori di rischio cardiovascolare» non era capito
    ['Per favore riprendimi la lettera del paziente fino ai fattori di rischio cardiovascolare', 'frcv', false, null],
    ['per favore riprendimi la lettera di questa paziente fino alle comorbidità', 'comorbidita', false, null],
  ] as [string, string, boolean, string | null][]) {
    const r = K.trova(testo);
    assert.equal(r ? r.comando : null, 'fino', testo); assert.equal(Array.from(r.parti).join(), parte, testo); assert.equal(r.escluso, escluso, testo);
    assert.equal(r.frase, frase ?? testo, testo);
  }
  assert.equal(K.trova('per favore riprendimi fino a domani'), null);
  // il ritaglio (lettera INVENTATA)
  const l = 'Caro collega,\n\nho rivisto il paziente inventato per il controllo annuale. Riferisce di stare bene.\n\nFRCV: ipertensione arteriosa.\n\nComorbidità: gonartrosi.\n\nClinicamente compensato, PA 130/80 mmHg.\n\nAll\'ECG ritmo sinusale.\n\nTerapia:\nFarmacoA 10 mg 1-0-0\nFarmacoB 5 mg 0-0-1\n\nIn conclusione quadro stabile. Controllo fra dodici mesi.\n\nCordiali saluti\n\nDr. med. Inventato';
  const anam = 'ho rivisto il paziente inventato per il controllo annuale. Riferisce di stare bene.';
  assert.equal(letteraFinoA(l, 'comorbidita'), `${anam}\n\nFRCV: ipertensione arteriosa.\n\nComorbidità: gonartrosi.`);
  assert.equal(letteraFinoA(l, 'esame', true), `${anam}\n\nFRCV: ipertensione arteriosa.\n\nComorbidità: gonartrosi.`);
  assert.equal(letteraFinoA(l, 'anamnesi'), anam);
  assert.equal(letteraFinoA(l, 'anamnesi', true), '', 'prima dell\'anamnesi non c\'è niente');
  assert.ok(letteraFinoA(l, 'terapia').endsWith('Terapia:\nFarmacoA 10 mg 1-0-0\nFarmacoB 5 mg 0-0-1'));
  assert.ok(letteraFinoA(l, 'conclusione').endsWith('Controllo fra dodici mesi.') && !letteraFinoA(l, 'conclusione').includes('saluti'));
  assert.equal(letteraFinoA(l, 'holter'), '', 'una parte che non c\'è non dà niente');
  // il saluto in testa arriva a parte, per il campo del saluto (15.10.2026)
  assert.equal(salutoDellaLettera(l), 'Caro collega,');
  assert.equal(salutoDellaLettera('Studio Inventato\nVia Finta 1\n\nGentile dott.ssa Prova,\n\nho rivisto la paziente.'), 'Gentile dott.ssa Prova,');
  assert.equal(salutoDellaLettera('ho rivisto il paziente senza saluto.'), '');
  const nudo = 'Studio Inventato\n\nCaro Inventato\n\nho rivisto il paziente inventato per il controllo annuale, che riferisce di stare bene da mesi.\n\nCordiali saluti';
  assert.equal(salutoDellaLettera(nudo), 'Caro Inventato,', 'senza virgola: la riga corta col solo saluto');
  assert.ok(corpoDellaLettera(nudo).startsWith('ho rivisto'), 'e il corpo comincia dopo');
  // tutta di fila, con i fattori di rischio aperti da «(»: la parte finisce con la sua frase
  const fila = 'Caro collega, ho rivisto la paziente inventata per palpitazioni da alcune settimane, senza sincope. Fattori di rischio cardiovascolare (ipertensione arteriosa, ex fumatrice). All\'ECG ritmo sinusale. ' + 'Il decorso inventato prosegue senza novità. '.repeat(6) + 'Cordiali saluti, Dr. med. Inventato';
  assert.equal(letteraFinoA(fila, 'frcv'), 'ho rivisto la paziente inventata per palpitazioni da alcune settimane, senza sincope. Fattori di rischio cardiovascolare (ipertensione arteriosa, ex fumatrice).');
  // citati dentro una frase non sono una parte: niente
  assert.equal(letteraFinoA('Caro collega, ho rivisto il paziente inventato per la valutazione dei fattori di rischio cardiovascolare e per dolori atipici. ' + 'Il decorso inventato prosegue senza novità. '.repeat(6) + 'Cordiali saluti', 'frcv'), '');
});

// «Detto la lettera all'indirizzo del dottor … per il paziente …» (15.10.2026). Nomi INVENTATI.
import { cercaSimili, paroleNome } from './somiglianza-nomi';
test('detto la lettera all’indirizzo di…: la frase si riconosce; medico e paziente si trovano anche storpiati', () => {
  const r = K.trovaIndirizzo("Bene. Detto la lettera all'indirizzo della dottoressa Maria Provamedico, per la paziente Provapaziente Anna nata il 3.4.1950\nCaro collega");
  assert.deepEqual([r.medico, r.paziente, r.nascita, r.donna], ['Maria Provamedico', 'Provapaziente Anna', '03.04.1950', true]);
  assert.equal(K.trovaIndirizzo("Detto la lettera indirizzata al Dr. med. Provamedico per il signor Gialli").medico, 'Provamedico');
  assert.equal(K.trovaIndirizzo("Per favore, detto la lettera all'indirizzo del dottor Provamedico").paziente, '');
  // senza «detto» (Dragon spesso non lo scrive, 19.10.2026) a inizio frase o riga, e con «che va»
  assert.equal(K.trovaIndirizzo("La lettera che va all'indirizzo del dottor Provamedico per il paziente Bianchi.").medico, 'Provamedico');
  assert.equal(K.trovaIndirizzo("Bene.\nla lettera che va all'indirizzo della dottoressa Verdi").donna, true);
  assert.equal(K.trovaIndirizzo("Detto la lettera che va all'indirizzo del dottor Provamedico").medico, 'Provamedico');
  for (const t of ["Ho visto che la lettera va all'indirizzo del dottor Provamedico per sbaglio", 'il paziente porta la lettera all’indirizzo del dottor Provamedico'])
    assert.equal(K.trovaIndirizzo(t), null, t);
  for (const t of ['Ho dettato la lettera al collega.', 'La lettera è indirizzata al paziente.', 'ho rivisto il paziente per il controllo']) assert.equal(K.trovaIndirizzo(t), null, t);
  assert.deepEqual(paroleNome('Dr. med. Mario Rossi'), ['mario', 'rossi']);
  const rubrica = [{ nome: 'Provamedico Mario' }, { nome: 'Provamedico Maria' }, { nome: 'Altroinventato Luca' }, { nome: 'Bianchi Paolo' }];
  const n = (p: { nome: string }) => p.nome;
  assert.equal(cercaSimili('Altroinventatto', rubrica, n).scelta?.nome, 'Altroinventato Luca', 'una lettera in più (Dragon): è lui');
  assert.equal(cercaSimili('Luca Altroinventato', rubrica, n).scelta?.nome, 'Altroinventato Luca', 'nome e cognome nell’altro ordine');
  assert.equal(cercaSimili('Provamedico', rubrica, n).scelta, null, 'due Provamedico: non si sceglie');
  assert.deepEqual(cercaSimili('Provamedico', rubrica, n).alternative.map(n), ['Provamedico Mario', 'Provamedico Maria']);
  assert.equal(cercaSimili('Provamedico Mario', rubrica, n).scelta, null, 'Mario e Maria differiscono di una lettera: si propongono tutti e due');
  assert.equal(cercaSimili('Bianco', rubrica, n).scelta, null, 'una parola corta diversa: non è lui');
  assert.equal(cercaSimili('Verdi', rubrica, n).alternative.length, 0);
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
  // Un Word letto dal file: una riga vuota dopo OGNI paragrafo (misurato sulle lettere vere: la terapia usciva di una
  // riga sola). I paragrafi vuoti lasciati apposta — quattro a capo — restano righe vuote vere.
  const word = ['Studio Inventato', 'Caro collega,', 'ho rivisto il paziente inventato per il controllo annuale.', 'FRCV:', 'ipertensione arteriosa', 'dislipidemia', 'Comorbidità: gonartrosi', 'Coronarografia 2019: nella norma', 'ECG: ritmo sinusale', 'Terapia:', 'FarmacoA 10 mg 1-0-0', 'FarmacoB 5 mg 0-0-1', 'FarmacoC 20 mg 0-0-1'].join('\n\n')
    + '\n\n' + ['In conclusione quadro stabile.', 'Cordiali saluti', 'Dr. med. Inventato'].join('\n\n');
  const w = partiDellaLettera(word);
  assert.equal(w.anamnesi, 'ho rivisto il paziente inventato per il controllo annuale.');
  assert.equal(w.frcv, 'FRCV:\nipertensione arteriosa\ndislipidemia');
  assert.equal(w.comorbidita, 'Comorbidità: gonartrosi', 'un\'etichetta che non è una parte chiude quella prima');
  assert.equal(w.ecg, 'ECG: ritmo sinusale');
  assert.equal(w.terapia, 'Terapia:\nFarmacoA 10 mg 1-0-0\nFarmacoB 5 mg 0-0-1\nFarmacoC 20 mg 0-0-1', 'tutta la terapia, non la prima riga');
  assert.equal(w.conclusione, 'In conclusione quadro stabile.');
  assert.ok(!corpoDellaLettera(word).includes('\n\n\n') && corpoDellaLettera(word).includes('FarmacoA 10 mg 1-0-0\nFarmacoB'), 'la lettera intera entra coi paragrafi come righe');
  // Un biglietto senza parti: resta solo il primo paragrafo come anamnesi.
  assert.deepEqual(Object.keys(partiDellaLettera('Caro collega,\n\nti ringrazio per l\'invio del paziente inventato, che vedrò volentieri il mese prossimo in studio.\n\nA presto')), ['anamnesi']);
});
