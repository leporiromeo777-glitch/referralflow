import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confronta, controllaPezzi, dataDelDocumento, formaDaRighe, formaDaTesto, inizio, leggiPaziente, proponi, tipoDelDocumento } from './dividi/tagli';

// Dividere una cartella completa (9.10.2026). Tutti i testi qui sono INVENTATI.
const lettera1 = ['Studio di Prova', 'Via Inventata 1 · 6900 Lugano', '', 'Lugano, 12 marzo 2019', '', 'Concerne: Signora Provadividi Anna, nata il 03.04.1950', '',
  'Egregio collega,', 'ho rivisto la paziente a margine per il controllo annuale. Riferisce di stare bene e non lamenta disturbi.', 'Pagina 1 di 2'].join('\n');
const lettera2 = ['prosegue la terapia in corso senza modifiche e la rivedrò fra dodici mesi.', '', 'Con i migliori saluti', 'Dr. med. Inventato', 'Pagina 2 di 2'].join('\n');
const retro = '   \n .';
const laboratorio = ['Laboratorio di Prova SA', 'Risultati di laboratorio', 'Prelievo del 02.02.2019', 'Paziente: Provadividi Anna, nata il 03.04.1950', 'Emoglobina 13,9 g/dl', 'Creatinina 71 umol/l', 'Colesterolo totale 4,8 mmol/l'].join('\n');
const eco = ['Ecocardiogramma transtoracico', 'Data: 15.05.2020', 'Ventricolo sinistro di dimensioni normali con funzione sistolica conservata.', 'Non valvulopatie di rilievo.'].join('\n');
const dimissione = ['Ospedale di Prova', 'Bellinzona, 3.11.2021', 'Lettera di dimissione', 'Gentile collega,', 'la paziente è stata ricoverata presso il nostro reparto per accertamenti.', 'Distinti saluti'].join('\n');
const seguito = ['e pertanto si consiglia un controllo ambulatoriale presso il curante entro quattro settimane dalla dimissione.', 'Terapia alla dimissione invariata.'].join('\n');

test('dividi: una cartella di otto pagine diventa quattro documenti, col tipo e la data giusti', () => {
  const p = proponi([lettera1, lettera2, retro, laboratorio, eco, dimissione, seguito, retro]);
  assert.deepEqual(p.map((x) => [x.da, x.a, x.categoria, x.data]), [
    [1, 3, 'lettera', '2019-03-12'],          // la lettera, la sua seconda pagina e il retro bianco
    [4, 4, 'laboratorio', '2019-02-02'],      // la data del prelievo, non quella di nascita
    [5, 5, 'ett', '2020-05-15'],
    [6, 8, 'dimissione', '2021-11-03'],       // «Luogo, data» in cima; la pagina dopo comincia in minuscolo: è il seguito
  ]);
  assert.equal(p[0].titolo, 'Lettera 12.03.2019');
  assert.equal(p[3].titolo, 'Lettera di dimissione 03.11.2021');
});

test('dividi: i segnali di inizio e di seguito', () => {
  assert.ok(inizio(lettera1, null).punti >= 5);
  assert.ok(inizio(lettera2, lettera1).punti < 3, '«pagina 2 di 2» è il seguito, anche se la pagina prima non chiude');
  assert.ok(inizio(retro, lettera2).vuota);
  // Dopo i saluti, una pagina con un titolo comincia un documento nuovo.
  assert.ok(inizio(eco, lettera2).punti >= 3);
  // Una pagina di solo testo, senza niente in cima, resta attaccata a quella prima.
  assert.ok(inizio('Il paziente riferisce dispnea da sforzo da circa due mesi, senza dolore toracico.\nEsame obiettivo nella norma.', eco).punti < 3);
});

test('dividi: la stessa testata ripetuta su più fogli non fa un documento per foglio', () => {
  const foglio = (n: number) => ['Laboratorio di Prova SA', 'Risultati di laboratorio', 'Prelievo del 02.02.2019', `Analita ${n}: 1,0`].join('\n');
  assert.deepEqual(proponi([foglio(1), foglio(2), foglio(3)]).map((x) => [x.da, x.a]), [[1, 3]]);
  // …ma con un'altra data è un altro esame.
  const altro = foglio(4).replace('02.02.2019', '09.09.2019');
  assert.deepEqual(proponi([foglio(1), foglio(2), altro]).map((x) => [x.da, x.a, x.data]), [[1, 2, '2019-02-02'], [3, 3, '2019-09-09']]);
});

test('dividi: tipo e data non si inventano', () => {
  assert.equal(tipoDelDocumento('Appunti vari senza intestazione\nriga due'), 'altro');
  assert.equal(dataDelDocumento('Paziente nato il 03.04.1950\nnessuna altra data'), null);
  assert.equal(dataDelDocumento('Basilea, den 5. Januar 2018\nSehr geehrter Herr Kollege'), '2018-01-05');
  assert.equal(dataDelDocumento('Visita del 31.02.2020'), null);
  // «ECG» nel corpo di una lettera non ne fa un ECG: conta solo ciò che sta in cima.
  assert.equal(tipoDelDocumento(['Lugano, 1.2.2020', 'Egregio collega,', 'riga', 'riga', 'riga', 'riga', 'riga', 'riga', 'riga', 'riga', 'riga', 'All’ECG ritmo sinusale.'].join('\n')), 'lettera');
});

