#!/bin/bash
# ReferralFlow — aggiorna il server dello studio all'ultima versione.
# Uso: bash mac/aggiorna-server.sh
# Scarica gli aggiornamenti e riavvia il servizio, che si ricompila da solo
# se il codice è cambiato (1-2 minuti; nel frattempo l'app non risponde).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Scarico gli aggiornamenti…"
git pull --ff-only || echo "  (offline o nessun aggiornamento: riavvio con la versione attuale)"

if ! launchctl list ch.referralflow.app > /dev/null 2>&1; then
  echo "Il servizio non è installato: esegui prima  bash mac/installa-server.sh"
  exit 1
fi

echo "Riavvio il servizio…"
launchctl kickstart -k "gui/$(id -u)/ch.referralflow.app"

NOME="$(scutil --get LocalHostName 2> /dev/null || hostname -s)"
echo "Fatto: tra poco l'app aggiornata è su http://$NOME.local:3000"
echo "(se il codice è cambiato, la ricompilazione dura 1-2 minuti)"
