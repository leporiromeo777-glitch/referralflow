#!/bin/bash
# ReferralFlow — accendere la ricezione delle immagini dagli apparecchi.
#
#   bash mac/installa-ricezione-dicom.sh
#
# Da qui in poi l'ecografo, la RM e la TAC possono mandare le immagini
# direttamente alla piattaforma: si configura una destinazione DICOM
# sull'apparecchio con l'AE Title, l'indirizzo di questo Mac e la porta, e
# gli esami arrivano in cartella da soli.
#
# Non tocca niente di clinico: crea il venv se manca, installa il servizio di
# ascolto e scrive il file di configurazione se non c'è già.
set -euo pipefail
cd "$(dirname "$0")/.."
QUI="$(pwd)"
VENV="$HOME/.referralflow-imaging"
BASE="$HOME/referti-imaging"
CONF="$BASE/ricezione.conf"

echo "1/4 · lettore e ricezione DICOM (pydicom, pynetdicom, pillow)"
[ -x "$VENV/bin/python" ] || python3.14 -m venv "$VENV"
"$VENV/bin/pip" install -q --disable-pip-version-check pydicom pillow numpy pynetdicom

echo "2/4 · cartelle"
mkdir -p "$BASE/ingresso" "$BASE/scartati" "$HOME/Library/Logs/ReferralFlow"
chmod 700 "$BASE" "$BASE/ingresso" "$BASE/scartati"

echo "3/4 · configurazione"
if [ -f "$CONF" ]; then
  echo "  $CONF c'è già: non lo tocco."
else
  # Il token è lo stesso delle altre chiamate automatiche: sta nel .env.
  TOKEN="$(grep -E '^REMINDER_SECRET=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
  cat > "$CONF" <<CONFFILE
# Chi può mandarci immagini.
#
# CONSENTITI: elenco di AE Title separati da virgola. Con «@indirizzo» solo da
# quell'indirizzo; senza, da qualunque indirizzo. VUOTO = non si accetta nulla
# da nessuno, che è il punto di partenza giusto.
#
# Sull'apparecchio si scrive una destinazione DICOM con:
#   AE Title di destinazione: REFERRALFLOW
#   Indirizzo: l'IP di questo Mac        Porta: 11112
#   AE Title del mittente: quello che scrivete qui sotto
AE_TITLE=REFERRALFLOW
PORTA=11112
CONSENTITI=
FLOW_URL=http://127.0.0.1:3000/api/cron/imaging
FLOW_TOKEN=$TOKEN
CONFFILE
  chmod 600 "$CONF"
  echo "  scritto $CONF — aggiungete gli apparecchi in CONSENTITI."
fi

echo "4/4 · servizio"
PLIST="$HOME/Library/LaunchAgents/ch.referralflow.imaging-scp.plist"
sed -e "s#__QUI__#$QUI#g" -e "s#__HOME__#$HOME#g" mac/ch.referralflow.imaging-scp.plist > "$PLIST"
launchctl bootout "gui/$(id -u)/ch.referralflow.imaging-scp" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
launchctl kickstart -k "gui/$(id -u)/ch.referralflow.imaging-scp"

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '(ip non trovato)')"
echo
echo "Fatto. Sull'apparecchio si scrive:"
echo "   AE Title di destinazione : REFERRALFLOW"
echo "   Indirizzo               : $IP"
echo "   Porta                   : 11112"
echo
echo "Poi si aggiunge l'AE Title dell'apparecchio in CONSENTITI dentro $CONF"
echo "e si riavvia con:  launchctl kickstart -k gui/$(id -u)/ch.referralflow.imaging-scp"
echo "Il tasto «prova connessione» dell'apparecchio (C-ECHO) deve dare esito positivo."
