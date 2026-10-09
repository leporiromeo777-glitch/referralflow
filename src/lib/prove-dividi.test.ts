import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confronta, controllaPezzi, dataDelDocumento, inizio, proponi, tipoDelDocumento } from './dividi/tagli';

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
    assert.deepEqual(ok.pezzi[0], { da: 1, a: 2, categoria: 'lettera', titolo: 'Lettera del 12', data: '2019-03-12' });   // i caratteri che un nome di file non può avere se ne vanno
    assert.deepEqual(ok.pezzi[1], { da: 4, a: 4, categoria: 'altro', titolo: 'Documento', data: null });                   // la pagina 3 resta fuori: va bene
  }
  assert.ok('errore' in controllaPezzi([{ da: 1, a: 3 }, { da: 3, a: 4 }], 8));
  assert.ok('errore' in controllaPezzi([{ da: 2, a: 9 }], 8));
  assert.ok('errore' in controllaPezzi([{ da: 3, a: 2 }], 8));
  assert.ok('errore' in controllaPezzi([], 8));
  assert.ok('errore' in controllaPezzi('pezzi', 8));
  assert.deepEqual(confronta([[1, 3], [4, 4], [5, 8]], [{ da: 1, a: 3 }, { da: 4, a: 5 }, { da: 6, a: 8 }]), { proposti: 3, scelti: 3, uguali: 1 });
});
