# Banco di prova AUDIO (piano precisione 2026-08-23, punto 0): misura su un
# set di dettati con testo d'oro tre numeri che contano davvero:
#   - WER: percentuale di parole diverse dal testo vero;
#   - richiamo dei termini critici (farmaci e gergo dal dizionario/vocabolario):
#     il WER globale maschera proprio gli errori che fanno danno;
#   - numeri ritrovati: quanti dei numeri del testo vero compaiono trascritti.
# Il set è una cartella di coppie NN.wav + NN.txt (testo d'oro). I .wav vanno
# forniti GREZZI (solo 16 kHz mono): le varianti di preprocessing le applica
# questo banco, così si confrontano ad armi pari.
#
# Uso:
#   python3 banco-audio.py <cartella-set> [varianti...] [--modello <ggml>]
# varianti (default: tutte): attuale, senza-denoise, senza-atempo, solo-resample
import difflib
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline  # noqa: E402

LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
VARIANTI = {
    # nome → filtri ffmpeg (None = nessun filtro, solo ricampionamento)
    "attuale": f"atempo=0.8,highpass=f=80,afftdn=nf=-25,{LOUDNORM}",
    "senza-denoise": f"atempo=0.8,highpass=f=80,{LOUDNORM}",
    "senza-atempo": f"highpass=f=80,{LOUDNORM}",
    "solo-resample": None,
}


def termini_critici() -> list[str]:
    """Termini a rischio: i valori «giusti» del dizionario + il vocabolario.
    Solo voci di almeno 5 lettere (le corte gonfiano il richiamo senza dire
    nulla)."""
    voci: set[str] = set()
    for p in (pipeline.PERCORSO_CORREZIONI, pipeline.PERCORSO_CORREZIONI_LOCALI):
        if not p.is_file():
            continue
        try:
            dati = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for chiave, sezione in dati.items():
            if chiave.startswith("_") or not isinstance(sezione, dict):
                continue
            voci.update(str(v).strip() for v in sezione.values())
    for p in (pipeline.PERCORSO_VOCABOLARIO, pipeline.PERCORSO_VOCABOLARIO_LOCALI):
        if not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if riga and not riga.startswith("#"):
                voci.add(riga)
    return sorted(v for v in voci if len(v) >= 5)


def _norm(testo: str) -> list[str]:
    return re.sub(r"[^\w\s]", " ", testo.lower()).split()


def wer(ipotesi: str, oro: str) -> float:
    a, b = _norm(oro), _norm(ipotesi)
    sm = difflib.SequenceMatcher(None, a, b)
    uguali = sum(m.size for m in sm.get_matching_blocks())
    return 100 * (1 - uguali / max(len(a), 1))


# Pagella pesata (2026-09-03): non tutti gli errori pesano uguale in un
# referto. Una parola generica sbagliata vale 1, un termine critico perso 10,
# un numero perso 50, una NEGAZIONE persa 100 («non evidenza di stenosi» che
# diventa «evidenza di stenosi» è l'errore più grave possibile).
PESI = {"parole": 1, "termini": 10, "numeri": 50, "negazioni": 100}

NEG_RE = re.compile(
    r"\b(?:non|senza|assenza\s+di|assente|assenti|negativ\w*|esclus\w*|priv[oa]\s+di)"
    r"\b\s+(?:\w+\s+){0,1}\w+",
    re.IGNORECASE,
)


def contesti_negazione(testo: str) -> list[str]:
    """Le negazioni del testo d'oro col loro aggancio (fino a 2 parole dopo),
    normalizzate: servono a misurare se la trascrizione le conserva."""
    return [" ".join(_norm(m.group(0))) for m in NEG_RE.finditer(testo)]


def pagella(ipotesi: str, oro: str, critici: list[str]) -> dict:
    """Le quattro misure del banco su un singolo dettato."""
    basso_oro, basso_ipo = oro.lower(), ipotesi.lower()
    t_pres = t_trov = 0
    for termine in critici:
        if termine.lower() in basso_oro:
            t_pres += 1
            if termine.lower() in basso_ipo:
                t_trov += 1
    num_oro = pipeline._numeri(oro)
    num_ipo = pipeline._numeri(ipotesi)
    n_trov = sum(min(num_oro.count(n), num_ipo.count(n)) for n in set(num_oro))
    ipo_norm = " ".join(_norm(ipotesi))
    neg = contesti_negazione(oro)
    g_trov = sum(1 for c in neg if c in ipo_norm)
    return {
        "wer": wer(ipotesi, oro),
        "t_pres": t_pres, "t_trov": t_trov,
        "n_pres": len(num_oro), "n_trov": n_trov,
        "g_pres": len(neg), "g_trov": g_trov,
    }


