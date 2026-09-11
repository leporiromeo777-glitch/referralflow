#!/usr/bin/env python3
"""Banco VAD (11.9.2026): sull'audio VERO conservato in ~/referti-dataset/audio
confronta la passata A di whisper CON VAD (impostazione di serie) e SENZA
VAD, misurando l'accordo con il testimone B (Voxtral) come fa la catena
(`accordo_con_b`: numeri in comune ×3 + parole significative). Stampa SOLO
numeri: lunghezze, righe tolte dall'anti-loop, numeri presenti solo in B,
accordo, tempi. I testi intermedi vengono scritti in una cartella
temporanea e cancellati alla fine. Nessun contenuto nei log o a schermo.
Uso: python3.14 banco-vad.py [N]   (N = quanti dettati, dal più recente; default 6)"""
from __future__ import annotations
import importlib.util, os, shutil, sys, tempfile, time
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
    n = int(argv[0]) if argv[:1] and argv[0].isdigit() else 6
    file = sorted([p for p in AUDIO.iterdir() if p.is_file() and not p.name.startswith(".")],
                  key=lambda p: p.stat().st_mtime, reverse=True)[:n]
    if not file:
        print("nessun audio conservato"); return 2
    print(f"dettati: {len(file)} · VAD di serie: {int(m.USA_VAD)} · atempo dal profilo")
    print("  #  medico       durata_s  |  VAD: car  loop  numB  acc   t_s |  noVAD: car  loop  numB  acc   t_s |  B_car  vincitore")
    tot = {"vad": 0, "novad": 0, "pari": 0}
    somma = {"vad": 0, "novad": 0}
    for k, ingresso in enumerate(file, 1):
        fid = f"banco-vad-{k}"
        mid = m._medico_da_nome(ingresso.name)
        m._imposta_corsa(mid)
        with tempfile.TemporaryDirectory() as d:
            dd = Path(d)
            wav = dd / "a.wav"
            try:
                m.libera_llm()
            except Exception:  # noqa: BLE001
                pass
            # Dittafono (.ds2/.dss): decodifica come nella catena, altrimenti
            # whisper e Voxtral vedono rumore e il banco misura il nulla.
            sorgente = m.decodifica_dittafono(ingresso, dd, fid)
            m.preprocessa(sorgente, wav, fid)
            durata = m._durata_wav_s(wav)
            esiti = {}
            for nome, usa_vad in (("vad", True), ("novad", False)):
                t0 = time.monotonic()
                txt = dd / f"{nome}.txt"
                m.trascrivi(wav, txt, fid, "trascrizione_a", "", con_tempi=False, usa_vad=usa_vad)
                testo, rip = pulisci(txt.read_text(encoding="utf-8"))
                esiti[nome] = {"testo": testo, "rip": rip, "t": time.monotonic() - t0}
            b_txt = dd / "b.txt"
            ok_b = m.trascrivi_voxtral_b(sorgente, b_txt, dd / "b.wav", fid, len(esiti["vad"]["testo"]))
            b = pulisci(b_txt.read_text(encoding="utf-8"))[0] if ok_b and b_txt.is_file() else ""
            riga = f"  {k:<2} {str(mid or '-'):<12} {durata:7.0f}  |"
            for nome in ("vad", "novad"):
                e = esiti[nome]
                acc = m.accordo_con_b(e["testo"], b) if b else 0
                numb = len(m._numeri_di(b) - m._numeri_di(e["testo"])) if b else 0
                e["acc"] = acc
                riga += f"  {len(e['testo']):6d} {e['rip']:5d} {numb:5d} {acc:5d} {e['t']:5.0f} |"
            if b:
                a1, a2 = esiti["vad"]["acc"], esiti["novad"]["acc"]
                vinc = "vad" if a1 > a2 else ("novad" if a2 > a1 else "pari")
                tot[vinc] += 1
                somma["vad"] += a1; somma["novad"] += a2
            else:
                vinc = "senza B"
            print(riga + f"  {len(b):6d}  {vinc}")
            sys.stdout.flush()
    print(f"\nvince (accordo col testimone B): VAD {tot['vad']} · senza VAD {tot['novad']} · pari {tot['pari']}")
    print(f"accordo totale: VAD {somma['vad']} · senza VAD {somma['novad']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
