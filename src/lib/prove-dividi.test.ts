import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confronta, controllaPezzi, dataDelDocumento, inizio, leggiPaziente, proponi, tipoDelDocumento } from './dividi/tagli';

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
  assert.deepEqual(foglioDelCodice('770010'), { copertina: false, numero: 11, nome: '11_Documenti amministrativi' });
  assert.deepEqual(foglioDelCodice('770008'), { copertina: false, numero: 9, nome: '09_Laboratorio e analisi' });
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

test('dividi: il modello decide dove le regole non vedono, ma non scavalca i freni', () => {
  // Due appunti di giorni diversi, senza saluti né titoli: per le regole è un documento solo.
  const due = [appunti, `${appunti} seconda visita, 04.11.2024`, lettera2];
  assert.equal(componi(due, [], {}, 'Provadividi Anna').length, 1);
  const p = componi(due, [], { 2: { nuovo: true, data: '04.11.2024', titolo: 'Appunti' }, 3: { nuovo: true, data: null, titolo: 'Rapporto' } }, 'Provadividi Anna');
  assert.deepEqual(p.map((x) => [x.da, x.a, x.data]), [[1, 1, null], [2, 3, '2024-11-04']], 'il modello apre il secondo appunto; «pagina 2 di 2» resta un seguito anche se il modello dice di no');
  assert.equal(p[1].titolo, '2024.11.04 Provadividi Anna Appunti');
  assert.equal(p[1].sicurezza, 'media', 'regole e modello non sono d\'accordo: da guardare');
  // Il modello può anche unire: il titolo «Ecocardiogramma» in cima a un allegato dello stesso esame.
  const unito = componi([lettera1, eco], [], { 2: { nuovo: false, data: null, titolo: null } }, 'Provadividi Anna');
  assert.deepEqual(unito.map((x) => [x.da, x.a]), [[1, 2]]);
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
