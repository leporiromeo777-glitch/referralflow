"""Logging vincolato dalla SPEC §2.2: solo ID del file, timestamp, fase,
esito e durata. Mai testo del referto, mai nomi, mai numeri clinici.
Usare SOLO evento(): il formato obbligato rende difficile loggare contenuto."""

import logging
from logging.handlers import RotatingFileHandler

from .config import DIR_LOG

_logger = None


def _get_logger():
    global _logger
    if _logger is None:
        DIR_LOG.mkdir(parents=True, exist_ok=True)
        logger = logging.getLogger("referti")
        logger.setLevel(logging.INFO)
        handler = RotatingFileHandler(
            DIR_LOG / "pipeline.log", maxBytes=5 * 1024 * 1024, backupCount=5
        )
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
        _logger = logger
    return _logger


def evento(file_id, fase, esito, durata=None, dettaglio=None):
    """Registra un evento di pipeline.

    dettaglio: SOLO informazioni tecniche non cliniche (codici di uscita,
    classi di eccezione, conteggi). Mai contenuto del referto.
    """
    parti = [f"file={file_id}", f"fase={fase}", f"esito={esito}"]
    if durata is not None:
        parti.append(f"durata={durata:.1f}s")
    if dettaglio:
        parti.append(f"dettaglio={dettaglio}")
    livello = logging.INFO if esito == "ok" else logging.ERROR
    _get_logger().log(livello, " ".join(parti))


def critico(messaggio):
    """Per condizioni di sistema (disco pieno, config mancante). Non clinico."""
    _get_logger().critical(messaggio)
