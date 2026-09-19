/* Measurement Safety Engine — geometria (fase 1, 19.9.2026).
 *
 * Da un punto sullo schermo a un punto sull'immagine, e da lì a quanti
 * millimetri vale un pixel in quel punto. Niente DOM, niente rete: questo
 * file si carica tale e quale nel browser (<script>) e nel server (vm), e lo
 * provano i test. È la parte del righello che rientra nel dispositivo
 * in-house dello studio (docs/legale/dispositivo-in-house/).
 *
 * Coordinate:
 *   schermo  — pixel CSS del viewer, qualunque zoom/pan/rotazione/DPR;
 *   immagine — pixel NATIVI del DICOM (origine in alto a sinistra, x colonna,
 *              y riga, frazionari);
 *   fisiche  — millimetri, sul piano dell'immagine.
 * Il viewer descrive la SUA trasformazione con una matrice 3×3 (affine) da
 * schermo a immagine: cambiare viewer significa cambiare chi la produce.
 *
 * La calibrazione (`cal`) è la vista compatta che il lettore Python deriva
 * dalla geometria del file (imaging/geometria.py, calibrazione_da):
 *   { tipo:'us_regioni', regioni:[{x0,y0,x1,y1,dx_mm,dy_mm}] }
 *   { tipo:'pixel_spacing', spacing:{dx_mm,dy_mm} }
 *   { tipo:'imager_pixel_spacing' }  → NON si misura (spazio del rivelatore)
 *   { tipo:'nessuna' }               → NON si misura
 */
