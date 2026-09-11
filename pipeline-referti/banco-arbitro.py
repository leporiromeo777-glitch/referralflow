#!/usr/bin/env python3
"""Banco dell'arbitro (11.9.2026): divergenze FINTE tra i due motori, con la
risposta giusta nota. Tre famiglie: parola PESANTE (negazione, qualificatore,
lateralità) sentita da un motore solo e coerente col contesto → va presa;
parola pesante che CONTRADDICE il contesto → va lasciata; termini, sigle e
farmaci storpiati → vince la forma giusta. Più due guardie di codice (B vuota
e numeri restano alla persona). Confronta il prompt VECCHIO, il NUOVO senza
contesto e il NUOVO col contesto del medico, sul modello ESTERNO (una
chiamata per caso e condizione, a pagamento: pochi centesimi) o in locale
con --locale. Nessun dato clinico vero. Uso:
    python3.14 banco-arbitro.py            (esterno, tre condizioni)
    python3.14 banco-arbitro.py --locale   (modello locale, lento)
    python3.14 banco-arbitro.py --solo-nuovo
"""
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

PROMPT_VECCHIO = """Sei un correttore di trascrizioni mediche in italiano. Lo stesso dettato è stato trascritto DUE volte da due sistemi diversi: nei punti elencati le versioni divergono. Per ogni punto scegli la versione che è italiano corretto e ha senso medico nel contesto dato.

Regole obbligatorie:
1. Scegli "a" oppure "b". Se nessuna delle due è chiaramente giusta, rispondi "incerto".
2. Non inventare una terza versione: puoi solo scegliere.
3. Nel dubbio, "incerto": il punto resterà segnalato a una persona.

Rispondi SOLO con un oggetto JSON valido:
{"scelte": [{"punto": 1, "scelta": "a"}, {"punto": 2, "scelta": "incerto"}]}

PUNTI:
{punti}"""

# (nome, testo A = base, testo B = testimone, atteso: "b" se il testo finale
#  deve diventare la B, "a" se deve restare la A)
CASI = [
    ("qualificatore sentito solo da B, coerente",
     "Caro collega, ho rivisto il paziente per profili pressori associati ad astenia riscontrati a inizio agosto. Avevo quindi indicato la sospensione del Valsartan. Oggi la pressione è tornata nella norma.",
     "Caro collega, ho rivisto il paziente per profili pressori diminuiti associati ad astenia riscontrati a inizio agosto. Avevo quindi indicato la sospensione del Valsartan. Oggi la pressione è tornata nella norma.",
     "b"),
    ("negazione sentita solo da B, coerente",
     "Il paziente sta bene e nega sintomatologia. L'ecocardiogramma mostra vizi valvolari significativi, la funzione sistolica è conservata e non vi è indicazione a ulteriori accertamenti.",
     "Il paziente sta bene e nega sintomatologia. L'ecocardiogramma non mostra vizi valvolari significativi, la funzione sistolica è conservata e non vi è indicazione a ulteriori accertamenti.",
     "b"),
    ("lateralità sentita solo da B",
     "All'ecodoppler si conferma la stenosi della carotide interna su placca ibrida, stabile rispetto al precedente controllo.",
     "All'ecodoppler si conferma la stenosi della carotide interna destra su placca ibrida, stabile rispetto al precedente controllo.",
     "b"),
    ("qualificatore in B coerente col procedere",
     "L'ecocardiogramma mostra un'insufficienza mitralica senza indicazione a ulteriori accertamenti. Prossimo controllo ecocardiografico fra dodici mesi.",
     "L'ecocardiogramma mostra un'insufficienza mitralica lieve senza indicazione a ulteriori accertamenti. Prossimo controllo ecocardiografico fra dodici mesi.",
     "b"),
    ("esca: B perde la negazione e contraddice",
     "Alla cicloergometria il test non mostra segni di ischemia. Il paziente prosegue la terapia invariata e lo rivedrò fra dodici mesi.",
     "Alla cicloergometria il test mostra segni di ischemia. Il paziente prosegue la terapia invariata e lo rivedrò fra dodici mesi.",
     "a"),
    ("esca: qualificatore in B che contraddice",
     "La pressione risulta ben controllata dalla terapia in atto, con profili pressori nella norma. La terapia resta invariata.",
     "La pressione risulta ben controllata dalla terapia in atto, con profili pressori severamente aumentati nella norma. La terapia resta invariata.",
     "a"),
    ("esca: negazione in B che contraddice",
     "Prosegue con gli stessi farmaci: terapia invariata. Prossimo controllo fra sei mesi.",
     "Prosegue con gli stessi farmaci: terapia non invariata. Prossimo controllo fra sei mesi.",
     "a"),
    ("termine storpiato in A",
     "L'elettrocardiogramma mostra un ritmo sensuale regolare con PR nella norma e QRS fine.",
     "L'elettrocardiogramma mostra un ritmo sinusale regolare con PR nella norma e QRS fine.",
     "b"),
    ("termine storpiato in B",
     "Il tracciato elettrocardiografico è sovrapponibile al precedente, senza segni di ischemia.",
     "Il tracciato tucarografico è sovrapponibile al precedente, senza segni di ischemia.",
     "a"),
    ("sigla: il RIVA maschile",
     "La coronarografia mostra una stenosi della riva prossimale trattata con angioplastica e stent.",
     "La coronarografia mostra una stenosi del RIVA prossimale trattata con angioplastica e stent.",
     "b"),
    ("farmaco storpiato in B",
     "Prosegue con Aspirina Cardio e Concor al mattino, che tollera bene.",
     "Prosegue con Aspirina Cardiaca e Concorde al mattino, che tollera bene.",
     "a"),
    ("grammatica: egli giunge",
     "Oggi e gli giunge riferendo di stare bene e nega sintomatologia di rilievo.",
     "Oggi egli giunge riferendo di stare bene e nega sintomatologia di rilievo.",
     "b"),
    ("frase fissa del medico storpiata in A",
     "Alla luce degli elementi di cui sopra un prossimo controllo è da prevedersi non prima di dodici mesi. Non ritorno sulle note.",
     "Alla luce degli elementi di cui sopra un prossimo controllo è da prevedersi non prima di dodici mesi. Non ritorno sull'anamnesi.",
     "b"),
    ("guardia: B vuota resta alla persona",
     "I profili pressori risultano diminuiti e associati ad astenia. Sospendo il Valsartan.",
     "I profili pressori risultano associati ad astenia. Sospendo il Valsartan.",
     "a"),
    ("guardia: numeri restano alla persona",
     "Alla cicloergometria raggiunge una frequenza massima di 99 battiti. Il test non mostra segni di ischemia.",
     "Alla cicloergometria raggiunge una frequenza massima di 99 battiti e una pressione al picco di 160 su 70. Il test non mostra segni di ischemia.",
     "a"),
]


