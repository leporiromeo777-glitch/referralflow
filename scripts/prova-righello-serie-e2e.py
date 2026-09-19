#!/usr/bin/env python3
"""Prova end-to-end della fase 9 (serie, distanza 3D, volume, MPR) sul server di PROVA (DB demo).
    python3 scripts/prova-righello-serie-e2e.py <cartella con dicom-serie/> <cookie rf_session=...> <http://localhost:3001/api/prototipo/imaging>
La serie sintetica (8 fette assiali, passo 2 mm, Slice Thickness 3 apposta) si genera come in imaging/prova-mpr.py."""
import json, subprocess, sys, math, glob
S, C, U = sys.argv[1:4]
ok_tot = True
def curl(*a):
    out = subprocess.run(["curl", "-s", "-b", C, *a], capture_output=True, text=True).stdout
    try: return json.loads(out)
    except Exception: return out
def post(d): return curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(d), f"{U}/misure")
def check(nome, cond, extra=""):
    global ok_tot
    print(("ok  " if cond else "NO  ") + nome + ("" if cond else f" — {str(extra)[:400]}"))
    ok_tot = ok_tot and bool(cond)
args = []
for f in sorted(glob.glob(f"{S}/dicom-serie/*.dcm")): args += ["-F", f"file=@{f}"]
r = curl(*args, U)
check("importazione della serie sintetica (8 fette)", isinstance(r, dict) and r.get("immagini") == 8, r)
esame = [e for e in curl(U)["esami"] if e["descrizione"] == "Prova righello serie"][0]
d = curl(f"{U}/{esame['id']}")
sr = d["serie"][0]; g = sr.get("geometria") or {}
check("geometria di serie: 8 fette, assiale, passo reale 2 mm (non i 3 di Slice Thickness), uniforme, volume possibile", g.get("stato") == "ok" and g.get("n") == 8 and g.get("orientamento") == "assiale" and abs(g.get("distanza_media_mm", 0) - 2.0) < 1e-9 and g.get("uniforme") and g.get("volume_possibile"), g)
ordine = g["ordine"]
imgs = {i["id"]: i for i in sr["immagini"]}
check("ordine lungo la normale indipendente da InstanceNumber", len(ordine) == 8 and all(imgs[o]["geometria"]["spazio"]["ipp"][2] == k * 2.0 for k, o in enumerate(ordine)), [imgs[o]["geometria"]["spazio"]["ipp"][2] for o in ordine])
check("MPR dichiarato dal server: sagittale 64 indici, griglia 64×8, sp 0,5 × 2", sr.get("mpr") and sr["mpr"]["sagittale"]["n_indici"] == 64 and sr["mpr"]["sagittale"]["righe"] == 8 and sr["mpr"]["sagittale"]["sp_y"] == 2.0, sr.get("mpr"))
# distanza 3D fra la fetta 0 e la fetta 3: 80 px in x (40 mm) e 6 mm in z → 40,447 mm
r = post({"immagine_id": ordine[0], "frame": 0, "algoritmo": "distanza_3d", "punti": [{"x": 0, "y": 0, "immagine_id": ordine[0]}, {"x": 60, "y": 0, "immagine_id": ordine[3]}], "etichetta": "3D"})
check("distanza 3D fra due fette: sqrt(30² + 6²) = 30,594 mm, VALIDATED, doppio controllo", isinstance(r, dict) and r.get("ok") and abs(r["valore"] - math.sqrt(30**2 + 6**2)) < 1e-9 and r["stato"] == "VALIDATED" and r["verifica"]["esito"] == "ok" and r["extra"]["immagine_b"] == ordine[3], r)
id3d = r.get("id")
p = curl(f"{U}/misure/{id3d}")
check("provenienza 3D: coordinate paziente in extra", p["misura"]["extra"]["xyz_a"] == [0, 0, 0] and p["misura"]["extra"]["xyz_b"] == [30, 0, 6], p["misura"].get("extra"))
r = post({"immagine_id": ordine[0], "frame": 0, "algoritmo": "distanza_3d", "punti": [{"x": 0, "y": 0, "immagine_id": ordine[0]}, {"x": 0, "y": 0, "immagine_id": ordine[0]}]})
check("distanza 3D con punti uguali → rifiuto", isinstance(r, dict) and r.get("errore") == "punti_uguali", r)
r = post({"immagine_id": ordine[0], "frame": 0, "algoritmo": "distanza_3d", "punti": [{"x": 0, "y": 0, "immagine_id": ordine[0]}, {"x": 80, "y": 0, "immagine_id": ordine[3]}]})
check("distanza 3D con un punto fuori dall'immagine (x = 80 su 64) → fuori_immagine", isinstance(r, dict) and r.get("errore") == "fuori_immagine", r)
# poligoni su 3 fette consecutive (indici 2,3,4) → volume: bloccato dalla CAUTION non validata
ids = []
for k in (2, 3, 4):
    rr = post({"immagine_id": ordine[k], "frame": 0, "algoritmo": "poligono", "punti": [{"x": 10, "y": 20}, {"x": 30, "y": 20}, {"x": 30, "y": 40}, {"x": 10, "y": 40}], "etichetta": f"fetta {k}"})
    ids.append(rr.get("id"))
