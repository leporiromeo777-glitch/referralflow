#!/usr/bin/env python3
"""Prova end-to-end del righello (piano di validazione §1).

Si lancia contro un server di PROVA sul database demo, mai contro quello dello
studio: importa due DICOM sintetici (eco 0,2 mm/px, TAC 0,5 mm/px), misura,
controlla i rifiuti, l'annullamento e il CSV, poi tocca a chi la lancia
cancellare gli esami «Prova righello sintetica» dal DB demo.

    python3 scripts/prova-righello-e2e.py <cartella con eco.dcm e tac.dcm> <cookie rf_session=...> <http://localhost:3001/api/prototipo/imaging>

I file sintetici si generano con lo stesso codice di imaging/prova-calibrazione.py
(vedi docs/legale/dispositivo-in-house/piano-validazione.md).
"""
import sys, json, subprocess
S, C, U = sys.argv[1:4]
def curl(*a):
    out = subprocess.run(["curl", "-s", "-b", C, *a], capture_output=True, text=True).stdout
    try: return json.loads(out)
    except Exception: return out
esami = [l.split() for l in open(f"{S}/esami.txt").read().strip().splitlines()]
ok = True
def check(nome, cond, extra=""):
    global ok
    print(("ok  " if cond else "NO  ") + nome + ("" if cond else f" — {extra}"))
    ok = ok and cond
for eid, mod, *_ in esami:
    d = curl(f"{U}/{eid}")
    img = [i for s in d["serie"] for i in s["immagini"]][0]
    cal = img["calibrazione"]
    check(f"{mod}: calibrazione in tabella", bool(cal) and cal["tipo"] in ("us_regioni", "pixel_spacing"), json.dumps(cal))
    y = 300 if mod == "US" else 256
    atteso = 20.0 if mod == "US" else 50.0
    r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"immagine_id": img["id"], "frame": 0, "punti": [{"x": 200, "y": y}, {"x": 300, "y": y}], "etichetta": f"barra {mod}"}), f"{U}/misure")
    check(f"{mod}: 100 px → {atteso} mm (server)", isinstance(r, dict) and r.get("ok") and abs(r["valore"] - atteso) < 1e-6, json.dumps(r))
    mid = None
    if mod == "US":
        r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"immagine_id": img["id"], "frame": 0, "punti": [{"x": 10, "y": 10}, {"x": 300, "y": 300}]}), f"{U}/misure")
        check("US: punto fuori regione → rifiutato", isinstance(r, dict) and r.get("errore") == "fuori_regione", json.dumps(r))
        r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"immagine_id": img["id"], "frame": 0, "punti": [{"x": 402, "y": 100}, {"x": 402, "y": 300}], "etichetta": "barra verticale"}), f"{U}/misure")
        check("US: 200 px verticali → 40 mm", isinstance(r, dict) and r.get("ok") and abs(r["valore"] - 40) < 1e-6, json.dumps(r))
        mid = r.get("id")
    r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"immagine_id": img["id"], "frame": 0, "punti": [{"x": 200, "y": y}, {"x": 200, "y": y}]}), f"{U}/misure")
    check(f"{mod}: punti uguali → rifiutato", isinstance(r, dict) and r.get("errore") == "punti_uguali", json.dumps(r))
    r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"immagine_id": img["id"], "frame": 3, "punti": [{"x": 1, "y": 1}, {"x": 2, "y": 2}]}), f"{U}/misure")
    check(f"{mod}: fotogramma inesistente → rifiutato", isinstance(r, dict) and r.get("errore") == "fotogramma_non_valido", json.dumps(r))
    d = curl(f"{U}/{eid}")
    mm = d["misure_manuali"]
    check(f"{mod}: le misure tornano nel dettaglio con chi e punti", len(mm) >= 1 and mm[0]["chi"] == "medico" and len(mm[0]["punti"]) == 2, json.dumps(mm)[:300])
    check(f"{mod}: accesso 'misurato' nel registro", any(a["azione"] == "misurato" for a in d["accessi"]))
    if mod == "US" and mid:
        r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"azione": "annulla", "id": mid}), f"{U}/misure")
        d = curl(f"{U}/{eid}")
        ann = [m for m in d["misure_manuali"] if m["id"] == mid][0]
        check("US: annullamento registrato con chi e quando", r.get("ok") and ann["annullata_at"] and ann["annullata_da"] == "medico")
        r = curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps({"azione": "annulla", "id": mid}), f"{U}/misure")
        check("US: non si annulla due volte", r.get("errore") == "non_trovato", json.dumps(r))
csv = curl(f"{U}/misure?formato=csv")
check("CSV di validazione con intestazione e righe", isinstance(csv, str) and csv.startswith("﻿data_misura;") and csv.count("\n") >= 3, str(csv)[:120])
j = curl(f"{U}/misure")
check("riepilogo JSON", isinstance(j, dict) and j["riepilogo"]["totale"] >= 3 and j["riepilogo"]["annullate"] == 1, json.dumps(j.get("riepilogo")))
print("TUTTO OK" if ok else "CI SONO ERRORI")