test('dividi: un PDF senza testo è un pezzo solo, a bassa sicurezza (i tagli li mette la persona)', () => {
  const p = proponi(['', ' ', '\n', '']);
  assert.deepEqual(p.map((x) => [x.da, x.a, x.sicurezza]), [[1, 4, 'bassa']]);
  assert.deepEqual(proponi([]), []);
});

test('dividi: i pezzi confermati devono stare in ordine, senza sovrapporsi, dentro il documento', () => {
  const ok = controllaPezzi([{ da: 1, a: 2, categoria: 'lettera', titolo: 'Lettera: del/12', data: '12.03.2019' }, { da: 4, a: 4, categoria: 'inventata', titolo: '', data: '' }], 8);
  assert.ok('pezzi' in ok);
  if ('pezzi' in ok) {
    assert.deepEqual(ok.pezzi[0], { da: 1, a: 2, categoria: 'lettera', titolo: 'Lettera del 12', data: '2019-03-12', cartella: null });   // i caratteri che un nome di file non può avere se ne vanno
    assert.deepEqual(ok.pezzi[1], { da: 4, a: 4, categoria: 'altro', titolo: 'Documento', data: null, cartella: null });                   // la pagina 3 resta fuori: va bene
  }
  assert.ok('errore' in controllaPezzi([{ da: 1, a: 3 }, { da: 3, a: 4 }], 8));
  assert.ok('errore' in controllaPezzi([{ da: 2, a: 9 }], 8));
  assert.ok('errore' in controllaPezzi([{ da: 3, a: 2 }], 8));
  assert.ok('errore' in controllaPezzi([], 8));
  assert.ok('errore' in controllaPezzi('pezzi', 8));
  assert.deepEqual(confronta([[1, 3], [4, 4], [5, 8]], [{ da: 1, a: 3 }, { da: 4, a: 5 }, { da: 6, a: 8 }]), { proposti: 3, scelti: 3, uguali: 1 });
});

test('dividi: di chi è la cartella si legge dal PDF, e si propone soltanto', () => {
  // Il nome scritto più volte vince; la data di nascita è quella dopo «nata il», non quella della lettera.
  assert.deepEqual(leggiPaziente([lettera1, lettera2, retro, laboratorio, eco]), { nome: 'Provadividi Anna', nascita: '1950-04-03' });
  assert.deepEqual(leggiPaziente(['Betrifft: Herr Provadividi Hans, geb. 05.06.1948\nSehr geehrter Herr Kollege']), { nome: 'Provadividi Hans', nascita: '1948-06-05' });
  assert.deepEqual(leggiPaziente(['Paziente: PROVADIVIDI Maria Pia\nData di nascita: 1.2.1960\nEmoglobina 13']), { nome: 'PROVADIVIDI Maria Pia', nascita: '1960-02-01' });
  // Un oggetto che non è una persona, una scansione senza testo, una parola sola: niente proposta.
  assert.equal(leggiPaziente(['Oggetto: rinnovo della ricetta\nEgregio collega']), null);
  assert.equal(leggiPaziente(['', ' ']), null);
  assert.equal(leggiPaziente(['Paziente: Anna']), null);
  // Senza data di nascita il nome si propone lo stesso: la data la scrive chi crea la cartella.
  assert.deepEqual(leggiPaziente(['Concerne: Signor Provadividi Ugo\nEgregio collega']), { nome: 'Provadividi Ugo', nascita: null });
});

// ---- Sezioni dai fogli col codice a barre, giudizio del modello, nomi (9.10.2026). Testi e codici INVENTATI. ----
import { componi, estratti, foglioDelCodice, nomeDocumento, pagineDaChiedere, pulisciTitolo } from './dividi/sezioni';
const appunti = 'visto oggi sta bene PA 130/80 polso regolare continua terapia ricontrollo fra sei mesi telefonare per esito esami';
const holter = ['Holter ECG 24 ore', 'Registrazione del 18.10.2023', 'FC media 68/min, minima 49/min, massima 121/min', 'Extrasistoli ventricolari: 212, nessuna pausa significativa'].join('\n');
const cartella = [retro, retro, lettera1, lettera2, retro, eco, retro, dimissione, seguito, retro, appunti, holter];      // 1: copertina, 2: separatore, 7: separatore, 10: separatore
const sep = [{ pagina: 1, codice: 'PZ00012345' }, { pagina: 2, codice: '770000' }, { pagina: 7, codice: '770001' }, { pagina: 10, codice: '770004' }];

