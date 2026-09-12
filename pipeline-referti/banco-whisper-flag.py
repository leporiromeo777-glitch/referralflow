#!/usr/bin/env python3
"""Banco dei flag di whisper (13.9.2026): sull'audio VERO conservato in
~/referti-dataset/audio confronta la passata A di serie (VAD + prompt del
medico) con una o più varianti di flag di whisper-cli, misurando l'accordo
col testimone B (Voxtral) come fa la catena (`accordo_con_b`). Stampa SOLO
numeri: caratteri, righe tolte dall'anti-loop, numeri presenti solo in B,
accordo, tempi. I testi intermedi stanno in una cartella temporanea e
vengono cancellati. Nessun contenuto nei log o a schermo.
Uso, dalla copia viva (servono i modelli):
  python3.14 banco-whisper-flag.py [N] nome1=-nf nome2=-et,2.0 …
N = quanti dettati dal più recente (default tutti); ogni variante è
nome=flag[,flag…]."""
from __future__ import annotations
import importlib.util, os, sys, tempfile, time
from pathlib import Path

QUI = Path(__file__).resolve().parent
os.environ.setdefault("REFERTI_LOG_SILENZIOSO", "1")
spec = importlib.util.spec_from_file_location("pipeline", QUI / "pipeline.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
import logging
for nome in list(logging.Logger.manager.loggerDict) + [""]:
    logging.getLogger(nome).setLevel(logging.ERROR)
AUDIO = Path.home() / "referti-dataset" / "audio"


def pulisci(testo: str) -> tuple[str, int]:
    t, _ = m.togli_frasi_fantasma(testo)
    t, rip, _ = m.deduplica_loop(t)
    return t, rip


def main(argv: list[str]) -> int:
    n = int(argv[0]) if argv[:1] and argv[0].isdigit() else 999
    varianti: dict[str, list[str]] = {"serie": []}
    for a in (argv[1:] if argv[:1] and argv[0].isdigit() else argv):
        if "=" in a:
            nome, flag = a.split("=", 1)
            varianti[nome] = [f for f in flag.split(",") if f]
    for nome, flag in varianti.items():
        m.FLAG_PASSATA[f"banco_{nome}"] = list(flag)
    file = sorted([p for p in AUDIO.iterdir() if p.is_file() and not p.name.startswith(".")],
                  key=lambda p: p.stat().st_mtime, reverse=True)[:n]
    if not file:
        print("nessun audio conservato"); return 2
    print(f"dettati: {len(file)} · varianti: " + " · ".join(f"{k}={' '.join(v) or '(di serie)'}" for k, v in varianti.items()))
    intest = "  #  medico       durata_s |"
    for nome in varianti:
        intest += f" {nome:>7}: car loop numB  acc  t_s |"
    print(intest + "  B_car")
    vittorie = {k: 0 for k in varianti}; pari = 0
    somma = {k: 0 for k in varianti}
    tempi = {k: 0.0 for k in varianti}
    numb_tot = {k: 0 for k in varianti}
    for k, ingresso in enumerate(file, 1):
        fid = f"banco-flag-{k}"
        mid = m._medico_da_nome(ingresso.name)
        m._imposta_corsa(mid)
        prompt = m.carica_vocabolario(mid)
        with tempfile.TemporaryDirectory() as d:
            dd = Path(d)
            wav = dd / "a.wav"
            try:
                m.libera_llm()
            except Exception:  # noqa: BLE001
                pass
            sorgente = m.decodifica_dittafono(ingresso, dd, fid)
            m.preprocessa(sorgente, wav, fid)
            durata = m._durata_wav_s(wav)
            esiti = {}
            for nome in varianti:
                t0 = time.monotonic()
                txt = dd / f"{nome}.txt"
                m.trascrivi(wav, txt, fid, f"banco_{nome}", prompt, con_tempi=False, usa_vad=True)
                testo, rip = pulisci(txt.read_text(encoding="utf-8") if txt.is_file() else "")
                esiti[nome] = {"testo": testo, "rip": rip, "t": time.monotonic() - t0}
            b_txt = dd / "b.txt"
            ok_b = m.trascrivi_voxtral_b(sorgente, b_txt, dd / "b.wav", fid, len(esiti["serie"]["testo"]))
            b = pulisci(b_txt.read_text(encoding="utf-8"))[0] if ok_b and b_txt.is_file() else ""
            riga = f"  {k:<2} {str(mid or '-'):<12} {durata:7.0f} |"
            for nome, e in esiti.items():
                acc = m.accordo_con_b(e["testo"], b) if b else 0
                numb = len(m._numeri_di(b) - m._numeri_di(e["testo"])) if b else 0
                e["acc"] = acc
                somma[nome] += acc; tempi[nome] += e["t"]; numb_tot[nome] += numb
                riga += f" {len(e['testo']):12d} {e['rip']:4d} {numb:4d} {acc:4d} {e['t']:4.0f} |"
            if b:
                migliore = max(esiti.values(), key=lambda e: e["acc"])["acc"]
                vincenti = [nome for nome, e in esiti.items() if e["acc"] == migliore]
                if len(vincenti) == 1:
                    vittorie[vincenti[0]] += 1
                else:
                    pari += 1
            print(riga + f" {len(b):6d}")
            sys.stdout.flush()
    print("\nvince (accordo col testimone B): " + " · ".join(f"{k} {v}" for k, v in vittorie.items()) + f" · pari {pari}")
    print("accordo totale: " + " · ".join(f"{k} {v}" for k, v in somma.items()))
    print("numeri solo in B (meno è meglio): " + " · ".join(f"{k} {v}" for k, v in numb_tot.items()))
    print("tempo totale whisper: " + " · ".join(f"{k} {v:.0f}s" for k, v in tempi.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
