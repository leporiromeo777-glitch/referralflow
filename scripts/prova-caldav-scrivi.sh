#!/bin/bash
# CalDAV di MediOnline: PROVA DI SCRITTURA, un evento solo, poi lo si cancella.
#
#   bash scripts/prova-caldav-scrivi.sh crea       # crea l'evento di prova
#   bash scripts/prova-caldav-scrivi.sh cerca      # trova l'evento di prova e il suo indirizzo vero
#   bash scripts/prova-caldav-scrivi.sh cancella   # cancella SOLO l'evento di prova
#
# Dove: un calendario NON clinico, indicato in CALDAV_CALENDARIO_PROVA.
# Quando: 1.1.2030 05:00-05:15 ora svizzera, data fuori da ogni attività.
# Titolo: «PROVA REFERRALFLOW - CANCELLARE».
#
# Misurato il 23.9.2026: il server risponde 201 al PUT ma NON conserva
# l'indirizzo scelto dal client: salva l'evento sotto un GUID suo. Per questo
# «cerca» e «cancella» trovano l'evento per data e titolo, non per indirizzo.
#
# Sicurezze:
# - PUT con «If-None-Match: *»: non può sovrascrivere nulla.
# - «cancella» agisce solo sugli eventi del 1.1.2030 il cui titolo è
#   ESATTAMENTE quello di prova; ogni altro evento viene solo contato.
# - Degli altri eventi non si stampa nulla (nLPD).
set -u
CONF=~/.referralflow-caldav.conf
# calendario di prova (NON clinico): CALDAV_CALENDARIO_PROVA nel file locale, mai nel repo
CAL=$(sed -n 's/^CALDAV_CALENDARIO_PROVA=//p' "$CONF" | head -1)
[ -n "$CAL" ] || { echo "manca CALDAV_CALENDARIO_PROVA in $CONF"; exit 1; }
PERCORSO=${CAL#https://www.medionline.ch}
TITOLO="PROVA REFERRALFLOW - CANCELLARE"

NETRC=$(mktemp); RISP=$(mktemp); trap 'rm -f "$NETRC" "$RISP"' EXIT; chmod 600 "$NETRC"
{
  printf 'machine www.medionline.ch login '
  sed -n 's/^CALDAV_UTENTE=//p' "$CONF" | head -1 | tr -d '\r\n'
  printf ' password '
  sed -n 's/^CALDAV_PASSWORD=//p' "$CONF" | head -1 | tr -d '\r\n'
  printf '\n'
} > "$NETRC"

# stampa gli href degli eventi di prova del 1.1.2030, uno per riga
trova() {
  curl -s --netrc-file "$NETRC" -m 90 -X REPORT -H 'Depth: 1' -H 'Content-Type: application/xml' \
    --data '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="20300101T000000Z" end="20300102T000000Z"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>' \
    "$CAL" > "$RISP"
  TITOLO="$TITOLO" python3 -c '
import os, re, sys, html
x = open(sys.argv[1], encoding="utf-8", errors="replace").read()
titolo = os.environ["TITOLO"]
resp = re.findall(r"<(?:\w+:)?response>(.*?)</(?:\w+:)?response>", x, re.S)
nostri, altri = [], 0
for r in resp:
    h = re.search(r"<(?:\w+:)?href>([^<]*)<", r)
    dati = html.unescape(r)
    s = re.search(r"^SUMMARY:(.*)$", dati, re.M)
    if h and s and s.group(1).strip() == titolo:
        nostri.append(h.group(1))
    elif "BEGIN:VEVENT" in dati:
        altri += 1
print(f"# eventi il 1.1.2030: {len(nostri)} di prova, {altri} altri (non letti)", file=sys.stderr)
for n in nostri:
    print(n)
' "$RISP"
}

case "${1:-}" in
crea)
  if [ -n "$(trova 2>/dev/null)" ]; then
    echo "C'è già un evento di prova il 1.1.2030. Prima: bash $0 cancella"; exit 1
  fi
  UID_EV="referralflow-prova-$(date +%Y%m%d%H%M%S)@referralflow.ch"
  ORA=$(date -u +%Y%m%dT%H%M%SZ)
  ICS=$(printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ReferralFlow//prova//IT\r\nBEGIN:VEVENT\r\nUID:%s\r\nDTSTAMP:%s\r\nDTSTART:20300101T040000Z\r\nDTEND:20300101T041500Z\r\nSUMMARY:%s\r\nDESCRIPTION:Evento di prova creato da ReferralFlow via CalDAV. Si puo cancellare.\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' "$UID_EV" "$ORA" "$TITOLO")
  CODICE=$(curl -s -o "$RISP" -w '%{http_code}' --netrc-file "$NETRC" -m 60 \
    -X PUT -H 'If-None-Match: *' -H 'Content-Type: text/calendar; charset=utf-8' \
    --data-binary "$ICS" "${CAL}${UID_EV%@*}.ics")
  echo "PUT -> $CODICE"
  ;;
cerca)
  H=$(trova)
  [ -n "$H" ] && echo "$H" | sed 's#.*/calendars/[^/]*/#   indirizzo vero: #' || echo "   nessun evento di prova trovato"
  ;;
cancella)
  H=$(trova)
  [ -z "$H" ] && { echo "Nessun evento di prova da cancellare."; exit 0; }
  echo "$H" | while read -r href; do
    case "$href" in "$PERCORSO"*) ;; *) echo "indirizzo fuori dal calendario di prova, salto"; continue ;; esac
    CODICE=$(curl -s -o /dev/null -w '%{http_code}' --netrc-file "$NETRC" -m 60 -X DELETE "https://www.medionline.ch$href")
    echo "DELETE ${href##*/} -> $CODICE"
  done
  echo "controllo:"; H2=$(trova); [ -z "$H2" ] && echo "   evento di prova tolto davvero." || echo "   ANCORA PRESENTE: cancellalo a mano o riprova."
  ;;
*)
  echo "uso: bash $0 crea | cerca | cancella"; exit 1 ;;
esac
