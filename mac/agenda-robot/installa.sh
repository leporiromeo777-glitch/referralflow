#!/bin/bash
# Robot dell'agenda MediOnline — installazione sul Mac dello studio.
#
#   bash mac/agenda-robot/installa.sh
#
# Cosa fa: installa il browser del robot, chiede le credenziali MediOnline
# (restano SOLO sul Mac, in ~/.referralflow-agenda.conf, leggibile solo dal
# tuo utente) e spiega il passo successivo (la «radiografia»).
set -euo pipefail

cd "$(dirname "$0")"

echo "Installo il browser del robot (solo la prima volta, qualche minuto)…"
npm install --no-fund --no-audit > /dev/null
npx playwright install chromium > /dev/null

CONF="$HOME/.referralflow-agenda.conf"
if [ ! -f "$CONF" ]; then
  echo
  echo "Credenziali MediOnline (restano solo su questo Mac):"
  read -r -p "  utente: " UTENTE
  read -r -s -p "  password: " PASSWORD
  echo
  cat > "$CONF" << FINE
# Credenziali del robot agenda ReferralFlow. Solo su questo Mac. Non condividere.
MEDIONLINE_URL=https://www.medionline.ch/MediOnlineNet/MOEntree.aspx
MEDIONLINE_UTENTE=$UTENTE
MEDIONLINE_PASSWORD=$PASSWORD
FINE
  chmod 600 "$CONF"
  echo "Salvate in $CONF"
else
  echo "Credenziali già presenti in $CONF (per cambiarle: modifica quel file)."
fi

echo
echo "────────────────────────────────────────────────────────────"
echo "  Prossimo passo — la «radiografia» (una volta sola):"
echo
echo "    node mac/agenda-robot/radiografia.mjs"
echo
echo "  Si apre un browser: se il login automatico non riesce, accedi tu."
echo "  Poi porta l'agenda sulla vista con TUTTI i medici della giornata"
echo "  e torna nel Terminale a premere Invio. Il file che ne esce"
echo "  (~/agenda-radiografia.txt) contiene solo la struttura delle pagine,"
echo "  NESSUN dato di pazienti: va incollato in chat a Claude, che ci"
echo "  costruisce sopra il lettore su misura."
echo "────────────────────────────────────────────────────────────"
