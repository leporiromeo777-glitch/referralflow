#!/bin/bash
# CalDAV di MediOnline: la FORMA dei valori, mai i valori.
#
# Serve a capire se UID contiene l'id a dieci cifre di MediOnline (così i
# due canali si uniscono evento per evento) e che cosa portano LOCATION,
# CLASS e TRANSP.
#
# nLPD: ogni lettera diventa «a», ogni cifra «9». SUMMARY e DESCRIPTION
# contengono identità di pazienti: di quelli esce solo la lunghezza.
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

# indirizzo del calendario: argomento o CALDAV_CALENDARIO nel file locale (mai nel repo)
CAL=${1:-$(sed -n 's/^CALDAV_CALENDARIO=//p' "$CONF" | head -1)}
[ -n "$CAL" ] || { echo "manca CALDAV_CALENDARIO in $CONF (o l'indirizzo come argomento)"; exit 1; }
DA=$(date -v-2d +%Y%m%dT000000Z 2>/dev/null || date -u -d '2 days ago' +%Y%m%dT000000Z)
A=$(date -v+2d +%Y%m%dT000000Z 2>/dev/null || date -u -d '2 days' +%Y%m%dT000000Z)
echo "finestra $DA → $A"

curl -s --netrc-file "$NETRC" -m 90 -X REPORT -H 'Depth: 1' -H 'Content-Type: application/xml' \
  --data "<?xml version=\"1.0\"?><c:calendar-query xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:caldav\"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name=\"VCALENDAR\"><c:comp-filter name=\"VEVENT\"><c:time-range start=\"$DA\" end=\"$A\"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>" \
  "$CAL" | python3 -c '
import sys, re, collections
x = sys.stdin.read()
RISERVATI = {"SUMMARY", "DESCRIPTION"}          # identita dei pazienti
def forma(v):
    v = re.sub(r"[A-Za-zÀ-ÿ]", "a", v)
    v = re.sub(r"\d", "9", v)
    return re.sub(r"a{2,}", "aa", re.sub(r"9{2,}", lambda m: f"9x{len(m.group(0))}", v))[:60]
forme = collections.defaultdict(collections.Counter)
lung  = collections.defaultdict(list)
for riga in x.splitlines():
    m = re.match(r"^([A-Z][A-Z0-9\-]+)([;:])(.*)$", riga.strip())
    if not m:
        continue
    nome, _, val = m.groups()
    if nome in ("BEGIN", "END", "VERSION", "PRODID"):
        continue
    if nome in RISERVATI:
        lung[nome].append(len(val))
    else:
        forme[nome][forma(val)] += 1
print("forma dei valori (lettere→a, cifre→9x<quante>):")
for nome in sorted(forme):
    print(f"  {nome}")
    for f, n in forme[nome].most_common(3):
        print(f"      {f:62} ×{n}")
for nome in sorted(lung):
    v = lung[nome]
    print(f"  {nome}: {len(v)} valori, lunghezza min {min(v)} media {sum(v)//len(v)} max {max(v)} (contenuto non letto)")
'
