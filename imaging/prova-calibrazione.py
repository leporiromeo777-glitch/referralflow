#!/usr/bin/env python3
"""Verifica tecnica del lettore di calibrazione (19.9.2026).

Costruisce file DICOM sintetici con calibrazioni note e controlla che
`leggi-dicom.py calibrazione` le legga esatte. Fa parte del piano di
validazione del dispositivo in-house (docs/legale/dispositivo-in-house/
piano-validazione.md). Nessun dato di paziente: i file nascono qui e muoiono
qui.

    ~/.referralflow-imaging/bin/python imaging/prova-calibrazione.py
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

QUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("leggi_dicom", QUI / "leggi-dicom.py")
leggi = importlib.util.module_from_spec(spec); spec.loader.exec_module(leggi)  # type: ignore[union-attr]


def base(modalita: str, righe: int, colonne: int) -> pydicom.FileDataset:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = pydicom.uid.CTImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = pydicom.FileDataset("x", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID; ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid(); ds.SeriesInstanceUID = generate_uid()
    ds.PatientName = "PROVA^SINTETICA"; ds.PatientID = "0"; ds.Modality = modalita
    ds.Rows = righe; ds.Columns = colonne; ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 8; ds.BitsStored = 8; ds.HighBit = 7; ds.PixelRepresentation = 0
    ds.PixelData = np.zeros((righe, colonne), dtype=np.uint8).tobytes()
    return ds


def regione(x0, y0, x1, y1, dx_cm, dy_cm, formato=1, unita=3, tipo=1) -> Dataset:
    r = Dataset()
    r.RegionSpatialFormat = formato; r.RegionDataType = tipo
    r.RegionLocationMinX0 = x0; r.RegionLocationMinY0 = y0; r.RegionLocationMaxX1 = x1; r.RegionLocationMaxY1 = y1
    r.PhysicalUnitsXDirection = unita; r.PhysicalUnitsYDirection = unita
    r.PhysicalDeltaX = dx_cm; r.PhysicalDeltaY = dy_cm
    return r


def main() -> int:
    falliti = 0
    def check(nome: str, ok: bool, dettaglio: str = "") -> None:
        nonlocal falliti
        print(f"  {'ok ' if ok else 'NO '} {nome}{(' — ' + dettaglio) if dettaglio and not ok else ''}")
        if not ok: falliti += 1

    print("prova-calibrazione")
    # 1. TAC con PixelSpacing [riga, colonna]
    ct = base("CT", 512, 512); ct.PixelSpacing = [0.75, 0.5]
    c = leggi.calibrazione_di(ct)
    check("TAC: PixelSpacing letto, riga→dy e colonna→dx", c["tipo"] == "pixel_spacing" and c["spacing"]["dy_mm"] == 0.75 and c["spacing"]["dx_mm"] == 0.5, json.dumps(c))

    # 2. RM multiframe «enhanced»: spacing nei gruppi funzionali condivisi
    mr = base("MR", 256, 256)
    pm = Dataset(); pm.PixelSpacing = [1.2, 1.2]
    g = Dataset(); g.PixelMeasuresSequence = Sequence([pm])
    mr.SharedFunctionalGroupsSequence = Sequence([g])
    c = leggi.calibrazione_di(mr)
    check("RM enhanced: PixelSpacing dai gruppi condivisi", c["tipo"] == "pixel_spacing" and c["spacing"]["dx_mm"] == 1.2, json.dumps(c))

    # 3. Ecografia: due regioni 2D in cm + una M-mode (x = secondi) da scartare
    us = base("US", 600, 800)
    us.SequenceOfUltrasoundRegions = Sequence([
        regione(100, 50, 700, 550, 0.02, 0.02),
        regione(0, 560, 800, 600, 0.01, 0.01),
        regione(0, 0, 800, 40, 0.001, 0.02, formato=2, unita=4),   # M-mode: unità X = secondi
    ])
    c = leggi.calibrazione_di(us)
    check("ECO: due regioni 2D in cm → mm/px, M-mode scartata", c["tipo"] == "us_regioni" and len(c["regioni"]) == 2
          and c["regioni"][0]["dx_mm"] == 0.2 and c["regioni"][1]["dy_mm"] == 0.1 and c["regioni"][0]["x1"] == 700, json.dumps(c))

    # 4. Ecografia con delta Y negativo (capita): si prende il modulo
    us2 = base("US", 600, 800); us2.SequenceOfUltrasoundRegions = Sequence([regione(0, 0, 799, 599, 0.03, -0.03)])
    c = leggi.calibrazione_di(us2)
    check("ECO: PhysicalDeltaY negativo → modulo", c["tipo"] == "us_regioni" and c["regioni"][0]["dy_mm"] == 0.3, json.dumps(c))

    # 5. Radiografia: ImagerPixelSpacing NON è calibrazione del paziente
    cr = base("CR", 2000, 2000); cr.ImagerPixelSpacing = [0.1, 0.1]
    c = leggi.calibrazione_di(cr)
    check("CR: ImagerPixelSpacing riportato ma tipo distinto", c["tipo"] == "imager_pixel_spacing", json.dumps(c))

    # 6. Niente: nessuna calibrazione
    nulla = base("OT", 100, 100)
    c = leggi.calibrazione_di(nulla)
    check("Senza tag: tipo nessuna", c["tipo"] == "nessuna" and c["regioni"] == [] and c["spacing"] is None, json.dumps(c))

    # 7. Spacing zero o negativo non vale
    z = base("CT", 10, 10); z.PixelSpacing = [0, 0.5]
    check("PixelSpacing con zero → nessuna", leggi.calibrazione_di(z)["tipo"] == "nessuna")

    # 8. Il comando da riga di comando e il campo dentro `meta`
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "ct.dcm"; ct.save_as(str(f), enforce_file_format=True)
        out = subprocess.run([sys.executable, str(QUI / "leggi-dicom.py"), "calibrazione", str(f)], capture_output=True, text=True)
        j = json.loads(out.stdout or "{}")
        check("comando calibrazione", out.returncode == 0 and j.get("tipo") == "pixel_spacing", out.stdout[:200])
        out = subprocess.run([sys.executable, str(QUI / "leggi-dicom.py"), "meta", str(f)], capture_output=True, text=True)
        j = json.loads(out.stdout or "{}")
        check("meta porta la calibrazione", (j.get("calibrazione") or {}).get("tipo") == "pixel_spacing", out.stdout[:200])

    print(f"{'TUTTO OK' if not falliti else f'{falliti} FALLITI'}")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(main())