def errore_ponderato(wer_medio: float, t_trov: int, t_pres: int,
                     n_trov: int, n_pres: int, g_trov: int, g_pres: int) -> float:
    """Media delle percentuali d'errore pesata con PESI: 0 = perfetto,
    più è basso meglio è. Confrontabile solo sullo stesso set."""
    persi = lambda trov, pres: 100.0 * (1 - trov / pres) if pres else 0.0
    voci = [
        (PESI["parole"], wer_medio),
        (PESI["termini"], persi(t_trov, t_pres)),
        (PESI["numeri"], persi(n_trov, n_pres)),
        (PESI["negazioni"], persi(g_trov, g_pres)),
    ]
    return sum(p * v for p, v in voci) / sum(p for p, _ in voci)


def preprocessa_variante(wav: Path, filtri: str | None, uscita: Path) -> None:
    comando = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(wav)]
    if filtri:
        comando += ["-af", filtri]
    comando += ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(uscita)]
    subprocess.run(comando, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   timeout=600, check=True)


def trascrivi(wav: Path, base: Path, prompt: str, modello: str) -> str:
    comando = [
        pipeline.WHISPER_BIN, "-m", modello, "-l", "it",
        "-f", str(wav), "-otxt", "-of", str(base), "-np",
        "--vad", "-vm", str(pipeline.PERCORSO_VAD),
        "--vad-speech-pad-ms", pipeline.VAD_PAD_MS,
    ]
    if prompt:
        comando += ["--prompt", prompt]
    subprocess.run(comando, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   timeout=1800, check=True)
    return (base.with_suffix(".txt")).read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print("uso: banco-audio.py <cartella-set> [varianti...] [--modello <ggml>]")
        return 2
    cartella = Path(args[0])
    scelte = args[1:] or list(VARIANTI)
    modello = str(pipeline.PERCORSO_MODELLO)
    for a in argv:
        if a.startswith("--modello="):
            modello = a.split("=", 1)[1]
    coppie = sorted(
        (w, w.with_suffix(".txt")) for w in cartella.glob("*.wav")
        if w.with_suffix(".txt").is_file()
    )
    if not coppie:
        print("nessuna coppia .wav/.txt in", cartella)
        return 2
    critici = termini_critici()
    prompt = pipeline.carica_vocabolario()
    print(f"set: {len(coppie)} dettati · {len(critici)} termini critici · modello: {Path(modello).name}")

    salva = None
    for a in argv:
        if a.startswith("--salva="):
            salva = Path(a.split("=", 1)[1])

    for nome in scelte:
        if nome not in VARIANTI:
            print(f"variante sconosciuta: {nome}")
            continue
        filtri = VARIANTI[nome]
        tot = {"wer": 0.0, "t_pres": 0, "t_trov": 0, "n_pres": 0,
               "n_trov": 0, "g_pres": 0, "g_trov": 0}
        secondi = 0.0
        with tempfile.TemporaryDirectory() as td:
            for wav, txt in coppie:
                oro = txt.read_text(encoding="utf-8")
                pre = Path(td) / (wav.stem + ".pre.wav")
                preprocessa_variante(wav, filtri, pre)
                t0 = time.monotonic()
                ipotesi = trascrivi(pre, Path(td) / wav.stem, prompt, modello)
                secondi += time.monotonic() - t0
                if salva:
                    dest = salva / nome
                    dest.mkdir(parents=True, exist_ok=True)
                    (dest / (wav.stem + ".txt")).write_text(ipotesi, encoding="utf-8")
                voto = pagella(ipotesi, oro, critici)
                for k in tot:
                    tot[k] += voto[k]
        media = tot["wer"] / len(coppie)
        pond = errore_ponderato(media, tot["t_trov"], tot["t_pres"],
                                tot["n_trov"], tot["n_pres"],
                                tot["g_trov"], tot["g_pres"])
        print(f"{nome}: WER medio {media:.1f}% · termini critici "
              f"{tot['t_trov']}/{tot['t_pres']} · numeri {tot['n_trov']}/{tot['n_pres']} "
              f"· negazioni {tot['g_trov']}/{tot['g_pres']} "
              f"· errore ponderato {pond:.1f} · whisper {secondi:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
