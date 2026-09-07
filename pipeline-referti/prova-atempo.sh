#!/bin/bash
# Prova di rallentamento per UN medico (2026-09-07, richiesta dell'utente per
# il dr. Moccetti, che parla molto veloce): stesso audio, catena identica,
# SOLO l'atempo diverso — una corsa per ogni valore da provare (di serie
# 0.7, 0.6 e 0.5). Ogni bozza esce come «ombra» con la sua etichetta
# (file_id «…-ombra-atempo-0.6») e la pagina /referti/confronto la mette
# accanto a quella di produzione, alla cieca: il medico sceglie la migliore
# senza sapere quale sia quale; l'etichetta compare solo a scelta fatta.
#
# Prima serve la bozza di PRODUZIONE dello stesso audio (dettato caricato
# normalmente, col medico scelto): la conserva audio (REFERTI_CONSERVA_AUDIO)
# tiene l'originale in ~/referti-dataset/audio/<file_id>.<ext>.
#
# Uso:
#   bash prova-atempo.sh <audio> [medico] [atempo ...]
#     <audio>     un file audio (es. ~/referti-dataset/audio/<file_id>.m4a)
#     [medico]    id del profilo in medici.json (default: moccetti)
#     [atempo …]  rallentamenti da provare (default: «atempo_prova» del profilo,
#                 altrimenti 0.7 0.6 0.5)
#
# Ogni corsa è una catena completa (due passate di whisper + fasi AI): su un
# dettato lungo può volerci mezz'ora per valore. Conviene lanciarla quando il
# Mac non sta lavorando altri dettati, ad esempio:
#   nohup bash prova-atempo.sh … > ~/referti/log/prova-atempo.log 2>&1 &
#
# Non stampa mai contenuti: solo le righe di log della catena (fasi, conteggi,
# durate) e, alla fine, una tabella dei numeri utili al confronto per ogni
# variante (divergenze, dubbi, copertura). Per un giudizio VERO servono la
# scelta cieca del medico su /referti/confronto e, quando il referto è
# confermato, il banco d'oro (banco-audio.py ... attuale atempo-0.7 atempo-0.6 atempo-0.5).
set -euo pipefail

QUI="$(cd "$(dirname "$0")" && pwd)"
PY="${REFERTI_PYTHON:-/opt/homebrew/bin/python3.14}"
[ -x "$PY" ] || PY="python3"
AUDIO="${1:-}"
MEDICO="${2:-moccetti}"
shift 2 2>/dev/null || shift $# 2>/dev/null || true
ATEMPI=("$@")

if [ -z "$AUDIO" ] || [ ! -f "$AUDIO" ]; then
  echo "Uso: bash prova-atempo.sh <audio> [medico] [atempo ...]" >&2
  exit 2
fi
if ! echo "$MEDICO" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "Id medico non valido: $MEDICO" >&2
  exit 2
fi
if [ "${#ATEMPI[@]}" -eq 0 ]; then
  # Dal profilo (numero o lista), altrimenti la terna di serie.
  read -r -a ATEMPI <<< "$("$PY" - "$QUI/medici.json" "$MEDICO" <<'PYEOF'
import json, sys
try:
    dati = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    dati = {}
prove = []
for m in dati.get("medici", []):
    if isinstance(m, dict) and m.get("id") == sys.argv[2]:
        g = m.get("atempo_prova")
        for x in (g if isinstance(g, list) else [g]):
            try:
                x = float(x)
            except (TypeError, ValueError):
                continue
            if 0.5 <= x <= 1.5 and x not in prove:
                prove.append(x)
print(" ".join(str(x) for x in prove) if prove else "0.7 0.6 0.5")
PYEOF
)"
fi
for a in "${ATEMPI[@]}"; do
  if ! echo "$a" | grep -Eq '^(0\.[5-9][0-9]?|1\.[0-5]?[0-9]?|1)$'; then
    echo "Atempo non valido: $a (ammessi da 0.5 a 1.5)" >&2
    exit 2
  fi
done

