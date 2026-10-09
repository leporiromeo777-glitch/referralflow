#!/usr/bin/env python3
"""Lettore DICOM della piattaforma (18.9.2026).

ReferralFlow non manda le immagini da nessuna parte: i file restano sul Mac
dello studio, e questo strumento è l'unico che li apre. Fa due cose sole, e le
fa in un processo separato che muore subito dopo — così un file malformato
rovina al massimo la sua richiesta:

    leggi-dicom.py meta <file>                        → JSON dei campi utili
    leggi-dicom.py png <file> --frame N --out f.png   → un fotogramma in PNG
    leggi-dicom.py filmato <file> --out f.bin         → tutti i fotogrammi di un filmato in un file (JPEG), per riprodurlo
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
    return _uscita(_meta_di(ds, percorso))


def comando_meta_cartella(cartella: Path) -> int:
    """I metadati di TUTTI i DICOM di una cartella d'esame, in un colpo solo
    (8.10.2026): serve a catalogare un archivio già scritto su disco — migliaia
    di cartelle — senza aprire un processo per file e senza leggere i pixel.
    L'impronta SHA-256 qui non si calcola (vorrebbe dire leggere ogni file per
    intero): si farà, se serve, alla prima apertura."""
    import os
    import pydicom

    fuori, non_dicom, altri = [], 0, 0
    for radice, _cartelle, nomi in os.walk(str(cartella)):
        for nome in sorted(nomi):
            if not nome.lower().endswith(".dcm"):
                altri += 1
                continue
            p = Path(radice) / nome
            try:
                ds = pydicom.dcmread(str(p), stop_before_pixels=True, force=False)
                m = _meta_di(ds, None)
            except Exception:  # noqa: BLE001 — un file rotto non ferma la cartella
                non_dicom += 1
                continue
            m["percorso"] = str(p.relative_to(cartella))
            try:
                m["byte"] = p.stat().st_size
            except OSError:
                m["byte"] = 0
            fuori.append(m)
    return _uscita({"file": fuori, "non_dicom": non_dicom, "altri": altri})


def _meta_di(ds, percorso) -> dict:
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

    return {
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
    }


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


def _disegna(ds, pixel, ww, wl, lato: int, fissa=None):
    """Dai pixel di UN fotogramma all'immagine da mostrare: colori del file, o
    grigi con la finestra. `fissa` = (basso, alto) già scelti (un filmato in
    grigio senza finestra usa quelli del primo fotogramma per tutti: se ogni
    fotogramma si allargasse sulla sua dinamica il filmato sfarfallerebbe).
    Rende (immagine, (basso, alto) usati o None per il colore)."""
    import numpy as np
    from PIL import Image
    from pydicom.pixels import apply_modality_lut, apply_voi_lut

    usata = None
    colore = getattr(ds, "SamplesPerPixel", 1) and int(ds.SamplesPerPixel) == 3
    # PALETTE COLOR: i pixel sono indici e i colori stanno nella tavolozza del
    # file (certe immagini Doppler degli ecografi). Letti come grigi darebbero
    # un'immagine leggibile ma coi colori sbagliati.
    if not colore and str(getattr(ds, "PhotometricInterpretation", "")).upper() == "PALETTE COLOR":
        try:
            from pydicom.pixels import apply_color_lut
            pixel = apply_color_lut(np.asarray(pixel), ds)
            colore = True
        except Exception:  # noqa: BLE001 — tavolozza assente o rotta: si mostra in grigio
            pass
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
            basso, alto = fissa if fissa else (float(np.min(arr)), float(np.max(arr)))
        if alto <= basso:
            alto = basso + 1.0
        arr = np.clip((arr - basso) / (alto - basso), 0.0, 1.0) * 255.0
        if str(getattr(ds, "PhotometricInterpretation", "")).upper() == "MONOCHROME1":
            arr = 255.0 - arr          # in MONOCHROME1 il bianco è lo zero
        img = Image.fromarray(arr.astype(np.uint8), mode="L")
        usata = (basso, alto)

    larghezza, altezza = img.size
    tetto = max(1, min(lato, MAX_LATO))
    if max(larghezza, altezza) > tetto:
        scala = tetto / float(max(larghezza, altezza))
        img = img.resize((max(1, int(larghezza * scala)), max(1, int(altezza * scala))), Image.LANCZOS)

    return img, usata


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

    # Un filmato di un ecografo è un file solo con centinaia di fotogrammi
    # compressi uno per uno: se ne decodifica UNO, quello chiesto. Decodificarli
    # tutti per disegnarne uno (7.10.2026: 1,8 s contro 0,15 su 240 fotogrammi)
    # ferma il visore proprio sugli esami che lo studio guarda di più.
    n_frame = int(getattr(ds, "NumberOfFrames", 1) or 1)
    pixel = None
    if n_frame > 1:
        frame = max(0, min(frame, n_frame - 1))
        try:
            from pydicom.pixels import pixel_array as un_fotogramma
            pixel = un_fotogramma(str(percorso), index=frame)
        except Exception:  # noqa: BLE001 — si ripiega sulla lettura intera, qui sotto
            pixel = None
    if pixel is None:
        try:
            pixel = ds.pixel_array
        except Exception as e:  # noqa: BLE001 — sintassi di trasferimento non supportata, file troncato…
            return _uscita({"errore": "pixel_non_leggibili", "tipo": type(e).__name__}, 1)
        if n_frame > 1 and pixel.ndim >= 3:
            pixel = pixel[frame]

    img, _ = _disegna(ds, pixel, ww, wl, lato)

    uscita.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(uscita), format="PNG", optimize=False, compress_level=3)
    return _uscita({"ok": True, "larghezza": img.size[0], "altezza": img.size[1],
                    "frame": frame, "frame_totali": n_frame})


MAX_FOTOGRAMMI_FILMATO = 600   # oltre, il filmato non si prepara in un colpo solo: si scorre a mano
QUALITA_FILMATO = 90


def _ms_per_fotogramma(ds):
    """Quanto dura un fotogramma, in millisecondi, come lo dichiara il file:
    il tempo vero di acquisizione prima (FrameTime, FrameTimeVector), poi la
    velocità consigliata. None se il file non lo dice."""
    def numero(v):
        try:
            x = float(v)
            return x if x > 0 else None
        except Exception:  # noqa: BLE001
            return None
    ms = numero(getattr(ds, "FrameTime", None))
    if ms is None:
        try:
            vett = [float(x) for x in (getattr(ds, "FrameTimeVector", None) or []) if float(x) > 0]
            ms = sum(vett) / len(vett) if vett else None
        except Exception:  # noqa: BLE001
            ms = None
    if ms is None:
        for nome in ("RecommendedDisplayFrameRate", "CineRate"):
            fps = numero(getattr(ds, nome, None))
            if fps:
                ms = 1000.0 / fps
                break
    return round(ms, 2) if ms is not None and 5.0 <= ms <= 2000.0 else None


def comando_filmato(percorso: Path, ww: float | None, wl: float | None, lato: int, uscita: Path) -> int:
    """Tutti i fotogrammi di un filmato in UN file solo, per riprodurlo nel
    browser (9.10.2026): intestazione JSON con le lunghezze, poi i JPEG uno
    dietro l'altro. Un processo, una decodifica per fotogramma: chiedere cento
    PNG uno alla volta vorrebbe cento processi. È JPEG e non PNG perché serve a
    GUARDARE il movimento (e il filmato dell'ecografo è già JPEG): il fotogramma
    fermo, su cui si misura, resta il PNG del comando `png`."""
    import io
    import os
    import struct
    import pydicom

    try:
        ds = pydicom.dcmread(str(percorso), force=False)
    except Exception as e:  # noqa: BLE001
        return _uscita({"errore": "non_dicom", "tipo": type(e).__name__}, 1)
    if not int(getattr(ds, "Rows", 0) or 0):
        return _uscita({"errore": "non_immagine"}, 1)
    n = int(getattr(ds, "NumberOfFrames", 1) or 1)
    if n < 2:
        return _uscita({"errore": "non_filmato"}, 1)
    if n > MAX_FOTOGRAMMI_FILMATO:
        return _uscita({"errore": "troppo_lungo", "frame_totali": n}, 1)

    def fotogrammi():
        try:
            from pydicom.pixels import iter_pixels
            yield from iter_pixels(str(percorso))
        except Exception:  # noqa: BLE001 — si ripiega sulla lettura intera
            tutti = ds.pixel_array
            for k in range(n):
                yield tutti[k]

    tetto = max(1, min(lato, MAX_LATO))
    pezzi, fissa, dimensioni = [], None, None
    try:
        for pixel in fotogrammi():
            img, usata = _disegna(ds, pixel, ww, wl, tetto, fissa)
            if fissa is None and usata is not None and not (ww is not None and wl is not None and ww > 0):
                fissa = usata
            dimensioni = img.size
            b = io.BytesIO()
            img.save(b, format="JPEG", quality=QUALITA_FILMATO, subsampling=0)
            pezzi.append(b.getvalue())
    except Exception as e:  # noqa: BLE001
        return _uscita({"errore": "pixel_non_leggibili", "tipo": type(e).__name__}, 1)
    if len(pezzi) < 2:
        return _uscita({"errore": "non_filmato"}, 1)

    ms = _ms_per_fotogramma(ds)
    testa = json.dumps({"n": len(pezzi), "ms": ms, "larghezza": dimensioni[0], "altezza": dimensioni[1],
                        "lunghezze": [len(x) for x in pezzi]}).encode("utf-8")
    uscita.parent.mkdir(parents=True, exist_ok=True)
    # Si scrive accanto e poi si rinomina: chi legge non trova mai un file a metà.
    provvisorio = uscita.with_name(uscita.name + f".{os.getpid()}.tmp")
    with open(provvisorio, "wb") as f:
        f.write(b"RFCINE1\n")
        f.write(struct.pack("<I", len(testa)))
        f.write(testa)
        for x in pezzi:
            f.write(x)
    os.replace(provvisorio, uscita)
    return _uscita({"ok": True, "frame_totali": len(pezzi), "ms": ms, "byte": sum(len(x) for x in pezzi)})


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    sub = ap.add_subparsers(dest="comando", required=True)
    m = sub.add_parser("meta"); m.add_argument("file")
    mc = sub.add_parser("meta-cartella"); mc.add_argument("file")
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
    fl = sub.add_parser("filmato")
    fl.add_argument("file"); fl.add_argument("--ww", type=float, default=None); fl.add_argument("--wl", type=float, default=None)
    fl.add_argument("--lato", type=int, default=1024); fl.add_argument("--out", required=True)
    a = ap.parse_args()

    percorso = Path(a.file)
    if a.comando == "meta-cartella":
        return comando_meta_cartella(percorso) if percorso.is_dir() else _uscita({"errore": "cartella_assente"}, 1)
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
    if a.comando == "filmato":
        return comando_filmato(percorso, a.ww, a.wl, a.lato, Path(a.out))
    return comando_png(percorso, a.frame, a.ww, a.wl,
                       ANTEPRIMA_LATO if a.anteprima else a.lato, Path(a.out))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
    except Exception as e:  # noqa: BLE001 — mai un traceback verso la piattaforma
        sys.exit(_uscita({"errore": "imprevisto", "tipo": type(e).__name__}, 1))
