/* Dittafono — i comandi a voce, in funzioni pure (12.10.2026).
 *
 * Chi detta sul foglio può dare un'istruzione alla piattaforma: la parola d'ordine è «per favore» (scelta dello
 * studio), seguita da un comando — «per favore, inserisci la lettera più recente», «per favore, inserisci la terapia
 * dell'ultima lettera», «per favore annulla». Il programma di dettatura scrive la frase nel foglio come testo; la
 * pagina la riconosce, la toglie e mette al suo posto ciò che è stato chiesto.
 *
 * «Per favore» si può dire anche in una lettera vera («ti prego per favore di inviarmi…»): per questo una frase è un
 * comando SOLO se subito dopo la parola d'ordine c'è un verbo all'imperativo fra quelli previsti e poi una delle cose
 * che si possono chiedere. Tutto il resto rimane nel testo com'è.
 *
 * Niente DOM, niente rete: lo provano i test (src/lib/prove-dettato.test.ts) caricando questo stesso file.
 */
(function (root) {
  'use strict';
  var VERSIONE = '1.1';
  // Una copia nuova a ogni ricerca: l'espressione ricorda dov'è arrivata, e due ricerche una dentro l'altra sulla
  // stessa copia non finivano più (la pagina si bloccava a ogni «per favore» senza comando, 12.10.2026).
  function parola() { return /\bper\s*favore\b[ \t,:;]*/gi; }
  var VERBO = /^(?:(?:mi|ora|adesso|puoi|potresti|qui)\s+)*(?:inserisc[ia](?:mi)?|incolla(?:mi)?|aggiung[ia](?:mi)?|prendi(?:mi)?|metti(?:mi)?|riprendi(?:mi)?|copia(?:mi)?|riporta(?:mi)?|dammi|inserire|incollare|aggiungere|prendere|mettere|riprendere|copiare|riportare)(?![a-zà-ù])/i;
  // Che cosa si può chiedere. La terapia si guarda prima: «la terapia dell'ultima lettera» nomina anche la lettera.
  var TERAPIA = /\b(?:ultima\s+)?terapia(?![a-zà-ù])(?:[^.\n!?]{0,40}?(?:ultima\s+lettera|lettera\s+(?:pi[uù]\s+(?:recente|nuova)|precedente|vecchia|di\s+prima)|ultima\s+(?:volta|visita)|precedente|di\s+prima)(?![a-zà-ù]))?/i;
  var LETTERA = /\b(?:ultima\s+lettera|lettera\s+(?:pi[uù]\s+(?:recente|nuova)|precedente|vecchia|di\s+prima)|(?:pi[uù]\s+recente|precedente)\s+lettera)(?![a-zà-ù])/i;
  var ANNULLA = /^(?:annulla|togli(?:la|lo)?|toglimi(?:la|lo)?|rimuovi(?:la|lo)?)(?![a-zà-ù])(?:\s+(?:l['’]\s*ultim[oa]\s+(?:inserimento|aggiunta)|la\s+lettera|la\s+terapia|tutto|quello\s+che\s+hai\s+(?:messo|inserito|aggiunto)))?/i;
  // Ciò che di solito segue e fa ancora parte della richiesta («…del paziente e aggiungimela qui, grazie»).
  var CODA = /^(?:[ \t]*,?[ \t]*(?:del(?:la)?\s+paziente|di\s+quest[oa]\s+paziente|e\s+(?:me\s+la\s+|poi\s+)?(?:aggiung|incoll|inserisc|mett|copi|riport)[a-z]{1,7}|qui(?:\s+dentro)?|dentro|sopra|nel\s+foglio|nella\s+lettera|nel\s+testo|grazie)(?![a-zà-ù]))*[ \t]*[.,;!]?/i;
  var FRA = 45;      // quanti caratteri al massimo fra il verbo e la cosa chiesta («…il testo di tutta la…»)

  // Il primo comando nel testo da `da0` in poi: { da, a, comando, frase } — `da`/`a` sono i confini della frase da togliere.
  function trova(testo, da0) {
    var t = String(testo || ''), m, rx = parola();
    rx.lastIndex = Math.max(0, da0 || 0);
    while ((m = rx.exec(t))) {
      var dopo = m.index + m[0].length, resto = t.slice(dopo, dopo + 220).split('\n')[0];
      var an = ANNULLA.exec(resto), fine = -1, comando = '';
      if (an) { fine = an[0].length; comando = 'annulla'; }
      else {
        var v = VERBO.exec(resto);
        if (v) {
          var poi = resto.slice(v[0].length), frase = poi.split(/[.!?]/)[0];
          var ter = TERAPIA.exec(frase), let_ = LETTERA.exec(frase);
          if (ter && ter.index <= FRA && (!let_ || ter.index <= let_.index)) { fine = v[0].length + ter.index + ter[0].length; comando = 'terapia_recente'; }
          else if (let_ && let_.index <= FRA) { fine = v[0].length + let_.index + let_[0].length; comando = 'lettera_recente'; }
        }
      }
      if (comando) {
        fine += CODA.exec(resto.slice(fine))[0].length;
        return { da: m.index, a: dopo + fine, comando: comando, frase: t.slice(m.index, dopo + fine) };
      }
    }
    return null;
  }
  // C'è un «per favore» che non è un comando? (per dire a chi detta che l'istruzione non è stata capita)
  function nonCapito(testo) {
    var t = String(testo || ''), m, n = 0, rx = parola();
    while ((m = rx.exec(t))) { var c = trova(t, m.index); if (!c || c.da !== m.index) n++; }
    return n;
  }
  // Al posto di testo[da..a) mette `pezzo`, come paragrafo a sé; con `pezzo` vuoto toglie e ricuce.
  // → { testo, inizio, fine }: dove sta ora il pezzo.
  function sostituisci(testo, da, a, pezzo) {
    var t = String(testo || ''), p = String(pezzo || '').replace(/\r\n?/g, '\n').trim();
    var prima = t.slice(0, da).replace(/[ \t]+$/, ''), dopo = t.slice(a).replace(/^[ \t]+/, '');
    if (!p) {
      var cucito = prima && dopo && !/\n$/.test(prima) && !/^[\n.,;:!?]/.test(dopo) ? ' ' : '';
      if (/\n$/.test(prima)) dopo = dopo.replace(/^\n+/, '');
      return { testo: prima + cucito + dopo, inizio: prima.length, fine: prima.length };
    }
    prima = prima.replace(/\n+$/, ''); dopo = dopo.replace(/^\n+/, '');
    var testa = prima ? prima + '\n\n' : '';
    return { testo: testa + p + (dopo ? '\n\n' + dopo : ''), inizio: testa.length, fine: testa.length + p.length };
  }

  root.RFComandi = { VERSIONE: VERSIONE, trova: trova, nonCapito: nonCapito, sostituisci: sostituisci };
})(typeof window !== 'undefined' ? window : globalThis);
