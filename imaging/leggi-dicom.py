#!/usr/bin/env python3
"""Lettore DICOM della piattaforma (18.9.2026).

ReferralFlow non manda le immagini da nessuna parte: i file restano sul Mac
dello studio, e questo strumento è l'unico che li apre. Fa due cose sole, e le
fa in un processo separato che muore subito dopo — così un file malformato
rovina al massimo la sua richiesta:

    leggi-dicom.py meta <file>                        → JSON dei campi utili
    leggi-dicom.py png <file> --frame N --out f.png   → un fotogramma in PNG
    leggi-dicom.py misure <file>                      → le misure FATTE DALL'APPARECCHIO
    leggi-dicom.py calibrazione <file>                → mm per pixel, per misurare sull'immagine (vista compatta)
    leggi-dicom.py geometria <file>                   → tutta la geometria (fase 1 MSE), con sha256 del file
    leggi-dicom.py statistiche <file> --frame N --tipo rettangolo|ellisse|poligono --punti JSON
                                                      → min/max/media/deviazione dentro la ROI (HU per la TAC), fase 4

Regole:
- **Non stampa mai nulla su stderr che contenga dati del paziente.** I campi
  anagrafici escono solo nel JSON di `meta`, che è il valore di ritorno verso
  la piattaforma (serve ad agganciare l'esame alla cartella), mai nei log.
- Errori: JSON `{"errore": "..."}` con codice d'uscita 1. Mai un traceback in
  faccia all'utente.
- Nessuna rete, nessuna scrittura fuori dal file `--out` richiesto.

Ambiente: il venv in ~/.referralflow-imaging (pydicom, pillow, numpy). Le
versioni sono quelle collaudate dal progetto imaging-server.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MAX_LATO = 2048          # oltre questo il PNG si rimpicciolisce: nessuno guarda 8k su uno schermo
ANTEPRIMA_LATO = 320


def _uscita(dati: dict, codice: int = 0) -> int:
    json.dump(dati, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return codice


def _testo(ds, chiave: str, massimo: int = 200) -> str:
    v = getattr(ds, chiave, None)
    if v is None:
        return ""
    return str(v).strip()[:massimo]


def _data_dicom(v: str) -> str:
    """AAAAMMGG → AAAA-MM-GG; tutto il resto → stringa vuota."""
    v = (v or "").strip()
    if len(v) == 8 and v.isdigit():
        return f"{v[0:4]}-{v[4:6]}-{v[6:8]}"
    return ""


def _nome_persona(v: str) -> str:
    """«ROSSI^MARIO^^^» → «Rossi Mario». Il DICOM usa ^ fra i componenti."""
    pezzi = [p.strip() for p in str(v or "").split("^") if p.strip()]
    if not pezzi:
        return ""
    return " ".join(p.capitalize() if p.isupper() else p for p in pezzi[:2])[:120]


def calibrazione_di(ds) -> dict:
    """Quanti millimetri vale un pixel, e dove — la forma usata dal righello v1.

    Dal 19.9.2026 (fase 1 del Measurement Safety Engine) è una PROIEZIONE di
    `geometria.geometria_di`: una fonte sola, questa è solo la vista compatta.
    Regole (invariate): regioni US solo 2D con cm su entrambi gli assi, ×10;
    PixelSpacing [riga, colonna] → dy, dx; ImagerPixelSpacing riportato ma
    distinto: sul paziente non vale."""
    from geometria import calibrazione_da, geometria_di
    return calibrazione_da(geometria_di(ds))


def comando_geometria(percorso: Path) -> int:
    import pydicom
    from geometria import calibrazione_da, geometria_di

    try:
        ds = pydicom.dcmread(str(percorso), stop_before_pixels=True, force=False)
    except Exception as e:  # noqa: BLE001
        return _uscita({"errore": "non_dicom", "tipo": type(e).__name__}, 1)
    g = geometria_di(ds, percorso)
    g["calibrazione"] = calibrazione_da(g)     # la vista compatta, derivata qui e non altrove
    return _uscita(g)


def comando_calibrazione(percorso: Path) -> int:
    import pydicom

    try:
        ds = pydicom.dcmread(str(percorso), stop_before_pixels=True, force=False)
    except Exception as e:  # noqa: BLE001
        return _uscita({"errore": "non_dicom", "tipo": type(e).__name__}, 1)
    return _uscita(calibrazione_di(ds))


def comando_statistiche(percorso: Path, frame: int, tipo: str, punti_json: str) -> int:
    import pydicom
    from statistiche import statistiche_di

    try:
        punti = json.loads(punti_json)
        assert isinstance(punti, list) and all(isinstance(p, dict) for p in punti)
        punti = [{"x": float(p["x"]), "y": float(p["y"])} for p in punti]
    except Exception:  # noqa: BLE001
        return _uscita({"stato": "punti_non_validi"}, 1)
    try:
        ds = pydicom.dcmread(str(percorso), force=False)
    except Exception as e:  # noqa: BLE001
        return _uscita({"stato": "non_dicom", "tipo": type(e).__name__}, 1)
    try:
        esito = statistiche_di(ds, frame, tipo, punti)
    except ValueError as e:
        return _uscita({"stato": str(e)}, 1)
    return _uscita(esito, 0 if esito.get("stato") == "ok" else 1)


def comando_meta(percorso: Path) -> int:
    import pydicom

    try:
        ds = pydicom.dcmread(str(percorso), stop_before_pixels=True, force=False)
    except Exception as e:  # noqa: BLE001 — qualunque file non DICOM finisce qui
        return _uscita({"errore": "non_dicom", "tipo": type(e).__name__}, 1)

    sop_class = str(getattr(ds, "SOPClassUID", "") or "")
    righe = int(getattr(ds, "Rows", 0) or 0)
    colonne = int(getattr(ds, "Columns", 0) or 0)
    frame = int(getattr(ds, "NumberOfFrames", 1) or 1)
    # Un DICOM può non essere un'immagine: referti strutturati, PDF incapsulati,
    # modelli STL. Vanno archiviati lo stesso, ma non si disegnano.
    immagine = righe > 0 and colonne > 0

    centro, ampiezza = getattr(ds, "WindowCenter", None), getattr(ds, "WindowWidth", None)
    def _primo(x):
        try:
            return float(x[0]) if isinstance(x, (list, tuple)) or hasattr(x, "__getitem__") and not isinstance(x, (str, bytes)) else float(x)
        except Exception:  # noqa: BLE001
            return None

    from geometria import calibrazione_da, geometria_di
    geom = geometria_di(ds, percorso) if immagine else None

    return _uscita({
        "study_uid": _testo(ds, "StudyInstanceUID", 128),
        "series_uid": _testo(ds, "SeriesInstanceUID", 128),
        "sop_uid": _testo(ds, "SOPInstanceUID", 128),
        "sop_class": sop_class,
        "modalita": _testo(ds, "Modality", 16).upper(),
        "data_esame": _data_dicom(_testo(ds, "StudyDate", 16)),
        "ora_esame": _testo(ds, "StudyTime", 16)[:6],
        "descrizione_esame": _testo(ds, "StudyDescription", 200),
        "descrizione_serie": _testo(ds, "SeriesDescription", 200),
        "numero_serie": int(getattr(ds, "SeriesNumber", 0) or 0),
        "numero_immagine": int(getattr(ds, "InstanceNumber", 0) or 0),
        "parte_corpo": _testo(ds, "BodyPartExamined", 64),
        "accession": _testo(ds, "AccessionNumber", 64),
        "istituto": _testo(ds, "InstitutionName", 120),
        "inviante": _nome_persona(_testo(ds, "ReferringPhysicianName", 120)),
        "paziente_nome": _nome_persona(_testo(ds, "PatientName", 120)),
        "paziente_nascita": _data_dicom(_testo(ds, "PatientBirthDate", 16)),
        "paziente_id": _testo(ds, "PatientID", 64),
        "paziente_sesso": _testo(ds, "PatientSex", 4).upper(),
        "righe": righe, "colonne": colonne, "frame": max(1, frame),
        "immagine": immagine,
        "ww": _primo(ampiezza), "wl": _primo(centro),
        "trasferimento": str(getattr(getattr(ds, "file_meta", None), "TransferSyntaxUID", "") or ""),
        "calibrazione": calibrazione_da(geom) if immagine and geom else None,
        "geometria": geom,
    })


def comando_misure(percorso: Path) -> int:
    """Le misure che l'apparecchio ha già fatto, dentro il suo referto
    strutturato (SR).

    ReferralFlow non misura e non deve misurare: una misura fatta dopo, su un
    fotogramma esportato e su uno schermo non tarato, è peggiore di quella che
    l'ecografista ha preso con la sonda in mano sulla console. Ma quella misura
    ESISTE già — viaggia dentro il DICOM e finora la buttavamo via. Qui si
    legge e basta: presentare non è produrre.

    Struttura: l'SR è un albero di CONTAINER; le misure sono i nodi NUM, con
    nome (ConceptNameCodeSequence), valore e unità (MeasuredValueSequence).
    Si tiene anche il contenitore che le raggruppa, perché «Diametro» da solo
    non vuol dire niente e «Aorta ascendente · Diametro» sì."""
    import pydicom

    try:
        ds = pydicom.dcmread(str(percorso), stop_before_pixels=True, force=False)
    except Exception as e:  # noqa: BLE001
        return _uscita({"errore": "non_dicom", "tipo": type(e).__name__}, 1)

    fuori: list[dict] = []

    def nome_di(item) -> str:
        seq = getattr(item, "ConceptNameCodeSequence", None)
        if not seq:
            return ""
        return str(getattr(seq[0], "CodeMeaning", "") or "").strip()[:120]

    def cammina(sequenza, gruppo: str, profondita: int = 0) -> None:
        if profondita > 12 or not sequenza:
            return
        for item in sequenza:
            tipo = str(getattr(item, "ValueType", "") or "").upper()
            nome = nome_di(item)
            if tipo == "NUM":
                mv = getattr(item, "MeasuredValueSequence", None)
                if mv:
                    unita_seq = getattr(mv[0], "MeasurementUnitsCodeSequence", None)
                    unita = str(getattr(unita_seq[0], "CodeValue", "") or "").strip() if unita_seq else ""
                    valore = getattr(mv[0], "NumericValue", None)
                    try:
                        valore = float(valore)
                    except (TypeError, ValueError):
                        valore = None
                    if nome and valore is not None:
                        fuori.append({"gruppo": gruppo[:120], "nome": nome,
                                      "valore": valore, "unita": unita[:24]})
            figli = getattr(item, "ContentSequence", None)
            if figli:
                cammina(figli, nome if tipo == "CONTAINER" and nome else gruppo, profondita + 1)

    cammina(getattr(ds, "ContentSequence", None), nome_di(ds))
    # Un apparecchio ripete la stessa misura su battiti diversi: si tengono
    # tutte, nell'ordine dell'SR, che è l'ordine in cui le ha prese.
    return _uscita({"misure": fuori[:400], "modalita": _testo(ds, "Modality", 16).upper(),
                    "sop_class": str(getattr(ds, "SOPClassUID", "") or "")})


def comando_png(percorso: Path, frame: int, ww: float | None, wl: float | None,
                lato: int, uscita: Path) -> int:
    import numpy as np
    import pydicom
    from PIL import Image
    from pydicom.pixels import apply_modality_lut, apply_voi_lut

    try:
        ds = pydicom.dcmread(str(percorso), force=False)
    except Exception as e:  # noqa: BLE001
        return _uscita({"errore": "non_dicom", "tipo": type(e).__name__}, 1)
    if not int(getattr(ds, "Rows", 0) or 0):
        return _uscita({"errore": "non_immagine"}, 1)

    try:
        pixel = ds.pixel_array
    except Exception as e:  # noqa: BLE001 — sintassi di trasferimento non supportata, file troncato…
        return _uscita({"errore": "pixel_non_leggibili", "tipo": type(e).__name__}, 1)

    n_frame = int(getattr(ds, "NumberOfFrames", 1) or 1)
    if n_frame > 1 and pixel.ndim >= 3:
        frame = max(0, min(frame, n_frame - 1))
        pixel = pixel[frame]

    colore = getattr(ds, "SamplesPerPixel", 1) and int(ds.SamplesPerPixel) == 3
    if colore:
        arr = np.asarray(pixel)
        if arr.dtype != np.uint8:
            arr = (arr.astype(np.float32) / max(1.0, float(arr.max())) * 255).astype(np.uint8)
        img = Image.fromarray(arr, mode="RGB")
    else:
        # L'ordine è quello del DICOM e non è opinabile: prima la LUT di
        # modalità (che porta i numeri grezzi in unità vere — gli HU di una
        # TAC), poi la finestra, che È ESPRESSA IN QUELLE UNITÀ. Applicare la
        # finestra ai numeri grezzi dava un'immagine tutta di un colore.
        arr = apply_modality_lut(pixel, ds).astype(np.float32)
        if ww is not None and wl is not None and ww > 0:
            basso, alto = wl - ww / 2.0, wl + ww / 2.0
        else:
            # Senza finestra scelta: quella del file, se c'è; se no tutta la
            # dinamica. Mai un'immagine nera perché nessuno ha scelto.
            try:
                arr = apply_voi_lut(arr, ds).astype(np.float32)
            except Exception:  # noqa: BLE001
                pass
            basso, alto = float(np.min(arr)), float(np.max(arr))
        if alto <= basso:
            alto = basso + 1.0
        arr = np.clip((arr - basso) / (alto - basso), 0.0, 1.0) * 255.0
        if str(getattr(ds, "PhotometricInterpretation", "")).upper() == "MONOCHROME1":
            arr = 255.0 - arr          # in MONOCHROME1 il bianco è lo zero
        img = Image.fromarray(arr.astype(np.uint8), mode="L")

    larghezza, altezza = img.size
    tetto = max(1, min(lato, MAX_LATO))
    if max(larghezza, altezza) > tetto:
        scala = tetto / float(max(larghezza, altezza))
        img = img.resize((max(1, int(larghezza * scala)), max(1, int(altezza * scala))), Image.LANCZOS)

    uscita.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(uscita), format="PNG", optimize=False, compress_level=3)
    return _uscita({"ok": True, "larghezza": img.size[0], "altezza": img.size[1],
                    "frame": frame, "frame_totali": n_frame})


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    sub = ap.add_subparsers(dest="comando", required=True)
    m = sub.add_parser("meta"); m.add_argument("file")
    mi = sub.add_parser("misure"); mi.add_argument("file")
    c = sub.add_parser("calibrazione"); c.add_argument("file")
    g = sub.add_parser("geometria"); g.add_argument("file")
    st = sub.add_parser("statistiche"); st.add_argument("file"); st.add_argument("--frame", type=int, default=0)
    st.add_argument("--tipo", required=True); st.add_argument("--punti", required=True)
    p = sub.add_parser("png")
    p.add_argument("file"); p.add_argument("--frame", type=int, default=0)
    p.add_argument("--ww", type=float, default=None); p.add_argument("--wl", type=float, default=None)
    p.add_argument("--lato", type=int, default=MAX_LATO)
    p.add_argument("--anteprima", action="store_true")
    p.add_argument("--out", required=True)
    a = ap.parse_args()

    percorso = Path(a.file)
    if not percorso.is_file():
        return _uscita({"errore": "file_assente"}, 1)
    if a.comando == "meta":
        return comando_meta(percorso)
    if a.comando == "misure":
        return comando_misure(percorso)
    if a.comando == "calibrazione":
        return comando_calibrazione(percorso)
    if a.comando == "geometria":
        return comando_geometria(percorso)
    if a.comando == "statistiche":
        return comando_statistiche(percorso, a.frame, a.tipo, a.punti)
    return comando_png(percorso, a.frame, a.ww, a.wl,
                       ANTEPRIMA_LATO if a.anteprima else a.lato, Path(a.out))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
    except Exception as e:  # noqa: BLE001 — mai un traceback verso la piattaforma
        sys.exit(_uscita({"errore": "imprevisto", "tipo": type(e).__name__}, 1))
