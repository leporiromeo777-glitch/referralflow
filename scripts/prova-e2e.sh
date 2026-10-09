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
  [ -n "${ARCH_PID:-}" ] && kill "$ARCH_PID" 2> /dev/null; [ -n "${RIC_PID:-}" ] && kill "$RIC_PID" 2> /dev/null; [ -n "${ARCH2_PID:-}" ] && kill "$ARCH2_PID" 2> /dev/null
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
# Le prove del righello restano: sul server di prova gli strumenti di misura sono accesi
# (in produzione la pagina Immagini è di sola consultazione, 5.10.2026).
# L'archivio dello studio (6.10.2026): uno FINTO con esami inventati, e la ricezione vera, in una
# cartella temporanea — il server di prova non tocca mai la ricezione né l'archivio dello studio.
ARCH="$TMP/imaging-base"; mkdir -p "$ARCH/ingresso" "$ARCH/scartati"
printf 'AE_TITLE=REFERRALFLOW\nPORTA=11113\nCONSENTITI=*@127.0.0.1\nFLOW_URL=\n' > "$ARCH/ricezione.conf"
printf 'NOME=Archivio di prova\nHOST=127.0.0.1\nPORTA=11150\nAE=ARCHIVIOPROVA\nNOSTRO_AE=REFERRALFLOW\nGIORNI_COPIA=7\n' > "$ARCH/archivio.conf"
# Il NAS dello studio (8.10.2026): uno FINTO, una cartella temporanea che la prova riempie di esami sintetici.
NAS_FINTO="$TMP/nas-finto"; mkdir -p "$NAS_FINTO"
printf 'URL=smb://prova@127.0.0.1/finto\nRADICE=%s\n' "$NAS_FINTO" > "$ARCH/archivio-file.conf"
"$PY" imaging/archivio-finto.py --porta 11150 --ae ARCHIVIOPROVA --dest REFERRALFLOW=127.0.0.1:11113 > "$TMP/archivio-finto.log" 2>&1 &
ARCH_PID=$!
# …e un secondo archivio finto (il centro radiologico di un altro): si cerca su tutti e due.
printf 'NOME=Radiologia di prova\nHOST=127.0.0.1\nPORTA=11151\nAE=ARCHIVIODUE\nNOSTRO_AE=REFERRALFLOW\nGIORNI_COPIA=7\n' > "$ARCH/archivio-radiologia.conf"
"$PY" imaging/archivio-finto.py --porta 11151 --ae ARCHIVIODUE --variante 2 --dest REFERRALFLOW=127.0.0.1:11113 > "$TMP/archivio-finto-2.log" 2>&1 &
ARCH2_PID=$!
REFERTI_IMAGING_BASE="$ARCH" "$PY" imaging/ricevi-dicom.py > "$TMP/ricezione.log" 2>&1 &
RIC_PID=$!
# Monitoraggio: sul server di prova il motore è spento (lo guidano le prove, col tempo simulato) e l'AI pure;
# la demo è quella COMPLETA (13 pazienti, tutte le situazioni), non i quattro che si vedono di serie.
MONITORAGGIO_DEMO=completa MONITORAGGIO_MOTORE=spento MONITORAGGIO_AI=spenta PRESSIONE_PROPOSTE=1 PRESSIONE_CARTELLA="$TMP/pressione-cartella" PRESSIONE_CARTELLA_GIRO=spento CICLO_CARTELLA="$TMP/ciclo-cartella" ECG_CARTELLA="$TMP/ciclo-cartella-ecg" CICLO_CARTELLA_GIRO=spento REFERTI_IMAGING_BASE="$ARCH" IMAGING_MISURE=1 DATABASE_URL="$URL_DB" PORT="$PORTA" npx next dev -p "$PORTA" > "$TMP/server.log" 2>&1 &
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

echo "→ e-mail per l'inviante: anteprima, file .eml, allegati identici, bozza bloccata"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-email.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" > "$TMP/email.txt" 2>&1 || { fallito "prova-email"; tail -4 "$TMP/email.txt" | cut -c1-300; }
grep -E "^NO" "$TMP/email.txt"; echo "   $(grep -c '^ok' "$TMP/email.txt") ok, $(grep -c '^NO' "$TMP/email.txt") no"

