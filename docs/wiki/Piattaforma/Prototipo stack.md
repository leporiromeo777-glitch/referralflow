---
tipo: piattaforma
aggiornata: 2026-09-14
---
# Prototipo «referralflow-stack» (l'interfaccia nuova, oggi operativa)

Nato il 13.9.2026 come pacchetto consegnato dall'utente (progettato altrove, su Windows, con un'altra AI): un **prototipo cliccabile** con dati fittizi. Nella stessa giornata è diventato un'**interfaccia operativa della piattaforma**: stessi dati, stessa sessione, stesso audit, con il bot sul modello locale e le procedure con traccia. La copia con i dati finti resta in piedi sulla porta 8765 solo per confronto.

## Stato oggi (14.9.2026): che cosa fa e dove
Le voci sotto sono **ciò che è vero adesso**; la storia delle modifiche, con i difetti trovati e corretti, sta nelle sezioni in fondo.

**Accesso e dispositivi**
- Indirizzo `https://cct.referralflow.ch/prototipo/index.html` (Let's Encrypt, [[Piattaforma/Server Mac mini]]); icona sul telefono via manifest. **Schermata di accesso propria** (14.9.2026): e-mail e password, poi il codice se la 2FA è attiva, tramite `POST /api/prototipo/accesso`, `…/accesso/verifica` e `…/accesso/esci`, con la stessa logica della pagina di login della piattaforma (blocchi anti-forza-bruta per e-mail e IP, studio attivo, cookie di verifica di 5 minuti, sessione di 8 ore); «Esci» in fondo alla barra laterale. Gli invianti non entrano. Niente più schermate condivise con la piattaforma classica.
- Sul telefono: menu a pillola in basso (Oggi, Agenda, Pazienti, Referti, Dittafono, AI) che sparisce scorrendo in giù e ricompare in su o al cambio di pagina, e sparisce con la sezione AI aperta; tasto «indietro» in alto a sinistra con storia interna delle pagine; niente scorrimento laterale (griglie, calendario e tabelle contenuti nel proprio riquadro); revisione con la colonna delle segnalazioni sopra il testo e il dettaglio che scorre da destra.
- **Nessun rimando alla piattaforma classica** e viceversa ([[Decisioni/Registro]], 13.9.2026 sera): le sezioni senza dati propri (statistiche, amministrazione, sistema, comunicazioni, visite, knowledge) dicono «non ancora disponibile in questa interfaccia». In comune restano la catena, i dati e le API.

**Profilo** (14.9.2026, voce «Profilo» in fondo alla barra; `GET/POST /api/prototipo/profilo`)
- Cambio della propria password (serve quella attuale, minimo 8 caratteri) e 2FA in due tempi come nella piattaforma: segreto e QR (libreria `qrcode`), conferma col primo codice giusto, codici di recupero mostrati una volta sola, attivazione quando la persona dichiara di averli salvati; disattivazione solo con un codice valido. Codici di recupero rimasti in vista.

**Pagina «Studio»** (14.9.2026, voce «Studio» nella barra; `GET/POST /api/prototipo/studio`)
- Schede: Dati (nome, telefono, e-mail per gli avvisi, prestazioni), Personale (accessi con ruolo, 2FA, stato; nuovo accesso con password iniziale scelta da chi lo crea, nuova password, cambio ruolo, disattiva/riattiva; mai eliminare, nessuno si disattiva da solo), Medici agenda (providers del robot MediOnline: nome, alias, accesso collegato, attivo), Sale e Apparecchi (tabella `studio_risorse`, migrazione 036: nome, descrizione, in uso / fuori uso). Tutti leggono, solo l'amministratore modifica (verificato dal server).

**Pagine e dati**
- `GET /api/prototipo/dati`: utente e ruolo, medici, pazienti con cartella (referral, documenti, esami, visite dall'agenda, assicurazione), agenda di oggi dal robot MediOnline, attività, referti della catena, documenti, audio in lavorazione e loro esito, numeri. Nessun dato demo in nessuna pagina raggiungibile.
- Scheda paziente: Overview, Esami (i file della cartella con tipo riconosciuto, «Apri» nel visualizzatore, «Scarica», «Chiedi all'AI»), Referti della catena con stato, Timeline (referral, visite, documenti, referti), Documenti, Amministrazione (anagrafica, assicurazione, referral). La pagina «visita» rimanda alla scheda.
- Documenti aperti dentro la pagina (PDF nell'iframe, Word e testo estratti da `GET /api/prototipo/documenti/[id]/testo`); ogni apertura è una lettura nel registro accessi.
- Dati di prova per le demo: `npm run dati-prova` (6 pazienti inventati, 14 PDF).

**Referti e revisione**
- Coda Referti: bozze e confermati della catena con verifiche, critiche, stato; badge «rivisto ‹quando›» e «Riprendi e conferma» per chi è già passato dalla revisione; «✓ Controllo» (controllo prima della firma); «Nuovo dettato» verso la coda della catena; lista degli audio delle ultime 24 ore con esito (in coda, in elaborazione, bozza pronta, **già dettato** quando la piattaforma riconosce un duplicato).
- Revisione guidata: dati veri da `GET /api/prototipo/referti/[id]` (trascrizione a segmenti, referto a frasi con fonte, segnalazioni con evidenza audio, marker, formato e livello di verifica del medico, campi, richiamo proposto, stato salvato), audio vero. **Stessi passi della piattaforma classica, nello stesso ordine**: motori discordi, correzioni automatiche, da controllare subito (frasi non sostenute, allarmi numerici, omissioni gravi, cambiamenti grandi dalla fusione), frasi da chiarire, dati clinici e omissioni, doppioni, note per la segreteria con le frasi tolte dalla catena («Lascia fuori» / «Rimetti nel referto»), terapia. Escluse per scelta le «frasi a rischio». In testa i campi estratti correggibili; sulle correzioni automatiche decise il campo «Perché?».
- Ogni modifica si salva 2 s dopo nella bozza: testo ricomposto (che rispetta gli a capo) in `testo_finale`, esiti delle verifiche, metriche, registro e motivazioni in `payload.revisione_prototipo`; alla riapertura si riparte da lì, anche da un altro dispositivo.
- Nella barra: **Impagina come lettera** / **Riorganizza nel formato** (stesso motore `POST /api/referti/struttura`, barra animata con percentuale vera e tempo, pillola fissa in alto che resta chiudendo la finestra, poi la revisione si ricarica) e **Word** con la carta intestata del medico.
- «Termina la revisione»: **Salva** (lavoro in corso) o **Conferma il referto** (`POST /api/prototipo/referti/[id]/conferma`, cuore condiviso `src/lib/referti-conferma.ts`: gate con presa d'atto se restano critiche aperte o la catena ha verificato solo in parte, stato confermata, audit col ruolo, misura e tassonomia delle modifiche, proposte di stile e dizionario, evento `conferma` con origine `prototipo`), con la spunta che crea il **richiamo proposto** dal dettato (`…/richiamo`, cuore condiviso `referti-richiamo-crea.ts`).

**Assistente e procedure** ([[Piattaforma/Procedure e tracce]])
- Bot (⌘/): risposte immediate del codice (numeri della giornata, ricerca documenti per paziente ed esame con refusi tollerati, «apri» diretto, «chi si occupa di…» dal grafo organizzativo), interprete delle domande scritte in codice con «Ho capito: …», modello locale in streaming per il resto con elenco procedure, organizzazione e fatti del paziente aperto nel prompt; domande sul documento aperto; sotto ogni risposta «Da dove viene».
- Sette procedure con traccia: briefing pre-visita, preparazione della giornata, cosa è cambiato dall'ultima visita, richiami del mese, controllo prima della firma, lettere in ritardo, chiusura mensile. Chip per pagina dal registro.

**Anonimizzazione**
- Pagina «Anonimizzazione»: testo incollato o file (.txt, .md, .pdf con testo, .docx) → `POST /api/prototipo/anonimizza`, stessa libreria locale della piattaforma; originale con i rilevamenti accanto al testo anonimizzato, copia e scarica .txt; niente persistenza.

**Manutenzione**
- Il ponte è `public/prototipo/referralflow-bridge.js` (copia anche in `~/referralflow-stack/…/ui-prototype/` e in `~/Downloads/…`); a ogni modifica si alza `?v=` in `index.html` e `manifest.webmanifest`, poi `bash mac/aggiorna-server.sh`. Il ponte ridefinisce le funzioni del prototipo in place: quando si sostituisce un blocco, controllare di non cancellare funzioni vicine (è successo con l'impaginazione, v28-v30).
- Endpoint del prototipo: `accesso` (+ `verifica`, `esci`), `profilo`, `studio`, `dati`, `referti`, `referti/[id]` (+ `testo`, `conferma`, `richiamo`), `documenti/[id]/testo`, `assistente`, `interpreta`, `procedure`, `procedura`, `briefing`, `tracce/[id]`, `anonimizza`. Tutti con sessione; le procedure con permessi per ruolo dal registro.

Il resto della pagina è la storia della giornata, sezione per sezione.

## Dove sta e come gira
- Copia stabile in `~/referralflow-stack/` (l'originale in `~/Downloads/referralflow-stack/`): `referralflow/` (docs 00-24 + ADR, `ui-prototype/`, `voice-server/`, `tools/serve.py`, `setup/`), `dittafono-clinico/` (PWA React+Vite, build già dentro `ui-prototype/dittafono/`), `refraflow-knowledge/` (wiki + RAG in Python, NON avviato: vorrebbe SilverBullet sulla porta 3000, che è dell'app), `refraflow-wiki/` (note Markdown del progetto, nessun dato clinico).
- Servizi launchd (`~/Library/LaunchAgents/`, log in `~/referralflow-stack/logs/`):
  - `ch.referralflow.prototipo`: `python3.14 tools/serve.py --bind 0.0.0.0 --port 8765` → **http://192.168.1.146:8765** dalla LAN, `http://localhost:8765` sul Mac. Statico, nessuna dipendenza.
  - `ch.referralflow.voce`: `voice-server/server.py --model small --port 8787` (faster-whisper small su CPU, venv in `~/referralflow-stack/voice-server-env/`) → solo `127.0.0.1:8787`, CORS solo per localhost:8765. Trascrive i clip del microfono del prototipo e del dittafono; nulla su disco.
- Piattaforma vera: **http://192.168.1.146:3000** (invariata). Fermare il prototipo: `launchctl bootout gui/$(id -u)/ch.referralflow.prototipo` (idem `…voce`).
- Setup rifatto sul Mac con `PATH=/opt/homebrew/bin:$PATH bash referralflow/setup/setup.sh --skip-dittafono` (lo script prende `python3` di sistema, troppo vecchio). Il microfono dal browser fuori da localhost richiede HTTPS: dal PC dell'utente si vede l'interfaccia, non si detta.

## Che cosa contiene
Pagine con selettore di ruolo (segreteria, aiuto medico, medico, admin org., admin tecnico), command palette, sidebar AI con risposte finte su economia e archivio, «Revisione guidata» a tre pannelli (elenco segnalazioni per gravità · testo con evidenze per sezione · dettaglio con audio allineato e trascrizione a tempi), Referti con coda e importazione audio, Dittafono (registrazione local-first con pausa, marker, export), Anonimizza, Sintesi paziente, proposte per la wiki, Amministrazione e Sistema. Design «Apple-like», chiaro/scuro.

## Confronto con la piattaforma vera (13.9.2026)
- **Stessi concetti, già realizzati da noi con dati veri**: revisione guidata con segnalazioni per gravità, riascolto sul punto, registro dei fatti e fiducia, anonimizzatore, proposte dalla wiki, «AI propone, codice decide». Il prototipo li disegna meglio; la piattaforma li fa davvero.
- **Dove il prototipo è avanti (estetica e composizione)**: gerarchia visiva, densità, tre pannelli della revisione, overview per ruolo, palette neutra. È il riferimento per ridisegnare le pagine della piattaforma, una alla volta, senza toccare la logica.
- **Idee da prendere**: il dittafono PWA dal telefono (oggi si detta solo col DS2), la scheda «Prossimo paziente» nella Home della segreteria, la revisione a tre pannelli.
- **Idee da NON prendere ora**: il modulo Knowledge con RAG (misurato: la conoscenza compilata batte il recupero a blocchi, [[Agenti/Come funziona]]), l'assistente vocale, l'analisi economica in sidebar AI, sei ruoli con due amministratori (troppo per uno studio).

## Ripreso nella piattaforma vera
- 13.9.2026: revisione guidata a tre colonne ([[Catena/Revisione guidata]]); Home «Oggi» con saluto, schede-numero cliccabili e «Prossimo paziente» in evidenza (`src/app/(app)/page.tsx`, dati invariati).
- 13.9.2026: dittafono dal telefono dentro la piattaforma, con «Invia a ReferralFlow» ([[Catena/Dittafono DSS]]); piattaforma anche in HTTPS su :3444 via Caddy.

## Collegato alla catena (13.9.2026, sera)
Il prototipo è servito anche dalla piattaforma in `public/prototipo/` (**http://192.168.1.146:3000/prototipo/index.html**, link «Prototipo con i dati veri» nella pagina Referti). Lì il file `referralflow-bridge.js` (caricato prima di `app.js`) sostituisce i dati finti con quelli veri, con la sessione del browser:
- `GET /api/prototipo/referti` → la coda «Referti da controllare» con le bozze vere (paziente, medico, ora del dettato, durata audio, numero di verifiche e di critiche, stato priorità/consigliata/alcuni punti/pulito dalla fiducia). Ogni riga apre `#/review/<id>`.
- `GET /api/prototipo/referti/[id]` → la Guided Review: trascrizione a segmenti dai tempi parola per parola (`payload.parole`), referto a sezioni (paragrafi) e span (frasi) agganciati al segmento più simile con grado di fonte (individuata/probabile/ambigua/assente), issue con evidenza audio da: motori discordi (negazione = critico), correzioni automatiche (annullabili), frasi non sostenute, frasi da chiarire, numeri non confermati, allarmi numerici, omissioni (con «aggiungi»), contraddizioni (solo medico), doppioni, terapia dubbia; marker su numeri, omissioni, negazioni. Traduzione pura in `src/lib/prototipo-revisione.ts`, test `prove-prototipo.test.ts`.
- L'audio vero (`/api/referti/audio/<id>`) sostituisce l'orologio simulato: `rvPlay/rvPause/rvSeek` sono ridefinite sul tag `<audio>`, stesso stato `RV`, pre-roll e finestre di evidenza come nel prototipo.
Limiti voluti: le decisioni prese nella Guided Review del prototipo restano nel suo localStorage (non scrivono nella piattaforma); su :8765 il ponte è inerte e restano i dati finti. Per aggiornare: modificare `~/referralflow-stack/referralflow/ui-prototype/` e ricopiare in `public/prototipo/` (rsync).

## Operativo (13.9.2026, notte): niente più dati demo
Richiesta utente: «rendi il prototipo operativo, attaccagli anche il bot, elimina i dati demo». Dentro la piattaforma (`/prototipo/`) il ponte `referralflow-bridge.js` v2:
- **`GET /api/prototipo/dati`** (sessione): utente e ruolo (segretaria→secretary, medico→doctor, admin→org_admin), medici (profili della catena + providers dell'agenda), pazienti con cartella (referral, documenti, ultima visita, prossimo appuntamento), **agenda di oggi dalla tabella `appointments`** (il robot MediOnline e i feed la riempiono: è «il bot» attaccato al prototipo), attività (la stessa lista della Home «Oggi»), referti della catena, documenti, audio in coda, numeri. Le liste del prototipo vengono svuotate e riempite IN PLACE (`PATIENTS`, `P`, `APPTS`, `TASKS`, `REPORTS`, `DOCUMENTS`, `INBOX`, `DOCTORS`, `ROOMS`, `RV_QUEUE`); senza sessione la pagina mostra solo «Accedi alla piattaforma», mai i dati finti.
- **Home** riscritta sui dati veri (saluto, schede-numero, prossimo paziente, da fare, timeline, referti dalla catena); **Referti** = coda vera + «Nuovo dettato» (file audio → `POST /api/referti/upload`, medico e tipo) + audio in lavorazione; le pagine senza backing (statistiche, amministrazione, sistema, comunicazioni, visite, knowledge, anonimizzazione) rimandano alla pagina corrispondente della piattaforma; barra laterale con i conteggi veri.
- **Il bot** (sidebar AI, ⌘/): le domande più comuni (numeri della giornata, prossimo paziente, referti da controllare, richiami, ricerca di un documento per paziente ed esame) le risponde il CODICE nel browser, all'istante; il resto va a `POST /api/prototipo/assistente` → modello LOCALE (`PROTOTIPO_LLM`, default gemma3:12b, tenuto caldo 30 minuti, risposta in streaming) con un prompt che contiene solo i dati già in pagina e vieta di inventare; se Ollama non c'è risponde il codice. Nessun cloud.
- **Revisione guidata**: «Termina revisione» → `POST /api/prototipo/referti/[id]/testo` salva il testo ricomposto (frasi corrette, tolte, aggiunte) in `testo_finale` come lavoro in corso, evento `testo_salvato` origine `prototipo`, e apre la bozza nella piattaforma per la conferma col gate.
- Aggiornamento automatico dei dati ogni 2 minuti (non durante una revisione).
Pubblicazione sulla rete: Caddy serve la piattaforma anche su **https://192.168.1.146/** (porte 80→443 standard, certificato della CA interna), quindi il prototipo è a `https://192.168.1.146/prototipo/` e il dittafono a `/dittafono/`, senza numeri di porta ([[Piattaforma/Server Mac mini]]).

Dal 13.9.2026 l'indirizzo da usare, anche per l'icona sul telefono, è **https://cct.referralflow.ch/prototipo/** (certificato Let's Encrypt, nessun avviso, [[Piattaforma/Server Mac mini]]).

## Documenti dentro la piattaforma e domande sul file (13.9.2026)
«Apri» nei risultati del bot e nelle schede apre il documento in una colonna accanto (`dvOpen`/`renderDocViewer` ridefinite dal ponte): i PDF nell'iframe di `/api/documents/<id>`, Word e testo con il testo estratto da `GET /api/prototipo/documenti/[id]/testo` (`src/lib/documenti-testo.ts`: pdf-parse, mammoth; tetto 8000 caratteri; ogni estrazione è una lettura nel registro accessi). Con un documento aperto le domande su di lui («cosa dice», «quali valori», «riassumi») vanno al modello locale con `documento_id`: il testo entra nel prompt sul Mac, mai altrove. Le scansioni senza testo ricevono «nessun testo estraibile» (OCR non c'è).

## Briefing pre-visita e «Da dove viene» (13.9.2026)
Prima procedura con traccia ([[Piattaforma/Procedure e tracce]]): chip «Briefing pre-visita» sulla scheda del paziente, bottone nella Home sul prossimo paziente o a parole nel bot. Il codice della piattaforma legge referral, questionario, ultimo referto e terapia, esami (ECG entro 12 mesi, eco entro 24), agenda e sospesi; il modello locale scrive solo la sintesi. Ogni risposta del bot, anche quella libera, mostra sotto il riquadro «Da dove viene» (passi ✓/✗/–, fonti con «Apri», modello, tempo, numero di traccia) letto da `GET /api/prototipo/tracce/[id]`.

## Altre procedure con traccia (13.9.2026, sera)
«Cosa è cambiato dall'ultima visita» (misure e terapia tra gli ultimi due referti confermati), «Richiami del mese» (scaduti / 7 giorni / 30 giorni), «Controllo prima della firma» (10 controlli sulla bozza, bottone «✓ Controllo» in coda Referti e chip nella revisione), «Preparazione della giornata» (bottone in Home: briefing di ogni paziente in agenda, mancanze in cima), «Lettere in ritardo», «Chiusura mensile» (numeri del mese e punti aperti). Tutte in codice, senza modello, con «Da dove viene» ([[Piattaforma/Procedure e tracce]]).

## Dati di prova (13.9.2026)
`npm run dati-prova` crea 6 pazienti inventati (Bernasconi, Pedrazzini, Ortelli, Casanova, Rusconi, Galli) con referral, 3 appuntamenti di oggi e 14 documenti PDF generati dal codice (ECG, Holter, ecocardiogrammi, test ergometrico, MAPA, duplex renale, CoroTAC, laboratorio, lettere, consenso), ognuno con in testa «DOCUMENTO DI PROVA - dati inventati». Servono a provare cartella, bot e ricerca documenti. `npm run dati-prova -- --elimina` toglie tutto (registro degli id in `~/.referralflow-dati-prova.json`). Il medico inviante di prova è «Dr. med. Andrea Prova». Nessuna persona reale.
