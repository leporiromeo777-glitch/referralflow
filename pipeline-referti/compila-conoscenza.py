#!/usr/bin/env python3
"""Compila la conoscenza per gli agenti dalla wiki (docs/wiki/Agenti/*.md,
11.9.2026) nei file che la catena legge davvero:

  - medici.json           ← pagine con `medico:` nell'intestazione:
                            «## Come detta» → contesto, «## Frasi fisse» → frasi_fisse,
                            «## Farmaci frequenti» → farmaci_frequenti
  - conoscenza-agenti.json ← pagine con `agente:`:
                            «## A cosa fare attenzione» → attenzione[], «## Esempi» →
                            esempi[{titolo, dato, risposta}]

La catena NON legge la wiki: legge questi file. Solo testo sintetico.
Uso: python3.14 compila-conoscenza.py [--verifica]   (--verifica: exit 1 se i
file compilati non coincidono con le pagine, senza scrivere nulla)."""
from __future__ import annotations
import json, re, sys
from pathlib import Path

QUI = Path(__file__).resolve().parent
WIKI = QUI.parent / "docs" / "wiki" / "Agenti"
MEDICI = QUI / "medici.json"
CONOSCENZA = QUI / "conoscenza-agenti.json"


def intestazione(testo: str) -> tuple[dict, str]:
    m = re.match(r"^---\n(.*?)\n---\n", testo, re.S)
    if not m:
        return {}, testo
    meta = {}
    for riga in m.group(1).splitlines():
        if ":" in riga:
            k, v = riga.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, testo[m.end():]


def sezioni(corpo: str) -> dict[str, str]:
    """{titolo di secondo livello: testo della sezione}."""
    fuori: dict[str, str] = {}
    titolo = None
    righe: list[str] = []
    for r in corpo.splitlines():
        if r.startswith("## "):
            if titolo is not None:
                fuori[titolo] = "\n".join(righe).strip()
            titolo, righe = r[3:].strip().lower(), []
        elif titolo is not None:
            righe.append(r)
    if titolo is not None:
        fuori[titolo] = "\n".join(righe).strip()
    return fuori


def elenco(testo: str) -> list[str]:
    voci = [re.sub(r"^[-*]\s+", "", r).strip() for r in testo.splitlines() if r.strip().startswith(("-", "*"))]
    return [v for v in voci if v]


def paragrafo(testo: str) -> str:
    return re.sub(r"\s+", " ", " ".join(r for r in testo.splitlines() if r.strip() and not r.strip().startswith("#"))).strip()


def farmaci(testo: str) -> list[str]:
    voci = elenco(testo) or [x.strip() for x in re.split(r",(?![^()]*\))", paragrafo(testo))]
    return [v for v in voci if v]


def esempi(testo: str) -> list[dict]:
    fuori: list[dict] = []
    titolo = None
    dato = risposta = ""
    for r in testo.splitlines() + ["### "]:
        if r.startswith("### "):
            if titolo is not None and dato and risposta:
                fuori.append({"titolo": titolo, "dato": dato, "risposta": risposta})
            titolo, dato, risposta = r[4:].strip(), "", ""
        elif r.startswith("Dato:"):
            dato = r[5:].strip()
        elif r.startswith("Risposta giusta:"):
            risposta = r[16:].strip()
    return fuori


def compila() -> tuple[dict, dict]:
    medici = json.loads(MEDICI.read_text(encoding="utf-8"))
    agenti: dict[str, dict] = {}
    if not WIKI.is_dir():
        raise SystemExit(f"cartella della wiki non trovata: {WIKI}")
    for p in sorted(WIKI.glob("*.md")):
        meta, corpo = intestazione(p.read_text(encoding="utf-8"))
        sez = sezioni(corpo)
        if meta.get("medico"):
            mid = meta["medico"].strip().lower()
            prof = next((m for m in medici.get("medici", []) if m.get("id") == mid), None)
            if prof is None:
                print(f"avviso: pagina {p.name} per un medico non in medici.json ({mid}): ignorata")
                continue
            if "come detta" in sez:
                prof["contesto"] = paragrafo(sez["come detta"])
            if "frasi fisse" in sez:
                prof["frasi_fisse"] = elenco(sez["frasi fisse"])
            if "farmaci frequenti" in sez:
                prof["farmaci_frequenti"] = farmaci(sez["farmaci frequenti"])
        elif meta.get("agente"):
            nome = meta["agente"].strip().lower()
            voce = {"attenzione": elenco(sez.get("a cosa fare attenzione", "")), "esempi": esempi(sez.get("esempi", ""))}
            # Mai cifre di pazienti qui: sono esempi finti, ma la regola del
            # dizionario (niente voci con numeri) non si applica agli esempi.
            agenti[nome] = voce
    return medici, agenti


def main(argv: list[str]) -> int:
    medici, agenti = compila()
    testo_medici = json.dumps(medici, ensure_ascii=False, indent=2) + "\n"
    testo_agenti = json.dumps(agenti, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if "--verifica" in argv:
        ok = MEDICI.read_text(encoding="utf-8") == testo_medici and CONOSCENZA.is_file() and CONOSCENZA.read_text(encoding="utf-8") == testo_agenti
        print("conoscenza: " + ("allineata alla wiki" if ok else "NON allineata: esegui compila-conoscenza.py"))
        return 0 if ok else 1
    cambiati = []
    if MEDICI.read_text(encoding="utf-8") != testo_medici:
        MEDICI.write_text(testo_medici, encoding="utf-8"); cambiati.append(MEDICI.name)
    if not CONOSCENZA.is_file() or CONOSCENZA.read_text(encoding="utf-8") != testo_agenti:
        CONOSCENZA.write_text(testo_agenti, encoding="utf-8"); cambiati.append(CONOSCENZA.name)
    n_es = sum(len(v["esempi"]) for v in agenti.values())
    n_att = sum(len(v["attenzione"]) for v in agenti.values())
    print(f"agenti {len(agenti)} · esempi {n_es} · attenzioni {n_att} · medici {len(medici.get('medici', []))} · scritti: {', '.join(cambiati) or 'nessuno (già allineati)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
