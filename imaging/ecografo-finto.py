#!/usr/bin/env python3
"""Un ecografo FINTO, per le prove (7.10.2026).

Costruisce un ecocardiogramma SINTETICO fatto come lo manda un ecografo —
filmati a colori compressi JPEG (YBR_FULL_422) e un'immagine ferma — e lo
spedisce con un C-STORE alla ricezione, presentandosi con un AE Title suo.
Nessun paziente e nessun esame vero: nome e data sono inventati e li sceglie
chi lancia la prova.

    ecografo-finto.py --porta 11113 --studio 1.2.826.0.1.3680043.8.498.1 \
        --nome 'PROVAECO^MARIA' --nascita 19480304 [--filmati 3] [--da 0] [--fino 4]

Stampa un JSON: {"ok": true, "mandate": N, "accettate": N}.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

QUI = Path(__file__).resolve().parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--porta", type=int, default=0)
    ap.add_argument("--scrivi", default="", help="invece di spedire, scrive i file in questa cartella (come li archivia il software dell'ecografo)")
    ap.add_argument("--ae", default="ECOPROVA")
    ap.add_argument("--verso", default="REFERRALFLOW")
    ap.add_argument("--studio", required=True, help="Study Instance UID")
    ap.add_argument("--nome", required=True)
    ap.add_argument("--nascita", default="")
    ap.add_argument("--data", default="20260301")
    ap.add_argument("--filmati", type=int, default=3)
    ap.add_argument("--da", type=int, default=0, help="prima immagine da mandare (0 = dall'inizio)")
    ap.add_argument("--fino", type=int, default=0, help="quante in tutto esistono da mandare (0 = tutte)")
    a = ap.parse_args()

    from pynetdicom import AE

    spec = importlib.util.spec_from_file_location("prova_ecografo", QUI / "prova-ecografo.py")
    fab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fab)

    # Le immagini dell'esame: UID DETERMINISTICI dallo studio e dal numero, così
    # rimandare lo stesso esame manda davvero le stesse immagini.
    serie = f"{a.studio}.1"
    oggetti = []
    for n in range(a.filmati):
        ds = fab.filmato_jpeg(12, 240, 320)
        ds.SeriesDescription = "Filmati"
        ds.FrameTime = "40"          # come un ecografo vero: 25 fotogrammi al secondo
        oggetti.append(ds)
    fermo = fab.fermo_rgb(240, 320)
    fermo.SeriesDescription = "Filmati"
    oggetti.append(fermo)
    for n, ds in enumerate(oggetti):
        ds.StudyInstanceUID, ds.SeriesInstanceUID = a.studio, serie
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID = f"{a.studio}.1.{n + 1}"
        ds.PatientName, ds.PatientID, ds.PatientBirthDate = a.nome, "ECOPROVA", a.nascita
        ds.StudyDate, ds.StudyTime, ds.StudyDescription = a.data, "101500", "Ecocardiogramma di prova"
        ds.SeriesNumber, ds.InstanceNumber = 1, n + 1
    # Ogni immagine passa da un file (in memoria) e si rilegge: così porta con
    # sé la sintassi con cui è scritta davvero. Un oggetto costruito a mano, per
    # chi spedisce, «è» non compresso — e un filmato JPEG partirebbe dichiarato
    # non compresso, cioè illeggibile all'arrivo (successo alla prima prova).
    import io
    import pydicom
    scelti = []
    for ds in oggetti[a.da:(a.fino or len(oggetti))]:
        b = io.BytesIO()
        ds.save_as(b)
        b.seek(0)
        scelti.append(pydicom.dcmread(b))

    if a.scrivi:
        from pathlib import Path as _P
        dove = _P(a.scrivi); dove.mkdir(parents=True, exist_ok=True)
        for ds in scelti:
            ds.save_as(str(dove / f"{ds.SOPInstanceUID}_image.dcm"))
        print(json.dumps({"ok": True, "scritte": len(scelti)}))
        return 0
    if not a.porta:
        print(json.dumps({"ok": False, "errore": "manca --porta"}))
        return 2

    ae = AE(ae_title=a.ae)
    for sop, sintassi in {(str(d.SOPClassUID), str(d.file_meta.TransferSyntaxUID)) for d in scelti}:
        ae.add_requested_context(sop, [sintassi])
    assoc = ae.associate(a.host, a.porta, ae_title=a.verso)
    if not assoc.is_established:
        print(json.dumps({"ok": False, "errore": "associazione_rifiutata"}))
        return 1
    accettate = 0
    for ds in scelti:
        st = assoc.send_c_store(ds)
        if st and int(getattr(st, "Status", 1)) == 0:
            accettate += 1
    assoc.release()
    print(json.dumps({"ok": accettate == len(scelti), "mandate": len(scelti), "accettate": accettate}))
    return 0 if accettate == len(scelti) else 1


if __name__ == "__main__":
    sys.exit(main())
