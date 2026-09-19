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
for (const m of ['mse/geometria.js', 'mse/misure.js', 'mse/validazione.js']) {
  vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public', 'prototipo', m), 'utf-8'), contesto, { filename: m });
}
const M = contesto.RFMisura;
const G = contesto.RFMSE.geometria;
const V = contesto.RFMSE.validazione;
const j = (x: unknown) => JSON.parse(JSON.stringify(x));   // oggetti di un altro contesto vm

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

// ── Fase 7: il Validation Gate, una prova per riga della tabella ──
const geoCt = { versione: 1, identita: { modalita: 'CT', frame_totali: 1 }, pixel: { righe: 512, colonne: 512 }, spaziatura: { fonte: 'PixelSpacing', dx_mm: 0.7, dy_mm: 0.7, per_frame: false, calibrazione_tipo: null }, regioni_us: [], spazio: null, derivata: false, image_type: ['ORIGINAL', 'PRIMARY'], avvisi_lettura: [] };

test('gate: TAC con PixelSpacing → VALIDATED, nessun motivo', () => {
  const s = V.statoImmagine({ cal: ct, geometria: geoCt, frame: 0, frameTotali: 1 });
  assert.equal(s.stato, 'VALIDATED'); assert.deepEqual(j(s.motivi), []); assert.deepEqual(j(s.avvisi), []);
});

test('gate: senza calibrazione → NOT_MEASURABLE calibrazione_assente', () => {
  const s = V.statoImmagine({ cal: { tipo: 'nessuna', righe: 10, colonne: 10, regioni: [], spacing: null } });
  assert.equal(s.stato, 'NOT_MEASURABLE'); assert.ok(j(s.motivi).includes('calibrazione_assente'));
  assert.match(s.testi[0], /non verificabile/);
});

test('gate: niente calibrazione né geometria → geometria_assente', () => {
  assert.ok(j(V.statoImmagine({ cal: null, geometria: null }).motivi).includes('geometria_assente'));
});

test('gate: radiografia (rivelatore) → NOT_MEASURABLE rivelatore', () => {
  const cr = { tipo: 'imager_pixel_spacing', righe: 10, colonne: 10, regioni: [], spacing: { dx_mm: 0.1, dy_mm: 0.1 } };
  assert.ok(j(V.statoImmagine({ cal: cr }).motivi).includes('rivelatore'));
});

test('gate: modalità non validata (CR, OT) → blocca; CT/MR/US no', () => {
  assert.ok(j(V.statoImmagine({ cal: ct, geometria: { ...geoCt, identita: { modalita: 'CR', frame_totali: 1 } } }).motivi).includes('modalita_non_validata'));
  assert.ok(!j(V.statoImmagine({ cal: ct, geometria: { ...geoCt, identita: { modalita: 'MR', frame_totali: 1 } } }).motivi).includes('modalita_non_validata'));
});

test('gate: fotogramma inesistente → fotogramma_non_valido', () => {
  assert.ok(j(V.statoImmagine({ cal: ct, frame: 5, frameTotali: 3 }).motivi).includes('fotogramma_non_valido'));
  assert.ok(!j(V.statoImmagine({ cal: ct, frame: 2, frameTotali: 3 }).motivi).includes('fotogramma_non_valido'));
});

test('gate: spaziatura per fotogramma non uniforme → spacing_per_frame', () => {
  const g = { ...geoCt, spaziatura: { ...geoCt.spaziatura, per_frame: true, dx_mm: null, dy_mm: null } };
  assert.ok(j(V.statoImmagine({ cal: { tipo: 'nessuna', righe: 512, colonne: 512, regioni: [], spacing: null }, geometria: g }).motivi).includes('spacing_per_frame'));
});

test('gate: calibrazione con zero → calibrazione_non_valida', () => {
  assert.ok(j(V.statoImmagine({ cal: { ...ct, spacing: { dx_mm: 0, dy_mm: 0.7 } } }).motivi).includes('calibrazione_non_valida'));
  assert.ok(j(V.statoImmagine({ cal: { ...eco, regioni: [{ ...eco.regioni[0], dy_mm: -1 }] } }).motivi).includes('calibrazione_non_valida'));
});

