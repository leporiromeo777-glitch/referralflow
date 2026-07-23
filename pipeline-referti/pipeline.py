#!/usr/bin/env python3
"""Pipeline locale di trascrizione referti — vedi docs/trascrizione/SPEC.md.

Fasi implementate:
  1. preprocessing audio: passa-alto 80 Hz + normalizzazione EBU R128,
     esporta WAV 16 kHz mono per whisper.cpp
  2. trascrizione: whisper.cpp (whisper-cli), modello ggml-large-v3, lingua it
  3. doppia trascrizione e confronto: seconda passata con parametri diversi,
     le differenze diventano la lista DIVERGENZE (rilevatore di dubbi,
     non meccanismo di voto: il sistema non sceglie mai la versione giusta)
  4. dizionario: sostituzioni deterministiche da correzioni.json
     (termini_clinici + linguaggio_comune); mai su testo con cifre

Uso:
    python3 pipeline.py <file_audio>

Accanto al file d'ingresso compaiono <file_id>.wav (audio pulito),
<file_id>.txt (trascrizione di lavoro, passata A), <file_id>.b.txt
(passata B), <file_id>.divergenze.json e <file_id>.corretto.txt.
Il file_id deriva dal contenuto, non dal nome.

Il modello va messo in modelli/ggml-large-v3.bin accanto a questo script
(percorsi e binario sovrascrivibili con REFERTI_MODELLO e REFERTI_WHISPER).
"""

import difflib
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

# ── Logging (SPEC §2.2) ──────────────────────────────────────────────────────
# Nei log passano SOLO: file_id, timestamp, fase, esito, durata. Mai contenuto
# clinico, mai il nome del file originale (potrebbe contenere il nome del
# paziente), mai stdout/stderr di ffmpeg. Anche nelle eccezioni si logga il
# tipo, mai str(e).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stderr,
)
log = logging.getLogger("referti")

FFMPEG_TIMEOUT_S = 600

# Rallentamento del dettato prima della trascrizione (stessa voce, tempo più
# lento). Validato empiricamente il 2026-07-24 sul dettato di prova: con 0.8
# le divergenze A/B sono scese da 65 a 42 — il medico detta veloce, riportarlo
# verso una velocità normale rende l'audio più «sicuro» per il modello.
# 1.0 = disattivato. Sovrascrivibile con REFERTI_ATEMPO.
ATEMPO = float(os.environ.get("REFERTI_ATEMPO", "0.8"))

# ── Trascrizione (SPEC §4) ───────────────────────────────────────────────────
# whisper.cpp come binario locale; su Mac arriva da `brew install whisper-cpp`.
# Un dettato lungo su large-v3 può richiedere minuti: timeout largo.
WHISPER_BIN = os.environ.get("REFERTI_WHISPER", "whisper-cli")
PERCORSO_MODELLO = Path(
    os.environ.get(
        "REFERTI_MODELLO",
        str(Path(__file__).resolve().parent / "modelli" / "ggml-large-v3.bin"),
    )
)
WHISPER_TIMEOUT_S = 1800

# ── Dizionario (SPEC §3, passo 6) ────────────────────────────────────────────
PERCORSO_CORREZIONI = Path(
    os.environ.get(
        "REFERTI_CORREZIONI",
        str(Path(__file__).resolve().parent / "correzioni.json"),
    )
)


def file_id_di(percorso: Path) -> str:
    """ID stabile derivato dal contenuto: identifica il file nei log e nei
    retry senza mai esporre il nome originale."""
    h = hashlib.sha256()
    with open(percorso, "rb") as f:
        for blocco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(blocco)
    return h.hexdigest()[:16]


def preprocessa(ingresso: Path, uscita: Path, file_id: str) -> None:
    """Passa-alto 80 Hz (via il rombo a bassa frequenza, la voce non ne
    risente) + loudnorm EBU R128 (dettati a volume disomogeneo), poi
    16 kHz mono PCM 16 bit: il formato d'ingresso di whisper.cpp."""
    inizio = time.monotonic()
    filtri = "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11"
    if ATEMPO != 1.0:
        filtri = f"atempo={ATEMPO},{filtri}"
    comando = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i", str(ingresso),
        "-af", filtri,
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(uscita),
    ]
    # stdout/stderr scartati: contengono il nome del file e i metadati.
    esito = subprocess.run(
        comando,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=FFMPEG_TIMEOUT_S,
    )
    durata = time.monotonic() - inizio
    if esito.returncode != 0:
        log.error(
            "fase=preprocessing file=%s esito=errore codice=%d durata=%.1fs",
            file_id, esito.returncode, durata,
        )
        raise RuntimeError("ffmpeg fallito")
    if not uscita.exists() or uscita.stat().st_size <= 44:  # 44 = solo header WAV
        log.error("fase=preprocessing file=%s esito=errore motivo=wav_vuoto", file_id)
        raise RuntimeError("wav vuoto")
    log.info("fase=preprocessing file=%s esito=ok durata=%.1fs", file_id, durata)


