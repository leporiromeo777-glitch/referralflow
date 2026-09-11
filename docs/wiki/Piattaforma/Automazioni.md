---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Automazioni attive

Sul Mac server: launchd `ch.referralflow.automazioni` ogni 15 min (`mac/automazioni.sh`: agenda a ogni giro, promemoria SMS al giro «in punto», watchdog alle 07, report il 1° alle 08; chiave `REMINDER_SECRET` nel `.env`, generata da `installa-server.sh`).

Le stesse rotte, sulla vecchia VM via cron:
- Sync agenda ogni 15 min → `/api/cron/agenda` (tutti i feed attivi, tutti gli studi)
- Promemoria SMS ogni ora → `/api/reminders/run`
- Watchdog referral ferme ogni mattina → `/api/cron/watchdog` (soglie in `src/lib/watchdog.ts`: ricevuta/triage 3 g, da_prenotare 14 g, misurate da `updated_at`; email neutra per studio + badge «⏰ ferma» in coda)
- Report mensile il 1° del mese → `/api/cron/report`
- Tutte protette da `?key=REMINDER_SECRET`.

## SMS
Attivi via eCall REST v2 (Basic auth, `SMS_API_TOKEN=utente:password`, driver `src/lib/sms.ts` con normalizzazione numeri). Account eCall in testing fino al 15.08.2026 (poi comprare punti); mittente = numero verificato (l'alfanumerico va autorizzato da eCall).
