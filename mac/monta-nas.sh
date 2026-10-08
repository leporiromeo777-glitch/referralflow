#!/bin/bash
# ReferralFlow — tenere collegata la cartella del NAS dello studio (8.10.2026).
# La lancia launchd ogni due minuti (ch.referralflow.nas) e all'accesso: se la
# cartella non è collegata, la ricollega. La password NON sta qui né in nessun
# file: è nel portachiavi del Mac, dove l'ha salvata lo studio collegandosi la
# prima volta («Ricorda la password nel portachiavi»). Qui c'è solo l'indirizzo.
# Sul NAS questo script non scrive niente.
set -u
CONF="$HOME/referti-imaging/archivio-file.conf"
LOG="$HOME/Library/Logs/ReferralFlow/nas.log"
mkdir -p "$(dirname "$LOG")"
[ -f "$CONF" ] || exit 0
RADICE="$(sed -n 's/^RADICE=//p' "$CONF" | head -1 | tr -d '"')"
URL="$(sed -n 's/^URL=//p' "$CONF" | head -1 | tr -d '"')"
[ -n "$RADICE" ] && [ -n "$URL" ] || exit 0
STATO="$HOME/referti-imaging/.nas-stato"
prima="$(cat "$STATO" 2>/dev/null || echo '')"

# Collegata davvero? Deve comparire fra i volumi montati E lasciarsi leggere.
if mount | grep -qF " on $RADICE (" && ls "$RADICE" >/dev/null 2>&1; then
  [ "$prima" = "ok" ] || { echo "$(date '+%F %H:%M') cartella del NAS collegata" >> "$LOG"; echo ok > "$STATO"; }
  exit 0
fi
# Montata ma non leggibile da qui: non è il NAS, è macOS che non ha ancora dato a
# questo servizio il permesso di leggere i volumi di rete. Ricollegare non serve.
if mount | grep -qF " on $RADICE ("; then
  [ "$prima" = "permesso" ] || echo "$(date '+%F %H:%M') la cartella è collegata ma questo servizio non può leggerla: $(ls "$RADICE" 2>&1 | head -1 | cut -c1-120). Serve il permesso di macOS per i volumi di rete (Impostazioni di Sistema → Privacy e sicurezza → File e cartelle)." >> "$LOG"
  echo permesso > "$STATO"; exit 0
fi
[ "$prima" = "giu" ] || echo "$(date '+%F %H:%M') cartella del NAS non collegata: provo a ricollegarla" >> "$LOG"
echo giu > "$STATO"
# Il NAS risponde? Se no è inutile insistere (NAS spento, Mac fuori dalla rete).
HOST="$(printf '%s' "$URL" | sed -E 's#^smb://([^@/]*@)?([^/]+)/.*#\2#')"
nc -z -G 4 "$HOST" 445 >/dev/null 2>&1 || exit 0
# «mount volume» usa la password del portachiavi senza chiedere niente; se la
# password non c'è o è cambiata fallisce in silenzio, e lo si scrive.
if /usr/bin/osascript -e "with timeout of 40 seconds" -e "mount volume \"$URL\"" -e "end timeout" >/dev/null 2>&1 && ls "$RADICE" >/dev/null 2>&1; then
  echo "$(date '+%F %H:%M') cartella del NAS ricollegata" >> "$LOG"; echo ok > "$STATO"
else
  [ "$prima" = "giu" ] || echo "$(date '+%F %H:%M') non riesco a ricollegarla (password nel portachiavi assente o cambiata? cartella collegata con un altro nome?)" >> "$LOG"
fi
exit 0
