#!/usr/bin/env python3
"""Suite «cattiva» (2026-09-06): frasi brevi con coppie pericolose lette da
voci sintetiche di macOS, trascritte dalla catena (whisper come in
produzione) e valutate SOLO sul token critico. Serve a bloccare le
regressioni su numeri, negazioni, lateralità e farmaci a ogni cambio di
motore, prompt o preprocessing. Nessun dato reale.

Uso: python3 suite-cattiva.py [--genera] [--voci Alice,Eddy,Flo]
Esito in ~/referti-dataset/suite-cattiva/esito-<data>.json e a video."""
import json, os, re, subprocess, sys, time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
DIR = Path.home() / "referti-dataset" / "suite-cattiva"
DIR.mkdir(parents=True, exist_ok=True)

# (frase, token critico atteso, classe)
CASI = [
    ("frazione di eiezione quindici per cento", "15", "numero"),
    ("frazione di eiezione cinquanta per cento", "50", "numero"),
    ("eliquis zero virgola cinque milligrammi due volte al giorno", "0,5", "numero"),
    ("eliquis cinque milligrammi due volte al giorno", "5", "numero"),
    ("torem dieci milligrammi al mattino", "10", "numero"),
    ("torem venti milligrammi al mattino", "20", "numero"),
    ("pressione arteriosa centotrenta su ottanta", "130", "numero"),
    ("pressione arteriosa centotredici su ottanta", "113", "numero"),
    ("creatinina novantacinque micromoli per litro", "95", "numero"),
    ("creatinina centonovantacinque micromoli per litro", "195", "numero"),
    ("non vi è stenosi aortica significativa", "non", "negazione"),
    ("vi è stenosi aortica significativa", "vi è", "negazione"),
    ("nessuna evidenza di trombosi apicale", "nessuna", "negazione"),
    ("evidenza di trombosi apicale", "evidenza", "negazione"),
    ("ipocinesia della parete inferiore", "ipocinesia", "negazione"),
    ("acinesia della parete inferiore", "acinesia", "negazione"),
    ("ventricolo destro di dimensioni normali", "destro", "lateralità"),
    ("ventricolo sinistro di dimensioni normali", "sinistro", "lateralità"),
    ("blocco di branca destra completo", "destra", "lateralità"),
    ("blocco di branca sinistra completo", "sinistra", "lateralità"),
    ("insufficienza mitralica lieve", "mitralica", "termine"),
    ("insufficienza tricuspidale lieve", "tricuspidale", "termine"),
    ("terapia con eliquis cinque milligrammi", "eliquis", "farmaco"),
    ("terapia con xarelto venti milligrammi", "xarelto", "farmaco"),
    ("terapia con concor cinque milligrammi", "concor", "farmaco"),
    ("terapia con cordarone duecento milligrammi", "cordarone", "farmaco"),
    ("terapia con entresto novantasette su centotré milligrammi", "entresto", "farmaco"),
    ("terapia con metoprololo cinquanta milligrammi", "metoprololo", "farmaco"),
    ("ipertensione arteriosa in trattamento", "ipertensione", "prefisso"),
    ("ipotensione arteriosa ortostatica", "ipotensione", "prefisso"),
    ("iperpotassiemia lieve", "iperpotassiemia", "prefisso"),
    ("ipopotassiemia lieve", "ipopotassiemia", "prefisso"),
    ("classe NYHA due", "NYHA", "sigla"),
    ("stent sulla coronaria destra nel duemiladiciannove", "2019", "numero"),
    ("controllo tra sei mesi", "6", "numero"),
    ("controllo tra dodici mesi", "12", "numero"),
]
VOCI = ["Alice", "Eddy", "Flo"]

def genera(voci):
    for i, (frase, _, _) in enumerate(CASI, 1):
        for voce in voci:
            base = DIR / f"{i:02d}-{voce}"
            if base.with_suffix(".wav").exists():
                continue
            subprocess.run(["say", "-v", voce, "-o", str(base.with_suffix(".aiff")), frase], check=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(base.with_suffix(".aiff")),
                            "-ar", "16000", "-ac", "1", str(base.with_suffix(".wav"))], check=True)
            base.with_suffix(".aiff").unlink(missing_ok=True)

def normalizza(s):
    return re.sub(r"[^\w,.% ]+", " ", s.lower())

def trascrivi_tutti(voci):
    import pipeline as P
    vocab = P.carica_vocabolario()
    esiti = []
    for i, (frase, atteso, classe) in enumerate(CASI, 1):
        for voce in voci:
            wav = DIR / f"{i:02d}-{voce}.wav"
            pulito = DIR / f"{i:02d}-{voce}.pre.wav"
            txt = DIR / f"{i:02d}-{voce}.txt"
            try:
                P.preprocessa(wav, pulito, "suite")
                P.trascrivi(pulito, txt, "suite", "trascrizione_a", vocab)
                out = txt.read_text(encoding="utf-8").strip()
            except Exception as e:
                out = f"<errore {type(e).__name__}>"
            n_out = normalizza(out)
            n_att = normalizza(atteso)
            # il token critico deve esserci; per le negazioni «vi è» senza «non» davanti
            if atteso == "vi è":
                ok = "vi è" in n_out and "non vi è" not in n_out
            elif atteso == "evidenza":
                ok = "evidenza" in n_out and "nessuna evidenza" not in n_out
            else:
                ok = re.search(r"(?<![\w,.])" + re.escape(n_att) + r"(?![\w])", n_out) is not None
            esiti.append({"caso": i, "voce": voce, "classe": classe, "atteso": atteso, "ok": ok, "uscita": out[:120]})
            print(f"{i:02d} {voce:6} {classe:10} {'OK ' if ok else 'ERR'} atteso={atteso!r:16} → {out[:70]}", flush=True)
    return esiti

if __name__ == "__main__":
    voci = VOCI
    for a in sys.argv[1:]:
        if a.startswith("--voci="):
            voci = a.split("=", 1)[1].split(",")
    genera(voci)
    if "--genera" in sys.argv:
        sys.exit(0)
    esiti = trascrivi_tutti(voci)
    per_classe = {}
    for e in esiti:
        c = per_classe.setdefault(e["classe"], [0, 0]); c[1] += 1; c[0] += e["ok"]
    tot_ok = sum(e["ok"] for e in esiti)
    print(f"\nTOTALE {tot_ok}/{len(esiti)} · " + " · ".join(f"{k} {v[0]}/{v[1]}" for k, v in per_classe.items()))
    (DIR / f"esito-{date.today().isoformat()}.json").write_text(json.dumps({"totale": [tot_ok, len(esiti)], "classi": per_classe, "esiti": esiti}, ensure_ascii=False, indent=1), encoding="utf-8")
