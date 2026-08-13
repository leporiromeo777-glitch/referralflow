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

# ── 2b. Aggiorna il codice all'ultima versione (best-effort) ─────────────────
# Così basta rilanciare questo comando per avere sempre l'ultima versione.
if [ -d .git ]; then
  echo "Cerco aggiornamenti…"
  git pull --ff-only 2> /dev/null || echo "  (offline o nessun aggiornamento: uso la versione già scaricata)"
fi

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

# ── 5. Dipendenze (installa/aggiorna se il lockfile è cambiato) ──────────────
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Installo le librerie dell'app…"; npm install
fi

# ── 6. Schema del database ───────────────────────────────────────────────────
if ! psql referralflow -tAc "select to_regclass('public.studios')" | grep -q studios; then
  echo "Preparo le tabelle del database…"
  psql referralflow -v ON_ERROR_STOP=1 -f db/schema.sql
else
  # Database già esistente da un avvio precedente: applica le migrazioni
  # recenti (dalla 019 in poi sono tutte «if not exists», rieseguibili).
  echo "Aggiorno le tabelle del database…"
  for m in db/migrations/019_*.sql db/migrations/02*.sql; do
    [ -f "$m" ] && psql referralflow -q -f "$m" > /dev/null 2>&1 || true
  done
fi

# ── 7. Studio + utente demo + contenuti demo (idempotenti) ───────────────────
echo "Preparo studio e accesso demo…"
npm run create-studio -- "Centro Cardiologico Ticino (demo)" studio-demo segreteria@demo.ch "Cardiologia: ecocardiogramma, holter, ergometria" > /dev/null
npm run create-user   -- admin@demo.ch demo1234 admin studio-demo > /dev/null
psql referralflow -f db/seed-demo.sql

# Token referti dell'anteprima (per collegare la pipeline di trascrizione del
# Mac a QUESTA anteprima): generato una volta, salvato solo qui, hash nel DB.
TOKEN_FILE=".referti-token-anteprima"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "rfb_anteprima_$(openssl rand -hex 16)" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi
RFB_TOKEN="$(cat "$TOKEN_FILE")"
RFB_HASH="$(printf %s "$RFB_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
psql referralflow -q -c "update studios set referti_token_hash='$RFB_HASH', referti_token_set_at=now() where slug='studio-demo';"

# ── 8. Compila (solo se il codice è cambiato) e avvia ────────────────────────
# La compilazione va rifatta a ogni aggiornamento del codice, altrimenti
# resterebbe visibile la versione vecchia: confrontiamo la versione compilata
# con quella attuale del repo.
COMMIT="$(git rev-parse HEAD 2> /dev/null || echo nogit)"
if [ ! -d .next ] || [ "$COMMIT" != "$(cat .build-stamp 2> /dev/null)" ]; then
  echo "Compilo l'app aggiornata (un paio di minuti)…"
  rm -rf .next
  npm run build
  echo "$COMMIT" > .build-stamp
else
  echo "Nessuna modifica al codice: uso la compilazione esistente."
fi

echo
echo "────────────────────────────────────────────────────────────"
echo "  ReferralFlow è pronto:  http://localhost:3000"
echo "  Accedi con:  admin@demo.ch  /  demo1234"
echo
echo "  Trascrizione referti (facoltativo): per far lavorare la"
echo "  pipeline del Mac sui dettati caricati in questa anteprima,"
echo "  scrivi in ~/referti-pipeline/invio.conf queste due righe:"
echo "    REFERTI_FLOW_URL=http://localhost:3000"
echo "    REFERTI_FLOW_TOKEN=$RFB_TOKEN"
echo "  poi: bash ~/referti-pipeline/installa-avvio.sh"
echo
echo "  Per fermarlo: premi Ctrl-C qui."
echo "────────────────────────────────────────────────────────────"
echo
( sleep 2; open http://localhost:3000 > /dev/null 2>&1 || true ) &
npm start
