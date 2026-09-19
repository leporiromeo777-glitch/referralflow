"""Geometria di un'immagine DICOM: tutto ciò che serve per misurare, e nient'altro.

Measurement Safety Engine, fase 1 (19.9.2026, wiki Proposte/Measurement Safety
Engine). Questo modulo LEGGE: non stima, non completa, non corregge. Se un
attributo manca, il campo è null e chi misura lo saprà. Definizioni prese dallo
standard corrente (PS3.3 2026c): modulo US Region Calibration C.8.5.5, macro
Basic Pixel Spacing Calibration 10.7, Image Plane C.7.6.2, Pixel Measures.

Uscita: un dizionario serializzabile, versione 1 (vedi `VERSIONE_GEOMETRIA`).
Ogni immagine lo porta con sé in tabella; ogni misura ne copia la parte usata.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

VERSIONE_GEOMETRIA = 1

# Codici DICOM (PS3.3 C.8.5.5.1), scritti per esteso: mai numeri magici nel codice.
US_FORMATO = {0: "nessuno", 1: "2d", 2: "m_mode", 3: "spettrale", 4: "waveform", 5: "grafica"}
US_TIPO_DATI = {0: "nessuno", 1: "tessuto", 2: "color_flow", 3: "doppler_pw", 4: "doppler_cw",
                5: "traccia_doppler_media", 6: "traccia_doppler_moda", 7: "traccia_doppler_max",
                8: "traccia_volume", 9: "ecg", 10: "polso", 11: "fonocardiogramma", 12: "barra_grigi",
                13: "barra_colore", 14: "backscatter", 15: "traccia_area", 16: "traccia_d_area",
                17: "altra_fisiologica"}
US_UNITA = {0: "nessuna", 1: "percento", 2: "dB", 3: "cm", 4: "s", 5: "Hz", 6: "dB/s", 7: "cm/s",
            8: "cm2", 9: "cm2/s", 10: "cm3", 11: "cm3/s", 12: "gradi"}


def _f(v):
    """float o None: mai un'eccezione per un tag scritto male."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float("inf") else None


