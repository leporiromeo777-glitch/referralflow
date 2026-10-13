#!/bin/bash
# ReferralFlow — riaprire un pacco della copia di sicurezza (13.10.2026).
#
#   bash mac/apri-pacco.sh <pacco.enc> <file di uscita>
#
# Serve la chiave in ~/.referralflow-backup.key (o in $BACKUP_CHIAVE: su un Mac nuovo ci si rimette la copia tenuta
# fuori). Che cosa esce:
#   referralflow-<giorno>.sql.gz.enc  →  un .sql.gz:   gunzip -c uscita.sql.gz | psql referralflow
#   allegati-….tar.enc                →  un .tar:      tar -xf uscita.tar -C ~/referralflow/uploads   (tutti, dal più vecchio)
#   configurazione-<giorno>.tar.enc   →  un .tar:      tar -xf uscita.tar -C ~
set -euo pipefail
[ $# -eq 2 ] || { echo "uso: $0 <pacco.enc> <file di uscita>"; exit 2; }
BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
OPENSSL="$([ -x "$BREW/bin/openssl" ] && echo "$BREW/bin/openssl" || echo /usr/bin/openssl)"
CHIAVE="${BACKUP_CHIAVE:-$HOME/.referralflow-backup.key}"
[ -s "$CHIAVE" ] || { echo "Manca la chiave ($CHIAVE)."; exit 1; }
umask 077
"$OPENSSL" enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$CHIAVE" -in "$1" -out "$2"
echo "Aperto: $2"
