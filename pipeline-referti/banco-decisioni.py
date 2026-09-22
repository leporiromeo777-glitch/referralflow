#!/usr/bin/env python3
"""Banco delle decisioni tarate (22.9.2026): l'arbitro fra i due motori come
DECISIONE a risposte chiuse con una probabilità, invece che come testo da
generare (l'idea dei modelli «System One» tipo Jev, rifatta in locale).
Tre metodi sugli stessi casi FINTI (banco-arbitro.py + banco-decisioni-casi.py):

  generativo   l'arbitro di oggi: prompt PROMPT_ARBITRO, risposta JSON a/b/incerto
               (modello locale MODELLO_CORREZIONE), nessuna probabilità;
  probabilità  stesso prompt e stesso modello, ma la risposta è UNA lettera
               (A/B/C=incerto) e si leggono le probabilità di Ollama (logprobs);
               ogni caso gira due volte con A e B scambiate e si fa la media
               (toglie la preferenza di posizione, che si misura a parte);
  laya         Laya multilingue (Convai, Apache-2.0, 322M) nel venv dei banchi,
               anche lui con lo scambio.

Misure: giuste sui casi decidibili, astensioni, sicurezza sui casi
indecidibili (atteso «incerto»), Brier, errore di taratura (ECE) e, per le
soglie 0.8/0.9/0.95/0.99, quanti casi si potrebbero decidere da soli e con
che precisione. Tutto locale, 0 CHF. Si ferma da solo (e libera la memoria)
se arriva un dettato vero: la catena ha la precedenza.

Uso:  python3.14 banco-decisioni.py [--metodi generativo,probabilita,laya] [--limite N]
Esiti in ~/referti-dataset/banco-decisioni/<data>.json (casi finti)."""
from __future__ import annotations
import importlib.util, json, math, os, subprocess, sys, time, urllib.request
from datetime import datetime
from pathlib import Path

QUI = Path(__file__).resolve().parent
os.environ.setdefault("REFERTI_LOG_SILENZIOSO", "1")


def _carica(nome: str, file: str):
    spec = importlib.util.spec_from_file_location(nome, QUI / file)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


m = _carica("pipeline", "pipeline.py")
import logging
for nome in list(logging.Logger.manager.loggerDict) + [""]:
    logging.getLogger(nome).setLevel(logging.ERROR)

OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")
VENV_LAYA = Path.home() / "voxtral-banco-venv" / "bin" / "python"
USCITA = Path.home() / "referti-dataset" / "banco-decisioni"
CODA = [Path.home() / "referti" / "ingresso", Path.home() / "referti" / "lavorazione"]

ISTRUZIONE_LETTERA = """Rispondi con UNA SOLA lettera, senza altro testo:
A se è giusta la versione a,
B se è giusta la versione b,
C se nessuna delle due è chiaramente giusta (il punto resterà a una persona).

"""


def casi() -> list[tuple[str, str, str, str]]:
    vecchi = _carica("banco_arbitro", "banco-arbitro.py").CASI
    nuovi = _carica("banco_decisioni_casi", "banco-decisioni-casi.py").CASI_NUOVI
    # Le due guardie di codice (B vuota, numeri) non arrivano all'arbitro.
    return [("arbitro: " + n, a, b, att) for n, a, b, att in vecchi if not n.startswith("guardia")] + list(nuovi)


def punto(a: str, b: str) -> dict | None:
    """La divergenza come la vede l'arbitro in catena (stessi filtri)."""
    for d in m.confronta(a, b):
        va, vb = d.get("versione_a", ""), d.get("versione_b", "")
        if not vb or va == vb or m._numeri(va) != m._numeri(vb) or len(va) > 80 or len(vb) > 80:
            continue
        if not va and not d.get("contesto_prima"):
            continue
        return d
    return None


