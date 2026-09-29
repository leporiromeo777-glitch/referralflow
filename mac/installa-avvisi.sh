#!/bin/bash
# Installa la sentinella (mac/sentinella.sh) come servizio launchd ogni 5
# minuti e prepara il canale ntfy per le notifiche sul telefono.
#   bash mac/installa-avvisi.sh          installa (il canale si crea una volta sola)
#   bash mac/installa-avvisi.sh --prova  manda una notifica di prova
# Il canale ntfy è un nome casuale che fa da chiave: sta solo in
# ~/.referralflow-avvisi.conf (600), mai nel repo (che è pubblico).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$HOME/.referralflow-avvisi.conf"

if [ ! -f "$CONF" ]; then
  canale="rf-$(openssl rand -hex 12)"
  umask 077
  printf 'NTFY_URL=https://ntfy.sh/%s\n' "$canale" > "$CONF"
fi
chmod 600 "$CONF"
URL="$(grep '^NTFY_URL=' "$CONF" | cut -d= -f2-)"

if [ "${1:-}" = "--prova" ]; then
  curl -s -m 15 -o /dev/null -w 'ntfy → %{http_code}\n' -H "Title: ReferralFlow" -H "Tags: bell" \
    -d "Prova: gli avvisi di ReferralFlow arrivano su questo telefono." "$URL"
  exit 0
fi

AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/ch.referralflow.sentinella.plist"
mkdir -p "$AGENTS" "$HOME/Library/Logs/ReferralFlow"
cat > "$PLIST" << FINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ch.referralflow.sentinella</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/mac/sentinella.sh</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/ReferralFlow/sentinella.launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/ReferralFlow/sentinella.launchd.log</string>
</dict>
</plist>
FINE
chmod 600 "$PLIST"
launchctl unload "$PLIST" 2> /dev/null || true
launchctl load -w "$PLIST"
echo "Sentinella attiva (ogni 5 minuti)."
echo "Sul telefono: app «ntfy» → + → iscriviti al canale: ${URL##*/} (server ntfy.sh)"