test('gate: immagine derivata → CAUTION, ma BLOCCATA finché il caso non è nella lista dei validati', () => {
  const g = { ...geoCt, derivata: true, avvisi_lettura: ['immagine_derivata'] };
  const bloccata = V.statoImmagine({ cal: ct, geometria: g, cautionValidati: [] });
  assert.equal(bloccata.stato, 'NOT_MEASURABLE');
  assert.ok(j(bloccata.motivi).includes('caution_non_validata:immagine_derivata'));
  const ammessa = V.statoImmagine({ cal: ct, geometria: g, cautionValidati: ['immagine_derivata'] });
  assert.equal(ammessa.stato, 'CAUTION'); assert.deepEqual(j(ammessa.avvisi), ['immagine_derivata']); assert.deepEqual(j(ammessa.motivi), []);
});

test('gate: PixelSpacing GEOMETRY, pixel non quadrati, due calibrazioni discordanti → avvisi con nome', () => {
  const g = { ...geoCt, spaziatura: { ...geoCt.spaziatura, calibrazione_tipo: 'GEOMETRY' }, avvisi_lettura: ['pixel_non_quadrati', 'pixel_spacing_e_regioni_discordanti'] };
  const s = V.statoImmagine({ cal: ct, geometria: g, cautionValidati: ['calibrazione_geometry', 'pixel_non_quadrati', 'pixel_spacing_e_regioni_discordanti'] });
  assert.equal(s.stato, 'CAUTION');
  assert.deepEqual(j(s.avvisi).sort(), ['calibrazione_geometry', 'pixel_non_quadrati', 'pixel_spacing_e_regioni_discordanti']);
  for (const a of s.avvisi) assert.ok(V.testo(a).length > 10);
});

test('gate: valuta — misura VALIDATED con valore, unità, punti fisici, versioni', () => {
  const e = V.valuta({ cal: ct, geometria: geoCt, frame: 0, frameTotali: 1, punti: [{ x: 10, y: 10 }, { x: 110, y: 10 }], algoritmo: 'distanza' });
  assert.equal(e.stato, 'VALIDATED'); assert.ok(Math.abs(e.valore - 70) < 1e-9); assert.equal(e.unita, 'mm');
  assert.equal(e.valore_mostrato, '70,0 mm'); assert.equal(e.algoritmo, 'distanza'); assert.equal(e.versione_algoritmo, '1.0'); assert.equal(e.versione_gate, '1.0');
  assert.deepEqual(j(e.punti_fisici), [{ x: 7, y: 7 }, { x: 77, y: 7 }]);
});

test('gate: valuta — i rifiuti del calcolo diventano motivi, senza valore', () => {
  const e = V.valuta({ cal: eco, punti: [{ x: 50, y: 100 }, { x: 200, y: 300 }] });
  assert.equal(e.stato, 'NOT_MEASURABLE'); assert.equal(e.valore, null); assert.ok(j(e.motivi).includes('fuori_regione'));
  assert.ok(j(V.valuta({ cal: ct, punti: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }).motivi).includes('punti_uguali'));
  assert.ok(j(V.valuta({ cal: ct, punti: [{ x: 1, y: 1 }, { x: 2, y: 2 }], algoritmo: 'cubo' }).motivi).includes('algoritmo_sconosciuto'));
});

test('gate: valuta — regioni sovrapposte discordanti: CAUTION solo se validato, altrimenti blocca', () => {
  const punti = [{ x: 720, y: 520 }, { x: 740, y: 520 }];
  const b = V.valuta({ cal: ecoSovrapposte, punti });
  assert.equal(b.stato, 'NOT_MEASURABLE'); assert.ok(j(b.motivi).includes('caution_non_validata:regioni_sovrapposte_discordanti'));
  const c = V.valuta({ cal: ecoSovrapposte, punti, cautionValidati: ['regioni_sovrapposte_discordanti'] });
  assert.equal(c.stato, 'CAUTION'); assert.ok(Math.abs(c.valore - 1) < 1e-9);
});

test('gate: ogni codice ha un testo e i motivi con parametro lo ritrovano', () => {
  for (const k of Object.keys(V.TESTI)) assert.ok(V.testo(k).length > 10, k);
  assert.equal(V.testo('caution_non_validata:immagine_derivata'), V.TESTI.caution_non_validata);
  assert.match(V.testo('qualcosa_di_nuovo'), /non prevista/);
});