check("tre poligoni 10×10 mm su fette consecutive", all(ids) and rr.get("valore") == 100.0, rr)
r = post({"azione": "volume", "misure": ids, "etichetta": "blocco"})
check("volume: CAUTION «somma di fette» bloccata finché non validata (422)", isinstance(r, dict) and r.get("stato") == "NOT_MEASURABLE" and any(m.startswith("caution_non_validata:volume_per_somma_di_fette") for m in r.get("motivi", [])), r)
rr = post({"immagine_id": ordine[6], "frame": 0, "algoritmo": "poligono", "punti": [{"x": 10, "y": 20}, {"x": 30, "y": 20}, {"x": 30, "y": 40}], "etichetta": "fetta 6"})
r = post({"azione": "volume", "misure": ids + [rr.get("id")]})
check("volume con un salto di fetta → poligoni_non_consecutivi", isinstance(r, dict) and "poligoni_non_consecutivi" in r.get("motivi", []) or r.get("errore") == "poligoni_non_consecutivi", r)
r = post({"azione": "volume", "misure": ids[:1]})
check("volume con una sola ROI → volume_poche_fette", isinstance(r, dict) and r.get("errore") == "volume_poche_fette", r)
# MPR
info = curl(f"{U}/serie/{sr['id']}/mpr?info=1")
check("MPR info: sagittale e coronale, 8 fette", isinstance(info, dict) and info.get("n_fette") == 8 and info["coronale"]["n_indici"] == 64, info)
head = subprocess.run(["curl", "-s", "-b", C, "-o", "/dev/null", "-w", "%{http_code} %{content_type}", f"{U}/serie/{sr['id']}/mpr?piano=sagittale&indice=15&ww=1000&wl=500"], capture_output=True, text=True).stdout
check("MPR sagittale: PNG 200", head.startswith("200") and "image/png" in head, head)
hdr = subprocess.run(["curl", "-s", "-b", C, "-D", "-", "-o", "/dev/null", f"{U}/serie/{sr['id']}/mpr?piano=coronale&indice=25"], capture_output=True, text=True).stdout
check("MPR coronale: intestazione con la griglia virtuale", "x-rf-mpr" in hdr.lower() and "righe_virtuali" in hdr and "8" in hdr, hdr[:300])
# misura su un piano MPR: CAUTION «immagine ricostruita» bloccata
r = post({"immagine_id": ordine[0], "frame": 0, "algoritmo": "distanza", "punti": [{"x": 20, "y": 2}, {"x": 40, "y": 6}], "piano": {"tipo": "sagittale", "indice": 15}})
check("misura su MPR: bloccata dalla CAUTION «immagine ricostruita» (422) con la calibrazione virtuale del server", isinstance(r, dict) and r.get("stato") == "NOT_MEASURABLE" and any(m.startswith("caution_non_validata:immagine_ricostruita") for m in r.get("motivi", [])), r)
r = post({"immagine_id": ordine[0], "frame": 0, "algoritmo": "distanza", "punti": [{"x": 20, "y": 2}, {"x": 40, "y": 6}], "piano": {"tipo": "sagittale", "indice": 999}})
check("piano con indice fuori → 400", isinstance(r, dict) and r.get("errore") == "piano_non_valido", r)
r = post({"immagine_id": ordine[0], "frame": 0, "algoritmo": "distanza_3d", "punti": [{"x": 0, "y": 0}, {"x": 1, "y": 1}], "piano": {"tipo": "sagittale", "indice": 1}})
check("distanza 3D su MPR → 400", isinstance(r, dict) and r.get("errore") == "algoritmo_non_su_mpr", r)
d2 = curl(f"{U}/{esame['id']}")
check("dettaglio: la misura 3D ha tipo distanza_3d e strumenti dichiarati 10", any(m["tipo"] == "distanza_3d" for m in d2["misure_manuali"]) and len(d2["mse"]["strumenti"]) == 10, len(d2["mse"]["strumenti"]))
print("TUTTO OK" if ok_tot else "CI SONO ERRORI"); sys.exit(0 if ok_tot else 1)
