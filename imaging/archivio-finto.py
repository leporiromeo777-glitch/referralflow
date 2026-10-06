#!/usr/bin/env python3
"""Un archivio DICOM FINTO per le prove (6.10.2026): risponde a C-ECHO, C-FIND
(per studio) e C-MOVE come farebbe il software dello studio, con cinque esami
inventati. Nessun dato di pazienti.

    python archivio-finto.py --porta 11150 --ae ARCHIVIOPROVA --dest REFERRALFLOW=127.0.0.1:11113

Dentro, apposta: due esami della stessa persona, uno della stessa persona col
cognome battuto male sull'apparecchio, un omonimo con un'altra data di
nascita, e un'altra persona nata lo stesso giorno.
"""
from __future__ import annotations

import argparse
import fnmatch
import sys

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

ESAMI = [  # nome, nascita, id, modalità, data, descrizione, immagini
    ("PROVARCHIVIO^ANNA", "19500101", "PA-1", "US", "20260301", "Ecocardiogramma di prova", 2),
    ("PROVARCHIVIO^ANNA", "19500101", "PA-1", "CT", "20250110", "TAC di prova", 1),
    ("PROVARCHIVVIO^ANNA", "19500101", "PA-1B", "US", "20240505", "Eco col cognome battuto male", 1),
    ("PROVARCHIVIO^ANNA", "19620202", "PA-2", "US", "20260215", "Eco dell'omonima", 1),
    ("ALTRAPROVA^LUCA", "19500101", "PA-3", "US", "20260220", "Eco di un altro nato lo stesso giorno", 1),
]


def costruisci():
    studi = []
    for nome, nascita, pid, mod, data, descr, n in ESAMI:
        study, series = generate_uid(), generate_uid()
        sop = pydicom.uid.UltrasoundImageStorage if mod == "US" else pydicom.uid.CTImageStorage
        immagini = []
        for k in range(n):
            meta = FileMetaDataset(); meta.MediaStorageSOPClassUID = sop; meta.MediaStorageSOPInstanceUID = generate_uid(); meta.TransferSyntaxUID = ExplicitVRLittleEndian
            ds = pydicom.FileDataset("x", {}, file_meta=meta, preamble=b"\0" * 128)
            ds.SOPClassUID = sop; ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
            ds.StudyInstanceUID = study; ds.SeriesInstanceUID = series
            ds.PatientName = nome; ds.PatientID = pid; ds.PatientBirthDate = nascita
            ds.StudyDate = data; ds.StudyTime = "101500"; ds.StudyDescription = descr; ds.SeriesDescription = "prova"; ds.Modality = mod
            ds.InstanceNumber = k + 1; ds.SeriesNumber = 1
            ds.Rows = 64; ds.Columns = 64; ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = "MONOCHROME2"
            ds.BitsAllocated = 8; ds.BitsStored = 8; ds.HighBit = 7; ds.PixelRepresentation = 0
            if mod == "CT":
                ds.PixelSpacing = [0.5, 0.5]; ds.RescaleIntercept = 0; ds.RescaleSlope = 1
            ds.PixelData = np.full((64, 64), 40 + 20 * k, dtype=np.uint8).tobytes()
            immagini.append(ds)
        studi.append({"StudyInstanceUID": study, "PatientName": nome, "PatientBirthDate": nascita, "PatientID": pid,
                      "ModalitiesInStudy": mod, "StudyDate": data, "StudyTime": "101500", "StudyDescription": descr,
                      "NumberOfStudyRelatedSeries": "1", "NumberOfStudyRelatedInstances": str(n), "immagini": immagini})
    return studi


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=11150)
    ap.add_argument("--ae", default="ARCHIVIOPROVA")
    ap.add_argument("--dest", action="append", default=[], help="AE=host:porta (le destinazioni che l'archivio conosce)")
    a = ap.parse_args()
    destinazioni = {}
    for d in a.dest:
        nome, _, dove = d.partition("=")
        host, _, porta = dove.partition(":")
        destinazioni[nome.strip().upper()] = (host, int(porta))

    from pynetdicom import AE, StoragePresentationContexts, evt
    from pynetdicom.sop_class import (StudyRootQueryRetrieveInformationModelFind as FIND,
                                      StudyRootQueryRetrieveInformationModelMove as MOVE, Verification)
    studi = costruisci()

    def corrisponde(s, q) -> bool:
        nome = str(getattr(q, "PatientName", "") or "")
        if nome and not fnmatch.fnmatchcase(s["PatientName"].upper(), nome.upper()): return False
        for k in ("PatientBirthDate", "PatientID", "StudyInstanceUID"):
            v = str(getattr(q, k, "") or "")
            if v and v != s[k]: return False
        data = str(getattr(q, "StudyDate", "") or "")
        if data:
            dal, _, al = data.partition("-") if "-" in data else (data, "", data)
            if (dal and s["StudyDate"] < dal) or (al and s["StudyDate"] > al): return False
        return True

    def su_find(event):
        q = event.identifier
        for s in studi:
            if event.is_cancelled:
                yield 0xFE00, None; return
            if not corrisponde(s, q): continue
            r = Dataset(); r.QueryRetrieveLevel = "STUDY"; r.RetrieveAETitle = a.ae
            for k, v in s.items():
                if k != "immagini": setattr(r, k, v)
            yield 0xFF00, r

    def su_move(event):
        dove = destinazioni.get(str(event.move_destination or "").strip().upper())
        if not dove:
            yield None, None; return
        uid = str(getattr(event.identifier, "StudyInstanceUID", "") or "")
        scelte = [i for s in studi if s["StudyInstanceUID"] == uid for i in s["immagini"]]
        yield dove[0], dove[1]
        yield len(scelte)
        for ds in scelte:
            if event.is_cancelled:
                yield 0xFE00, None; return
            yield 0xFF00, ds

    ae = AE(ae_title=a.ae)
    ae.add_supported_context(Verification); ae.add_supported_context(FIND); ae.add_supported_context(MOVE)
    ae.requested_contexts = StoragePresentationContexts[:120]
    print(f"archivio finto in ascolto: ae={a.ae} porta={a.porta} esami={len(studi)} destinazioni={len(destinazioni)}", flush=True)
    ae.start_server(("127.0.0.1", a.porta), block=True, evt_handlers=[(evt.EVT_C_FIND, su_find), (evt.EVT_C_MOVE, su_move), (evt.EVT_C_ECHO, lambda e: 0x0000)])
    return 0


if __name__ == "__main__":
    try: sys.exit(main())
    except KeyboardInterrupt: sys.exit(0)
