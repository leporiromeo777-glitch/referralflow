#!/usr/bin/env python3
"""Il doppio controllo del motore, provato (MSE fase 7).

Tremila casi casuali su tutti gli strumenti (TAC/RM con spacing, ecografie
con regioni sovrapposte, punti dentro e fuori): il calcolo A (mse/*.js in Node) e il calcolo B
(verifica-indipendente.py, numpy) devono dare lo stesso stato e, quando ok,
lo stesso numero entro 1e-9 relativo. Nessun dato di paziente.

    ~/.referralflow-imaging/bin/python imaging/prova-doppio-controllo.py
"""
from __future__ import annotations

import importlib.util
import json
import random
import subprocess
import sys
from pathlib import Path

QUI = Path(__file__).resolve().parent
RADICE = QUI.parent
spec = importlib.util.spec_from_file_location("verifica", QUI / "verifica-indipendente.py")
verifica = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifica)  # type: ignore[union-attr]

NODE = """
const fs = require('fs'), vm = require('vm'), path = require('path');
const c = {};
for (const m of ['mse/geometria.js', 'mse/misure.js', 'mse/validazione.js']) vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), 'public', 'prototipo', m), 'utf-8'), c, { filename: m });
const casi = JSON.parse(fs.readFileSync(0, 'utf-8'));
const out = casi.map(k => { const e = c.RFMSE.misure.ALGORITMI[k.algoritmo].calcola(k.calibrazione, k.punti); return { stato: e.stato, mm: e.stato === 'ok' ? (k.algoritmo === 'punto' ? e.extra.x_mm : e.valore) : null }; });
process.stdout.write(JSON.stringify(out));
"""


def caso(rng: random.Random) -> dict:
    tipo = rng.choice(["ct", "eco", "eco", "nessuna", "rivelatore"])
    righe, colonne = rng.randint(64, 2048), rng.randint(64, 2048)
    def punto(dentro=True):
        if dentro:
            return {"x": rng.uniform(0, colonne), "y": rng.uniform(0, righe)}
        return {"x": rng.uniform(-50, colonne + 50), "y": rng.uniform(-50, righe + 50)}
    if tipo == "ct":
        cal = {"tipo": "pixel_spacing", "righe": righe, "colonne": colonne, "regioni": [],
               "spacing": {"dx_mm": rng.uniform(0.05, 3), "dy_mm": rng.uniform(0.05, 3)}}
    elif tipo == "eco":
        regioni = []
        for k in range(rng.randint(1, 4)):
            x0, y0 = rng.randint(0, colonne - 10), rng.randint(0, righe - 10)
            regioni.append({"indice": k, "x0": x0, "y0": y0, "x1": rng.randint(x0 + 5, colonne), "y1": rng.randint(y0 + 5, righe),
                            "dx_mm": rng.choice([0.1, 0.2, 0.25, rng.uniform(0.02, 1)]), "dy_mm": rng.choice([0.1, 0.2, 0.25, rng.uniform(0.02, 1)]),
                            "tipo": rng.choice(["tessuto", "color_flow"]), "priorita_alta": rng.choice([True, False, True])})
        cal = {"tipo": "us_regioni", "righe": righe, "colonne": colonne, "regioni": regioni, "spacing": None}
    elif tipo == "nessuna":
        cal = {"tipo": "nessuna", "righe": righe, "colonne": colonne, "regioni": [], "spacing": None}
    else:
        cal = {"tipo": "imager_pixel_spacing", "righe": righe, "colonne": colonne, "regioni": [], "spacing": {"dx_mm": 0.1, "dy_mm": 0.1}}
    algoritmo = rng.choice(["distanza", "distanza", "polilinea", "angolo", "rettangolo", "ellisse", "poligono", "perimetro", "punto"])
    quanti = {"distanza": 2, "angolo": 3, "rettangolo": 2, "ellisse": 2, "punto": 1}.get(algoritmo, rng.randint(3, 8))
    if algoritmo == "polilinea": quanti = rng.randint(2, 8)
    dentro_regione = tipo == "eco" and rng.random() < 0.7
    def gen():
        if dentro_regione:
            r = cal["regioni"][0]
            return {"x": rng.uniform(r["x0"], r["x1"]), "y": rng.uniform(r["y0"], r["y1"])}
        return punto(rng.random() < 0.9)
    punti = [gen() for _ in range(quanti)]
    if rng.random() < 0.03 and quanti > 1:
        punti[1] = dict(punti[0])
    return {"calibrazione": cal, "punti": punti, "algoritmo": algoritmo}


def main() -> int:
    rng = random.Random(20260919)
    casi = [caso(rng) for _ in range(3000)]
    out = subprocess.run(["node", "-e", NODE], input=json.dumps(casi), capture_output=True, text=True, cwd=RADICE)
    if out.returncode != 0:
        print("node non riuscito:", out.stderr[:400]); return 1
    a = json.loads(out.stdout)
    diversi = 0; ok = 0; rifiuti = 0
    for k, ra in zip(casi, a):
        rb = verifica.calcola(k["calibrazione"], k["punti"], k["algoritmo"])
        if ra["stato"] != rb["stato"]:
            diversi += 1
            if diversi <= 5: print("  stato diverso:", ra, rb, json.dumps(k)[:200])
            continue
        if ra["stato"] == "ok":
            tol = 1e-9 * max(1.0, abs(ra["mm"]))
            if abs(ra["mm"] - rb["mm"]) > tol:
                diversi += 1
                if diversi <= 5: print("  valore diverso:", ra["mm"], rb["mm"])
            else:
                ok += 1
        else:
            rifiuti += 1
    print(f"prova-doppio-controllo: {len(casi)} casi, {ok} misure coincidenti, {rifiuti} rifiuti coincidenti, {diversi} divergenze")
    print("TUTTO OK" if diversi == 0 and ok > 800 else "CI SONO DIVERGENZE")
    return 0 if diversi == 0 and ok > 800 else 1


if __name__ == "__main__":
    sys.exit(main())
