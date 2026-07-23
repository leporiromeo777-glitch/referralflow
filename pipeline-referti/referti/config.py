"""Configurazione della pipeline. Tutto locale (SPEC §2.1): l'unica
connessione di rete ammessa è verso il PostgreSQL di ReferralFlow;
Ollama e whisper.cpp girano sulla stessa macchina."""

import os
from pathlib import Path
from urllib.parse import urlparse

BASE = Path(os.environ.get("REFERTI_BASE", "~/referti")).expanduser()
DIR_INGRESSO = BASE / "ingresso"
DIR_LAVORAZIONE = BASE / "lavorazione"
DIR_ERRORI = BASE / "errori"
DIR_ARCHIVIO = BASE / "archivio_temp"
DIR_OUTPUT = BASE / "output"
DIR_LOG = BASE / "log"

WHISPER_BIN = os.environ.get("WHISPER_BIN", "whisper-cli")
WHISPER_MODEL = os.environ.get(
    "WHISPER_MODEL", str(Path("~/whisper.cpp/models/ggml-large-v3.bin").expanduser())
)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma3:12b")
OLLAMA_TIMEOUT = 300  # secondi (SPEC §7.3)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
STUDIO_SLUG = os.environ.get("REFERTI_STUDIO_SLUG", "centro-cardiologico-ticino")

CORREZIONI = Path(
    os.environ.get(
        "REFERTI_CORREZIONI",
        str(Path(__file__).resolve().parent.parent / "correzioni.json"),
    )
)

ESTENSIONI_AUDIO = {
    ".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma",
    ".mp4", ".aif", ".aiff", ".caf",
}

# Sotto questa soglia di spazio libero la pipeline si ferma (SPEC §7.2).
SOGLIA_DISCO_LIBERO = 1 * 1024 ** 3

_HOST_LOCALI = {"localhost", "127.0.0.1", "::1"}


def verifica_ollama_locale():
    """SPEC §2.1: Ollama deve essere sulla macchina, non un servizio remoto."""
    host = urlparse(OLLAMA_URL).hostname
    if host not in _HOST_LOCALI:
        raise RuntimeError(
            "OLLAMA_URL non punta a localhost: violerebbe il vincolo §2.1"
        )


def prepara_cartelle():
    for cartella in (
        DIR_INGRESSO, DIR_LAVORAZIONE, DIR_ERRORI, DIR_ARCHIVIO, DIR_OUTPUT, DIR_LOG,
    ):
        cartella.mkdir(parents=True, exist_ok=True)
        os.chmod(cartella, 0o700)