# Parametri delle due passate. A (beam search) è la trascrizione di lavoro;
# B (greedy) diverge da A soprattutto dove l'audio è incerto: è questo che la
# rende un buon rilevatore di dubbi.
FLAG_PASSATA = {
    "trascrizione_a": [],
    "trascrizione_b": ["-bs", "1"],
}


def trascrivi(wav: Path, uscita_txt: Path, file_id: str, fase: str) -> None:
    """Trascrizione con whisper.cpp, lingua italiana. Il testo esce
    direttamente su file (-otxt): stdout/stderr di whisper contengono la
    trascrizione e vengono scartati (SPEC §2.2)."""
    inizio = time.monotonic()
    base = uscita_txt.with_suffix("")  # -of vuole il percorso senza estensione
    comando = [
        WHISPER_BIN,
        "-m", str(PERCORSO_MODELLO),
        "-l", "it",
        "-f", str(wav),
        "-otxt",
        "-of", str(base),
        "-np",
        *FLAG_PASSATA[fase],
    ]
    esito = subprocess.run(
        comando,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=WHISPER_TIMEOUT_S,
    )
    durata = time.monotonic() - inizio
    if esito.returncode != 0:
        log.error(
            "fase=%s file=%s esito=errore codice=%d durata=%.1fs",
            fase, file_id, esito.returncode, durata,
        )
        raise RuntimeError("whisper fallito")
    if not uscita_txt.exists() or not uscita_txt.read_text(encoding="utf-8").strip():
        log.error("fase=%s file=%s esito=errore motivo=testo_vuoto", fase, file_id)
        raise RuntimeError("trascrizione vuota")
    log.info("fase=%s file=%s esito=ok durata=%.1fs", fase, file_id, durata)


# ── Confronto A/B (SPEC §3, passo 5) ────────────────────────────────────────
# Allineamento parola per parola: dove le due passate non coincidono c'è
# quasi sempre un problema audio. Le divergenze si conservano come frammenti
# testuali con contesto (mai offset: il testo cambierà con dizionario e
# correzione LLM). Il contesto è ritagliato dal testo A originale, così la
# pagina di revisione lo ritrova con una ricerca esatta.

PAROLE_DI_CONTESTO = 4


def _normalizza(parola: str) -> str:
    """Minuscole e via la punteggiatura: «Aorta,» e «aorta» non sono una
    divergenza. I numeri restano intatti (7,5 ≠ 75)."""
    if any(c.isdigit() for c in parola):
        return parola.lower()
    return re.sub(r"[^\w]+", "", parola.lower(), flags=re.UNICODE)


