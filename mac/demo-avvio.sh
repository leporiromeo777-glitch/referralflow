#!/bin/bash
# ReferralFlow — istanza DEMO (16.9.2026): la piattaforma vera con un database
# suo e dati tutti inventati, sulla porta 3100, per farla vedere fuori dallo
# studio con un link. Il database dello studio non è raggiungibile da qui.
#
# Installa il servizio:  bash mac/installa-demo.sh
# Dati della giornata:   cd ~/referralflow-demo && NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/demo-agenda.ts
set -euo pipefail

BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
export PATH="$BREW/bin:$BREW/opt/postgresql@16/bin:/usr/bin:/bin:/usr/sbin:/sbin"

DIR="$HOME/referralflow-demo"
cd "$DIR"

for _ in $(seq 1 60); do pg_isready -q && break; sleep 1; done
pg_isready -q || { echo "$(date '+%F %H:%M') database non pronto"; exit 1; }

# La demo non si aggiorna da sola: si ricompila solo quando qualcuno ha
# spostato il worktree su un commit nuovo (git -C ~/referralflow-demo checkout).
COMMIT="$(git rev-parse HEAD 2> /dev/null || echo nogit)"
if [ ! -d .next ] || [ "$COMMIT" != "$(cat .build-stamp 2> /dev/null)" ]; then
  echo "$(date '+%F %H:%M') compilo la demo…"
  npm run build
  echo "$COMMIT" > .build-stamp
fi

echo "$(date '+%F %H:%M') avvio la DEMO sulla porta 3100"
exec npx next start -p 3100
