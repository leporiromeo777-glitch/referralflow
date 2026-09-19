/* Measurement Safety Engine — Validation Gate (fase 7, 19.9.2026).
 *
 * Prima di ogni misura, e prima ancora di mostrare lo strumento, si decide:
 *   VALIDATED       — si misura;
 *   CAUTION         — si misura solo se QUEL caso è nella lista dei casi
 *                     validati nel piano di V&V (docs/legale/dispositivo-in-house/
 *                     piano-validazione.md → imaging/caution-validati.json);
 *   NOT_MEASURABLE  — strumento bloccato, con i motivi.
 * La UI non ha un ramo che ignori lo stato: riceve lo stato e i testi da qui,
 * e il server rifà lo stesso giudizio prima di salvare. Fail closed: se
 * qualcosa non si sa, è un motivo, non un'ipotesi.
 */
(function (root) {
  'use strict';

  var G = root.RFMSE && root.RFMSE.geometria, MI = root.RFMSE && root.RFMSE.misure;
  if (!G || !MI) throw new Error('mse/geometria.js e mse/misure.js vanno caricati prima di mse/validazione.js');

  var VERSIONE = '1.0';
  var MODALITA_VALIDATE = { CT: true, MR: true, US: true };

  // Motivi: bloccano. Avvisi: chiedono cautela.
  var TESTI = {
    geometria_assente: 'Geometria dell’immagine non letta: senza, non si misura.',
    geometria_versione: 'Geometria letta con una versione del lettore non riconosciuta.',
    immagine_non_valida: 'Dimensioni dell’immagine non valide.',
    modalita_non_validata: 'Modalità DICOM non validata per le misure (validate: CT, MR, US).',
    fotogramma_non_valido: 'Fotogramma inesistente.',
    calibrazione_assente: 'Calibrazione fisica non verificabile per questa immagine: il file non dichiara la dimensione del pixel.',
    calibrazione_non_valida: 'Calibrazione dichiarata ma non valida (zero, negativa o non numerica).',
    rivelatore: 'Radiografia: la spaziatura è quella del rivelatore, non del paziente. Qui non si misura.',
    spacing_per_frame: 'Spaziatura diversa da un fotogramma all’altro e nessun valore per questo fotogramma.',
    spacing_per_frame_variabile: 'Spaziatura diversa da un fotogramma all’altro: si usa quella dichiarata per questo fotogramma.',
    fuori_regione: 'Entrambi i punti devono stare dentro l’area ecografica calibrata.',
    regioni_diverse: 'I due punti stanno in due aree con calibrazioni diverse.',
    fuori_immagine: 'Un punto è fuori dall’immagine.',
    punti_uguali: 'I due punti coincidono.',
    punti_non_validi: 'Punti non validi.',
    calcolo_non_finito: 'Il calcolo non ha dato un numero finito.',
    area_nulla: 'La figura non ha area: due lati coincidono o i punti sono allineati.',
    poligono_intrecciato: 'Il contorno si incrocia: un poligono intrecciato non ha un’area.',
    spazio_assente: 'Il file non dichiara la posizione del piano nel paziente (IOP/IPP): niente spazio 3D.',
    orientamento_assente: 'Manca Image Orientation Patient.', posizione_assente: 'Manca Image Position Patient.',
    spaziatura_assente: 'Manca la spaziatura dei pixel nel paziente.',
    frame_of_reference_diversi: 'Le due immagini non condividono lo stesso Frame of Reference: le coordinate non sono confrontabili.',
    geometria_immagine_assente: 'Geometria di una delle immagini non disponibile.',
    modulo_serie_assente: 'Modulo dello spazio paziente non caricato.',
    volume_contesto_assente: 'Per il volume servono i poligoni sulle fette e la distanza fra le fette.',
    volume_poche_fette: 'Per un volume servono poligoni su almeno due fette consecutive.',
    fette_non_uniformi: 'La distanza fra le fette non è uniforme (o non è nota): il volume per somma di fette non è valido.',
    poligoni_non_consecutivi: 'I poligoni devono stare su fette consecutive, senza salti.',
    volume_per_somma_di_fette: 'Volume stimato come somma delle aree per la distanza fra le fette: dipende dal tracciato e dal passo.',
    algoritmo_sconosciuto: 'Strumento di misura non riconosciuto.',
    verifica_indipendente_fallita: 'Il secondo calcolo indipendente non coincide con il primo: misura non validata.',
    caution_non_validata: 'Situazione con limitazioni non ancora validata nel piano di V&V.',
    // avvisi
    pixel_spacing_e_regioni_discordanti: 'Il file dichiara due calibrazioni (PixelSpacing e regioni ecografiche) che non concordano: si usano le regioni.',
    calibrazione_geometry: 'Pixel Spacing corretto per un ingrandimento assunto (GEOMETRY): la profondità non è nota.',
    immagine_derivata: 'Immagine derivata o secondaria (ImageType): non è l’acquisizione originale.',
    immagine_ricostruita: 'Piano ricostruito (MPR) dalla serie: la misura lungo le fette vale quanto il passo fra le fette.',
    pixel_non_quadrati: 'Pixel non quadrati (Pixel Aspect Ratio): la vista può essere distorta; la misura usa la scala per asse.',
    regioni_sovrapposte_discordanti: 'Il punto cade in più regioni ecografiche con scale diverse: si è usata quella prioritaria.',
    spacing_per_frame_uniforme: 'Spaziatura dichiarata per fotogramma, uguale su tutti.',
    us_solo_pixel_spacing: 'Ecografia senza regioni calibrate: si usa il Pixel Spacing dichiarato.',
    orientamento_non_ortonormale: 'Orientamento del piano non ortonormale nel file.',
    pixel_spacing_calibrato_senza_tipo: 'Pixel Spacing diverso da quello del rivelatore senza il tipo di calibrazione.'
  };
  function testo(codice) {
    if (!codice) return '';
    var base = String(codice).split(':')[0];
    return TESTI[base] || ('Condizione non prevista: ' + codice);
  }

  // Che cosa sappiamo dell'immagine, PRIMA di qualunque punto: è lo stato
  // che l'indicatore (✓ ⚠ ✕) e il tasto mostrano.
  function statoImmagine(ctx) {
    ctx = ctx || {};
    var geo = ctx.geometria || null;
    // fase 6: la calibrazione effettiva del fotogramma su cui si misura
    var perFrame = !!(ctx.cal && ctx.cal.tipo === 'pixel_spacing_per_frame');
    var cal = perFrame ? G.calibrazionePerFrame(ctx.cal, ctx.frame) : (ctx.cal || null);
    var motivi = [], avvisi = [];
    if (perFrame) avvisi.push('spacing_per_frame_variabile');
    if (!cal && !geo) motivi.push('geometria_assente');
    if (geo && geo.versione !== 1) motivi.push('geometria_versione');
    var righe = geo && geo.pixel ? geo.pixel.righe : cal ? cal.righe : null;
    var colonne = geo && geo.pixel ? geo.pixel.colonne : cal ? cal.colonne : null;
    if (!G.finito(righe) || !G.finito(colonne) || righe <= 0 || colonne <= 0) motivi.push('immagine_non_valida');
    var modalita = geo && geo.identita ? geo.identita.modalita : (ctx.modalita || null);
    if (modalita && !MODALITA_VALIDATE[modalita]) motivi.push('modalita_non_validata');
    if (G.finito(ctx.frame) && G.finito(ctx.frameTotali) && (ctx.frame < 0 || ctx.frame >= Math.max(1, ctx.frameTotali))) motivi.push('fotogramma_non_valido');
    if (geo && geo.spaziatura && geo.spaziatura.per_frame && !perFrame) motivi.push('spacing_per_frame');
    if (cal) {
      if (!cal.tipo || cal.tipo === 'nessuna') motivi.push('calibrazione_assente');
      else if (cal.tipo === 'imager_pixel_spacing') motivi.push('rivelatore');
      else if (cal.tipo === 'pixel_spacing') {
        var s = cal.spacing;
        if (!s || !G.finito(s.dx_mm) || !G.finito(s.dy_mm) || s.dx_mm <= 0 || s.dy_mm <= 0) motivi.push('calibrazione_non_valida');
      } else if (cal.tipo === 'us_regioni') {
        if (!Array.isArray(cal.regioni) || !cal.regioni.length) motivi.push('calibrazione_assente');
        else for (var i = 0; i < cal.regioni.length; i++) {
          var r = cal.regioni[i];
          if (!G.finito(r.dx_mm) || !G.finito(r.dy_mm) || r.dx_mm <= 0 || r.dy_mm <= 0) { motivi.push('calibrazione_non_valida'); break; }
        }
      } else motivi.push('calibrazione_assente');
    } else if (geo) motivi.push('calibrazione_assente');
    // avvisi dalla lettura del file
    var letti = (geo && geo.avvisi_lettura) || (cal && cal.avvisi) || [];
    for (var k = 0; k < letti.length; k++) {
      var a = letti[k];
      if (a === 'pixel_spacing_e_regioni_discordanti' || a === 'immagine_derivata' || a === 'immagine_ricostruita' || a === 'pixel_non_quadrati' || a === 'spacing_per_frame_uniforme' || a === 'us_solo_pixel_spacing' || a === 'orientamento_non_ortonormale' || a === 'pixel_spacing_calibrato_senza_tipo') {
        if (avvisi.indexOf(a) < 0) avvisi.push(a);
      }
    }
    if (geo && geo.spaziatura && geo.spaziatura.calibrazione_tipo === 'GEOMETRY' && cal && cal.tipo === 'pixel_spacing') avvisi.push('calibrazione_geometry');
    var fine = chiudi(motivi, avvisi, ctx.cautionValidati);
    fine.cal = cal;      // la calibrazione effettiva usata (per fotogramma, se serve)
    return fine;
  }

  // Lo stato finale: motivi → NOT_MEASURABLE; avvisi → CAUTION, ma solo se
  // ogni avviso è nella lista dei casi validati; se no, blocca.
  function chiudi(motivi, avvisi, cautionValidati) {
    var validati = Array.isArray(cautionValidati) ? cautionValidati : [];
    var stato = 'VALIDATED';
    if (avvisi.length) {
      stato = 'CAUTION';
      for (var i = 0; i < avvisi.length; i++) {
        if (validati.indexOf(avvisi[i]) < 0) motivi.push('caution_non_validata:' + avvisi[i]);
      }
    }
    if (motivi.length) stato = 'NOT_MEASURABLE';
    return { stato: stato, motivi: motivi, avvisi: avvisi, testi: motivi.concat(avvisi).map(testo) };
  }

  // Una misura completa: stato dell'immagine + algoritmo + controlli sul
  // risultato. È l'unico ingresso per browser e server.
  function valuta(ctx) {
    ctx = ctx || {};
    var pre = statoImmagine(ctx);
    var motivi = pre.motivi.slice(), avvisi = pre.avvisi.slice();
    var alg = MI.ALGORITMI[ctx.algoritmo || 'distanza'];
    if (!alg) motivi.push('algoritmo_sconosciuto');
    var esito = null;
    var calEff = pre.cal || ctx.cal;
    var tridimensionale = alg && (alg.gesto === 'punti_3d' || alg.gesto === 'composto');
    if (tridimensionale) {
      // qui la calibrazione 2D dell'immagine corrente non decide: decidono le
      // geometrie nello spazio paziente (o il contesto del volume); i motivi
      // «di immagine» restano validi (fotogramma, modalità, geometria letta)
      motivi = motivi.filter(function (m) { return m !== 'calibrazione_assente' && m !== 'rivelatore' && m !== 'calibrazione_non_valida' && m !== 'spacing_per_frame'; });
      esito = alg.calcola(calEff, ctx.punti, ctx);
      if (esito.stato !== 'ok') { if (motivi.indexOf(esito.stato) < 0) motivi.push(esito.stato); }
      else for (var i3 = 0; i3 < (esito.avvisi || []).length; i3++) if (avvisi.indexOf(esito.avvisi[i3]) < 0) avvisi.push(esito.avvisi[i3]);
    } else if (alg && calEff) {
      esito = alg.calcola(calEff, ctx.punti, ctx);
      if (esito.stato !== 'ok') { if (motivi.indexOf(esito.stato) < 0) motivi.push(esito.stato); }
      else for (var i = 0; i < (esito.avvisi || []).length; i++) if (avvisi.indexOf(esito.avvisi[i]) < 0) avvisi.push(esito.avvisi[i]);
    }
    // gli avvisi nati dal calcolo passano dallo stesso filtro dei validati
    var fine = chiudi(motivi.filter(function (m) { return m.indexOf('caution_non_validata:') !== 0; }), avvisi, ctx.cautionValidati);
    var ok = fine.stato !== 'NOT_MEASURABLE' && esito && esito.stato === 'ok';
    return {
      stato: fine.stato, motivi: fine.motivi, avvisi: fine.avvisi, testi: fine.testi,
      ok: ok,
      valore: ok ? esito.valore : null, unita: alg ? alg.unita : null,
      valore_mostrato: ok ? MI.formattaValore(esito.valore, alg.unita, esito.extra) : null,
      extra: ok ? esito.extra : null,
      punti_fisici: ok ? esito.punti_fisici : null,
      dx_mm: ok ? esito.dx_mm : null, dy_mm: ok ? esito.dy_mm : null, regione: ok ? esito.regione : null,
      algoritmo: alg ? alg.nome : null, versione_algoritmo: alg ? alg.versione : null, versione_gate: VERSIONE,
      cal: calEff
    };
  }

  var SEGNI = { VALIDATED: '✓', CAUTION: '⚠', NOT_MEASURABLE: '✕' };
  var ETICHETTE = { VALIDATED: 'Calibrazione verificata', CAUTION: 'Calibrazione con limitazioni', NOT_MEASURABLE: 'Misurazione non disponibile' };

  root.RFMSE.validazione = { VERSIONE: VERSIONE, statoImmagine: statoImmagine, valuta: valuta, testo: testo, TESTI: TESTI, SEGNI: SEGNI, ETICHETTE: ETICHETTE, MODALITA_VALIDATE: MODALITA_VALIDATE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