def confronta(testo_a: str, testo_b: str) -> list[dict]:
    tok_a = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", testo_a)]
    tok_b = [m.group(0) for m in re.finditer(r"\S+", testo_b)]
    norm_a = [_normalizza(t[0]) for t in tok_a]
    norm_b = [_normalizza(w) for w in tok_b]

    divergenze: list[dict] = []
    sm = difflib.SequenceMatcher(a=norm_a, b=norm_b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        # Differenze di sola punteggiatura/maiuscole: non sono dubbi.
        if " ".join(norm_a[i1:i2]).strip() == " ".join(norm_b[j1:j2]).strip():
            continue
        seg_a = testo_a[tok_a[i1][1]:tok_a[i2 - 1][2]] if i2 > i1 else ""
        seg_b = " ".join(tok_b[j1:j2])
        ctx_i1 = max(0, i1 - PAROLE_DI_CONTESTO)
        ctx_i2 = min(len(tok_a), i2 + PAROLE_DI_CONTESTO)
        contesto = testo_a[tok_a[ctx_i1][1]:tok_a[ctx_i2 - 1][2]] if ctx_i2 > ctx_i1 else ""
        divergenze.append({
            "contesto": contesto,
            "versione_a": seg_a,
            "versione_b": seg_b,
        })
    return divergenze


def carica_sostituzioni() -> list[tuple[re.Pattern, str]]:
    """Sostituzioni da correzioni.json (termini_clinici + linguaggio_comune),
    compilate come regex: frasi intere con confini di parola, spazi che
    accettano anche gli a-capo, confronto senza maiuscole/minuscole.
    Le chiavi più lunghe si applicano per prime («sensuale regolare» prima
    di «sensuale»). Regola invariabile del file: mai cifre — qualsiasi voce
    che ne contenga viene scartata per principio (SPEC §2.4)."""
    config = json.loads(PERCORSO_CORREZIONI.read_text(encoding="utf-8"))
    voci: dict[str, str] = {}
    for sezione in ("termini_clinici", "linguaggio_comune"):
        for da, a in config.get(sezione, {}).items():
            if da.startswith("_"):
                continue
            if any(c.isdigit() for c in da + a):
                continue
            voci[da] = a
    compilate = []
    for da in sorted(voci, key=len, reverse=True):
        pattern = re.compile(
            r"\b" + re.escape(da).replace(r"\ ", r"\s+") + r"\b",
            re.IGNORECASE | re.UNICODE,
        )
        compilate.append((pattern, voci[da]))
    return compilate


def applica_correzioni(testo: str, sostituzioni: list[tuple[re.Pattern, str]]) -> tuple[str, int]:
    """Applica il dizionario mantenendo la maiuscola iniziale dell'originale.
    Una frase corretta a cavallo di un a-capo viene ricomposta su una riga:
    accettato — succede in modo identico nel testo e nelle àncore delle
    divergenze, quindi restano allineati. Restituisce (testo, n. sostituzioni)."""
    totale = 0

    def _con_maiuscola(match: re.Match, nuovo: str) -> str:
        originale = match.group(0)
        if originale[:1].isupper():
            return nuovo[:1].upper() + nuovo[1:]
        return nuovo

    for pattern, nuovo in sostituzioni:
        def _sostituisci(m: re.Match, nuovo=nuovo) -> str:
            nonlocal totale
            totale += 1
            return _con_maiuscola(m, nuovo)
        testo = pattern.sub(_sostituisci, testo)
    return testo, totale


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    ingresso = Path(argv[1])
    if not ingresso.is_file():
        log.error("fase=avvio file=? esito=errore motivo=file_inesistente")
        return 1
    if not 0.5 <= ATEMPO <= 1.5:
        log.error("fase=avvio file=? esito=errore motivo=atempo_non_valido")
        return 1
    if shutil.which(WHISPER_BIN) is None:
        log.error("fase=avvio file=? esito=errore motivo=whisper_mancante")
        return 1
    if not PERCORSO_MODELLO.is_file():
        log.error("fase=avvio file=? esito=errore motivo=modello_mancante")
        return 1
    try:
        sostituzioni = carica_sostituzioni()
    except FileNotFoundError:
        log.error("fase=avvio file=? esito=errore motivo=correzioni_mancanti")
        return 1
    except (json.JSONDecodeError, AttributeError, TypeError):
        log.error("fase=avvio file=? esito=errore motivo=correzioni_non_valide")
        return 1

    file_id = file_id_di(ingresso)
    wav = ingresso.with_name(f"{file_id}.wav")
    txt_a = ingresso.with_name(f"{file_id}.txt")
    txt_b = ingresso.with_name(f"{file_id}.b.txt")
    div_json = ingresso.with_name(f"{file_id}.divergenze.json")
    txt_corretto = ingresso.with_name(f"{file_id}.corretto.txt")

    fase = "preprocessing"
    try:
        preprocessa(ingresso, wav, file_id)
        fase = "trascrizione_a"
        trascrivi(wav, txt_a, file_id, fase)
        fase = "trascrizione_b"
        trascrivi(wav, txt_b, file_id, fase)
        # Dizionario PRIMA del confronto (ordine invertito rispetto alla prima
        # stesura della SPEC, deviazione documentata in §3): così le àncore
        # delle divergenze nascono già dal testo corretto e combaciano per
        # costruzione, e gli errori ricorrenti corretti in entrambe le passate
        # non generano false divergenze. I .txt grezzi restano su disco.
        fase = "dizionario"
        inizio = time.monotonic()
        corretto_a, n_sost = applica_correzioni(txt_a.read_text(encoding="utf-8"), sostituzioni)
        corretto_b, _ = applica_correzioni(txt_b.read_text(encoding="utf-8"), sostituzioni)
        txt_corretto.write_text(corretto_a, encoding="utf-8")
        log.info(
            "fase=dizionario file=%s esito=ok sostituzioni=%d durata=%.1fs",
            file_id, n_sost, time.monotonic() - inizio,
        )

        fase = "confronto"
        inizio = time.monotonic()
        divergenze = confronta(corretto_a, corretto_b)
        div_json.write_text(
            json.dumps(divergenze, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        log.info(
            "fase=confronto file=%s esito=ok divergenze=%d durata=%.1fs",
            file_id, len(divergenze), time.monotonic() - inizio,
        )
    except subprocess.TimeoutExpired:
        log.error("fase=%s file=%s esito=errore motivo=timeout", fase, file_id)
        return 1
    except RuntimeError:
        return 1  # già loggato nella fase che ha fallito
    except Exception as e:
        # Mai str(e): può contenere percorsi o contenuti.
        log.error("fase=%s file=%s esito=errore tipo=%s", fase, file_id, type(e).__name__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
