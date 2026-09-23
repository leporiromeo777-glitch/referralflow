#!/bin/bash
# Prova in SOLA LETTURA del CalDAV di MediOnline.
#
# Risponde a una domanda sola: l'evento CalDAV porta anche il colore del
# riquadro, lo stato di fatturazione e l'id di MediOnline, o solo orario e
# titolo? Se li porta, il robot che legge la pagina diventa quasi superfluo.
#
# nLPD: il contenuto degli appuntamenti non viene mai stampato né salvato su
# disco. Escono solo codici HTTP, conteggi, nomi di elementi XML e NOMI DEI
# CAMPI iCalendar.
#
# Credenziali: ~/.referralflow-caldav.conf (scritto a mano), righe
#   CALDAV_UTENTE=...
#   CALDAV_PASSWORD=...
set -u
CONF=~/.referralflow-caldav.conf
NETRC=$(mktemp); trap 'rm -f "$NETRC"' EXIT; chmod 600 "$NETRC"
{
  printf 'machine www.medionline.ch login '
  sed -n 's/^CALDAV_UTENTE=//p' "$CONF" | head -1 | tr -d '\r\n'
  printf ' password '
  sed -n 's/^CALDAV_PASSWORD=//p' "$CONF" | head -1 | tr -d '\r\n'
  printf '\n'
} > "$NETRC"

BASE=https://www.medionline.ch/caldav/calendars
CAL=${1:-$BASE/0c651eba-f874-4d17-9508-cd3c36aa7122/}

leggi() { # descrizione, metodo, depth, corpo
  echo "--- $1"
  curl -s --netrc-file "$NETRC" -m 90 -w '\n@@HTTP %{http_code}\n' \
    -X "$2" -H "Depth: $3" -H 'Content-Type: application/xml' --data "$4" "$CAL" \
  | python3 -c '
import sys, re, collections
x = sys.stdin.read()
codice = re.search(r"@@HTTP (\d+)", x)
x = re.sub(r"@@HTTP \d+", "", x)
print("   http:", codice.group(1) if codice else "?", "| caratteri:", len(x))
el = collections.Counter(re.findall(r"<(?:\w+:)?([A-Za-z\-]+)[ />]", x))
print("   elementi XML:", ", ".join(f"{k}×{v}" for k, v in sorted(el.items())[:18]) or "nessuno")
for s in sorted(set(re.findall(r"<(?:\w+:)?status>([^<]*)<", x))):
    print("   status:", s)
for m in sorted(set(re.findall(r"<(?:\w+:)?(?:error|exception|message)>([^<]{0,120})<", x))):
    print("   messaggio:", m)
print("   eventi (VEVENT):", x.count("BEGIN:VEVENT"))
campi = collections.Counter()
for riga in x.splitlines():
    m = re.match(r"^([A-Z][A-Z0-9\-]+)[;:]", riga.strip())
    if m:
        campi[m.group(1)] += 1
if campi:
    print("   campi iCalendar (nome × quante volte, nessun contenuto):")
    for k, v in sorted(campi.items()):
        print(f"      {k:28} {v}")
'
}

DA=$(date -v-7d +%Y%m%dT000000Z 2>/dev/null || date -u -d '7 days ago' +%Y%m%dT000000Z)
A=$(date -v+2d +%Y%m%dT000000Z 2>/dev/null || date -u -d '2 days' +%Y%m%dT000000Z)
echo "calendario: ${CAL##*/calendars/}"
echo "finestra $DA → $A"

leggi "proprieta del calendario" PROPFIND 0 \
 '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>'

leggi "elenco delle risorse (solo etag, niente contenuto)" PROPFIND 1 \
 '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getcontenttype/></d:prop></d:propfind>'

leggi "query per intervallo" REPORT 1 \
 "<?xml version=\"1.0\"?><c:calendar-query xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:caldav\"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name=\"VCALENDAR\"><c:comp-filter name=\"VEVENT\"><c:time-range start=\"$DA\" end=\"$A\"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>"

leggi "query senza filtro di data" REPORT 1 \
 '<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>'
