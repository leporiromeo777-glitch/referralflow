import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Il righello si prova sul file che gira DAVVERO nel browser e nel server:
// public/prototipo/mse/*.js, caricati tali e quali, nello stesso ordine. Questi casi sono la
// verifica tecnica del fascicolo (docs/legale/dispositivo-in-house/piano-validazione.md):
// se uno cambia, cambia il dispositivo.
const contesto: any = {};
for (const m of ['mse/geometria.js', 'mse/misure.js']) {
  vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public', 'prototipo', m), 'utf-8'), contesto, { filename: m });
}
const M = contesto.RFMisura;
const G = contesto.RFMSE.geometria;

const ct = { tipo: 'pixel_spacing', righe: 512, colonne: 512, regioni: [], spacing: { dx_mm: 0.7, dy_mm: 0.7, origine: 'PixelSpacing', taratura: '' } };
const anisotropa = { ...ct, spacing: { dx_mm: 0.5, dy_mm: 0.25, origine: 'PixelSpacing', taratura: '' } };
const eco = {
  tipo: 'us_regioni', righe: 600, colonne: 800, spacing: null,
  regioni: [
    { x0: 100, y0: 50, x1: 700, y1: 550, dx_mm: 0.2, dy_mm: 0.2, tipo_dati: 1 },   // B-mode
    { x0: 0, y0: 560, x1: 800, y1: 600, dx_mm: 0.1, dy_mm: 0.1, tipo_dati: 1 },     // una seconda area
  ],
};

test('righello: TAC isotropa, orizzontale — 100 px × 0,7 mm = 70 mm', () => {
  const e = M.distanzaMm(ct, { x: 10, y: 10 }, { x: 110, y: 10 });
  assert.equal(e.stato, 'ok');
  assert.ok(Math.abs(e.mm - 70) < 1e-9);
});

test('righello: la diagonale usa il teorema di Pitagora sui millimetri, non sui pixel', () => {
  // 30 px in x × 0,5 = 15 mm ; 80 px in y × 0,25 = 20 mm → 25 mm
  const e = M.distanzaMm(anisotropa, { x: 0, y: 0 }, { x: 30, y: 80 });
  assert.equal(e.stato, 'ok');
  assert.ok(Math.abs(e.mm - 25) < 1e-9);
  // in pixel sarebbero 85,4: sbagliare l'anisotropia darebbe un altro numero
});

test('righello: la distanza non dipende dal verso', () => {
  const a = M.distanzaMm(anisotropa, { x: 3, y: 4 }, { x: 33, y: 84 });
  const b = M.distanzaMm(anisotropa, { x: 33, y: 84 }, { x: 3, y: 4 });
  assert.equal(a.mm, b.mm);
});

test('righello: ecografia — dentro la regione B-mode si misura con i suoi mm/px', () => {
  const e = M.distanzaMm(eco, { x: 200, y: 100 }, { x: 200, y: 300 });
  assert.equal(e.stato, 'ok');
  assert.ok(Math.abs(e.mm - 40) < 1e-9);
});

test('righello: ecografia — un punto fuori dalla regione calibrata non dà un numero', () => {
  assert.equal(M.distanzaMm(eco, { x: 50, y: 100 }, { x: 200, y: 300 }).stato, 'fuori_regione');
});

test('righello: ecografia — due regioni con calibrazioni diverse non si mescolano', () => {
  assert.equal(M.distanzaMm(eco, { x: 200, y: 100 }, { x: 200, y: 580 }).stato, 'regioni_diverse');
});

test('righello: i bordi della regione sono inclusi', () => {
  const e = M.distanzaMm(eco, { x: 100, y: 50 }, { x: 700, y: 50 });
  assert.equal(e.stato, 'ok');
  assert.ok(Math.abs(e.mm - 120) < 1e-9);
});

test('righello: senza calibrazione nel file NON si misura', () => {
  assert.equal(M.distanzaMm({ tipo: 'nessuna', righe: 10, colonne: 10, regioni: [], spacing: null }, { x: 0, y: 0 }, { x: 5, y: 5 }).stato, 'non_calibrata');
  assert.equal(M.distanzaMm(null, { x: 0, y: 0 }, { x: 5, y: 5 }).stato, 'non_calibrata');
});