echo "→ carica documento nella cartella: 50 MB, testo o no, categoria, rifiuti"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-documenti.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" > "$TMP/documenti.txt" 2>&1 || fallito "prova-documenti"
grep -E "^NO" "$TMP/documenti.txt"; echo "   $(grep -c '^ok' "$TMP/documenti.txt") ok, $(grep -c '^NO' "$TMP/documenti.txt") no"
grep -E "^ok OCR" "$TMP/documenti.txt" | sed 's/^ok /   /'

echo "→ aggiornamento della lettera vecchia: richiesta nel dettato, proposta, applica, annulla"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-aggiorna-lettera.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" > "$TMP/aggiorna.txt" 2>&1 || { fallito "prova-aggiorna-lettera"; cut -c1-300 "$TMP/aggiorna.txt"; }
grep -E "^NO" "$TMP/aggiorna.txt"; echo "   $(grep -c '^ok' "$TMP/aggiorna.txt") ok, $(grep -c '^NO' "$TMP/aggiorna.txt") no"

echo "→ seconda traccia con istruzioni: annulla, era testo da aggiungere"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-istruzioni.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" > "$TMP/istruzioni.txt" 2>&1 || { fallito "prova-istruzioni"; cut -c1-300 "$TMP/istruzioni.txt"; }
grep -E "^NO" "$TMP/istruzioni.txt"; echo "   $(grep -c '^ok' "$TMP/istruzioni.txt") ok, $(grep -c '^NO' "$TMP/istruzioni.txt") no"

echo "→ seconda traccia unita: in fondo alla bozza, base della misura delle correzioni"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-tracce.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" > "$TMP/tracce.txt" 2>&1 || { fallito "prova-tracce"; cut -c1-300 "$TMP/tracce.txt"; }
grep -E "^NO" "$TMP/tracce.txt"; echo "   $(grep -c '^ok' "$TMP/tracce.txt") ok, $(grep -c '^NO' "$TMP/tracce.txt") no"

echo "→ misura senza conferma: Word scaricato, niente doppioni, riepilogo della settimana"
C_MIS="$(sessione segretaria)" || C_MIS="$C_MEDICO"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-misura.ts "http://localhost:$PORTA" "$C_MIS" "$STUDIO" > "$TMP/misura.txt" 2>&1 || { fallito "prova-misura"; cut -c1-300 "$TMP/misura.txt"; }
grep -E "^NO" "$TMP/misura.txt"; echo "   $(grep -c '^ok' "$TMP/misura.txt") ok, $(grep -c '^NO' "$TMP/misura.txt") no"

echo "→ MediOnline via CalDAV: scrittura spenta, nessuna chiamata"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-medionline.ts "http://localhost:$PORTA" "$C_MIS" "$STUDIO" > "$TMP/medionline.txt" 2>&1 || { fallito "prova-medionline"; cut -c1-300 "$TMP/medionline.txt"; }
grep -E "^NO" "$TMP/medionline.txt"; echo "   $(grep -c '^ok' "$TMP/medionline.txt") ok, $(grep -c '^NO' "$TMP/medionline.txt") no"

echo "→ cartella dei dettati sul computer: stato della condivisione, file per Windows"
npx tsx scripts/e2e/prova-cartella-dettati.ts "http://localhost:$PORTA" "$C_MIS" > "$TMP/cartella.txt" 2>&1 || { fallito "prova-cartella-dettati"; cut -c1-300 "$TMP/cartella.txt"; }
grep -E "^NO" "$TMP/cartella.txt"; echo "   $(grep -c '^ok' "$TMP/cartella.txt") ok, $(grep -c '^NO' "$TMP/cartella.txt") no"

echo "→ cartella della bozza: nome simile + agenda, proposte, collega, scollega"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-paziente.ts "http://localhost:$PORTA" "$C_MIS" "$STUDIO" > "$TMP/paziente.txt" 2>&1 || { fallito "prova-paziente"; cut -c1-300 "$TMP/paziente.txt"; }
grep -E "^NO" "$TMP/paziente.txt"; echo "   $(grep -c '^ok' "$TMP/paziente.txt") ok, $(grep -c '^NO' "$TMP/paziente.txt") no"

echo "→ archivio dello studio (finto): cerca, prendi e apri, copia temporanea, scadenza"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-archivio.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" "$ARCH" > "$TMP/archivio.txt" 2>&1 || { fallito "prova-archivio"; cut -c1-300 "$TMP/archivio.txt"; }
grep -E "^NO" "$TMP/archivio.txt"; echo "   $(grep -c '^ok' "$TMP/archivio.txt") ok, $(grep -c '^NO' "$TMP/archivio.txt") no"

