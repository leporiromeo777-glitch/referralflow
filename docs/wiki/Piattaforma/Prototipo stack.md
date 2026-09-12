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
