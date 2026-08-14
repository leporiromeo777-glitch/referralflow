#!/bin/bash
# ReferralFlow — automazioni del server dello studio. Lanciato da launchd
# ogni 15 minuti (vedi installa-server.sh):
#   - sincronizzazione dell'agenda (feed iCal Cassa dei Medici) a ogni giro
#   - promemoria SMS una volta l'ora (fa qualcosa solo se gli SMS sono attivi)
#   - watchdog delle referral ferme una volta al giorno, la mattina
#   - report mensile il 1° del mese
# Gli endpoint sono protetti dalla chiave REMINDER_SECRET nel .env.
set -euo pipefail

cd "$(dirname "$0")/.."

SECRET="$(grep '^REMINDER_SECRET=' .env 2> /dev/null | cut -d= -f2- || true)"
if [ -z "$SECRET" ]; then
  echo "$(date '+%F %H:%M') REMINDER_SECRET assente nel .env: automazioni ferme"
  exit 0
fi

BASE="http://localhost:3000"
MINUTO="$(date +%M)"
ORA="$(date +%H)"
GIORNO="$(date +%d)"

chiama() {
  local codice
  codice="$(curl -s -o /dev/null -w '%{http_code}' --max-time 180 "$BASE/api/$1?key=$SECRET" || echo rete)"
  echo "$(date '+%F %H:%M') $1 → $codice"
}

chiama cron/agenda

# Una sola volta l'ora / al giorno / al mese: passa di qui ogni quarto d'ora,
# quindi il giro col minuto sotto i 15 è quello «in punto».
if [ "$MINUTO" -lt 15 ]; then
  chiama reminders/run
  if [ "$ORA" = "07" ]; then
    chiama cron/watchdog
  fi
  if [ "$ORA" = "08" ] && [ "$GIORNO" = "01" ]; then
    chiama cron/report
  fi
fi
