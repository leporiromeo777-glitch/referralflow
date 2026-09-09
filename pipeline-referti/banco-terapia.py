#!/usr/bin/env python3
"""Banco della terapia dettata (9.9.2026): dettati FINTI con terapie dettate
in modi diversi e le righe attese nel formato della segretaria. Misura la
traduzione delle posologie e le guardie (codice, gratis) e, con --modello,
l'estrazione del modello esterno (a pagamento). Nessun dato vero.
Uso: python3.14 banco-terapia.py [--modello]"""
from __future__ import annotations
import importlib.util, os, sys
from pathlib import Path

QUI = Path(__file__).resolve().parent
os.environ.setdefault("REFERTI_LOG_SILENZIOSO", "1")
spec = importlib.util.spec_from_file_location("pipeline", QUI / "pipeline.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
import logging
for nome in list(logging.Logger.manager.loggerDict) + [""]:
    logging.getLogger(nome).setLevel(logging.ERROR)

# (nome, dettato, voci come le estrarrebbe un modello perfetto, righe attese)
CASI = [
    ("posologie a parole",
     "Prosegue con Aspirina Cardio 100 mg una al mattino e Concor 2.5 mg mezza compressa la sera. Controllo fra 6 mesi.",
     [{"nome": "Aspirina Cardio", "dose": "100 mg", "posologia": "una al mattino", "stato": "in corso", "nota": ""},
      {"nome": "Concor", "dose": "2.5 mg", "posologia": "mezza compressa la sera", "stato": "in corso", "nota": ""}],
     ["ASPIRIN CARDIO 100 mg 1-0-0-0", "CONCOR 2.5 mg 0-0-1/2-0"]),
    ("schema dettato e cadenza",
     "Terapia: Xarelto 20 mg 0-0-1, Praluent 75 mg ogni due settimane per un mese poi 150 mg.",
     [{"nome": "Xarelto", "dose": "20 mg", "posologia": "0-0-1", "stato": "in corso", "nota": ""},
      {"nome": "Praluent", "dose": "75 mg", "posologia": "ogni due settimane", "stato": "nuovo", "nota": "per un mese poi 150 mg"}],
     ["XARELTO 20 mg 0-0-1-0", "PRALUENT 75 mg ogni due settimane (per un mese poi 150 mg)"]),
    ("sospeso e al bisogno",
     "Sospendo il Valsartan 160 mg. Continua Temesta 1 mg al bisogno e Pantoprazolo 20 mg al mattino.",
     [{"nome": "Valsartan", "dose": "160 mg", "posologia": "", "stato": "sospeso", "nota": ""},
      {"nome": "Temesta", "dose": "1 mg", "posologia": "al bisogno", "stato": "in corso", "nota": ""},
      {"nome": "Pantoprazolo", "dose": "20 mg", "posologia": "al mattino", "stato": "in corso", "nota": ""}],
     ["TEMESTA 1 mg al bisogno", "PANTOPRAZOLO 20 mg 1-0-0-0"]),
    # Caso delle GUARDIE: le voci simulate portano una dose che nel dettato non
    # c'è (2.5 invece di 5) e la riga deve cadere; col modello vero, che estrae
    # bene, la riga giusta è invece attesa.
    ("numero inventato dal modello",
     "Prosegue con Eliquis 5 mg mattina e sera.",
     [{"nome": "Eliquis", "dose": "2.5 mg", "posologia": "mattina e sera", "stato": "in corso", "nota": ""}],
     [], ["ELIQUIS 5 mg 1-0-1-0"]),
    ("nessuna terapia",
     "Il paziente sta bene e nega sintomi. Controllo fra 12 mesi.",
     [],
     []),
]


def confronta(nome_ctrl, estrai, col_modello=False):
    ok = 0
    for caso in CASI:
        nome, dettato, voci_perfette, attese = caso[:4]
        if col_modello and len(caso) > 4:
            attese = caso[4]
        voci = estrai(dettato, voci_perfette)
        righe, _t, dubbi = m.righe_terapia(voci, dettato)
        esatte = [r for r in attese if r in righe]
        esito = "OK " if righe == attese else "..."
        ok += righe == attese
        print(f"  {esito} {nome:32} attese {len(attese)} esatte {len(esatte)} in più {len(righe) - len(esatte)} dubbi {len(dubbi)}")
        if righe != attese:
            print(f"        ottenute: {righe}")
    print(f"{nome_ctrl}: {ok}/{len(CASI)} casi esatti\n")


def main(argv):
    print("CODICE (voci perfette → righe):")
    confronta("codice", lambda d, v: v)
    if "--modello" in argv:
        print("MODELLO esterno (estrazione + codice):")
        def dal_modello(d, _v):
            t = m.estrai_terapia(d, "banco-terapia")
            return t["voci_grezze"] if t and "voci_grezze" in t else _voci_grezze(d)
        confronta("modello", dal_modello, col_modello=True)
    return 0


def _voci_grezze(dettato):
    esito = m._anonimizza_per_esterno(dettato, "banco-terapia", con_mappa=True, riusa=False)
    if esito is None:
        return []
    anon, mappa = esito
    out = m._chiama_esterno_openai(m.PROMPT_TERAPIA.replace("{testo}", anon), "banco-terapia")
    dati = m._estrai_json(out) or {}
    def rip(s):
        for k, v in mappa.items():
            s = s.replace(k, v)
        return s
    return [{k: rip(str(v.get(k, ""))) for k in ("nome", "dose", "posologia", "stato", "nota")} for v in (dati.get("farmaci") or []) if isinstance(v, dict)]


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
