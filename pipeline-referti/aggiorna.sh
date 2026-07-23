#!/bin/bash
# Aggiorna la pipeline sul Mac mini scaricando l'ultima versione dal repo.
# Uso: bash ~/referti-pipeline/aggiorna.sh
# Nota: sovrascrive anche correzioni.json — il dizionario si modifica nel
# repo (segnalando gli errori ricorrenti in chat), non a mano sul Mac.
set -euo pipefail

BASE="https://raw.githubusercontent.com/leporiromeo777-glitch/referralflow/claude/ai-chain-collaboration-prompt-heacx2/pipeline-referti"
DEST="$HOME/referti-pipeline"

mkdir -p "$DEST"
curl -fsSL "$BASE/aggiorna.sh" -o "$DEST/aggiorna.sh.nuovo" && mv "$DEST/aggiorna.sh.nuovo" "$DEST/aggiorna.sh"
curl -fsSL "$BASE/pipeline.py" -o "$DEST/pipeline.py"
curl -fsSL "$BASE/correzioni.json" -o "$DEST/correzioni.json"

echo "Aggiornati: pipeline.py, correzioni.json (e aggiorna.sh stesso)"
grep -m1 "Fasi implementate" -A 8 "$DEST/pipeline.py" | sed 's/^# \{0,2\}//'