test('righello: la spaziatura del rivelatore (radiografie) NON si usa per misurare', () => {
  const cr = { tipo: 'imager_pixel_spacing', righe: 10, colonne: 10, regioni: [], spacing: { dx_mm: 0.1, dy_mm: 0.1, origine: 'ImagerPixelSpacing', taratura: '' } };
  assert.equal(M.distanzaMm(cr, { x: 0, y: 0 }, { x: 5, y: 5 }).stato, 'rivelatore');
});

test('righello: punti fuori immagine, coincidenti o non numerici si rifiutano', () => {
  assert.equal(M.distanzaMm(ct, { x: -1, y: 0 }, { x: 5, y: 5 }).stato, 'fuori_immagine');
  assert.equal(M.distanzaMm(ct, { x: 0, y: 0 }, { x: 5, y: 600 }).stato, 'fuori_immagine');
  assert.equal(M.distanzaMm(ct, { x: 7, y: 7 }, { x: 7, y: 7 }).stato, 'punti_uguali');
  assert.equal(M.distanzaMm(ct, { x: NaN, y: 0 }, { x: 5, y: 5 }).stato, 'punti_non_validi');
  assert.equal(M.distanzaMm(ct, null, { x: 5, y: 5 }).stato, 'punti_non_validi');
});

test('righello: dallo schermo ai pixel nativi — l’immagine mostrata a metà larghezza raddoppia le coordinate', () => {
  const p = M.versoNativo({ x: 100, y: 40 }, 512 / 256);
  assert.equal(p.x, 200); assert.equal(p.y, 80);   // oggetto di un altro contesto vm: si confrontano i campi
  assert.equal(M.versoNativo({ x: 1, y: 1 }, 0), null);
});

test('righello: il formato è un decimale con la virgola', () => {
  assert.equal(M.formattaMm(12.34), '12,3 mm');
  assert.equal(M.formattaMm(12.35), '12,4 mm');
  assert.equal(M.formattaMm(7), '7,0 mm');
  assert.equal(M.formattaMm(NaN), '—');
});

test('righello: ogni stato di rifiuto ha una spiegazione per chi guarda', () => {
  for (const s of ['non_calibrata', 'rivelatore', 'fuori_regione', 'regioni_diverse', 'fuori_immagine', 'punti_uguali']) {
    assert.ok(M.motivo(s).length > 10, s);
  }
  assert.match(M.descriviCalibrazione(ct), /0,7 × 0,7 mm\/px/);
  assert.match(M.descriviCalibrazione(eco), /2 regioni/);
  assert.match(M.descriviCalibrazione(null), /non calibrata/);
});

test('geometria: la matrice del viewer si inverte — schermo → immagine ritrova il punto', () => {
  // zoom 2×, ruotato di 90°, spostato: un punto immagine mandato a schermo e riportato indietro
  const M = G.matriceViewer({ scalaX: 2, scalaY: 2, rotazioneGradi: 90, tx: 300, ty: 40 });
  const img = { x: 123.25, y: 45.5 };
  const sch = G.applica(M, img);
  const back = G.versoImmagine(sch, M);
  assert.ok(Math.abs(back.x - img.x) < 1e-9 && Math.abs(back.y - img.y) < 1e-9);
});

test('geometria: scala per asse diversa e composizione di due trasformazioni', () => {
  const A = G.matriceViewer({ scalaX: 0.5, scalaY: 0.25 });
  const B = G.matriceViewer({ tx: 10, ty: 20 });
  const AB = G.componi(B, A);              // prima A, poi B
  const p = G.applica(AB, { x: 100, y: 100 });
  assert.equal(p.x, 60); assert.equal(p.y, 45);
  const q = G.versoImmagine(p, AB);
  assert.ok(Math.abs(q.x - 100) < 1e-9 && Math.abs(q.y - 100) < 1e-9);
});

test('geometria: matrice degenere o non valida → null, mai un numero', () => {
  assert.equal(G.inversa([[0, 0, 0], [0, 0, 0], [0, 0, 1]]), null);
  assert.equal(G.versoImmagine({ x: 1, y: 1 }, [[1, 0], [0, 1]]), null);
  assert.equal(G.versoImmagine({ x: 1, y: 1 }, [[NaN, 0, 0], [0, 1, 0], [0, 0, 1]]), null);
  assert.equal(G.applica(G.identita(), { x: 'a', y: 1 }), null);
});

