#!/bin/bash
# ReferralFlow — collegare la pagina Immagini all'archivio dello studio.
#
#   bash mac/installa-archivio-dicom.sh <indirizzo> <porta> <nome AE> ["nome da mostrare"] [chiave]
#   es.  bash mac/installa-archivio-dicom.sh 192.168.0.222 104 ISP "IntelliSpace Portal"
#   Un SECONDO archivio (un altro centro, col suo permesso) si aggiunge con una chiave breve:
#        bash mac/installa-archivio-dicom.sh <indirizzo> <porta> <nome AE> "Centro radiologico" radiologia
#
# L'archivio resta dov'è (il software Philips): la piattaforma ci CERCA gli
# esami e se li fa MANDARE quando qualcuno li apre; la copia qui è temporanea.
# Questo script:
#   1. accende la ricezione delle immagini su questo Mac, se non c'è ancora;
#   2. scrive ~/referti-imaging/archivio.conf (dove sta l'archivio);
#   3. apre la ricezione all'archivio — a lui soltanto, per indirizzo;
#   4. prova che l'archivio risponda e dice che cosa scrivere nell'archivio.
# Non legge e non stampa niente di clinico; il file con la chiave non viene mostrato.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -ge 3 ] || { sed -n 2,6p "$0" | sed 's/^# \{0,1\}//'; exit 2; }
HOST="$1"; PORTA="$2"; AE="$3"; NOME="${4:-Archivio dello studio}"; CHIAVE="${5:-}"
case "$CHIAVE" in ""|principale) FILE="archivio.conf" ;; *[!a-z0-9]*) echo "La chiave può avere solo lettere minuscole e cifre."; exit 2 ;; *) FILE="archivio-$CHIAVE.conf" ;; esac
BASE="$HOME/referti-imaging"
CONF="$BASE/ricezione.conf"
PY="$HOME/.referralflow-imaging/bin/python"
SERVIZIO="gui/$(id -u)/ch.referralflow.imaging-scp"

echo "1/4 · ricezione delle immagini su questo Mac"
if [ ! -f "$CONF" ] || ! launchctl print "$SERVIZIO" > /dev/null 2>&1; then
  bash mac/installa-ricezione-dicom.sh > /dev/null
  echo "  accesa."
else
  "$PY" -c "import pynetdicom" 2> /dev/null || "$HOME/.referralflow-imaging/bin/pip" install -q --disable-pip-version-check pynetdicom
  echo "  c'era già."
fi

echo "2/4 · dove sta l'archivio"
GIORNI="$(grep -E '^GIORNI_COPIA=' "$BASE/$FILE" 2> /dev/null | head -1 | cut -d= -f2 || true)"
cat > "$BASE/$FILE" <<CONFFILE
# L'archivio dello studio: la piattaforma ci cerca gli esami e se li fa
# mandare quando qualcuno li apre. Qui non ci sono chiavi né dati di pazienti.
NOME=$NOME
HOST=$HOST
PORTA=$PORTA
AE=$AE
# Il nome con cui questo Mac si presenta, e la destinazione che l'archivio deve conoscere.
NOSTRO_AE=$(grep -E '^AE_TITLE=' "$CONF" | head -1 | cut -d= -f2)
# Dopo quanti giorni senza aperture la copia di un esame sparisce da qui.
GIORNI_COPIA=${GIORNI:-7}
CONFFILE
chmod 600 "$BASE/$FILE"
echo "  scritto $BASE/$FILE"

echo "3/4 · la ricezione si apre all'archivio (solo al suo indirizzo)"
VOCE="*@$HOST"
if grep -E '^CONSENTITI=' "$CONF" | grep -qF "$VOCE"; then
  echo "  era già aperta."
else
  # Solo spazi e tabulazioni in coda: «\s» si mangerebbe l'a capo e incollerebbe la riga dopo.
  perl -pi -e 'BEGIN { $v = shift } s/^CONSENTITI=[ \t]*$/CONSENTITI=$v/ or s/^CONSENTITI=(.*\S)[ \t]*$/CONSENTITI=$1, $v/' "$VOCE" "$CONF"
  echo "  aggiunto $VOCE."
fi
launchctl kickstart -k "$SERVIZIO"
sleep 2

echo "4/4 · prova"
PORTA_NOSTRA="$(grep -E '^PORTA=' "$CONF" | head -1 | cut -d= -f2)"
NOSTRO="$(grep -E '^NOSTRO_AE=' "$BASE/$FILE" | cut -d= -f2)"
if lsof -iTCP:"$PORTA_NOSTRA" -sTCP:LISTEN > /dev/null 2>&1; then echo "  la ricezione ascolta sulla porta $PORTA_NOSTRA."; else echo "  ATTENZIONE: la ricezione non ascolta sulla porta $PORTA_NOSTRA (vedi ~/Library/Logs/ReferralFlow/imaging-scp.log)."; fi
ESITO="$(printf '{"azione":"eco","host":"%s","porta":%s,"ae_archivio":"%s","ae_nostro":"%s"}' "$HOST" "$PORTA" "$AE" "$NOSTRO" | "$PY" imaging/archivio-dicom.py)"
case "$ESITO" in
  *'"ok": true'*) echo "  l'archivio risponde." ;;
  *) echo "  ATTENZIONE: l'archivio non risponde ($ESITO). È acceso? Il Mac è sulla sua rete?" ;;
esac

IP="$(route -n get "$HOST" 2> /dev/null | awk '/interface:/ {print $2}' | xargs -I{} ipconfig getifaddr {} 2> /dev/null || true)"
echo
echo "Fatto. Nell'archivio va aggiunto questo Mac fra i dispositivi DICOM:"
echo "   Nome (AE Title) : $NOSTRO"
[ -n "$IP" ] || IP="(indirizzo di questo Mac sulla rete degli apparecchi)"
echo "   Indirizzo       : $IP"
echo "   Porta           : $PORTA_NOSTRA"
echo "Finché non c'è, la ricerca funziona ma «Prendi e apri» risponde che l'archivio non conosce il Mac."
