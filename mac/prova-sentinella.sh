#!/bin/bash
# Prove della sentinella (mac/sentinella.sh) su cartelle finte: nessun
# servizio vero, nessuna notifica mandata (SENTINELLA_PROVA=1 stampa gli
# avvisi). Uso: bash mac/prova-sentinella.sh
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'kill $SRV 2> /dev/null; wait $SRV 2> /dev/null; rm -rf "$T"' EXIT

PORTA=$((20000 + RANDOM % 20000))
mkdir -p "$T/www" && (cd "$T/www" && exec python3 -m http.server "$PORTA" --bind 127.0.0.1 > /dev/null 2>&1) &
SRV=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://127.0.0.1:$PORTA/" && break; sleep 0.3; done

R="$T/referti"; mkdir -p "$R"/{ingresso,lavorazione,output,errori,log} "$T/backup" "$T/stato"
: > "$R/log/servizio.log"; : > "$T/automazioni.log"; : > "$T/backup/referralflow-x.sql.gz"

epoch() { date -j -f '%Y-%m-%d %H:%M' "$1" +%s; }
# eta <file> <minuti fa rispetto ad ADESSO>
eta() { touch -t "$(date -r $((ADESSO - $2 * 60)) +%Y%m%d%H%M.%S)" "$1"; }

APP_SU="http://127.0.0.1:$PORTA/"
APP_GIU="http://127.0.0.1:1/"
APP="$APP_SU"
giro() {
  SENTINELLA_PROVA=1 SENTINELLA_ADESSO="$ADESSO" SENTINELLA_REFERTI="$R" SENTINELLA_STATO="$T/stato" \
  SENTINELLA_LOG="$T/sentinella.log" SENTINELLA_APP_URL="$APP" SENTINELLA_DOMINIO="" \
  SENTINELLA_OLLAMA_URL="$APP_SU" SENTINELLA_BACKUP="$T/backup" SENTINELLA_AUTOMAZIONI_LOG="$T/automazioni.log" \
  SENTINELLA_SERVIZIO_CATENA="" SENTINELLA_PG_ISREADY=/usr/bin/true SENTINELLA_CONF=/dev/null \
  bash "$DIR/sentinella.sh"
}

OK=0; KO=0
verifica() { # <nome> <uscita> <grep atteso, vuoto = nessun avviso>
  if { [ -z "$3" ] && [ -z "$2" ]; } || { [ -n "$3" ] && echo "$2" | grep -q -- "$3"; }; then
    OK=$((OK + 1)); echo "ok   $1"
  else
    KO=$((KO + 1)); echo "NO   $1 → «$2»"
  fi
}

ADESSO="$(epoch '2026-09-29 10:00')"
eta "$R/log/servizio.log" 5; eta "$T/backup/referralflow-x.sql.gz" 480

verifica "tutto in ordine: nessun avviso" "$(giro)" ""

APP="$APP_GIU"
verifica "piattaforma giù, primo giro: si aspetta" "$(giro)" ""
verifica "piattaforma giù, secondo giro: avviso" "$(giro)" "AVVISO\[high\] La piattaforma non risponde"
verifica "piattaforma ancora giù: non si ripete subito" "$(giro)" ""
ADESSO=$((ADESSO + 6 * 3600 + 60))
eta "$R/log/servizio.log" 5; eta "$T/backup/referralflow-x.sql.gz" 480
verifica "piattaforma giù dopo 6 ore: si ripete" "$(giro)" "La piattaforma non risponde"
APP="$APP_SU"
verifica "piattaforma tornata: «Risolto»" "$(giro)" "Risolto: la piattaforma"
verifica "dopo «Risolto» silenzio" "$(giro)" ""

ADESSO="$(epoch '2026-09-29 11:00')"
eta "$T/backup/referralflow-x.sql.gz" 480
: > "$R/ingresso/dettato.ds2"; eta "$R/ingresso/dettato.ds2" 90; eta "$R/log/servizio.log" 80
verifica "dettato in coda e catena zitta da 80 min: avviso" "$(giro)" "Catena bloccata: 1 dettati in coda.*80 minuti"
eta "$R/log/servizio.log" 1
verifica "la catena riprende: «Risolto»" "$(giro)" "Risolto: la catena"
rm -f "$R/ingresso/dettato.ds2"
eta "$R/log/servizio.log" 200
verifica "catena zitta ma niente in coda: nessun avviso" "$(giro)" ""