test('misure: ogni algoritmo dichiara nome, versione, unità ed equazione', () => {
  const A = contesto.RFMSE.misure.ALGORITMI;
  assert.equal(A.distanza.nome, 'distanza');
  assert.equal(A.distanza.versione, '1.0');
  assert.equal(A.distanza.unita, 'mm');
  assert.match(A.distanza.equazione, /sqrt/);
  const e = A.distanza.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  assert.equal(e.stato, 'ok');
  assert.deepEqual(JSON.parse(JSON.stringify(e.punti_fisici)), [{ x: 0, y: 0 }, { x: 70, y: 0 }]);
});

// Fase 5: regioni sovrapposte.
const ecoSovrapposte = {
  tipo: 'us_regioni', righe: 600, colonne: 800, spacing: null,
  regioni: [
    { indice: 0, x0: 0, y0: 0, x1: 799, y1: 599, dx_mm: 0.2, dy_mm: 0.2, tipo: 'tessuto', priorita_alta: false },     // B-mode, bassa priorità
    { indice: 1, x0: 200, y0: 100, x1: 600, y1: 400, dx_mm: 0.2, dy_mm: 0.2, tipo: 'color_flow', priorita_alta: true }, // box colore sopra, stessa scala
    { indice: 2, x0: 700, y0: 500, x1: 799, y1: 599, dx_mm: 0.05, dy_mm: 0.05, tipo: 'tessuto', priorita_alta: true },  // zoom con scala diversa
  ],
};

test('regioni: nel box colore vince la priorità alta dichiarata dall’apparecchio', () => {
  assert.equal(G.regioniPer(ecoSovrapposte, { x: 300, y: 200 }).length, 2);
  assert.equal(G.regionePer(ecoSovrapposte, { x: 300, y: 200 }).indice, 1);
});

test('regioni: sovrapposte con la STESSA scala → misura ok senza avviso', () => {
  const e = M.distanzaMm(ecoSovrapposte, { x: 300, y: 200 }, { x: 400, y: 200 });
  assert.equal(e.stato, 'ok'); assert.ok(Math.abs(e.mm - 20) < 1e-9); assert.deepEqual(JSON.parse(JSON.stringify(e.avvisi)), []);
});

test('regioni: sovrapposte con scala DIVERSA → misura con la prioritaria e avviso per il Gate', () => {
  const e = M.distanzaMm(ecoSovrapposte, { x: 720, y: 520 }, { x: 740, y: 520 });
  assert.equal(e.stato, 'ok'); assert.ok(Math.abs(e.mm - 1) < 1e-9);
  assert.deepEqual(JSON.parse(JSON.stringify(e.avvisi)), ['regioni_sovrapposte_discordanti']);   // array di un altro contesto vm
  assert.equal(e.regione, 2);
});

test('regioni: un punto nel box colore e uno fuori sono regioni diverse solo se la regione scelta cambia', () => {
  // dentro il box → regione 1; fuori → regione 0: due calibrazioni «diverse» per il righello, anche se uguali in mm
  assert.equal(M.distanzaMm(ecoSovrapposte, { x: 300, y: 200 }, { x: 100, y: 50 }).stato, 'regioni_diverse');
});

test('regioni: a parità di priorità vince il tessuto sul flusso, poi la prima del file', () => {
  const c = { tipo: 'us_regioni', righe: 10, colonne: 10, spacing: null, regioni: [
    { indice: 0, x0: 0, y0: 0, x1: 9, y1: 9, dx_mm: 1, dy_mm: 1, tipo: 'color_flow' },
    { indice: 1, x0: 0, y0: 0, x1: 9, y1: 9, dx_mm: 1, dy_mm: 1, tipo: 'tessuto' },
    { indice: 2, x0: 0, y0: 0, x1: 9, y1: 9, dx_mm: 1, dy_mm: 1, tipo: 'tessuto' },
  ] };
  assert.equal(G.regionePer(c, { x: 5, y: 5 }).indice, 1);
});
