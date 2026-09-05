#!/bin/bash
# Set d'oro «per correzione» (2026-09-06): per ogni referto CONFERMATO
# nell'app, copia l'audio conservato nel dataset e il testo firmato dal medico
# in ~/referti-dataset/oro/<file_id>.{wav|m4a,txt}, con un manifest. È la
# base del banco cardiologico vero (banco-audio.py --oro) e del confronto
# cieco. Solo file, nessun contenuto a video. Da lanciare dal Mac dello studio.
set -euo pipefail
cd "$(dirname "$0")/../" 2>/dev/null || true
ENV_FILE="${ENV_FILE:-$HOME/referralflow/.env}"
set -a; source "$ENV_FILE"; set +a
ORO="$HOME/referti-dataset/oro"; AUDIO="$HOME/referti-dataset/audio"
mkdir -p "$ORO"
n=0; senza_audio=0
while IFS='|' read -r fid testo_b64; do
  [ -z "$fid" ] && continue
  src=$(ls "$AUDIO"/"$fid".* 2>/dev/null | head -1 || true)
  if [ -z "$src" ]; then senza_audio=$((senza_audio+1)); continue; fi
  # il banco (banco-audio.py) vuole coppie .wav/.txt: si converte a 16 kHz mono
  [ -f "$ORO/$fid.wav" ] || ffmpeg -hide_banner -loglevel error -y -i "$src" -ar 16000 -ac 1 "$ORO/$fid.wav"
  printf '%s' "$testo_b64" | base64 -d > "$ORO/$fid.txt"
  n=$((n+1))
done < <(psql "$DATABASE_URL" -At -F'|' -c "select payload->>'file_id', encode(convert_to(testo_finale,'UTF8'),'base64') from referti_bozze where stato='confermata' and testo_finale is not null and coalesce((payload->>'ombra')::boolean,false)=false")
ls "$ORO"/*.txt 2>/dev/null | wc -l | xargs printf 'referti nell\x27oro: %s\n'
echo "esportati ora: $n · confermati senza audio conservato: $senza_audio"
