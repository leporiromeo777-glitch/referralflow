#!/bin/bash
# Distribuisce la catena sul Mac dello studio con due blocchi (Ricerca 18 §18):
#   1. la suite catastrofica deve passare per intero (un solo caso rosso = stop);
#   2. nessun referto deve essere in lavorazione (mai riavviare il servizio a
#      metà di un dettato: si perderebbe la corsa).
# Poi copia i file della catena in ~/referti-pipeline e riavvia il servizio.
# Uso: bash pipeline-referti/distribuisci.sh        (dal repo, sul Mac dello studio)
#      FORZA_LAVORAZIONE=1 … per saltare SOLO il controllo 2 (mai il primo).
set -euo pipefail

QUI="$(cd "$(dirname "$0")" && pwd)"
DEST="${REFERTI_PIPELINE_DIR:-$HOME/referti-pipeline}"
PY="${REFERTI_PYTHON:-/opt/homebrew/bin/python3.14}"
[ -x "$PY" ] || PY="python3"
SERVIZIO="ch.referralflow.referti-servizio"

echo "1/3 · suite catastrofica"
if ! "$PY" "$QUI/prove-catastrofiche.py"; then
  echo "BLOCCO: la suite catastrofica non passa. Nessun file copiato, servizio non toccato." >&2
  exit 1
fi

echo "2/3 · referti in lavorazione?"
ING="${REFERTI_INGRESSO:-$HOME/referti/ingresso}"
LAV="${REFERTI_LAVORAZIONE:-$HOME/referti/lavorazione}"
if [ "${FORZA_LAVORAZIONE:-0}" != "1" ]; then
  if [ -d "$ING" ] && [ -n "$(ls -A "$ING" 2>/dev/null)" ]; then
    echo "BLOCCO: ci sono file in ingresso ($ING): aspetta che la catena li lavori." >&2
    exit 1
  fi
  if [ -d "$LAV" ] && [ -n "$(find "$LAV" -type f -mmin -30 2>/dev/null | head -1)" ]; then
    echo "BLOCCO: lavorazione attiva negli ultimi 30 minuti ($LAV)." >&2
    exit 1
  fi
  if pgrep -f "whisper-cli|trascrivi-voxtral.py|allinea-tempi.py" >/dev/null 2>&1; then
    echo "BLOCCO: una trascrizione è in corso (whisper/Voxtral/aligner)." >&2
    exit 1
  fi
  # Fusione in corso? Gira dentro il processo del servizio: l'ultima riga di
  # fusione nel log è ancora un «avvio» senza esito (e ha meno di 15 minuti).
  LOGS="$HOME/referti/log/servizio.log"
  if [ -f "$LOGS" ]; then
    ULT=$(grep -E "fase=fusione (bozza=|file=fusione-)" "$LOGS" | tail -1)
    if echo "$ULT" | grep -q "esito=avvio"; then
      T=$(echo "$ULT" | cut -c1-19)
      ETA=$(( $(date +%s) - $(date -j -f "%Y-%m-%dT%H:%M:%S" "$T" +%s 2>/dev/null || echo 0) ))
      if [ "$ETA" -lt 900 ]; then
        echo "BLOCCO: una fusione è in corso da $ETA s (riavviare ora la perderebbe)." >&2
        exit 1
      fi
    fi
  fi
fi

echo "3/3 · copia e riavvio"
mkdir -p "$DEST"
n=0
for f in pipeline.py profilo-cardiologia.json allinea-tempi.py trascrivi-voxtral.py pannello.py \
         palestra.py suite-cattiva.py banco-audio.py esporta-oro.sh prove-catastrofiche.py \
         distribuisci.sh farmaci-swissmedic.py prepara-dataset.py proposte-glossario.py \
         installa-avvio.sh CLAUDE.md correzioni.json vocabolario.txt; do
  if [ -f "$QUI/$f" ] && ! cmp -s "$QUI/$f" "$DEST/$f" 2>/dev/null; then
    cp "$QUI/$f" "$DEST/$f"
    n=$((n + 1))
    echo "  aggiornato $f"
  fi
done
# correzioni-locali.json, vocabolario-locali.txt, dati/, modelli/ sono dello
# studio: non si toccano mai.
if [ "$n" -eq 0 ]; then
  echo "  niente da copiare: la catena distribuita è già identica al repo."
fi
if launchctl print "gui/$(id -u)/$SERVIZIO" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$SERVIZIO"
  echo "  servizio $SERVIZIO riavviato"
else
  echo "  servizio $SERVIZIO non registrato: nessun riavvio (bash installa-avvio.sh per registrarlo)"
fi
echo "fatto · $(date '+%H:%M:%S')"
