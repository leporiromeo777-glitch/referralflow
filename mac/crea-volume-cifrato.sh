#!/bin/bash
# Volume APFS cifrato dedicato ad audio e dataset dei referti (2026-09-06,
# docs/legale/conservazione-audio.md). Chiave DISTINTA da FileVault: la
# distruzione della chiave rende illeggibile tutto il dataset in un colpo
# (cancellazione crittografica), senza toccare il resto del disco.
#
# Uso (dal titolare, chiede la passphrase in modo interattivo, mai in chiaro):
#   bash mac/crea-volume-cifrato.sh            # crea «Referti-Cassaforte» e sposta il dataset
#   bash mac/crea-volume-cifrato.sh --distruggi  # cancella il volume (cancellazione crittografica)
set -euo pipefail
NOME="Referti-Cassaforte"
PUNTO="/Volumes/$NOME"
CONTENITORE=$(diskutil info / | awk -F': *' '/APFS Container/ {print $2; exit}')
if [ -z "$CONTENITORE" ]; then CONTENITORE=$(diskutil list | awk '/APFS Container Scheme/ {print $NF; exit}'); fi

if [ "${1:-}" = "--distruggi" ]; then
  echo "ATTENZIONE: cancella il volume $NOME e tutto il suo contenuto (irreversibile)."
  read -r -p "Scrivi DISTRUGGI per confermare: " conf
  [ "$conf" = "DISTRUGGI" ] || { echo "annullato"; exit 1; }
  diskutil apfs deleteVolume "$PUNTO"
  echo "Volume distrutto: la chiave non esiste più, i dati sono illeggibili."
  exit 0
fi

if [ -d "$PUNTO" ]; then
  echo "Il volume $NOME esiste già in $PUNTO."
else
  echo "Creo il volume cifrato $NOME nel contenitore $CONTENITORE (ti chiederà una passphrase: conservala nel gestore di password dello studio)."
  diskutil apfs addVolume "$CONTENITORE" APFS "$NOME" -passprompt
fi
# Il volume si monta al login dell'account di servizio; la passphrase si salva nel portachiavi al primo mount.
mkdir -p "$PUNTO/referti-dataset"
if [ -d "$HOME/referti-dataset/audio" ] && [ ! -L "$HOME/referti-dataset/audio" ]; then
  echo "Sposto ~/referti-dataset/audio nel volume cifrato e lascio un collegamento."
  mv "$HOME/referti-dataset/audio" "$PUNTO/referti-dataset/audio"
  ln -s "$PUNTO/referti-dataset/audio" "$HOME/referti-dataset/audio"
fi
chmod 700 "$PUNTO/referti-dataset"
echo "Fatto. Dataset audio in $PUNTO/referti-dataset/audio (collegamento da ~/referti-dataset/audio)."
echo "Per escluderlo dai backup: Time Machine → Opzioni → aggiungi $PUNTO."
