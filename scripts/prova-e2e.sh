#!/bin/bash
# Prove end-to-end con un comando (21.9.2026).
#
# Accende un server di PROVA sul database demo (mai quello dello studio) su una
# porta a parte, crea una sessione di prova senza password, genera i DICOM
# sintetici, lancia le prove del righello e della serie, la regressione delle
# misure, controlla che la segreteria non possa misurare, poi PULISCE (esami e
# file sintetici, cache) e spegne il server — anche se qualcosa fallisce.
#
#   bash scripts/prova-e2e.sh        oppure   npm run test:e2e
#
# Esce con 0 solo se tutto è verde. Dura circa due minuti.
set -uo pipefail
cd "$(dirname "$0")/.."

PORTA="${E2E_PORTA:-3001}"
DB="referralflow_demo"                       # fisso: queste prove non toccano mai altro
URL_DB="postgres://$(whoami)@localhost:5432/$DB"
PY="${IMAGING_PYTHON:-$HOME/.referralflow-imaging/bin/python}"
TMP="$(mktemp -d -t rf-e2e)"
ESITO=0
fallito() { echo "✗ $1"; ESITO=1; }

if lsof -iTCP:"$PORTA" -sTCP:LISTEN > /dev/null 2>&1; then echo "La porta $PORTA è occupata: chiudi ciò che la usa o imposta E2E_PORTA."; exit 2; fi
if ! psql "$URL_DB" -Atc "select 1" > /dev/null 2>&1; then echo "Il database demo ($DB) non risponde."; exit 2; fi
[ -x "$PY" ] || { echo "Manca il Python delle immagini: $PY"; exit 2; }

STUDIO="$(psql "$URL_DB" -Atc "select id from studios where slug = 'demo' limit 1")"
[ -n "$STUDIO" ] || { echo "Nel database demo manca lo studio «demo»."; exit 2; }

