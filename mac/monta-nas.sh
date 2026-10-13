#!/bin/bash
# ReferralFlow — tenere collegata la cartella del NAS dello studio (8.10.2026).
# La lancia launchd ogni due minuti (ch.referralflow.nas) e all'accesso: se la
# cartella non è collegata, la ricollega. La password NON sta qui né in nessun
# file: è nel portachiavi del Mac, dove l'ha salvata lo studio collegandosi la
# prima volta («Ricorda la password nel portachiavi»). Qui c'è solo l'indirizzo.
# Sul NAS questo script non scrive niente.
set -u
# Anche la cartella del server dove va la copia di sicurezza (13.10.2026): stessa cura, niente scritture da qui.
BK="$HOME/.referralflow-backup.conf"
if [ -f "$BK" ]; then
  BK_SU="$(sed -n 's/^FUORI_SU=//p' "$BK" | head -1 | tr -d '"')"; BK_URL="$(sed -n 's/^FUORI_URL=//p' "$BK" | head -1 | tr -d '"')"
  BK_VOL="$(printf '%s' "$BK_SU" | cut -d/ -f1-3)"
  if [ -n "$BK_URL" ] && [ -n "$BK_VOL" ] && ! mount | grep -qF " on $BK_VOL ("; then
    BK_HOST="$(printf '%s' "$BK_URL" | sed -E 's#^smb://([^@/]*@)?([^/]+)/.*#\2#')"
    if nc -z -G 4 "$BK_HOST" 445 >/dev/null 2>&1; then
      /usr/bin/osascript -e "with timeout of 40 seconds" -e "mount volume \"$BK_URL\"" -e "end timeout" >/dev/null 2>&1 || true
      mkdir -p "$HOME/Library/Logs/ReferralFlow"
      echo "$(date '+%F %H:%M') cartella della copia di sicurezza: $(mount | grep -qF " on $BK_VOL (" && echo ricollegata || echo 'non riesco a ricollegarla (password nel portachiavi?)')" >> "$HOME/Library/Logs/ReferralFlow/nas.log"
    fi
  fi
fi
CONF="$HOME/referti-imaging/archivio-file.conf"
LOG="$HOME/Library/Logs/ReferralFlow/nas.log"
mkdir -p "$(dirname "$LOG")"
[ -f "$CONF" ] || exit 0
RADICE="$(sed -n 's/^RADICE=//p' "$CONF" | head -1 | tr -d '"')"
URL="$(sed -n 's/^URL=//p' "$CONF" | head -1 | tr -d '"')"
[ -n "$RADICE" ] && [ -n "$URL" ] || exit 0
STATO="$HOME/referti-imaging/.nas-stato"
prima="$(cat "$STATO" 2>/dev/null || echo '')"

# Collegata? Basta che compaia fra i volumi montati. NON si prova a leggerla da
# qui: a uno script lanciato da launchd macOS nega la lettura dei volumi di rete
# («Operation not permitted») e non mostra nemmeno la voce da accendere nelle
# impostazioni (9.10.2026). Che si legga davvero lo controlla il server, che il
# permesso ce l'ha (`statoNas` in src/lib/imaging.ts: nel registro del server
# «[imaging] nas collegato=…»).
montata() { mount | grep -qF " on $RADICE ("; }
if montata; then
  [ "$prima" = "ok" ] || { echo "$(date '+%F %H:%M') cartella del NAS collegata" >> "$LOG"; echo ok > "$STATO"; }
  exit 0
fi
[ "$prima" = "giu" ] || echo "$(date '+%F %H:%M') cartella del NAS non collegata: provo a ricollegarla" >> "$LOG"
echo giu > "$STATO"
# Il NAS risponde? Se no è inutile insistere (NAS spento, Mac fuori dalla rete).
HOST="$(printf '%s' "$URL" | sed -E 's#^smb://([^@/]*@)?([^/]+)/.*#\2#')"
nc -z -G 4 "$HOST" 445 >/dev/null 2>&1 || exit 0
# «mount volume» usa la password del portachiavi senza chiedere niente; se la
# password non c'è o è cambiata fallisce in silenzio, e lo si scrive.
if /usr/bin/osascript -e "with timeout of 40 seconds" -e "mount volume \"$URL\"" -e "end timeout" >/dev/null 2>&1 && montata; then
  echo "$(date '+%F %H:%M') cartella del NAS ricollegata" >> "$LOG"; echo ok > "$STATO"
else
  [ "$prima" = "giu" ] || echo "$(date '+%F %H:%M') non riesco a ricollegarla (password nel portachiavi assente o cambiata? cartella collegata con un altro nome?)" >> "$LOG"
fi
exit 0