// ── Fase 7: invarianza — la misura non dipende da come il viewer mostra l’immagine ──
test('invarianza: zoom, pan, rotazione, DPR e dimensione della finestra non cambiano la misura', () => {
  const pImg = [{ x: 123.4, y: 45.6 }, { x: 400.25, y: 380.75 }];
  const base = V.valuta({ cal: ct, punti: pImg }).valore;
  let casi = 0;
  for (const scala of [0.25, 0.5, 1, 1.37, 2, 4, 8]) {
    for (const rot of [0, 90, 180, 270, 37.5, -12]) {
      for (const dpr of [1, 1.5, 2, 3]) {
        for (const [tx, ty] of [[0, 0], [300, 40], [-120.5, 999]]) {
          // il viewer manda a schermo con la sua matrice (scala × DPR, rotazione, pan)
          const M = G.matriceViewer({ scalaX: scala * dpr, scalaY: scala * dpr, rotazioneGradi: rot, tx, ty });
          const schermo = pImg.map((p: any) => G.applica(M, p));
          const indietro = schermo.map((p: any) => G.versoImmagine(p, M));
          const v = V.valuta({ cal: ct, punti: indietro }).valore;
          assert.ok(Math.abs(v - base) <= 1e-12 * base, `scala ${scala} rot ${rot} dpr ${dpr} pan ${tx},${ty}: ${v} vs ${base}`);
          casi++;
        }
      }
    }
  }
  assert.equal(casi, 7 * 6 * 4 * 3);
});

test('invarianza: scala diversa per asse nel viewer (finestra schiacciata) — la misura resta la stessa', () => {
  const pImg = [{ x: 200, y: 100 }, { x: 200, y: 300 }];
  const base = V.valuta({ cal: eco, punti: pImg }).valore;
  const M = G.matriceViewer({ scalaX: 0.31, scalaY: 0.77, rotazioneGradi: 0, tx: 5, ty: 7 });
  const indietro = pImg.map((p: any) => G.versoImmagine(G.applica(M, p), M));
  assert.ok(Math.abs(V.valuta({ cal: eco, punti: indietro }).valore - base) <= 1e-12 * base);
});

test('invarianza: la vecchia scala uniforme (versoNativo) e la matrice danno lo stesso punto', () => {
  const scala = 800 / 347.2;
  const a = G.versoNativo({ x: 100.5, y: 40.25 }, scala);
  const b = G.versoImmagine({ x: 100.5, y: 40.25 }, G.matriceViewer({ scalaX: 1 / scala }));
  assert.ok(Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12);
});

// ── Fase 3: gli altri strumenti, con valori noti ──
const A = contesto.RFMSE.misure.ALGORITMI;
const FV = contesto.RFMSE.misure.formattaValore;
const quasi = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('polilinea: somma dei segmenti in mm (anisotropia rispettata)', () => {
  // 30 px x (0,5) = 15 ; 80 px y (0,25) = 20 → 25 ; poi 40 px x = 20 → 45
  const e = A.polilinea.calcola(anisotropa, [{ x: 0, y: 0 }, { x: 30, y: 80 }, { x: 70, y: 80 }]);
  assert.equal(e.stato, 'ok'); assert.ok(quasi(e.valore, 45)); assert.equal(e.extra.segmenti, 2); assert.equal(e.unita, 'mm');
  assert.equal(A.polilinea.calcola(anisotropa, [{ x: 0, y: 0 }]).stato, 'punti_non_validi');
  assert.equal(A.polilinea.calcola(anisotropa, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }]).stato, 'punti_uguali');
});

test('angolo: 90° sui millimetri, non sui pixel', () => {
  // in pixel anisotropi (0,5 × 0,25): A=(100,0) V=(0,0) B=(0,100) → in mm (50,0) e (0,25): ancora 90°
  const e = A.angolo.calcola(anisotropa, [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }]);
  assert.equal(e.stato, 'ok'); assert.ok(quasi(e.valore, 90)); assert.equal(e.unita, '°');
  // 45° in pixel isotropi
  assert.ok(quasi(A.angolo.calcola(ct, [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 100 }]).valore, 45));
  // ma con pixel anisotropi 0,5 × 0,25 lo stesso disegno vale atan(25/50) = 26,565°
  assert.ok(quasi(A.angolo.calcola(anisotropa, [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 100 }]).valore, 26.56505117707799));
  assert.ok(quasi(A.angolo.calcola(ct, [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 200, y: 0 }]).valore, 0));
  assert.ok(quasi(A.angolo.calcola(ct, [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: -100, y: 0 }].map(p => ({ x: p.x + 200, y: p.y + 10 }))).valore, 180));
  assert.equal(A.angolo.calcola(ct, [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 }]).stato, 'punti_uguali');
  assert.equal(A.angolo.calcola(ct, [{ x: 1, y: 1 }, { x: 2, y: 2 }]).stato, 'punti_non_validi');
});

