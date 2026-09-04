# Rifinitura dei tempi parola col ForcedAligner (2026-09-04). Prende il
# testo FINALE del referto coi tempi approssimativi di whisper e li
# riallinea all'audio con Qwen3-ForcedAligner (0.6B, locale): le parole
# ritoccate dalla catena — che con l'aggancio per somiglianza perdevano
# precisione — tornano inchiodate all'audio. Limite modello 5 min →
# finestre da ~4 minuti tagliate coi tempi approssimativi; una finestra
# che fallisce conserva i tempi di whisper (mai peggio di prima).
# Uso: python allinea-tempi.py <wav_16k> <parole.json> <uscita.json>
# parole.json: [[parola, secondi], ...] — il formato della pipeline.
import difflib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# 55 secondi e non 235: sul collaudo da 1 minuto il modello è preciso al
# centesimo, ma su finestre da 4 minuti restituisce tempi quasi tutti a
# zero (visto dal vivo 2026-09-04 sul primo referto: 287 parole a 0:00).
FINESTRA_S = 55.0
MARGINE_S = 1.0
MODELLO = "Qwen/Qwen3-ForcedAligner-0.6B-hf"


def _norm(s: str) -> str:
    return re.sub(r"[^\w]", "", s.lower())


def main() -> int:
    if len(sys.argv) != 4:
        return 2
    wav, ingresso, uscita = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    parole = json.loads(ingresso.read_text(encoding="utf-8"))
    if not parole:
        return 3

    import torch
    from transformers import AutoProcessor, AutoModelForTokenClassification

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    proc = AutoProcessor.from_pretrained(MODELLO, local_files_only=True)
    model = AutoModelForTokenClassification.from_pretrained(
        MODELLO, dtype=torch.bfloat16, device_map=device, local_files_only=True)
    model.eval()

    # Finestre di parole contigue lunghe al massimo FINESTRA_S.
    finestre: list[tuple[int, int]] = []
    inizio = 0
    for i in range(len(parole)):
        if parole[i][1] - parole[inizio][1] > FINESTRA_S:
            finestre.append((inizio, i))
            inizio = i
    finestre.append((inizio, len(parole)))

    rifinite = [list(p) for p in parole]
    aggiornate = 0
    with tempfile.TemporaryDirectory() as td:
        for n, (i0, i1) in enumerate(finestre):
            t0 = max(0.0, float(parole[i0][1]) - MARGINE_S)
            t1 = float(parole[i1 - 1][1]) + 6.0
            spezzone = Path(td) / f"f{n}.wav"
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-ss", f"{t0:.2f}",
                 "-to", f"{t1:.2f}", "-i", str(wav), "-ar", "16000", "-ac", "1",
                 "-c:a", "pcm_s16le", str(spezzone)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=300, check=True)
            testo = " ".join(str(p[0]) for p in parole[i0:i1])
            try:
                inputs, word_lists = proc.prepare_forced_aligner_inputs(
                    audio=str(spezzone), transcript=testo, language="Italian")
                inputs = inputs.to(model.device, model.dtype)
                with torch.inference_mode():
                    out = model(**inputs)
                ts = proc.decode_forced_alignment(
                    logits=out.logits, input_ids=inputs["input_ids"],
                    word_lists=word_lists,
                    timestamp_token_id=model.config.timestamp_token_id)[0]
            except Exception:  # noqa: BLE001 — finestra fallita: tempi vecchi
                continue
            # Sanità della finestra: se il modello ha schiacciato tutto
            # all'inizio (tempi che non coprono nemmeno metà finestra) o ha
            # perso troppe parole, i tempi di whisper restano al loro posto.
            if (not ts or len(ts) < 0.6 * (i1 - i0)
                    or float(ts[-1]["start_time"]) < 0.5 * (t1 - t0 - 6.0)):
                continue
            nostre = [_norm(str(p[0])) for p in parole[i0:i1]]
            sue = [_norm(t["text"]) for t in ts]
            sm = difflib.SequenceMatcher(None, nostre, sue)
            for blocco in sm.get_matching_blocks():
                for k in range(blocco.size):
                    idx = i0 + blocco.a + k
                    nuovo = t0 + float(ts[blocco.b + k]["start_time"])
                    rifinite[idx][1] = round(nuovo, 2)
                    aggiornate += 1

    # I tempi devono restare crescenti: dove la rifinitura ha creato un
    # gradino all'indietro si tiene il massimo visto finora.
    massimo = 0.0
    for p in rifinite:
        if p[1] < massimo:
            p[1] = massimo
        massimo = p[1]

    uscita.write_text(json.dumps(rifinite, ensure_ascii=False), encoding="utf-8")
    print(f"finestre {len(finestre)} · parole {len(parole)} · rifinite {aggiornate}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
