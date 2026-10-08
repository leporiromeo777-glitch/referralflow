#!/bin/bash
# ReferralFlow — dire alla piattaforma dov'è la cartella del NAS dello studio e
# tenerla collegata (8.10.2026).
#
#   bash mac/installa-nas.sh <smb://utente@indirizzo/cartella> [</Volumes/cartella>]
#
# Scrive ~/referti-imaging/archivio-file.conf (indirizzo e cartella: MAI una
# password) e installa il servizio che ogni due minuti ricollega la cartella se
# si è staccata. La password deve essere già nel portachiavi: ci finisce
# collegandosi una volta dal Finder (Cmd+K) con «Ricorda la password».
set -eu
URL="${1:-}"
case "$URL" in smb://*@*/*) ;; *) echo "Uso: bash mac/installa-nas.sh smb://utente@indirizzo/cartella [/Volumes/cartella]"; exit 2 ;; esac
case "${URL#smb://}" in *:*@*) echo "L'indirizzo non deve contenere la password."; exit 2 ;; esac
RADICE="${2:-/Volumes/$(basename "$URL")}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$HOME/referti-imaging"; mkdir -p "$BASE" "$HOME/Library/Logs/ReferralFlow"
printf '# Cartella del NAS dello studio letta dalla piattaforma (mai una password qui).\nURL=%s\nRADICE=%s\n' "$URL" "$RADICE" > "$BASE/archivio-file.conf"
PLIST="$HOME/Library/LaunchAgents/ch.referralflow.nas.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ch.referralflow.nas</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$REPO/mac/monta-nas.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>120</integer>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/ReferralFlow/nas.launchd.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/ch.referralflow.nas" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scritto $BASE/archivio-file.conf e installato ch.referralflow.nas."
echo "Cartella: $RADICE — $(ls "$RADICE" >/dev/null 2>&1 && echo collegata || echo 'NON collegata (collegala una volta dal Finder con Cmd+K e «Ricorda la password»)')"