echo "→ ecografo (finto) che manda direttamente al Mac: arriva, resta, non si raddoppia, si guarda, si trova"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-ecografo.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" "$ARCH" "$PY" 11113 > "$TMP/ecografo.txt" 2>&1 || { fallito "prova-ecografo"; cut -c1-300 "$TMP/ecografo.txt"; }
grep -E "^NO" "$TMP/ecografo.txt"; echo "   $(grep -c '^ok' "$TMP/ecografo.txt") ok, $(grep -c '^NO' "$TMP/ecografo.txt") no"

echo "→ esami sul NAS (finto): catalogo senza copiare, si guardano, NAS staccato e riattaccato"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-nas.ts "http://localhost:$PORTA" "$C_MEDICO" "$STUDIO" "$ARCH" "$PY" "$NAS_FINTO" > "$TMP/nas.txt" 2>&1 || { fallito "prova-nas"; cut -c1-300 "$TMP/nas.txt"; }
grep -E "^NO" "$TMP/nas.txt"; echo "   $(grep -c '^ok' "$TMP/nas.txt") ok, $(grep -c '^NO' "$TMP/nas.txt") no"

echo "→ monitoraggio remoto (demo): stati, isolamento, doppioni, avvisi, permessi, AI spenta"
C_TEC="$(sessione tecnico)"; C_ADM="$(sessione admin)"; C_SEGR="$(sessione segretaria)"
MONITORAGGIO_DEMO=completa DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-monitoraggio.ts "http://localhost:$PORTA" "$STUDIO" "$C_MEDICO" "$C_SEGR" "$C_TEC" "$C_ADM" > "$TMP/monitoraggio.txt" 2>&1 || { fallito "prova-monitoraggio"; cut -c1-300 "$TMP/monitoraggio.txt" | tail -5; }
grep -E "^NO" "$TMP/monitoraggio.txt"; echo "   $(grep -c '^ok' "$TMP/monitoraggio.txt") ok, $(grep -c '^NO' "$TMP/monitoraggio.txt") no"

echo "→ pressione: profilo delle 24 ore, terapia, tabella dei farmaci da confermare, fasce scoperte, proposte, permessi"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-pressione.ts "http://localhost:$PORTA" "$STUDIO" "$C_MEDICO" "$C_SEGR" "$C_TEC" "$TMP/pressione-cartella" > "$TMP/pressione.txt" 2>&1 || { fallito "prova-pressione"; cut -c1-300 "$TMP/pressione.txt"; }
grep -E "^NO" "$TMP/pressione.txt"; echo "   $(grep -c '^ok' "$TMP/pressione.txt") ok, $(grep -c '^NO' "$TMP/pressione.txt") no"

echo "→ ciclo ed ECG: il referto della prova da sforzo e il tracciato vanno nella cartella del paziente, o aspettano da assegnare"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-ciclo.ts "http://localhost:$PORTA" "$STUDIO" "$C_SEGR" "$C_TEC" "$TMP/ciclo-cartella" > "$TMP/ciclo.txt" 2>&1 || { fallito "prova-ciclo"; cut -c1-300 "$TMP/ciclo.txt"; }
grep -E "^NO" "$TMP/ciclo.txt"; echo "   $(grep -c '^ok' "$TMP/ciclo.txt") ok, $(grep -c '^NO' "$TMP/ciclo.txt") no"

echo "→ dividi cartella: da un PDF unico ai singoli documenti, proposta, conferma, zip, permessi"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-dividi.ts "http://localhost:$PORTA" "$STUDIO" "$C_SEGR" "$C_TEC" "$TMP/dividi" > "$TMP/dividi.txt" 2>&1 || { fallito "prova-dividi"; cut -c1-300 "$TMP/dividi.txt"; }
grep -E "^NO" "$TMP/dividi.txt"; echo "   $(grep -c '^ok' "$TMP/dividi.txt") ok, $(grep -c '^NO' "$TMP/dividi.txt") no"

echo "→ agenda: quando MediOnline mostra meno agende, quelle nascoste non si svuotano"
DATABASE_URL="$URL_DB" NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-agenda-colonne.ts "$STUDIO" > "$TMP/agenda-colonne.txt" 2>&1 || { fallito "prova-agenda-colonne"; cut -c1-300 "$TMP/agenda-colonne.txt"; }
grep -E "^NO" "$TMP/agenda-colonne.txt"; echo "   $(grep -c '^ok' "$TMP/agenda-colonne.txt") ok, $(grep -c '^NO' "$TMP/agenda-colonne.txt") no"

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
