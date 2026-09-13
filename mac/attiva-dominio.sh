#!/bin/bash
# Attiva cct.referralflow.ch (13.9.2026). Prerequisito: ~/.referralflow-dns.conf con
#   DNS_TOKEN=<token API Infomaniak, ambito domain>
# Passi: 1) crea/aggiorna il record A cct.referralflow.ch → indirizzo LAN attuale via API
# Infomaniak; 2) riavvia Caddy col modulo DNS; 3) controlla il certificato.
set -u
CONF="$HOME/.referralflow-dns.conf"
[ -f "$CONF" ] || { echo "manca $CONF (riga DNS_TOKEN=…)"; exit 1; }
set -a; . "$CONF"; set +a
[ -n "${DNS_TOKEN:-}" ] || { echo "DNS_TOKEN vuoto in $CONF"; exit 1; }
DOM="referralflow.ch"; HOST="cct"
# L'indirizzo del Mac sulla LAN: la scheda attiva (Ethernet se collegata,
# altrimenti Wi-Fi). Il 14.9.2026 il cavo Ethernet si è staccato, il Mac è
# passato al Wi-Fi con un altro indirizzo e il dominio puntava nel vuoto.
# Si può forzare: attiva-dominio.sh 192.168.1.146
IP="${1:-}"
if [ -z "$IP" ]; then
  for IF in $(route -n get default 2>/dev/null | awk '/interface:/{print $2}') en0 en1; do
    IP=$(ipconfig getifaddr "$IF" 2>/dev/null) && [ -n "$IP" ] && break
  done
fi
[ -n "$IP" ] || { echo "nessun indirizzo LAN trovato"; exit 1; }
API="https://api.infomaniak.com"
echo "1/3 · record DNS $HOST.$DOM → $IP"
ID=$(curl -s -H "Authorization: Bearer $DNS_TOKEN" "$API/1/product?service_name=domain&customer_name=$DOM" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')")
[ -n "$ID" ] || { echo "dominio non trovato con questo token (ambito «domain»?)"; exit 1; }
ESISTE=$(curl -s -H "Authorization: Bearer $DNS_TOKEN" "$API/1/domain/$ID/dns/record" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(next((r['id'] for r in d if r.get('type')=='A' and r.get('source') in ('$HOST','$HOST.$DOM.')), ''))")
if [ -n "$ESISTE" ]; then
  curl -s -X PUT -H "Authorization: Bearer $DNS_TOKEN" -H "Content-Type: application/json" -d "{\"target\":\"$IP\",\"ttl\":300}" "$API/1/domain/$ID/dns/record/$ESISTE" | python3 -c "import sys,json; print('   aggiornato:', json.load(sys.stdin).get('result'))"
else
  curl -s -X POST -H "Authorization: Bearer $DNS_TOKEN" -H "Content-Type: application/json" -d "{\"type\":\"A\",\"source\":\"$HOST\",\"target\":\"$IP\",\"ttl\":300}" "$API/1/domain/$ID/dns/record" | python3 -c "import sys,json; print('   creato:', json.load(sys.stdin).get('result'))"
fi
echo "2/3 · riavvio Caddy col modulo DNS"
launchctl kickstart -k "gui/$(id -u)/ch.referralflow.caddy"
sleep 5
echo "3/3 · certificato (può servire qualche minuto la prima volta)"
for i in $(seq 1 24); do
  if curl -s -m 8 -o /dev/null -w "%{http_code}" --resolve "$HOST.$DOM:443:127.0.0.1" "https://$HOST.$DOM/login" 2>/dev/null | grep -q 200; then echo "   https://$HOST.$DOM funziona con certificato valido"; exit 0; fi
  sleep 10
done
echo "   non ancora: guarda ~/referti/log/caddy.log (cerca «obtain»)"; exit 2