def _i(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _coppia(v):
    """[a, b] di float positivi, o None."""
    try:
        a, b = _f(v[0]), _f(v[1])
    except (TypeError, IndexError):
        return None
    if a is None or b is None or a <= 0 or b <= 0:
        return None
    return [a, b]


def _lista(v, n):
    try:
        out = [_f(x) for x in v]
    except TypeError:
        return None
    if len(out) != n or any(x is None for x in out):
        return None
    return out


def _testo(ds, chiave, massimo=200):
    v = getattr(ds, chiave, None)
    return "" if v is None else str(v).strip()[:massimo]


def sha256_file(percorso: Path) -> str:
    h = hashlib.sha256()
    with open(percorso, "rb") as f:
        for blocco in iter(lambda: f.read(1 << 20), b""):
            h.update(blocco)
    return h.hexdigest()


def _regioni_us(ds, avvisi: list[str]) -> list[dict]:
    """TUTTE le regioni, con tutti i campi: chi misura sceglie quali usare.

    Physical Delta può essere negativo (asse Y del Doppler): si conserva il
    segno, il modulo lo prende chi calcola. Reference Pixel e il suo valore
    fisico servono a tempo e velocità, non alle distanze: si leggono lo stesso.
    """
    seq = getattr(ds, "SequenceOfUltrasoundRegions", None)
    if not seq:
        return []
    fuori = []
    for n, r in enumerate(seq):
        x0, y0 = _i(getattr(r, "RegionLocationMinX0", None)), _i(getattr(r, "RegionLocationMinY0", None))
        x1, y1 = _i(getattr(r, "RegionLocationMaxX1", None)), _i(getattr(r, "RegionLocationMaxY1", None))
        if None in (x0, y0, x1, y1):
            avvisi.append(f"regione_us_{n}_senza_posizione")
            continue
        formato = _i(getattr(r, "RegionSpatialFormat", None))
        tipo = _i(getattr(r, "RegionDataType", None))
        ux, uy = _i(getattr(r, "PhysicalUnitsXDirection", None)), _i(getattr(r, "PhysicalUnitsYDirection", None))
        flags = _i(getattr(r, "RegionFlags", None))
        fuori.append({
            "indice": n, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "formato": US_FORMATO.get(formato, f"sconosciuto_{formato}"),
            "tipo_dati": US_TIPO_DATI.get(tipo, f"sconosciuto_{tipo}"),
            "unita_x": US_UNITA.get(ux, f"sconosciuta_{ux}"), "unita_y": US_UNITA.get(uy, f"sconosciuta_{uy}"),
            "delta_x": _f(getattr(r, "PhysicalDeltaX", None)), "delta_y": _f(getattr(r, "PhysicalDeltaY", None)),
            "rif_x0": _f(getattr(r, "ReferencePixelX0", None)), "rif_y0": _f(getattr(r, "ReferencePixelY0", None)),
            "rif_fisico_x": _f(getattr(r, "ReferencePixelPhysicalValueX", None)),
            "rif_fisico_y": _f(getattr(r, "ReferencePixelPhysicalValueY", None)),
            # PS3.3 C.8.5.5.1.14: bit 0 priorità (0 = alta), bit 1 protezione scala,
            # bit 2 tipo scala Doppler (0 velocità, 1 frequenza), bit 3-4 scorrimento
            "flags": None if flags is None else {
                "priorita_alta": (flags & 1) == 0, "scala_protetta": bool(flags & 2),
                "doppler_frequenza": bool(flags & 4), "scorrimento": (flags >> 3) & 3},
        })
        if x1 <= x0 or y1 <= y0:
            avvisi.append(f"regione_us_{n}_degenere")
    return fuori


def _spaziatura(ds, avvisi: list[str]) -> dict:
    """Da dove viene la dimensione del pixel, senza mescolare le fonti.

    PixelSpacing (0028,0030) è «la distanza fisica NEL PAZIENTE fra i centri dei
    pixel», [fra le righe, fra le colonne]: riga → Y, colonna → X.
    ImagerPixelSpacing (0018,1164) è la distanza SUL RIVELATORE: vale per il
    paziente solo se PixelSpacing è stato calibrato (10.7). Nei multiframe
    «enhanced» lo spacing sta nei gruppi funzionali: condivisi (uno per tutti i
    fotogrammi) o per fotogramma (allora si segnala, e finché non è validato
    non si misura).
    """
    fuori = {"fonte": None, "dy_mm": None, "dx_mm": None, "per_frame": False,
             "calibrazione_tipo": None, "calibrazione_descrizione": "",
             "imager_dy_mm": None, "imager_dx_mm": None}
    ps = _coppia(getattr(ds, "PixelSpacing", None))
    if getattr(ds, "PixelSpacing", None) is not None and ps is None:
        avvisi.append("pixel_spacing_non_valido")
    ips = _coppia(getattr(ds, "ImagerPixelSpacing", None))
    if ips:
        fuori["imager_dy_mm"], fuori["imager_dx_mm"] = ips
    if ps:
        fuori.update({"fonte": "PixelSpacing", "dy_mm": ps[0], "dx_mm": ps[1]})
        tipo = _testo(ds, "PixelSpacingCalibrationType", 16).upper()
        if tipo:
            fuori["calibrazione_tipo"] = tipo if tipo in ("GEOMETRY", "FIDUCIAL") else f"sconosciuto:{tipo}"
            fuori["calibrazione_descrizione"] = _testo(ds, "PixelSpacingCalibrationDescription", 200)
        if ips and (abs(ps[0] - ips[0]) > 1e-9 or abs(ps[1] - ips[1]) > 1e-9) and not tipo:
            avvisi.append("pixel_spacing_calibrato_senza_tipo")
        return fuori
    # gruppi funzionali (multiframe enhanced)
    try:
        cond = ds.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence[0]
        psc = _coppia(getattr(cond, "PixelSpacing", None))
    except (AttributeError, IndexError, TypeError):
        psc = None
    per_frame = []
    try:
        for g in ds.PerFrameFunctionalGroupsSequence:
            try:
                per_frame.append(_coppia(g.PixelMeasuresSequence[0].PixelSpacing))
            except (AttributeError, IndexError, TypeError):
                per_frame.append(None)
    except (AttributeError, TypeError):
        pass
    if psc:
        fuori.update({"fonte": "FunctionalGroups", "dy_mm": psc[0], "dx_mm": psc[1]})
        return fuori
    validi = [p for p in per_frame if p]
    if validi:
        fuori["per_frame"] = True
        fuori["fonte"] = "PerFrameFunctionalGroups"
        if all(abs(p[0] - validi[0][0]) < 1e-9 and abs(p[1] - validi[0][1]) < 1e-9 for p in validi) and len(validi) == len(per_frame):
            # uguali su tutti i fotogrammi: si può trattare come condiviso, ma lo si dice
            fuori.update({"dy_mm": validi[0][0], "dx_mm": validi[0][1], "per_frame": False})
            avvisi.append("spacing_per_frame_uniforme")
        else:
            avvisi.append("spacing_per_frame_non_uniforme")
        return fuori
    if ips:
        fuori["fonte"] = "ImagerPixelSpacing"
        fuori["dy_mm"], fuori["dx_mm"] = ips
    return fuori


def _spazio(ds, avvisi: list[str]) -> dict | None:
    """Piano dell'immagine nel paziente (C.7.6.2): serve per MPR e 3D (fase 9),
    non per la distanza in piano. Si legge per averlo, non lo si usa ancora.
    Slice Thickness NON è la distanza fra le fette: quella si ricava dalle
    Image Position Patient adiacenti, e qui non c'è una serie, c'è un file."""
    iop = _lista(getattr(ds, "ImageOrientationPatient", None), 6)
    ipp = _lista(getattr(ds, "ImagePositionPatient", None), 3)
    if iop is None and ipp is None:
        try:
            g = ds.SharedFunctionalGroupsSequence[0]
            iop = _lista(g.PlaneOrientationSequence[0].ImageOrientationPatient, 6)
        except (AttributeError, IndexError, TypeError):
            pass
        try:
            g = ds.PerFrameFunctionalGroupsSequence[0]
            ipp = _lista(g.PlanePositionSequence[0].ImagePositionPatient, 3)
        except (AttributeError, IndexError, TypeError):
            pass
    fr = _testo(ds, "FrameOfReferenceUID", 128)
    spess = _f(getattr(ds, "SliceThickness", None))
    fra = _f(getattr(ds, "SpacingBetweenSlices", None))
    if iop is None and ipp is None and not fr and spess is None and fra is None:
        return None
    if iop is not None:
        # i due versori devono essere unitari e ortogonali, se no la geometria è sospetta
        r, c = iop[:3], iop[3:]
        nr = sum(x * x for x in r) ** 0.5; nc = sum(x * x for x in c) ** 0.5
        dot = sum(a * b for a, b in zip(r, c))
        if abs(nr - 1) > 1e-3 or abs(nc - 1) > 1e-3 or abs(dot) > 1e-3:
            avvisi.append("orientamento_non_ortonormale")
    return {"iop": iop, "ipp": ipp, "frame_of_reference": fr or None,
            "spessore_mm": spess, "distanza_slice_dichiarata_mm": fra}


def geometria_di(ds, percorso: Path | None = None) -> dict:
    avvisi: list[str] = []
    righe = _i(getattr(ds, "Rows", 0)) or 0
    colonne = _i(getattr(ds, "Columns", 0)) or 0
    frame = _i(getattr(ds, "NumberOfFrames", 1)) or 1
    image_type = [str(x).strip().upper() for x in (getattr(ds, "ImageType", None) or [])][:8]
    aspect = None
    par = getattr(ds, "PixelAspectRatio", None)
    if par is not None:
        v, h = (_i(par[0]), _i(par[1])) if hasattr(par, "__getitem__") and not isinstance(par, str) else (None, None)
        if v and h and v > 0 and h > 0:
            aspect = [v, h]
            if v != h:
                avvisi.append("pixel_non_quadrati")
        else:
            avvisi.append("pixel_aspect_ratio_non_valido")
    rescale = None
    slope, inter = _f(getattr(ds, "RescaleSlope", None)), _f(getattr(ds, "RescaleIntercept", None))
    if slope is not None or inter is not None:
        rescale = {"slope": slope if slope is not None else 1.0, "intercept": inter if inter is not None else 0.0,
                   "tipo": _testo(ds, "RescaleType", 16)}

    spaz = _spaziatura(ds, avvisi)
    regioni = _regioni_us(ds, avvisi)
    modalita = _testo(ds, "Modality", 16).upper()

    # Due calibrazioni nello stesso file: regioni 2D in cm e PixelSpacing.
    # Non è vietato, ma se discordano chi misura deve saperlo (CAUTION).
    if spaz["fonte"] == "PixelSpacing" and regioni:
        for r in regioni:
            if r["formato"] == "2d" and r["unita_x"] == "cm" and r["unita_y"] == "cm" and r["delta_x"] and r["delta_y"]:
                dx, dy = abs(r["delta_x"]) * 10, abs(r["delta_y"]) * 10
                if abs(dx - spaz["dx_mm"]) > 0.01 * spaz["dx_mm"] or abs(dy - spaz["dy_mm"]) > 0.01 * spaz["dy_mm"]:
                    avvisi.append("pixel_spacing_e_regioni_discordanti")
                break
    if modalita == "US" and spaz["fonte"] == "PixelSpacing" and not regioni:
        avvisi.append("us_solo_pixel_spacing")
    derivata = any(t in ("DERIVED", "SECONDARY") for t in image_type)
    if derivata:
        avvisi.append("immagine_derivata")

    return {
        "versione": VERSIONE_GEOMETRIA,
        "identita": {
            "sop_class": _testo(ds, "SOPClassUID", 128), "sop_uid": _testo(ds, "SOPInstanceUID", 128),
            "serie_uid": _testo(ds, "SeriesInstanceUID", 128), "studio_uid": _testo(ds, "StudyInstanceUID", 128),
            "modalita": modalita, "frame_totali": max(1, frame),
        },
        "pixel": {"righe": righe, "colonne": colonne, "aspect": aspect, "rescale": rescale,
                  "fotometria": _testo(ds, "PhotometricInterpretation", 32),
                  "bit": _i(getattr(ds, "BitsStored", None)), "campioni": _i(getattr(ds, "SamplesPerPixel", None))},
        "spaziatura": spaz,
        "regioni_us": regioni,
        "spazio": _spazio(ds, avvisi),
        "derivata": derivata,
        "image_type": image_type,
        "avvisi_lettura": avvisi,
        "sha256_file": sha256_file(percorso) if percorso else None,
    }


def calibrazione_da(g: dict) -> dict:
    """La proiezione «vecchia» (colonna imaging_immagini.calibrazione, 19.9.2026):
    la stessa informazione, nella forma che il righello v1 usa. Derivata dalla
    geometria: una fonte sola."""
    fuori = {"tipo": "nessuna", "righe": g["pixel"]["righe"], "colonne": g["pixel"]["colonne"], "regioni": [], "spacing": None}
    for r in g.get("regioni_us", []):
        if r["formato"] != "2d" or r["unita_x"] != "cm" or r["unita_y"] != "cm":
            continue
        if not r["delta_x"] or not r["delta_y"] or r["x1"] <= r["x0"] or r["y1"] <= r["y0"]:
            continue
        fuori["regioni"].append({"x0": r["x0"], "y0": r["y0"], "x1": r["x1"], "y1": r["y1"],
                                 "dx_mm": round(abs(r["delta_x"]) * 10.0, 6), "dy_mm": round(abs(r["delta_y"]) * 10.0, 6),
                                 "tipo_dati": 1 if r["tipo_dati"] == "tessuto" else 2 if r["tipo_dati"] == "color_flow" else 0,
                                 # fase 5: per scegliere fra regioni sovrapposte (PS3.3 C.8.5.5.1.14, bit 0)
                                 "indice": r["indice"], "tipo": r["tipo_dati"],
                                 "priorita_alta": True if r["flags"] is None else r["flags"]["priorita_alta"]})
    fuori["avvisi"] = list(g.get("avvisi_lettura", []))
    if fuori["regioni"]:
        fuori["tipo"] = "us_regioni"
        return fuori
    s = g["spaziatura"]
    if s["fonte"] in ("PixelSpacing", "FunctionalGroups") and s["dx_mm"] and s["dy_mm"] and not s["per_frame"]:
        fuori["tipo"] = "pixel_spacing"
        fuori["spacing"] = {"dy_mm": round(s["dy_mm"], 6), "dx_mm": round(s["dx_mm"], 6), "origine": "PixelSpacing",
                            "taratura": s["calibrazione_tipo"] or ""}
    elif s["fonte"] == "ImagerPixelSpacing" and s["dx_mm"] and s["dy_mm"]:
        fuori["tipo"] = "imager_pixel_spacing"
        fuori["spacing"] = {"dy_mm": round(s["dy_mm"], 6), "dx_mm": round(s["dx_mm"], 6), "origine": "ImagerPixelSpacing", "taratura": ""}
    return fuori
