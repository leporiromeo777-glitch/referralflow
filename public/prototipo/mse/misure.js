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

  /* ── strumenti comuni ── */
  // Tutti i punti in millimetri, con la calibrazione DEL PUNTO; per le
  // ecografie tutti nella stessa regione, o niente. Torna {stato} o
  // {stato:'ok', mm:[{x,y}], sx, sy, regione, avvisi}.
  function inMm(cal, punti, minimo, massimo) {
    if (!Array.isArray(punti) || punti.length < minimo || (massimo && punti.length > massimo)) return { stato: 'punti_non_validi' };
    for (var i = 0; i < punti.length; i++) if (!G.puntoValido(punti[i])) return { stato: 'punti_non_validi' };
    if (!cal || !cal.tipo) return { stato: 'non_calibrata' };
    for (var k = 0; k < punti.length; k++) if (!G.dentroImmagine(cal, punti[k])) return { stato: 'fuori_immagine' };
    // Prima ogni punto deve avere una calibrazione (fuori regione = niente),
    // POI si controlla che sia la stessa per tutti: l'ordine dei rifiuti è
    // lo stesso del verificatore indipendente, così i due motivi coincidono.
    var q = [], avvisi = [], mm = [];
    for (var j = 0; j < punti.length; j++) {
      var r = G.mmPerPixel(cal, punti[j]);
      if (r.stato !== 'ok') return { stato: r.stato };
      if (r.discordanti && avvisi.indexOf('regioni_sovrapposte_discordanti') < 0) avvisi.push('regioni_sovrapposte_discordanti');
      q.push(r);
    }
    for (var k2 = 1; k2 < q.length; k2++) if (q[k2].regione !== q[0].regione) return { stato: 'regioni_diverse' };
    for (var m = 0; m < punti.length; m++) mm.push({ x: punti[m].x * q[0].sx, y: punti[m].y * q[0].sy });
    return { stato: 'ok', mm: mm, sx: q[0].sx, sy: q[0].sy, regione: q[0].regione ? q[0].regione.indice : null, avvisi: avvisi };
  }
  function esito(base, valore, unita, extra) {
    if (!G.finito(valore) && valore !== null) return { stato: 'calcolo_non_finito' };
    return { stato: 'ok', valore: valore, mm: valore, unita: unita, extra: extra || {}, dx_mm: base.sx, dy_mm: base.sy,
             regione: base.regione, avvisi: base.avvisi, punti_fisici: base.mm };
  }
  function lunghezza(a, b) { return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)); }
  function lunghezzaTotale(mm, chiusa) {
    var t = 0;
    for (var i = 1; i < mm.length; i++) t += lunghezza(mm[i - 1], mm[i]);
    if (chiusa && mm.length > 2) t += lunghezza(mm[mm.length - 1], mm[0]);
    return t;
  }
  function puntiDistinti(mm) {
    for (var i = 1; i < mm.length; i++) if (mm[i].x === mm[i - 1].x && mm[i].y === mm[i - 1].y) return false;
    return true;
  }
  // Due segmenti chiusi si intersecano? (orientamenti, con i casi collineari)
  function orient(a, b, c) { var v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0; }
  function suSegmento(a, b, c) { return Math.min(a.x, b.x) - 1e-12 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-12 && Math.min(a.y, b.y) - 1e-12 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-12; }
  function segmentiIntersecano(a, b, c, d) {
    var o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && suSegmento(a, b, c)) return true;
    if (o2 === 0 && suSegmento(a, b, d)) return true;
    if (o3 === 0 && suSegmento(c, d, a)) return true;
    if (o4 === 0 && suSegmento(c, d, b)) return true;
    return false;
  }
  // Un poligono chiuso (ultimo lato: ultimo → primo) si autointerseca?
  function autointersecante(mm) {
    var n = mm.length;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;        // lati adiacenti
        if (segmentiIntersecano(mm[i], mm[(i + 1) % n], mm[j], mm[(j + 1) % n])) return true;
      }
    }
    return false;
  }
  // Formula del poligono (shoelace), in millimetri: sempre positiva.
  function areaPoligono(mm) {
    var a = 0, n = mm.length;
    for (var i = 0; i < n; i++) { var p = mm[i], q = mm[(i + 1) % n]; a += p.x * q.y - q.x * p.y; }
    return Math.abs(a) / 2;
  }

  var ALGORITMI = {
    // Distanza euclidea sul piano dell'immagine: gli spostamenti per asse in
    // pixel diventano millimetri con la calibrazione DEL PUNTO (la stessa
    // per entrambi, o niente), poi Pitagora sui millimetri.
    distanza: {
      nome: 'distanza', versione: '1.0', unita: 'mm', punti: [2, 2], gesto: 'trascina',
      equazione: 'd = sqrt(((x2-x1)*sx)^2 + ((y2-y1)*sy)^2)',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 2, 2);
        if (b.stato !== 'ok') return b;
        if (punti[0].x === punti[1].x && punti[0].y === punti[1].y) return { stato: 'punti_uguali' };
        return esito(b, lunghezza(b.mm[0], b.mm[1]), 'mm');
      }
    },
    // Somma delle lunghezze dei segmenti consecutivi, in millimetri.
    polilinea: {
      nome: 'polilinea', versione: '1.0', unita: 'mm', punti: [2, 200], gesto: 'punti',
      equazione: 'L = Σ_i sqrt((Δx_i·sx)^2 + (Δy_i·sy)^2)',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 2, 200);
        if (b.stato !== 'ok') return b;
        if (!puntiDistinti(b.mm)) return { stato: 'punti_uguali' };
        return esito(b, lunghezzaTotale(b.mm, false), 'mm', { segmenti: punti.length - 1 });
      }
    },
    // Angolo in V fra i bracci V→A e V→B, in gradi (0–180), calcolato sui
    // millimetri: con pixel non quadrati l'angolo sui pixel sarebbe sbagliato.
    angolo: {
      nome: 'angolo', versione: '1.0', unita: '°', punti: [3, 3], gesto: 'punti',
      equazione: 'θ = atan2(|u×v|, u·v) con u = A−V, v = B−V in mm',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 3, 3);
        if (b.stato !== 'ok') return b;
        var A = b.mm[0], V = b.mm[1], B = b.mm[2];
        var ux = A.x - V.x, uy = A.y - V.y, vx = B.x - V.x, vy = B.y - V.y;
        if ((ux === 0 && uy === 0) || (vx === 0 && vy === 0)) return { stato: 'punti_uguali' };
        var gradi = Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180 / Math.PI;
        return esito(b, gradi, '°', { bracci_mm: [Math.sqrt(ux * ux + uy * uy), Math.sqrt(vx * vx + vy * vy)] });
      }
    },
    // Rettangolo con i lati lungo gli assi dell'immagine, da due angoli opposti.
    rettangolo: {
      nome: 'rettangolo', versione: '1.0', unita: 'mm²', punti: [2, 2], gesto: 'trascina',
      equazione: 'A = |Δx·sx| · |Δy·sy| ; P = 2(|Δx·sx| + |Δy·sy|)',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 2, 2);
        if (b.stato !== 'ok') return b;
        var w = Math.abs(b.mm[1].x - b.mm[0].x), h = Math.abs(b.mm[1].y - b.mm[0].y);
        if (w === 0 || h === 0) return { stato: 'area_nulla' };
        return esito(b, w * h, 'mm²', { larghezza_mm: w, altezza_mm: h, perimetro_mm: 2 * (w + h) });
      }
    },
    // Ellisse inscritta nel rettangolo dei due angoli (assi lungo gli assi
    // dell'immagine). Area esatta; perimetro con la seconda approssimazione di
    // Ramanujan, dichiarata come tale.
    ellisse: {
      nome: 'ellisse', versione: '1.0', unita: 'mm²', punti: [2, 2], gesto: 'trascina',
      equazione: 'A = π·a·b con a = |Δx·sx|/2, b = |Δy·sy|/2 ; P ≈ π(a+b)(1 + 3h/(10+sqrt(4−3h))), h = ((a−b)/(a+b))^2',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 2, 2);
        if (b.stato !== 'ok') return b;
        var a1 = Math.abs(b.mm[1].x - b.mm[0].x) / 2, b1 = Math.abs(b.mm[1].y - b.mm[0].y) / 2;
        if (a1 === 0 || b1 === 0) return { stato: 'area_nulla' };
        var h = Math.pow((a1 - b1) / (a1 + b1), 2);
        var per = Math.PI * (a1 + b1) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
        return esito(b, Math.PI * a1 * b1, 'mm²', { semiasse_a_mm: a1, semiasse_b_mm: b1, perimetro_mm_approssimato: per });
      }
    },
    // Poligono chiuso tracciato a mano: area con la formula del poligono sui
    // millimetri. Un contorno che si incrocia non ha un'area: si rifiuta.
    poligono: {
      nome: 'poligono', versione: '1.0', unita: 'mm²', punti: [3, 500], gesto: 'punti_chiusi',
      equazione: 'A = |Σ_i (x_i·y_{i+1} − x_{i+1}·y_i)| / 2 in mm ; P = Σ lati',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 3, 500);
        if (b.stato !== 'ok') return b;
        if (!puntiDistinti(b.mm)) return { stato: 'punti_uguali' };
        if (autointersecante(b.mm)) return { stato: 'poligono_intrecciato' };
        var area = areaPoligono(b.mm);
        if (area <= 0) return { stato: 'area_nulla' };
        return esito(b, area, 'mm²', { perimetro_mm: lunghezzaTotale(b.mm, true), vertici: punti.length });
      }
    },
    // Perimetro di un contorno chiuso: la lunghezza, non l'area.
    perimetro: {
      nome: 'perimetro', versione: '1.0', unita: 'mm', punti: [3, 500], gesto: 'punti_chiusi',
      equazione: 'P = Σ_i sqrt((Δx_i·sx)^2 + (Δy_i·sy)^2), ultimo lato incluso',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 3, 500);
        if (b.stato !== 'ok') return b;
        if (!puntiDistinti(b.mm)) return { stato: 'punti_uguali' };
        if (autointersecante(b.mm)) return { stato: 'poligono_intrecciato' };
        return esito(b, lunghezzaTotale(b.mm, true), 'mm', { vertici: punti.length, area_mm2: areaPoligono(b.mm) });
      }
    },
    // Le coordinate fisiche di un punto (mm dall'angolo in alto a sinistra
    // dell'immagine, o della regione per le ecografie). Non ha un «valore».
    punto: {
      nome: 'punto', versione: '1.0', unita: 'mm', punti: [1, 1], gesto: 'punto',
      equazione: '(x·sx, y·sy)',
      calcola: function (cal, punti) {
        var b = inMm(cal, punti, 1, 1);
        if (b.stato !== 'ok') return b;
        var e = esito(b, null, 'mm', { x_mm: b.mm[0].x, y_mm: b.mm[0].y, x_px: punti[0].x, y_px: punti[0].y });
        return e;
      }
    },
    // Fase 9: due punti su fette diverse (o uguali) della stessa serie, nello
    // spazio paziente. Ogni punto porta la SUA immagine; le geometrie le
    // passa il contesto (ctx.geometrie[immagine_id]). Il Frame of Reference
    // deve essere lo stesso.
    distanza_3d: {
      nome: 'distanza_3d', versione: '1.0', unita: 'mm', punti: [2, 2], gesto: 'punti_3d',
      equazione: 'd = |P(B) − P(A)| con P(p) = IPP + r·x·sx + c·y·sy (C.7.6.2.1.1)',
      calcola: function (cal, punti, ctx) {
        var SR = root.RFMSE.serie;
        if (!SR) return { stato: 'modulo_serie_assente' };
        if (!Array.isArray(punti) || punti.length !== 2 || !G.puntoValido(punti[0]) || !G.puntoValido(punti[1])) return { stato: 'punti_non_validi' };
        var geometrie = (ctx && ctx.geometrie) || {};
        var gA = geometrie[punti[0].immagine_id], gB = geometrie[punti[1].immagine_id];
        if (!gA || !gB) return { stato: 'geometria_immagine_assente' };
        var d = SR.distanza3d(gA, punti[0], gB, punti[1]);
        if (d.stato !== 'ok') return { stato: d.stato };
        return { stato: 'ok', valore: d.mm, mm: d.mm, unita: 'mm', extra: { xyz_a: d.xyz_a, xyz_b: d.xyz_b, immagine_a: punti[0].immagine_id, immagine_b: punti[1].immagine_id, frame_of_reference: gA.spazio.frame_of_reference },
                 dx_mm: null, dy_mm: null, regione: null, avvisi: [], punti_fisici: [{ x: d.xyz_a[0], y: d.xyz_a[1], z: d.xyz_a[2] }, { x: d.xyz_b[0], y: d.xyz_b[1], z: d.xyz_b[2] }] };
      }
    },
    // Fase 9: volume da poligoni su fette consecutive: V = Σ area_i × d, con d
    // la distanza REALE fra le fette (uniforme, dalla geometria di serie), mai
    // Slice Thickness. Il contesto porta aree (mm²), indici di fetta e d.
    volume: {
      nome: 'volume', versione: '1.0', unita: 'mm³', punti: [0, 0], gesto: 'composto',
      equazione: 'V = Σ_i A_i · d, d = distanza uniforme fra fette adiacenti (dalle IPP)',
      calcola: function (cal, punti, ctx) {
        var v = ctx && ctx.volume;
        if (!v || !Array.isArray(v.aree_mm2) || !Array.isArray(v.indici) || v.aree_mm2.length !== v.indici.length) return { stato: 'volume_contesto_assente' };
        if (v.aree_mm2.length < 2) return { stato: 'volume_poche_fette' };
        if (!G.finito(v.d_mm) || v.d_mm <= 0) return { stato: 'fette_non_uniformi' };
        if (v.uniforme === false) return { stato: 'fette_non_uniformi' };
        var idx = v.indici.slice().sort(function (a, b) { return a - b; });
        for (var i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1) return { stato: 'poligoni_non_consecutivi' };
        var tot = 0;
        for (var k = 0; k < v.aree_mm2.length; k++) { if (!G.finito(v.aree_mm2[k]) || v.aree_mm2[k] <= 0) return { stato: 'area_nulla' }; tot += v.aree_mm2[k] * v.d_mm; }
        if (!G.finito(tot)) return { stato: 'calcolo_non_finito' };
        return { stato: 'ok', valore: tot, mm: tot, unita: 'mm³', extra: { aree_mm2: v.aree_mm2.slice(), indici: v.indici.slice(), d_mm: v.d_mm, n: v.aree_mm2.length, misure: v.misure ? v.misure.slice() : null, metodo: 'somma_aree_per_distanza' },
                 dx_mm: null, dy_mm: null, regione: null, avvisi: ['volume_per_somma_di_fette'], punti_fisici: [] };
      }
    }
  };

  // Per il banco di regressione: le misure composte si rifanno da ciò che
  // hanno salvato in `extra`, senza rileggere immagini.
  function ricalcolaDaExtra(tipo, extra) {
    if (!extra) return null;
    if (tipo === 'distanza_3d' && Array.isArray(extra.xyz_a) && Array.isArray(extra.xyz_b)) {
      var d = [extra.xyz_b[0] - extra.xyz_a[0], extra.xyz_b[1] - extra.xyz_a[1], extra.xyz_b[2] - extra.xyz_a[2]];
      return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    }
    if (tipo === 'volume' && Array.isArray(extra.aree_mm2) && G.finito(extra.d_mm)) {
      var t = 0; for (var i = 0; i < extra.aree_mm2.length; i++) t += extra.aree_mm2[i] * extra.d_mm; return t;
    }
    return null;
  }

  // «12,3 mm»: un decimale, virgola svizzera. L'arrotondamento è SOLO qui.
  function formattaMm(mm) {
    if (!G.finito(mm)) return '—';
    return (Math.round(mm * 10) / 10).toFixed(1).replace('.', ',') + ' mm';
  }
  // Il valore mostrato per ogni unità: mm con un decimale; le aree in cm² con
  // due decimali (è l'unità dei referti ecocardiografici); gradi con uno.
  function formattaValore(valore, unita, extra) {
    if (unita === 'mm³') return G.finito(valore) ? (Math.round(valore / 1000 * 100) / 100).toFixed(2).replace('.', ',') + ' mL' : '—';
    if (unita === 'mm²') return G.finito(valore) ? (Math.round(valore / 100 * 100) / 100).toFixed(2).replace('.', ',') + ' cm²' : '—';
    if (unita === '°') return G.finito(valore) ? (Math.round(valore * 10) / 10).toFixed(1).replace('.', ',') + '°' : '—';
    if (valore === null && extra && G.finito(extra.x_mm)) return '(' + formattaMm(extra.x_mm).replace(' mm', '') + '; ' + formattaMm(extra.y_mm) + ')';
    return formattaMm(valore);
  }

  var MOTIVI = {
    non_calibrata: 'Questa immagine non è calibrata: il file non dichiara la dimensione del pixel.',
    rivelatore: 'Radiografia: la spaziatura è quella del rivelatore, non del paziente. Qui non si misura.',
    fuori_regione: 'Entrambi i punti devono stare dentro l’area ecografica calibrata.',
    regioni_diverse: 'I due punti stanno in due aree con calibrazioni diverse.',
    fuori_immagine: 'Un punto è fuori dall’immagine.',
    punti_uguali: 'I due punti coincidono.',
    punti_non_validi: 'Punti non validi (troppo pochi, troppi o non numerici per questo strumento).',
    calcolo_non_finito: 'Il calcolo non ha dato un numero finito.',
    area_nulla: 'La figura non ha area: due lati coincidono.',
    poligono_intrecciato: 'Il contorno si incrocia: un poligono intrecciato non ha un’area.'
  };
  function motivo(stato) { return MOTIVI[stato] || 'Misura non possibile.'; }

  function distanzaMm(cal, p1, p2) { return ALGORITMI.distanza.calcola(cal, [p1, p2]); }

  root.RFMSE.misure = { VERSIONE: '1.2', ALGORITMI: ALGORITMI, formattaMm: formattaMm, formattaValore: formattaValore, motivo: motivo, MOTIVI: MOTIVI, autointersecante: autointersecante, areaPoligono: areaPoligono, ricalcolaDaExtra: ricalcolaDaExtra };

  // API del righello v1, invariata.
  var api = {
    VERSIONE: ALGORITMI.distanza.versione,
    versoNativo: G.versoNativo, regionePer: G.regionePer, distanzaMm: distanzaMm,
    formattaMm: formattaMm, descriviCalibrazione: G.descriviCalibrazione, motivo: motivo
  };
  root.RFMisura = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
