#!/usr/bin/env python3
"""Pipeline locale di trascrizione referti — vedi docs/trascrizione/SPEC.md.

Fasi implementate:
  1. preprocessing audio: passa-alto 80 Hz + normalizzazione EBU R128,
     esporta WAV 16 kHz mono per whisper.cpp
  2. trascrizione: whisper.cpp (whisper-cli), modello ggml-large-v3, lingua it

Uso:
    python3 pipeline.py <file_audio>

Accanto al file d'ingresso compaiono <file_id>.wav (audio pulito) e
<file_id>.txt (trascrizione). Il file_id deriva dal contenuto, non dal nome.

Il modello va messo in modelli/ggml-large-v3.bin accanto a questo script
(percorsi e binario sovrascrivibili con REFERTI_MODELLO e REFERTI_WHISPER).
"""

import hashlib
import logging
import os
import shutil
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

# ── Trascrizione (SPEC §4) ───────────────────────────────────────────────────
# whisper.cpp come binario locale; su Mac arriva da `brew install whisper-cpp`.
# Un dettato lungo su large-v3 può richiedere minuti: timeout largo.
WHISPER_BIN = os.environ.get("REFERTI_WHISPER", "whisper-cli")
PERCORSO_MODELLO = Path(
    os.environ.get(
        "REFERTI_MODELLO",
        str(Path(__file__).resolve().parent / "modelli" / "ggml-large-v3.bin"),
    )
)
WHISPER_TIMEOUT_S = 1800


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


def trascrivi(wav: Path, uscita_txt: Path, file_id: str) -> None:
    """Trascrizione con whisper.cpp, lingua italiana, parametri di default
    (sarà la «passata A»; la B con parametri diversi arriva in Fase 3).
    Il testo esce direttamente su file (-otxt): stdout/stderr di whisper
    contengono la trascrizione e vengono scartati (SPEC §2.2)."""
    inizio = time.monotonic()
    base = uscita_txt.with_suffix("")  # -of vuole il percorso senza estensione
    comando = [
        WHISPER_BIN,
        "-m", str(PERCORSO_MODELLO),
        "-l", "it",
        "-f", str(wav),
        "-otxt",
        "-of", str(base),
        "-np",
    ]
    esito = subprocess.run(
        comando,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=WHISPER_TIMEOUT_S,
    )
    durata = time.monotonic() - inizio
    if esito.returncode != 0:
        log.error(
            "fase=trascrizione file=%s esito=errore codice=%d durata=%.1fs",
            file_id, esito.returncode, durata,
        )
        raise RuntimeError("whisper fallito")
    if not uscita_txt.exists() or not uscita_txt.read_text(encoding="utf-8").strip():
        log.error("fase=trascrizione file=%s esito=errore motivo=testo_vuoto", file_id)
        raise RuntimeError("trascrizione vuota")
    log.info("fase=trascrizione file=%s esito=ok durata=%.1fs", file_id, durata)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    ingresso = Path(argv[1])
    if not ingresso.is_file():
        log.error("fase=avvio file=? esito=errore motivo=file_inesistente")
        return 1
    if shutil.which(WHISPER_BIN) is None:
        log.error("fase=avvio file=? esito=errore motivo=whisper_mancante")
        return 1
    if not PERCORSO_MODELLO.is_file():
        log.error("fase=avvio file=? esito=errore motivo=modello_mancante")
        return 1

    file_id = file_id_di(ingresso)
    wav = ingresso.with_name(f"{file_id}.wav")
    txt = ingresso.with_name(f"{file_id}.txt")

    fase = "preprocessing"
    try:
        preprocessa(ingresso, wav, file_id)
        fase = "trascrizione"
        trascrivi(wav, txt, file_id)
    except subprocess.TimeoutExpired:
        log.error("fase=%s file=%s esito=errore motivo=timeout", fase, file_id)
        return 1
    except RuntimeError:
        return 1  # già loggato nella fase che ha fallito
    except Exception as e:
        # Mai str(e): può contenere percorsi o contenuti.
        log.error("fase=%s file=%s esito=errore tipo=%s", fase, file_id, type(e).__name__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
