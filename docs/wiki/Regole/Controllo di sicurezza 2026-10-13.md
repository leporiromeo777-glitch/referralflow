---
tags: regole
---

# Controllo di sicurezza del 13.10.2026

Che cosa è stato guardato, che cosa è stato trovato e corretto, che cosa resta da decidere. Chiesto dallo studio: «tutto funzioni, nessun bug, software sicuro, nessun dato sensibile esposto o in uscita dal Mac, protezioni del Mac attive». Metodo: tre letture indipendenti del codice (accessi e isolamento fra studi; ciò che esce o si espone; sicurezza web e dei file), più i controlli dal vivo sul Mac (protezioni, porte, servizi, copie). Senza mai leggere dati clinici.

## Corretto quel giorno

| Che cosa | Dov'era | Com'è ora |
|---|---|---|
| **Chiunque fosse entrato poteva cambiare la password di un altro utente** (anche dell'amministratore) | `programma/feed/actions.ts`, `saveProvider` | le quattro azioni sono di amministrazione e tecnico; la password di un utente esistente non si cambia più da lì |
| Un documento chiamato «-qualcosa» diventava un'opzione del comando `zip` (che ne ha che eseguono comandi) | `dividi/server.ts`, `zipDi` | `--` e `./` davanti ai nomi |
| Un nome con l'apostrofo (o scritto apposta) usciva dalla stringa di un gestore `onclick` ed eseguiva codice | 54 punti in `public/prototipo/**` | `jsq`/`rfJs` (in `app.js`, `bridge/01-dati.js`): ogni carattere pericoloso diventa `\xNN`; il valore arriva identico alla funzione |
| Il nome del paziente scritto così com'era nelle pagine vecchie | `pages-core.js`, `pages-more.js`, `guided-review.js` | `esc(fullName(…))`; in più `<` e `>` si tolgono dai nomi all'ingresso |
| La sessione valeva per la sola firma: un utente disattivato restava dentro fino a 8 ore, e un gettone firmato per un utente inesistente veniva accettato | `lib/auth.ts`, `getSession` | a ogni richiesta l'utente si riscontra sul database (esiste, è attivo, è di quello studio; ruolo dal database), con memoria di 15 secondi; chi viene disattivato esce subito |
| «Domanda medica» e «Ricerca clinica» uscivano verso il fornitore anche con l'interruttore spento | `lib/fornitore-esterno.ts` | **un interruttore solo** (`attivo` in `~/.referralflow-esterno.conf`) per tutto ciò che esce, catena e piattaforma |
| Con la sola chiave nell'ambiente l'impegnativa sarebbe uscita in chiaro | `lib/impegnativa.ts` | serve anche `IMPEGNATIVA_CLOUD=1` |
| L'app ascoltava in chiaro su tutte le schede di rete | `mac/server-avvio.sh` | solo `127.0.0.1` |
| Rotte vecchie dei referti senza controllo di ruolo (bastava essere entrati e conoscere l'id) | `api/referti/{pdf,docx,audio,revisione}/[id]`, `struttura`, `upload`, `stato`, `statistiche/chiedi`, `export/referrals` | `vietato(ruolo, sezione)` |
| Codici a sei cifre senza limite di tentativi | `attiva/actions.ts`, `portale/[token]/actions.ts` | cinque errori e il codice è annullato (`lib/tentativi-codice.ts`) |
| Chiave dei giri periodici confrontata con `===` | `lib/cron-chiave.ts` | confronto a tempo costante |
| Dopo l'accesso si poteva essere mandati su un altro sito (`/\\host`) | `login/actions.ts` | niente barre rovesciate né spazi |
| `/inviati` saltava il filtro dei ruoli (cominciava come `/invia`, che è pubblica) | `src/proxy.ts` | `invia/` e `invia$` |
| Un'agenda esterna poteva puntare al Mac stesso o alla rete dello studio | `lib/agenda-sync.ts` | indirizzi interni rifiutati |
| La bozza del dittafono nel browser era di nessuno: chi entrava dopo sullo stesso computer se la vedeva offrire | `bridge/12-dittafono.js` | ha la chiave dell'utente e scade dopo sette giorni |
| Messaggi d'errore del database nei registri (possono riportare il valore rifiutato); l'e-mail di un utente in un registro | `referti-conferma.ts`, `api/referti/bozza`, `api/prototipo/anonimizza` | solo il codice dell'errore; l'id abbreviato |
| Risposte delle API senza divieto di conservazione | — | `Cache-Control: no-store` su `/api/*` (`next.config.mjs`) |
| `.env`, copie del database, `uploads/` e registri leggibili dagli altri utenti del Mac | permessi 644/755 | 600/700; `backup-db.sh` parte con `umask 077` |
| Pagine delle proposte del consolidatore (nate dalle correzioni vere) nel repository pubblico | `docs/wiki/Proposte/<data>.md`, `Ultime.md` | fuori dal repository (`.gitignore`); restano sul Mac. Le 27 già pubblicate, rilette da chi ha fatto il controllo, avevano solo parole generiche; **restano nella storia di git** |

## Controllato e trovato a posto

- Senza sessione le rotte rispondono 401 (provato dal vivo), i giri periodici 404 senza chiave; nessun accesso fra studi a livello SQL; password con argon2; cookie HttpOnly, Secure, SameSite=Lax; 2FA.
- Catena: ogni uscita passa dalla pseudonimizzazione, che annulla se il modello locale fallisce; `attivo=0`; nei registri solo id, fasi, conteggi.
- Nessuna chiave nel repository né nei suoi 718 commit. Nessuna risorsa esterna caricata dalle pagine.
- I servizi di ReferralFlow non hanno collegamenti aperti verso l'esterno (visto dal vivo). Database, Ollama, pannello, wiki: solo su 127.0.0.1.
- Mac: FileVault acceso, SIP e Gatekeeper attivi, firewall acceso in modalità invisibile, blocco schermo a 5 minuti, niente accesso automatico né ospite, accesso remoto e condivisioni spenti, aggiornamenti automatici accesi.
- Prove: `npm run test:app` 444/444, `test:audit` 25/25, `prove-catastrofiche.py` 45/45.

## Da decidere con lo studio (non toccato)

1. ~~Nessuna copia fuori dal Mac~~ — **deciso e fatto il 13.10**: copia cifrata sul server dello studio, vedi [[Piattaforma/Server Mac mini]]. Resta da fare: tenere una copia della chiave fuori dal Mac, e provare una volta un ripristino.
2. **`mac/apri-finestra.sh`** apre un tunnel Cloudflare sulla piattaforma coi pazienti veri (spento; il traffico passerebbe in chiaro da Cloudflare, che non è fra i fornitori autorizzati), e `.env` ha `ORIGINI_CONSENTITE=*.trycloudflare.com`. Storia: lo script è del 17.9.2026 (per far vedere un referto vero in una riunione) e **non risulta mai usato** (il suo registro non esiste); il tunnel usato dal 16 al 23.9 era quello del sito dimostrativo (`demo-link.sh`, dati inventati). Toglierli?
3. **LM Studio** è aperto, ascolta sulla rete (porta 41488) e tiene due collegamenti verso l'esterno: non serve a ReferralFlow. **Tailscale** lo studio lo usa per il controllo da remoto del Mac (13.10): resta; il filtro pf non copre la sua scheda, quindi i dispositivi di quella rete privata arrivano alla piattaforma in https (non più alla porta 3000).
4. ~~Il sito dimostrativo~~ — **spento il 13.10** su richiesta dello studio (`launchctl bootout` + `disable` di `ch.referralflow.demo`): non riparte all'accesso. Il database demo resta, serve alle prove.
5. **PostgreSQL** accetta senza password chiunque dal Mac stesso (`trust`): va bene finché sul Mac lavora solo lo studio.
6. **Aggiornamenti in attesa**: macOS 26.7.1, Safari 27; `next` e `nodemailer` hanno correzioni di sicurezza da installare (da fare con le prove complete).
7. **Più studi sullo stesso server**: archivio immagini, MediOnline, pressione e ciclo leggono una configurazione sola del Mac, non dello studio. Oggi lo studio è uno; prima del secondo va recintato.
8. ntfy.sh riceve gli avvisi della sentinella (stati, numeri, nomi dei medici): è un servizio pubblico.
9. La wiki (porta 3443) e l'app stanno sullo stesso nome: una pagina della wiki potrebbe mandare richieste all'app col cookie di chi è entrato. Rimedio: controllo dell'origine sulle rotte che scrivono (non fatto: il filtro di Next limita la dimensione dei caricamenti).
10. Limite dei tentativi d'accesso basato sull'indirizzo dichiarato e in memoria; segreti del secondo fattore in chiaro nel database; indirizzi della rete interna in alcune pagine della wiki pubblica.
