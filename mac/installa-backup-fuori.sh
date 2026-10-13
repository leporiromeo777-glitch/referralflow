#!/bin/bash
# ReferralFlow — accendere la copia di sicurezza FUORI dal Mac, sul server dello studio (13.10.2026).
#
#   bash ~/referralflow/mac/installa-backup-fuori.sh "/Volumes/comune/ReferralFlow-backup" "smb://192.168.0.107/comune"
#
# 1. crea la CHIAVE con cui i pacchi vengono cifrati (~/.referralflow-backup.key), se non c'è. Non la mostra.
#    >>> UNA COPIA DELLA CHIAVE VA TENUTA FUORI DAL MAC (cassaforte, gestore di password): se il Mac si rompe, senza
#    >>> la chiave i pacchi sul server non si riaprono. Per leggerla:  cat ~/.referralflow-backup.key
# 2. scrive in ~/.referralflow-backup.conf dove portare i pacchi (FUORI_SU) e come ricollegare la cartella (FUORI_URL).
# Da lì: il backup notturno prepara i pacchi cifrati, l'app li porta sul server ogni quarto d'ora, la sentinella
# avvisa se la copia fuori ha più di due giorni. Per riaprire un pacco: mac/apri-pacco.sh.
set -euo pipefail
DOVE="${1:-}"; URL="${2:-}"
case "$DOVE" in /Volumes/*/*) ;; *) echo "uso: $0 \"/Volumes/<cartella del server>/ReferralFlow-backup\" [\"smb://server/cartella\"]"; exit 2;; esac
BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
OPENSSL="$([ -x "$BREW/bin/openssl" ] && echo "$BREW/bin/openssl" || echo /usr/bin/openssl)"
CHIAVE="$HOME/.referralflow-backup.key"; CONF="$HOME/.referralflow-backup.conf"
umask 077
if [ -s "$CHIAVE" ]; then echo "La chiave c'è già: non la tocco."
else "$OPENSSL" rand -base64 48 > "$CHIAVE"; chmod 600 "$CHIAVE"; echo "Chiave creata in $CHIAVE (non mostrata). COPIALA FUORI DAL MAC."; fi
touch "$CONF"; chmod 600 "$CONF"
grep -v '^FUORI_SU=\|^FUORI_URL=' "$CONF" > "$CONF.nuovo" || true
{ cat "$CONF.nuovo"; echo "FUORI_SU=\"$DOVE\""; [ -n "$URL" ] && echo "FUORI_URL=\"$URL\""; } > "$CONF"; rm -f "$CONF.nuovo"
echo "Destinazione: $DOVE"
echo "Fatto. Il primo giro parte col backup di stanotte (02:30), o subito con:  bash ~/referralflow/mac/backup-db.sh"
