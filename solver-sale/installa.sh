#!/bin/bash
# Installa il servizio del solver delle sale sul Mac dello studio:
# ambiente Python isolato (non tocca quello della catena dei referti),
# OR-Tools, e il servizio launchd su 127.0.0.1:8711.
set -e
QUI="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON:-python3.14}"
[ -x "$QUI/.venv/bin/python" ] || "$PY" -m venv "$QUI/.venv"
"$QUI/.venv/bin/pip" install -q --upgrade ortools
PLIST="$HOME/Library/LaunchAgents/ch.referralflow.solver-sale.plist"
mkdir -p "$HOME/referti/log"
sed "s#__QUI__#$QUI#g; s#__HOME__#$HOME#g" "$QUI/../mac/ch.referralflow.solver-sale.plist" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
sleep 1
curl -s http://127.0.0.1:8711/vivo && echo " ← solver-sale in ascolto" || echo "solver-sale non risponde: guarda ~/referti/log/solver-sale.log"
