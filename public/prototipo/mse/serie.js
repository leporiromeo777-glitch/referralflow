/* Measurement Safety Engine — spazio paziente e geometria di serie (fase 9, 20.9.2026).
 *
 * Da un pixel di un'immagine alle coordinate DICOM del paziente (mm, sistema
 * LPS), con Image Orientation Patient, Image Position Patient e la spaziatura
 * (PS3.3 C.7.6.2.1.1). Da una serie di immagini alla sua geometria: normale
 * al piano, posizione di ogni fetta lungo la normale, distanza REALE fra le
 * fette (dalle posizioni, mai da Slice Thickness), uniformità, verso.
 * Niente DOM, niente rete: lo caricano il browser e il server (vm) e lo
 * provano i test. Fail closed: senza IOP/IPP/spaziatura non c'è spazio
 * paziente, e si dice quale manca.
 */
(function (root) {
  'use strict';

  var G = root.RFMSE && root.RFMSE.geometria;
  if (!G) throw new Error('mse/geometria.js va caricato prima di mse/serie.js');
  var VERSIONE = '1.0';

  function vettore(v, n) { if (!Array.isArray(v) || v.length !== n) return null; for (var i = 0; i < n; i++) if (!G.finito(v[i])) return null; return v.slice(); }
  function norma(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // Il piano di un'immagine: versori riga/colonna, normale, origine, spaziatura.
  // Torna {stato:'ok', r, c, n, o, sx, sy} oppure {stato:'<che cosa manca>'}.
  function piano(g) {
    if (!g || !g.spazio) return { stato: 'spazio_assente' };
    var iop = vettore(g.spazio.iop, 6), ipp = vettore(g.spazio.ipp, 3);
    if (!iop) return { stato: 'orientamento_assente' };
    if (!ipp) return { stato: 'posizione_assente' };
    var r = iop.slice(0, 3), c = iop.slice(3, 6);
    if (Math.abs(norma(r) - 1) > 1e-3 || Math.abs(norma(c) - 1) > 1e-3 || Math.abs(dot(r, c)) > 1e-3) return { stato: 'orientamento_non_ortonormale' };
    var s = g.spaziatura;
    if (!s || !G.finito(s.dx_mm) || !G.finito(s.dy_mm) || s.dx_mm <= 0 || s.dy_mm <= 0 || s.per_frame) return { stato: 'spaziatura_assente' };
    if (s.fonte === 'ImagerPixelSpacing') return { stato: 'rivelatore' };
    return { stato: 'ok', r: r, c: c, n: cross(r, c), o: ipp, sx: s.dx_mm, sy: s.dy_mm };
  }

  // Pixel (x colonna, y riga, frazionari, origine al centro del primo pixel
  // come nel DICOM) → coordinate paziente in mm.
  function versoPaziente(g, p) {
    var pl = piano(g);
    if (pl.stato !== 'ok') return { stato: pl.stato };
    if (!G.puntoValido(p)) return { stato: 'punti_non_validi' };
    var px = g.pixel || {};
    if (G.finito(px.colonne) && G.finito(px.righe) && px.colonne > 0 && px.righe > 0 && (p.x < 0 || p.x > px.colonne || p.y < 0 || p.y > px.righe)) return { stato: 'fuori_immagine' };
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) out[i] = pl.o[i] + pl.r[i] * p.x * pl.sx + pl.c[i] * p.y * pl.sy;
    return { stato: 'ok', xyz: out };
  }

  // Il verso del piano, per chi guarda: assiale / coronale / sagittale / obliquo.
  function orientamento(n) {
    var ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    var max = Math.max(ax, ay, az);
    if (max < 0.9) return 'obliquo';
    return az === max ? 'assiale' : ay === max ? 'coronale' : 'sagittale';
  }

  // La geometria di una serie da quelle delle sue immagini ({id, geometria}).
  // Ordina le fette lungo la normale, misura le distanze reali fra fette
  // adiacenti e decide se sono uniformi (tolleranza 1 %). Le immagini senza
  // spazio si contano e si escludono; il verso e lo spacing in piano devono
  // essere gli stessi per tutte, o la serie non è un volume.
  function analizzaSerie(immagini, tolleranza) {
    tolleranza = G.finito(tolleranza) ? tolleranza : 0.01;
    var fette = [], senza = 0, avvisi = [], for_ = null, forDiversi = false;
    var righe = null, colonne = null, sx = null, sy = null, n0 = null, r0 = null;
    for (var i = 0; i < (immagini || []).length; i++) {
      var im = immagini[i], g = im && im.geometria;
      var pl = piano(g);
      if (pl.stato !== 'ok') { senza++; continue; }
      var f = g.spazio.frame_of_reference || null;
      if (for_ === null) for_ = f; else if (f !== for_) forDiversi = true;
      if (righe === null) { righe = g.pixel.righe; colonne = g.pixel.colonne; sx = pl.sx; sy = pl.sy; n0 = pl.n; r0 = pl.r; }
      else {
        if (g.pixel.righe !== righe || g.pixel.colonne !== colonne) avvisi.push('dimensioni_diverse');
        if (Math.abs(pl.sx - sx) > 1e-6 || Math.abs(pl.sy - sy) > 1e-6) avvisi.push('spaziatura_diversa');
        if (Math.abs(dot(pl.n, n0)) < 0.999) avvisi.push('orientamento_diverso');
      }
      fette.push({ id: im.id, pos: dot(pl.o, n0), o: pl.o, frame_totali: g.identita ? g.identita.frame_totali : 1 });
    }
    var uniq = function (a) { return a.filter(function (x, k) { return a.indexOf(x) === k; }); };
    avvisi = uniq(avvisi);
    if (forDiversi) avvisi.push('frame_of_reference_diversi');
    if (!fette.length) return { versione: VERSIONE, stato: 'senza_spazio', n: 0, senza_spazio: senza, avvisi: avvisi };
    fette.sort(function (a, b) { return a.pos - b.pos; });
    var distanze = [];
    for (var k = 1; k < fette.length; k++) distanze.push(fette[k].pos - fette[k - 1].pos);
    var media = distanze.length ? distanze.reduce(function (a, b) { return a + b; }, 0) / distanze.length : null;
    var uniforme = distanze.length > 0 && media > 0 && distanze.every(function (d) { return Math.abs(d - media) <= tolleranza * media; });
    var doppie = distanze.some(function (d) { return Math.abs(d) < 1e-6; });
    if (doppie) avvisi.push('fette_sovrapposte');
    if (distanze.length && !uniforme) avvisi.push('distanza_fette_non_uniforme');
    var multiframe = fette.some(function (f) { return f.frame_totali > 1; });
    if (multiframe) avvisi.push('multiframe_non_gestito_come_volume');
    var volume = fette.length >= 3 && uniforme && !doppie && !multiframe && avvisi.indexOf('dimensioni_diverse') < 0 && avvisi.indexOf('spaziatura_diversa') < 0 && avvisi.indexOf('orientamento_diverso') < 0 && !forDiversi;
    return {
      versione: VERSIONE, stato: 'ok', n: fette.length, senza_spazio: senza,
      normale: n0, orientamento: orientamento(n0), righe: righe, colonne: colonne, sx: sx, sy: sy,
      frame_of_reference: for_, ordine: fette.map(function (f) { return f.id; }),
      posizioni: fette.map(function (f) { return f.pos; }),
      distanza_media_mm: media, distanza_min_mm: distanze.length ? Math.min.apply(null, distanze) : null, distanza_max_mm: distanze.length ? Math.max.apply(null, distanze) : null,
      uniforme: uniforme, volume_possibile: volume, avvisi: avvisi
    };
  }

  // Distanza fra due punti su immagini diverse (o uguali) della stessa serie:
  // entrambe nello spazio paziente, stesso Frame of Reference, poi la norma.
  function distanza3d(gA, pA, gB, pB) {
    var a = versoPaziente(gA, pA); if (a.stato !== 'ok') return { stato: a.stato };
    var b = versoPaziente(gB, pB); if (b.stato !== 'ok') return { stato: b.stato };
    var fa = gA.spazio.frame_of_reference || null, fb = gB.spazio.frame_of_reference || null;
    if (!fa || !fb || fa !== fb) return { stato: 'frame_of_reference_diversi' };
    var d = [b.xyz[0] - a.xyz[0], b.xyz[1] - a.xyz[1], b.xyz[2] - a.xyz[2]];
    var mm = norma(d);
    if (mm === 0) return { stato: 'punti_uguali' };
    return { stato: 'ok', mm: mm, xyz_a: a.xyz, xyz_b: b.xyz };
  }

  root.RFMSE.serie = { VERSIONE: VERSIONE, piano: piano, versoPaziente: versoPaziente, orientamento: orientamento, analizzaSerie: analizzaSerie, distanza3d: distanza3d, norma: norma, cross: cross, dot: dot };
})(typeof globalThis !== 'undefined' ? globalThis : this);
