#!/usr/bin/env python3
"""Prova end-to-end del righello (piano di validazione §1; MSE fasi 2, 7, 8).

Si lancia contro un server di PROVA sul database demo, mai contro quello dello
studio. Importa DICOM sintetici (eco 0,2 mm/px; TAC 0,5 mm/px; CR con solo
ImagerPixelSpacing; TAC DERIVED), misura, controlla Gate, doppio controllo,
provenienza, eventi, etichetta, «rifai», CSV; poi tocca a chi la lancia
cancellare gli esami «Prova righello…» dal DB demo.

    python3 scripts/prova-righello-e2e.py <cartella con eco.dcm tac.dcm cr.dcm derivata.dcm> <cookie rf_session=...> <http://localhost:3001/api/prototipo/imaging>
"""
import json, subprocess, sys, time

S, C, U = sys.argv[1:4]
ok_tot = True
def curl(*a):
    out = subprocess.run(["curl", "-s", "-b", C, *a], capture_output=True, text=True).stdout
    try: return json.loads(out)
    except Exception: return out
def post(d):
    return curl("-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(d), f"{U}/misure")
def check(nome, cond, extra=""):
    global ok_tot
    print(("ok  " if cond else "NO  ") + nome + ("" if cond else f" — {str(extra)[:400]}"))
    ok_tot = ok_tot and bool(cond)

r = curl("-F", f"file=@{S}/eco.dcm", "-F", f"file=@{S}/tac.dcm", "-F", f"file=@{S}/cr.dcm", "-F", f"file=@{S}/derivata.dcm", U)
check("importazione dei 4 sintetici", isinstance(r, dict) and r.get("esami") == 4, r)
lista = curl(U)
esami = {e["descrizione"]: e for e in lista["esami"] if str(e.get("descrizione", "")).startswith("Prova righello")}
def img_di(desc):
    d = curl(f"{U}/{esami[desc]['id']}")
    return d, [i for s in d["serie"] for i in s["immagini"]][0]

# ── fase 1: geometria in tabella ──
d, us = img_di("Prova righello sintetica") if "Prova righello sintetica" in esami else (None, None)
# i due file eco/tac hanno la stessa descrizione: separiamoli per modalità
for desc, e in list(esami.items()):
    pass
per_mod = {}
for e in lista["esami"]:
    if str(e.get("descrizione", "")).startswith("Prova righello"):
        dd = curl(f"{U}/{e['id']}")
        im = [i for s in dd["serie"] for i in s["immagini"]][0]
        per_mod[(e["modalita"], e["descrizione"])] = (dd, im)
(dUS, us) = per_mod[("US", "Prova righello sintetica")]
(dCT, ct) = per_mod[("CT", "Prova righello sintetica")]
(dCR, cr) = per_mod[("CR", "Prova righello CR")]
(dDE, de) = per_mod[("CT", "Prova righello derivata")]
check("geometria completa in tabella (versione 1, regioni, sha256)", us["geometria"] and us["geometria"]["versione"] == 1 and len(us["geometria"]["regioni_us"]) == 1 and us["geometria"]["sha256_file"], us.get("geometria"))
check("contesto MSE nel dettaglio (caution_validati, versione_software, puo_misurare)", "mse" in dUS and isinstance(dUS["mse"]["caution_validati"], list) and dUS["mse"]["versione_software"] and dUS["mse"]["puo_misurare"] is True, dUS.get("mse"))

# ── fase 2/7: misure VALIDATED con doppio controllo ──
r = post({"immagine_id": us["id"], "frame": 0, "punti": [{"x": 200, "y": 300}, {"x": 300, "y": 300}], "etichetta": "barra US"})
check("US: 100 px → 20,0 mm, VALIDATED, doppio controllo ok", r.get("ok") and abs(r["valore"] - 20) < 1e-9 and r["stato"] == "VALIDATED" and r["verifica"]["esito"] == "ok" and r["verifica"]["scarto"] <= r["verifica"]["tolleranza"], r)
id_us = r.get("id")
r = post({"immagine_id": ct["id"], "frame": 0, "punti": [{"x": 200, "y": 256}, {"x": 300, "y": 256}], "etichetta": "barra CT"})
check("CT: 100 px → 50,0 mm, VALIDATED", r.get("ok") and abs(r["valore"] - 50) < 1e-9 and r["stato"] == "VALIDATED", r)
id_ct = r.get("id")
r = post({"immagine_id": us["id"], "frame": 0, "punti": [{"x": 402, "y": 100}, {"x": 402, "y": 300}], "etichetta": "barra verticale"})
check("US: 200 px verticali → 40,0 mm", r.get("ok") and abs(r["valore"] - 40) < 1e-9, r)
id_vert = r.get("id")

# ── fase 7: NOT_MEASURABLE e CAUTION bloccata ──
r = post({"immagine_id": cr["id"], "frame": 0, "punti": [{"x": 10, "y": 10}, {"x": 110, "y": 10}]})
check("CR (solo rivelatore): 422 NOT_MEASURABLE con motivi rivelatore + modalità", isinstance(r, dict) and r.get("stato") == "NOT_MEASURABLE" and "rivelatore" in r.get("motivi", []) and "modalita_non_validata" in r.get("motivi", []) and r.get("testi"), r)
r = post({"immagine_id": de["id"], "frame": 0, "punti": [{"x": 10, "y": 10}, {"x": 110, "y": 10}]})
check("TAC DERIVED: bloccata finché immagine_derivata non è nei CAUTION validati", isinstance(r, dict) and r.get("stato") == "NOT_MEASURABLE" and any(m.startswith("caution_non_validata:immagine_derivata") for m in r.get("motivi", [])), r)
r = post({"immagine_id": us["id"], "frame": 0, "punti": [{"x": 10, "y": 10}, {"x": 300, "y": 300}]})
check("US: punto fuori regione → 422 fuori_regione", r.get("errore") == "fuori_regione", r)
r = post({"immagine_id": us["id"], "frame": 0, "punti": [{"x": 200, "y": 300}, {"x": 200, "y": 300}]})
check("punti uguali → 422", r.get("errore") == "punti_uguali", r)
r = post({"immagine_id": us["id"], "frame": 3, "punti": [{"x": 1, "y": 1}, {"x": 2, "y": 2}]})
check("fotogramma inesistente → 422", r.get("errore") == "fotogramma_non_valido", r)

# ── fase 8: provenienza, eventi, etichetta, riferimento, rifai, annulla ──
p = curl(f"{U}/misure/{id_us}")
m = p.get("misura", {})
check("provenienza: punti fisici, valore mostrato, algoritmo+versioni, stato, verifica, geometria copiata, sha256, sop uid", m.get("punti_fisici") and m.get("valore_mostrato") == "20,0 mm" and m.get("algoritmo") == "distanza" and m.get("versione_algoritmo") == "1.0" and m.get("versione_gate") == "1.0" and m.get("versione_software") and m.get("stato_validazione") == "VALIDATED" and m.get("verifica_indipendente", {}).get("esito") == "ok" and m.get("geometria") and m.get("sha256_file") and m.get("sop_uid"), json.dumps(m)[:500])
check("evento «creata» con dopo", len(p.get("eventi", [])) == 1 and p["eventi"][0]["evento"] == "creata" and p["eventi"][0]["dopo"]["valore"] == 20 and p["eventi"][0]["chi"] == "medico", p.get("eventi"))
r = post({"azione": "etichetta", "id": id_us, "etichetta": "IVSd prova"})
p = curl(f"{U}/misure/{id_us}")
check("etichetta cambiata con evento prima/dopo", r.get("ok") and p["misura"]["etichetta"] == "IVSd prova" and p["eventi"][-1]["evento"] == "etichettata" and p["eventi"][-1]["prima"]["etichetta"] == "barra US" and p["eventi"][-1]["dopo"]["etichetta"] == "IVSd prova", p.get("eventi"))
r = post({"immagine_id": us["id"], "frame": 0, "punti": [{"x": 402, "y": 100}, {"x": 402, "y": 310}], "etichetta": "rifatta", "sostituisce_id": id_vert})
p_new = curl(f"{U}/misure/{r.get('id')}"); p_old = curl(f"{U}/misure/{id_vert}")
check("rifai: nuova misura lega la vecchia, la vecchia è annullata con evento «sostituita»", r.get("ok") and abs(r["valore"] - 42) < 1e-9 and p_new["misura"]["sostituisce_id"] == id_vert and p_old["misura"]["annullata_at"] and p_old["eventi"][-1]["evento"] == "sostituita" and p_old["sostituita_da"] == [r["id"]], (r, p_old.get("eventi")))
r = post({"azione": "annulla", "id": id_ct, "motivo": "prova"})
p = curl(f"{U}/misure/{id_ct}")
check("annulla: evento «annullata» con motivo", r.get("ok") and p["misura"]["annullata_at"] and p["eventi"][-1]["evento"] == "annullata" and p["eventi"][-1]["dopo"]["motivo"] == "prova", p.get("eventi"))
check("non si annulla due volte", post({"azione": "annulla", "id": id_ct}).get("errore") == "non_trovato")
check("sostituisce_id inesistente → 400", post({"immagine_id": us["id"], "frame": 0, "punti": [{"x": 200, "y": 300}, {"x": 250, "y": 300}], "sostituisce_id": "00000000-0000-4000-8000-000000000000"}).get("errore") == "sostituisce_non_valido")
dd = curl(f"{U}/{esami['Prova righello sintetica']['id']}") if False else curl(f"{U}/{dUS['esame']['id']}")
mm = dd["misure_manuali"]
check("dettaglio: stato, verifica_ok, sostituisce_id, valore_mostrato nelle misure", any(x["stato_validazione"] == "VALIDATED" and x["verifica_ok"] is True for x in mm) and any(x["sostituisce_id"] == id_vert for x in mm) and all(x.get("valore_mostrato") for x in mm), json.dumps(mm)[:400])
check("registro accessi «misurato»", any(a["azione"] == "misurato" for a in dd["accessi"]))
csv = curl(f"{U}/misure?formato=csv")
check("CSV con stato e versioni", isinstance(csv, str) and ";stato;versione_algoritmo;versione_software;" in csv and csv.count("\n") >= 4, str(csv)[:200])
j = curl(f"{U}/misure")
check("riepilogo JSON", isinstance(j, dict) and j["riepilogo"]["totale"] >= 4 and j["riepilogo"]["annullate"] >= 2, j.get("riepilogo"))
print("TUTTO OK" if ok_tot else "CI SONO ERRORI")
sys.exit(0 if ok_tot else 1)
