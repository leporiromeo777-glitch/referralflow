#!/bin/bash
# CalDAV di MediOnline: QUALI DIRITTI abbiamo su ogni calendario.
#
# Solo domande in lettura (PROPFIND + OPTIONS): non crea, non modifica e non
# cancella nulla. Serve a sapere se la scrittura è concessa prima ancora di
# discutere se usarla.
#
# nLPD: non legge nessun appuntamento. Escono solo nomi dei calendari,
# permessi e metodi ammessi.
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

BASE=https://www.medionline.ch/caldav/calendars/

echo "=== metodi ammessi sulla raccolta (OPTIONS) ==="
curl -s -D - -o /dev/null --netrc-file "$NETRC" -m 60 -X OPTIONS "$BASE" \
  | grep -i -E '^(allow|dav):' | sed 's/^/   /'

echo
echo "=== permessi per calendario ==="
curl -s --netrc-file "$NETRC" -m 90 -X PROPFIND -H 'Depth: 1' -H 'Content-Type: application/xml' \
  --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:current-user-privilege-set/><d:resourcetype/></d:prop></d:propfind>' \
  "$BASE" | python3 -c '
import sys, re
x = sys.stdin.read()
resp = re.findall(r"<(?:\w+:)?response>(.*?)</(?:\w+:)?response>", x, re.S)
print("   collezioni:", len(resp))
for r in resp:
    nome = re.search(r"<(?:\w+:)?displayname>([^<]*)<", r)
    nome = nome.group(1) if nome else "-"
    if not re.search(r"<(?:\w+:)?calendar[ />]", r):
        continue
    priv = sorted(set(re.findall(r"<(?:\w+:)?privilege>\s*<(?:\w+:)?([a-z\-]+)", r)))
    scrive = [p for p in priv if p in ("write", "write-content", "bind", "unbind", "all")]
    stato = "SCRIVIBILE" if scrive else "sola lettura"
    elenco = ", ".join(priv) if priv else "nessun permesso dichiarato"
    print("   %-40s %-14s %s" % (nome[:38], stato, elenco))
'
