#!/bin/bash
# Prova di rallentamento per UN medico (2026-09-07, richiesta dell'utente per
# il dr. Moccetti, che parla molto veloce): stesso audio, catena identica,
# SOLO l'atempo diverso. La bozza esce come «ombra» (file_id «…-ombra») e la
# pagina /referti/confronto la mette accanto a quella di produzione, alla
# cieca: il medico sceglie la migliore senza sapere quale sia quale.
#
# Prima serve la bozza di PRODUZIONE dello stesso audio (dettato caricato
# normalmente, col medico scelto): la conserva audio (REFERTI_CONSERVA_AUDIO)
# tiene l'originale in ~/referti-dataset/audio/<file_id>.<ext>.
#
# Uso:
#   bash prova-atempo.sh <audio> [medico] [atempo]
#     <audio>   un file audio (es. ~/referti-dataset/audio/<file_id>.m4a)
#     [medico]  id del profilo in medici.json (default: moccetti)
#     [atempo]  rallentamento da provare (default: «atempo_prova» del profilo, o 0.7)
#
# Non stampa mai contenuti: solo le righe di log della catena (fasi, conteggi,
# durate) e un riepilogo dei numeri utili al confronto (divergenze, dubbi,
# copertura). Per un giudizio VERO servono la scelta cieca del medico su
# /referti/confronto e, quando il referto è confermato, il banco d'oro
# (banco-audio.py ... attuale atempo-0.7).
set -euo pipefail

QUI="$(cd "$(dirname "$0")" && pwd)"
PY="${REFERTI_PYTHON:-/opt/homebrew/bin/python3.14}"
[ -x "$PY" ] || PY="python3"
AUDIO="${1:-}"
MEDICO="${2:-moccetti}"
ATEMPO="${3:-}"

if [ -z "$AUDIO" ] || [ ! -f "$AUDIO" ]; then
  echo "Uso: bash prova-atempo.sh <audio> [medico] [atempo]" >&2
  exit 2
fi
if ! echo "$MEDICO" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "Id medico non valido: $MEDICO" >&2
  exit 2
fi
if [ -z "$ATEMPO" ]; then
  ATEMPO=$("$PY" - "$QUI/medici.json" "$MEDICO" <<'PYEOF'
import json, sys
try:
    dati = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    dati = {}
for m in dati.get("medici", []):
    if isinstance(m, dict) and m.get("id") == sys.argv[2] and m.get("atempo_prova"):
        print(m["atempo_prova"]); break
else:
    print("0.7")
PYEOF
)
fi

# Il marcatore del medico nel nome: la catena legge il profilo da lì. Copia
# in una cartella di lavoro temporanea (l'originale non si tocca); il nome
# della copia è NEUTRO (id del contenuto), mai il nome originale.
LAVORO="$(mktemp -d "${TMPDIR:-/tmp}/prova-atempo.XXXXXX")"
chmod 700 "$LAVORO"
EXT="${AUDIO##*.}"
FID=$("$PY" -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest()[:16])' "$AUDIO")
COPIA="$LAVORO/medico-$MEDICO--$FID.$EXT"
cp "$AUDIO" "$COPIA"
trap 'rm -rf "$LAVORO"' EXIT

echo "prova atempo=$ATEMPO medico=$MEDICO (bozza «ombra»: si confronta in /referti/confronto)"
LOG="$LAVORO/corsa.log"
set +e
REFERTI_ATEMPO="$ATEMPO" "$PY" "$QUI/pipeline.py" --ombra "$COPIA" 2> >(tee "$LOG" >&2)
ESITO=$?
set -e
if [ "$ESITO" -ne 0 ]; then
  echo "La corsa è fallita (vedi le righe qui sopra)." >&2
  exit "$ESITO"
fi

# Numeri utili al confronto, presi SOLO dal log (mai dal testo).
echo
echo "riepilogo della corsa di prova:"
grep -oE "fase=(avvio|confronto|ispezione|copertura|manifesto|rischio) [^\n]*" "$LOG" \
  | sed -E 's/file=[^ ]+ //' | sed 's/^/  /' || true

# La bozza «ombra» va in ~/referti/output: il servizio la consegna al
# prossimo giro come tutte le altre (file_id «…-ombra», mai al posto della
# bozza vera).
OUT="${REFERTI_BASE:-$HOME/referti}/output"
PAYLOAD=$(ls "$LAVORO"/*-ombra.payload.json 2>/dev/null | head -1 || true)
if [ -n "$PAYLOAD" ] && [ -d "$OUT" ]; then
  DEST="$OUT/$(basename "${PAYLOAD%.payload.json}").json"
  cp "$PAYLOAD" "$DEST.tmp" && mv "$DEST.tmp" "$DEST"
  echo
  echo "bozza ombra in coda d'invio: $(basename "$DEST") — quando arriva, apri /referti/confronto."
else
  echo "bozza ombra non consegnata (output/ assente o payload mancante): $PAYLOAD" >&2
fi
