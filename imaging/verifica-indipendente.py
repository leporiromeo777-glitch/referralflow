#!/usr/bin/env python3
"""Doppio controllo del motore (MSE fasi 7 e 3, 19-20.9.2026).

Ricalcola la misura dagli stessi punti e dalla stessa calibrazione, ma con
un'implementazione SEPARATA (Python + numpy, scritta a parte da mse/misure.js):
se i due numeri non coincidono entro la tolleranza, il server non salva la
misura come validata. Legge un JSON da stdin:
    {"calibrazione": {...}, "punti": [{"x":..,"y":..}, ...], "algoritmo": "distanza"}
e scrive {"stato": "ok", "mm": <valore>} oppure {"stato": "<motivo>"}.
`mm` è il valore principale nell'unità dell'algoritmo (mm, mm², gradi); per
il punto è la coordinata x in mm e `y_mm` la y. Nessun dato di paziente
entra qui: solo numeri.
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


def _in_mm(cal: dict, punti: list, minimo: int, massimo: int):
    """Tutti i punti in mm con la calibrazione del punto; stessa regione per le eco."""
    import numpy as np

    if not isinstance(punti, list) or len(punti) < minimo or len(punti) > massimo:
        return None, {"stato": "punti_non_validi"}
    for p in punti:
        if not isinstance(p, dict) or not _finito(p.get("x")) or not _finito(p.get("y")):
            return None, {"stato": "punti_non_validi"}
    if not isinstance(cal, dict) or not cal.get("tipo"):
        return None, {"stato": "non_calibrata"}
    righe, colonne = cal.get("righe"), cal.get("colonne")
    if _finito(righe) and _finito(colonne) and righe > 0 and colonne > 0:
        for p in punti:
            if not (0 <= p["x"] <= colonne and 0 <= p["y"] <= righe):
                return None, {"stato": "fuori_immagine"}
    if cal["tipo"] == "us_regioni":
        regioni = []
        for p in punti:
            r, _ = regione_per(cal, p)
            if r is None:
                return None, {"stato": "fuori_regione"}
            regioni.append(r)
        if any(r is not regioni[0] for r in regioni):
            return None, {"stato": "regioni_diverse"}
        s = np.array([regioni[0]["dx_mm"], regioni[0]["dy_mm"]], dtype=np.float64)
    elif cal["tipo"] == "pixel_spacing":
        sp = cal.get("spacing") or {}
        s = np.array([sp.get("dx_mm", float("nan")), sp.get("dy_mm", float("nan"))], dtype=np.float64)
    elif cal["tipo"] == "imager_pixel_spacing":
        return None, {"stato": "rivelatore"}
    else:
        return None, {"stato": "non_calibrata"}
    if not np.all(np.isfinite(s)) or np.any(s <= 0):
        return None, {"stato": "non_calibrata"}
    mm = np.array([[p["x"], p["y"]] for p in punti], dtype=np.float64) * s
    return mm, None


def _distinti(mm) -> bool:
    import numpy as np
    return not np.any(np.all(mm[1:] == mm[:-1], axis=1)) if len(mm) > 1 else True


def _intersecano(a, b, c, d) -> bool:
    import numpy as np
    def orient(p, q, r):
        a, b = q - p, r - p
        v = float(a[0] * b[1] - a[1] * b[0])          # prodotto vettoriale 2D, esplicito (numpy 2 non lo fa più)
        return 1 if v > 1e-12 else -1 if v < -1e-12 else 0
    def su(p, q, r):
        return (min(p[0], q[0]) - 1e-12 <= r[0] <= max(p[0], q[0]) + 1e-12 and min(p[1], q[1]) - 1e-12 <= r[1] <= max(p[1], q[1]) + 1e-12)
    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    if o1 != o2 and o3 != o4:
        return True
    return (o1 == 0 and su(a, b, c)) or (o2 == 0 and su(a, b, d)) or (o3 == 0 and su(c, d, a)) or (o4 == 0 and su(c, d, b))


def _intrecciato(mm) -> bool:
    n = len(mm)
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            if _intersecano(mm[i], mm[(i + 1) % n], mm[j], mm[(j + 1) % n]):
                return True
    return False


def _area(mm) -> float:
    import numpy as np
    x, y = mm[:, 0], mm[:, 1]
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2.0)


def _lunghezza(mm, chiusa: bool) -> float:
    import numpy as np
    d = np.diff(mm, axis=0)
    tot = float(np.sum(np.hypot(d[:, 0], d[:, 1])))
    if chiusa and len(mm) > 2:
        tot += float(np.hypot(*(mm[0] - mm[-1])))
    return tot


def calcola(cal: dict, punti: list, algoritmo: str = "distanza") -> dict:
    import numpy as np

    if algoritmo == "distanza":
        mm, err = _in_mm(cal, punti, 2, 2)
        if err: return err
        if punti[0]["x"] == punti[1]["x"] and punti[0]["y"] == punti[1]["y"]:
            return {"stato": "punti_uguali"}
        return _fine(float(np.hypot(*(mm[1] - mm[0]))))
    if algoritmo == "polilinea":
        mm, err = _in_mm(cal, punti, 2, 200)
        if err: return err
        if not _distinti(mm): return {"stato": "punti_uguali"}
        return _fine(_lunghezza(mm, False))
    if algoritmo == "angolo":
        mm, err = _in_mm(cal, punti, 3, 3)
        if err: return err
        u, v = mm[0] - mm[1], mm[2] - mm[1]
        if not np.any(u) or not np.any(v): return {"stato": "punti_uguali"}
        incrociato = float(u[0] * v[1] - u[1] * v[0])
        return _fine(float(np.degrees(np.arctan2(abs(incrociato), float(np.dot(u, v))))))
    if algoritmo == "rettangolo":
        mm, err = _in_mm(cal, punti, 2, 2)
        if err: return err
        w, h = abs(mm[1][0] - mm[0][0]), abs(mm[1][1] - mm[0][1])
        if w == 0 or h == 0: return {"stato": "area_nulla"}
        return _fine(float(w * h))
    if algoritmo == "ellisse":
        mm, err = _in_mm(cal, punti, 2, 2)
        if err: return err
        a, b = abs(mm[1][0] - mm[0][0]) / 2, abs(mm[1][1] - mm[0][1]) / 2
        if a == 0 or b == 0: return {"stato": "area_nulla"}
        return _fine(float(np.pi * a * b))
    if algoritmo in ("poligono", "perimetro"):
        mm, err = _in_mm(cal, punti, 3, 500)
        if err: return err
        if not _distinti(mm): return {"stato": "punti_uguali"}
        if _intrecciato(mm): return {"stato": "poligono_intrecciato"}
        area = _area(mm)
        if algoritmo == "poligono":
            if area <= 0: return {"stato": "area_nulla"}
            return _fine(area)
        return _fine(_lunghezza(mm, True))
    if algoritmo == "punto":
        mm, err = _in_mm(cal, punti, 1, 1)
        if err: return err
        return {"stato": "ok", "mm": float(mm[0][0]), "y_mm": float(mm[0][1])}
    return {"stato": "algoritmo_sconosciuto"}


def _fine(v: float) -> dict:
    return {"stato": "ok", "mm": v} if math.isfinite(v) else {"stato": "calcolo_non_finito"}


def distanza(cal: dict, punti: list) -> dict:
    return calcola(cal, punti, "distanza")


def main() -> int:
    try:
        dati = json.load(sys.stdin)
    except Exception:  # noqa: BLE001
        json.dump({"stato": "ingresso_non_valido"}, sys.stdout); return 1
    json.dump(calcola(dati.get("calibrazione"), dati.get("punti"), str(dati.get("algoritmo") or "distanza")), sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
