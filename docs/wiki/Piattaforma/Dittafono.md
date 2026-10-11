---
tipo: piattaforma
aggiornata: 2026-10-11
---
# Dittafono

Una pagina della piattaforma, non un programma a parte. Fino al 22.9.2026 era l'applicazione «Dittafono clinico» (React, con il suo stile, il suo archivio, il suo service worker) mostrata dentro una cornice; sul telefono il tasto del menu **usciva dalla piattaforma** e la apriva a un indirizzo suo (`/dittafono/`). Sembrava software esterno perché lo era. Dal 23.9.2026 è `public/prototipo/bridge/12-dittafono.js`: stessa grafica, stessi medici, stessa coda.

## Che cosa fa

- **Registra col microfono del dispositivo** (telefono, tablet, computer). Un tasto grande: tocca per registrare, tocca per la pausa. Pausa e ripresa fanno **un audio solo**.
- **Riascolto con due gesti da dittafono vero**: si ferma il cursore in un punto e «**Inserisci qui**» registra un pezzo nuovo lì (il resto scivola avanti), «**Sovrascrivi da qui**» butta ciò che segue e rifà la dettatura da quel punto.
- **Chi detta e che cosa**: il medico dall'elenco dello studio (lo stesso della pagina Referti; obbligatorio solo se lo studio ne ha uno, come sul server) e il tipo (referto o visita registrata).
- **«Invia alla trascrizione»** manda un WAV mono 16 bit a 16 kHz a `POST /api/referti/upload`: la stessa coda in cui finiscono i file trascinati nella pagina Referti. La bozza arriva lì; sotto il registratore l'elenco «Dettati recenti» dice a che punto è ciascuno e porta alla bozza quando è pronta.
- **Resta sul dispositivo finché non si invia**: l'audio si salva in IndexedDB a ogni pausa e ogni 15 secondi mentre si registra. Se la pagina si chiude, alla riapertura c'è «C'è una registrazione non inviata di m:ss» con Riprendila / Scartala. Cambiare pagina mentre si registra mette in pausa e salva, non perde niente. Dopo l'invio la copia locale si cancella.
- **Pausa e ripresa col tasto delle cuffie** (8.10.2026, **in prova**, da accendere con la casella sotto il tasto; spenta di serie, la scelta resta sul dispositivo): con le cuffie col filo, il tasto al centro mette in pausa e riprende. Per il sistema quel tasto è «play/pausa» di chi sta suonando: la pagina tiene in ciclo un secondo di **silenzio** mentre si registra e si dichiara come lettore (Media Session; funzioni `rfDitCuffie*`). Se si sta riascoltando, il tasto ferma solo l'ascolto; doppio e triplo clic non fanno niente. **Non provato col tasto vero**: da qui si è verificata la logica (acceso/spento, silenzio valido, il tasto in registrazione mette in pausa senza perdere audio), non il comportamento di un telefono. Da vedere sul dispositivo: se il tasto arriva alla pagina mentre il microfono è aperto, e se far suonare il silenzio cambia la qualità della registrazione — se sì, si spegne la casella e tutto torna com'era.
- Lo schermo resta acceso mentre si registra (dove il browser lo permette); in pausa il microfono resta pronto due minuti, poi si rilascia da solo.

## Dettare con Dragon mentre la pagina registra (11.10.2026, in prova)

Uno dei medici detta già con Dragon (dettatura in tempo reale, licenza dello studio). Lo studio vuole usarlo **dentro** ReferralFlow senza perdere l'audio. Si accende con la casella «Detto con Dragon (o un altro programma di dettatura)», per dispositivo.

