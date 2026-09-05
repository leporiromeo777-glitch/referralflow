#!/usr/bin/env python3
"""Indice locale dei farmaci svizzeri dai dati aperti Swissmedic (OGD).

Legge ~/referti-pipeline/dati/OGD.zip (scaricato dal portale dati aperti
di Swissmedic, licenza «terms_open»: nessun dato paziente, solo il
registro pubblico dei medicamenti omologati) e produce
~/referti-pipeline/dati/farmaci-ch.json con:

  nomi:     nome commerciale (minuscolo, senza dosaggio) → {atc, dosi[], principi[]}
  principi: principio attivo (latino DCI + varianti italiane) → {atc, nomi[]}
  simili:   coppie di nomi commerciali che si somigliano (LASA: look-alike
            sound-alike) ma hanno ATC diversi — quelle che una trascrizione
            può confondere

Uso: python3 farmaci-swissmedic.py [OGD.zip] [farmaci-ch.json]
Il file prodotto serve alla catena (controllo_farmaci in pipeline.py):
avvisi, mai correzioni automatiche.
"""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date

ZIP = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/referti-pipeline/dati/OGD.zip")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~/referti-pipeline/dati/farmaci-ch.json")

z = zipfile.ZipFile(ZIP)


def righe(nome):
    root = ET.fromstring(z.read(nome))
    for el in root.iter():
        if len(el) and all(len(c) == 0 for c in el):
            yield {c.tag.split('}')[-1].upper(): (c.text or '').strip() for c in el}


# ——— nome commerciale «di base»: prima della virgola, senza dosaggi ———
UNITA = r"(?:mg|mcg|µg|ug|g|ml|l|ui|ie|i\.e\.|e|mmol|mio|%|microgramm\w*|milligramm\w*)"
RE_DOSE = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:/\s*\d+(?:[.,]\d+)?\s*)?" + UNITA + r"?\b", re.I)
RE_PULISCI = re.compile(r"[®™]|\(.*?\)|\s+-\s+.*$")
FORME = {"tabletten", "filmtabletten", "kapseln", "tropfen", "sirup", "salbe", "creme", "gel",
         "injektionslösung", "infusionslösung", "retardtabletten", "brausetabletten",
         "lutschtabletten", "kautabletten", "suppositorien", "pulver", "lösung", "spray",
         "pflaster", "granulat", "ampullen", "depot", "retard", "forte", "mite", "plus",
         "comp", "compositum", "duo", "uno", "junior", "kinder", "erwachsene", "n", "neo"}


RE_NUMERI_NOME = re.compile(r"(?<![\w.,])(\d+(?:[.,]\d+)?)(?=\s*(?:mg|mcg|µg|g|ml|/|\b))", re.I)


def numeri_nel_nome(nome_completo):
    out = set()
    for m in RE_NUMERI_NOME.finditer(nome_completo.split(",")[0]):
        v = m.group(1).replace(",", ".")
        try:
            f = float(v)
        except ValueError:
            continue
        if 0 < f < 5000:
            out.add(("%g" % f))
    return out


def nome_base(nome_completo):
    n = RE_PULISCI.sub(" ", nome_completo.split(",")[0])
    n = RE_DOSE.sub(" ", n)
    parole = [p for p in re.split(r"[\s/]+", n.lower()) if p]
    parole = [p for p in parole if re.search(r"[a-zäöüéèàç]", p)]
    # via le forme farmaceutiche e i suffissi commerciali in coda
    while len(parole) > 1 and (parole[-1] in FORME or re.fullmatch(r"\d+", parole[-1])):
        parole.pop()
    if not parole:
        return None
    base = " ".join(parole[:2]) if len(parole) >= 2 and parole[1] not in FORME and len(parole[1]) > 2 else parole[0]
    base = base.strip(" -.")
    return base if len(base) >= 4 else None