def corri(etichetta: str, prompt: str, medico: str | None, id_cond: str) -> int:
    m.PROMPT_ARBITRO = prompt
    m._CORSA["medico"] = medico
    giusti = 0
    righe = []
    t0 = time.monotonic()
    for k, (nome, a, b, atteso) in enumerate(CASI):
        div = m.confronta(a, b)
        fuori, n = m.arbitra_divergenze(a, div, f"banco-arb-{id_cond}-{k}")
        # Maiuscole non contano: «riva»/«RIVA» non è una divergenza per il
        # codice (confronta normalizza), l'arbitro decide solo l'articolo.
        esito = "b" if fuori.lower() == b.lower() else ("a" if fuori.lower() == a.lower() else "?")
        ok = esito == atteso
        giusti += ok
        righe.append(f"  {'OK ' if ok else '...'} {nome:44} atteso {atteso} · ottenuto {esito} · applicate {n}")
    print(f"\n{etichetta}: {giusti}/{len(CASI)} giusti · {time.monotonic() - t0:.0f} s")
    print("\n".join(righe))
    return giusti


def main(argv: list[str]) -> int:
    if "--locale" in argv:
        m._config_esterno = lambda: None
        m.CORREZIONE_ESTERNA = False
        print(f"modello locale: {m.MODELLO_CORREZIONE}")
    else:
        cfg = m._config_esterno()
        if not cfg or cfg.get("arbitro") != "1":
            print("percorso esterno non attivo per l'arbitro: usa --locale"); return 2
        print(f"modello esterno: {cfg.get('modello')}")
    nuovo = m.PROMPT_ARBITRO
    if "--solo-nuovo" not in argv:
        corri("VECCHIO prompt, senza contesto", PROMPT_VECCHIO, None, "v")
        corri("NUOVO prompt, senza contesto", nuovo, None, "n")
    corri("NUOVO prompt, con contesto del medico (moccetti)", nuovo, "moccetti", "c")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
