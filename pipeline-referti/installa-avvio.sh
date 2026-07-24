#!/bin/bash
# Fase 9 — avvio automatico all'accensione del Mac (SPEC §9).
# Installa due LaunchAgent: il servizio della pipeline e il pannello locale.
# Rieseguibile: rigenera e ricarica tutto (usalo anche dopo aver creato o
# modificato invio.conf).
#
# Invio a ReferralFlow: quando hai il token, crea ~/referti-pipeline/invio.conf
# con due righe:
#   REFERTI_FLOW_URL=https://il-vostro-referralflow.ch
#   REFERTI_FLOW_TOKEN=rfb_...
# e rilancia questo script. Il file è una credenziale: resta solo sul Mac.
set -euo pipefail

DEST="$HOME/referti-pipeline"
AGENTS="$HOME/Library/LaunchAgents"
LOGDIR="$HOME/referti/log"
PY="$(command -v python3.14 || echo /opt/homebrew/bin/python3.14)"

mkdir -p "$AGENTS" "$LOGDIR"

# Variabili d'invio (se configurate) dentro il plist del servizio.
ENV_EXTRA=""
if [ -f "$DEST/invio.conf" ]; then
  chmod 600 "$DEST/invio.conf"
  while IFS='=' read -r chiave valore; do
    case "$chiave" in
      REFERTI_*) ENV_EXTRA="$ENV_EXTRA
    <key>$chiave</key><string>$valore</string>" ;;
    esac
  done < "$DEST/invio.conf"
  echo "invio.conf trovato: invio a ReferralFlow configurato nel servizio."
else
  echo "invio.conf assente: l'invio a ReferralFlow resta spento (le bozze si accumulano in output/)."
fi

plist_servizio="$AGENTS/ch.referralflow.referti-servizio.plist"
cat > "$plist_servizio" << FINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ch.referralflow.referti-servizio</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$DEST/pipeline.py</string>
    <string>--servizio</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$LOGDIR/launchd-servizio.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/launchd-servizio.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>$ENV_EXTRA
  </dict>
</dict>
</plist>
FINE

plist_pannello="$AGENTS/ch.referralflow.referti-pannello.plist"
cat > "$plist_pannello" << FINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ch.referralflow.referti-pannello</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$DEST/pannello.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$LOGDIR/launchd-pannello.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/launchd-pannello.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
FINE

chmod 600 "$plist_servizio" "$plist_pannello"

# Fotografia delle versioni (SPEC §4.1): si aggiorna a ogni installazione.
{
  echo "# Versioni installate — $(date '+%Y-%m-%d %H:%M')"
  echo
  command -v "$PY" > /dev/null && "$PY" --version 2>&1 | sed 's/^/- python: /'
  ffmpeg -version 2>/dev/null | head -1 | sed 's/^/- /'
  brew list --versions whisper-cpp 2>/dev/null | sed 's/^/- /'
  ollama --version 2>/dev/null | sed 's/^/- /'
  ollama list 2>/dev/null | grep -i gemma3 | sed 's/^/- modello LLM: /'
  if [ -f "$DEST/modelli/ggml-large-v3.bin" ]; then
    shasum -a 256 "$DEST/modelli/ggml-large-v3.bin" | sed 's/^/- sha256 ggml-large-v3: /'
  fi
} > "$DEST/VERSIONI.md" || true

if command -v launchctl > /dev/null; then
  launchctl unload "$plist_servizio" 2>/dev/null || true
  launchctl unload "$plist_pannello" 2>/dev/null || true
  launchctl load -w "$plist_servizio"
  launchctl load -w "$plist_pannello"
  echo
  echo "Fatto: servizio e pannello attivi, e partiranno da soli a ogni accensione."
  echo "  registro servizio: $HOME/referti/log/servizio.log"
  echo "  pannello:          http://127.0.0.1:8737"
  echo "  per fermare tutto: launchctl unload $plist_servizio $plist_pannello"
else
  echo "launchctl non trovato (non è macOS?): plist generati ma non caricati."
fi
