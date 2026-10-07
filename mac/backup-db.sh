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
# Le immagini diagnostiche NO (7.10.2026): un ecocardiogramma pesa centinaia di
# megabyte e una seconda copia sullo STESSO disco lo riempie in metà del tempo
# senza proteggere da un guasto del disco. `imaging-cache` sono disegni che si
# rifanno; gli originali (`imaging/`) vanno su un SECONDO disco, se c'è.
if [ -d "$REPO/uploads" ]; then
  rsync -a --exclude '/imaging/' --exclude '/imaging-cache/' "$REPO/uploads/" "$DEST/allegati/"
fi

# Il secondo disco per le immagini: una riga in ~/.referralflow-backup.conf
#   IMMAGINI_SU="/Volumes/NomeDelDisco/ReferralFlow-immagini"
# Senza, le immagini NON hanno copia su questo Mac (l'ecografo le manda anche
# all'archivio Philips): lo si scrive nel registro ogni notte, coi numeri.
IMMAGINI_SU=""
[ -f "$HOME/.referralflow-backup.conf" ] && . "$HOME/.referralflow-backup.conf"
NOTA_IMMAGINI=""
if [ -d "$REPO/uploads/imaging" ]; then
  PESO="$(du -sh "$REPO/uploads/imaging" 2>/dev/null | cut -f1 | tr -d ' ')"
  if [ -z "$IMMAGINI_SU" ]; then
    NOTA_IMMAGINI=" · immagini ($PESO) SENZA copia: nessun secondo disco configurato"
  elif [ ! -d "$(dirname "$IMMAGINI_SU")" ]; then
    NOTA_IMMAGINI=" · immagini ($PESO) NON copiate: il secondo disco non è collegato"
  else
    mkdir -p "$IMMAGINI_SU"
    if rsync -a "$REPO/uploads/imaging/" "$IMMAGINI_SU/"; then NOTA_IMMAGINI=" · immagini ($PESO) copiate sul secondo disco"
    else NOTA_IMMAGINI=" · immagini ($PESO) copia NON riuscita"; fi
  fi
fi

echo "$(date '+%F %H:%M') backup riuscito: $(du -h "$FILE" | cut -f1) di database$NOTA_IMMAGINI"
