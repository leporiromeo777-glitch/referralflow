#!/bin/bash
# Sentinella generale (29.9.2026): ogni 5 minuti guarda se piattaforma,
# database, modelli, catena dei referti, consegna delle bozze, backup, disco e
# automazioni stanno funzionando, e se no manda una notifica sul telefono
# (ntfy). Prima ci si accorgeva di un blocco solo quando un referto non
# arrivava.
#
# Regole:
#   - testi SEMPRE neutri: che cosa è fermo e da quanto, mai nomi, file,
#     pazienti o contenuti (nLPD). Si leggono solo stato dei servizi,
#     conteggi e date dei file, mai il loro contenuto;
#   - un problema si segnala dopo `soglia` giri di fila (un riavvio o una
#     ricompilazione di un minuto non sveglia nessuno), si ripete ogni 6 ore
#     se resta, e quando passa arriva «Risolto»;
#   - di notte (22–7) non si manda niente: al mattino alle 7:30 arriva il
#     riepilogo, che c'è ogni giorno anche quando va tutto bene — se non
#     arriva, il Mac è spento o senza rete (l'unica cosa che il Mac non può
#     segnalare da sé).
#
# Configurazione in ~/.referralflow-avvisi.conf (NTFY_URL=https://ntfy.sh/<canale>;
# la crea installa-avvisi.sh). Senza configurazione registra soltanto.
# Per le prove: SENTINELLA_PROVA=1 scrive i messaggi su stdout invece di
# mandarli; percorsi e indirizzi sovrascrivibili con le variabili qui sotto.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CONF="${SENTINELLA_CONF:-$HOME/.referralflow-avvisi.conf}"
NTFY_URL=""
[ -f "$CONF" ] && NTFY_URL="$(grep '^NTFY_URL=' "$CONF" | cut -d= -f2- | tr -d '"' || true)"

REFERTI="${SENTINELLA_REFERTI:-$HOME/referti}"
STATO="${SENTINELLA_STATO:-$HOME/Library/Application Support/ReferralFlow/sentinella}"
LOG="${SENTINELLA_LOG:-$HOME/Library/Logs/ReferralFlow/sentinella.log}"
APP_URL="${SENTINELLA_APP_URL:-http://127.0.0.1:3000/login}"
DOMINIO="${SENTINELLA_DOMINIO:-cct.referralflow.ch}"
OLLAMA_URL="${SENTINELLA_OLLAMA_URL:-http://127.0.0.1:11434/api/version}"
BACKUP_DIR="${SENTINELLA_BACKUP:-$HOME/ReferralFlow-backup}"
AUTOMAZIONI_LOG="${SENTINELLA_AUTOMAZIONI_LOG:-$HOME/Library/Logs/ReferralFlow/automazioni.log}"
SERVIZIO_CATENA="${SENTINELLA_SERVIZIO_CATENA:-ch.referralflow.referti-servizio}"
PG_ISREADY="${SENTINELLA_PG_ISREADY:-/opt/homebrew/opt/postgresql@16/bin/pg_isready}"
ADESSO="${SENTINELLA_ADESSO:-$(date +%s)}"
ORA="$(date -r "$ADESSO" +%H)"
MINUTO="$(date -r "$ADESSO" +%M)"
OGGI="$(date -r "$ADESSO" +%F)"

# Soglie (minuti), tarate sul registro della catena del 29.9.2026: un dettato
# dura in mediana 10 min (p90 31, massimo 116); il registro è rimasto zitto
# al massimo 69 min durante un dettato.
CATENA_ZITTA_MIN=75
LAVORAZIONE_MAX_MIN=180
CONSEGNA_MAX_MIN=60
BACKUP_MAX_ORE=30
DISCO_MIN_GB=25
RIPETI_S=$((6 * 3600))

mkdir -p "$STATO" "$(dirname "$LOG")"
registra() { echo "$(date -r "$ADESSO" '+%F %H:%M') $*" >> "$LOG"; }

notte() { [ "$ORA" -ge 22 ] || [ "$ORA" -lt 7 ]; }

# invia <testo> <priorità ntfy: min|low|default|high> <etichetta>
invia() {
  if [ -n "${SENTINELLA_PROVA:-}" ]; then echo "AVVISO[$2] $1"; return 0; fi
  if [ -z "$NTFY_URL" ]; then registra "(nessun canale) $1"; return 0; fi
  curl -s -m 15 -o /dev/null -w '%{http_code}' \
    -H "Title: ReferralFlow" -H "Priority: $2" -H "Tags: $3" \
    -d "$1" "$NTFY_URL" 2> /dev/null | grep -q '^2' && { registra "inviato: $1"; return 0; }
  registra "invio non riuscito: $1"
  return 1
}