test('rettangolo: area e perimetro dai due angoli, qualunque verso', () => {
  const e = A.rettangolo.calcola(ct, [{ x: 110, y: 60 }, { x: 10, y: 10 }]);   // 100 × 50 px × 0,7 = 70 × 35 mm
  assert.equal(e.stato, 'ok'); assert.ok(quasi(e.valore, 2450)); assert.equal(e.unita, 'mm²');
  assert.ok(quasi(e.extra.perimetro_mm, 210)); assert.ok(quasi(e.extra.larghezza_mm, 70));
  assert.equal(A.rettangolo.calcola(ct, [{ x: 10, y: 10 }, { x: 10, y: 60 }]).stato, 'area_nulla');
});

test('ellisse: area πab esatta, perimetro dichiarato approssimato', () => {
  const e = A.ellisse.calcola(eco, [{ x: 200, y: 100 }, { x: 400, y: 200 }]);   // 200 × 100 px × 0,2 → a = 20, b = 10
  assert.equal(e.stato, 'ok'); assert.ok(quasi(e.valore, Math.PI * 200)); assert.ok(quasi(e.extra.semiasse_a_mm, 20));
  // cerchio: perimetro di Ramanujan = 2πr esatto
  const c = A.ellisse.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 100 }]);   // r = 35 mm
  assert.ok(quasi(c.extra.perimetro_mm_approssimato, 2 * Math.PI * 35, 1e-12));
  assert.equal(A.ellisse.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 0 }]).stato, 'area_nulla');
});

test('poligono: formula del poligono sui mm, concavo compreso; intrecciato rifiutato', () => {
  const quadrato = A.poligono.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);   // 70 × 70
  assert.equal(quadrato.stato, 'ok'); assert.ok(quasi(quadrato.valore, 4900)); assert.ok(quasi(quadrato.extra.perimetro_mm, 280)); assert.equal(quadrato.extra.vertici, 4);
  // stesso quadrato in senso antiorario: stessa area
  assert.ok(quasi(A.poligono.calcola(ct, [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }]).valore, 4900));
  // L concava: 100×100 meno 50×50 → 7500 px² × 0,49
  const elle = A.poligono.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 }]);
  assert.ok(quasi(elle.valore, 7500 * 0.49));
  // anisotropia: 100 × 100 px con 0,5 × 0,25 → 50 × 25 mm
  assert.ok(quasi(A.poligono.calcola(anisotropa, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]).valore, 1250));
  // farfalla: si incrocia
  assert.equal(A.poligono.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]).stato, 'poligono_intrecciato');
  // tre punti allineati: area nulla
  assert.equal(A.poligono.calcola(ct, [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }]).stato, 'area_nulla');
  assert.equal(A.poligono.calcola(ct, [{ x: 0, y: 0 }, { x: 1, y: 1 }]).stato, 'punti_non_validi');
});

test('poligono in ecografia: tutti i vertici nella stessa regione, o niente', () => {
  assert.equal(A.poligono.calcola(eco, [{ x: 200, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 580 }]).stato, 'regioni_diverse');
  assert.equal(A.poligono.calcola(eco, [{ x: 200, y: 100 }, { x: 300, y: 100 }, { x: 10, y: 10 }]).stato, 'fuori_regione');
  const ok = A.poligono.calcola(eco, [{ x: 200, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 200, y: 200 }]);
  assert.ok(quasi(ok.valore, 400));   // 20 × 20 mm
});

test('perimetro: lunghezza del contorno chiuso', () => {
  const e = A.perimetro.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
  assert.equal(e.stato, 'ok'); assert.ok(quasi(e.valore, 280)); assert.equal(e.unita, 'mm'); assert.ok(quasi(e.extra.area_mm2, 4900));
  assert.equal(A.perimetro.calcola(ct, [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]).stato, 'poligono_intrecciato');
});

