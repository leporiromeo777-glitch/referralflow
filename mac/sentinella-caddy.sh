#!/bin/bash
# Sentinella di Caddy (14.9.2026): ogni 5 minuti prova il dominio in TLS sul
# Mac stesso; dopo due fallimenti di fila riavvia Caddy (che ricarica
# Caddyfile.dominio e il certificato su disco) e lo scrive nel log. Nato dopo
# che un ricaricamento sbagliato della configurazione aveva tolto il
# certificato e reso la piattaforma irraggiungibile per un'ora.
# Dal 14.9.2026 sera controlla anche che il record A del dominio punti
# all'indirizzo LAN attuale del Mac: senza cavo Ethernet il Wi-Fi può cambiare
# indirizzo a ogni rinnovo DHCP (.146 → .152 → .159 in un giorno) e il dominio
# resta a puntare nel vuoto. Se differiscono lancia attiva-dominio.sh (record
# A via API Infomaniak + riavvio di Caddy) una volta sola per indirizzo:
# Infomaniak pubblica con ~25 minuti di ritardo e non va rilanciato ogni 5 minuti.
set -u
HOST="cct.referralflow.ch"
STATO="$HOME/referti/log/sentinella-caddy.stato"
LOG="$HOME/referti/log/sentinella-caddy.log"
ULTIMO_IP="$HOME/referti/log/sentinella-caddy.ip"
mkdir -p "$(dirname "$LOG")"

# ── Indirizzo del Mac contro il record DNS ──────────────────────────────────
IP=""
for IF in $(route -n get default 2>/dev/null | awk '/interface:/{print $2}') en0 en1; do
  IP=$(ipconfig getifaddr "$IF" 2>/dev/null) && [ -n "$IP" ] && break
done
DNS_IP=$(dig +short +time=3 +tries=1 @nsany1.infomaniak.com "$HOST" 2>/dev/null | head -1)
if [ -n "$IP" ] && [ -n "$DNS_IP" ] && [ "$IP" != "$DNS_IP" ] && [ "$IP" != "$(cat "$ULTIMO_IP" 2>/dev/null)" ]; then
  echo "$(date '+%Y-%m-%dT%H:%M') il Mac è su $IP ma il dominio punta a $DNS_IP: aggiorno il record" >> "$LOG"
  if bash "$(dirname "$0")/attiva-dominio.sh" "$IP" >> "$LOG" 2>&1; then
    echo "$IP" > "$ULTIMO_IP"
    echo "$(date '+%Y-%m-%dT%H:%M') record aggiornato a $IP (propagazione Infomaniak ~25 minuti)" >> "$LOG"
  else
    echo "$(date '+%Y-%m-%dT%H:%M') attiva-dominio.sh fallito" >> "$LOG"
  fi
  exit 0
fi

# ── TLS sul Mac stesso ─────────────────────────────────────────────────────
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