# problema <chiave> <soglia di giri> <testo>
problema() {
  local k="$1" soglia="$2" testo="$3" n ultimo
  n=$(( $(cat "$STATO/$k.n" 2> /dev/null || echo 0) + 1 ))
  echo "$n" > "$STATO/$k.n"
  echo "$testo" > "$STATO/$k.testo"
  [ "$n" -lt "$soglia" ] && return 0
  touch "$STATO/$k.attivo"
  ultimo="$(cat "$STATO/$k.avvisato" 2> /dev/null || echo 0)"
  [ "$ultimo" != 0 ] && [ $((ADESSO - ultimo)) -lt "$RIPETI_S" ] && return 0
  notte && return 0
  invia "$testo" high warning && echo "$ADESSO" > "$STATO/$k.avvisato"
}

# a_posto <chiave> <testo di «Risolto»>
a_posto() {
  local k="$1"
  if [ -f "$STATO/$k.avvisato" ] && ! notte; then
    invia "Risolto: $2" default white_check_mark
  fi
  rm -f "$STATO/$k".n "$STATO/$k".testo "$STATO/$k".attivo "$STATO/$k".avvisato
}

minuti_da() { echo $(( (ADESSO - $1) / 60 )); }
mtime() { stat -f %m "$1" 2> /dev/null || echo 0; }

# File di lavoro della catena: tutto tranne i nascosti (come catenaOccupata).
file_in() { find "$REFERTI/$1" -maxdepth 1 -type f ! -name '.*' 2> /dev/null; }
conta_in() { file_in "$1" | grep -c . | tr -d ' '; }
piu_vecchio_in() {
  local m=0 t f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    t="$(mtime "$f")"
    { [ "$m" = 0 ] || [ "$t" -lt "$m" ]; } && m="$t"
  done <<< "$(file_in "$1")"
  echo "$m"
}

# ── Piattaforma ──────────────────────────────────────────────────────────────
codice="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$APP_URL" 2> /dev/null || true)"
case "$codice" in
  2* | 3*) a_posto app "la piattaforma risponde di nuovo." ;;
  *) problema app 2 "La piattaforma non risponde sul Mac (codice ${codice:-nessuno}). Le bozze restano in coda nella catena." ;;
esac

# Il dominio in HTTPS, sul Mac stesso: se Caddy o il certificato cadono la
# sentinella di Caddy lo riavvia dopo 2 giri; si avvisa solo se neanche così.
if [ -n "$DOMINIO" ]; then
  codice="$(curl -s -m 12 -o /dev/null -w '%{http_code}' --resolve "$DOMINIO:443:127.0.0.1" "https://$DOMINIO/login" 2> /dev/null || true)"
  case "$codice" in
    2* | 3*) a_posto dominio "il sito risponde di nuovo in HTTPS." ;;
    *) problema dominio 4 "Il sito $DOMINIO non risponde in HTTPS (codice ${codice:-nessuno}): da fuori lo studio non si apre." ;;
  esac
fi

# ── Database e modelli ───────────────────────────────────────────────────────
if [ -x "$PG_ISREADY" ]; then
  if "$PG_ISREADY" -q -t 5 2> /dev/null; then a_posto db "il database risponde di nuovo."
  else problema db 2 "Il database non risponde: piattaforma e catena sono ferme."; fi
fi

codice="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$OLLAMA_URL" 2> /dev/null || true)"
case "$codice" in
  2*) a_posto ollama "i modelli locali (Ollama) rispondono di nuovo." ;;
  *) problema ollama 2 "I modelli locali (Ollama) non rispondono: la catena non può correggere i referti." ;;
esac

# ── Catena dei referti ───────────────────────────────────────────────────────
if [ -n "$SERVIZIO_CATENA" ]; then
  pid="$(launchctl list 2> /dev/null | awk -v s="$SERVIZIO_CATENA" '$3 == s {print $1}')"
  if [ -n "$pid" ] && [ "$pid" != "-" ]; then a_posto servizio "il servizio della catena è ripartito."
  else problema servizio 2 "Il servizio della catena dei referti è spento: i dettati non vengono trascritti."; fi
fi

in_coda=$(( $(conta_in ingresso) + $(conta_in lavorazione) ))
ultimo_log="$(mtime "$REFERTI/log/servizio.log")"
if [ "$in_coda" -gt 0 ] && [ "$ultimo_log" != 0 ] && [ "$(minuti_da "$ultimo_log")" -ge "$CATENA_ZITTA_MIN" ]; then
  problema catena 1 "Catena bloccata: $in_coda dettati in coda e nessun passo avanti da $(minuti_da "$ultimo_log") minuti."
