#!/bin/bash
# Una finestra temporanea sulla piattaforma VERA, da fuori (17.9.2026).
#
#   bash ~/referralflow/mac/apri-finestra.sh
#
# Apre una galleria dall'esterno verso la porta 3000 di questo Mac e stampa
# un indirizzo https. Serve a far vedere da fuori un referto vero durante una
# riunione, senza copiare niente da nessuna parte: i dati restano qui.
#
# Da sapere, e da dire a voce alta prima di aprirla:
# - dietro quell'indirizzo c'è la piattaforma con i PAZIENTI VERI. Si entra
#   solo con gli accessi dello studio, non con quelli della demo;
# - resta aperta finché questa finestra del Terminale resta aperta:
#   si chiude con Ctrl-C, o chiudendo il Terminale;
# - l'indirizzo è nuovo ogni volta.
set -u
CF="/opt/homebrew/bin/cloudflared"
LOG="$HOME/Library/Logs/ReferralFlow/tunnel-studio.log"
mkdir -p "$(dirname "$LOG")"

[ -x "$CF" ] || { echo "cloudflared non c'è: installalo con  brew install cloudflared"; exit 1; }
curl -s -o /dev/null -m 5 http://localhost:3000/login || { echo "La piattaforma non risponde sulla porta 3000: controlla il servizio."; exit 1; }

: > "$LOG"
"$CF" tunnel --url http://localhost:3000 --no-autoupdate >> "$LOG" 2>&1 &
PID=$!
echo "Apro la finestra… (chiudila con Ctrl-C quando avete finito)"
for _ in $(seq 1 20); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "${URL:-}" ]; then echo "Non sono riuscito ad aprirla: guarda $LOG"; kill "$PID" 2>/dev/null; exit 1; fi

echo
echo "  Indirizzo da mandare:  $URL/prototipo/index.html"
echo "  Si entra con gli accessi dello STUDIO (non con quelli della demo)."
echo
echo "Resta aperta finché non premi Ctrl-C qui dentro."
trap 'echo; echo "Chiudo la finestra."; kill "$PID" 2>/dev/null; exit 0' INT TERM
wait "$PID"
