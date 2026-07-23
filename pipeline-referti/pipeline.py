#!/usr/bin/env python3
"""Pipeline locale di trascrizione referti — vedi docs/trascrizione/SPEC.md.

Fase 1 (attuale): preprocessing audio.
Prende un file audio da riga di comando, applica passa-alto a 80 Hz e
normalizzazione del volume (EBU R128), esporta un WAV 16 kHz mono pronto
per whisper.cpp. Nient'altro.

Uso:
    python3 pipeline.py <file_audio> [wav_di_uscita]

Senza secondo argomento il WAV finisce accanto all'ingresso, chiamato
<file_id>.wav (il file_id deriva dal contenuto, non dal nome).
"""

import hashlib
import logging
import subprocess
import sys
import time
from pathlib import Path

# ── Logging (SPEC §2.2) ──────────────────────────────────────────────────────
# Nei log passano SOLO: file_id, timestamp, fase, esito, durata. Mai contenuto
# clinico, mai il nome del file originale (potrebbe contenere il nome del
# paziente), mai stdout/stderr di ffmpeg. Anche nelle eccezioni si logga il
# tipo, mai str(e).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stderr,
)
log = logging.getLogger("referti")

FFMPEG_TIMEOUT_S = 600


def file_id_di(percorso: Path) -> str:
    """ID stabile derivato dal contenuto: identifica il file nei log e nei
    retry senza mai esporre il nome originale."""
    h = hashlib.sha256()
    with open(percorso, "rb") as f:
        for blocco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(blocco)
    return h.hexdigest()[:16]


def preprocessa(ingresso: Path, uscita: Path, file_id: str) -> None:
    """Passa-alto 80 Hz (via il rombo a bassa frequenza, la voce non ne
    risente) + loudnorm EBU R128 (dettati a volume disomogeneo), poi
    16 kHz mono PCM 16 bit: il formato d'ingresso di whisper.cpp."""
    inizio = time.monotonic()
    comando = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i", str(ingresso),
        "-af", "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(uscita),
    ]
    # stdout/stderr scartati: contengono il nome del file e i metadati.
    esito = subprocess.run(
        comando,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=FFMPEG_TIMEOUT_S,
    )
    durata = time.monotonic() - inizio
    if esito.returncode != 0:
        log.error(
            "fase=preprocessing file=%s esito=errore codice=%d durata=%.1fs",
            file_id, esito.returncode, durata,
        )
        raise RuntimeError("ffmpeg fallito")
    if not uscita.exists() or uscita.stat().st_size <= 44:  # 44 = solo header WAV
        log.error("fase=preprocessing file=%s esito=errore motivo=wav_vuoto", file_id)
        raise RuntimeError("wav vuoto")
    log.info("fase=preprocessing file=%s esito=ok durata=%.1fs", file_id, durata)


def main(argv: list[str]) -> int:
    if len(argv) < 2 or len(argv) > 3:
        print(__doc__, file=sys.stderr)
        return 2

    ingresso = Path(argv[1])
    if not ingresso.is_file():
        log.error("fase=preprocessing file=? esito=errore motivo=file_inesistente")
        return 1

    file_id = file_id_di(ingresso)
    uscita = Path(argv[2]) if len(argv) == 3 else ingresso.with_name(f"{file_id}.wav")

    try:
        preprocessa(ingresso, uscita, file_id)
    except subprocess.TimeoutExpired:
        log.error("fase=preprocessing file=%s esito=errore motivo=timeout", file_id)
        return 1
    except RuntimeError:
        return 1  # già loggato in preprocessa()
    except Exception as e:
        # Mai str(e): può contenere percorsi o contenuti.
        log.error("fase=preprocessing file=%s esito=errore tipo=%s", file_id, type(e).__name__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
