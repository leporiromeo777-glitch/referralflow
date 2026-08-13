#!/bin/bash
# ReferralFlow — backup notturno del server dello studio (lanciato da launchd
# alle 02:30, vedi installa-server.sh). Salva in ~/ReferralFlow-backup:
#   - il database completo (un file al giorno, conservato 14 giorni)
#   - una copia aggiornata degli allegati (cartella uploads/)
# Tutto resta sul Mac: nessun dato esce dallo studio.
set -euo pipefail

BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
export PATH="$BREW/bin:$BREW/opt/postgresql@16/bin:/usr/bin:/bin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/ReferralFlow-backup"
mkdir -p "$DEST"

GIORNO="$(date +%F)"
FILE="$DEST/referralflow-$GIORNO.sql.gz"

# Prima si scrive un file parziale, poi si rinomina: un backup interrotto a
# metà non deve mai sembrare un backup buono.
pg_dump referralflow | gzip > "$FILE.parziale"
mv "$FILE.parziale" "$FILE"

find "$DEST" -name 'referralflow-*.sql.gz' -mtime +14 -delete

# Allegati: copia incrementale, senza cancellare nulla dal backup.
if [ -d "$REPO/uploads" ]; then
  rsync -a "$REPO/uploads/" "$DEST/allegati/"
fi

echo "$(date '+%F %H:%M') backup riuscito: $(du -h "$FILE" | cut -f1) di database"
