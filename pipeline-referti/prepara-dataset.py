# Prepara il dataset per l'addestramento di whisper sulla voce del medico
# (piano precisione 2026-08-23, punto 8). Accoppia gli audio conservati nella
# cassaforte (~/referti-dataset/audio/, riempita dalla pipeline a consegna
# confermata) con il testo d'oro corretto dalla persona (referti_bozze.
# testo_finale, stesso file_id) e scrive il manifest per il fine-tuning.
# Tutto resta sul Mac dello studio: nessun dato esce.
#
# Uso:  python3 prepara-dataset.py
# Esito: ~/referti-dataset/coppie/manifest.jsonl + statistiche a video
# (quante coppie, quante ore). Con ≥5 ore si può tentare il primo LoRA;
# la resa cresce fino a ~20 ore (letteratura: −40/60% di errori).
import json
import os
import re
import subprocess
import sys
from pathlib import Path

DATASET = Path(os.environ.get("REFERTI_DATASET_DIR",
                              str(Path.home() / "referti-dataset" / "audio"))).parent
AUDIO = DATASET / "audio"
COPPIE = DATASET / "coppie"
ENV_APP = Path.home() / "referralflow" / ".env"


def database_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    if ENV_APP.is_file():
        for riga in ENV_APP.read_text(encoding="utf-8").splitlines():
            if riga.startswith("DATABASE_URL="):
                return riga.split("=", 1)[1].strip()
    return "postgres://localhost/referralflow"


def durata_s(percorso: Path) -> float:
    esito = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(percorso)],
        capture_output=True, text=True, timeout=60,
    )
    try:
        return float(esito.stdout.strip())
    except ValueError:
        return 0.0


def main() -> int:
    if not AUDIO.is_dir():
        print(f"cassaforte vuota: {AUDIO} non esiste ancora")
        return 0
    # file_id → testo_finale delle bozze confermate (tab-separated, robusto:
    # il testo può contenere qualsiasi cosa → base64).
    sql = ("select file_id || E'\\t' || encode(convert_to(testo_finale, 'UTF8'), 'base64') "
           "from referti_bozze where stato = 'confermata' "
           "and testo_finale is not null and length(testo_finale) > 50")
    esito = subprocess.run(["psql", database_url(), "-t", "-A", "-c", sql],
                           capture_output=True, text=True, timeout=120)
    if esito.returncode != 0:
        print("errore di lettura dal database (psql).")
        return 1
    import base64
    testi: dict[str, str] = {}
    for riga in esito.stdout.splitlines():
        if "\t" not in riga:
            continue
        fid, b64 = riga.split("\t", 1)
        try:
            testi[fid.strip()] = base64.b64decode(re.sub(r"\s", "", b64)).decode("utf-8")
        except Exception:
            continue

    COPPIE.mkdir(parents=True, exist_ok=True)
    os.chmod(COPPIE, 0o700)
    manifest = COPPIE / "manifest.jsonl"
    coppie = 0
    secondi = 0.0
    orfani = 0
    with open(manifest, "w", encoding="utf-8") as f:
        for audio in sorted(AUDIO.iterdir()):
            if not audio.is_file():
                continue
            fid = audio.stem
            testo = testi.get(fid)
            if not testo:
                orfani += 1
                continue
            d = durata_s(audio)
            secondi += d
            f.write(json.dumps({"audio": str(audio), "durata_s": round(d, 1),
                                "testo": testo}, ensure_ascii=False) + "\n")
            coppie += 1
    os.chmod(manifest, 0o600)
    ore = secondi / 3600
    print(f"coppie pronte: {coppie} · ore di dettato: {ore:.1f} · "
          f"audio senza testo confermato (ancora in revisione?): {orfani}")
    print(f"manifest: {manifest}")
    if ore >= 5:
        print("→ si può tentare il primo addestramento (vedi SPEC §9, punto 8).")
    else:
        print(f"→ servono almeno ~5 ore (mancano {max(0.0, 5 - ore):.1f}): "
              "si accumulano da sole a ogni referto confermato.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
