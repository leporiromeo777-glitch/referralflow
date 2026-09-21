---
tipo: piattaforma
aggiornata: 2026-09-23
---
# Dittafono

Una pagina della piattaforma, non un programma a parte. Fino al 22.9.2026 era l'applicazione «Dittafono clinico» (React, con il suo stile, il suo archivio, il suo service worker) mostrata dentro una cornice; sul telefono il tasto del menu **usciva dalla piattaforma** e la apriva a un indirizzo suo (`/dittafono/`). Sembrava software esterno perché lo era. Dal 23.9.2026 è `public/prototipo/bridge/12-dittafono.js`: stessa grafica, stessi medici, stessa coda.

## Che cosa fa

- **Registra col microfono del dispositivo** (telefono, tablet, computer). Un tasto grande: tocca per registrare, tocca per la pausa. Pausa e ripresa fanno **un audio solo**.
- **Riascolto con due gesti da dittafono vero**: si ferma il cursore in un punto e «**Inserisci qui**» registra un pezzo nuovo lì (il resto scivola avanti), «**Sovrascrivi da qui**» butta ciò che segue e rifà la dettatura da quel punto.
- **Chi detta e che cosa**: il medico dall'elenco dello studio (lo stesso della pagina Referti; obbligatorio solo se lo studio ne ha uno, come sul server) e il tipo (referto o visita registrata).
- **«Invia alla trascrizione»** manda un WAV mono 16 bit a 16 kHz a `POST /api/referti/upload`: la stessa coda in cui finiscono i file trascinati nella pagina Referti. La bozza arriva lì; sotto il registratore l'elenco «Dettati recenti» dice a che punto è ciascuno e porta alla bozza quando è pronta.
- **Resta sul dispositivo finché non si invia**: l'audio si salva in IndexedDB a ogni pausa e ogni 15 secondi mentre si registra. Se la pagina si chiude, alla riapertura c'è «C'è una registrazione non inviata di m:ss» con Riprendila / Scartala. Cambiare pagina mentre si registra mette in pausa e salva, non perde niente. Dopo l'invio la copia locale si cancella.
- Lo schermo resta acceso mentre si registra (dove il browser lo permette); in pausa il microfono resta pronto due minuti, poi si rilascia da solo.

## Come è fatto

La matematica è in `public/prototipo/dittafono-audio.js` (`RFDittafono`), pura e provata (`src/lib/prove-dittafono-audio.test.ts`): riduzione da 48 a 16 kHz con media, passaggio a 16 bit con taglio dei fuori scala, unione dei pezzi, **inserimento** e **sovrascrittura** a un campione, intestazione WAV. La pagina cattura l'audio con un nodo di elaborazione del browser e lo tiene come campioni a 16 bit: per questo inserire e sovrascrivere sono un taglio e una cucitura, non una ricodifica. Trenta minuti pesano circa 58 MB (il limite del caricamento è 200 MB).

**Microfono solo su indirizzo sicuro**: il browser lo concede su https (`https://cct.referralflow.ch`) o su localhost. Dall'indirizzo http della rete (o di Tailscale) la pagina si apre ma dice chiaramente che da lì il microfono non c'è. `Permissions-Policy: microphone=(self)` e `media-src 'self' blob:` in `next.config.mjs` restano necessari.

## Che cosa non c'è più, e che cosa non c'è ancora

La vecchia applicazione è stata tolta (`public/prototipo/dittafono/`, `public/dittafono/`, `pages-dittafono.js`). Chi l'aveva «installata» sul telefono arriva a `public/dittafono/index.html`, che toglie il suo service worker e le sue cache e porta alla pagina nuova; un `sw.js` sostitutivo fa lo stesso per chi ha ancora la vecchia aperta.

Rispetto alla vecchia mancano, per scelta: i **marcatori** (non andavano da nessuna parte: la catena non li leggeva), l'**annulla/ripristina** a più livelli (c'è «Sovrascrivi da qui») e la **riduzione dei silenzi** prima dell'invio (la catena ha già il suo VAD). Il legame del dettato con un **paziente o un appuntamento** al momento della registrazione non c'è ancora: oggi il paziente lo riconosce la catena dal dettato.
