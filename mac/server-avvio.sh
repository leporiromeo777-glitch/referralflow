#!/bin/bash
# ReferralFlow — avvio del server dello studio. Usato dal servizio automatico
# (launchd): non serve lanciarlo a mano. Per installare il servizio:
#   bash mac/installa-server.sh
# Per aggiornare l'app quando il codice cambia:
#   bash mac/aggiorna-server.sh
#
# A ogni avvio: aspetta il database, scarica gli aggiornamenti (se c'è rete),
# applica le migrazioni, ricompila solo se il codice è cambiato, e avvia l'app.
set -euo pipefail

BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
export PATH="$BREW/bin:$BREW/opt/postgresql@16/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$(dirname "$0")/.."

# ── Database ────────────────────────────────────────────────────────────────
brew services start postgresql@16 > /dev/null 2>&1 || true
for _ in $(seq 1 60); do pg_isready -q && break; sleep 1; done
if ! pg_isready -q; then
  echo "$(date '+%F %H:%M') database non raggiungibile: riprovo tra poco"
  exit 1   # launchd (KeepAlive) rilancia da solo
fi

# La prima preparazione (database, studio, configurazione) la fa l'anteprima.
if ! psql referralflow -tAc "select to_regclass('public.studios')" 2>/dev/null | grep -q studios; then
  echo "Database non preparato: esegui prima  bash mac/avvia-anteprima.sh"
  exit 78  # EX_CONFIG: inutile riprovare finché non si prepara
fi

# ── Aggiornamenti (best-effort: offline si usa la versione già scaricata) ────
git pull --ff-only 2> /dev/null || true

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Installo le librerie aggiornate…"
  npm install
fi

# Migrazioni recenti (dalla 019 in poi sono «if not exists», rieseguibili).
for m in db/migrations/019_*.sql db/migrations/02*.sql; do
  [ -f "$m" ] && psql referralflow -q -f "$m" > /dev/null 2>&1 || true
done

# ── Compila solo se il codice è cambiato ────────────────────────────────────
COMMIT="$(git rev-parse HEAD 2> /dev/null || echo nogit)"
if [ ! -d .next ] || [ "$COMMIT" != "$(cat .build-stamp 2> /dev/null)" ]; then
  echo "$(date '+%F %H:%M') compilo la versione aggiornata…"
  rm -rf .next
  npm run build
  echo "$COMMIT" > .build-stamp
fi

echo "$(date '+%F %H:%M') avvio ReferralFlow sulla porta 3000"
exec npm start
