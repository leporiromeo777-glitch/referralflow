"""Cancellazione sicura (SPEC §2.3): sovrascrittura, non semplice unlink.

L'audio si cancella SOLO dopo il salvataggio riuscito nel database:
la decisione di quando chiamare queste funzioni sta in pipeline.py."""

import os

_BLOCCO = 1024 * 1024


def cancella_sicuro(percorso):
    """Sovrascrive il file con byte casuali, poi lo rimuove."""
    if not percorso.exists():
        return
    dimensione = percorso.stat().st_size
    if dimensione:
        with open(percorso, "r+b") as f:
            rimanenti = dimensione
            while rimanenti > 0:
                f.write(os.urandom(min(_BLOCCO, rimanenti)))
                rimanenti -= _BLOCCO
            f.flush()
            os.fsync(f.fileno())
    percorso.unlink()


def cancella_intermedi(cartella, file_id):
    """Rimuove in modo sicuro tutti gli intermedi di un file (wav, txt):
    contengono a loro volta dati clinici."""
    for percorso in cartella.glob(file_id + "*"):
        if percorso.is_file():
            cancella_sicuro(percorso)
