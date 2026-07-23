#!/usr/bin/env python3
"""Punto d'ingresso della pipeline referti.

Modalità servizio (launchd):
    python3 run.py --watch

Collaudo manuale fase-per-fase su un file reale (SPEC §9):
    python3 run.py /percorso/referto.m4a --fase 2

Fasi: 1 preprocessing · 2 trascrizione · 3 doppia trascrizione+confronto ·
4 dizionario · 5 correzione+ispezione LLM · 6 estrazione+controlli (default).
Gli artefatti restano in ~/referti/lavorazione/ (fasi 1-5) o output/ (fase 6);
il contenuto non viene mai stampato a terminale (SPEC §2.2).

Solo invio dei JSON pendenti:
    python3 run.py --invia
"""

import argparse
import shutil
import sys
from pathlib import Path

from referti import pipeline
from referti.config import DIR_INGRESSO, prepara_cartelle
from referti.errori import DiscoPieno


def main():
    parser = argparse.ArgumentParser(description="Pipeline locale referti")
    parser.add_argument("file", nargs="?", help="file audio da elaborare")
    parser.add_argument("--fase", type=int, default=6, choices=range(1, 7),
                        help="fermati dopo questa fase (default 6)")
    parser.add_argument("--watch", action="store_true", help="modalità servizio")
    parser.add_argument("--invia", action="store_true",
                        help="invia solo i JSON pendenti in output/")
    argomenti = parser.parse_args()

    prepara_cartelle()

    if argomenti.watch:
        from referti import watcher
        watcher.esegui()
        return 0

    if argomenti.invia:
        pipeline.invia_pendenti()
        return 0

    if not argomenti.file:
        parser.print_help()
        return 2

    sorgente = Path(argomenti.file).expanduser()
    if not sorgente.exists():
        print("file non trovato", file=sys.stderr)
        return 1
    # elabora() sposta il file: per il collaudo manuale si lavora su una copia
    # in ingresso/, l'originale del test resta dov'è.
    copia = DIR_INGRESSO / sorgente.name
    shutil.copy2(sorgente, copia)
    try:
        risultato = pipeline.elabora(copia, fino_a_fase=argomenti.fase)
    except DiscoPieno:
        print("disco quasi pieno: elaborazione fermata", file=sys.stderr)
        return 1
    if risultato is None:
        print("elaborazione fallita: vedi ~/referti/errori/", file=sys.stderr)
        return 1
    print(f"fase {argomenti.fase} completata, risultato in: {risultato}")
    if argomenti.fase == 6:
        pipeline.invia_pendenti()
    return 0


if __name__ == "__main__":
    sys.exit(main())