(function (root) {
  'use strict';

  var VERSIONE = '1.0';

  function finito(n) { return typeof n === 'number' && isFinite(n); }
  function puntoValido(p) { return !!p && finito(p.x) && finito(p.y); }

  /* ── matrici 3×3 affini, [[a,b,c],[d,e,f],[0,0,1]] ── */
  function identita() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }
  function matriceValida(M) {
    if (!Array.isArray(M) || M.length !== 3) return false;
    for (var i = 0; i < 3; i++) {
      if (!Array.isArray(M[i]) || M[i].length !== 3) return false;
      for (var j = 0; j < 3; j++) if (!finito(M[i][j])) return false;
    }
    return M[2][0] === 0 && M[2][1] === 0 && M[2][2] === 1;
  }
  // A ∘ B: prima B, poi A
  function componi(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 1]];
    for (var i = 0; i < 2; i++) for (var j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return C;
  }
  function inversa(M) {
    var a = M[0][0], b = M[0][1], c = M[0][2], d = M[1][0], e = M[1][1], f = M[1][2];
    var det = a * e - b * d;
    if (!finito(det) || Math.abs(det) < 1e-15) return null;
    return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det], [0, 0, 1]];
  }
  function applica(M, p) {
    if (!matriceValida(M) || !puntoValido(p)) return null;
    var x = M[0][0] * p.x + M[0][1] * p.y + M[0][2], y = M[1][0] * p.x + M[1][1] * p.y + M[1][2];
    return finito(x) && finito(y) ? { x: x, y: y } : null;
  }
  // La matrice IMMAGINE → SCHERMO di un viewer descritto da: scala per asse
  // (px schermo per px immagine), rotazione in gradi attorno all'origine
  // dell'immagine, traslazione in px schermo. `versoImmagine` usa l'inversa.
  function matriceViewer(v) {
    var sx = finito(v && v.scalaX) ? v.scalaX : 1, sy = finito(v && v.scalaY) ? v.scalaY : sx;
    var th = (finito(v && v.rotazioneGradi) ? v.rotazioneGradi : 0) * Math.PI / 180;
    var tx = finito(v && v.tx) ? v.tx : 0, ty = finito(v && v.ty) ? v.ty : 0;
    var c = Math.cos(th), s = Math.sin(th);
    // T · R · S
    return [[c * sx, -s * sy, tx], [s * sx, c * sy, ty], [0, 0, 1]];
  }
  function versoImmagine(p, M) {
    var inv = matriceValida(M) ? inversa(M) : null;
    return inv ? applica(inv, p) : null;
  }
  // Compatibilità con il righello v1: immagine mostrata in scala uniforme.
  function versoNativo(p, scala) {
    if (!puntoValido(p) || !finito(scala) || scala <= 0) return null;
    return { x: p.x * scala, y: p.y * scala };
  }

  /* ── dai pixel ai millimetri ── */
  // Tutte le regioni calibrate (2D, cm/cm) che contengono il punto, bordi inclusi.
  function regioniPer(cal, p) {
    if (!cal || cal.tipo !== 'us_regioni' || !Array.isArray(cal.regioni) || !puntoValido(p)) return [];
    var out = [];
    for (var i = 0; i < cal.regioni.length; i++) {
      var r = cal.regioni[i];
      if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) out.push(r);
    }
    return out;
  }
  // La regione da usare in p. Le regioni possono sovrapporsi (una color-flow
  // sopra il B-mode, una barra sopra tutto): vince, nell'ordine, la priorità
  // alta dichiarata dall'apparecchio (Region Flags bit 0), poi il tessuto sul
  // flusso, poi la prima nel file. Se le candidate hanno calibrazioni diverse
  // lo si dice (`discordanti`): il Gate ne fa una CAUTION.
  function regionePer(cal, p) {
    var c = regioniPer(cal, p);
    if (!c.length) return null;
    if (c.length === 1) return c[0];
    var peso = function (r) { return (r.priorita_alta === false ? 0 : 2) + (r.tipo === 'tessuto' || r.tipo_dati === 1 ? 1 : 0); };
    var best = c[0];
    for (var i = 1; i < c.length; i++) if (peso(c[i]) > peso(best)) best = c[i];
    return best;
  }
  function regioniDiscordanti(c) {
    for (var i = 1; i < c.length; i++) {
      if (Math.abs(c[i].dx_mm - c[0].dx_mm) > 1e-9 || Math.abs(c[i].dy_mm - c[0].dy_mm) > 1e-9) return true;
    }
    return false;
  }
  // Quanti mm vale un pixel in p (per asse), o perché non si sa.
  function mmPerPixel(cal, p) {
    if (!puntoValido(p)) return { stato: 'punti_non_validi' };
    if (!cal || !cal.tipo) return { stato: 'non_calibrata' };
    if (cal.tipo === 'us_regioni') {
      var c = regioniPer(cal, p);
      var r = regionePer(cal, p);
      if (!r) return { stato: 'fuori_regione' };
      if (!finito(r.dx_mm) || !finito(r.dy_mm) || r.dx_mm <= 0 || r.dy_mm <= 0) return { stato: 'non_calibrata' };
      return { stato: 'ok', sx: r.dx_mm, sy: r.dy_mm, regione: r, discordanti: regioniDiscordanti(c) };
    }
    if (cal.tipo === 'pixel_spacing') {
      if (!cal.spacing || !finito(cal.spacing.dx_mm) || !finito(cal.spacing.dy_mm) || cal.spacing.dx_mm <= 0 || cal.spacing.dy_mm <= 0) return { stato: 'non_calibrata' };
      return { stato: 'ok', sx: cal.spacing.dx_mm, sy: cal.spacing.dy_mm, regione: null };
    }
    if (cal.tipo === 'imager_pixel_spacing') return { stato: 'rivelatore' };
    return { stato: 'non_calibrata' };
  }
  function dentroImmagine(cal, p) {
    if (!cal || !finito(cal.colonne) || !finito(cal.righe) || cal.colonne <= 0 || cal.righe <= 0) return true;
    return p.x >= 0 && p.x <= cal.colonne && p.y >= 0 && p.y <= cal.righe;
  }

  function formattaSpazio(mm) { return (Math.round(mm * 1000) / 1000).toString().replace('.', ','); }
  function descriviCalibrazione(cal) {
    if (!cal || !cal.tipo || cal.tipo === 'nessuna') return 'non calibrata: il file non dichiara la dimensione del pixel';
    if (cal.tipo === 'imager_pixel_spacing') return 'spaziatura del rivelatore, non del paziente: non si misura';
    if (cal.tipo === 'pixel_spacing' && cal.spacing) return 'calibrata ' + formattaSpazio(cal.spacing.dx_mm) + ' × ' + formattaSpazio(cal.spacing.dy_mm) + ' mm/px';
    if (cal.tipo === 'us_regioni') {
      var n = cal.regioni ? cal.regioni.length : 0;
      if (!n) return 'non calibrata';
      var r = cal.regioni[0];
      return 'calibrata ' + formattaSpazio(r.dx_mm) + ' × ' + formattaSpazio(r.dy_mm) + ' mm/px' + (n > 1 ? ' (' + n + ' regioni)' : '');
    }
    return 'non calibrata';
  }

  root.RFMSE = root.RFMSE || {};
  root.RFMSE.geometria = {
    VERSIONE: VERSIONE, finito: finito, puntoValido: puntoValido,
    identita: identita, matriceValida: matriceValida, componi: componi, inversa: inversa, applica: applica,
    matriceViewer: matriceViewer, versoImmagine: versoImmagine, versoNativo: versoNativo,
    regioniPer: regioniPer, regionePer: regionePer, mmPerPixel: mmPerPixel, dentroImmagine: dentroImmagine,
    descriviCalibrazione: descriviCalibrazione
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
