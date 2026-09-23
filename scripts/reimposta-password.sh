#!/bin/bash
# Reimposta la password di un account di ReferralFlow, dal Mac del server.
#
#   bash scripts/reimposta-password.sh [e-mail]
#
# - La password si digita qui, nascosta, due volte: non finisce nella
#   cronologia del Terminale e nessun altro la vede.
# - Il ruolo e lo studio dell'account si leggono dal database e si tengono:
#   non si può declassare un account per sbaglio.
set -eu
cd "$(dirname "$0")/.."
DB=$(sed -n 's/^DATABASE_URL=//p' .env | head -1 | tr -d '"'"'")
[ -n "$DB" ] || { echo "Manca DATABASE_URL in .env"; exit 1; }

EMAIL=${1:-}
if [ -z "$EMAIL" ]; then
  echo "Account esistenti:"
  psql "$DB" -Atc "select '  ' || email || '  (' || role || ')' from users where attivo order by role, email"
  printf "E-mail dell'account [tecnico@referralflow.ch]: "
  read -r EMAIL
  EMAIL=${EMAIL:-tecnico@referralflow.ch}
fi
EMAIL=$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')

RIGA=$(psql "$DB" -Atc "select u.role || '|' || coalesce(s.slug, '') from users u left join studios s on s.id = u.studio_id where u.email = '$(printf '%s' "$EMAIL" | sed "s/'/''/g")'")
[ -n "$RIGA" ] || { echo "Nessun account con questa e-mail."; exit 1; }
RUOLO=${RIGA%%|*}; SLUG=${RIGA#*|}
echo "Account: $EMAIL · ruolo $RUOLO"

while :; do
  printf 'Nuova password (almeno 8 caratteri, non si vede mentre scrivi): '; read -rs P1; echo
  printf 'Ripetila: '; read -rs P2; echo
  if [ "$P1" != "$P2" ]; then echo "Non coincidono, riprova."; continue; fi
  if [ ${#P1} -lt 8 ]; then echo "Troppo corta, riprova."; continue; fi
  break
done

node --env-file=.env scripts/create-user.mjs "$EMAIL" "$P1" "$RUOLO" ${SLUG:+"$SLUG"} >/dev/null
unset P1 P2
echo "Fatto. Entra da https://cct.referralflow.ch con $EMAIL e la password nuova."