test('dividi: il codice del foglio dice la sezione (le ultime due cifre, da 00) o la copertina', () => {
  assert.deepEqual(foglioDelCodice('770000'), { copertina: false, numero: 1, nome: '01_Rapporti' });
  // I fogli della cartella di carta non sono numerati come le sottocartelle: dal 07 in poi l'ordine è un altro
  // (visto sui conteggi di una cartella vera, 13.10.2026).
  assert.deepEqual(foglioDelCodice('770005'), { copertina: false, numero: 6, nome: '06_Ciclo - Ergospiro' });
  assert.deepEqual(foglioDelCodice('770007'), { copertina: false, numero: 9, nome: '09_Laboratorio e analisi' });
  assert.deepEqual(foglioDelCodice('770008'), { copertina: false, numero: 11, nome: '11_Documenti amministrativi' });
  assert.deepEqual(foglioDelCodice('770009'), { copertina: false, numero: 8, nome: '08_Intervento cardiologico' });
  assert.deepEqual(foglioDelCodice('770010'), { copertina: false, numero: 10, nome: '10_Vari' });
  assert.deepEqual(foglioDelCodice('770011'), { copertina: false, numero: 12, nome: '12_Ricette' });
  assert.deepEqual(foglioDelCodice(' PZ 00012345 '), { copertina: true });
  assert.equal(foglioDelCodice('770017')!.copertina === false && (foglioDelCodice('770017') as any).nome, '18_Sezione 18', 'una sezione che non si conosce prende il suo numero, e il nome lo si corregge a mano');
  assert.equal(foglioDelCodice('ABC'), null);
  assert.equal(foglioDelCodice('12345'), null, 'un codice qualunque su un documento non è un separatore');
});

test('dividi: i fogli separatori aprono le sezioni e restano fuori; ogni documento prende la sua sottocartella e il suo nome', () => {
  const p = componi(cartella, sep, {}, 'Provadividi Anna');
  assert.deepEqual(p.map((x) => [x.da, x.a, x.foglio, x.cartella, x.escluso]), [
    [1, 1, 'copertina', null, true],
    [2, 2, 'separatore', '01_Rapporti', true],
    [3, 5, null, '01_Rapporti', false],                       // la lettera, la seconda pagina, il retro
    [6, 6, null, '01_Rapporti', false],                       // l'ecocardiogramma
    [7, 7, 'separatore', '02_Rapporti esterni - ricoveri', true],
    [8, 9, null, '02_Rapporti esterni - ricoveri', false],
    [10, 10, 'separatore', '05_Apparecchi', true],
    [11, 11, null, '05_Apparecchi', false],                   // dopo un separatore comincia per forza un documento
    [12, 12, null, '05_Apparecchi', false],
  ]);
  assert.equal(p[2].titolo, '2019.03.12 Provadividi Anna Lettera');
  assert.equal(p[3].titolo, '2020.05.15 Provadividi Anna Ecocardiogramma');
  assert.equal(p[5].titolo, '2021.11.03 Provadividi Anna Lettera di dimissione');
  assert.equal(p[7].titolo, 'Provadividi Anna Apparecchio', 'senza data e senza titolo: il nome della sezione, e la data non si inventa');
  assert.equal(p[8].titolo, '2023.10.18 Provadividi Anna Holter');
  // Il retro bianco di un foglio separatore resta fuori e non si mangia il documento dopo.
  const q = componi([retro, retro, lettera1], [{ pagina: 1, codice: '770000' }], {}, 'Provadividi Anna');
  assert.deepEqual(q.map((x) => [x.da, x.a, x.escluso]), [[1, 1, true], [2, 2, true], [3, 3, false]]);
  // Senza separatori e senza modello la proposta è quella delle regole.
  const semplice = componi([lettera1, lettera2, retro, laboratorio, eco, dimissione, seguito, retro], [], {}, 'Provadividi Anna');
  assert.deepEqual(semplice.map((x) => [x.da, x.a, x.categoria, x.data, x.cartella]), [[1, 3, 'lettera', '2019-03-12', null], [4, 4, 'laboratorio', '2019-02-02', null], [5, 5, 'ett', '2020-05-15', null], [6, 8, 'dimissione', '2021-11-03', null]]);
  // Una scansione non ancora letta: un pezzo per sezione, e lo si dice.
  const muta = componi([retro, retro, retro, retro], [{ pagina: 1, codice: '770000' }], {}, 'Provadividi Anna');
  assert.deepEqual(muta.map((x) => [x.da, x.a, x.sicurezza, x.escluso]), [[1, 1, 'alta', true], [2, 4, 'bassa', false]]);
});

const firmata = (giorno: string) => ['Studio di Prova', `Lugano, ${giorno}`, 'Egregio collega,', 'ho rivisto la paziente per il controllo. Riferisce di stare bene e non lamenta disturbi di rilievo.', 'Con i migliori saluti', 'Dr. med. Inventato'].join('\n');
const allegato = ['Emoglobina 13,9 g/dl', 'Creatinina 71 umol/l', 'Colesterolo LDL 1,8 mmol/l', 'Potassio 4,1 mmol/l, sodio 139 mmol/l'].join('\n');
const corpo = ['Diagnosi: cardiopatia ischemica stabile.', 'Anamnesi: da alcune settimane lieve affaticabilita salendo le scale, senza dolori toracici.', 'Esame obiettivo nella norma, pressione 130/80 mmHg.'].join('\n');
const fine = ['Valutazione: situazione stabile, terapia invariata, controllo fra sei mesi.', 'Con i migliori saluti', 'Dr. med. Inventato'].join('\n');