def testo_punto(d: dict, scambia: bool = False) -> str:
    va, vb = (d["versione_b"], d["versione_a"]) if scambia else (d["versione_a"], d["versione_b"])
    return (f'1) contesto: «{d["contesto"]}»\n   a: «{va}»\n   b: «{vb}»'
            + (f'\n   parole presenti da una parte sola: {", ".join(d["pesanti"])}' if d.get("pesanti") else ""))


def attendi_catena_libera() -> None:
    """Se la catena ha un dettato, si libera la memoria e si aspetta."""
    avvisato = False
    while any(p.is_dir() and any(x for x in p.iterdir() if not x.name.startswith(".")) for p in CODA):
        if not avvisato:
            print("  … dettato in arrivo: banco in pausa, modello scaricato", flush=True)
            _scarica_modello(); avvisato = True
        time.sleep(30)


def _scarica_modello() -> None:
    try:
        _post("/api/generate", {"model": m.MODELLO_CORREZIONE, "keep_alive": 0})
    except Exception:  # noqa: BLE001
        pass


def _post(via: str, corpo: dict, timeout: int = 900) -> dict:
    req = urllib.request.Request(OLLAMA + via, data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


# ── metodo 1: l'arbitro di oggi ──────────────────────────────────────────────
def generativo(d: dict) -> dict:
    attendi_catena_libera()
    t = time.monotonic()
    try:
        uscita = m.chiama_ollama(m._prompt_arbitro(testo_punto(d)), "banco-decisioni", "confronto",
                                 formato_json=True, modello=m.MODELLO_CORREZIONE, max_gettoni=800)
        scelte = json.loads(uscita).get("scelte") or []
        scelta = str(scelte[0].get("scelta", "incerto")) if scelte else "incerto"
    except Exception:  # noqa: BLE001
        scelta = "errore"
    return {"scelta": scelta if scelta in ("a", "b", "incerto") else "errore", "secondi": round(time.monotonic() - t, 1)}


# ── metodo 2: probabilità dal modello locale ─────────────────────────────────
def _prompt_lettera(d: dict, scambia: bool) -> str:
    base = m._prompt_arbitro(testo_punto(d, scambia))
    inizio = base.index("Rispondi SOLO con un oggetto JSON valido")
    fine = base.index("PUNTI:")
    return base[:inizio] + ISTRUZIONE_LETTERA + base[fine:]


def _prob_lettere(prompt: str) -> dict[str, float]:
    r = _post("/api/generate", {
        "model": m.MODELLO_CORREZIONE, "prompt": prompt, "stream": False, "think": False,
        "logprobs": True, "top_logprobs": 20,
        "options": {"temperature": 0, "num_predict": 1, "num_ctx": m.OLLAMA_NUM_CTX},
    })
    lp = (r.get("logprobs") or [{}])[0].get("top_logprobs") or []
    p = {"A": 0.0, "B": 0.0, "C": 0.0}
    for x in lp:
        k = str(x.get("token", "")).strip().upper()
        if k in p:
            p[k] += math.exp(float(x.get("logprob", -99)))
    return p


def probabilita(d: dict) -> dict:
    attendi_catena_libera()
    t = time.monotonic()
    p1 = _prob_lettere(_prompt_lettera(d, False))
    p2 = _prob_lettere(_prompt_lettera(d, True))
    s1, s2 = p1["A"] + p1["B"], p2["A"] + p2["B"]
    pb_dritto = p1["B"] / s1 if s1 else 0.5
    pb_scambio = p2["A"] / s2 if s2 else 0.5   # nello scambio la «b» vera è la lettera A
    return {"p_b": round((pb_dritto + pb_scambio) / 2, 4), "p_b_dritto": round(pb_dritto, 4),
            "p_b_scambio": round(pb_scambio, 4), "p_c": round((p1["C"] + p2["C"]) / 2, 4),
            "massa": round((s1 + p1["C"] + s2 + p2["C"]) / 2, 4), "secondi": round(time.monotonic() - t, 1)}


# ── metodo 3: Laya multilingue (processo a parte, nel venv con torch) ────────
PROG_LAYA = r'''
import json, sys, laya
ag = laya.load("convaiinnovations/laya-multilingual")
def pb(d, scambia):
    va, vb = (d["versione_b"], d["versione_a"]) if scambia else (d["versione_a"], d["versione_b"])
    corpo = f"Trascrizione di un dettato medico in italiano. Contesto: «{d['contesto']}». Due trascrizioni divergono in questo punto. Versione a: «{va}». Versione b: «{vb}»."
    q = {"scelta": {"type": "choice", "instructions": "Quale versione è la trascrizione giusta, italiano corretto e coerente col contesto medico?",
                    "criteria": {"a": f"versione a: «{va}»", "b": f"versione b: «{vb}»"}}}
    pr = ag.predict({"body": corpo}, q)["answers"]["scelta"]["probabilities"]
    return pr.get("b", 0.5) if not scambia else pr.get("a", 0.5)
out = []
for d in json.load(sys.stdin):
    x, y = pb(d, False), pb(d, True)
    out.append({"p_b": round((x + y) / 2, 4), "p_b_dritto": round(x, 4), "p_b_scambio": round(y, 4)})
print(json.dumps(out))
'''


def laya_tutti(punti: list[dict]) -> list[dict]:
    attendi_catena_libera()
    t = time.monotonic()
    r = subprocess.run([str(VENV_LAYA), "-c", PROG_LAYA], input=json.dumps(punti), capture_output=True, text=True, timeout=3600)
    if r.returncode != 0:
        print("  laya: errore\n" + r.stderr[-800:]); return [{} for _ in punti]
    out = json.loads(r.stdout.strip().splitlines()[-1])
    sec = round((time.monotonic() - t) / max(1, len(punti)), 2)
    for o in out:
        o["secondi"] = sec
    return out


# ── misure ───────────────────────────────────────────────────────────────────
def misure_prob(righe: list[dict], chiave: str = "p_b") -> dict:
    dec = [r for r in righe if r["atteso"] in ("a", "b") and chiave in r]
    ind = [r for r in righe if r["atteso"] == "incerto" and chiave in r]
    if not dec:
        return {}
    y = [1.0 if r["atteso"] == "b" else 0.0 for r in dec]
    p = [float(r[chiave]) for r in dec]
    giuste = sum(1 for yi, pi in zip(y, p) if (pi > 0.5) == (yi == 1.0))
    brier = sum((pi - yi) ** 2 for yi, pi in zip(y, p)) / len(dec)
    # ECE sulla sicurezza della scelta (max(p, 1-p)), 5 fasce da 0.5 a 1.
    fasce: dict[int, list[tuple[float, bool]]] = {}
    for yi, pi in zip(y, p):
        conf = max(pi, 1 - pi); ok = (pi > 0.5) == (yi == 1.0)
        fasce.setdefault(min(4, int((conf - 0.5) / 0.1)), []).append((conf, ok))
    ece = sum(len(v) / len(dec) * abs(sum(c for c, _ in v) / len(v) - sum(o for _, o in v) / len(v)) for v in fasce.values())
    soglie = {}
    for s in (0.8, 0.9, 0.95, 0.99):
        sopra = [(yi, pi) for yi, pi in zip(y, p) if max(pi, 1 - pi) >= s]
        ok = sum(1 for yi, pi in sopra if (pi > 0.5) == (yi == 1.0))
        falsi_sicuri = sum(1 for r in ind if max(float(r[chiave]), 1 - float(r[chiave])) >= s)
        soglie[str(s)] = {"decise_da_sole": f"{len(sopra)}/{len(dec)}", "giuste": f"{ok}/{len(sopra)}",
                          "indecidibili_prese_per_sicure": f"{falsi_sicuri}/{len(ind)}"}
    return {"giuste": f"{giuste}/{len(dec)}", "brier": round(brier, 3), "ece": round(ece, 3),
            "sicurezza_media_indecidibili": round(sum(max(float(r[chiave]), 1 - float(r[chiave])) for r in ind) / len(ind), 3) if ind else None,
            "soglie": soglie}


def misure_generativo(righe: list[dict]) -> dict:
    dec = [r for r in righe if r["atteso"] in ("a", "b")]
    ind = [r for r in righe if r["atteso"] == "incerto"]
    risp = [r for r in dec if r["scelta"] in ("a", "b")]
    return {"giuste": f"{sum(1 for r in dec if r['scelta'] == r['atteso'])}/{len(dec)}",
            "astenute": f"{sum(1 for r in dec if r['scelta'] == 'incerto')}/{len(dec)}",
            "sbagliate": f"{sum(1 for r in risp if r['scelta'] != r['atteso'])}/{len(dec)}",
            "errori": sum(1 for r in righe if r["scelta"] == "errore"),
            "indecidibili_decise": f"{sum(1 for r in ind if r['scelta'] in ('a', 'b'))}/{len(ind)}"}


def main(argv: list[str]) -> int:
    metodi = ["generativo", "probabilita", "laya"]
    lim = None
    for k, x in enumerate(argv):
        if x == "--metodi": metodi = argv[k + 1].split(",")
        if x == "--limite": lim = int(argv[k + 1])
    m._config_esterno = lambda: None
    m.CORREZIONE_ESTERNA = False
    m._CORSA["medico"] = "moccetti"   # contesto del medico come in catena
    tutti = casi()[:lim] if lim else casi()
    righe, punti = [], []
    for fam, a, b, att in tutti:
        d = punto(a, b)
        if d is None:
            print(f"  saltato (nessuna divergenza per l'arbitro): {fam}"); continue
        righe.append({"famiglia": fam.split(":")[0], "atteso": att}); punti.append(d)
    print(f"casi: {len(righe)} ({sum(r['atteso'] == 'incerto' for r in righe)} indecidibili) · modello locale {m.MODELLO_CORREZIONE}", flush=True)
    esiti: dict[str, dict] = {}
    if "laya" in metodi:
        for r, o in zip(righe, laya_tutti(punti)):
            r.update({f"laya_{k}": v for k, v in o.items()})
        esiti["laya"] = misure_prob(righe, "laya_p_b")
        esiti["laya (senza scambio)"] = misure_prob(righe, "laya_p_b_dritto")
        print("laya:", json.dumps(esiti["laya"], ensure_ascii=False), flush=True)
    for nome, f, pref in (("probabilita", probabilita, "prob_"), ("generativo", generativo, "gen_")):
        if nome not in metodi:
            continue
        t0 = time.monotonic()
        for k, (r, d) in enumerate(zip(righe, punti)):
            r.update({pref + kk: v for kk, v in f(d).items()})
            if k % 10 == 9:
                print(f"  {nome}: {k + 1}/{len(righe)} · {time.monotonic() - t0:.0f} s", flush=True)
        if nome == "probabilita":
            esiti["probabilita"] = misure_prob(righe, "prob_p_b")
            esiti["probabilita (senza scambio)"] = misure_prob(righe, "prob_p_b_dritto")
            esiti["preferenza_posizione"] = round(sum(r["prob_p_b_dritto"] - r["prob_p_b_scambio"] for r in righe) / len(righe), 3)
        else:
            esiti["generativo"] = misure_generativo([{**r, "scelta": r["gen_scelta"]} for r in righe])
        print(f"{nome}:", json.dumps(esiti.get(nome), ensure_ascii=False), flush=True)
    _scarica_modello()
    USCITA.mkdir(parents=True, exist_ok=True)
    f = USCITA / f"{datetime.now():%Y-%m-%d-%H%M}.json"
    f.write_text(json.dumps({"modello": m.MODELLO_CORREZIONE, "esiti": esiti, "righe": righe}, ensure_ascii=False, indent=1))
    print("\n" + json.dumps(esiti, ensure_ascii=False, indent=1))
    print(f"\nsalvato {f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
