#!/usr/bin/env python3
"""Prova della ricostruzione MPR su una TAC sintetica con una struttura nota.

Volume 8 fette × 64 × 64, spaziatura 0,5 mm, fette a 2 mm: un parallelepipedo
chiaro fra x∈[10,30), y∈[20,40), z∈[2,6). Il taglio sagittale a x=15 deve
mostrare il rettangolo y∈[20,40) × z∈[2,6); quello coronale a y=25 il
rettangolo x∈[10,30) × z∈[2,6). Le dimensioni della griglia virtuale e le
spaziature dichiarate sono quelle attese.

    ~/.referralflow-imaging/bin/python imaging/prova-mpr.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image
from pydicom.dataset import FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

QUI = Path(__file__).resolve().parent


def fetta(z: int, arr) -> pydicom.FileDataset:
    meta = FileMetaDataset(); meta.MediaStorageSOPClassUID = pydicom.uid.CTImageStorage; meta.MediaStorageSOPInstanceUID = generate_uid(); meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = pydicom.FileDataset("x", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID; ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = "1.2.3"; ds.SeriesInstanceUID = "1.2.3.4"; ds.PatientName = "PROVA^SINTETICA"; ds.PatientID = "0"; ds.Modality = "CT"
    ds.Rows = 64; ds.Columns = 64; ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16; ds.BitsStored = 16; ds.HighBit = 15; ds.PixelRepresentation = 0
    ds.RescaleSlope = 1; ds.RescaleIntercept = -1024; ds.PixelSpacing = [0.5, 0.5]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]; ds.ImagePositionPatient = [0, 0, z * 2.0]; ds.FrameOfReferenceUID = "9.9"
    ds.InstanceNumber = z + 1; ds.PixelData = arr.astype(np.uint16).tobytes(); return ds


def main() -> int:
    falliti = 0
    def check(nome, ok, extra=""):
        nonlocal falliti
        print(f"  {'ok ' if ok else 'NO '} {nome}{(' — ' + str(extra)[:300]) if extra and not ok else ''}")
        if not ok: falliti += 1
    print("prova-mpr")
    with tempfile.TemporaryDirectory() as d:
        file = []
        for z in range(8):
            a = np.full((64, 64), 1024, dtype=np.uint16)
            if 2 <= z < 6:
                a[20:40, 10:30] = 2024
            f = Path(d) / f"f{z}.dcm"; fetta(z, a).save_as(str(f), enforce_file_format=True); file.append(str(f))
        # disordinati apposta: l'ordine lo dà chi chiama (dalla geometria di serie), qui lo diamo giusto
        def chiama(piano, indice):
            out = Path(d) / f"{piano}-{indice}.png"
            r = subprocess.run([sys.executable, str(QUI / "mpr.py")], input=json.dumps({"file": file, "piano": piano, "indice": indice, "out": str(out), "cache": str(Path(d) / "cache"), "sp": [0.5, 0.5], "d": 2.0, "ww": 1000, "wl": 500}), capture_output=True, text=True)
            return json.loads(r.stdout or "{}"), out
        j, out = chiama("sagittale", 15)
        check("1 sagittale: griglia virtuale 8 fette × 64, sp_x 0,5, sp_y 2", j.get("ok") and j["righe_virtuali"] == 8 and j["colonne_virtuali"] == 64 and j["sp_x"] == 0.5 and j["sp_y"] == 2.0, j)
        check("2 PNG isotropo: 64 × 32 (8 fette × 2 mm / 0,5 mm)", j.get("larghezza") == 64 and j.get("altezza") == 32, j)
        img = np.asarray(Image.open(out))
        # nel PNG capovolto le fette z∈[2,6) stanno nelle righe [32-6*4, 32-2*4) = [8,24); colonne y∈[20,40)
        chiaro = img[8:24, 20:40].mean(); scuro = img[8:24, 0:10].mean(); sotto = img[26:32, 20:40].mean()
        check("3 sagittale a x=15: rettangolo chiaro dove atteso, scuro altrove", chiaro > 200 and scuro < 60 and sotto < 60, (chiaro, scuro, sotto))
        j2, out2 = chiama("sagittale", 40)
        img2 = np.asarray(Image.open(out2))
        check("4 sagittale a x=40 (fuori dal blocco): tutto scuro", img2.mean() < 60, img2.mean())
        j3, out3 = chiama("coronale", 25)
        img3 = np.asarray(Image.open(out3))
        check("5 coronale a y=25: chiaro in x∈[10,30), scuro fuori", img3[8:24, 10:30].mean() > 200 and img3[8:24, 40:60].mean() < 60, (img3[8:24, 10:30].mean(), img3[8:24, 40:60].mean()))
        check("6 conteggi: 64 sagittali, 64 coronali, 8 fette", j3.get("n_sagittale") == 64 and j3.get("n_coronale") == 64 and j3.get("n_fette") == 8)
        check("7 cache del volume creata", any(p.name.startswith("vol-") for p in (Path(d) / "cache").iterdir()))
        j4, _ = chiama("sagittale", 999)
        check("8 indice fuori → errore", j4.get("errore") == "indice", j4)
        r = subprocess.run([sys.executable, str(QUI / "mpr.py")], input=json.dumps({"file": file[:2], "piano": "sagittale", "indice": 1, "out": str(Path(d) / "x.png"), "cache": str(Path(d) / "cache"), "sp": [0.5, 0.5], "d": 2.0}), capture_output=True, text=True)
        check("9 meno di 3 fette → serie_non_ricostruibile", json.loads(r.stdout).get("errore") == "serie_non_ricostruibile", r.stdout)
    print(f"{'TUTTO OK' if not falliti else f'{falliti} FALLITI'} (9)")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(main())