test('dividi: la forma della pagina — una lettera finisce col nome del medico, comincia col titolo o col blocco a destra', () => {
  assert.deepEqual(formaDaTesto(firmata('12 marzo 2019')), { titolo: false, destra: 0, chiusa: true });
  assert.equal(formaDaTesto(corpo).chiusa, false);
  assert.equal(formaDaTesto('Referto cardiologico\n\t\tLugano, 12 marzo 2019\n\t\tPaziente: Provadividi Anna\nAnamnesi: sta bene e non lamenta disturbi.').titolo, true);
  assert.equal(formaDaTesto('Referto cardiologico\n\t\tLugano, 12 marzo 2019\n\t\tPaziente: Provadividi Anna\nAnamnesi: sta bene e non lamenta disturbi.').destra, 2);
  assert.equal(formaDaTesto('Terapia alla dimissione invariata.\nControllo fra un mese.').titolo, false, 'una frase che contiene la parola non è un titolo');
  assert.equal(formaDaTesto('Decorso regolare.\nStudio di Prova · Dr. med. Inventato · Tel. 091 000 00 00 · www.prova.example').chiusa, false, 'il piè di pagina della carta intestata non è una firma');
  // Dalle posizioni vere delle righe (come le dà il PDF): in alto a destra, e in fondo.
  assert.deepEqual(formaDaRighe([{ t: 'Rapporto medico', x: 0.1, y: 0.12 }, { t: 'Lugano, 12.03.2019', x: 0.62, y: 0.08 }, { t: 'Paziente: Provadividi Anna', x: 0.62, y: 0.1 }, { t: 'Decorso regolare e senza complicazioni.', x: 0.1, y: 0.5 }, { t: 'Dr. med. Inventato', x: 0.1, y: 0.9 }]), { titolo: true, destra: 2, chiusa: true });
  // Il freno: la pagina prima non chiude e questa non ha niente di un inizio → è il seguito, anche se il modello dice «nuovo».
  const lettera = componi([corpo, fine], [], { 2: { nuovo: true, data: null, titolo: 'Rapporto' } }, 'Provadividi Anna');
  assert.deepEqual(lettera.map((x) => [x.da, x.a]), [[1, 2]], 'una lettera non si taglia in due');
  // La pagina prima chiude e questa ha un inizio → documento nuovo, anche se il modello dice «continua».
  const due = componi([firmata('12 marzo 2019'), firmata('15 maggio 2020')], [], { 2: { nuovo: false, data: null, titolo: null } }, 'Provadividi Anna');
  assert.deepEqual(due.map((x) => [x.da, x.a, x.sicurezza]), [[1, 1, 'alta'], [2, 2, 'media']]);
});

test('dividi: il modello decide nei casi incerti, ma non scavalca i freni né inventa date', () => {
  // Incerto: la lettera ha chiuso, e la pagina dopo non ha né titolo né data in testa (un allegato? un altro documento?). Decide il modello.
  assert.deepEqual(componi([firmata('12 marzo 2019'), allegato], [], {}, 'Provadividi Anna').map((x) => [x.da, x.a]), [[1, 2]], 'senza modello, i punti delle regole: resta unito');
  const p = componi([firmata('12 marzo 2019'), allegato, lettera2], [], { 2: { nuovo: true, data: null, titolo: 'Laboratorio' }, 3: { nuovo: true, data: null, titolo: 'Rapporto' } }, 'Provadividi Anna');
  assert.deepEqual(p.map((x) => [x.da, x.a, x.categoria, x.sicurezza]), [[1, 1, 'lettera', 'alta'], [2, 3, 'laboratorio', 'media']], 'il modello apre il laboratorio; «pagina 2 di 2» resta un seguito anche se il modello dice di no');
  assert.equal(p[1].titolo, 'Provadividi Anna Laboratorio');
  // Tracciati e appunti: un documento per giorno. Cambia la data → nuovo; stessa data o nessuna → continua.
  const giorni = componi([retro, `01.04.2022\n${appunti}`, appunti, `12.05.2022\n${appunti}`, `12.05.2022 seconda pagina\n${appunti}`], [{ pagina: 1, codice: '770002' }], {}, 'Provadividi Anna');
  assert.deepEqual(giorni.filter((x) => !x.foglio).map((x) => [x.da, x.a, x.data, x.titolo]), [[2, 3, '2022-04-01', '2022.04.01 Provadividi Anna Appunti'], [4, 5, '2022-05-12', '2022.05.12 Provadividi Anna Appunti']]);
  // Una data che nella pagina non è scritta non si accetta: resta quella letta dalle regole, o niente.
  const inventata = componi([appunti], [], { 1: { nuovo: true, data: '01.01.2020', titolo: 'Appunti' } }, 'Provadividi Anna');
  assert.equal(inventata[0].data, null);
  const scritta = componi([eco], [], { 1: { nuovo: true, data: '15.05.2020', titolo: 'EcoTT Provadividi Anna 15.05.2020' } }, 'Provadividi Anna');
  assert.equal(scritta[0].titolo, '2020.05.15 Provadividi Anna EcoTT');
  assert.equal(scritta[0].categoria, 'ett');
});

