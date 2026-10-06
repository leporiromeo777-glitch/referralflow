#!/usr/bin/env python3
"""Cercare e chiedere esami all'archivio dello studio (6.10.2026).

L'archivio resta dov'è (il software Philips): la piattaforma chiede «che esami
hai di questa persona?» (C-FIND) e, quando qualcuno ne apre uno, «mandamelo»
(C-MOVE verso la nostra ricezione, `ricevi-dicom.py`). Niente di più.

    echo '{"azione": "eco", "host": "…", "porta": 104, "ae_archivio": "…", "ae_nostro": "REFERRALFLOW"}' | python archivio-dicom.py

Azioni (richiesta JSON su stdin, risposta JSON su stdout):
  eco     C-ECHO: l'archivio risponde?
  trova   C-FIND a livello di studio. `filtri`: nome (già in forma DICOM, coi
          caratteri jolly), nascita, id, dal, al (AAAAMMGG), study_uid.
          Al massimo `massimo` risposte, poi si annulla la ricerca.
  sposta  C-MOVE dello studio `study_uid` verso `destinazione` (il nostro AE).

Qui non si scrive niente su disco e non si registra niente: le risposte
contengono nomi di pazienti e vanno solo a chi ha chiamato.
"""
from __future__ import annotations

import json
import sys

CAMPI = ("StudyInstanceUID", "StudyDate", "StudyTime", "StudyDescription", "ModalitiesInStudy", "AccessionNumber",
         "PatientName", "PatientBirthDate", "PatientID", "PatientSex",
         "NumberOfStudyRelatedSeries", "NumberOfStudyRelatedInstances", "ReferringPhysicianName", "InstitutionName")

# Che cosa vuol dire lo stato finale di un C-MOVE, in parole nostre.
MOTIVI = {
    0xA801: "destinazione_sconosciuta",   # l'archivio non conosce il nostro AE
    0xA701: "archivio_senza_risorse", 0xA702: "archivio_senza_risorse",
    0xA900: "richiesta_non_capita", 0xC000: "archivio_in_errore",
    0xFE00: "annullato", 0xB000: "alcune_immagini_non_arrivate",
}


def testo(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (list, tuple)) or v.__class__.__name__ == "MultiValue":
        return "\\".join(str(x) for x in v)
    return str(v).strip()


def main() -> int:
    try:
        r = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        print(json.dumps({"errore": "richiesta_illeggibile"})); return 2
    azione = r.get("azione")
    host, porta = str(r.get("host") or ""), int(r.get("porta") or 104)
    ae_archivio, ae_nostro = str(r.get("ae_archivio") or ""), str(r.get("ae_nostro") or "REFERRALFLOW")
    if not host or not ae_archivio or azione not in ("eco", "trova", "sposta"):
        print(json.dumps({"errore": "richiesta_incompleta"})); return 2

    import logging
    logging.getLogger("pynetdicom").setLevel(logging.CRITICAL)   # i log di pynetdicom citano gli identificativi
    from pydicom.dataset import Dataset
    from pynetdicom import AE
    from pynetdicom.sop_class import (StudyRootQueryRetrieveInformationModelFind as FIND,
                                      StudyRootQueryRetrieveInformationModelMove as MOVE, Verification)

    ae = AE(ae_title=ae_nostro)
    ae.acse_timeout = 10
    ae.network_timeout = 15
    ae.dimse_timeout = int(r.get("attesa") or (900 if azione == "sposta" else 45))
    ae.add_requested_context({"eco": Verification, "trova": FIND, "sposta": MOVE}[azione])
    try:
        a = ae.associate(host, porta, ae_title=ae_archivio)
    except Exception:  # noqa: BLE001
        print(json.dumps({"errore": "non_raggiungibile"})); return 0
    if not a.is_established:
        print(json.dumps({"errore": "rifiutato" if a.is_rejected else "non_raggiungibile"})); return 0

    try:
        if azione == "eco":
            st = a.send_c_echo()
            print(json.dumps({"ok": bool(st) and st.Status == 0x0000}))
            return 0

        if azione == "trova":
            f = r.get("filtri") or {}
            d = Dataset()
            d.QueryRetrieveLevel = "STUDY"
            for k in CAMPI:
                setattr(d, k, "")
            if f.get("nome"): d.PatientName = str(f["nome"])
            if f.get("nascita"): d.PatientBirthDate = str(f["nascita"])
            if f.get("id"): d.PatientID = str(f["id"])
            if f.get("study_uid"): d.StudyInstanceUID = str(f["study_uid"])
            if f.get("dal") or f.get("al"): d.StudyDate = f"{f.get('dal') or ''}-{f.get('al') or ''}"
            massimo = max(1, min(500, int(r.get("massimo") or 200)))
            studi, troncata, stato = [], False, None
            for st, ident in a.send_c_find(d, FIND):
                if st is None:
                    stato = "nessuna_risposta"; break
                stato = st.Status
                if st.Status in (0xFF00, 0xFF01) and ident is not None:
                    if len(studi) >= massimo:
                        troncata = True
                        try: a.send_c_cancel(1, None, query_model=FIND)
                        except Exception: pass  # noqa: BLE001,E701
                        break
                    studi.append({k: testo(getattr(ident, k, "")) for k in CAMPI})
            ok = troncata or stato == 0x0000
            print(json.dumps({"ok": ok, "studi": studi, "troncata": troncata,
                              **({} if ok else {"errore": "ricerca_rifiutata", "stato": stato if isinstance(stato, str) else hex(stato or 0)})}))
            return 0

        # sposta
        uid = str(r.get("study_uid") or "")
        if not uid or not all(c.isdigit() or c == "." for c in uid) or len(uid) > 64:
            print(json.dumps({"errore": "study_uid"})); return 2
        d = Dataset(); d.QueryRetrieveLevel = "STUDY"; d.StudyInstanceUID = uid
        ultimo, fatti, falliti, avvisi = None, 0, 0, 0
        for st, _ in a.send_c_move(d, str(r.get("destinazione") or ae_nostro), MOVE):
            if st is None:
                break
            ultimo = st.Status
            fatti = int(getattr(st, "NumberOfCompletedSuboperations", fatti) or 0)
            falliti = int(getattr(st, "NumberOfFailedSuboperations", falliti) or 0)
            avvisi = int(getattr(st, "NumberOfWarningSuboperations", avvisi) or 0)
        if ultimo is None:
            print(json.dumps({"errore": "nessuna_risposta"})); return 0
        ok = ultimo in (0x0000, 0xB000) and fatti + avvisi > 0
        print(json.dumps({"ok": ok, "completate": fatti, "fallite": falliti, "avvisi": avvisi, "stato": hex(ultimo),
                          **({} if ok else {"errore": MOTIVI.get(ultimo, "niente_da_mandare" if ultimo == 0x0000 else "archivio_in_errore")})}))
        return 0
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"errore": "inatteso", "tipo": type(e).__name__})); return 0
    finally:
        try: a.release()
        except Exception: pass  # noqa: BLE001,E701


if __name__ == "__main__":
    sys.exit(main())
