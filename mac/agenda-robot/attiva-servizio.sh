#!/bin/bash
# Robot agenda MediOnline — attivazione del servizio automatico.
#
#   bash mac/agenda-robot/attiva-servizio.sh
#
# Da lanciare quando il lettore funziona (dopo una prova a mano con
# `node mac/agenda-robot/leggi-agenda.mjs`). Installa il LaunchAgent che
# esegue il lettore ogni quarto d'ora (ai minuti 1, 16, 31, 46 — un minuto
# prima della sincronizzazione dell'app, che comunque viene svegliata subito
# dal lettore stesso). Rieseguibile senza danni.
set -euo pipefail

cd "$(dirname "$0")"
REPO="$(cd ../.. && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGDIR="$HOME/Library/Logs/ReferralFlow"
NODE="$(command -v node || echo /opt/homebrew/bin/node)"
mkdir -p "$AGENTS" "$LOGDIR"

plist="$AGENTS/ch.referralflow.agenda-robot.plist"
cat > "$plist" << FINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ch.referralflow.agenda-robot</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/mac/agenda-robot/leggi-agenda.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO/mac/agenda-robot</string>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Minute</key><integer>1</integer></dict>
    <dict><key>Minute</key><integer>16</integer></dict>
    <dict><key>Minute</key><integer>31</integer></dict>
    <dict><key>Minute</key><integer>46</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$LOGDIR/agenda-robot.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/agenda-robot.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
FINE
chmod 600 "$plist"

launchctl unload "$plist" 2> /dev/null || true
launchctl load -w "$plist"

echo "────────────────────────────────────────────────────────────"
echo "  Robot agenda attivo: legge MediOnline ogni quarto d'ora."
echo
echo "  In ReferralFlow → Programma → Agenda: feed e medici, aggiungi"
echo "  un feed con indirizzo:   locale:medionline.ics"
echo "  campo del medico: «location», e metti le SIGLE delle agende"
echo "  (ASM, M.M., T.M., …) negli alias dei rispettivi medici."
echo
echo "  Registro: $LOGDIR/agenda-robot.log"
echo "  Fermare:  launchctl unload $plist"
echo "────────────────────────────────────────────────────────────"