test('dividi: quali pagine si danno al modello, con che contesto, e come si ripulisce il titolo', () => {
  assert.deepEqual(pagineDaChiedere(cartella, sep), [3, 6, 8, 9, 11, 12], 'non i fogli separatori, non le pagine bianche, non «pagina 2 di 2»');
  const e = estratti(cartella, sep, 9);
  assert.equal(e.sezione, '02_Rapporti esterni - ricoveri');
  assert.ok(e.prima.includes('Distinti saluti') && e.questa.startsWith('e pertanto'));
  assert.equal(estratti(cartella, sep, 8).prima, '', 'la prima pagina di una sezione non ha un «prima»: quel che c\'è oltre il separatore è un\'altra sezione');
  assert.equal(pulisciTitolo('Rapporto Paziente Provadividi Anna del 12.03.2019', 'Provadividi Anna'), 'Rapporto del');
  assert.equal(pulisciTitolo('Dimissione: Ospedale / Prova', 'Provadividi Anna'), 'Dimissione Ospedale Prova');
  assert.equal(pulisciTitolo('Documento', 'Provadividi Anna'), '');
  assert.equal(nomeDocumento('2022-11-09', 'Provadividi Anna', 'ECO'), '2022.11.09 Provadividi Anna ECO');
  assert.equal(nomeDocumento(null, 'Provadividi Anna', 'Diario'), 'Provadividi Anna Diario');
  assert.deepEqual(leggiPaziente(['N. Paziente 12345\nCognome: Provadividi\nNome: Anna\n']), { nome: 'Provadividi Anna', nascita: null }, 'la copertina della cartella cartacea');
});

// ---- Il contenuto decide la sottocartella, e le pagine scritte a mano sono appunti (13.10.2026). Testi INVENTATI. ----
import { daGuardare, dataPossibile, genereDaTesto, genereDelDocumento, valoriDiLaboratorio } from './dividi/generi';
import { pagineDaGuardare } from './dividi/sezioni';

const LAB = ['Laboratorio di Prova SA', 'Rapporto di analisi · prelievo del 01.02.2021', 'Analisi Risultato Unità Riferimento', 'Emoglobina 142 g/l 120 - 160', 'Leucociti 6.4 G/l 4.0 - 10.0', 'Trombociti 231 G/l 150 - 400', 'Creatinina 78 µmol/l 45 - 84',
  'Potassio 4.2 mmol/l 3.5 - 5.1', 'Sodio 140 mmol/l 136 - 145', 'Colesterolo totale 4.9 mmol/l < 5.0', 'LDL 2.6 mmol/l < 3.0', 'HDL 1.5 mmol/l > 1.0', 'Trigliceridi 1.3 mmol/l < 1.7', 'TSH 2.1 mU/l 0.3 - 4.2', 'CRP 2 mg/l < 5'].join('\n');
const LETTERA_CON_VALORI = ['Studio Inventato', 'Città di Prova, 03.02.2021', 'Caro collega,', 'ho rivisto il paziente inventato per il controllo annuale; riferisce di stare bene, senza dispnea né dolori toracici, e assume regolarmente la terapia.',
  'Al laboratorio del 01.02.2021: emoglobina 142 g/l, creatinina 78 µmol/l, potassio 4.2 mmol/l, sodio 140 mmol/l, colesterolo 4.9 mmol/l, LDL 2.6 mmol/l, HDL 1.5 mmol/l, trigliceridi 1.3 mmol/l, TSH 2.1 mU/l.',
  'In conclusione quadro stabile, proseguire la terapia in corso.', 'Cordiali saluti', 'Dr. med. Inventato Finto'].join('\n');
const PROCURA = ['PROCURA', 'Il sottoscritto Prova Mario, nato il 01.01.1950, autorizza lo Studio Inventato a richiedere la documentazione medica che lo riguarda presso altri medici e ospedali.', 'Città di Prova, 10.05.2020', 'Firma: ____________'].join('\n');
const DISPENSA = ['Dispensa dal segreto medico', 'Io sottoscritta Prova Anna dispenso il mio medico dal segreto professionale nei confronti della mia assicurazione.', 'Città di Prova, 11.05.2020'].join('\n');
const PIANO = ['Piano di medicazione', 'Prova Mario, 01.01.1950 · aggiornato il 12.03.2021', 'FarmacoA 10 mg cpr 1-0-0', 'FarmacoB 5 mg cpr 0-0-1', 'FarmacoC 20 mg cpr 0-0-1'].join('\n');
const SEGUE = 'la terapia in corso prosegue invariata e il paziente verrà rivisto fra dodici mesi, salvo novità; nel frattempo resta a disposizione il medico curante per ogni necessità clinica.'.repeat(4);

