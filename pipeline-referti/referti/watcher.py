"""Fase 7 — sorveglianza della cartella ingresso/ con watchdog (SPEC §4)
e ciclo di riprova per gli invii pendenti.

Il watcher sveglia il ciclo appena arriva un file; un giro di scansione
ogni 30 secondi copre comunque riprove e file arrivati mentre il processo
era fermo. Un file che fallisce non blocca mai la coda (SPEC §7.1)."""

import shutil
import threading
import time

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from . import pipeline
from .cancellazione import cancella_sicuro
from .config import (
    DIR_INGRESSO,
    DIR_LAVORAZIONE,
    ESTENSIONI_AUDIO,
    prepara_cartelle,
)
from .errori import DiscoPieno
from .logsetup import critico, evento

_INTERVALLO_SCANSIONE = 30  # secondi


class _Sveglia(FileSystemEventHandler):
    def __init__(self, segnale):
        self._segnale = segnale

    def on_created(self, event):
        if not event.is_directory:
            self._segnale.set()

    def on_moved(self, event):
        if not event.is_directory:
            self._segnale.set()


def _file_stabile(percorso):
    """Il medico potrebbe stare ancora copiando il file: si elabora solo
    quando la dimensione resta ferma per 2 secondi."""
    try:
        prima = percorso.stat().st_size
        time.sleep(2)
        return percorso.exists() and percorso.stat().st_size == prima and prima > 0
    except OSError:
        return False


def _ripulisci_lavorazione():
    """All'avvio: un crash può aver lasciato file a metà in lavorazione/.
    Gli audio tornano in ingresso/ (verranno rielaborati con un nuovo id),
    gli intermedi clinici si cancellano in modo sicuro."""
    for percorso in DIR_LAVORAZIONE.iterdir():
        if not percorso.is_file():
            continue
        if percorso.suffix.lower() in ESTENSIONI_AUDIO and ".pulito" not in percorso.name:
            shutil.move(str(percorso), DIR_INGRESSO / percorso.name)
        else:
            cancella_sicuro(percorso)


def esegui():
    prepara_cartelle()
    _ripulisci_lavorazione()
    segnale = threading.Event()
    osservatore = Observer()
    osservatore.schedule(_Sveglia(segnale), str(DIR_INGRESSO))
    osservatore.start()
    evento("-", "watcher", "ok", dettaglio="avviato")
    try:
        while True:
            segnale.wait(timeout=_INTERVALLO_SCANSIONE)
            segnale.clear()
            try:
                for percorso in sorted(
                    DIR_INGRESSO.iterdir(), key=lambda p: p.stat().st_mtime
                ):
                    if not percorso.is_file() or percorso.name.startswith("."):
                        continue
                    if percorso.suffix.lower() not in ESTENSIONI_AUDIO:
                        continue
                    if not _file_stabile(percorso):
                        continue
                    pipeline.elabora(percorso)
                pipeline.invia_pendenti()
            except DiscoPieno:
                # Ferma tutto e segnala (SPEC §7.2): launchd terrà il
                # processo giù finché qualcuno non libera spazio e riavvia.
                raise
    except DiscoPieno:
        pass
    except KeyboardInterrupt:
        pass
    finally:
        osservatore.stop()
        osservatore.join(timeout=5)
        critico("watcher fermato")