- **Una casella di testo e basta.** Dragon scrive nel campo dove sta il cursore, come in Word: fra lui e ReferralFlow **non c'è nessun collegamento**, né serve. Toccando il tasto per registrare il cursore va da solo nella casella. Il testo si corregge anche a mano.
- **La pagina registra in parallelo** dallo stesso microfono, e segna a che secondo dell'audio il testo è arrivato a quale lunghezza.
- **Tornare indietro.** L'audio ha i due gesti di sempre («Inserisci qui», «Sovrascrivi da qui», dal punto in cui è il cursore del riascolto); il testo si corregge nella casella, e alla ripresa il cursore **torna dov'era** (per aggiungere un pezzo in mezzo lo si mette lì prima di registrare). **Testo e audio però non sono legati**: dove va il pezzo nuovo nell'audio e dove va nel testo lo sceglie chi detta, uno per volta. Se li mette in punti diversi il confronto in revisione lo segnala come punto diverso.
- **«Invia» manda le due cose insieme**: l'audio nella coda di sempre e il testo accanto al dettato (`referti_audio.dettato_testo`, `dettato_tempi`, `dettato_fonte`, migrazione 090). Fino all'invio stanno tutti e due sul dispositivo, come l'audio.
- **La catena non cambia**: trascrive l'audio per conto suo, coi suoi controlli, e la **bozza da rivedere è la sua**. Così di uno stesso dettato ci sono due testi indipendenti.
- **In revisione** compare il riquadro «Dettato con Dragon»: il suo testo, con **evidenziati i punti in cui lui e il Mac hanno scritto cose diverse** (sotto, in piccolo, ciò che ha sentito il Mac; ∅ = una parola che ha solo il Mac), quante parole coincidono, e un clic **riascolta quel punto** — il secondo viene dalle parole della catena, che portano il loro tempo. Chi ha ragione non lo decide la pagina: lo dice l'audio. Il confronto è `src/lib/dettato-confronto.ts` (puro: sottosequenza comune più lunga sulle parole ridotte all'osso, fino a 3000 per parte).
- **Il microfono.** Dragon e il browser devono usare lo stesso microfono nello stesso momento. Dopo il primo permesso la pagina elenca i microfoni e si sceglie quello di Dragon. Se il testo arriva ma il microfono non sente niente (tipico: il programma lo tiene tutto per sé), la pagina **lo dice**; lo dice anche se si detta a registrazione ferma.

**Dove va la voce.** Quella che Dragon manda al suo servizio **non passa da ReferralFlow**: è la scelta che lo studio ha già fatto usando quel programma, col suo contratto. La parte nuova — registrazione, testo, confronto, trascrizione di controllo — resta sul dispositivo e sul Mac dello studio.

**Che cosa non è stato provato**: tutto ciò che dipende dal computer del medico — che Dragon scriva davvero nella casella del browser, che il microfono si condivida, com'è l'audio registrato in parallelo. Qui si è provato solo con testo scritto a mano e audio di prova.

**Che cosa ancora non fa**: il Mac **non rifinisce il testo di Dragon** — rifinisce la sua trascrizione, come sempre. Usare il testo di Dragon dentro la catena (come terzo testimone accanto a whisper e Voxtral, o come testo di partenza) è il passo dopo, e si decide coi numeri del confronto sulle prime dettature vere. Dragon dentro la pagina, col suo tasto e i comandi vocali, richiede il kit per sviluppatori e un contratto a parte.

## Come è fatto

La matematica è in `public/prototipo/dittafono-audio.js` (`RFDittafono`), pura e provata (`src/lib/prove-dittafono-audio.test.ts`): riduzione da 48 a 16 kHz con media, passaggio a 16 bit con taglio dei fuori scala, unione dei pezzi, **inserimento** e **sovrascrittura** a un campione, intestazione WAV. La pagina cattura l'audio con un nodo di elaborazione del browser e lo tiene come campioni a 16 bit: per questo inserire e sovrascrivere sono un taglio e una cucitura, non una ricodifica. Trenta minuti pesano circa 58 MB (il limite del caricamento è 200 MB).

**Microfono solo su indirizzo sicuro**: il browser lo concede su https (`https://cct.referralflow.ch`) o su localhost. Dall'indirizzo http della rete (o di Tailscale) la pagina si apre ma dice chiaramente che da lì il microfono non c'è. `Permissions-Policy: microphone=(self)` e `media-src 'self' blob:` in `next.config.mjs` restano necessari.

## Che cosa non c'è più, e che cosa non c'è ancora

La vecchia applicazione è stata tolta (`public/prototipo/dittafono/`, `public/dittafono/`, `pages-dittafono.js`). Chi l'aveva «installata» sul telefono arriva a `public/dittafono/index.html`, che toglie il suo service worker e le sue cache e porta alla pagina nuova; un `sw.js` sostitutivo fa lo stesso per chi ha ancora la vecchia aperta.

Rispetto alla vecchia mancano, per scelta: i **marcatori** (non andavano da nessuna parte: la catena non li leggeva), l'**annulla/ripristina** a più livelli (c'è «Sovrascrivi da qui») e la **riduzione dei silenzi** prima dell'invio (la catena ha già il suo VAD). Il legame del dettato con un **paziente o un appuntamento** al momento della registrazione non c'è ancora: oggi il paziente lo riconosce la catena dal dettato.
