#!/usr/bin/env python3
"""Banco della coerenza interna (11.9.2026): referti FINTI con contraddizioni
piantate (segno opposto, funzione conservata con FE bassa, nega/riferisce,
invariata/sospeso, lateralità, giudizio/raccomandazione) ed ESCHE che non
sono contraddizioni (evoluzione nel tempo, esami diversi, «invariata
salvo», ripetizioni). Misura richiamo e falsi allarmi del MODELLO esterno
(una chiamata per caso, pochi centesimi). Nessun dato clinico vero.
Uso: python3.14 banco-coerenza.py"""
from __future__ import annotations
import importlib.util, os, sys, time
from pathlib import Path

QUI = Path(__file__).resolve().parent
os.environ.setdefault("REFERTI_LOG_SILENZIOSO", "1")
spec = importlib.util.spec_from_file_location("pipeline", QUI / "pipeline.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
import logging
for nome in list(logging.Logger.manager.loggerDict) + [""]:
    logging.getLogger(nome).setLevel(logging.ERROR)

# (nome, testo, coppie attese: parole che devono stare nei due passaggi citati; [] = nessuna contraddizione)
CASI = [
    ("segno opposto senza evoluzione",
     "Caro collega, ho rivisto il paziente per profili pressori diminuiti associati ad astenia. All'esame clinico i profili pressori risultano aumentati, ragione per cui confermo la terapia in atto. Controllo fra 6 mesi.",
     [("diminuiti", "aumentati")]),
    ("funzione conservata con FE bassa",
     "L'ecocardiogramma mostra una funzione sistolica globale conservata con una frazione di eiezione del 30 per cento. Non vi sono vizi valvolari significativi.",
     [("conservata", "30")]),
    ("nega sintomi e riferisce dispnea",
     "Il paziente giunge riferendo di stare bene e nega sintomatologia cardiaca. Riferisce dispnea da sforzo per due piani di scale comparsa da un mese. ECG nella norma.",
     [("nega", "dispnea")]),
    ("invariata e poi modifica dichiarata",
     "La terapia resta invariata. Ho aumentato il Concor a 5 mg la sera per la frequenza elevata. Controllo fra 12 mesi.",
     [("invariata", "aumentato")]),
    ("lateralità diverse per la stessa lesione",
     "All'ecodoppler si conferma la stenosi della carotide interna destra su placca ibrida. La stenosi della carotide interna sinistra resta stabile al 50 per cento e non richiede interventi. Nessun'altra stenosi.",
     []),  # NON è contraddizione: due carotidi diverse — esca
    ("giudizio contro raccomandazione",
     "Alla luce degli elementi di cui sopra non vi è indicazione a ulteriori accertamenti. Propongo una coronarografia in tempi brevi per escludere una coronaropatia.",
     [("ulteriori accertamenti", "coronarografia")]),
    ("esca: evoluzione nel tempo",
     "A inizio agosto i profili pressori risultavano diminuiti, ragione per cui avevo sospeso il Valsartan. Oggi i profili pressori risultano aumentati e reintroduco il Valsartan a 80 mg.",
     []),
    ("esca: esami diversi",
     "Alla cicloergometria la pressione al picco è di 160 su 70. A riposo la pressione è di 118 su 72. Il test non mostra segni di ischemia.",
     []),
    ("esca: invariata salvo",
     "La terapia resta invariata salvo la sospensione del Valsartan per i profili pressori bassi. Prossimo controllo fra 6 mesi.",
     []),
    ("esca: ripetizione e stile",
     "Il paziente sta bene. Il paziente riferisce di stare bene e nega sintomi. La funzione sistolica è conservata con frazione di eiezione del 60 per cento.",
     []),
]


def main(argv: list[str]) -> int:
    cfg = m._config_esterno()
    if not cfg:
        print("percorso esterno non attivo"); return 2
    print(f"modello esterno (verificatori): {cfg.get('modello_verifica') or cfg.get('modello')}")
    m._CORSA["medico"] = "moccetti"
    tot = prese = falsi = 0
    t0 = time.monotonic()
    righe = []
    for k, (nome, testo, attese) in enumerate(CASI):
        voci = m.incoerenze_esterno(testo, f"banco-coer-{k}") or []
        def copre(coppia, v):
            a, b = coppia
            ab = (v["passaggio_a"] + " " + v["passaggio_b"]).lower()
            return a.lower() in ab and b.lower() in ab
        prese_qui = [c for c in attese if any(copre(c, v) for v in voci)]
        falsi_qui = [v for v in voci if not any(copre(c, v) for c in attese)]
        tot += len(attese); prese += len(prese_qui); falsi += len(falsi_qui)
        ok = len(prese_qui) == len(attese) and not falsi_qui
        righe.append(f"  {'OK ' if ok else '...'} {nome:42} attese {len(attese)} trovate {len(prese_qui)} falsi {len(falsi_qui)}")
        for v in falsi_qui:
            righe.append(f"        falso: «{v['passaggio_a']}» ↔ «{v['passaggio_b']}» — {v['motivo']}")
    print(f"\nMODELLO esterno (coerenza interna): richiamo {prese}/{tot} · falsi allarmi {falsi} su {len(CASI)} casi · {time.monotonic() - t0:.0f} s")
    print("\n".join(righe))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