test('dividi, contenuto: una tabella di valori è laboratorio, una lettera che li riporta no; procure e dispense sono amministrative; un piano di medicazione è una ricetta', () => {
  assert.equal(genereDaTesto(LAB), 'laboratorio');
  assert.ok(valoriDiLaboratorio(LAB).unita >= 10 && valoriDiLaboratorio(LAB).analisi >= 10);
  assert.equal(genereDaTesto(LETTERA_CON_VALORI), null, 'ha un saluto: è una lettera, anche se elenca nove valori');
  assert.equal(genereDaTesto(PROCURA), 'amministrativo');
  assert.equal(genereDaTesto(DISPENSA), 'amministrativo');
  assert.equal(genereDaTesto(PIANO), 'ricetta');
  assert.equal(genereDaTesto(['Città di Prova, 03.02.2021', 'Caro collega,', 'ti mando la ricetta e ti chiedo la procura del paziente.'].join('\n') + SEGUE), null, 'le stesse parole dentro una lettera non contano: vale il titolo in cima');
  assert.equal(genereDaTesto('ECG a riposo: ritmo sinusale 64/min, PQ 160 ms, QRS 90 ms, QTc 410 ms, asse normale, nessuna alterazione della ripolarizzazione.'), null);
  assert.equal(genereDelDocumento([LAB, 'Commento: valori nella norma per età e sesso, nessuna indicazione a ulteriori accertamenti.']), 'laboratorio', 'lo dice la prima pagina');
  assert.equal(genereDelDocumento([LETTERA_CON_VALORI, LAB, SEGUE]), null, 'una lettera con una pagina di valori in mezzo resta una lettera');
  assert.equal(genereDelDocumento(['', '   ']), null);
});

test('dividi, guardare: si guardano le pagine con poco testo o testo sporco, non le bianche né quelle fitte di stampa; la data letta a occhio deve essere possibile', () => {
  const fitta = 'Il paziente riferisce di stare bene e di assumere regolarmente la terapia prescritta senza effetti collaterali. '.repeat(12);
  assert.equal(daGuardare(fitta, 4), false, 'una pagina di lettera stampata non si guarda');
  assert.equal(daGuardare('Cognome: ______ Nome: ______ PA: __/__ FC: __', 2.5), true, 'un modulo sì');
  assert.equal(daGuardare('', 0.1), false, 'una pagina bianca no');
  assert.equal(daGuardare('', 2.2), true, 'senza testo ma con inchiostro: può essere scritta a penna');
  assert.equal(daGuardare('', null), false, 'senza sapere quanto inchiostro c\'è, una pagina senza testo non si guarda');
  assert.equal(daGuardare('xq7 l1 ;; a8 zz 0o ' .repeat(60), 3), true, 'testo sporco: l\'OCR ha inciampato');
  assert.deepEqual(pagineDaGuardare(['', fitta, '', 'Cognome: __ Nome: __'], [{ pagina: 1, codice: '770002' }], [3, 4, 2, 2]), [3, 4], 'non il foglio separatore, non la pagina fitta');
  assert.deepEqual(pagineDaGuardare(['', 'Cognome: __', '', 'ECG 25 mm/s', 'Cognome: __'], [{ pagina: 1, codice: '770002' }, { pagina: 3, codice: '770003' }], [3, 2, 3, 6, 2]), [2], 'i tracciati non si guardano');
  assert.equal(dataPossibile('12.3.2021', new Date('2026-10-13')), '2021-03-12');
  assert.equal(dataPossibile('12.03.2031', new Date('2026-10-13')), null, 'nel futuro no');
  assert.equal(dataPossibile('31.02.2021', new Date('2026-10-13')), null);
  assert.equal(dataPossibile('3.4.1962', new Date('2026-10-13')), null, 'troppo indietro: sembra una data di nascita');
  assert.equal(dataPossibile(null), null);
});

test('dividi, appunti a mano: le pagine scritte a mano vanno in «Appunti», un documento per giorno, in qualunque sezione stiano', () => {
  const lettera = ['Studio Inventato', 'Città di Prova, 03.02.2021', 'Caro collega,', SEGUE, 'Cordiali saluti', 'Dr. med. Inventato Finto'].join('\n');
  // 1 separatore Rapporti · 2 lettera · 3 a mano (12.3.2021, senza testo) · 4 a mano (stessa data) · 5 retro bianco · 6 a mano (altro giorno) · 7 lettera · 8 separatore Appunti · 9 a mano senza data
  const testi = ['', lettera, '', 'PA FC kg', '', '', lettera.replace('03.02.2021', '10.06.2021'), '', ''];
  const sep = [{ pagina: 1, codice: '770000' }, { pagina: 8, codice: '770002' }];
  const viste = { 3: { mano: true, data: '12.3.2021' }, 4: { mano: true, data: '12.03.2021' }, 6: { mano: true, data: '20.04.2021' }, 7: { mano: false, data: null }, 9: { mano: true, data: null } };
  const p = componi(testi, sep, {}, 'Prova Mario', undefined, viste).filter((x) => !x.foglio);
  assert.deepEqual(p.map((x) => [x.da, x.a, x.cartella, x.data]), [
    [2, 2, '01_Rapporti', '2021-02-03'], [3, 5, '03_Appunti', '2021-03-12'], [6, 6, '03_Appunti', '2021-04-20'], [7, 7, '01_Rapporti', '2021-06-10'], [9, 9, '03_Appunti', null]]);
  assert.equal(p[1].titolo, '2021.03.12 Prova Mario Appunti');
  assert.ok(p[1].segnali.includes('scritta a mano') && p[1].segnali.includes('era in «01_Rapporti»') && p[1].sicurezza === 'media', 'spostata: da guardare, e si dice da dove viene');
  assert.ok(!p[4].segnali.some((x) => x.startsWith('era in')), 'negli Appunti c\'era già');
  assert.ok(p[1].segnali.includes('data letta guardando la pagina'), 'una data che il testo non ha viene dalla scrittura: si dice');
  // Una procura compilata a penna resta un documento amministrativo: per il titolo, o perché sta fra gli amministrativi.
  const penna = componi(['', PROCURA, '', 'Cognome: Prova'], [{ pagina: 1, codice: '770010' }, { pagina: 3, codice: '770008' }], {}, 'Prova Mario', undefined, { 2: { mano: true, data: null }, 4: { mano: true, data: null } }).filter((x) => !x.foglio);
  assert.deepEqual(penna.map((x) => [x.da, x.cartella, x.segnali.includes('scritta a mano')]), [[2, '11_Documenti amministrativi', false], [4, '11_Documenti amministrativi', false]]);
  // Senza aver guardato le pagine, quelle senza testo restano attaccate al documento prima, come sempre.
  assert.deepEqual(componi(testi, sep, {}, 'Prova Mario').filter((x) => !x.foglio && !x.escluso).map((x) => [x.da, x.a]).slice(0, 2), [[2, 6], [7, 7]]);
});