# ——— preparati omologati per uso umano ———
prep = {}
for r in righe("OGD-Praeparate.XML"):
    if r.get("VERWENDUNG") != "HAM" or r.get("ZULASSUNGSSTATUS") != "Z":
        continue
    prep[r["ZULASSUNGSNUMMER"]] = {
        "nome": r.get("PRAEPARATENAME", ""),
        "atc": r.get("ATC_CODE", ""),
        "forma": r.get("ARZNEIFORM", ""),
        "numeri": numeri_nel_nome(r.get("PRAEPARATENAME", "")),
    }
for r in righe("OGD-Sequenzen.XML"):
    zn = r.get("ZULASSUNGSNUMMER")
    if zn in prep and r.get("ZULASSUNGSSTATUS") == "Z":
        prep[zn]["numeri"] |= numeri_nel_nome(r.get("SEQUENZNAME", ""))
print("preparati umani omologati:", len(prep))

# ——— principi attivi: stoff_id → nome DCI (latino) ———
sinonimi = defaultdict(set)
for r in righe("OGD-Stoff-Synonyme.XML"):
    s = r.get("STOFFSYNONYM", "").strip().lower()
    if not s or len(s) < 4:
        continue
    q = r.get("QUELLE", "")
    if q in ("DCI", "INN", "PhEur", "PH", "USAN", "BAN", "DCF") or r.get("SYNONYM_CODE") == "LN":
        sinonimi[r["STOFF_ID"]].add(s)

# ——— dichiarazioni: dosi dei principi attivi per (omologazione, sequenza) ———
dosi = defaultdict(set)          # zulassung → {"10 mg", ...}
principi_di = defaultdict(set)   # zulassung → {stoff_id}
for r in righe("OGD-Deklarationen.XML"):
    if r.get("STOFFKATEGORIE") != "WIRKS":
        continue
    zn = r.get("ZULASSUNGSNUMMER")
    if zn not in prep:
        continue
    principi_di[zn].add(r.get("STOFF_ID", ""))
    m, u = r.get("MENGE", ""), r.get("MENGEN_EINHEIT", "").lower()
    if m and u and re.fullmatch(r"[\d.,]+", m):
        m = m.replace(",", ".")
        if m.endswith(".0"):
            m = m[:-2]
        u = {"ug": "mcg", "µg": "mcg"}.get(u, u)
        dosi[zn].add(f"{m} {u}")


# ——— varianti italiane del nome DCI latino ———
ECCIPIENTI = {"natri", "kali", "calci", "magnesi", "aqua", "glucos", "glucosum", "ethanol",
              "saccharum", "lactos", "acidum", "acid", "oleum", "extractum", "extract",
              "hydrochlorid", "hydrochloride", "hydrochloridum", "sulfas", "fumaras",
              "succinas", "maleas", "tartras", "mesilas", "besilas", "chloridum", "chlorid"}


def varianti_italiane(latino):
    out = {latino}
    prima = latino.split()[0]
    if len(latino.split()) > 1 and prima.endswith("i") and len(prima) > 5:
        # genitivo del sale: «amiodaroni hydrochloridum» → nominativo «amiodaronum»
        return varianti_italiane(prima[:-1] + "um") | {latino}
    s = latino
    if s.endswith("um"):
        s = s[:-2]
    if s in ECCIPIENTI:
        return set()
    out.add(s)
    if s.endswith("in"):
        out.add(s + "a")          # atorvastatinum → atorvastatina
    if s.endswith("ol"):
        out.add(s + "o")          # bisoprololum → bisoprololo
    if s.endswith("id"):
        out.add(s + "e")          # torasemidum → torasemide
    if s.endswith("an"):
        out.add(s + "o")          # valsartanum → valsartano
    if s.endswith("il"):
        out.add(s + "e")          # ramiprilum → ramiprile (e ramipril)
    if s.endswith("at"):
        out.add(s + "o")          # clopidogrelum no; ma «fumarat» → fumarato
    if s.endswith("on"):
        out.add(s + "e")          # amiodaronum → amiodarone
    if s.endswith("ur"):
        out.add(s + "o")
    return {v for v in out if len(v) >= 5}


