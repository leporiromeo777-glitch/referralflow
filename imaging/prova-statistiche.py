#!/usr/bin/env python3
"""Verifica delle statistiche ROI (MSE fase 4) su TAC/RM sintetiche con valori noti.

    ~/.referralflow-imaging/bin/python imaging/prova-statistiche.py
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

QUI = Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
from statistiche import maschera, statistiche_di  # noqa: E402


def base(mod, righe, colonne, valori, frame=1, campioni=1):
    meta = FileMetaDataset(); meta.MediaStorageSOPClassUID = pydicom.uid.CTImageStorage; meta.MediaStorageSOPInstanceUID = generate_uid(); meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = pydicom.FileDataset("x", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID; ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid(); ds.SeriesInstanceUID = generate_uid(); ds.PatientName = "PROVA^SINTETICA"; ds.PatientID = "0"
    ds.Modality = mod; ds.Rows = righe; ds.Columns = colonne; ds.SamplesPerPixel = campioni
    ds.PhotometricInterpretation = "RGB" if campioni == 3 else "MONOCHROME2"
    ds.BitsAllocated = 16; ds.BitsStored = 16; ds.HighBit = 15; ds.PixelRepresentation = 0
    if campioni == 3:
        ds.BitsAllocated = 8; ds.BitsStored = 8; ds.HighBit = 7; ds.PlanarConfiguration = 0
    if frame > 1: ds.NumberOfFrames = frame
    ds.PixelData = valori.tobytes(); return ds


def main() -> int:
    falliti = 0
    def check(nome, ok, extra=""):
        nonlocal falliti
        print(f"  {'ok ' if ok else 'NO '} {nome}{(' — ' + str(extra)[:300]) if extra and not ok else ''}")
        if not ok: falliti += 1
    print("prova-statistiche")
    # TAC 200×200: fondo 1024 (→ 0 HU), quadrato [50:150) = 1124 (→ 100 HU), pixel (60,60) = 1224 (→ 200 HU)
    a = np.full((200, 200), 1024, dtype=np.uint16); a[50:150, 50:150] = 1124; a[60, 60] = 1224
    ct = base("CT", 200, 200, a); ct.RescaleSlope = 1; ct.RescaleIntercept = -1024; ct.RescaleType = "HU"
    r = statistiche_di(ct, 0, "rettangolo", [{"x": 50, "y": 50}, {"x": 150, "y": 150}])
    check("1 rettangolo sul quadrato: n = 10000, HU media ≈ 100,01, min 100, max 200", r["stato"] == "ok" and r["unita"] == "HU" and r["n"] == 10000 and r["min"] == 100 and r["max"] == 200 and abs(r["media"] - 100.01) < 1e-9, r)
    check("2 il secondo calcolo coincide", r["verifica"]["coincide"] and r["verifica"]["n"] == 10000)
    r = statistiche_di(ct, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 40, "y": 40}])
    check("3 rettangolo sul fondo: media 0 HU, deviazione 0", r["stato"] == "ok" and r["media"] == 0 and r["deviazione"] == 0 and r["n"] == 1600, r)
    r = statistiche_di(ct, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 100, "y": 100}])
    # 10000 pixel: 7500 a 0, 2499 a 100, 1 a 200 → media = (249900+200)/10000 = 25,01
    check("4 rettangolo a cavallo: media 25,01 HU", r["stato"] == "ok" and abs(r["media"] - 25.01) < 1e-9 and r["n"] == 10000, r)
    check("5 deviazione = radice della varianza di popolazione", abs(r["deviazione"] - math.sqrt(sum((v - 25.01) ** 2 for v in [0] * 7500 + [100] * 2499 + [200]) / 10000)) < 1e-9)
    # ellisse: conteggio dei pixel ≈ area (πab) entro l'1 % su un'ellisse grande
    m = maschera("ellisse", [{"x": 10, "y": 10}, {"x": 190, "y": 110}], 200, 200)
    check("6 maschera ellittica: pixel ≈ π·90·50 entro 1 %", abs(int(m.sum()) - math.pi * 90 * 50) / (math.pi * 90 * 50) < 0.01, int(m.sum()))
    # poligono: triangolo rettangolo (0,0)-(100,0)-(0,100): area 5000 → pixel ≈ 5000 entro 1 %
    m = maschera("poligono", [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 0, "y": 100}], 200, 200)
    check("7 maschera poligonale: triangolo con centri dei pixel = 4950 esatti (i pixel sulla diagonale contano metà)", int(m.sum()) == 4950, int(m.sum()))
    r = statistiche_di(ct, 0, "poligono", [{"x": 50, "y": 50}, {"x": 150, "y": 50}, {"x": 150, "y": 150}, {"x": 50, "y": 150}])
    check("8 poligono quadrato = rettangolo: stesso n e media", r["stato"] == "ok" and r["n"] == 10000 and abs(r["media"] - 100.01) < 1e-9, r)
    # RM: unità arbitrarie
    b = np.full((50, 50), 300, dtype=np.uint16); mr = base("MR", 50, 50, b)
    r = statistiche_di(mr, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 50, "y": 50}])
    check("9 RM senza rescale: a.u., valori grezzi, avviso", r["stato"] == "ok" and r["unita"] == "a.u." and r["media"] == 300 and "rescale_assente_valori_grezzi" in r["avvisi"], r)
    # TAC senza rescale: niente HU
    ct2 = base("CT", 50, 50, b)
    check("10 TAC senza Rescale → hu_non_disponibili", statistiche_di(ct2, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 10, "y": 10}])["stato"] == "hu_non_disponibili")
    ct3 = base("CT", 50, 50, b); ct3.RescaleSlope = 1; ct3.RescaleIntercept = 0; ct3.RescaleType = "OD"
    check("11 TAC con RescaleType diverso da HU → hu_non_disponibili", statistiche_di(ct3, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 10, "y": 10}])["stato"] == "hu_non_disponibili")
    # US e colore: rifiutate
    us = base("US", 50, 50, b)
    check("12 ecografia → statistiche_non_applicabili", statistiche_di(us, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 10, "y": 10}])["stato"] == "statistiche_non_applicabili")
    rgb = base("CT", 20, 20, np.zeros((20, 20, 3), dtype=np.uint8), campioni=3); rgb.RescaleSlope = 1; rgb.RescaleIntercept = 0
    check("13 immagine a colori → statistiche_non_applicabili", statistiche_di(rgb, 0, "rettangolo", [{"x": 0, "y": 0}, {"x": 10, "y": 10}])["stato"] == "statistiche_non_applicabili")
    # multiframe: il fotogramma giusto
    c = np.stack([np.full((20, 20), 1024 + k * 10, dtype=np.uint16) for k in range(3)]); mf = base("CT", 20, 20, c, frame=3); mf.RescaleSlope = 1; mf.RescaleIntercept = -1024
    r = statistiche_di(mf, 2, "rettangolo", [{"x": 0, "y": 0}, {"x": 20, "y": 20}])
    check("14 multiframe: fotogramma 2 → 20 HU", r["stato"] == "ok" and r["media"] == 20, r)
    check("15 fotogramma inesistente → rifiuto", statistiche_di(mf, 5, "rettangolo", [{"x": 0, "y": 0}, {"x": 5, "y": 5}])["stato"] == "fotogramma_non_valido")
    check("16 ROI vuota (fuori immagine) → roi_vuota", statistiche_di(ct, 0, "rettangolo", [{"x": 300, "y": 300}, {"x": 310, "y": 310}])["stato"] == "roi_vuota")
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "ct.dcm"; ct.save_as(str(f), enforce_file_format=True)
        out = subprocess.run([sys.executable, str(QUI / "leggi-dicom.py"), "statistiche", str(f), "--tipo", "rettangolo", "--punti", json.dumps([{"x": 50, "y": 50}, {"x": 150, "y": 150}])], capture_output=True, text=True)
        jj = json.loads(out.stdout or "{}")
        check("17 comando statistiche", out.returncode == 0 and jj.get("unita") == "HU" and jj.get("n") == 10000, out.stdout[:200])
    print(f"{'TUTTO OK' if not falliti else f'{falliti} FALLITI'} (17)")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(main())
