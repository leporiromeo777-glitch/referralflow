"""Fase 1 — preprocessing audio (SPEC §3 [2]): normalizzazione,
filtro passa-alto, esportazione WAV 16 kHz mono per whisper.cpp."""

import subprocess

from .errori import ErroreFase


def preprocessa(sorgente, destinazione):
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(sorgente),
        "-af", "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        str(destinazione),
    ]
    try:
        esito = subprocess.run(cmd, capture_output=True, timeout=600)
    except FileNotFoundError:
        raise ErroreFase("preprocessing", "ffmpeg non trovato")
    except subprocess.TimeoutExpired:
        raise ErroreFase("preprocessing", "ffmpeg oltre il timeout")
    if esito.returncode != 0:
        # File corrotto o formato non supportato (SPEC §7.2). Non si logga
        # stderr: potrebbe contenere il nome del file originale.
        raise ErroreFase("preprocessing", f"ffmpeg codice {esito.returncode}")
    if not destinazione.exists() or destinazione.stat().st_size == 0:
        raise ErroreFase("preprocessing", "wav di uscita vuoto")