# Il marcatore del medico nel nome: la catena legge il profilo da lì. Copia
# in una cartella di lavoro temporanea (l'originale non si tocca); il nome
# della copia è NEUTRO (id del contenuto), mai il nome originale.
LAVORO="$(mktemp -d "${TMPDIR:-/tmp}/prova-atempo.XXXXXX")"
chmod 700 "$LAVORO"
trap 'rm -rf "$LAVORO"' EXIT
EXT="${AUDIO##*.}"
FID=$("$PY" -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest()[:16])' "$AUDIO")
OUT="${REFERTI_BASE:-$HOME/referti}/output"

echo "prova di rallentamento · medico=$MEDICO · valori: ${ATEMPI[*]} (bozze «ombra»: si confrontano in /referti/confronto)"
RIEPILOGO="$LAVORO/riepilogo.txt"
: > "$RIEPILOGO"
FALLITE=0
for ATEMPO in "${ATEMPI[@]}"; do
  ETICHETTA="atempo-$ATEMPO"
  CORSA="$LAVORO/$ETICHETTA"
  mkdir -p "$CORSA"
  COPIA="$CORSA/medico-$MEDICO--$FID.$EXT"
  cp "$AUDIO" "$COPIA"
  LOG="$CORSA/corsa.log"
  echo
  echo "════ $ETICHETTA · $(date '+%H:%M:%S') ════"
  set +e
  REFERTI_ATEMPO="$ATEMPO" REFERTI_OMBRA_ETICHETTA="$ETICHETTA" \
    "$PY" "$QUI/pipeline.py" --ombra "$COPIA" 2> >(tee "$LOG" >&2)
  ESITO=$?
  set -e
  if [ "$ESITO" -ne 0 ]; then
    echo "$ETICHETTA: corsa fallita (vedi le righe qui sopra)." >&2
    echo "$ETICHETTA | FALLITA" >> "$RIEPILOGO"
    FALLITE=$((FALLITE + 1))
    continue
  fi
  # Numeri utili al confronto, presi SOLO dal log (mai dal testo).
  DIV=$(grep -oE "fase=confronto [^\n]*divergenze=[0-9]+" "$LOG" | tail -1 | grep -oE "divergenze=[0-9]+" || echo "divergenze=?")
  DUB=$(grep -oE "fase=ispezione[^\n]*dubbi=[0-9]+" "$LOG" | tail -1 | grep -oE "dubbi=[0-9]+" || echo "dubbi=?")
  COP=$(grep -oE "fase=copertura [^\n]*" "$LOG" | tail -1 | sed -E 's/file=[^ ]+ //; s/fase=copertura //' || true)
  MAN=$(grep -oE "fase=manifesto [^\n]*" "$LOG" | tail -1 | sed -E 's/file=[^ ]+ //; s/fase=manifesto //' || true)
  echo "$ETICHETTA | $DIV | $DUB | copertura: ${COP:-?} | manifesto: ${MAN:-?}" >> "$RIEPILOGO"
  # La bozza «ombra» va in ~/referti/output: il servizio la consegna al
  # prossimo giro come tutte le altre (file_id «…-ombra-<etichetta>», mai al
  # posto della bozza vera).
  PAYLOAD=$(ls "$CORSA"/*-ombra-"$ETICHETTA".payload.json 2>/dev/null | head -1 || true)
  if [ -n "$PAYLOAD" ] && [ -d "$OUT" ]; then
    DEST="$OUT/$(basename "${PAYLOAD%.payload.json}").json"
    cp "$PAYLOAD" "$DEST.tmp" && mv "$DEST.tmp" "$DEST"
    echo "$ETICHETTA: bozza ombra in coda d'invio ($(basename "$DEST"))."
  else
    echo "$ETICHETTA: bozza ombra non consegnata (output/ assente o payload mancante)." >&2
  fi
done

echo
echo "riepilogo (solo numeri dal log; il giudizio vero è la scelta cieca del medico):"
sed 's/^/  /' "$RIEPILOGO"
echo
echo "quando le bozze arrivano, apri /referti/confronto: una coppia per ogni variante, in ordine casuale."
[ "$FALLITE" -eq 0 ]