test('dividi, contenuto: il documento va nella sottocartella del suo contenuto, e si dice da dove viene', () => {
  // 1 separatore Intervento (codice 09) · 2-3 laboratorio · 4 procura · 5 piano di medicazione · 6 referto qualunque
  const referto = ['Rapporto operatorio', 'Coronarografia del 05.05.2020', 'Accesso radiale destro, coronarie senza stenosi significative.', 'Dr. med. Inventato Finto'].join('\n');
  const testi = ['', LAB, LAB.replace('01.02.2021', '01.02.2021').replace('Laboratorio di Prova SA', 'Laboratorio di Prova SA · pagina 2 di 2'), PROCURA, PIANO, referto];
  const risposte = { 2: { nuovo: true, data: '01.02.2021', titolo: 'Laboratorio' }, 3: { nuovo: false, data: null, titolo: null }, 4: { nuovo: true, data: '10.05.2020', titolo: 'Procura' }, 5: { nuovo: true, data: '12.03.2021', titolo: null }, 6: { nuovo: true, data: '05.05.2020', titolo: 'Coronarografia' } };
  const p = componi(testi, [{ pagina: 1, codice: '770009' }], risposte, 'Prova Mario').filter((x) => !x.foglio);
  assert.deepEqual(p.map((x) => [x.da, x.a, x.cartella]), [[2, 3, '09_Laboratorio e analisi'], [4, 4, '11_Documenti amministrativi'], [5, 5, '12_Ricette'], [6, 6, '08_Intervento cardiologico']]);
  assert.equal(p[0].categoria, 'laboratorio'); assert.equal(p[0].titolo, '2021.02.01 Prova Mario Laboratorio');
  assert.equal(p[1].titolo, '2020.05.10 Prova Mario Procura', 'il nome detto dal modello resta');
  assert.equal(p[2].titolo, '2021.03.12 Prova Mario Piano di medicazione', 'senza un nome suo prende quello del genere');
  assert.ok(p[0].segnali.includes('era in «08_Intervento cardiologico»') && p[0].sicurezza === 'media');
  assert.ok(!p[3].segnali.some((x) => x.startsWith('era in')), 'ciò che non è di un altro genere resta dov\'è');
});

