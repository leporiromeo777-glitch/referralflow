#!/bin/bash
# ReferralFlow — backup notturno del server dello studio (lanciato da launchd
# alle 02:30, vedi installa-server.sh). Salva in ~/ReferralFlow-backup:
#   - il database completo (un file al giorno, conservato 14 giorni)
#   - una copia aggiornata degli allegati (cartella uploads/)
# Dal 13.10.2026 prepara anche la COPIA FUORI DAL MAC, sul server dello studio (richiesta dello studio dopo il
# controllo di sicurezza: tutto stava su un disco solo): pacchi CIFRATI in ~/ReferralFlow-backup/fuori/, che l'app
# porta sul server (cron/backup) — uno script lanciato da launchd non può scrivere sui volumi di rete, l'app sì.
# Niente esce dalla rete dello studio, e sul server arriva solo materiale cifrato.
set -euo pipefail

BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
export PATH="$BREW/bin:$BREW/opt/postgresql@16/bin:/usr/bin:/bin"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# Le copie contengono tutto il database e gli allegati: le può leggere solo l'utente del servizio (13.10.2026:
# la cartella era leggibile dagli altri utenti del Mac).
umask 077
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
  if [ -z "$IMMAGINI_SU" ] && [ -n "${FUORI_SU:-}" ]; then
    NOTA_IMMAGINI=" · immagini ($PESO) nella copia fuori, coi documenti"
  elif [ -z "$IMMAGINI_SU" ]; then
    NOTA_IMMAGINI=" · immagini ($PESO) SENZA copia: nessun secondo disco configurato"
  elif [ ! -d "$(dirname "$IMMAGINI_SU")" ]; then
    NOTA_IMMAGINI=" · immagini ($PESO) NON copiate: il secondo disco non è collegato"
  else
    mkdir -p "$IMMAGINI_SU"
    if rsync -a "$REPO/uploads/imaging/" "$IMMAGINI_SU/"; then NOTA_IMMAGINI=" · immagini ($PESO) copiate sul secondo disco"
    else NOTA_IMMAGINI=" · immagini ($PESO) copia NON riuscita"; fi
  fi
fi

# ── La copia fuori dal Mac ───────────────────────────────────────────────────
# Una riga in ~/.referralflow-backup.conf la accende:
#   FUORI_SU="/Volumes/comune/ReferralFlow-backup"
# e serve la chiave in ~/.referralflow-backup.key (la crea mac/installa-backup-fuori.sh; UNA COPIA DELLA CHIAVE VA
# TENUTA FUORI DAL MAC: senza, i pacchi non si riaprono). Tre pacchi, cifrati con AES-256:
#   referralflow-<giorno>.sql.gz.enc   il database di stanotte
#   allegati-<giorno>-<ora>.tar.enc    SOLO i file nuovi dall'ultima volta (documenti e immagini non cambiano mai:
#                                      la prima volta ci sono tutti, poi pochi per notte)
#   configurazione-<giorno>.tar.enc    ciò che serve a rimettere in piedi il Mac (.env, configurazioni, dizionari)
NOTA_FUORI=""
FUORI_SU="${FUORI_SU:-}"
CHIAVE="$HOME/.referralflow-backup.key"
OPENSSL="$([ -x "$BREW/bin/openssl" ] && echo "$BREW/bin/openssl" || echo /usr/bin/openssl)"
if [ -n "$FUORI_SU" ]; then
  if [ ! -s "$CHIAVE" ]; then
    NOTA_FUORI=" · copia fuori NON preparata: manca la chiave ($CHIAVE)"
  else
    PRONTI="$DEST/fuori"; mkdir -p "$PRONTI"
    cifra() { "$OPENSSL" enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$CHIAVE"; }
    cifra < "$FILE" > "$PRONTI/referralflow-$GIORNO.sql.gz.enc.parziale" && mv "$PRONTI/referralflow-$GIORNO.sql.gz.enc.parziale" "$PRONTI/referralflow-$GIORNO.sql.gz.enc"
    QUANTI=0
    if [ -d "$REPO/uploads" ]; then
      SEGNO="$DEST/.fuori-allegati"; NUOVO="$DEST/.fuori-allegati.nuovo"; LISTA="$DEST/.fuori-lista"
      touch "$NUOVO"      # il segno di QUESTO giro, preso prima di guardare: un file arrivato durante il giro va nel prossimo
      ( cd "$REPO/uploads" && if [ -f "$SEGNO" ]; then find . -type f -newer "$SEGNO" ! -path './imaging-cache/*' -print0; else find . -type f ! -path './imaging-cache/*' -print0; fi ) > "$LISTA"
      QUANTI="$(tr -cd '\0' < "$LISTA" | wc -c | tr -d ' ')"
      if [ "$QUANTI" -gt 0 ]; then
        PACCO="$PRONTI/allegati-$GIORNO-$(date +%H%M).tar.enc"
        ( cd "$REPO/uploads" && tar --null -T "$LISTA" -cf - ) | cifra > "$PACCO.parziale" && mv "$PACCO.parziale" "$PACCO"
      fi
      mv "$NUOVO" "$SEGNO"; rm -f "$LISTA"
    fi
    # La configurazione: piccola, ma senza di lei un Mac nuovo non riparte. Mai la chiave stessa.
    ( cd "$HOME" && { ls -d referralflow/.env .referralflow-*.conf .referralflow-*.json referti-pipeline/*.conf referti-pipeline/*.json referti-pipeline/*.txt referti-imaging/*.conf silverbullet/caddy Library/LaunchAgents/ch.referralflow.*.plist 2> /dev/null || true; } | tar -cf - -T - 2> /dev/null ) | cifra > "$PRONTI/configurazione-$GIORNO.tar.enc.parziale" && mv "$PRONTI/configurazione-$GIORNO.tar.enc.parziale" "$PRONTI/configurazione-$GIORNO.tar.enc"
    NOTA_FUORI=" · copia fuori preparata (database, $QUANTI file nuovi, configurazione): la porta l'app sul server"
  fi
else
  NOTA_FUORI=" · NESSUNA copia fuori dal Mac configurata"
fi

echo "$(date '+%F %H:%M') backup riuscito: $(du -h "$FILE" | cut -f1) di database$NOTA_IMMAGINI$NOTA_FUORI"
