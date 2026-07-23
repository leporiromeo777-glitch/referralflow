"""Fasi 2-3 — trascrizione con whisper.cpp, lingua italiana.

La doppia trascrizione (parametri leggermente diversi) è un rilevatore di
dubbi, non un meccanismo di voto: il sistema non sceglie mai quale versione
è giusta (SPEC §3, nota sui passaggi 3-4)."""

import subprocess

from .config import WHISPER_BIN, WHISPER_MODEL
from .errori import ErroreFase

# A: beam search deterministica. B: greedy con best-of e temperatura minima.
PARAMETRI_A = ["-bs", "5", "--temperature", "0.0"]
PARAMETRI_B = ["-bs", "1", "-bo", "5", "--temperature", "0.2"]


def trascrivi(wav, prefisso_uscita, parametri):
    """Esegue whisper.cpp e restituisce il testo trascritto."""
    cmd = [
        WHISPER_BIN,
        "-m", WHISPER_MODEL,
        "-l", "it",
        "-f", str(wav),
        "-otxt",
        "-of", str(prefisso_uscita),
        "-np",
        *parametri,
    ]
    try:
        esito = subprocess.run(cmd, capture_output=True, timeout=3600)
    except FileNotFoundError:
        raise ErroreFase("trascrizione", "binario whisper.cpp non trovato")
    except subprocess.TimeoutExpired:
        raise ErroreFase("trascrizione", "whisper.cpp oltre il timeout")
    if esito.returncode != 0:
        raise ErroreFase("trascrizione", f"whisper.cpp codice {esito.returncode}")
    file_testo = prefisso_uscita.with_suffix(prefisso_uscita.suffix + ".txt") \
        if prefisso_uscita.suffix else prefisso_uscita.parent / (prefisso_uscita.name + ".txt")
    if not file_testo.exists():
        raise ErroreFase("trascrizione", "file di testo non prodotto")
    testo = file_testo.read_text(encoding="utf-8").strip()
    if not testo:
        raise ErroreFase("trascrizione", "trascrizione vuota")
    return testo