// ---- Di chi è la cartella, dal nome del file (15.10.2026). Nomi e date INVENTATI. ----
import { chiDalNomeFile, decidiChi } from './dividi/chi';
test('dividi, di chi è: dal nome del file «Cognome Nome data di nascita» — usa, crea, o chiede quando è incerto', () => {
  const oggi = new Date(Date.UTC(2026, 9, 15));
  const f = (n: string) => chiDalNomeFile(n, oggi);
  assert.deepEqual(f('Provadividi Anna 03.04.1950.pdf'), { cognome: 'Provadividi', nome: 'Anna', nascita: '1950-04-03', certo: true, perche: undefined });
  for (const n of ['provadividi_anna_03-04-1950.pdf', 'Provadividi Anna 1950-04-03 cartella.pdf', 'Provadividi Anna 03041950.pdf', 'Provadividi, Anna, 3.4.1950.pdf'])
    assert.equal(JSON.stringify([f(n)?.cognome, f(n)?.nome, f(n)?.nascita, f(n)?.certo]), '["Provadividi","Anna","1950-04-03",true]', n);
  assert.equal(f('DE PROVA Anna Maria 03.04.1950.pdf')?.cognome, 'De Prova');
  assert.equal(f('DE PROVA Anna Maria 03.04.1950.pdf')?.certo, true, 'il cognome in maiuscolo dice dove finisce');
  assert.equal(f('De Prova Anna 03.04.1950.pdf')?.certo, false, 'tre parole senza maiuscole: non si sa dove finisce il cognome');
  assert.equal(f('Provadividi Anna 03.04.50.pdf')?.certo, false, 'anno con due cifre');
  assert.equal(f('Provadividi Anna 12.03.2024.pdf')?.certo, false, 'una data recente è forse quella dell’esame');
  for (const n of ['Cartella completa.pdf', 'Scansione 2026-10-15.pdf', 'Provadividi 03.04.1950.pdf', 'Provadividi Anna 31.02.1950.pdf', '2026 Provadividi Anna.pdf'])
    assert.equal(f(n), null, n);

  const paz = [
    { id: 'a', cognome: 'Provadividi', nome: 'Anna', data_nascita: '1950-04-03' },
    { id: 'b', cognome: 'Inventato', nome: 'Bruno', data_nascita: '1960-01-01' },
    { id: 'c', cognome: 'Inventato', nome: 'Bruna', data_nascita: '1971-07-07' },
    { id: 'd', cognome: 'Senzadata', nome: 'Carla', data_nascita: null },
  ];
  const decidi = (n: string, testo: { nome: string; nascita: string | null } | null = null) => decidiChi(f(n), testo, paz);
  assert.deepEqual([decidi('Provadividi Anna 03.04.1950.pdf').cosa, decidi('Provadividi Anna 03.04.1950.pdf').id], ['usa', 'a']);
  assert.equal(decidi('Anna Provadividi 03.04.1950.pdf').id, 'a', 'nome e cognome scambiati: è la stessa persona');
  assert.equal(decidi('Provadividi Anna 03.04.1950.pdf', { nome: 'Provadividi Anna', nascita: '1950-04-03' }).cosa, 'usa', 'file e testo d’accordo');
  assert.equal(decidi('Nuovissimo Dario 05.06.1955.pdf').cosa, 'crea', 'nessuno così: si crea');
  assert.equal(decidi('De Prova Anna 03.04.1950.pdf').cosa, 'chiedi', 'incerto: non si crea');
  assert.equal(decidi('Provadividi Anna 04.03.1950.pdf').cosa, 'chiedi', 'stesso nome con un’altra data: forse un errore di battitura');
  assert.equal(decidi('Provadividi Anna 04.03.1950.pdf').simile, 'a', 'e la pagina offre la sua cartella');
  assert.equal(decidi('Inventato Bruna 01.01.1960.pdf').cosa, 'chiedi', 'stessa data e nome quasi uguale: doppione?');
  assert.equal(decidi('Senzadata Carla 02.02.1952.pdf').cosa, 'chiedi', 'c’è già qualcuno con questo nome senza data');
  const contro = decidi('Provadividi Anna 03.04.1950.pdf', { nome: 'Inventato Bruno', nascita: '1960-01-01' });
  assert.equal(contro.cosa, 'chiedi', 'il nome del file e il testo dicono due persone diverse');
  assert.match(contro.motivo ?? '', /Controlla di chi è/);
  // Solo dal testo: si usa una cartella che combacia, ma non se ne crea una nuova.
  assert.equal(decidiChi(null, { nome: 'Provadividi Anna', nascita: '1950-04-03' }, paz).cosa, 'usa');
  assert.equal(decidiChi(null, { nome: 'Nuovissimo Dario', nascita: '1955-06-05' }, paz).cosa, 'chiedi');
  assert.equal(decidiChi(null, null, paz).cosa, 'chiedi');
});

// La cartella del paziente: nomi di sottocartelle e documenti (20.10.2026).
import { nomeCartella, rinomina, titoloMostrato } from './cartella-nomi';
test('cartella del paziente: sottocartelle e nomi dei documenti', () => {
  assert.equal(nomeCartella('  05_Apparecchi '), '05_Apparecchi');
  assert.equal(nomeCartella('../a/b: c'), 'a b c');
  assert.equal(nomeCartella('   '), null);
  assert.equal(nomeCartella(null), null);
  assert.equal(nomeCartella('x'.repeat(200))!.length, 80);
  // si vede la descrizione scritta al caricamento; se non c'è, o è quella di una divisione, il nome del file
  assert.equal(titoloMostrato({ filename: 'scan001.pdf', nota: 'ECG 2019–2023' }), 'ECG 2019–2023');
  assert.equal(titoloMostrato({ filename: '2023.10.18 Provanome Anna Holter.pdf', nota: 'dalla cartella completa, pagine 3–5' }), '2023.10.18 Provanome Anna Holter');
  assert.equal(titoloMostrato({ filename: 'cartella.pdf', nota: 'cartella completa, da dividere' }), 'cartella');
  assert.equal(titoloMostrato({ filename: 'lettera.docx', nota: null }), 'lettera');
  // rinominare cambia ciò che si vede
  assert.deepEqual(rinomina({ filename: 'scan001.pdf', nota: 'ECG 2019–2023' }, 'ECG 2019–2024'), { nota: 'ECG 2019–2024' });
  assert.deepEqual(rinomina({ filename: 'a.pdf', nota: 'dalla cartella completa, pagina 2' }, '2024.03.12 Holter'), { filename: '2024.03.12 Holter.pdf' });
  assert.deepEqual(rinomina({ filename: 'a.pdf', nota: null }, 'nuovo.pdf'), { filename: 'nuovo.pdf' });
  assert.deepEqual(rinomina({ filename: 'a.pdf', nota: null }, 'con/barra'), { filename: 'con barra.pdf' });
  assert.equal(rinomina({ filename: 'a.pdf', nota: null }, '   '), null);
});
