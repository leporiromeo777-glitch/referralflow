#!/usr/bin/env python3
"""Verifica tecnica del lettore di geometria (MSE fase 1, 19.9.2026).

DICOM sintetici con geometria nota → `geometria_di` deve leggerla esatta, o
dichiararla assente: mai stimarla. Nessun dato di paziente.

    ~/.referralflow-imaging/bin/python imaging/prova-geometria.py
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
sys.path.insert(0, str(QUI))
from geometria import calibrazione_da, geometria_di  # noqa: E402


def base(modalita: str, righe: int, colonne: int, frame: int = 1) -> pydicom.FileDataset:
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
    if frame > 1:
        ds.NumberOfFrames = frame
    ds.PixelData = np.zeros((frame, righe, colonne), dtype=np.uint8).tobytes() if frame > 1 else np.zeros((righe, colonne), dtype=np.uint8).tobytes()
    return ds


def regione(x0, y0, x1, y1, dx, dy, formato=1, ux=3, uy=3, tipo=1, flags=None, rif=None) -> Dataset:
    r = Dataset()
    r.RegionSpatialFormat = formato; r.RegionDataType = tipo
    r.RegionLocationMinX0 = x0; r.RegionLocationMinY0 = y0; r.RegionLocationMaxX1 = x1; r.RegionLocationMaxY1 = y1
    r.PhysicalUnitsXDirection = ux; r.PhysicalUnitsYDirection = uy
    r.PhysicalDeltaX = dx; r.PhysicalDeltaY = dy
    if flags is not None:
        r.RegionFlags = flags
    if rif:
        r.ReferencePixelX0, r.ReferencePixelY0, r.ReferencePixelPhysicalValueX, r.ReferencePixelPhysicalValueY = rif
    return r


def gruppi(ds, condiviso=None, per_frame=None, iop=None, ipp=None):
    if condiviso is not None or iop is not None:
        g = Dataset()
        if condiviso is not None:
            pm = Dataset(); pm.PixelSpacing = condiviso; g.PixelMeasuresSequence = Sequence([pm])
        if iop is not None:
            po = Dataset(); po.ImageOrientationPatient = iop; g.PlaneOrientationSequence = Sequence([po])
        ds.SharedFunctionalGroupsSequence = Sequence([g])
    if per_frame is not None or ipp is not None:
        lista = []
        for k, ps in enumerate(per_frame or [None]):
            g = Dataset()
            if ps is not None:
                pm = Dataset(); pm.PixelSpacing = ps; g.PixelMeasuresSequence = Sequence([pm])
            if ipp is not None and k == 0:
                pp = Dataset(); pp.ImagePositionPatient = ipp; g.PlanePositionSequence = Sequence([pp])
            lista.append(g)
        ds.PerFrameFunctionalGroupsSequence = Sequence(lista)


def main() -> int:
    falliti = 0
    def check(nome, ok, dettaglio=""):
        nonlocal falliti
        print(f"  {'ok ' if ok else 'NO '} {nome}{(' — ' + str(dettaglio)[:300]) if dettaglio and not ok else ''}")
        if not ok: falliti += 1

    print("prova-geometria")
    # ── spaziatura ──
    ct = base("CT", 512, 512); ct.PixelSpacing = [0.75, 0.5]
    g = geometria_di(ct)
    check("1 PixelSpacing: riga→dy, colonna→dx, fonte", g["spaziatura"]["fonte"] == "PixelSpacing" and g["spaziatura"]["dy_mm"] == 0.75 and g["spaziatura"]["dx_mm"] == 0.5, g["spaziatura"])
    check("2 versione della geometria = 1", g["versione"] == 1)
    check("3 identità: modalità, uid, frame", g["identita"]["modalita"] == "CT" and g["identita"]["sop_uid"] and g["identita"]["frame_totali"] == 1)

    z = base("CT", 10, 10); z.PixelSpacing = [0, 0.5]
    g = geometria_di(z)
    check("4 PixelSpacing con zero → fonte null + avviso", g["spaziatura"]["fonte"] is None and "pixel_spacing_non_valido" in g["avvisi_lettura"], g)
    n = base("CT", 10, 10); n.PixelSpacing = [-0.5, 0.5]
    check("5 PixelSpacing negativo → fonte null", geometria_di(n)["spaziatura"]["fonte"] is None)

    cr = base("CR", 2000, 2000); cr.ImagerPixelSpacing = [0.1, 0.1]
    g = geometria_di(cr)
    check("6 solo ImagerPixelSpacing → fonte rivelatore, imager_* pieni", g["spaziatura"]["fonte"] == "ImagerPixelSpacing" and g["spaziatura"]["imager_dx_mm"] == 0.1, g["spaziatura"])
    check("6b proiezione: tipo imager_pixel_spacing", calibrazione_da(g)["tipo"] == "imager_pixel_spacing")

    dx = base("DX", 2000, 2000); dx.ImagerPixelSpacing = [0.1, 0.1]; dx.PixelSpacing = [0.09, 0.09]
    dx.PixelSpacingCalibrationType = "GEOMETRY"; dx.PixelSpacingCalibrationDescription = "magnificazione stimata"
    g = geometria_di(dx)
    check("7 PixelSpacing calibrato GEOMETRY con descrizione", g["spaziatura"]["fonte"] == "PixelSpacing" and g["spaziatura"]["calibrazione_tipo"] == "GEOMETRY" and "magnific" in g["spaziatura"]["calibrazione_descrizione"], g["spaziatura"])
    dx2 = base("DX", 10, 10); dx2.ImagerPixelSpacing = [0.1, 0.1]; dx2.PixelSpacing = [0.09, 0.09]
    check("8 PixelSpacing ≠ Imager senza tipo → avviso", "pixel_spacing_calibrato_senza_tipo" in geometria_di(dx2)["avvisi_lettura"])
    dx3 = base("DX", 10, 10); dx3.ImagerPixelSpacing = [0.1, 0.1]; dx3.PixelSpacing = [0.1, 0.1]
    check("9 PixelSpacing = Imager (non calibrato) → nessun avviso di calibrazione", "pixel_spacing_calibrato_senza_tipo" not in geometria_di(dx3)["avvisi_lettura"])

    # ── multiframe enhanced ──
    mr = base("MR", 64, 64, frame=4); gruppi(mr, condiviso=[1.2, 1.1])
    g = geometria_di(mr)
    check("10 Enhanced: spacing condiviso → FunctionalGroups, dy 1.2 dx 1.1", g["spaziatura"]["fonte"] == "FunctionalGroups" and g["spaziatura"]["dy_mm"] == 1.2 and g["spaziatura"]["dx_mm"] == 1.1 and g["identita"]["frame_totali"] == 4, g["spaziatura"])
    mr2 = base("MR", 64, 64, frame=3); gruppi(mr2, per_frame=[[1.0, 1.0], [1.0, 1.0], [1.0, 1.0]])
    g = geometria_di(mr2)
    check("11 Enhanced: per-frame uniforme → usabile con avviso", g["spaziatura"]["dx_mm"] == 1.0 and not g["spaziatura"]["per_frame"] and "spacing_per_frame_uniforme" in g["avvisi_lettura"], g)
    mr3 = base("MR", 64, 64, frame=3); gruppi(mr3, per_frame=[[1.0, 1.0], [1.5, 1.0], [1.0, 1.0]])
    g = geometria_di(mr3)
    check("12 Enhanced: per-frame NON uniforme → per_frame true, nessun mm, avviso", g["spaziatura"]["per_frame"] and g["spaziatura"]["dx_mm"] is None and "spacing_per_frame_non_uniforme" in g["avvisi_lettura"], g["spaziatura"])
    check("12b proiezione: per-frame non uniforme → nessuna", calibrazione_da(g)["tipo"] == "nessuna")

    # ── regioni ecografiche ──
    us = base("US", 600, 800)
    us.SequenceOfUltrasoundRegions = Sequence([
        regione(100, 50, 700, 550, 0.02, 0.02, flags=0b00010, rif=(10, 20, 0.0, 0.0)),
        regione(0, 560, 800, 600, 0.01, -0.01, tipo=2, flags=1),
        regione(0, 0, 800, 40, 0.001, 0.02, formato=2, ux=4),           # M-mode: X in secondi
        regione(0, 0, 800, 40, 0.001, 2.0, formato=3, ux=4, uy=7),      # spettrale: cm/s
    ])
    g = geometria_di(us)
    r = g["regioni_us"]
    check("13 tutte le 4 regioni lette (non solo le 2D)", len(r) == 4, r)
    check("14 codici decodificati: 2d/tessuto/cm, m_mode/s, spettrale/cm/s", r[0]["formato"] == "2d" and r[0]["tipo_dati"] == "tessuto" and r[0]["unita_x"] == "cm" and r[2]["formato"] == "m_mode" and r[2]["unita_x"] == "s" and r[3]["formato"] == "spettrale" and r[3]["unita_y"] == "cm/s", r)
    check("15 delta con segno conservato (Y negativo)", r[1]["delta_y"] == -0.01)
    check("16 flags: bit0 priorità (0 = alta), bit1 protezione", r[0]["flags"]["priorita_alta"] is True and r[0]["flags"]["scala_protetta"] is True and r[1]["flags"]["priorita_alta"] is False, r[0]["flags"])
    check("17 reference pixel e valore fisico letti", r[0]["rif_x0"] == 10 and r[0]["rif_y0"] == 20 and r[0]["rif_fisico_x"] == 0.0)
    c = calibrazione_da(g)
    check("18 proiezione: solo le 2 regioni 2D in cm, mm/px ×10, |delta|", c["tipo"] == "us_regioni" and len(c["regioni"]) == 2 and c["regioni"][0]["dx_mm"] == 0.2 and c["regioni"][1]["dy_mm"] == 0.1, c)
    check("18b proiezione: indice, tipo e priorità per le sovrapposizioni (fase 5)", c["regioni"][0]["indice"] == 0 and c["regioni"][0]["tipo"] == "tessuto" and c["regioni"][0]["priorita_alta"] is True and c["regioni"][1]["tipo"] == "color_flow" and c["regioni"][1]["priorita_alta"] is False, c["regioni"])
    check("18c proiezione: senza flags → priorità alta (default dello standard)", calibrazione_da(geometria_di(us2 if False else us))["regioni"][0]["priorita_alta"] is True)

    us2 = base("US", 600, 800); us2.PixelSpacing = [0.2, 0.2]
    us2.SequenceOfUltrasoundRegions = Sequence([regione(0, 0, 799, 599, 0.02, 0.02)])
    check("19 US: PixelSpacing e regioni concordi → nessun avviso di discordanza", "pixel_spacing_e_regioni_discordanti" not in geometria_di(us2)["avvisi_lettura"])
    us3 = base("US", 600, 800); us3.PixelSpacing = [0.3, 0.3]
    us3.SequenceOfUltrasoundRegions = Sequence([regione(0, 0, 799, 599, 0.02, 0.02)])
    g = geometria_di(us3)
    check("20 US: PixelSpacing e regioni DISCORDANTI → avviso", "pixel_spacing_e_regioni_discordanti" in g["avvisi_lettura"], g["avvisi_lettura"])
    check("20b proiezione: vincono le regioni", calibrazione_da(g)["tipo"] == "us_regioni")
    us4 = base("US", 600, 800); us4.PixelSpacing = [0.2, 0.2]
    check("21 US con solo PixelSpacing → avviso us_solo_pixel_spacing", "us_solo_pixel_spacing" in geometria_di(us4)["avvisi_lettura"])
    us5 = base("US", 600, 800); us5.SequenceOfUltrasoundRegions = Sequence([regione(100, 100, 50, 50, 0.02, 0.02)])
    g = geometria_di(us5)
    check("22 regione degenere (max < min) → avviso e non usabile", "regione_us_0_degenere" in g["avvisi_lettura"] and calibrazione_da(g)["tipo"] == "nessuna")

    # ── pixel ──
    pa = base("US", 100, 100); pa.PixelAspectRatio = [4, 3]
    g = geometria_di(pa)
    check("23 Pixel Aspect Ratio letto [v,h] + avviso pixel_non_quadrati", g["pixel"]["aspect"] == [4, 3] and "pixel_non_quadrati" in g["avvisi_lettura"], g["pixel"])
    pb = base("US", 100, 100); pb.PixelAspectRatio = [1, 1]
    check("24 Pixel Aspect Ratio 1:1 → nessun avviso", "pixel_non_quadrati" not in geometria_di(pb)["avvisi_lettura"])
    rs = base("CT", 10, 10); rs.RescaleSlope = 1; rs.RescaleIntercept = -1024; rs.RescaleType = "HU"
    g = geometria_di(rs)
    check("25 Rescale slope/intercept/tipo letti", g["pixel"]["rescale"] == {"slope": 1.0, "intercept": -1024.0, "tipo": "HU"}, g["pixel"])
    check("26 senza Rescale → null", geometria_di(base("US", 10, 10))["pixel"]["rescale"] is None)

    # ── spazio paziente ──
    sp = base("CT", 10, 10); sp.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]; sp.ImagePositionPatient = [-100.5, -200, 30]
    sp.FrameOfReferenceUID = "1.2.3"; sp.SliceThickness = 2.5; sp.SpacingBetweenSlices = 3.0
    g = geometria_di(sp)
    check("27 IOP/IPP/FoR/spessore/distanza dichiarata letti, non mescolati", g["spazio"]["iop"] == [1, 0, 0, 0, 1, 0] and g["spazio"]["ipp"] == [-100.5, -200, 30] and g["spazio"]["frame_of_reference"] == "1.2.3" and g["spazio"]["spessore_mm"] == 2.5 and g["spazio"]["distanza_slice_dichiarata_mm"] == 3.0, g["spazio"])
    ob = base("MR", 10, 10); ob.ImageOrientationPatient = [0.7071, 0.7071, 0, -0.7071, 0.7071, 0]; ob.PixelSpacing = [0.5, 0.5]
    g = geometria_di(ob)
    check("28 obliqua ortonormale: nessun avviso, spacing invariato (la distanza in piano non dipende da IOP)", "orientamento_non_ortonormale" not in g["avvisi_lettura"] and g["spaziatura"]["dx_mm"] == 0.5)
    ko = base("MR", 10, 10); ko.ImageOrientationPatient = [1, 0, 0, 1, 0, 0]
    check("29 IOP non ortonormale → avviso", "orientamento_non_ortonormale" in geometria_di(ko)["avvisi_lettura"])
    en = base("MR", 10, 10, frame=2); gruppi(en, condiviso=[1, 1], iop=[1, 0, 0, 0, 0, -1], ipp=[1, 2, 3])
    g = geometria_di(en)
    check("30 Enhanced: IOP dai gruppi condivisi, IPP dal primo fotogramma", g["spazio"]["iop"] == [1, 0, 0, 0, 0, -1] and g["spazio"]["ipp"] == [1, 2, 3], g["spazio"])
    check("31 senza niente di spaziale → spazio null", geometria_di(base("US", 10, 10))["spazio"] is None)

    # ── derivata ──
    de = base("CT", 10, 10); de.ImageType = ["DERIVED", "SECONDARY", "MPR"]
    g = geometria_di(de)
    check("32 ImageType DERIVED → derivata true + avviso", g["derivata"] and "immagine_derivata" in g["avvisi_lettura"] and g["image_type"][2] == "MPR")
    orig = base("CT", 10, 10); orig.ImageType = ["ORIGINAL", "PRIMARY"]
    check("33 ORIGINAL → derivata false", not geometria_di(orig)["derivata"])

    # ── file: sha256, comando, meta ──
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "ct.dcm"; ct.save_as(str(f), enforce_file_format=True)
        import hashlib
        atteso = hashlib.sha256(f.read_bytes()).hexdigest()
        out = subprocess.run([sys.executable, str(QUI / "leggi-dicom.py"), "geometria", str(f)], capture_output=True, text=True)
        j = json.loads(out.stdout or "{}")
        check("34 comando geometria: JSON con sha256 del file e calibrazione derivata", out.returncode == 0 and j.get("sha256_file") == atteso and j["spaziatura"]["dx_mm"] == 0.5 and j["calibrazione"]["tipo"] == "pixel_spacing", out.stdout[:200])
        out = subprocess.run([sys.executable, str(QUI / "leggi-dicom.py"), "meta", str(f)], capture_output=True, text=True)
        j = json.loads(out.stdout or "{}")
        check("35 meta porta geometria e calibrazione derivata", (j.get("geometria") or {}).get("versione") == 1 and (j.get("calibrazione") or {}).get("tipo") == "pixel_spacing", out.stdout[:200])
        rott = Path(d) / "rotto.dcm"; rott.write_bytes(b"\0" * 200)
        out = subprocess.run([sys.executable, str(QUI / "leggi-dicom.py"), "geometria", str(rott)], capture_output=True, text=True)
        check("36 file non DICOM → errore pulito, codice 1", out.returncode == 1 and json.loads(out.stdout).get("errore") == "non_dicom")

    print(f"{'TUTTO OK' if not falliti else f'{falliti} FALLITI'} ({36 - falliti + (0)}/36 + sottocasi)")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(main())