test('punto: coordinate fisiche, nessun valore', () => {
  const e = A.punto.calcola(anisotropa, [{ x: 100, y: 100 }]);
  assert.equal(e.stato, 'ok'); assert.equal(e.valore, null); assert.ok(quasi(e.extra.x_mm, 50)); assert.ok(quasi(e.extra.y_mm, 25));
  assert.equal(A.punto.calcola(anisotropa, [{ x: 1, y: 1 }, { x: 2, y: 2 }]).stato, 'punti_non_validi');
  assert.equal(A.punto.calcola(eco, [{ x: 10, y: 10 }]).stato, 'fuori_regione');
});

test('valore mostrato: aree in cm² con due decimali, gradi con uno, punto come coppia', () => {
  assert.equal(FV(2450, 'mm²'), '24,50 cm²');
  assert.equal(FV(Math.PI * 200, 'mm²'), '6,28 cm²');
  assert.equal(FV(26.56505, '°'), '26,6°');
  assert.equal(FV(45, 'mm'), '45,0 mm');
  assert.equal(FV(null, 'mm', { x_mm: 50, y_mm: 25 }), '(50,0; 25,0 mm)');
});

test('gate + strumenti: ogni algoritmo passa da valuta con stato, unità, valore mostrato, extra', () => {
  const casi: [string, any[]][] = [
    ['polilinea', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
    ['angolo', [{ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }]],
    ['rettangolo', [{ x: 0, y: 0 }, { x: 100, y: 50 }]],
    ['ellisse', [{ x: 0, y: 0 }, { x: 100, y: 50 }]],
    ['poligono', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
    ['perimetro', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
    ['punto', [{ x: 10, y: 20 }]],
  ];
  for (const [alg, punti] of casi) {
    const e = V.valuta({ cal: ct, geometria: geoCt, frame: 0, frameTotali: 1, punti, algoritmo: alg });
    assert.equal(e.stato, 'VALIDATED', alg); assert.equal(e.ok, true, alg); assert.equal(e.algoritmo, alg); assert.equal(e.versione_algoritmo, '1.0');
    assert.ok(e.valore_mostrato && e.valore_mostrato !== '—', alg); assert.ok(e.extra, alg); assert.ok(e.punti_fisici.length === punti.length, alg);
  }
  const ko = V.valuta({ cal: ct, punti: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }], algoritmo: 'poligono' });
  assert.equal(ko.stato, 'NOT_MEASURABLE'); assert.ok(j(ko.motivi).includes('poligono_intrecciato')); assert.match(ko.testi[0], /incrocia/);
});

test('invarianza degli strumenti: zoom, rotazione e DPR non cambiano area, angolo e perimetro', () => {
  const pol = [{ x: 12.5, y: 40 }, { x: 300, y: 55.25 }, { x: 280, y: 400 }, { x: 60, y: 350 }];
  const base = { poligono: A.poligono.calcola(ct, pol).valore, perimetro: A.perimetro.calcola(ct, pol).valore, angolo: A.angolo.calcola(ct, pol.slice(0, 3)).valore, polilinea: A.polilinea.calcola(ct, pol).valore };
  for (const scala of [0.3, 1, 2.7]) for (const rot of [0, 90, 33]) for (const dpr of [1, 2]) {
    const M = G.matriceViewer({ scalaX: scala * dpr, scalaY: scala * dpr, rotazioneGradi: rot, tx: 17, ty: -40 });
    const indietro = pol.map((p: any) => G.versoImmagine(G.applica(M, p), M));
    assert.ok(quasi(A.poligono.calcola(ct, indietro).valore, base.poligono, 1e-12));
    assert.ok(quasi(A.perimetro.calcola(ct, indietro).valore, base.perimetro, 1e-12));
    assert.ok(quasi(A.angolo.calcola(ct, indietro.slice(0, 3)).valore, base.angolo, 1e-11));
    assert.ok(quasi(A.polilinea.calcola(ct, indietro).valore, base.polilinea, 1e-12));
  }
});

// ── Fase 6: spaziatura per fotogramma ──
const perFrame = { tipo: 'pixel_spacing_per_frame', righe: 64, colonne: 64, regioni: [], spacing: null, per_frame: [[1, 1], [1, 1.5], null], avvisi: ['spacing_per_frame_non_uniforme'] };

test('fotogrammi: la calibrazione effettiva è quella del fotogramma su cui si misura', () => {
  const c0 = G.calibrazionePerFrame(perFrame, 0), c1 = G.calibrazionePerFrame(perFrame, 1), c2 = G.calibrazionePerFrame(perFrame, 2);
  assert.equal(c0.tipo, 'pixel_spacing'); assert.equal(c0.spacing.dy_mm, 1);
  assert.equal(c1.spacing.dy_mm, 1.5); assert.equal(c1.spacing.origine, 'PerFrameFunctionalGroups');
  assert.equal(c2.tipo, 'nessuna');
  assert.equal(G.calibrazionePerFrame(ct, 3), ct);   // le altre calibrazioni passano invariate
});

test('fotogrammi: il Gate usa il fotogramma, e la variabilità è una CAUTION da validare', () => {
  const punti = [{ x: 0, y: 0 }, { x: 0, y: 10 }];
  const bloccata = V.valuta({ cal: perFrame, frame: 1, frameTotali: 3, punti });
  assert.equal(bloccata.stato, 'NOT_MEASURABLE'); assert.ok(j(bloccata.motivi).includes('caution_non_validata:spacing_per_frame_variabile'));
  const f0 = V.valuta({ cal: perFrame, frame: 0, frameTotali: 3, punti, cautionValidati: ['spacing_per_frame_variabile'] });
  const f1 = V.valuta({ cal: perFrame, frame: 1, frameTotali: 3, punti, cautionValidati: ['spacing_per_frame_variabile'] });
  assert.equal(f0.stato, 'CAUTION'); assert.ok(quasi(f0.valore, 10)); assert.ok(quasi(f1.valore, 15));
  assert.equal(f0.cal.spacing.dy_mm, 1); assert.equal(f1.cal.spacing.dy_mm, 1.5);
  const f2 = V.valuta({ cal: perFrame, frame: 2, frameTotali: 3, punti, cautionValidati: ['spacing_per_frame_variabile'] });
  assert.equal(f2.stato, 'NOT_MEASURABLE'); assert.ok(j(f2.motivi).includes('calibrazione_assente'));
  assert.match(G.descriviCalibrazione(perFrame), /per fotogramma/);
});

// ── Fase 9: spazio paziente e geometria di serie ──
vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public', 'prototipo', 'mse', 'serie.js'), 'utf-8'), contesto, { filename: 'mse/serie.js' });
const SR = contesto.RFMSE.serie;
const gAx = (z: number, id = 'a') => ({ versione: 1, identita: { modalita: 'CT', frame_totali: 1 }, pixel: { righe: 512, colonne: 512 }, spaziatura: { fonte: 'PixelSpacing', dx_mm: 0.5, dy_mm: 0.5, per_frame: false }, regioni_us: [], spazio: { iop: [1, 0, 0, 0, 1, 0], ipp: [-100, -120, z], frame_of_reference: 'FOR1', spessore_mm: 3, distanza_slice_dichiarata_mm: null }, derivata: false, image_type: [], avvisi_lettura: [], id });

test('spazio paziente: pixel → mm con IOP/IPP/spaziatura, e senza uno dei tre non si va', () => {
  const p = SR.versoPaziente(gAx(30), { x: 10, y: 20 });
  assert.equal(p.stato, 'ok'); assert.deepEqual(j(p.xyz), [-95, -110, 30]);
  assert.equal(SR.versoPaziente({ ...gAx(0), spazio: null }, { x: 0, y: 0 }).stato, 'spazio_assente');
  assert.equal(SR.versoPaziente({ ...gAx(0), spazio: { iop: [1, 0, 0, 0, 1, 0], ipp: null } }, { x: 0, y: 0 }).stato, 'posizione_assente');
  assert.equal(SR.versoPaziente({ ...gAx(0), spazio: { iop: null, ipp: [0, 0, 0] } }, { x: 0, y: 0 }).stato, 'orientamento_assente');
  assert.equal(SR.versoPaziente({ ...gAx(0), spazio: { iop: [1, 0, 0, 1, 0, 0], ipp: [0, 0, 0] } }, { x: 0, y: 0 }).stato, 'orientamento_non_ortonormale');
  assert.equal(SR.versoPaziente({ ...gAx(0), spaziatura: { fonte: null, dx_mm: null, dy_mm: null, per_frame: false } }, { x: 0, y: 0 }).stato, 'spaziatura_assente');
});

test('spazio paziente: la distanza in piano coincide con quella 2D anche su un piano obliquo', () => {
  const s = Math.SQRT1_2;
  const gObl = { ...gAx(0), spazio: { iop: [s, s, 0, -s, s, 0], ipp: [10, 20, 30], frame_of_reference: 'F' } };
  const a = { x: 3, y: 4 }, b = { x: 103, y: 4 };
  const d3 = SR.distanza3d(gObl, a, gObl, b);
  assert.equal(d3.stato, 'ok'); assert.ok(quasi(d3.mm, 50));       // 100 px × 0,5 mm
  assert.ok(quasi(V.valuta({ cal: ct, punti: [a, b] }).valore / 0.7 * 0.5, 50));
  assert.equal(SR.orientamento([0, 0, 1]), 'assiale'); assert.equal(SR.orientamento([0, 1, 0]), 'coronale'); assert.equal(SR.orientamento([1, 0, 0]), 'sagittale'); assert.equal(SR.orientamento([0.7, 0.7, 0.14]), 'obliquo');
});

test('distanza 3D: fra due fette, con Frame of Reference uguale; diverso → rifiuto', () => {
  const d = SR.distanza3d(gAx(0), { x: 0, y: 0 }, gAx(30), { x: 80, y: 0 });   // 40 mm in piano, 30 mm fra fette → 50
  assert.equal(d.stato, 'ok'); assert.ok(quasi(d.mm, 50));
  const altro = { ...gAx(30), spazio: { ...gAx(30).spazio, frame_of_reference: 'FOR2' } };
  assert.equal(SR.distanza3d(gAx(0), { x: 0, y: 0 }, altro, { x: 80, y: 0 }).stato, 'frame_of_reference_diversi');
  assert.equal(SR.distanza3d(gAx(0), { x: 1, y: 1 }, gAx(0), { x: 1, y: 1 }).stato, 'punti_uguali');
  assert.equal(SR.distanza3d(gAx(0), { x: 1, y: 1 }, gAx(0), { x: 600, y: 1 }).stato, 'fuori_immagine');
});

test('serie: fette ordinate lungo la normale, distanza reale dalle posizioni (non da Slice Thickness), uniformità', () => {
  const imgs = [gAx(60, 'c'), gAx(0, 'a'), gAx(30, 'b'), gAx(90, 'd')];
  const s = SR.analizzaSerie(imgs.map((g) => ({ id: g.id, geometria: g })));
  assert.equal(s.stato, 'ok'); assert.deepEqual(j(s.ordine), ['a', 'b', 'c', 'd']);
  assert.ok(quasi(s.distanza_media_mm, 30)); assert.equal(s.uniforme, true); assert.equal(s.volume_possibile, true);
  assert.equal(s.orientamento, 'assiale'); assert.equal(s.n, 4); assert.equal(s.frame_of_reference, 'FOR1');
  // Slice Thickness diceva 3 mm: non conta
  assert.ok(Math.abs(s.distanza_media_mm - 3) > 1);
});

test('serie: distanze non uniformi, fette doppie, dimensioni diverse, FoR diversi → niente volume, con avvisi', () => {
  const nu = SR.analizzaSerie([gAx(0, 'a'), gAx(30, 'b'), gAx(75, 'c')].map((g) => ({ id: g.id, geometria: g })));
  assert.equal(nu.uniforme, false); assert.equal(nu.volume_possibile, false); assert.ok(j(nu.avvisi).includes('distanza_fette_non_uniforme'));
  const dop = SR.analizzaSerie([gAx(0, 'a'), gAx(0, 'b'), gAx(30, 'c')].map((g) => ({ id: g.id, geometria: g })));
  assert.ok(j(dop.avvisi).includes('fette_sovrapposte')); assert.equal(dop.volume_possibile, false);
  const dim = SR.analizzaSerie([gAx(0, 'a'), { ...gAx(30, 'b'), pixel: { righe: 256, colonne: 256 } }, gAx(60, 'c')].map((g: any) => ({ id: g.id, geometria: g })));
  assert.ok(j(dim.avvisi).includes('dimensioni_diverse')); assert.equal(dim.volume_possibile, false);
  const f2 = { ...gAx(60, 'c'), spazio: { ...gAx(60).spazio, frame_of_reference: 'X' } };
  const fr = SR.analizzaSerie([gAx(0, 'a'), gAx(30, 'b'), f2].map((g: any) => ({ id: g.id, geometria: g })));
  assert.ok(j(fr.avvisi).includes('frame_of_reference_diversi')); assert.equal(fr.volume_possibile, false);
  const senza = SR.analizzaSerie([{ id: 'x', geometria: { ...gAx(0), spazio: null } }]);
  assert.equal(senza.stato, 'senza_spazio'); assert.equal(senza.senza_spazio, 1);
  const due = SR.analizzaSerie([gAx(0, 'a'), gAx(30, 'b')].map((g) => ({ id: g.id, geometria: g })));
  assert.equal(due.uniforme, true); assert.equal(due.volume_possibile, false);   // servono almeno 3 fette
});

test('distanza 3D come strumento: passa dal Gate con le geometrie del contesto', () => {
  const geometrie = { a: gAx(0, 'a'), b: gAx(30, 'b') };
  const e = V.valuta({ cal: ct, geometria: gAx(0), frame: 0, frameTotali: 1, algoritmo: 'distanza_3d', punti: [{ x: 0, y: 0, immagine_id: 'a' }, { x: 80, y: 0, immagine_id: 'b' }], geometrie });
  assert.equal(e.stato, 'VALIDATED'); assert.ok(quasi(e.valore, 50)); assert.equal(e.valore_mostrato, '50,0 mm'); assert.equal(e.extra.immagine_b, 'b');
  assert.ok(quasi(contesto.RFMSE.misure.ricalcolaDaExtra('distanza_3d', e.extra), 50));
  const ko = V.valuta({ cal: ct, algoritmo: 'distanza_3d', punti: [{ x: 0, y: 0, immagine_id: 'a' }, { x: 80, y: 0, immagine_id: 'z' }], geometrie });
  assert.equal(ko.stato, 'NOT_MEASURABLE'); assert.ok(j(ko.motivi).includes('geometria_immagine_assente'));
  // senza calibrazione 2D ma con spazio: la distanza 3D è possibile lo stesso
  const senzaCal = V.valuta({ cal: { tipo: 'nessuna', righe: 512, colonne: 512, regioni: [], spacing: null }, algoritmo: 'distanza_3d', punti: [{ x: 0, y: 0, immagine_id: 'a' }, { x: 80, y: 0, immagine_id: 'b' }], geometrie });
  assert.equal(senzaCal.stato, 'VALIDATED');
});

test('volume: somma delle aree per la distanza reale fra fette consecutive; salti e passo non uniforme rifiutati', () => {
  const v = V.valuta({ cal: ct, algoritmo: 'volume', punti: [], volume: { aree_mm2: [1000, 1200, 800], indici: [4, 5, 6], d_mm: 2.5, uniforme: true, misure: ['m1', 'm2', 'm3'] }, cautionValidati: ['volume_per_somma_di_fette'] });
  assert.equal(v.stato, 'CAUTION'); assert.ok(quasi(v.valore, 7500)); assert.equal(v.valore_mostrato, '7,50 mL'); assert.equal(v.unita, 'mm³');
  assert.ok(quasi(contesto.RFMSE.misure.ricalcolaDaExtra('volume', v.extra), 7500));
  const bloccato = V.valuta({ cal: ct, algoritmo: 'volume', punti: [], volume: { aree_mm2: [1000, 1200], indici: [4, 5], d_mm: 2.5, uniforme: true } });
  assert.equal(bloccato.stato, 'NOT_MEASURABLE'); assert.ok(j(bloccato.motivi).includes('caution_non_validata:volume_per_somma_di_fette'));
  assert.ok(j(V.valuta({ cal: ct, algoritmo: 'volume', punti: [], volume: { aree_mm2: [1000, 1200], indici: [4, 6], d_mm: 2.5, uniforme: true } }).motivi).includes('poligoni_non_consecutivi'));
  assert.ok(j(V.valuta({ cal: ct, algoritmo: 'volume', punti: [], volume: { aree_mm2: [1000, 1200], indici: [4, 5], d_mm: 2.5, uniforme: false } }).motivi).includes('fette_non_uniformi'));
  assert.ok(j(V.valuta({ cal: ct, algoritmo: 'volume', punti: [], volume: { aree_mm2: [1000], indici: [4], d_mm: 2.5, uniforme: true } }).motivi).includes('volume_poche_fette'));
  assert.equal(contesto.RFMSE.misure.formattaValore(123456, 'mm³'), '123,46 mL');
});
