/* Il righello: la matematica della misura, e nient'altro (19.9.2026).
 *
 * Questo file è l'UNICA fonte del calcolo «da due punti sull'immagine a una
 * distanza in millimetri». Lo esegue il browser mentre si trascina, lo
 * riesegue il server prima di salvare (src/lib/imaging-misura.ts) e lo
 * provano i test (src/lib/prove-imaging-misura.test.ts): tre lettori, un
 * solo codice. È la parte di ReferralFlow che rientra nel perimetro del
 * dispositivo medico in-house dello studio (docs/legale/dispositivo-in-house/),
 * e per questo è piccola, senza dipendenze, e non tocca il DOM.
 *
 * La calibrazione arriva dal file DICOM (imaging/leggi-dicom.py, comando
 * `calibrazione`) e ha tre forme:
 *   { tipo: 'us_regioni', regioni: [{x0,y0,x1,y1,dx_mm,dy_mm}] }  ecografie
 *   { tipo: 'pixel_spacing', spacing: {dx_mm, dy_mm} }             TAC, RM
 *   { tipo: 'imager_pixel_spacing', ... }                          radiografie: NON si misura
 *   { tipo: 'nessuna' }                                            il file non lo dice: NON si misura
 * I punti sono in pixel NATIVI dell'immagine (non dello schermo): la
 * conversione dallo schermo la fa `versoNativo`, con la scala = colonne
 * native / larghezza mostrata.
 */
(function (root) {
  'use strict';

  var VERSIONE = '1.0';

  function finito(n) { return typeof n === 'number' && isFinite(n); }
  function puntoValido(p) { return !!p && finito(p.x) && finito(p.y); }

  // Da coordinate dello schermo a pixel nativi. `scala` = colonne native /
  // larghezza mostrata (l'immagine è mostrata rimpicciolita, o ingrandita).
  function versoNativo(p, scala) {
    if (!puntoValido(p) || !finito(scala) || scala <= 0) return null;
    return { x: p.x * scala, y: p.y * scala };
  }

  // La regione ecografica che contiene il punto (bordi inclusi), o null.
  function regionePer(cal, p) {
    if (!cal || cal.tipo !== 'us_regioni' || !Array.isArray(cal.regioni) || !puntoValido(p)) return null;
    for (var i = 0; i < cal.regioni.length; i++) {
      var r = cal.regioni[i];
      if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) return r;
    }
    return null;
  }

  // La distanza fra due punti nativi, in millimetri.
  // Torna sempre un oggetto con `stato`; `mm` c'è solo quando stato === 'ok'.
  function distanzaMm(cal, p1, p2) {
    if (!puntoValido(p1) || !puntoValido(p2)) return { stato: 'punti_non_validi' };
    if (!cal || !cal.tipo) return { stato: 'non_calibrata' };
    if (finito(cal.colonne) && finito(cal.righe) && cal.colonne > 0 && cal.righe > 0) {
      var dentro = function (p) { return p.x >= 0 && p.x <= cal.colonne && p.y >= 0 && p.y <= cal.righe; };
      if (!dentro(p1) || !dentro(p2)) return { stato: 'fuori_immagine' };
    }
    var dxPx = p2.x - p1.x, dyPx = p2.y - p1.y;
    if (dxPx === 0 && dyPx === 0) return { stato: 'punti_uguali' };

    var sx, sy;
    if (cal.tipo === 'us_regioni') {
      var r1 = regionePer(cal, p1), r2 = regionePer(cal, p2);
      if (!r1 || !r2) return { stato: 'fuori_regione' };
      if (r1 !== r2) return { stato: 'regioni_diverse' };
      sx = r1.dx_mm; sy = r1.dy_mm;
    } else if (cal.tipo === 'pixel_spacing') {
      if (!cal.spacing) return { stato: 'non_calibrata' };
      sx = cal.spacing.dx_mm; sy = cal.spacing.dy_mm;
    } else if (cal.tipo === 'imager_pixel_spacing') {
      // Spazio sul rivelatore, non sul paziente: con l'ingrandimento
      // geometrico la misura sarebbe sbagliata. Non si dà un numero.
      return { stato: 'rivelatore' };
    } else {
      return { stato: 'non_calibrata' };
    }
    if (!finito(sx) || !finito(sy) || sx <= 0 || sy <= 0) return { stato: 'non_calibrata' };
    var mm = Math.sqrt(dxPx * sx * dxPx * sx + dyPx * sy * dyPx * sy);
    return { stato: 'ok', mm: mm, dx_mm: sx, dy_mm: sy };
  }

  // «12,3 mm» — un decimale, virgola svizzera. Sotto il decimale la misura
  // non ha senso: nessuna calibrazione clinica arriva al centesimo.
  function formattaMm(mm) {
    if (!finito(mm)) return '—';
    return (Math.round(mm * 10) / 10).toFixed(1).replace('.', ',') + ' mm';
  }

  function formattaSpazio(mm) { return (Math.round(mm * 1000) / 1000).toString().replace('.', ','); }

  // Una riga per lo schermo: che cosa sappiamo di questa immagine.
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

  // Perché non si è potuto misurare, detto a chi guarda.
  var MOTIVI = {
    non_calibrata: 'Questa immagine non è calibrata: il file non dichiara la dimensione del pixel.',
    rivelatore: 'Radiografia: la spaziatura è quella del rivelatore, non del paziente. Qui non si misura.',
    fuori_regione: 'Entrambi i punti devono stare dentro l’area ecografica calibrata.',
    regioni_diverse: 'I due punti stanno in due aree con calibrazioni diverse.',
    fuori_immagine: 'Un punto è fuori dall’immagine.',
    punti_uguali: 'I due punti coincidono.',
    punti_non_validi: 'Punti non validi.'
  };
  function motivo(stato) { return MOTIVI[stato] || 'Misura non possibile.'; }

  var api = {
    VERSIONE: VERSIONE, versoNativo: versoNativo, regionePer: regionePer, distanzaMm: distanzaMm,
    formattaMm: formattaMm, descriviCalibrazione: descriviCalibrazione, motivo: motivo
  };
  root.RFMisura = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
