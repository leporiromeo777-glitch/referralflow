#!/bin/bash
# Diagnosi dell'AI locale dell'app (13.9.2026).
#
# Risponde a una domanda sola: perché l'assistente non risponde?
# Le cause possibili sono cinque e prima erano indistinguibili, perché
# src/lib/ollama.ts falliva in silenzio.
#
# Uso:  bash mac/diagnosi-ai.sh
# Non tocca nulla: solo letture. Nessun dato clinico.

set -u
cd "$(dirname "$0")/.." || exit 1

# I valori veri sono quelli del .env dell'app, non quelli della catena.
leggi_env() { [ -f .env ] && grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- ; }
URL="$(leggi_env OLLAMA_URL)"; URL="${URL:-http://localhost:11434}"
MODELLO="$(leggi_env OLLAMA_MODEL)"; MODELLO="${MODELLO:-gemma3:12b}"

echo "== configurazione dell'app (.env) =="
echo "OLLAMA_URL   = $URL"
echo "OLLAMA_MODEL = $MODELLO"
n=$(grep -c '^OLLAMA_MODEL=' .env 2>/dev/null || echo 0)
[ "$n" -gt 1 ] && echo "ATTENZIONE: OLLAMA_MODEL compare $n volte nel .env (vince l'ultima)."
echo

echo "== 1. Ollama risponde? =="
if curl -sS --max-time 10 "$URL/api/tags" -o /tmp/rf-tags.json 2>/tmp/rf-err.txt; then
  echo "sì, $URL risponde"
else
  echo "NO: $URL non risponde — $(cat /tmp/rf-err.txt)"
  echo
  echo "   Ollama è avviato?   ollama list"
  echo "   Serve il modello un altro programma? Controlla LM Studio:"
  curl -sS --max-time 5 http://localhost:1234/v1/models >/dev/null 2>&1 \
    && echo "   → SÌ: LM Studio risponde su http://localhost:1234 (API OpenAI)." \
    || echo "   → no, neanche LM Studio risponde su :1234."
  echo "   Se il modello sta in LM Studio, l'app va adattata: parla in dialetto Ollama (/api/generate)."
  exit 1
fi
echo

echo "== 2. modelli installati =="
INSTALLATI=$(python3 -c 'import json,sys; print("\n".join(m["name"] for m in json.load(open("/tmp/rf-tags.json"))["models"]))' 2>/dev/null)
echo "${INSTALLATI:-(nessuno)}"
echo
if echo "$INSTALLATI" | grep -qxF "$MODELLO"; then
  echo "«$MODELLO» c'è."
else
  echo "PROBLEMA TROVATO: «$MODELLO» NON è installato."
  echo "  → o lo scarichi:   ollama pull $MODELLO"
  echo "  → o correggi OLLAMA_MODEL nel .env con uno dei nomi qui sopra."
  echo "  (finché non lo fai, ogni domanda all'assistente fallisce: Ollama risponde 404.)"
  exit 1
fi
echo

echo "== 3. modelli già caricati in memoria =="
curl -sS --max-time 10 "$URL/api/ps" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\n".join(m["name"] for m in d.get("models",[])) or "(nessuno: la prossima domanda parte a modello freddo, 1-3 min per un 27b)")' 2>/dev/null
echo

echo "== 4. generazione di prova (può volerci qualche minuto a modello freddo) =="
INIZIO=$(date +%s)
RISPOSTA=$(curl -sS --max-time 300 "$URL/api/generate" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODELLO\",\"prompt\":\"Rispondi con una sola parola: ok\",\"stream\":false,\"options\":{\"temperature\":0}}")
FINE=$(date +%s)
echo "$RISPOSTA" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if "error" in d: print("ERRORE di Ollama:", d["error"]); sys.exit(1)
print("risposta:", repr(d.get("response","")[:200]))
' || exit 1
echo "tempo: $((FINE-INIZIO)) s"
echo
echo "Se sei arrivato qui, il modello genera: l'assistente deve funzionare."
echo "Se ci ha messo più di 240 s, alza OLLAMA_TIMEOUT_MS nel .env."
