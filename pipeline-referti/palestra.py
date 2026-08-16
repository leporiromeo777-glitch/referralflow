#!/usr/bin/env python3
"""Palestra della correzione AI — confronta il prompt attuale (§6.1, col
rinforzo sui numeri) con la versione storica senza rinforzo, su dettati FINTI
con trappole note (la SPEC vieta referti reali nei test). Nessun dato clinico
vero. Serve anche a confrontare modelli diversi: REFERTI_LLM=<nome> davanti
al comando.

Misura, per ciascun prompt:
  - numeri intatti: la firma numerica del testo non cambia MAI (il vincolo §2.4)
  - correzioni azzeccate: storpiature che volevamo corrette
  - intoccabili conservati: segmenti incomprensibili/istruzioni da non toccare

Uso (sul Mac, con Ollama acceso):
    python3 palestra.py

Durata: ~10-15 minuti. I testi prodotti finiscono in palestra-risultati/
per l'ispezione a occhio; a schermo solo i conteggi.
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import (  # noqa: E402
    MODELLO_LLM, PROMPT_CORREZIONE, _numeri, chiama_ollama, ollama_pronto,
)

# Il rinforzo sui numeri è stato ADOTTATO nel §6.1 (2026-08-16: con
# gemma3:27b porta i numeri intatti a 8/8 — unico a superare il caso
# «3 3» — ed è neutro su gemma3:12b e mistral-small). La «variante» ora
# è il prompt storico SENZA il rinforzo, tenuto come controllo di
# regressione: se un giorno vincesse lei, il rinforzo è da ridiscutere.
RIGA_RINFORZO = (
    "- anche se un numero ti sembra implausibile, lascialo com'è\n"
    "- non togliere e non aggiungere MAI un numero: ogni numero del testo deve "
    "ricomparire identico nella tua risposta, lo stesso numero di volte, anche "
    "se sembra ripetuto, fuori posto o dentro un segmento incomprensibile"
)
RIGA_STORICA = "- anche se un numero ti sembra implausibile, lascialo com'è"
PROMPT_VARIANTE = PROMPT_CORREZIONE.replace(RIGA_RINFORZO, RIGA_STORICA)
assert PROMPT_VARIANTE != PROMPT_CORREZIONE, "variante non costruita"

# ── I dettati finti con le trappole ──────────────────────────────────────────
# attese      = [(sbagliato, giusto)] storpiature che VOGLIAMO corrette
# intoccabili = segmenti che devono restare identici (incomprensibili,
#               istruzioni di dettatura, incoerenze da non risolvere)
CASI = [
    {
        "nome": "numeri_sparsi",
        "testo": (
            "Paziente di 67 anni con lo scompendio cardiaco in fibrillazione "
            "atrialle. Frequenza 82 battiti al minuto, pressione 130 su 85, "
            "peso 78,5 kg. Controllo previsto il 12.03.2027."
        ),
        "attese": [("scompendio", "scompenso"), ("atrialle", "atriale")],
        "intoccabili": [],
    },
    {
        "nome": "tre_ripetuto",
        "testo": (
            "Terapia invariata. Si raccomanda controllo ecocardiografico tra "
            "3 3 mesi e visita di controllo."
        ),
        "attese": [],
        "intoccabili": [],  # qui il giudice sono i numeri: il doppio 3 deve restare
    },
    {
        "nome": "istruzioni_dettatura",
        "testo": (
            "Scrivi in intestazione al collega curante virgola la paziente "
            "sta bene punto a capo Riportami i valori della pressione 125 su "
            "80 punto"
        ),
        "attese": [],
        "intoccabili": ["Scrivi in intestazione", "virgola", "punto a capo", "Riportami"],
    },
    {
        "nome": "segmento_incomprensibile",
        "testo": (
            "Il tracciato mostra una brivalicazione mesotelica del segmento "
            "R T con onde nei limiti. Frazione di ejezione 55 per cento."
        ),
        "attese": [("ejezione", "eiezione")],
        "intoccabili": ["brivalicazione mesotelica"],
    },
    {
        "nome": "aorta_incoerente",
        "testo": (
            "L'aorta ascendente misura 41 mm a livello del tratto discendente "
            "come già noto. Indicato controllo tra 12 mesi."
        ),
        "attese": [],
        "intoccabili": ["ascendente misura 41 mm a livello del tratto discendente"],
    },
    {
        "nome": "farmaci",
        "testo": (
            "Prosegue bisoprofolo 2,5 mg al giorno e candesarante 8 mg. "
            "Aggiunto metopropolo a basso dosaggio."
        ),
        "attese": [("bisoprofolo", "bisoprololo"), ("candesarante", "candesartan"),
                   ("metopropolo", "metoprololo")],
        "intoccabili": [],
    },
    {
        "nome": "percentuali",
        "testo": (
            "Stenosi del 70 per cento della discendente anteriore, frazione "
            "di ejezione del 48 per cento, trigliceridi 1,9."
        ),
        "attese": [("ejezione", "eiezione")],
        "intoccabili": [],
    },
    {
        "nome": "testo_pulito",
        "testo": (
            "Esame ecocardiografico nella norma. Ventricolo sinistro di "
            "dimensioni regolari, frazione di eiezione 60 per cento. Non "
            "indicati ulteriori accertamenti."
        ),
        "attese": [],
        "intoccabili": ["Esame ecocardiografico nella norma"],
    },
]


def giudica(nome: str, testo: str, uscita: str, attese, intoccabili) -> dict:
    ok_numeri = _numeri(uscita) == _numeri(testo)
    u = uscita.lower()
    corrette = sum(1 for sbagliato, giusto in attese
                   if giusto.lower() in u and sbagliato.lower() not in u)
    conservati = sum(1 for s in intoccabili if s.lower() in u)
    return {
        "caso": nome,
        "numeri_ok": ok_numeri,
        "corrette": corrette, "attese": len(attese),
        "conservati": conservati, "intoccabili": len(intoccabili),
    }


def main() -> int:
    motivo = ollama_pronto()
    if motivo:
        print(f"Ollama non pronto ({motivo}): apri l'app Ollama e riprova.", file=sys.stderr)
        return 1

    dir_ris = Path(__file__).resolve().parent / "palestra-risultati"
    dir_ris.mkdir(exist_ok=True)

    prompts = {"attuale": PROMPT_CORREZIONE, "variante": PROMPT_VARIANTE}
    esiti = {n: [] for n in prompts}
    totale = len(CASI) * len(prompts)
    fatto = 0
    for caso in CASI:
        for nome_p, prompt in prompts.items():
            fatto += 1
            print(f"[{fatto}/{totale}] {caso['nome']} · prompt {nome_p}…", file=sys.stderr)
            inizio = time.monotonic()
            uscita = chiama_ollama(
                prompt.replace("{testo}", caso["testo"]), "palestra", "palestra"
            ).strip()
            durata = time.monotonic() - inizio
            (dir_ris / f"{caso['nome']}.{nome_p}.txt").write_text(
                uscita + "\n", encoding="utf-8"
            )
            g = giudica(caso["nome"], caso["testo"], uscita, caso["attese"], caso["intoccabili"])
            g["durata"] = durata
            esiti[nome_p].append(g)

    print("\n══ RISULTATI ══")
    print(f"modello: {MODELLO_LLM}\n")
    print(f"{'caso':<26} {'prompt':<9} {'numeri':<8} {'corrette':<10} {'intoccabili'}")
    for caso in CASI:
        for nome_p in prompts:
            g = next(x for x in esiti[nome_p] if x["caso"] == caso["nome"])
            print(f"{g['caso']:<26} {nome_p:<9} "
                  f"{'OK' if g['numeri_ok'] else 'TOCCATI':<8} "
                  f"{g['corrette']}/{g['attese']:<8} "
                  f"{g['conservati']}/{g['intoccabili']}")
    print("\n── Totali ──")
    for nome_p in prompts:
        e = esiti[nome_p]
        print(f"prompt {nome_p:<9} · numeri intatti {sum(x['numeri_ok'] for x in e)}/{len(e)}"
              f" · correzioni {sum(x['corrette'] for x in e)}/{sum(x['attese'] for x in e)}"
              f" · intoccabili {sum(x['conservati'] for x in e)}/{sum(x['intoccabili'] for x in e)}")
    print("\nI testi completi sono in palestra-risultati/ per il controllo a occhio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
