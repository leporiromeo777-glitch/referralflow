# Decoder DSS / DS2 (dittafono Philips DPM)

Copia dei file del progetto open source **dss-codec** di Kieran Hirpara
(https://github.com/hirparak/dss-codec, licenza MIT — vedi `LICENSE`),
commit `c38d319`, vendorizzata il 2026-09-07. È il reverse engineering
completo (Ghidra) del decoder Olympus/Philips: decodifica i `.ds2` DSS Pro
in modalità SP (12 kHz) e QP (16 kHz), anche cifrati con password, e i
`.dss` classici (`dss_decode.py`, porting del `dss_sp.c` di FFmpeg, LGPL).

Perché serve: ffmpeg **non** decodifica i `.ds2` — il suo codec `dss_sp` è
un altro codec e sui DS2 produce un rumore «parlante» che whisper trascrive
come quasi nulla (collaudo del 2026-09-07 sul primo dettato vero del DPM
dello studio: 36 caratteri contro 105 parole col decoder giusto).

Uso (lo fa la catena da sola, `decodifica_dittafono()` in pipeline.py):

```bash
/opt/homebrew/bin/python3.14 ds2decode.py dettato.ds2 uscita.wav
```

Serve solo `numpy` (già presente nel python3.14 di Homebrew). Tutto gira sul
Mac dello studio: nessun dato esce. Circa 4 secondi per minuto d'audio.

Non modificare questi file: per aggiornare, ricopiare dal progetto
originale e annotare qui il commit.
