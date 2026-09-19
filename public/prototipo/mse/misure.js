/* Measurement Safety Engine — misure (fase 2, il righello del 19.9.2026).
 *
 * Gli algoritmi di misura, puri: coordinate immagine + calibrazione → valore
 * in millimetri, non arrotondato, più le coordinate fisiche usate. Ogni
 * algoritmo ha nome e versione; la versione cambia SOLO se il numero cambia,
 * e lo dimostra il banco di regressione. La geometria (pixel → mm) sta in
 * geometria.js; qui si compone e basta.
 *
 * Il facciale RFMisura in fondo è l'API del righello v1 (bridge e server la
 * usano): stessi nomi, stessi numeri.
 */
(function (root) {
  'use strict';

  var G = root.RFMSE && root.RFMSE.geometria;
  if (!G) throw new Error('mse/geometria.js va caricato prima di mse/misure.js');

  var ALGORITMI = {
    // Distanza euclidea sul piano dell'immagine: gli spostamenti per asse in
    // pixel diventano millimetri con la calibrazione DEL PUNTO (la stessa
    // per entrambi, o niente), poi Pitagora sui millimetri.
    distanza: {
      nome: 'distanza', versione: '1.0', unita: 'mm',
      equazione: 'd = sqrt(((x2-x1)*sx)^2 + ((y2-y1)*sy)^2)',
      calcola: function (cal, punti) {
        if (!Array.isArray(punti) || punti.length !== 2) return { stato: 'punti_non_validi' };
        var p1 = punti[0], p2 = punti[1];
        if (!G.puntoValido(p1) || !G.puntoValido(p2)) return { stato: 'punti_non_validi' };
        if (!cal || !cal.tipo) return { stato: 'non_calibrata' };
        if (!G.dentroImmagine(cal, p1) || !G.dentroImmagine(cal, p2)) return { stato: 'fuori_immagine' };
        var dxPx = p2.x - p1.x, dyPx = p2.y - p1.y;
        if (dxPx === 0 && dyPx === 0) return { stato: 'punti_uguali' };
        var a = G.mmPerPixel(cal, p1), b = G.mmPerPixel(cal, p2);
        if (a.stato !== 'ok') return { stato: a.stato };
        if (b.stato !== 'ok') return { stato: b.stato };
        if (a.regione !== b.regione) return { stato: 'regioni_diverse' };
        var mm = Math.sqrt(dxPx * a.sx * dxPx * a.sx + dyPx * a.sy * dyPx * a.sy);
        if (!G.finito(mm)) return { stato: 'calcolo_non_finito' };
        return { stato: 'ok', mm: mm, dx_mm: a.sx, dy_mm: a.sy,
                 punti_fisici: [{ x: p1.x * a.sx, y: p1.y * a.sy }, { x: p2.x * a.sx, y: p2.y * a.sy }] };
      }
    }
  };

  // «12,3 mm»: un decimale, virgola svizzera. L'arrotondamento è SOLO qui.
  function formattaMm(mm) {
    if (!G.finito(mm)) return '—';
    return (Math.round(mm * 10) / 10).toFixed(1).replace('.', ',') + ' mm';
  }

  var MOTIVI = {
    non_calibrata: 'Questa immagine non è calibrata: il file non dichiara la dimensione del pixel.',
    rivelatore: 'Radiografia: la spaziatura è quella del rivelatore, non del paziente. Qui non si misura.',
    fuori_regione: 'Entrambi i punti devono stare dentro l’area ecografica calibrata.',
    regioni_diverse: 'I due punti stanno in due aree con calibrazioni diverse.',
    fuori_immagine: 'Un punto è fuori dall’immagine.',
    punti_uguali: 'I due punti coincidono.',
    punti_non_validi: 'Punti non validi.',
    calcolo_non_finito: 'Il calcolo non ha dato un numero finito.'
  };
  function motivo(stato) { return MOTIVI[stato] || 'Misura non possibile.'; }

  function distanzaMm(cal, p1, p2) { return ALGORITMI.distanza.calcola(cal, [p1, p2]); }

  root.RFMSE.misure = { VERSIONE: '1.0', ALGORITMI: ALGORITMI, formattaMm: formattaMm, motivo: motivo, MOTIVI: MOTIVI };

  // API del righello v1, invariata.
  var api = {
    VERSIONE: ALGORITMI.distanza.versione,
    versoNativo: G.versoNativo, regionePer: G.regionePer, distanzaMm: distanzaMm,
    formattaMm: formattaMm, descriviCalibrazione: G.descriviCalibrazione, motivo: motivo
  };
  root.RFMisura = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
