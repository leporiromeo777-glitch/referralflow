#!/usr/bin/env python3
"""Banco delle omissioni (9.9.2026): dettati FINTI con omissioni piantate
apposta nella bozza (qualificatore, numero, farmaco, negazione, lateralità,
raccomandazione) e con ESCHE che non sono omissioni (istruzioni alla
segretaria tolte, ripetizioni tolte, riformulazioni fedeli). Misura richiamo
e falsi allarmi del controllo di CODICE (rileva_omissioni) e, con --modello,
del controllo del MODELLO esterno (omissioni_esterno: una chiamata a caso,
a pagamento). Nessun dato clinico vero. Uso:
    python3.14 banco-omissioni.py            (solo codice, gratis)
    python3.14 banco-omissioni.py --modello  (anche il modello esterno)
"""
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

# (nome, dettato, bozza, omissioni attese = pezzi che DEVONO essere segnalati,
#  esche = pezzi del dettato assenti dalla bozza che NON vanno segnalati)
CASI = [
    ("qualificatore perso",
     "Caro collega, ho rivisto il paziente per profili pressori diminuiti associati ad astenia riscontrati a inizio agosto. Avevo indicato la sospensione del Valsartan.",
     "Caro collega, ho rivisto il paziente per profili pressori associati ad astenia riscontrati a inizio agosto. Avevo indicato la sospensione del Valsartan.",
     ["diminuiti"], []),
    ("numero perso",
     "Alla cicloergometria per un carico di 125 watt il paziente raggiunge una frequenza massima di 99 battiti e una pressione al picco di 160 su 70. Il test non mostra segni di ischemia.",
     "Alla cicloergometria per un carico di 125 watt il paziente raggiunge una frequenza massima di 99 battiti. Il test non mostra segni di ischemia.",
     ["160 su 70"], []),
    ("farmaco perso",
     "Prosegue con Aspirina Cardio 100 mg, Concor 2.5 mg e Ezetimibe 10 mg. Prossimo controllo fra 12 mesi.",
     "Prosegue con Aspirina Cardio 100 mg e Concor 2.5 mg. Prossimo controllo fra 12 mesi.",
     ["Ezetimibe"], []),
    ("negazione persa",
     "L'ecocardiogramma non mostra vizi valvolari significativi. La funzione sistolica è conservata.",
     "L'ecocardiogramma mostra vizi valvolari significativi. La funzione sistolica è conservata.",
     ["non mostra vizi valvolari"], []),
    ("lateralità persa",
     "Stenosi del 50 per cento della carotide interna destra su placca ibrida. Controllo ecodoppler fra 12 mesi.",
     "Stenosi del 50 per cento della carotide interna su placca ibrida. Controllo ecodoppler fra 12 mesi.",
     ["destra"], []),
    ("raccomandazione persa",
     "Propongo di continuare la terapia in atto. Ti chiedo di rivedere il paziente fra due o tre settimane per accertarti del suo benessere. Dal canto mio un controllo fra 12 mesi.",
     "Propongo di continuare la terapia in atto. Dal canto mio un controllo fra 12 mesi.",
     ["rivedere il paziente fra due o tre settimane"], []),
    ("esca: istruzioni alla segretaria tolte",
     "Scrivi al dottor Bianchi e metti in copia il paziente. Il paziente giunge riferendo di stare bene e nega sintomatologia. Frequenza cardiaca 70.",
     "Il paziente giunge riferendo di stare bene e nega sintomatologia. Frequenza cardiaca 70.",
     [], ["Scrivi al dottor Bianchi"]),
    ("esca: ripetizione tolta",
     "La terapia resta invariata. La terapia resta invariata. Controllo fra 6 mesi.",
     "La terapia resta invariata. Controllo fra 6 mesi.",
     [], []),
    ("esca: riformulazione fedele",
     "Alla luce degli elementi di cui sopra propongo un controllo non prima di 12 mesi.",
     "In conclusione, alla luce di quanto sopra, un prossimo controllo è da prevedersi non prima di 12 mesi.",
     [], []),
    ("esca: autocorrezione a voce",
     "Il paziente assume bisoprololo 5 mg, anzi 2.5 mg, al mattino. Sta bene.",
     "Il paziente assume bisoprololo 2.5 mg al mattino. Sta bene.",
     [], ["5 mg, anzi"]),
    ("due omissioni in una frase lunga",
     "L'elettrocardiogramma mostra un ritmo sinusale regolare normocardico con PR nella norma, QRS fine, T difasica in D2 e D3 e da V5 a V6, senza segni di ischemia.",
     "L'elettrocardiogramma mostra un ritmo sinusale regolare con PR nella norma e QRS fine, senza segni di ischemia.",
     ["normocardico", "T difasica"], []),
    ("qualificatore cambiato di segno",
     "I profili pressori risultano leggermente aumentati, ragione per cui abbiamo concordato la reintroduzione del Valsartan.",
     "I profili pressori risultano leggermente diminuiti, ragione per cui abbiamo concordato la reintroduzione del Valsartan.",
     ["aumentati"], []),
]


def valuta(nome_controllo: str, trova):
    tot_attese = trovate = falsi = 0
    righe = []
    for nome, dettato, bozza, attese, esche in CASI:
        voci = trova(dettato, bozza) or []
        frasi = [str(v.get("frase", "")) for v in voci]
        prese = [a for a in attese if any(a.lower() in f.lower() for f in frasi)]
        # falso allarme: una segnalazione che non copre nessuna attesa
        fa = [f for f in frasi if not any(a.lower() in f.lower() for a in attese)]
        tot_attese += len(attese); trovate += len(prese); falsi += len(fa)
        esito = "OK " if len(prese) == len(attese) and not fa else "..."
        righe.append(f"  {esito} {nome:40} attese {len(attese)} trovate {len(prese)} falsi {len(fa)}")
    print(f"\n{nome_controllo}: richiamo {trovate}/{tot_attese} · falsi allarmi {falsi} su {len(CASI)} casi")
    print("\n".join(righe))


def main(argv: list[str]) -> int:
    valuta("CODICE (sovrapposizione di parole)",
           lambda d, b: m.rileva_omissioni(d, b, [], [], "banco-om", []))
    if "--modello" in argv:
        valuta("MODELLO esterno (omissioni semantiche)",
               lambda d, b: m.omissioni_esterno(b, d, "banco-om"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
