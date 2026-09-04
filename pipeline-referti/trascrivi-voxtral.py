# Trascrittore Voxtral Mini 3B per la passata B (doppia trascrizione,
# 2026-09-04). Gira nel venv dedicato (~/voxtral-banco-venv) con i pesi
# già in cache HuggingFace: NESSUN download a runtime, nessuna rete.
# Uso: python trascrivi-voxtral.py <audio.wav> <uscita.txt>
# Scrive il testo e esce 0; qualsiasi problema → exit != 0 (il chiamante
# ripiega su whisper B). Mai contenuti negli errori.
import sys
from pathlib import Path

REPO = "mistralai/Voxtral-Mini-3B-2507"


def main() -> int:
    if len(sys.argv) != 3:
        return 2
    wav, uscita = Path(sys.argv[1]), Path(sys.argv[2])
    if not wav.is_file():
        return 3

    import torch
    from transformers import AutoProcessor, VoxtralForConditionalGeneration

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    processor = AutoProcessor.from_pretrained(REPO, local_files_only=True)
    model = VoxtralForConditionalGeneration.from_pretrained(
        REPO, torch_dtype=torch.bfloat16, device_map=device,
        local_files_only=True,
    )
    model.eval()
    richiesta = getattr(processor, "apply_transcription_request", None) or getattr(
        processor, "apply_transcrition_request")
    inputs = richiesta(language="it", audio=str(wav), model_id=REPO)
    inputs = inputs.to(device, dtype=torch.bfloat16)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=8000, do_sample=False)
    testo = processor.batch_decode(
        out[:, inputs.input_ids.shape[1]:], skip_special_tokens=True
    )[0].strip()
    if not testo:
        return 4
    uscita.write_text(testo + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
