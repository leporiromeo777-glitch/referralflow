---
tipo: piattaforma
aggiornata: 2026-09-29
---
# Automazioni attive

Sul Mac server: launchd `ch.referralflow.automazioni` ogni 15 min (`mac/automazioni.sh`: agenda a ogni giro, promemoria SMS al giro «in punto», watchdog alle 07, report il 1° alle 08; chiave `REMINDER_SECRET` nel `.env`, generata da `installa-server.sh`).

Le stesse rotte, sulla vecchia VM via cron:
- Sync agenda ogni 15 min → `/api/cron/agenda` (tutti i feed attivi, tutti gli studi); a ogni giro aggancia `/api/cron/orchestrazione` (la baseline della giornata del gemello, una volta al giorno; `?forza=1` la rifà). Il vecchio `/api/cron/piano-sale` (una stanza per medico, con la proposta notturna del modello) non si chiama più dal 16.9.2026: la rotta resta per chi la volesse a mano
- Promemoria SMS ogni ora → `/api/reminders/run`
- Watchdog referral ferme ogni mattina → `/api/cron/watchdog` (soglie in `src/lib/watchdog.ts`: ricevuta/triage 3 g, da_prenotare 14 g, misurate da `updated_at`; email neutra per studio + badge «⏰ ferma» in coda)
- Report mensile il 1° del mese → `/api/cron/report`
- Tutte protette da `?key=REMINDER_SECRET`.

## SMS
Attivi via eCall REST v2 (Basic auth, `SMS_API_TOKEN=utente:password`, driver `src/lib/sms.ts` con normalizzazione numeri). Account eCall in testing fino al 15.08.2026 (poi comprare punti); mittente = numero verificato (l'alfanumerico va autorizzato da eCall).

## Sentinella e avvisi sul telefono (29.9.2026)
`mac/sentinella.sh`, launchd `ch.referralflow.sentinella` ogni 5 minuti (installazione: `bash mac/installa-avvisi.sh`; prova: `--prova`). Guarda: piattaforma (`:3000/login`), sito in HTTPS sul Mac stesso, database (`pg_isready`), Ollama, servizio della catena acceso, catena zitta da 75 min con dettati in coda, un dettato in lavorazione da 180 min, bozze in `output/` non consegnate da 60 min, dettati nuovi in `errori/`, backup notturno più vecchio di 30 ore, disco sotto 25 GB, un'automazione di questa pagina che fallisce 3 giri di fila. Soglie tarate sul registro della catena (dettato: mediana 10 min, p90 31; silenzio massimo del registro durante un dettato 69 min).

Avvisi con **ntfy** (app sul telefono, canale casuale in `~/.referralflow-avvisi.conf`, mai nel repo): testi neutri (che cosa è fermo e da quanto, mai nomi, file o contenuti); un problema si dice dopo 2 giri di fila (4 per il sito, che la sentinella di Caddy prova prima a riavviare), si ripete ogni 6 ore, poi «Risolto». Di notte (22–7) silenzio; alle 7:30 il **riepilogo del mattino**, ogni giorno anche se va tutto bene (bozze consegnate ieri, spazio libero): se non arriva, il Mac è spento o senza rete — l'unico guasto che il Mac non può segnalare da sé. Stato in `~/Library/Application Support/ReferralFlow/sentinella/`, registro in `~/Library/Logs/ReferralFlow/sentinella.log`. Prove: `bash mac/prova-sentinella.sh`.

Email: sul server non c'è SMTP (`SMTP_HOST` vuoto), quindi watchdog e report mensile oggi non mandano niente.