nomi = {}
principi = {}
for zn, p in prep.items():
    base = nome_base(p["nome"])
    if not base:
        continue
    voce = nomi.setdefault(base, {"atc": p["atc"], "dosi": set(), "principi": set(), "numeri_nome": set()})
    voce["dosi"] |= dosi.get(zn, set())
    voce["numeri_nome"] |= p["numeri"]
    for sid in principi_di.get(zn, ()):
        for lat in sinonimi.get(sid, ()):
            for v in varianti_italiane(lat):
                voce["principi"].add(v)
                pv = principi.setdefault(v, {"atc": p["atc"], "nomi": set(), "dosi": set(), "numeri_nome": set()})
                pv["nomi"].add(base)
                pv["dosi"] |= dosi.get(zn, set())
                pv["numeri_nome"] |= p["numeri"]

# alias con la sola prima parola per i generici «principio + ditta»: la prima
# parola vale da sola se è un principio attivo noto o se apre almeno due
# nomi diversi con lo stesso ATC («torasemid sandoz», «torasemid mepha»…)
prime = defaultdict(list)
for k in list(nomi):
    if " " in k:
        prime[k.split()[0]].append(k)
for prima, chiavi in prime.items():
    if len(prima) < 5 or prima in nomi:
        continue
    atcs = {nomi[k]["atc"] for k in chiavi}
    if prima in principi or (len(chiavi) >= 2 and len(atcs) == 1):
        voce = {"atc": nomi[chiavi[0]]["atc"], "dosi": set(), "principi": set(), "numeri_nome": set()}
        for k in chiavi:
            voce["dosi"] |= set(nomi[k]["dosi"])
            voce["principi"] |= set(nomi[k]["principi"])
            voce["numeri_nome"] |= set(nomi[k]["numeri_nome"])
        nomi[prima] = voce

# limita le liste (i nomi generici come «paracetamolum» hanno centinaia di marche)
for v in nomi.values():
    v["dosi"] = sorted(v["dosi"], key=lambda d: (d.split()[1], float(d.split()[0])))[:40]
    v["principi"] = sorted(v["principi"])[:12]
    v["numeri_nome"] = sorted(v["numeri_nome"], key=float)[:40]
for v in principi.values():
    v["nomi"] = sorted(v["nomi"])[:30]
    v["dosi"] = sorted(v["dosi"], key=lambda d: (d.split()[1], float(d.split()[0])))[:40]
    v["numeri_nome"] = sorted(v["numeri_nome"], key=float)[:40]


# ——— coppie LASA: nomi commerciali diversi che si somigliano ———
def distanza(a, b, max_d=2):
    if abs(len(a) - len(b)) > max_d:
        return max_d + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > max_d:
            return max_d + 1
        prev = cur
    return prev[-1]


simili = []
lista = sorted(n for n in nomi if " " not in n and 5 <= len(n) <= 14)
per_prefisso = defaultdict(list)
for n in lista:
    per_prefisso[n[:2]].append(n)
for n in lista:
    for m in per_prefisso[n[:2]]:
        if m <= n:
            continue
        if nomi[n]["atc"][:4] == nomi[m]["atc"][:4]:
            continue  # stesso gruppo terapeutico: confonderli è meno grave
        soglia = 2 if min(len(n), len(m)) >= 8 else 1
        if distanza(n, m, soglia) <= soglia:
            simili.append([n, m])
print("nomi:", len(nomi), "principi:", len(principi), "coppie simili:", len(simili))

out = {
    "generato": date.today().isoformat(),
    "fonte": "Swissmedic, dati aperti (OGD) elenco medicamenti omologati per uso umano",
    "nomi": nomi,
    "principi": principi,
    "simili": simili,
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("scritto", OUT, os.path.getsize(OUT) // 1024, "KB")
for k in ("torem", "eliquis", "xarelto", "entresto", "concor", "beloc zok", "aspirin cardio", "atorvastatin", "lisinopril", "cordarone"):
    print(" ", k, "→", json.dumps(nomi.get(k), ensure_ascii=False)[:160])
for k in ("torasemide", "apixaban", "bisoprololo", "amiodarone", "metoprolol"):
    v = principi.get(k)
    print(" ", k, "→", (json.dumps({"atc": v["atc"], "nomi": v["nomi"][:6], "dosi": v["dosi"][:8]}, ensure_ascii=False) if v else None))