: > "$R/lavorazione/abc"; eta "$R/lavorazione/abc" 200; eta "$R/log/servizio.log" 2
verifica "un dettato in lavorazione da 200 min" "$(giro)" "in lavorazione da 200 minuti"
rm -f "$R/lavorazione/abc"; giro > /dev/null

: > "$R/output/b.json"; eta "$R/output/b.json" 70
verifica "bozza non consegnata da 70 min" "$(giro)" "non consegnate alla piattaforma da 70 minuti"
rm -f "$R/output/b.json"; giro > /dev/null

: > "$R/errori/e1"
verifica "un dettato in errori: avviso" "$(giro)" "1 dettati sono finiti in errori"
verifica "stesso errore: non si ripete" "$(giro)" ""
: > "$R/errori/e2"
verifica "un errore nuovo: avviso di nuovo" "$(giro)" "2 dettati sono finiti in errori"
rm -f "$R/errori/"*; giro > /dev/null

eta "$T/backup/referralflow-x.sql.gz" $((31 * 60))
verifica "backup vecchio di 31 ore" "$(giro)" "backup notturno del database non è stato fatto"
eta "$T/backup/referralflow-x.sql.gz" 60; giro > /dev/null

printf '%s\n' "2026-09-29 10:00 cron/ocr → 200" "2026-09-29 10:15 cron/ocr → 404  ATTENZIONE: non ha funzionato" \
  "2026-09-29 10:30 cron/ocr → 404  ATTENZIONE: non ha funzionato" > "$T/automazioni.log"
verifica "automazione fallita 2 volte: niente" "$(giro)" ""
echo "2026-09-29 10:45 cron/ocr → 500  ATTENZIONE: non ha funzionato" >> "$T/automazioni.log"
verifica "automazione fallita 3 volte di fila: avviso" "$(giro)" "Automazioni che non funzionano da 3 giri: cron/ocr"
echo "2026-09-29 11:00 cron/ocr → 200" >> "$T/automazioni.log"
verifica "automazione tornata: «Risolto»" "$(giro)" "Risolto: le automazioni"

# Notte: il problema resta in sospeso e arriva col riepilogo delle 7:30.
ADESSO="$(epoch '2026-09-29 23:10')"
eta "$R/log/servizio.log" 5; eta "$T/backup/referralflow-x.sql.gz" 60
APP="$APP_GIU"
giro > /dev/null
verifica "di notte niente notifiche" "$(giro)" ""
ADESSO="$(epoch '2026-09-30 07:32')"
eta "$R/log/servizio.log" 5; eta "$T/backup/referralflow-x.sql.gz" 300
printf '%s\n' "2026-09-29T09:00:00 INFO fase=invio file=a esito=ok" "2026-09-29T10:00:00 INFO fase=invio file=b esito=ok" \
  "2026-09-29T11:00:00 INFO fase=invio file=c esito=rinviato" > "$R/log/servizio.log"
eta "$R/log/servizio.log" 5
uscita="$(giro)"
verifica "mattino: il problema della notte arriva" "$uscita" "La piattaforma non risponde"
verifica "mattino: riepilogo con i problemi" "$uscita" "Buongiorno. Da sistemare:"
verifica "mattino: bozze di ieri contate (2)" "$uscita" "consegnato 2 bozze"
ADESSO=$((ADESSO + 300))
verifica "riepilogo una volta sola al giorno" "$(giro | grep Buongiorno)" ""
APP="$APP_SU"; giro > /dev/null
ADESSO="$(epoch '2026-10-01 07:31')"
eta "$R/log/servizio.log" 5; eta "$T/backup/referralflow-x.sql.gz" 300
verifica "mattino tranquillo: «tutto in ordine»" "$(giro)" "AVVISO\[low\] Buongiorno: tutto in ordine"

echo "Sentinella: $OK ok, $KO falliti"
[ "$KO" = 0 ]
