"""Statistiche dei pixel dentro una ROI (Measurement Safety Engine, fase 4).

Valori CT in unità Hounsfield quando — e solo quando — il file lo permette:
modalità CT, immagine monocromatica, Rescale Slope/Intercept presenti e
RescaleType assente o «HU». Per la RM i valori sono in unità arbitrarie
(«a.u.»), e lo si dice. Per tutto il resto (ecografie, colore, secondarie)
non si producono statistiche: un livello di grigio non è un dato clinico.

La maschera si costruisce sui pixel NATIVI dai punti della misura (in pixel
nativi): rettangolo e ellisse per disuguaglianza, poligono per regola pari/
dispari vettorizzata. Le statistiche si calcolano due volte con codice
diverso (numpy e il modulo `statistics` della libreria standard) e devono
coincidere: il risultato porta con sé il secondo calcolo.
"""
from __future__ import annotations

import math
import statistics


def maschera(tipo: str, punti: list, righe: int, colonne: int):
    import numpy as np

    ys, xs = np.mgrid[0:righe, 0:colonne]
    cx, cy = xs + 0.5, ys + 0.5                     # centro del pixel
    if tipo == "rettangolo":
        (a, b) = punti
        x0, x1 = sorted([a["x"], b["x"]]); y0, y1 = sorted([a["y"], b["y"]])
        return (cx >= x0) & (cx <= x1) & (cy >= y0) & (cy <= y1)
    if tipo == "ellisse":
        (a, b) = punti
        x0, x1 = sorted([a["x"], b["x"]]); y0, y1 = sorted([a["y"], b["y"]])
        ra, rb = (x1 - x0) / 2.0, (y1 - y0) / 2.0
        if ra <= 0 or rb <= 0:
            return np.zeros((righe, colonne), dtype=bool)
        mx, my = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        return ((cx - mx) / ra) ** 2 + ((cy - my) / rb) ** 2 <= 1.0
    if tipo == "poligono":
        n = len(punti)
        dentro = np.zeros((righe, colonne), dtype=bool)
        j = n - 1
        for i in range(n):
            xi, yi = punti[i]["x"], punti[i]["y"]; xj, yj = punti[j]["x"], punti[j]["y"]
            attraversa = ((yi > cy) != (yj > cy))
            with np.errstate(divide="ignore", invalid="ignore"):
                xint = (xj - xi) * (cy - yi) / (yj - yi) + xi
            dentro ^= attraversa & (cx < xint)
            j = i
        return dentro
    raise ValueError("tipo_non_supportato")


def statistiche_di(ds, frame: int, tipo: str, punti: list) -> dict:
    import numpy as np
    from pydicom.pixels import apply_modality_lut

    modalita = str(getattr(ds, "Modality", "") or "").upper()
    if modalita not in ("CT", "MR"):
        return {"stato": "statistiche_non_applicabili", "motivo": "modalita", "modalita": modalita}
    if int(getattr(ds, "SamplesPerPixel", 1) or 1) != 1:
        return {"stato": "statistiche_non_applicabili", "motivo": "colore"}
    righe, colonne = int(ds.Rows), int(ds.Columns)
    if tipo not in ("rettangolo", "ellisse", "poligono"):
        return {"stato": "roi_non_supportata"}
    try:
        pixel = ds.pixel_array
    except Exception as e:  # noqa: BLE001
        return {"stato": "pixel_non_leggibili", "tipo": type(e).__name__}
    n_frame = int(getattr(ds, "NumberOfFrames", 1) or 1)
    if n_frame > 1 and pixel.ndim >= 3:
        if frame < 0 or frame >= n_frame:
            return {"stato": "fotogramma_non_valido"}
        pixel = pixel[frame]
    elif frame != 0:
        return {"stato": "fotogramma_non_valido"}

    avvisi = []
    slope, inter = getattr(ds, "RescaleSlope", None), getattr(ds, "RescaleIntercept", None)
    tipo_rescale = str(getattr(ds, "RescaleType", "") or "").strip().upper()
    if modalita == "CT":
        if slope is None or inter is None:
            return {"stato": "hu_non_disponibili", "motivo": "rescale_assente"}
        if tipo_rescale and tipo_rescale != "HU":
            return {"stato": "hu_non_disponibili", "motivo": f"rescale_type_{tipo_rescale}"}
        unita = "HU"
    else:
        unita = "a.u."
        if slope is None and inter is None:
            avvisi.append("rescale_assente_valori_grezzi")
    valori = apply_modality_lut(pixel, ds).astype(np.float64) if (slope is not None or inter is not None) else pixel.astype(np.float64)

    m = maschera(tipo, punti, righe, colonne)
    dentro = valori[m]
    n = int(dentro.size)
    if n == 0:
        return {"stato": "roi_vuota"}
    # calcolo A: numpy
    a = {"n": n, "min": float(dentro.min()), "max": float(dentro.max()), "media": float(dentro.mean()),
         "deviazione": float(dentro.std(ddof=0))}
    # calcolo B: libreria standard, senza numpy
    lista = dentro.tolist()
    b = {"n": len(lista), "min": float(min(lista)), "max": float(max(lista)), "media": float(statistics.fmean(lista)),
         "deviazione": float(statistics.pstdev(lista)) if len(lista) > 1 else 0.0}
    tol = 1e-9 * max(1.0, abs(a["media"]), abs(a["deviazione"]))
    coincidono = all(abs(a[k] - b[k]) <= tol for k in ("min", "max", "media", "deviazione")) and a["n"] == b["n"]
    if not math.isfinite(a["media"]) or not math.isfinite(a["deviazione"]):
        return {"stato": "calcolo_non_finito"}
    return {"stato": "ok" if coincidono else "verifica_indipendente_fallita", "unita": unita, "modalita": modalita,
            "frame": frame, "tipo_roi": tipo, **a, "verifica": {"metodo": "statistics (stdlib)", **b, "coincide": coincidono},
            "rescale": {"slope": float(slope) if slope is not None else None, "intercept": float(inter) if inter is not None else None,
                        "tipo": tipo_rescale or None},
            "avvisi": avvisi}