pulisci() {
  psql "$URL_DB" -Atqc "delete from imaging_esami where studio_id = '$STUDIO' and descrizione like 'Prova righello%'" > /dev/null 2>&1
  rm -rf "uploads/imaging/$STUDIO" 2> /dev/null
  find uploads/imaging-cache -name "*$STUDIO*" -delete 2> /dev/null
  find uploads/imaging-cache -name "mpr-*" -delete 2> /dev/null
  rm -rf uploads/imaging-cache/volumi 2> /dev/null
}
spegni() {
  [ -n "${SERVER_PID:-}" ] && pkill -P "$SERVER_PID" 2> /dev/null; [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2> /dev/null
  pkill -f "next dev -p $PORTA" 2> /dev/null
  pulisci
  rm -rf "$TMP"
}
trap spegni EXIT

echo "→ sintassi di tutti i file del prototipo"
for f in public/prototipo/*.js public/prototipo/mse/*.js public/prototipo/bridge/*.js; do node --check "$f" || fallito "non si legge: $f"; done

echo "→ DICOM sintetici"
"$PY" imaging/genera-sintetici.py "$TMP" > /dev/null || { fallito "generazione dei sintetici"; exit 1; }

echo "→ server di prova sul database demo (porta $PORTA)"
pulisci
DATABASE_URL="$URL_DB" PORT="$PORTA" npx next dev -p "$PORTA" > "$TMP/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORTA/login" && break; sleep 2; done
curl -s -o /dev/null "http://localhost:$PORTA/login" || { fallito "il server di prova non è partito (vedi $TMP/server.log)"; tail -5 "$TMP/server.log"; exit 1; }

sessione() {   # ruolo → cookie
  local riga; riga="$(psql "$URL_DB" -Atc "select id || '|' || email from users where studio_id = '$STUDIO' and role = '$1' order by email limit 1")"
  [ -n "$riga" ] || return 1
  echo "rf_session=$(node scripts/e2e/sessione-demo.mjs "${riga%%|*}" "${riga##*|}" "$1" "$STUDIO")"
}
C_MEDICO="$(sessione medico)" || { fallito "nel demo manca un utente medico"; exit 1; }
API="http://localhost:$PORTA/api/prototipo/imaging"

echo "→ righello: distanza, strumenti, Gate, provenienza, eventi, statistiche"
python3 scripts/prova-righello-e2e.py "$TMP" "$C_MEDICO" "$API" > "$TMP/e2e-1.txt" 2>&1 || fallito "prova-righello-e2e"
grep -E "^NO" "$TMP/e2e-1.txt"; echo "   $(grep -c '^ok' "$TMP/e2e-1.txt") ok, $(grep -c '^NO' "$TMP/e2e-1.txt") no"

echo "→ la segreteria guarda ma non misura"
if C_SEG="$(sessione segretaria)"; then
  IMG="$(psql "$URL_DB" -Atc "select i.id from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id where e.studio_id = '$STUDIO' and e.descrizione = 'Prova righello sintetica' and e.modalita = 'US' limit 1")"
  COD="$(curl -s -o /dev/null -w '%{http_code}' -b "$C_SEG" -X POST -H 'Content-Type: application/json' -d "{\"immagine_id\":\"$IMG\",\"frame\":0,\"punti\":[{\"x\":200,\"y\":300},{\"x\":300,\"y\":300}]}" "$API/misure")"
  [ "$COD" = "403" ] && echo "   ok (403)" || fallito "la segreteria ha ottenuto $COD invece di 403"
else echo "   (nel demo non c'è una segretaria: salto)"; fi

echo "→ regressione delle misure appena salvate"
DATABASE_URL="$URL_DB" npx tsx scripts/misure-regressione.ts > "$TMP/regr.txt" 2>&1 || fallito "misure-regressione"
tail -1 "$TMP/regr.txt" | sed 's/^/   /'

echo "→ serie: geometria, distanza 3D, volume, MPR"
pulisci
python3 scripts/prova-righello-serie-e2e.py "$TMP" "$C_MEDICO" "$API" > "$TMP/e2e-2.txt" 2>&1 || fallito "prova-righello-serie-e2e"
grep -E "^NO" "$TMP/e2e-2.txt"; echo "   $(grep -c '^ok' "$TMP/e2e-2.txt") ok, $(grep -c '^NO' "$TMP/e2e-2.txt") no"

echo "→ procedure dell'assistente in forma di documento"
DOC="$(curl -s -b "$C_MEDICO" -X POST -H 'Content-Type: application/json' -d '{"nome":"preparazione_giornata"}' "http://localhost:$PORTA/api/prototipo/procedura" | python3 -c "import sys,json; j=json.load(sys.stdin); d=j.get('documento') or {}; print('ok' if d.get('intestazione',{}).get('titolo')=='Preparazione della giornata' and len(d.get('numeri',[]))==4 else 'no')" 2> /dev/null)"
[ "$DOC" = "ok" ] && echo "   ok" || fallito "la preparazione della giornata non torna un documento"

echo "→ chi vede che cosa: menu dal server e rotte bloccate, ruolo per ruolo"
B="http://localhost:$PORTA/api/prototipo"
controlla() {   # ruolo  sezione-attesa-si  sezione-attesa-no  rotta-attesa-200  rotta-attesa-403
  local c; c="$(sessione "$1")" || { echo "   (nel demo manca $1: salto)"; return; }
  local sez; sez="$(curl -s -b "$c" "$B/dati" | python3 -c "import sys,json; print(' '.join(json.load(sys.stdin).get('sezioni', [])))" 2> /dev/null)"
  case " $sez " in *" $2 "*) ;; *) fallito "$1: nel menu manca $2";; esac
  if [ -n "$3" ]; then case " $sez " in *" $3 "*) fallito "$1: nel menu c'è $3";; esac; fi
  [ -z "$4" ] || { local k; k="$(curl -s -o /dev/null -w '%{http_code}' -b "$c" "$B/$4")"; [ "$k" = "200" ] || fallito "$1: /$4 ha dato $k invece di 200"; }
  [ -z "$5" ] || { local k; k="$(curl -s -o /dev/null -w '%{http_code}' -b "$c" "$B/$5")"; [ "$k" = "403" ] || fallito "$1: /$5 ha dato $k invece di 403"; }
  echo "   $1: $(echo $sez | wc -w | tr -d ' ') sezioni"
}
controlla medico reports fatturazione referti fatturazione
controlla assistente dittafono reports percorsi referti
controlla segretaria fatturazione administration fatturazione ""
controlla admin administration dittafono fatturazione ""
controlla tecnico administration "" fatturazione ""

echo
[ "$ESITO" = "0" ] && echo "TUTTO OK" || echo "CI SONO ERRORI"
exit "$ESITO"
