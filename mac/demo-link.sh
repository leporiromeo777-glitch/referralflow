#!/bin/bash
# Il link pubblico della DEMO (16.9.2026).
#
#   bash mac/demo-link.sh          stampa il link di adesso (e lo riapre se è caduto)
#
# Come funziona: `cloudflared` apre una galleria dall'esterno verso la porta
# 3100 di questo Mac — e SOLO verso quella. Il database dello studio sta su
# un'altra porta e un altro database: da questo link non è raggiungibile.
#
# Attenzione: è un tunnel «al volo», gratuito e senza account. Ogni volta che
# riparte il link CAMBIA. Finché resta acceso, il link è quello scritto in
# ~/Library/Logs/ReferralFlow/link-demo.txt.
set -u
LOG="$HOME/Library/Logs/ReferralFlow/tunnel.log"
LINK="$HOME/Library/Logs/ReferralFlow/link-demo.txt"
CF="/opt/homebrew/bin/cloudflared"

vivo() { pgrep -f "cloudflared tunnel --url http://localhost:3100" > /dev/null; }

if ! vivo; then
  echo "Il tunnel non è acceso: lo riapro (il link sarà nuovo)…"
  mkdir -p "$(dirname "$LOG")"
  : > "$LOG"
  nohup "$CF" tunnel --url http://localhost:3100 --no-autoupdate >> "$LOG" 2>&1 &
  sleep 12
fi

URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | tail -1)"
if [ -z "$URL" ]; then
  echo "Non trovo il link nel log ($LOG). Riprova fra qualche secondo."
  exit 1
fi
echo "$URL" > "$LINK"
CODICE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$URL/login")"
echo "Link della demo: $URL   (pagina di accesso: $CODICE)"
echo "Scritto anche in $LINK"
