/* Dittafono — i comandi a voce, in funzioni pure (12.10.2026).
 *
 * Chi detta sul foglio può dare un'istruzione alla piattaforma: la parola d'ordine è «per favore» (scelta dello
 * studio), seguita da un comando — «per favore, inserisci la lettera più recente», oppure solo una o più PARTI
 * («per favore, inserisci l'anamnesi», «…FRCV e comorbidità dell'ultima lettera», «…la conclusione», «…la terapia»),
 * «per favore riprendimi la lettera fino alla terapia» (dall'inizio fino a quella parte), «per favore annulla». La parola d'ordine può stare anche in mezzo al comando, dopo il verbo («prendimi per favore
 * l'anamnesi»). Il programma di dettatura scrive la frase nel foglio come testo; la
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
  var VERSIONE = '1.12';
  // Una copia nuova a ogni ricerca: l'espressione ricorda dov'è arrivata, e due ricerche una dentro l'altra sulla
  // stessa copia non finivano più (la pagina si bloccava a ogni «per favore» senza comando, 12.10.2026).
  // Dopo la parola d'ordine il programma di dettatura può mettere da sé un punto, una virgola o un a capo.
  function parola() { return /\bper[ \t]*favor[ei]?(?![a-zà-ù])[ \t,:;.!…]*(?:\n[ \t]*)?/gi; }
  // Il verbo: all'imperativo, anche col pronome attaccato («inseriscimi», «aggiungimela»); all'infinito solo dopo
  // «puoi», «potresti», «vorrei» — «per favore aggiungere…» è una frase da lettera, non un comando.
  var VERBO = /^(?:(?:(?:mi|me|ora|adesso|qui|poi|tu)\s+)*(?:(?:inserisc[ia]|incolla|aggiung[ia]|riprendi|prendi|metti|copia|riporta)(?:mi|mela|melo|meli|mele|la|lo|li|le)?|damm(?:i|ela|elo|eli|ele))|(?:mi\s+)?(?:puoi|potresti|pu[oò]|vorrei|voglio)\s+(?:(?:che\s+)?(?:mi|tu)\s+)*(?:inser|incoll|aggiung|riprend|prend|mett|copi|riport)[a-zà-ù]{1,9})(?![a-zà-ù])/i;
  /* Il programma di dettatura NON scrive sempre il comando giusto (12.10.2026, dal log dello studio: il verbo arrivava
     all'infinito, «inserire l'anamnesi»). Quindi il verbo si accetta anche in un'altra coniugazione o un po' storpiato
     — stessa radice, o a una o due lettere di distanza da un verbo previsto — ma allora la frase deve FINIRE con la cosa
     chiesta: «per favore inserire l'anamnesi» è un comando, «per favore inserire la terapia nel piano di cura» no. */
  var CANONICI = ['inserisci', 'inseriscimi', 'incolla', 'incollami', 'aggiungi', 'aggiungimi', 'prendi', 'prendimi', 'riprendi', 'riprendimi', 'metti', 'mettimi', 'copia', 'copiami', 'riporta', 'riportami', 'dammi'];
  var CANONICI_VEDI = ['apri', 'aprimi', 'mostra', 'mostrami', 'visualizza', 'cerca', 'cercami', 'trova', 'trovami'];
  var RADICI = /^(?:inser|incoll|aggiung|riprend|prend|mett|copi|riport|ridamm|damm)[a-z]{0,9}$/, RADICI_VEDI = /^(?:apr(?:i|ir|e)[a-z]{0,5}|mostr[a-z]{1,7}|visualizz[a-z]{1,6}|cerc[a-z]{1,6}|trov[a-z]{1,6}|ved(?:i|ere|ermi|erla|erlo))$/;
  var NON_VERBI = { aprile: 1, copie: 1, metto: 0, messa: 1, presa: 1, cerchio: 1, trovato: 1, trovata: 1, mostrato: 1, mostrata: 1, inserito: 1, inserita: 1 };
  var RIEMPITIVI = /^(?:mi|me|ora|adesso|qui|poi|tu|puoi|potresti|puo|vorrei|voglio|che|devi|dovresti|ti|chiedo|di)$/;
  // Le terapie si «prendono», «riprendono», «mettono» e «aggiungono» anche nelle lettere: con quei verbi scritti in
  // un'altra forma («prendere la terapia.») la terapia non è un comando.
  var VERBI_DA_TERAPIA = /^(?:riprend|prend|mett|aggiung)/;
  function piana(w) { return String(w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, ''); }
  function distanza(a, b) {
    var r = [], i, j; for (j = 0; j <= b.length; j++) r[j] = j;
    for (i = 1; i <= a.length; i++) { var su = r[0]; r[0] = i; for (j = 1; j <= b.length; j++) { var t = r[j]; r[j] = Math.min(r[j] + 1, r[j - 1] + 1, su + (a[i - 1] === b[j - 1] ? 0 : 1)); su = t; } }
    return r[b.length];
  }
  function verboVicino(w) {
    if (w.length < 4 || NON_VERBI[w]) return null;
    if (RADICI.test(w)) return 'metti'; if (RADICI_VEDI.test(w)) return 'vedi';
    var soglia = w.length <= 5 ? 1 : 2, k;
    for (k = 0; k < CANONICI.length; k++) if (Math.abs(CANONICI[k].length - w.length) <= soglia && distanza(w, CANONICI[k]) <= soglia) return 'metti';
    for (k = 0; k < CANONICI_VEDI.length; k++) if (Math.abs(CANONICI_VEDI[k].length - w.length) <= soglia && distanza(w, CANONICI_VEDI[k]) <= soglia) return 'vedi';
    return null;
  }
  // Il verbo «più o meno»: in testa a `resto`, dopo al massimo tre parole di contorno. → { lungo, tipo, radice } o null.
  function verboCirca(resto) {
    var rx = /[^\s,;:.!?]+/g, m, n = 0;
    while ((m = rx.exec(resto)) && n < 4) {
      var w = piana(m[0]); n++;
      if (RIEMPITIVI.test(w)) continue;
      var tipo = verboVicino(w); if (!tipo) return null;
      var fine = m.index + m[0].length, pron = /^\s+(?:mi|me|mela|melo|la|lo)(?![a-zà-ù'’])/i.exec(resto.slice(fine));
      return { lungo: fine + (pron ? pron[0].length : 0), tipo: tipo, radice: w };
    }
    return null;
  }
  // I verbi del GUARDARE («aprimi la lettera», «fammi vedere l'ECG», «mostrami l'ultima lettera»): la lettera si apre
  // accanto al foglio e nel foglio non entra niente.
  var VEDI = /^(?:(?:(?:mi|me|ora|adesso|qui|poi|tu)\s+)*(?:apri(?:mi|mela|melo|la|lo)?|mostra(?:mi|mela|melo|la|lo)?|visualizza(?:mi|la|lo)?|fa(?:mmi|i|cci)\s+vedere|fammel[ao]\s+vedere|cerca(?:mi|mela|la)?|trova(?:mi|mela|la)?)|(?:mi\s+)?(?:puoi|potresti|pu[oò]|vorrei|voglio)\s+(?:(?:che\s+)?(?:mi|tu)\s+)*(?:(?:aprir|mostrar|veder|visualizzar|cercar|trovar)[a-zà-ù]{1,6}|far(?:mi|ci)?\s+vedere))(?![a-zà-ù])/i;
  // «Riprendi» vale solo per la lettera: «per favore riprendi la terapia…» è una frase da lettera.
  var SOLO_LETTERA = /riprend/i;
  // Che cosa si può chiedere: la lettera intera, oppure solo alcune PARTI («l'anamnesi», «FRCV e comorbidità»,
  // «la conclusione dell'ultima lettera»). I nomi delle parti sono quelli che il server conosce (src/lib/dittafono-comandi.ts).
  var LETTERA = /\b(?:lettera[ \t]+(?:(?:numero|num\.?|nr\.?|n\.)[ \t]*)?(?:[1-9][0-9]?|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici)(?![a-zà-ù0-9])|ultima\s+lettera|lettera\s+(?:pi[uù]\s+(?:recente|nuova)|precedente|vecchia|di\s+prima)|(?:pi[uù]\s+recente|precedente)\s+lettera)(?![a-zà-ù])/i;
  var PARTI = [
    ['anamnesi', /\b(?:anamnesi|namnesi|anamnesis|amnesia|ha[ \t]+namnesi)(?![a-zà-ù])/i],
    ['frcv', /\b(?:f\.?\s?r\.?\s?c\.?\s?v\b\.?|effe\s+erre\s+ci\s+v[ui](?![a-zà-ù])|(?:fattori\s+di\s+rischio|fattore\s+di\s+rischio|rischio)(?:\s+cardio[\s-]?vascolar[ei])?(?![a-zà-ù]))/i],
    // «Patologie associate» (21.10.2026, dallo studio: Dragon Medical One non scrive mai «comorbidità»): un PONTE solo nei
    // comandi — «per favore inserisci le patologie associate» porta la parte delle comorbidità della lettera, che resta
    // scritta com'era. Valgono anche «patologie/malattie concomitanti», «malattie associate», «altre patologie/malattie».
    ['comorbidita', /\b(?:(?:co|con|com)?[\s-]?morbi[dl]it[aàá]|(?:patologi[ae]|malatti[ae])[ \t]+(?:associat[ae]|concomitant[ei])(?![a-zà-ù])|altr[ae][ \t]+(?:patologi[ae]|malatti[ae])(?![a-zà-ù]))/i],
    ['allergie', /\ballergie(?![a-zà-ù])/i],
    ['diagnosi', /\bdiagnosi(?![a-zà-ù])/i],
    ['esame', /\besame\s+(?:clinico|obiettivo)(?![a-zà-ù])/i],
    ['ecg', /\b(?:ecg|e\.?[ \t]?c\.?[ \t]?g\.?|elettro[\s-]?cardiogramma)(?![a-zà-ù])/i],
    ['eco', /\b(?:eco[\s-]?cardio(?:gra(?:mma|fia))?|eco)(?![a-zà-ù])/i],
    ['sforzo', /\b(?:(?:ciclo|spiro)?ergometria|test\s+da\s+sforzo|prova\s+da\s+sforzo)(?![a-zà-ù])/i],
    ['holter', /\bholter(?![a-zà-ù])/i],
    ['laboratorio', /\b(?:laboratorio|esami\s+(?:di\s+laboratorio|del\s+sangue|ematici|ematochimici))(?![a-zà-ù])/i],
    ['conclusione', /\b(?:conclusion[ei]|valutazione)(?![a-zà-ù])/i],
    ['terapia', /\b(?:(?:ultima\s+)?terapia|farmaci|medicamenti)(?![a-zà-ù])/i]
  ];
  // Fra una parte e la successiva solo parole di legame («FRCV e le comorbidità», «anamnesi, FRCV»).
  var LEGAME = /^[ \t,]*(?:(?:e|ed|con|pi[uù]|poi|anche)[ \t]+)*(?:(?:il|lo|la|i|gli|le)[ \t]+|l['’][ \t]?)?$/i;
  // «La lettera» e basta («per favore riprendimi la lettera») è la più recente — ma solo se la frase finisce lì:
  // «prendi la lettera del collega…» è testo.
  var LETTERA_NUDA = /^[ \t,]*(?:(?:qui|mi|anche)[ \t]+)*(?:(?:il[ \t]+testo[ \t]+)?(?:di[ \t]+tutta[ \t]+|del)?(?:la[ \t]+|l['’][ \t]?))?(?:mia[ \t]+|sua[ \t]+)?lettera(?:[ \t]+(?:(?:numero|num\.?|nr\.?|n\.)[ \t]*)?(?:[1-9][0-9]?|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici)(?![a-zà-ù0-9]))?(?![a-zà-ù])/i;
  // Fra il verbo e la prima parte solo parole che non cambiano il senso («solo», «qui», «il testo di», l'articolo):
  // «per favore prendi la terapia regolarmente» lo è, «per favore metti in pausa la terapia» no.
  var ATTACCO = /^[ \t,]*(?:(?:solo|soltanto|anche|pure|qui|dentro|tutt[aoei]|mi)[ \t]+)*(?:il[ \t]+testo[ \t]+(?:di[ \t]+|del(?:la)?[ \t]+|dell['’][ \t]?))?(?:(?:il|lo|la|i|gli|le)[ \t]+|l['’][ \t]?)?$/i;
  // Da quale lettera («…dell'ultima lettera», «…della lettera precedente»): fa parte della richiesta.
  var DA_DOVE = /^[ \t,]*(?:(?:del(?:la)?|dal(?:la)?|di|nel(?:la)?)[ \t]+|(?:dell|dall|nell)['’][ \t]?)?(?:ultima\s+lettera|lettera(?:\s+(?:(?:(?:numero|num\.?|nr\.?|n\.)[ \t]*)?(?:[1-9][0-9]?|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici)(?![a-zà-ù0-9])|pi[uù]\s+(?:recente|nuova)|precedente|vecchia|di\s+prima))?|ultima\s+(?:volta|visita)|precedente|di\s+prima)(?![a-zà-ù])/i;
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
  var CODA = /^(?:[ \t]*,?[ \t]*(?:del(?:la)?\s+paziente|di\s+quest[oa]\s+paziente|e\s+(?:me\s+la\s+|poi\s+)?(?:aggiung|incoll|inserisc|mett|copi|riport)[a-z]{1,7}|qui(?:\s+(?:dentro|sotto|sopra))?|dentro|sopra|(?:nel|sul)\s+foglio|nella\s+lettera|nel\s+testo|(?:dalla|della|in|nella)\s+cartella|grazie|per\s+(?:favore|piacere|cortesia))(?![a-zà-ù]))*[ \t]*[.,;!]?/i;
  /* «Riprendimi la lettera FINO A…» (15.10.2026, richiesta dello studio): la lettera dall'inizio fino a una parte,
     compresa («fino alla terapia», «…fino alle comorbidità compresa»), oppure fino a dove quella parte comincia
     («fino a prima dell'esame clinico», «…fino all'ECG escluso»). */
  var FINO = /^[ \t,]*(?:(?:mi|qui|anche|solo)[ \t]+)*(?:(?:tutta[ \t]+)?(?:la[ \t]+|l['’][ \t]?)(?:mia[ \t]+|sua[ \t]+)?(?:ultima[ \t]+)?lettera(?:[ \t]+(?:(?:(?:numero|num\.?|nr\.?|n\.)[ \t]*)?(?:[1-9][0-9]?|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici)(?![a-zà-ù0-9])|pi[uù][ \t]+recente|precedente|di[ \t]+prima))?(?:[ \t]+(?:del(?:la)?|di[ \t]+quest[oa]|di[ \t]+questa?)[ \t]+paziente)?[ \t,]*)?(?:fino|sino)[ \t]+(?:(?:a[ \t]+)?(prima)[ \t]+(?:di[ \t]+|d['’][ \t]?|del(?:la|lo)?[ \t]+|dell['’][ \t]?|dei[ \t]+|degli[ \t]+|delle[ \t]+)|(?:a|ad|al|allo|alla|ai|agli|alle)[ \t]+|all['’][ \t]?)/i;
  var COMPRESA = /^[ \t,]*(?:(?:compres|inclus)[oaie]|(esclus[oaie]|(?:e[ \t]+)?non[ \t]+(?:compres|inclus)[oaie]))(?![a-zà-ù])/i;
  /* LE LETTERE PER NUMERO (21.10.2026, dallo studio: «le lettere numerate, così posso dire riprendimi l'anamnesi della
     lettera numero 1 invece della data»): accanto al foglio le lettere del paziente sono numerate dalla più recente
     (1 = la più recente), e nei comandi «la lettera numero 2», «lettera n. 2», «la lettera due» vuol dire quella. */
  var NUMERO_PAROLE = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici'];
  function numeroIn(t) {
    var m = /lettera[ \t]+(?:(?:numero|num\.?|nr\.?|n\.)[ \t]*)?([1-9][0-9]?|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici)(?![a-zà-ù0-9])/i.exec(String(t || ''));
    if (!m) return null;
    var w = m[1].toLowerCase();
    return /^\d+$/.test(w) ? Number(w) : w === 'una' ? 1 : NUMERO_PAROLE.indexOf(w);
  }
  var FRA = 45;      // quanti caratteri al massimo fra il verbo e la cosa chiesta («…il testo di tutta la…»)

  // Che comando c'è in testa a `resto` (ciò che segue la parola d'ordine)? → { fine, comando, parti, soloApri, verbo, esatto } o null.
  // `verbo` è quanto è lungo il verbo in testa (0 se non c'è), `esatto` dice se era scritto in una delle forme previste.
  // `mezzo`: c'era «per favore» fra il verbo e il resto («riprendimi per favore l'anamnesi»): allora è certamente un
  // comando, e anche «riprendi» vale per le parti — purché la frase finisca lì.
  function analizza(resto, mezzo) {
    var an = ANNULLA.exec(resto), fine = -1, comando = '', parti = null, soloApri = false, senzaVerbo = false, circa = null, v = null, finisce = false, escluso = false;
    if (an) { fine = an[0].length; comando = 'annulla'; }
    else {
      // Senza verbo («per favore l'anamnesi», «per favore la lettera più recente») vale solo se la frase finisce lì.
      // `senzaVerbo` vale anche per il verbo «più o meno»: in tutti e due i casi la frase deve finire con la cosa chiesta.
      v = VERBO.exec(resto);
      if (!v) { v = VEDI.exec(resto); soloApri = !!v; }
      if (!v) { circa = verboCirca(resto); if (circa) { v = [resto.slice(0, circa.lungo)]; soloApri = circa.tipo === 'vedi'; senzaVerbo = true; } }
      if (!v) { v = ['']; senzaVerbo = true; }
      var poi = resto.slice(v[0].length), frase = poi.split(/[.!?](?=\s+[A-ZÀ-Ý]|\s*$)/)[0];
      var fino = FINO.exec(frase), pf = fino ? partiIn(frase, fino[0].length, 3) : null;
      if (pf) {
        var dopoParte = pf.inizio + frase.slice(pf.inizio).search(/[ \t,.;!?]|$/), cmp = COMPRESA.exec(frase.slice(dopoParte));
        if (pf.parti.length > 1 || !cmp) dopoParte = pf.fine; else dopoParte += cmp[0].length;
        var doveF = DA_DOVE.exec(frase.slice(dopoParte));
        fine = v[0].length + dopoParte + (doveF ? doveF[0].length : 0); comando = 'fino'; parti = [pf.parti[0]];
        escluso = !!fino[1] || !!(cmp && cmp[1]);
      }
      var let_ = comando ? null : LETTERA.exec(frase); if (let_ && (let_.index > FRA || (senzaVerbo && !ATTACCO.test(frase.slice(0, let_.index))))) let_ = null;
      // le parti: subito dopo il verbo («inserisci l'anamnesi dell'ultima lettera») o dopo la lettera («dall'ultima lettera, l'anamnesi»)
      var soloLettera = SOLO_LETTERA.test(v[0]), p = comando || (soloLettera && !mezzo) ? null : partiIn(frase, 0, FRA);
      // «riprendimi l'anamnesi della lettera numero 1» (21.10.2026): con la lettera detta subito dopo la parte, anche
      // «riprendi» vale per le parti — «riprendi la terapia…» da sola resta una frase da lettera.
      if (!p && !comando && soloLettera && !mezzo) { var pr = partiIn(frase, 0, FRA), dd = pr && DA_DOVE.exec(frase.slice(pr.fine)); if (pr && dd && /lettera/i.test(dd[0])) p = pr; }
      if (p && soloLettera) finisce = true;
      if (p && circa && !mezzo && VERBI_DA_TERAPIA.test(circa.radice) && p.parti.indexOf('terapia') >= 0) p = null;
      if (let_ && (!p || let_.index < p.inizio) && !soloLettera) p = partiIn(frase, let_.index + let_[0].length, 25);
      if (comando) { /* già deciso: «fino a…» */ }
      else if (p) {
        var dove = DA_DOVE.exec(frase.slice(p.fine));
        fine = v[0].length + Math.max(p.fine + (dove ? dove[0].length : 0), let_ ? let_.index + let_[0].length : 0); comando = 'parti'; parti = p.parti;
      } else if (let_) { fine = v[0].length + let_.index + let_[0].length; comando = 'lettera_recente'; }
      else {
        var nuda = LETTERA_NUDA.exec(poi);
        if (nuda) { var dopoNuda = poi.slice(nuda[0].length), coda = CODA.exec(dopoNuda)[0]; if (/^\s*(?:$|[.,;!?\n]|[A-ZÀ-Ý])/.test(dopoNuda.slice(coda.length)) || /[.,;!]$/.test(coda)) { fine = v[0].length + nuda[0].length; comando = 'lettera_recente'; } }
      }
    }
    if (!comando) return null;
    fine += CODA.exec(resto.slice(fine))[0].length;
    if (comando !== 'annulla' && (senzaVerbo || finisce) && !/^\s*(?:$|[.,;!?]|[A-ZÀ-Ý])/.test(resto.slice(fine)) && !/[.,;!]$/.test(resto.slice(0, fine))) return null;
    return { fine: fine, comando: comando, parti: parti, escluso: escluso, soloApri: comando !== 'annulla' && soloApri, verbo: an ? an[0].length : v[0].length, esatto: !!an || !senzaVerbo, numero: comando === 'annulla' ? null : numeroIn(resto.slice(0, fine)) };
  }
  /* «Per favore» IN MEZZO al comando (13.10.2026, richiesta dello studio): «prendimi per favore l'anamnesi», «puoi per
     favore riprendermi la lettera», «fammi per favore vedere l'ECG». Ciò che sta PRIMA della parola d'ordine è dettato e
     di regola non si tocca: si torna indietro di quattro parole al massimo, senza passare un punto o un a capo, e solo
     se lì comincia un verbo di comando che arriva fino a «per favore» (o lo scavalca: «fammi | vedere»). Un verbo
     scritto in un'altra forma («prendere per favore l'anamnesi») vale solo a inizio frase. La cosa chiesta sta DOPO la
     parola d'ordine: «prendimi l'anamnesi per favore» non è previsto. → { da, fine (dopo la parola d'ordine), … } o null. */
  function inMezzo(t, qui, resto) {
    var riga = t.slice(Math.max(0, qui - 60), qui), base = qui - riga.length, conf = /[\n.!?;:…](?=[^\n.!?;:…]*$)/.exec(riga);
    var inizio = conf ? conf.index + 1 : 0, certo = !!conf || base === 0;      // `certo`: lì comincia davvero la frase
    var pezzo = riga.slice(inizio).replace(/[ \t,]+$/, ''), rx = /\S+/g, w, parole = [];
    while ((w = rx.exec(pezzo))) parole.push(w.index);
    if (!certo) parole.shift();      // tagliata a metà parola: la prima non conta
    for (var k = Math.max(0, parole.length - 4); k < parole.length; k++) {
      var testa = pezzo.slice(parole[k]), r = analizza(testa + ' ' + resto, true);
      if (!r || r.verbo < testa.length || r.fine <= testa.length + 1) continue;
      if (!r.esatto && !(certo && k === 0)) continue;
      return { da: base + inizio + parole[k], fine: r.fine - testa.length - 1, comando: r.comando, parti: r.parti, escluso: r.escluso, soloApri: r.soloApri, numero: r.numero };
    }
    return null;
  }

  // Il primo comando nel testo da `da0` in poi: { da, a, comando, frase, parola } — `da`/`a` sono i confini della frase
  // da togliere, `parola` è dove sta il suo «per favore».
  function trova(testo, da0) {
    var t = String(testo || ''), m, rx = parola();
    rx.lastIndex = Math.max(0, da0 || 0);
    while ((m = rx.exec(t))) {
      var dopo = m.index + m[0].length, resto = t.slice(dopo, dopo + 220).split('\n')[0];
      var c = inMezzo(t, m.index, resto), da = c ? c.da : m.index;
      if (!c) c = analizza(resto);
      if (c) return { da: da, a: dopo + c.fine, comando: c.comando, parti: c.parti, escluso: !!c.escluso, soloApri: c.soloApri, numero: c.numero || null, frase: t.slice(da, dopo + c.fine), parola: m.index };
    }
    return null;
  }
  // C'è un «per favore» che non è un comando? (per dire a chi detta che l'istruzione non è stata capita)
  function nonCapito(testo) {
    var t = String(testo || ''), m, n = 0, rx = parola();
    while ((m = rx.exec(t))) { var c = trova(t, m.index); if (!c || c.parola !== m.index) n++; }
    return n;
  }
  // Che cosa c'era scritto dopo l'ultimo «per favore» non capito (una riga, al massimo 60 caratteri): la pagina lo mostra
  // a chi detta, così si vede come il programma di dettatura ha scritto il comando.
  function letto(testo) {
    var t = String(testo || ''), m, rx = parola(), ultimo = null;
    while ((m = rx.exec(t))) { var c = trova(t, m.index); if (!c || c.parola !== m.index) ultimo = t.slice(m.index + m[0].length).split('\n')[0].slice(0, 60).trim(); }
    return ultimo;
  }
  // La FORMA di ciò che non è stato capito, senza le parole: c'era un verbo previsto, si nominava la lettera, quali
  // parti. La pagina la manda al server, che la scrive nel log: da lì si vede che cosa non viene riconosciuto.
  function forma(letto) {
    var t = String(letto || ''), parti = [];
    for (var k = 0; k < PARTI.length; k++) if (new RegExp(PARTI[k][1].source, 'i').test(t)) parti.push(PARTI[k][0]);
    return { verbo: VERBO.test(t) || VEDI.test(t) || !!verboCirca(t), lettera: /\blettera(?![a-zà-ù])/i.test(t), parti: parti, caratteri: t.length, parole: t.split(/\s+/).filter(Boolean).length };
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

  /* «Detto la lettera all'indirizzo del dottor Rossi per il paziente Bianchi Maria» (15.10.2026, richiesta dello studio).
     «Detto» Dragon spesso non lo scrive (19.10.2026, dallo studio): senza il verbo la frase vale se comincia una riga o una
     frase («La lettera che va all'indirizzo del dottor …»); «che va», «che è», «va» in mezzo vanno bene.
     non serve «per favore» (la frase è già un'istruzione, e nelle lettere non si scrive così). → { da, a, comando:
     'indirizzo', medico, paziente, nascita, donna, frase } o null. Medico e paziente li cerca il server, anche storpiati. */
  var INDIRIZZO = /(?:\bper[ \t]*favore[\s,:;.]*)?(?:\b(?:detto|dett[ao]|dettiamo|ditto|scrivo)\s+|(?:^|(?<=[.!?:]\s*)|(?<=\n[ \t]*)|(?<=\bper[ \t]*favore[\s,:;.]*)))(?:la\s+|una\s+)?lettera\s+(?:che\s+)?(?:(?:va|è|andrà|deve\s+andare)\s+)?(?:all['’]?\s*indirizzo|indirizzata|destinata)\s*(?:(?:a|al|alla|del|della|di)\s+|(?:all|dell)['’]\s*)?((?:dott(?:or|ore|oressa|\.ssa|\.)?|dr\.?(?:\s*med\.?)?(?:ssa)?|prof(?:essor|essore|essoressa)?\.?)\s+)?([^\n.;,]{2,60}?)(?:\s*,?\s*(?:per|riguardo\s+a|relativa\s+a)\s+(?:(?:il|la|al|alla|del|della)\s+)?(?:paziente|signor[ae]?|sig\.?(?:ra)?)\s+((?:[^\n.;]|\.(?=\d)){2,80}?))?\s*(?:[.;!](?!\d)|\n|$)/i;
  function trovaIndirizzo(testo) {
    var t = String(testo || ''), m = INDIRIZZO.exec(t); if (!m) return null;
    var medico = m[2].replace(/\s+(?:e|ed)\s*$/i, '').trim(), paz = (m[3] || '').trim(), nascita = null;
    var nt = /\s*,?\s*(?:nat[oa]\s+(?:il\s+)?)?(\d{1,2})[./](\d{1,2})[./](\d{4})\s*$/i.exec(paz);
    if (nt) { nascita = ('0' + nt[1]).slice(-2) + '.' + ('0' + nt[2]).slice(-2) + '.' + nt[3]; paz = paz.slice(0, nt.index).trim(); }
    paz = paz.replace(/\s*,?\s*nat[oa]\b.*$/i, '').trim();
    if (!/[a-zà-ù]{2}/i.test(medico) || /^(?:il|la)?\s*(?:paziente|signor[ae]?)\b/i.test(medico)) return null;
    // senza «detto» la frase vale solo col titolo del medico («…all'indirizzo DEL DOTTOR …»): «la lettera è indirizzata
    // al paziente» è una frase da lettera
    if (!/\b(?:detto|dett[ao]|dettiamo|ditto|scrivo)\b/i.test(m[0]) && !m[1]) return null;
    return { da: m.index, a: m.index + m[0].length, comando: 'indirizzo', medico: medico, paziente: paz, nascita: nascita, donna: /oressa|ssa\b/i.test(m[1] || '') || /^(?:la|della|alla)\b/i.test(t.slice(m.index).replace(/^.*?(?:indirizzo|indirizzata|destinata)\s*/i, '')), frase: m[0] };
  }

  root.RFComandi = { VERSIONE: VERSIONE, trova: trova, trovaIndirizzo: trovaIndirizzo, nonCapito: nonCapito, letto: letto, forma: forma, sostituisci: sostituisci };
})(typeof window !== 'undefined' ? window : globalThis);
