#!/bin/bash
# ReferralFlow — anteprima locale sul Mac mini dello studio.
#
# Fa girare tutta l'app sul Mac (database compreso) e la apre nel browser,
# con dati demo per cliccarci dentro. Nessun dato esce dal Mac.
#
# Uso, dentro la cartella del progetto:
#   bash mac/avvia-anteprima.sh
#
# La prima volta installa il necessario (Node e PostgreSQL via Homebrew),
# prepara il database e compila l'app: può metterci qualche minuto. Le volte
# dopo parte in pochi secondi.
#
# Per fermarla: Ctrl-C in questa finestra. Il database resta pronto per la
# prossima volta.
set -euo pipefail

# ── 0. Homebrew ──────────────────────────────────────────────────────────────
if ! command -v brew > /dev/null; then
  echo "Manca Homebrew. Installalo da https://brew.sh e rilancia questo comando."
  exit 1
fi
BREW="$(brew --prefix)"

# ── 1. Node e PostgreSQL ─────────────────────────────────────────────────────
if ! command -v node > /dev/null; then
  echo "Installo Node…"; brew install node
fi
if ! brew list postgresql@16 > /dev/null 2>&1; then
  echo "Installo PostgreSQL…"; brew install postgresql@16
fi
export PATH="$BREW/opt/postgresql@16/bin:$PATH"

echo "Avvio il database…"
brew services start postgresql@16 > /dev/null 2>&1 || true
for _ in $(seq 1 30); do pg_isready -q && break; sleep 1; done
if ! pg_isready -q; then
  echo "Il database non è partito. Riprova, oppure: brew services restart postgresql@16"
  exit 1
fi

# ── 2. Vai alla radice del progetto ──────────────────────────────────────────
cd "$(dirname "$0")/.."
REPO="$(pwd)"

# ── 3. Database dell'app ─────────────────────────────────────────────────────
createdb referralflow 2> /dev/null || true

# ── 4. Configurazione (.env) — creata una volta sola ─────────────────────────
if [ ! -f .env ]; then
  echo "Creo la configurazione locale (.env)…"
  SECRET="$(openssl rand -hex 32)"
  cat > .env << EOF
# Configurazione locale per l'anteprima sul Mac. Resta solo su questo computer.
DATABASE_URL=postgres://$(whoami)@localhost:5432/referralflow
SESSION_SECRET=$SECRET
APP_BASE_URL=http://localhost:3000
NODE_ENV=production
# Allegati: senza object storage vanno nella cartella ./uploads (va bene in locale).
# Email/SMS: spenti finché non configuri SMTP_HOST / SMS_API_TOKEN.
# Cattura AI dell'impegnativa: spenta finché non aggiungi ANTHROPIC_API_KEY.
EOF
fi

# ── 5. Dipendenze ────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "Installo le librerie dell'app (una volta sola)…"; npm install
fi

# ── 6. Schema del database (solo se vuoto) ───────────────────────────────────
if ! psql referralflow -tAc "select to_regclass('public.studios')" | grep -q studios; then
  echo "Preparo le tabelle del database…"
  psql referralflow -v ON_ERROR_STOP=1 -f db/schema.sql
fi

# ── 7. Studio + utente demo + contenuti demo (idempotenti) ───────────────────
echo "Preparo studio e accesso demo…"
npm run create-studio -- "Centro Cardiologico Ticino (demo)" studio-demo segreteria@demo.ch "Cardiologia: ecocardiogramma, holter, ergometria" > /dev/null
npm run create-user   -- admin@demo.ch demo1234 admin studio-demo > /dev/null
psql referralflow -f db/seed-demo.sql

# ── 8. Compila e avvia ───────────────────────────────────────────────────────
if [ ! -d .next ]; then
  echo "Compilo l'app (una volta sola, un paio di minuti)…"; npm run build
fi

echo
echo "────────────────────────────────────────────────────────────"
echo "  ReferralFlow è pronto:  http://localhost:3000"
echo "  Accedi con:  admin@demo.ch  /  demo1234"
echo "  Per fermarlo: premi Ctrl-C qui."
echo "────────────────────────────────────────────────────────────"
echo
( sleep 2; open http://localhost:3000 > /dev/null 2>&1 || true ) &
npm start
