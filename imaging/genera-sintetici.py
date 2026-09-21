#!/usr/bin/env python3
"""DICOM sintetici per le prove end-to-end del righello (nessun dato di paziente).

    ~/.referralflow-imaging/bin/python imaging/genera-sintetici.py <cartella>

Scrive in <cartella>:
  eco.dcm       ecografia 800×600, una regione 2D 0,02 cm/px (0,2 mm/px), barre lunghe 100 e 200 px
  tac.dcm       TAC 512×512, PixelSpacing 0,5 mm, Rescale 1/0
  cr.dcm        radiografia con solo ImagerPixelSpacing (non misurabile)
  derivata.dcm  TAC con ImageType DERIVED (CAUTION)
  dicom-serie/  8 fette assiali 64×64, 0,5 mm, passo REALE 2 mm (Slice Thickness 3 apposta,
                InstanceNumber al contrario apposta), con un blocco chiaro fra le fette 2 e 5
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, generate_uid


def base(mod, righe, colonne, sop, descrizione, bit=8):
    meta = FileMetaDataset(); meta.MediaStorageSOPClassUID = sop; meta.MediaStorageSOPInstanceUID = generate_uid(); meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = pydicom.FileDataset("x", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = sop; ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid(); ds.SeriesInstanceUID = generate_uid()
    ds.PatientName = "PROVA^RIGHELLO"; ds.PatientID = "RIGHELLO-0"; ds.PatientBirthDate = "19000101"
    ds.StudyDate = "20260919"; ds.StudyDescription = descrizione; ds.SeriesDescription = "prova"; ds.Modality = mod
    ds.Rows = righe; ds.Columns = colonne; ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = bit; ds.BitsStored = bit; ds.HighBit = bit - 1; ds.PixelRepresentation = 0
    return ds


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__); return 2
    d = Path(sys.argv[1]); (d / "dicom-serie").mkdir(parents=True, exist_ok=True)

    def barre(righe, colonne):
        a = np.full((righe, colonne), 40, dtype=np.uint8)
        a[righe // 2 - 2:righe // 2 + 2, 200:300] = 255
        a[100:300, 400:404] = 255
        return a

    us = base("US", 600, 800, pydicom.uid.UltrasoundImageStorage, "Prova righello sintetica"); us.PixelData = barre(600, 800).tobytes()
    r = Dataset(); r.RegionSpatialFormat = 1; r.RegionDataType = 1
    r.RegionLocationMinX0 = 50; r.RegionLocationMinY0 = 30; r.RegionLocationMaxX1 = 750; r.RegionLocationMaxY1 = 570
    r.PhysicalUnitsXDirection = 3; r.PhysicalUnitsYDirection = 3; r.PhysicalDeltaX = 0.02; r.PhysicalDeltaY = 0.02
    us.SequenceOfUltrasoundRegions = Sequence([r]); us.save_as(str(d / "eco.dcm"), enforce_file_format=True)

    ct = base("CT", 512, 512, pydicom.uid.CTImageStorage, "Prova righello sintetica"); ct.PixelData = barre(512, 512).tobytes()
    ct.PixelSpacing = [0.5, 0.5]; ct.RescaleIntercept = 0; ct.RescaleSlope = 1; ct.save_as(str(d / "tac.dcm"), enforce_file_format=True)

    cr = base("CR", 400, 400, pydicom.uid.ComputedRadiographyImageStorage, "Prova righello CR"); cr.PixelData = np.full((400, 400), 40, dtype=np.uint8).tobytes()
    cr.ImagerPixelSpacing = [0.1, 0.1]; cr.save_as(str(d / "cr.dcm"), enforce_file_format=True)

    de = base("CT", 256, 256, pydicom.uid.CTImageStorage, "Prova righello derivata"); de.PixelData = np.full((256, 256), 40, dtype=np.uint8).tobytes()
    de.PixelSpacing = [0.5, 0.5]; de.ImageType = ["DERIVED", "SECONDARY", "MPR"]; de.save_as(str(d / "derivata.dcm"), enforce_file_format=True)

    study, series = generate_uid(), generate_uid()
    for z in range(8):
        s = base("CT", 64, 64, pydicom.uid.CTImageStorage, "Prova righello serie", bit=16)
        s.StudyInstanceUID = study; s.SeriesInstanceUID = series; s.PatientName = "PROVA^SERIE"; s.PatientID = "SERIE-0"; s.StudyDate = "20260920"; s.SeriesDescription = "assiale sintetica"
        s.RescaleSlope = 1; s.RescaleIntercept = -1024; s.RescaleType = "HU"; s.PixelSpacing = [0.5, 0.5]; s.SliceThickness = 3.0
        s.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]; s.ImagePositionPatient = [0, 0, z * 2.0]; s.FrameOfReferenceUID = "9.9.9"; s.InstanceNumber = 8 - z
        a = np.full((64, 64), 1024, dtype=np.uint16)
        if 2 <= z < 6: a[20:40, 10:30] = 2024
        s.PixelData = a.tobytes(); s.save_as(str(d / "dicom-serie" / f"z{z}.dcm"), enforce_file_format=True)
    print(f"sintetici in {d}: eco, tac, cr, derivata, dicom-serie (8 fette)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
