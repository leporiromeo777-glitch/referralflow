#!/usr/bin/env python3
"""Doppio controllo del motore (MSE fase 7, 19.9.2026).

Ricalcola la distanza dagli stessi punti e dalla stessa calibrazione, ma con
un'implementazione SEPARATA (Python + numpy, scritta a parte da mse/misure.js):
se i due numeri non coincidono entro la tolleranza, il server non salva la
misura come validata. Legge un JSON da stdin:
    {"calibrazione": {...}, "punti": [{"x":..,"y":..},{"x":..,"y":..}]}
e scrive {"stato": "ok", "mm": ...} oppure {"stato": "<motivo>"}.
Nessun dato di paziente entra qui: solo numeri.
"""
from __future__ import annotations

import json
import math
import sys


def _finito(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def regione_per(cal: dict, p: dict):
    """Stessa regola di scelta di geometria.js (priorità, tessuto, ordine), scritta a parte."""
    cand = [r for r in cal.get("regioni", [])
            if r["x0"] <= p["x"] <= r["x1"] and r["y0"] <= p["y"] <= r["y1"]]
    if not cand:
        return None, False
    def peso(r):
        return (0 if r.get("priorita_alta") is False else 2) + (1 if r.get("tipo") == "tessuto" or r.get("tipo_dati") == 1 else 0)
    best = max(cand, key=lambda r: (peso(r), -cand.index(r)))
    discordanti = any(abs(r["dx_mm"] - cand[0]["dx_mm"]) > 1e-9 or abs(r["dy_mm"] - cand[0]["dy_mm"]) > 1e-9 for r in cand[1:])
    return best, discordanti


def distanza(cal: dict, punti: list) -> dict:
    import numpy as np

    if not isinstance(punti, list) or len(punti) != 2:
        return {"stato": "punti_non_validi"}
    p1, p2 = punti
    for p in (p1, p2):
        if not isinstance(p, dict) or not _finito(p.get("x")) or not _finito(p.get("y")):
            return {"stato": "punti_non_validi"}
    if not isinstance(cal, dict) or not cal.get("tipo"):
        return {"stato": "non_calibrata"}
    righe, colonne = cal.get("righe"), cal.get("colonne")
    if _finito(righe) and _finito(colonne) and righe > 0 and colonne > 0:
        for p in (p1, p2):
            if not (0 <= p["x"] <= colonne and 0 <= p["y"] <= righe):
                return {"stato": "fuori_immagine"}
    d = np.array([p2["x"] - p1["x"], p2["y"] - p1["y"]], dtype=np.float64)
    if d[0] == 0 and d[1] == 0:
        return {"stato": "punti_uguali"}
    if cal["tipo"] == "us_regioni":
        r1, _ = regione_per(cal, p1)
        r2, _ = regione_per(cal, p2)
        if r1 is None or r2 is None:
            return {"stato": "fuori_regione"}
        if r1 is not r2:
            return {"stato": "regioni_diverse"}
        s = np.array([r1["dx_mm"], r1["dy_mm"]], dtype=np.float64)
    elif cal["tipo"] == "pixel_spacing":
        sp = cal.get("spacing") or {}
        s = np.array([sp.get("dx_mm", float("nan")), sp.get("dy_mm", float("nan"))], dtype=np.float64)
    elif cal["tipo"] == "imager_pixel_spacing":
        return {"stato": "rivelatore"}
    else:
        return {"stato": "non_calibrata"}
    if not np.all(np.isfinite(s)) or np.any(s <= 0):
        return {"stato": "non_calibrata"}
    mm = float(np.hypot(*(d * s)))          # hypot: implementazione diversa da sqrt(a²+b²)
    if not math.isfinite(mm):
        return {"stato": "calcolo_non_finito"}
    return {"stato": "ok", "mm": mm}


def main() -> int:
    try:
        dati = json.load(sys.stdin)
    except Exception:  # noqa: BLE001
        json.dump({"stato": "ingresso_non_valido"}, sys.stdout); return 1
    json.dump(distanza(dati.get("calibrazione"), dati.get("punti")), sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