else
  a_posto catena "la catena ha ripreso a lavorare."
fi

vecchio="$(piu_vecchio_in lavorazione)"
if [ "$vecchio" != 0 ] && [ "$(minuti_da "$vecchio")" -ge "$LAVORAZIONE_MAX_MIN" ]; then
  problema lavorazione 1 "Un dettato è in lavorazione da $(minuti_da "$vecchio") minuti (di solito 10–30)."
else
  a_posto lavorazione "il dettato lungo è uscito dalla lavorazione."
fi

vecchio="$(piu_vecchio_in output)"
if [ "$vecchio" != 0 ] && [ "$(minuti_da "$vecchio")" -ge "$CONSEGNA_MAX_MIN" ]; then
  problema consegna 1 "$(conta_in output) bozze pronte ma non consegnate alla piattaforma da $(minuti_da "$vecchio") minuti."
else
  a_posto consegna "le bozze sono state consegnate alla piattaforma."
fi

# Un dettato finito in errori/ resta lì finché qualcuno non lo guarda: si
# avvisa quando ne arriva uno NUOVO (e ogni 6 ore finché ce ne sono).
errori="$(conta_in errori)"
prima="$(cat "$STATO/errori.visti" 2> /dev/null || echo 0)"
echo "$errori" > "$STATO/errori.visti"
if [ "$errori" -gt 0 ]; then
  [ "$errori" -gt "$prima" ] && rm -f "$STATO/errori.avvisato"
  problema errori 1 "$errori dettati sono finiti in errori: vanno guardati nel pannello della catena."
else
  a_posto errori "non ci sono più dettati in errori."
fi

# ── Backup, disco, automazioni ───────────────────────────────────────────────
ultimo_backup="$(ls -t "$BACKUP_DIR"/referralflow-*.sql.gz 2> /dev/null | head -1)"
if [ -z "$ultimo_backup" ] || [ $(( (ADESSO - $(mtime "$ultimo_backup")) / 3600 )) -ge "$BACKUP_MAX_ORE" ]; then
  problema backup 1 "Il backup notturno del database non è stato fatto: l'ultimo ha più di $BACKUP_MAX_ORE ore."
else
  a_posto backup "il backup notturno è di nuovo in ordine."
fi

libero_gb=$(( $(df -k "$HOME" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
if [ "$libero_gb" -lt "$DISCO_MIN_GB" ]; then
  problema disco 1 "Disco quasi pieno: $libero_gb GB liberi. Sotto una certa soglia la catena si ferma."
else
  a_posto disco "c'è di nuovo spazio sul disco ($libero_gb GB)."
fi

# Un'automazione che fallisce 3 volte di fila (una ricompilazione ne fa
# fallire una sola).
if [ -f "$AUTOMAZIONI_LOG" ]; then
  guaste="$(tail -n 200 "$AUTOMAZIONI_LOG" | awk '
    $4 == "→" { k = $3; esiti[k] = esiti[k] ($0 ~ /ATTENZIONE/ ? "x" : "o") }
    END { for (k in esiti) if (esiti[k] ~ /xxx$/) printf "%s ", k }')"
  if [ -n "$guaste" ]; then
    problema automazioni 1 "Automazioni che non funzionano da 3 giri: ${guaste% }."
  else
    a_posto automazioni "le automazioni funzionano di nuovo."
  fi
fi

# ── Riepilogo del mattino (7:30) ─────────────────────────────────────────────
if [ "$ORA" = "07" ] && [ "$MINUTO" -ge 30 ] && [ "$(cat "$STATO/mattino" 2> /dev/null)" != "$OGGI" ]; then
  ieri="$(date -r $((ADESSO - 86400)) +%F)"
  registro="$REFERTI/log/servizio.log"
  consegnate="$(cat "$registro".1 "$registro" 2> /dev/null | grep "^$ieri" | grep -c ' fase=invio .*esito=ok' | tr -d ' ')"
  aperti=""
  for f in "$STATO"/*.attivo; do
    [ -f "$f" ] || continue
    aperti="$aperti
- $(cat "${f%.attivo}.testo")"
  done
  if [ -n "$aperti" ]; then
    testo="Buongiorno. Da sistemare:$aperti
Ieri la catena ha consegnato $consegnate bozze."
    pri=high
  else
    testo="Buongiorno: tutto in ordine. Ieri la catena ha consegnato $consegnate bozze. Disco: $libero_gb GB liberi."
    pri=low
  fi
  invia "$testo" "$pri" sunrise && echo "$OGGI" > "$STATO/mattino"
fi

exit 0
