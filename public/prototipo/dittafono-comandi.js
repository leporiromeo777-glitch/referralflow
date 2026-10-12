/* Dittafono — i comandi a voce, in funzioni pure (12.10.2026).
 *
 * Chi detta sul foglio può dare un'istruzione alla piattaforma: la parola d'ordine è «per favore» (scelta dello
 * studio), seguita da un comando — «per favore, inserisci la lettera più recente», oppure solo una o più PARTI
 * («per favore, inserisci l'anamnesi», «…FRCV e comorbidità dell'ultima lettera», «…la conclusione», «…la terapia»),
 * «per favore annulla». Il programma di dettatura scrive la frase nel foglio come testo; la
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
  var VERSIONE = '1.5';
  // Una copia nuova a ogni ricerca: l'espressione ricorda dov'è arrivata, e due ricerche una dentro l'altra sulla
  // stessa copia non finivano più (la pagina si bloccava a ogni «per favore» senza comando, 12.10.2026).
  // Dopo la parola d'ordine il programma di dettatura può mettere da sé un punto, una virgola o un a capo.
  function parola() { return /\bper[ \t]*favore\b[ \t,:;.!…]*(?:\n[ \t]*)?/gi; }
  // Il verbo: all'imperativo, anche col pronome attaccato («inseriscimi», «aggiungimela»); all'infinito solo dopo
  // «puoi», «potresti», «vorrei» — «per favore aggiungere…» è una frase da lettera, non un comando.
  var VERBO = /^(?:(?:(?:mi|me|ora|adesso|qui|poi|tu)\s+)*(?:(?:inserisc[ia]|incolla|aggiung[ia]|riprendi|prendi|metti|copia|riporta)(?:mi|mela|melo|meli|mele|la|lo|li|le)?|damm(?:i|ela|elo|eli|ele))|(?:mi\s+)?(?:puoi|potresti|pu[oò]|vorrei|voglio)\s+(?:(?:che\s+)?(?:mi|tu)\s+)*(?:inser|incoll|aggiung|riprend|prend|mett|copi|riport)[a-zà-ù]{1,9})(?![a-zà-ù])/i;
  // «Riprendi» vale solo per la lettera: «per favore riprendi la terapia…» è una frase da lettera.
  var SOLO_LETTERA = /riprend/i;
  // Che cosa si può chiedere: la lettera intera, oppure solo alcune PARTI («l'anamnesi», «FRCV e comorbidità»,
  // «la conclusione dell'ultima lettera»). I nomi delle parti sono quelli che il server conosce (src/lib/dittafono-comandi.ts).
  var LETTERA = /\b(?:ultima\s+lettera|lettera\s+(?:pi[uù]\s+(?:recente|nuova)|precedente|vecchia|di\s+prima)|(?:pi[uù]\s+recente|precedente)\s+lettera)(?![a-zà-ù])/i;
  var PARTI = [
    ['anamnesi', /\banamnesi(?![a-zà-ù])/i],
    ['frcv', /\b(?:f\.?\s?r\.?\s?c\.?\s?v\b\.?|fattori\s+di\s+rischio(?:\s+cardio\s?vascolar[ei])?(?![a-zà-ù]))/i],
    ['comorbidita', /\bco[\s-]?morbi[dl]it[aàá]/i],
    ['allergie', /\ballergie(?![a-zà-ù])/i],
    ['diagnosi', /\bdiagnosi(?![a-zà-ù])/i],
    ['esame', /\besame\s+(?:clinico|obiettivo)(?![a-zà-ù])/i],
    ['ecg', /\b(?:ecg|elettrocardiogramma)(?![a-zà-ù])/i],
    ['eco', /\b(?:ecocardiogra(?:mma|fia)|ecocardio|eco)(?![a-zà-ù])/i],
    ['sforzo', /\b(?:(?:ciclo|spiro)?ergometria|test\s+da\s+sforzo|prova\s+da\s+sforzo)(?![a-zà-ù])/i],
    ['holter', /\bholter(?![a-zà-ù])/i],
    ['laboratorio', /\b(?:laboratorio|esami\s+(?:di\s+laboratorio|del\s+sangue|ematici|ematochimici))(?![a-zà-ù])/i],
    ['conclusione', /\b(?:conclusion[ei]|valutazione)(?![a-zà-ù])/i],
    ['terapia', /\b(?:ultima\s+)?terapia(?![a-zà-ù])/i]
  ];
  // Fra una parte e la successiva solo parole di legame («FRCV e le comorbidità», «anamnesi, FRCV»).
  var LEGAME = /^[ \t,]*(?:(?:e|ed|con|pi[uù]|poi|anche)[ \t]+)*(?:(?:il|lo|la|i|gli|le)[ \t]+|l['’][ \t]?)?$/i;
  // «La lettera» e basta («per favore riprendimi la lettera») è la più recente — ma solo se la frase finisce lì:
  // «prendi la lettera del collega…» è testo.
  var LETTERA_NUDA = /^[ \t,]*(?:(?:qui|mi|anche)[ \t]+)*(?:(?:il[ \t]+testo[ \t]+)?(?:di[ \t]+tutta[ \t]+|del)?(?:la[ \t]+|l['’][ \t]?))?(?:mia[ \t]+|sua[ \t]+)?lettera(?![a-zà-ù])/i;
  // Fra il verbo e la prima parte solo parole che non cambiano il senso («solo», «qui», «il testo di», l'articolo):
  // «per favore prendi la terapia regolarmente» lo è, «per favore metti in pausa la terapia» no.
  var ATTACCO = /^[ \t,]*(?:(?:solo|soltanto|anche|pure|qui|dentro|tutt[aoei]|mi)[ \t]+)*(?:il[ \t]+testo[ \t]+(?:di[ \t]+|del(?:la)?[ \t]+|dell['’][ \t]?))?(?:(?:il|lo|la|i|gli|le)[ \t]+|l['’][ \t]?)?$/i;
  // Da quale lettera («…dell'ultima lettera», «…della lettera precedente»): fa parte della richiesta.
  var DA_DOVE = /^[ \t,]*(?:(?:del(?:la)?|dal(?:la)?|di|nel(?:la)?)[ \t]+|(?:dell|dall|nell)['’][ \t]?)?(?:ultima\s+lettera|lettera\s+(?:pi[uù]\s+(?:recente|nuova)|precedente|vecchia|di\s+prima)|ultima\s+(?:volta|visita)|precedente|di\s+prima)(?![a-zà-ù])/i;
  // Le parti nominate in una frase, nell'ordine in cui sono dette: la prima entro `entro` caratteri da `da`, le altre attaccate.
  function partiIn(frase, da, entro) {
    var viste = [];
    for (var k = 0; k < PARTI.length; k++) { var rx = new RegExp(PARTI[k][1].source, 'gi'), m; rx.lastIndex = da; while ((m = rx.exec(frase))) viste.push({ parte: PARTI[k][0], i: m.index, f: m.index + m[0].length }); }
    viste.sort(function (a, b) { return a.i - b.i || b.f - a.f; });
    var out = [], fine = -1, inizio = -1;
    for (var j = 0; j < viste.length; j++) {
      var v = viste[j];
      if (!out.length) { if (v.i - da <= entro && ATTACCO.test(frase.slice(da, v.i))) { out.push(v.parte); inizio = v.i; fine = v.f; } else break; continue; }
      if (v.i < fine) continue;      // dentro la parte già presa («ecg holter»)
      if (!LEGAME.test(frase.slice(fine, v.i))) break;
      if (out.indexOf(v.parte) < 0) out.push(v.parte); fine = v.f;
    }
    return out.length ? { parti: out, inizio: inizio, fine: fine } : null;
  }
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
      var an = ANNULLA.exec(resto), fine = -1, comando = '', parti = null;
      if (an) { fine = an[0].length; comando = 'annulla'; }
      else {
        var v = VERBO.exec(resto);
        if (v) {
          var poi = resto.slice(v[0].length), frase = poi.split(/[.!?](?=\s+[A-ZÀ-Ý]|\s*$)/)[0];
          var let_ = LETTERA.exec(frase); if (let_ && let_.index > FRA) let_ = null;
          // le parti: subito dopo il verbo («inserisci l'anamnesi dell'ultima lettera») o dopo la lettera («dall'ultima lettera, l'anamnesi»)
          var p = SOLO_LETTERA.test(v[0]) ? null : partiIn(frase, 0, FRA);
          if (let_ && (!p || let_.index < p.inizio) && !SOLO_LETTERA.test(v[0])) p = partiIn(frase, let_.index + let_[0].length, 25);
          if (p) {
            var dove = DA_DOVE.exec(frase.slice(p.fine));
            fine = v[0].length + Math.max(p.fine + (dove ? dove[0].length : 0), let_ ? let_.index + let_[0].length : 0); comando = 'parti'; parti = p.parti;
          } else if (let_) { fine = v[0].length + let_.index + let_[0].length; comando = 'lettera_recente'; }
          else {
            var nuda = LETTERA_NUDA.exec(poi);
            if (nuda) { var dopoNuda = poi.slice(nuda[0].length), coda = CODA.exec(dopoNuda)[0]; if (/^\s*(?:$|[.,;!?\n]|[A-ZÀ-Ý])/.test(dopoNuda.slice(coda.length)) || /[.,;!]$/.test(coda)) { fine = v[0].length + nuda[0].length; comando = 'lettera_recente'; } }
          }
        }
      }
      if (comando) {
        fine += CODA.exec(resto.slice(fine))[0].length;
        return { da: m.index, a: dopo + fine, comando: comando, parti: parti, frase: t.slice(m.index, dopo + fine) };
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
  // Che cosa c'era scritto dopo l'ultimo «per favore» non capito (una riga, al massimo 60 caratteri): la pagina lo mostra
  // a chi detta, così si vede come il programma di dettatura ha scritto il comando.
  function letto(testo) {
    var t = String(testo || ''), m, rx = parola(), ultimo = null;
    while ((m = rx.exec(t))) { var c = trova(t, m.index); if (!c || c.da !== m.index) ultimo = t.slice(m.index + m[0].length).split('\n')[0].slice(0, 60).trim(); }
    return ultimo;
  }
  // La FORMA di ciò che non è stato capito, senza le parole: c'era un verbo previsto, si nominava la lettera, quali
  // parti. La pagina la manda al server, che la scrive nel log: da lì si vede che cosa non viene riconosciuto.
  function forma(letto) {
    var t = String(letto || ''), parti = [];
    for (var k = 0; k < PARTI.length; k++) if (new RegExp(PARTI[k][1].source, 'i').test(t)) parti.push(PARTI[k][0]);
    return { verbo: VERBO.test(t), lettera: /\blettera(?![a-zà-ù])/i.test(t), parti: parti, caratteri: t.length, parole: t.split(/\s+/).filter(Boolean).length };
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

  root.RFComandi = { VERSIONE: VERSIONE, trova: trova, nonCapito: nonCapito, letto: letto, forma: forma, sostituisci: sostituisci };
})(typeof window !== 'undefined' ? window : globalThis);
