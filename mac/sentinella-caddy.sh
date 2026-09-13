#!/bin/bash
# Sentinella di Caddy (14.9.2026): ogni 5 minuti prova il dominio in TLS sul
# Mac stesso; dopo due fallimenti di fila riavvia Caddy (che ricarica
# Caddyfile.dominio e il certificato su disco) e lo scrive nel log. Nato dopo
# che un ricaricamento sbagliato della configurazione aveva tolto il
# certificato e reso la piattaforma irraggiungibile per un'ora.
set -u
HOST="cct.referralflow.ch"
STATO="$HOME/referti/log/sentinella-caddy.stato"
LOG="$HOME/referti/log/sentinella-caddy.log"
mkdir -p "$(dirname "$LOG")"
codice=$(curl -s -m 12 -o /dev/null -w "%{http_code}" --resolve "$HOST:443:127.0.0.1" "https://$HOST/login" 2>/dev/null || echo 000)
if [ "$codice" = "200" ] || [ "$codice" = "302" ] || [ "$codice" = "307" ]; then
  [ -f "$STATO" ] && rm -f "$STATO"
  exit 0
fi
falliti=$(( $(cat "$STATO" 2>/dev/null || echo 0) + 1 ))
echo "$falliti" > "$STATO"
echo "$(date '+%Y-%m-%dT%H:%M') dominio non risponde in TLS (codice $codice), fallimento $falliti" >> "$LOG"
if [ "$falliti" -ge 2 ]; then
  launchctl kickstart -k "gui/$(id -u)/ch.referralflow.caddy" && echo "$(date '+%Y-%m-%dT%H:%M') Caddy riavviato dalla sentinella" >> "$LOG"
  rm -f "$STATO"
fi
