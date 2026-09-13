---
tipo: piattaforma
aggiornata: 2026-09-13
---
# Prototipo «referralflow-stack» (interfaccia nuova, dati finti)

Pacchetto consegnato dall'utente il 13.9.2026 (progettato altrove, su Windows, con un'altra AI): un **prototipo cliccabile** dell'interfaccia con dati completamente fittizi, più tre moduli. Tenuto in piedi ACCANTO alla piattaforma vera per confrontarli; non è collegato al DB, alla catena né all'audit.

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
«Cosa è cambiato dall'ultima visita» (misure e terapia tra gli ultimi due referti confermati), «Richiami del mese» (scaduti / 7 giorni / 30 giorni), «Controllo prima della firma» (10 controlli sulla bozza, bottone «✓ Controllo» in coda Referti e chip nella revisione). Tutte in codice, senza modello, con «Da dove viene» ([[Piattaforma/Procedure e tracce]]).

## Dati di prova (13.9.2026)
`npm run dati-prova` crea 6 pazienti inventati (Bernasconi, Pedrazzini, Ortelli, Casanova, Rusconi, Galli) con referral, 3 appuntamenti di oggi e 14 documenti PDF generati dal codice (ECG, Holter, ecocardiogrammi, test ergometrico, MAPA, duplex renale, CoroTAC, laboratorio, lettere, consenso), ognuno con in testa «DOCUMENTO DI PROVA - dati inventati». Servono a provare cartella, bot e ricerca documenti. `npm run dati-prova -- --elimina` toglie tutto (registro degli id in `~/.referralflow-dati-prova.json`). Il medico inviante di prova è «Dr. med. Andrea Prova». Nessuna persona reale.
