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
curl -fsSL "$BASE/vocabolario.txt" -o "$DEST/vocabolario.txt"
curl -fsSL "$BASE/pannello.py" -o "$DEST/pannello.py"
curl -fsSL "$BASE/palestra.py" -o "$DEST/palestra.py"
curl -fsSL "$BASE/installa-avvio.sh" -o "$DEST/installa-avvio.sh"
curl -fsSL "$BASE/CLAUDE.md" -o "$DEST/CLAUDE.md"
# correzioni-locali.json e vocabolario-locali.txt NON si toccano: sono le voci
# aggiunte dallo studio dal pannello locale.

echo "Aggiornati: pipeline.py, correzioni.json, pannello.py, CLAUDE.md (e aggiorna.sh stesso)"
grep -m1 "Fasi implementate" -A 8 "$DEST/pipeline.py" | sed 's/^# \{0,2\}//'
