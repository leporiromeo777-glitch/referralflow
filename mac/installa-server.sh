#!/bin/bash
# ReferralFlow — livello 1: il Mac mini diventa il server interno dello studio.
#
# Cosa fa, in una volta sola (rieseguibile senza danni):
#   1. installa il servizio automatico dell'app: parte all'accensione del Mac,
#      riparte da solo se cade, si aggiorna e ricompila quando il codice cambia;
#   2. installa il backup notturno (ore 02:30): database + allegati in
#      ~/ReferralFlow-backup, conservati 14 giorni;
#   3. imposta il Mac per non andare mai in stop e riaccendersi dopo un
#      blackout (chiede la password del Mac);
#   4. stampa l'indirizzo con cui gli altri computer dello studio aprono l'app.
#
# Prerequisito: aver fatto girare l'anteprima almeno una volta
# (bash mac/avvia-anteprima.sh): prepara database e configurazione.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGDIR="$HOME/Library/Logs/ReferralFlow"
mkdir -p "$AGENTS" "$LOGDIR"

# ── Prerequisiti ─────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "Manca la configurazione (.env): esegui prima  bash mac/avvia-anteprima.sh"
  exit 1
fi
if ! command -v brew > /dev/null; then
  echo "Manca Homebrew: installalo da https://brew.sh e riprova."
  exit 1
fi

# ── Indirizzo nella rete dello studio ────────────────────────────────────────
# I link che l'app genera (portale, promemoria) devono usare l'indirizzo
# visibile dagli altri computer, non «localhost».
NOME="$(scutil --get LocalHostName 2> /dev/null || hostname -s)"
URL="http://$NOME.local:3000"
IP="$(ipconfig getifaddr en0 2> /dev/null || ipconfig getifaddr en1 2> /dev/null || true)"
sed -i '' -E "s|^APP_BASE_URL=.*|APP_BASE_URL=$URL|" .env

# ── Servizio dell'app ────────────────────────────────────────────────────────
plist_app="$AGENTS/ch.referralflow.app.plist"
cat > "$plist_app" << FINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ch.referralflow.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/mac/server-avvio.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOGDIR/server.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/server.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
FINE

# ── Backup notturno ──────────────────────────────────────────────────────────
plist_backup="$AGENTS/ch.referralflow.backup.plist"
cat > "$plist_backup" << FINE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ch.referralflow.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/mac/backup-db.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOGDIR/backup.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/backup.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
FINE

chmod 600 "$plist_app" "$plist_backup"

# ── Il Mac non deve mai dormire (e deve riaccendersi dopo un blackout) ───────
echo "Imposto il Mac per non andare mai in stop (può chiedere la password del Mac)…"
if sudo pmset -a sleep 0 disksleep 0 autorestart 1 womp 1; then
  echo "  fatto (lo schermo può comunque spegnersi: non è un problema)."
else
  echo "  Non riuscito: fallo a mano da Impostazioni di Sistema → Schermo blocco /"
  echo "  Risparmio energetico: mai in stop, riavvia dopo interruzione di corrente."
fi

# ── Avvio ────────────────────────────────────────────────────────────────────
if lsof -nP -iTCP:3000 -sTCP:LISTEN > /dev/null 2>&1; then
  echo
  echo "Attenzione: c'è un'anteprima manuale ancora accesa sulla porta 3000."
  echo "Chiudila con Ctrl-C nella sua finestra: il servizio prenderà il suo posto da solo."
fi

launchctl unload "$plist_app" 2> /dev/null || true
launchctl unload "$plist_backup" 2> /dev/null || true
launchctl load -w "$plist_app"
launchctl load -w "$plist_backup"

echo
echo "────────────────────────────────────────────────────────────"
echo "  Fatto: ReferralFlow è il server dello studio."
echo
echo "  Da questo Mac:            http://localhost:3000"
echo "  Dagli altri computer:     $URL"
[ -n "$IP" ] && echo "  (se il nome non funziona:  http://$IP:3000)"
echo "  Accessi e password: invariati."
echo
echo "  Al primo avvio macOS può chiedere se «node» può accettare"
echo "  connessioni in entrata: rispondi «Consenti»."
echo
echo "  Consigli per un server affidabile:"
echo "  - Impostazioni di Sistema → Utenti e gruppi → attiva il login"
echo "    automatico su questo utente (così dopo un riavvio riparte tutto da solo)."
echo "  - Nelle impostazioni di Ollama attiva l'avvio al login (per le funzioni AI)."
echo "  - Collega il Mac al router con il cavo di rete, non in Wi-Fi."
echo
echo "  Aggiornare l'app:   bash mac/aggiorna-server.sh"
echo "  Backup notturno:    ~/ReferralFlow-backup (02:30, 14 giorni)"
echo "  Registro servizio:  $LOGDIR/server.log"
echo "  Fermare tutto:      launchctl unload $plist_app"
echo "────────────────────────────────────────────────────────────"
