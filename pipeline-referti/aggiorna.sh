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

# Rilevatore di voce (VAD Silero): dove c'è silenzio whisper non trascrive —
# ferma le frasi «inventate» nelle pause. Piccolo, si scarica una volta sola;
# la pipeline lo usa da sola appena lo trova.
if [ ! -f "$DEST/modelli/ggml-silero-v5.1.2.bin" ]; then
  echo "Scarico il rilevatore di voce (VAD)…"
  mkdir -p "$DEST/modelli"
  curl -fsSL "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin" \
    -o "$DEST/modelli/ggml-silero-v5.1.2.bin.parziale" \
    && mv "$DEST/modelli/ggml-silero-v5.1.2.bin.parziale" "$DEST/modelli/ggml-silero-v5.1.2.bin" \
    || { rm -f "$DEST/modelli/ggml-silero-v5.1.2.bin.parziale"; echo "  (VAD non scaricato: la pipeline continua senza)"; }
fi

echo "Aggiornati: pipeline.py, correzioni.json, pannello.py, CLAUDE.md (e aggiorna.sh stesso)"
grep -m1 "Fasi implementate" -A 8 "$DEST/pipeline.py" | sed 's/^# \{0,2\}//'
