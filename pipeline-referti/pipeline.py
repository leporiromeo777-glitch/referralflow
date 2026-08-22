#!/usr/bin/env python3
"""Pipeline locale di trascrizione referti — vedi docs/trascrizione/SPEC.md.

Fasi implementate:
  1. preprocessing audio: passa-alto 80 Hz + normalizzazione EBU R128,
     esporta WAV 16 kHz mono per whisper.cpp
  2. trascrizione: whisper.cpp (whisper-cli), modello ggml-large-v3, lingua it
  3. doppia trascrizione e confronto: seconda passata con parametri diversi,
     le differenze diventano la lista DIVERGENZE (rilevatore di dubbi,
     non meccanismo di voto: il sistema non sceglie mai la versione giusta)
  4. anti-loop e dizionario: prima le ripetizioni consecutive del whisper
     «incantato» ridotte a una (deterministico, mai su gruppi con cifre,
     intervento segnalato in bozza), poi sostituzioni deterministiche da
     correzioni.json (termini_clinici + linguaggio_comune); mai su cifre
  5. correzione LLM (prompt SPEC §6.1) e ispezione (prompt §6.2) via Ollama
     locale (gemma3:12b); se l'AI tocca un numero o accorcia troppo il
     testo, la sua correzione viene scartata in blocco (SPEC §2.4)
  6. estrazione campi (prompt §6.3, modalità JSON) + controlli numerici
     dagli intervalli di correzioni.json → allarmi (mai correzioni)
  7. modalità servizio: sorveglia ~/referti/ingresso/, elabora in coda,
     esiti in output/, falliti in errori/ col log accanto — la coda non
     si blocca mai; audio in archivio_temp/ fino al salvataggio confermato
  8. invio a ReferralFlow (POST /api/referti/bozza, Bearer token per
     studio): solo il 2xx del server autorizza la cancellazione di audio
     e bozza; server giù = si riprova al giro dopo; FileVault obbligatorio

Uso:
    python3 pipeline.py <file_audio>     una corsa su un file (test)
    python3 pipeline.py --servizio       sorveglianza continua di ~/referti/

Nella corsa singola i file di lavoro nascono accanto all'ingresso
(<file_id>.wav, .txt, .b.txt, .divergenze.json, .corretto.txt,
.finale.txt, .dubbi.json, .campi.json, .allarmi.json, .payload.json).
Il file_id deriva dal contenuto, non dal nome. In modalità servizio le
cartelle sono quelle della SPEC §5 (base cambiabile con REFERTI_BASE).

Il modello va messo in modelli/ggml-large-v3.bin accanto a questo script
(percorsi e binario sovrascrivibili con REFERTI_MODELLO e REFERTI_WHISPER).
"""

import difflib
import errno
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
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

# Riduzione del rumore di fondo (afftdn) tra passa-alto e normalizzazione.
# Validata il 2026-07-24 col confronto a quattro celle sul dettato di prova
# (divergenze A/B): 65 liscio, 52 solo denoise, 70 solo atempo, 23 con
# atempo+denoise insieme — la combinazione è l'impostazione di serie.
# Spegnere con REFERTI_DENOISE=0. Ogni ritocco futuro va rimisurato così.
DENOISE = os.environ.get("REFERTI_DENOISE", "1") == "1"

# Conserva delle coppie per l'addestramento (piano precisione 2026-08-23,
# punto 8, approvato dall'utente): a consegna riuscita l'audio NON viene
# cancellato ma spostato nella cassaforte locale (cartella chmod 700 sul Mac
# dello studio, protetta da FileVault). Il testo d'oro corrispondente sta nel
# DB (referti_bozze.testo_finale, stesso file_id). Spegnere con
# REFERTI_CONSERVA_AUDIO=0: torna la cancellazione di prima.
CONSERVA_AUDIO = os.environ.get("REFERTI_CONSERVA_AUDIO", "1") == "1"
DATASET_DIR = Path(os.environ.get(
    "REFERTI_DATASET_DIR", str(Path.home() / "referti-dataset" / "audio")))

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

# VAD — rilevatore di voce (Silero, incorporato in whisper.cpp): dove c'è
# silenzio whisper NON trascrive. È l'antidoto principale alle frasi
# «inventate» nelle pause di riflessione del dettato. Si accende da solo
# appena il modellino è presente (lo scarica aggiorna.sh); REFERTI_VAD=0 lo
# spegne. Il padding largo (120 ms) evita di tagliare i bordi di parola.
# Vale per ENTRAMBE le passate: così il confronto A/B resta coerente.
PERCORSO_VAD = Path(
    os.environ.get(
        "REFERTI_VAD_MODELLO",
        str(Path(__file__).resolve().parent / "modelli" / "ggml-silero-v5.1.2.bin"),
    )
)
USA_VAD = os.environ.get("REFERTI_VAD", "1") != "0" and PERCORSO_VAD.exists()
VAD_PAD_MS = os.environ.get("REFERTI_VAD_PAD_MS", "120")

# ── Anti-troncamento (loop «incantato» sulla coda del dettato) ───────────────
# Se la trascrizione A copre molto meno audio del previsto, whisper è quasi
# certamente caduto in un loop che si è mangiato la coda del dettato (visto
# dal vivo il 2026-08-17: 338 s di audio, testo fermo a 303 s, 15–22 frasi
# ripetute rimosse dal deloop, coda mai trascritta). Si riprova UNA volta con
# -nc: senza il riporto di contesto tra le finestre — il carburante dei loop —
# la coda torna quasi sempre. Con -nc whisper ignora anche il prompt di
# vocabolario: lo compensano dizionario e correzione AI. Si tiene la corsa
# che copre più audio. Soglie regolabili da env per il collaudo.
TRONC_AUDIO_MIN_S = float(os.environ.get("REFERTI_TRONC_AUDIO_S", "60"))
TRONC_GAP_MIN_S = float(os.environ.get("REFERTI_TRONC_GAP_S", "20"))
TRONC_GAP_FRAZ = float(os.environ.get("REFERTI_TRONC_FRAZ", "0.06"))

# Vocabolario di dominio dato a whisper come «prompt iniziale»: orienta il
# riconoscimento verso i termini cardiologici e i nomi di farmaci ricorrenti,
# così whisper sbaglia meno proprio sulle parole difficili. È SEPARATO dai
# prompt LLM di SPEC §6 (quelli non si toccano): qui condizioniamo solo la
# trascrizione. Il file base sta nel repo; vocabolario-locali.txt è dello studio
# (una parola per riga, aggiunto dal pannello) e aggiorna.sh non lo tocca.
PERCORSO_VOCABOLARIO = Path(
    os.environ.get(
        "REFERTI_VOCABOLARIO",
        str(Path(__file__).resolve().parent / "vocabolario.txt"),
    )
)
PERCORSO_VOCABOLARIO_LOCALI = Path(
    os.environ.get(
        "REFERTI_VOCABOLARIO_LOCALI",
        str(Path(__file__).resolve().parent / "vocabolario-locali.txt"),
    )
)
# whisper accetta un prompt lungo al più ~224 token (n_text_ctx/2): teniamo un
# margine di sicurezza in caratteri per non farlo troncare a metà parola.
VOCAB_MAX_CHARS = 1000

# ── LLM locale via Ollama (SPEC §4, §6, §7.3) ───────────────────────────────
OLLAMA_URL = os.environ.get("REFERTI_OLLAMA", "http://localhost:11434")
MODELLO_LLM = os.environ.get("REFERTI_LLM", "gemma3:12b")
# Modello PER FASE (scelta del medico, 2026-08-17): la correzione — la fase
# più lunga, già protetta dal veto sui numeri, dal piano B e dalla revisione
# umana — può girare sul modello medio (~2× più veloce); la segretaria, che
# vive solo di comprensione delle regole, resta su quello impostato in
# REFERTI_LLM (il grande). Ogni fase è regolabile da invio.conf; senza
# override vale REFERTI_LLM. Occhio ai cambi di modello in memoria: ogni
# scambio costa ~30-60 s di ricarica, quindi conviene tenere sullo stesso
# modello le fasi consecutive.
MODELLO_CORREZIONE = os.environ.get("REFERTI_LLM_CORREZIONE", MODELLO_LLM)
# «lista» = il modello elenca le riparazioni e il codice le applica (veloce,
# numeri intoccabili per costruzione); «riscrittura» = vecchio metodo a
# riscrittura integrale, che resta comunque come ripiego automatico.
METODO_CORREZIONE = os.environ.get("REFERTI_CORREZIONE_METODO", "lista")
MODELLO_SEGRETERIA = os.environ.get("REFERTI_LLM_SEGRETERIA", MODELLO_LLM)
MODELLO_ISPEZIONE = os.environ.get("REFERTI_LLM_ISPEZIONE", MODELLO_LLM)
MODELLO_ESTRAZIONE = os.environ.get("REFERTI_LLM_ESTRAZIONE", MODELLO_LLM)
MODELLO_PERTINENZA = os.environ.get("REFERTI_LLM_PERTINENZA", MODELLO_LLM)
MODELLO_SENSO = os.environ.get("REFERTI_LLM_SENSO", MODELLO_LLM)
MODELLI_LLM_TUTTI = sorted({MODELLO_LLM, MODELLO_CORREZIONE, MODELLO_SEGRETERIA,
                            MODELLO_ISPEZIONE, MODELLO_ESTRAZIONE,
                            MODELLO_PERTINENZA, MODELLO_SENSO})
# 900 e non 300: su un dettato di 18 minuti la correzione in chiamata unica
# col 27b richiede 6-8 minuti di generazione — col vecchio limite di 5 andava
# in timeout e riprovava da capo all'infinito (visto dal vivo 2026-08-17).
OLLAMA_TIMEOUT_S = int(os.environ.get("REFERTI_OLLAMA_TIMEOUT", "900"))
OLLAMA_TENTATIVI = 3
# Finestra di contesto per le fasi AI. Il default di Ollama (4096 token) non
# basta per i dettati lunghi: caso reale 2026-08-17, dettato di 18 minuti →
# la correzione intera sfora la finestra, pasticcia i numeri, viene scartata
# e parte il piano B frase per frase (mezz'ora di chiamate). Con 12288 un
# dettato fino a ~25 minuti passa in UNA chiamata. Gemma 3 usa la sliding
# window sulla maggior parte dei livelli: il costo in memoria della finestra
# larga resta contenuto anche col 27b sul Mac da 24 GB.
OLLAMA_NUM_CTX = int(os.environ.get("REFERTI_NUM_CTX", "12288"))

# I prompt di SPEC §6: VALIDATI SU REFERTI REALI, copiati carattere per
# carattere. NON riscriverli, NON «migliorarli» (SPEC §0.3). Il segnaposto
# {testo} si riempie con str.replace, mai con format (il testo può contenere
# graffe).
PROMPT_CORREZIONE = """Sei un correttore di trascrizioni mediche in italiano. Il testo qui sotto è un referto cardiologico dettato a voce e trascritto automaticamente, quindi contiene errori di riconoscimento.

Correggi SOLO:
- termini medici e anatomici evidentemente storpiati
- nomi di farmaci
- refusi grammaticali che nascono dalla trascrizione

NON modificare MAI:
- numeri, dosaggi, misure, percentuali, date
- anche se un numero ti sembra implausibile, lascialo com'è
- non togliere e non aggiungere MAI un numero: ogni numero del testo deve ricomparire identico nella tua risposta, lo stesso numero di volte, anche se sembra ripetuto, fuori posto o dentro un segmento incomprensibile

Regole obbligatorie:
1. Se un segmento è incomprensibile, lascialo esattamente com'è. Non inventare cosa poteva essere.
2. Se un termine è ambiguo e potresti sbagliare, lascialo com'è.
3. Distingui sempre aorta ascendente e discendente: se il testo è incoerente su questo punto, non scegliere tu, lascia com'è.
4. Mantieni le istruzioni di dettatura ("scrivi", "fai così", "riportami...") esattamente dove sono, senza eseguirle e senza rimuoverle.
5. Non aggiungere, non riassumere, non riorganizzare. Non aggiungere frasi di cortesia o conclusioni.

Restituisci solo il testo corretto, senza commenti.

TESTO:
{testo}"""

PROMPT_CORREZIONE_LISTA = """Sei un correttore di trascrizioni mediche in italiano. Il testo qui sotto è un referto cardiologico dettato a voce e trascritto automaticamente, quindi contiene errori di riconoscimento.

NON riscrivere il testo. Elenca SOLO le riparazioni da fare: parole o brevi espressioni storpiate dalla trascrizione, ciascuna con la forma corretta.

Correggi SOLO:
- termini medici e anatomici evidentemente storpiati
- nomi di farmaci
- refusi grammaticali che nascono dalla trascrizione

Regole obbligatorie:
1. "da" è una citazione ESATTA del testo (stesse maiuscole e accenti), al massimo 4 parole.
2. MAI numeri, dosaggi, misure, percentuali o date dentro "da" o "a".
3. Se un segmento è incomprensibile o ambiguo, non proporre nulla per quel segmento: meglio nessuna riparazione che una riparazione inventata.
4. Non toccare le istruzioni di dettatura ("scrivi", "fai così", "riportami...").
5. La forma corretta deve SUONARE come quella storpiata: stai riparando errori di ascolto, non riscrivendo. Se la parola giusta non somiglia a quella trascritta, lasciala stare.
6. Non toccare unità di misura e abbreviazioni; non accorciare espressioni già corrette; non cambiare lo stile.
7. Al massimo 40 riparazioni, le più sicure.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"riparazioni": [{"da": "parola storpiata", "a": "forma corretta"}]}

TESTO:
{testo}"""

PROMPT_ISPEZIONE = """Leggi il testo qui sotto ed elenca i segmenti che risultano incomprensibili o privi di senso medico.

NON correggere nulla. NON riscrivere il testo. NON proporre alternative.

Restituisci solo un elenco puntato dei segmenti problematici, citandoli testualmente.
Se non ce ne sono, scrivi esattamente: nessuno

TESTO:
{testo}"""

PROMPT_ESTRAZIONE = """Leggi il referral qui sotto ed estrai i dati. Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, senza backtick.

Chiavi richieste:
- nome_paziente
- data_nascita
- medico_inviante
- medico_destinatario
- motivo_clinico (la ragione clinica, non la formula di cortesia)
- esami_richiesti
- fattori_rischio
- urgenza_testuale (le parole esatte del testo, senza interpretarle)
- valori_numerici (oggetto con i valori clinici trovati e la loro unità)

Se un dato non è presente, il valore deve essere esattamente: "non indicato"

Non dedurre, non inferire, non completare. Se non c'è, non c'è.

TESTO:
{testo}"""

CAMPI_RICHIESTI = [
    "nome_paziente", "data_nascita", "medico_inviante", "medico_destinatario",
    "motivo_clinico", "esami_richiesti", "fattori_rischio", "urgenza_testuale",
    "valori_numerici",
]

# Fase «segretaria» (aggiunta 2026-08, documentata in SPEC §6.4): il medico,
# dettando, a volte si rivolge alla segreteria («allegami la vecchia email»,
# «mandalo anche al dottor…»). Questa fase individua quelle frasi e le sposta
# in «note per la segreteria»: NON le esegue, NON le cancella — le cita
# testualmente, il codice verifica che esistano davvero nel testo e le toglie
# dal corpo del referto solo se la citazione è esatta. Nel dubbio resta tutto.
PROMPT_SEGRETERIA = """Sei una segretaria medica esperta. Il testo qui sotto è un referto cardiologico dettato a voce, già trascritto. A volte il medico, dettando, si rivolge alla segreteria: chiede di allegare documenti o vecchie email, di inviare copie a qualcuno, di fissare appuntamenti, o fa commenti organizzativi che non fanno parte del referto.

Il tuo compito: individua SOLO le frasi in cui il medico dà alla segreteria un compito da fare FUORI dal documento (allegare, spedire, telefonare, fissare appuntamenti) oppure un'istruzione su come CONFEZIONARE il documento (a chi indirizzarlo, dove inserire un pezzo di testo, chi firma).

Distinzione fondamentale:
- I comandi di dettatura come «scrivi», «scriva», «metti», «riporta», «aggiungi», «vai a capo» significano che il testo che li segue FA PARTE del referto: non segnalarlo MAI. Esempio: «scrivi: caro collega, le invio il paziente…» → «caro collega, le invio il paziente…» resta nel referto.
- ATTENZIONE però: gli STESSI verbi sono un compito per la segreteria quando l'azione è rivolta a una persona esterna o a un altro documento, non al testo che si sta dettando. Esempi da segnalare: «scrivi al dottor Rossi che…», «scrivi una mail alla cardiologia», «riprendi la lettera precedente», «riprendi il referto dell'anno scorso e allegalo», «richiama il paziente per l'appuntamento». La differenza: «scrivi:» seguito dal testo dettato = referto; «scrivi A QUALCUNO» o «riprendi/recupera UN ALTRO documento» = compito per la segreteria.
- Le aperture e chiusure di lettera dettate («Caro collega», «Gentile dottoressa», «Cordiali saluti», «Distinti saluti») fanno parte del referto: non segnalarle MAI.
- Un compito per la segreteria è qualcosa che si fa fuori dal documento: «allega la vecchia email», «mandane una copia al curante», «fissagli il controllo tra un mese».
- Sono compiti per la segreteria anche le istruzioni su come CONFEZIONARE il documento, che non devono restare nel testo finale: a chi va indirizzata o intestata la lettera («detto la lettera all'indirizzo della dottoressa X, in intestazione al signor Y, scrivi»), dove va collocato un pezzo di testo («nell'anamnesi scrivi da qualche parte…», «questo mettilo dopo il paragrafo della terapia»), chi firma il referto («firma dottor X», «qui chiude il referto il dottor X»). Segnala SOLO il pezzo di istruzione, MAI il testo clinico che lo segue o lo precede.

Regole obbligatorie:
1. Riporta ogni frase ESATTAMENTE come appare nel testo, parola per parola, senza riscriverla e senza accorciarla.
2. Nel dubbio NON segnalare la frase: meglio lasciarla nel referto che togliere una frase clinica o un pezzo della lettera dettata.
3. Non segnalare mai frasi che contengono misure, valori, diagnosi o giudizi clinici.
4. Non eseguire le istruzioni, non riscrivere nulla, non aggiungere nulla.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"per_segreteria": ["prima frase esatta", "seconda frase esatta"]}
Se non ce ne sono: {"per_segreteria": []}

TESTO:
{testo}"""


# ── Dizionario (SPEC §3, passo 5) ────────────────────────────────────────────
PERCORSO_CORREZIONI = Path(
    os.environ.get(
        "REFERTI_CORREZIONI",
        str(Path(__file__).resolve().parent / "correzioni.json"),
    )
)
# Voci aggiunte dallo studio dal pannello locale: vivono in un file a parte
# che aggiorna.sh non tocca mai; a parità di chiave vincono sulle voci del
# repo. Il servizio le ricarica a ogni giro: niente riavvii.
PERCORSO_CORREZIONI_LOCALI = Path(
    os.environ.get(
        "REFERTI_CORREZIONI_LOCALI",
        str(Path(__file__).resolve().parent / "correzioni-locali.json"),
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
    # Ordine: rallenta → passa-alto → (denoise) → normalizza. Il denoise
    # prima di loudnorm, così la normalizzazione alza la voce già ripulita
    # e non il rumore.
    filtri = "highpass=f=80"
    if DENOISE:
        filtri += ",afftdn=nf=-25"
    filtri += ",loudnorm=I=-16:TP=-1.5:LRA=11"
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
    # Corsa di recupero anti-troncamento: come la A, ma senza riporto di
    # contesto tra le finestre (vedi TRONC_*). Il flag è -mc 0 (max-context
    # zero): «-nc» NON esiste in whisper-cli 1.9.1 — stampa l'aiuto ed esce
    # con codice 0, producendo un testo vuoto in 0 secondi.
    "trascrizione_a_nc": ["-mc", "0"],
}


def _durata_wav_s(wav: Path) -> float:
    """Durata del WAV 16 kHz mono PCM 16 bit dall'intestazione fissa (44 byte)."""
    return max(0.0, (wav.stat().st_size - 44) / 32000)


def _ultimo_secondo(percorso_json: Path) -> float:
    """Tempo (s) dell'ultima parola trascritta secondo il JSON di whisper."""
    parole = parole_da_json(percorso_json)
    return parole[-1][1] if parole else 0.0


def carica_vocabolario() -> str:
    """Costruisce il prompt di dominio per whisper: termini del file base +
    di quello locale dello studio + i termini «giusti» del dizionario (i valori
    delle correzioni sono esattamente le parole da riconoscere bene). Ritorna
    stringa vuota se non c'è nulla. Contiene solo gergo clinico generico, mai
    dati di pazienti."""
    def da_file(p: Path) -> list[str]:
        if not p.is_file():
            return []
        try:
            return [
                r.strip() for r in p.read_text(encoding="utf-8").splitlines()
                if r.strip() and not r.strip().startswith("#")
            ]
        except OSError:
            return []

    def da_dizionario(p: Path) -> list[str]:
        # File annidato per sezioni (termini_clinici, linguaggio_comune, …); le
        # chiavi meta iniziano con «_». Raccoglie i valori «giusti» di ogni sezione.
        if not p.is_file():
            return []
        try:
            config = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        fuori: list[str] = []
        for chiave, sezione in config.items():
            if chiave.startswith("_") or not isinstance(sezione, dict):
                continue
            fuori.extend(str(v).strip() for v in sezione.values() if str(v).strip())
        return fuori

    # Priorità (il tetto taglia la coda): prima ciò che è specifico dello studio
    # — le sue aggiunte al dizionario e al vocabolario —, poi il vocabolario base
    # (farmaci e termini ostici in testa), infine il dizionario base generico.
    termini: list[str] = (
        da_dizionario(PERCORSO_CORREZIONI_LOCALI)
        + da_file(PERCORSO_VOCABOLARIO_LOCALI)
        + da_file(PERCORSO_VOCABOLARIO)
        + da_dizionario(PERCORSO_CORREZIONI)
    )
    # dedup senza distinzione di maiuscole, saltando i numeri puri.
    visti: set[str] = set()
    puliti: list[str] = []
    for t in termini:
        chiave = t.lower()
        if chiave in visti or t.replace(".", "").replace(",", "").isdigit():
            continue
        visti.add(chiave)
        puliti.append(t)
    if not puliti:
        return ""
    prompt = "Referto cardiologico. Termini ricorrenti: " + ", ".join(puliti) + "."
    if len(prompt) > VOCAB_MAX_CHARS:
        prompt = prompt[:VOCAB_MAX_CHARS].rsplit(",", 1)[0] + "."
    return prompt


def trascrivi(wav: Path, uscita_txt: Path, file_id: str, fase: str, prompt: str = "",
              con_tempi: bool = False) -> None:
    """Trascrizione con whisper.cpp, lingua italiana. Il testo esce
    direttamente su file (-otxt): stdout/stderr di whisper contengono la
    trascrizione e vengono scartati (SPEC §2.2). Il prompt di dominio
    (facoltativo) orienta il riconoscimento verso il gergo cardiologico.
    Con `con_tempi` scrive anche il JSON completo (-ojf): stessi risultati,
    in più i tempi dei singoli token per il testo sincronizzato."""
    inizio = time.monotonic()
    base = uscita_txt.with_suffix("")  # -of vuole il percorso senza estensione
    comando = [
        WHISPER_BIN,
        "-m", str(PERCORSO_MODELLO),
        "-l", "it",
        "-f", str(wav),
        "-otxt",
        *(["-ojf"] if con_tempi else []),
        *(["--vad", "-vm", str(PERCORSO_VAD), "--vad-speech-pad-ms", VAD_PAD_MS] if USA_VAD else []),
        "-of", str(base),
        "-np",
        *FLAG_PASSATA[fase],
    ]
    if prompt:
        comando += ["--prompt", prompt]
    esito = subprocess.run(
        comando,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=WHISPER_TIMEOUT_S,
    )
    if esito.returncode != 0:
        # Whisper caduto (tipico: -6/SIGABRT con la GPU ancora occupata dal
        # modello LLM). Si libera la memoria e si riprova UNA volta prima di
        # dichiarare il fallimento.
        log.warning(
            "fase=%s file=%s esito=riprovo codice=%d durata=%.1fs",
            fase, file_id, esito.returncode, time.monotonic() - inizio,
        )
        libera_llm()
        time.sleep(10)
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


# ── Tempi parola-per-parola (SPEC §8, campo «parole») ───────────────────────
# Dal JSON completo della passata A si ricava quando inizia ogni parola; poi
# le parole del testo FINALE (già passato da dizionario, correzione e
# segretaria) vengono allineate a quei tempi con un confronto deterministico
# (difflib): le parole cambiate ereditano un tempo interpolato dai vicini.
# Serve al testo sincronizzato della pagina di revisione: clic su una parola
# → l'audio salta lì. Se l'allineamento non convince, meglio niente.

def parole_da_json(percorso_json: Path) -> list[tuple[str, float]]:
    """Parole con il tempo d'inizio (in secondi) dal JSON di whisper (-ojf):
    i token si ricompongono in parole sugli spazi."""
    dati = json.loads(percorso_json.read_text(encoding="utf-8"))
    parole: list[tuple[str, float]] = []
    testo = ""
    inizio_ms = 0

    def chiudi() -> None:
        nonlocal testo
        if testo.strip():
            parole.append((testo.strip(), inizio_ms / 1000.0))
        testo = ""

    for seg in dati.get("transcription", []):
        for tok in seg.get("tokens", []):
            t = tok.get("text", "")
            if not t or (t.startswith("[") and t.endswith("]")):
                continue  # token speciali tipo [_BEG_]
            if t.startswith(" "):
                chiudi()
            if not testo.strip():
                inizio_ms = int(tok.get("offsets", {}).get("from") or 0)
            testo += t
        chiudi()  # il confine di segmento chiude sempre la parola
    return parole


def allinea_parole(testo: str, parole_audio: list[tuple[str, float]]) -> list[list]:
    """[[parola, secondi], …] per ogni parola di `testo` (split su spazi).
    Se combacia meno di metà del testo l'allineamento non è affidabile:
    lista vuota, la pagina mostra il testo semplice."""
    fin = testo.split()
    if not fin or not parole_audio:
        return []

    def norma(w: str) -> str:
        return re.sub(r"[^\w]+", "", w.lower())

    a = [norma(w) for w, _ in parole_audio]
    b = [norma(w) for w in fin]
    tempi: list[float | None] = [None] * len(fin)
    combaciate = 0
    for blocco in difflib.SequenceMatcher(None, b, a, autojunk=False).get_matching_blocks():
        for k in range(blocco.size):
            tempi[blocco.a + k] = parole_audio[blocco.b + k][1]
            combaciate += 1
    if combaciate < len(fin) / 2:
        return []

    noti = [i for i, t in enumerate(tempi) if t is not None]
    primo, ultimo = noti[0], noti[-1]
    prec = primo
    for i in range(len(tempi)):
        if tempi[i] is not None:
            prec = i
            continue
        if i < primo:
            tempi[i] = tempi[primo]
        elif i > ultimo:
            tempi[i] = tempi[ultimo]
        else:
            succ = next(j for j in noti if j > i)
            fraz = (i - prec) / (succ - prec)
            tempi[i] = tempi[prec] + (tempi[succ] - tempi[prec]) * fraz  # type: ignore[operator]
    return [[w, round(t, 2)] for w, t in zip(fin, tempi)]  # type: ignore[arg-type]


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
    if PERCORSO_CORREZIONI_LOCALI.is_file():
        locali = json.loads(PERCORSO_CORREZIONI_LOCALI.read_text(encoding="utf-8"))
        for sezione in ("termini_clinici", "linguaggio_comune"):
            config.setdefault(sezione, {}).update(locali.get(sezione, {}))
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


# ── Punteggiatura dettata (SPEC §3, passo 5b — aggiunto 2026-08-17) ──────────
# Il medico detta i segni a voce e whisper a volte li lascia scritti a parole
# («il paziente virgola visto oggi aperta parentesi …»). Qui diventano segni
# veri con REGOLE FISSE, niente AI: su un testo clinico una riscrittura
# libera può alterare il contenuto, una sostituzione letterale no. Richiesto
# dal medico dal vivo (2026-08-17). Gira su A e B dopo il dizionario, così
# il confronto lavora su testi già coerenti. Ordine: locuzioni lunghe prima
# delle corte («punto e virgola» prima di «virgola» e di «punto»).
# I segni convertiti nascono marcati con un sentinella (\x00): quando whisper
# ha messo SIA il segno spurio SIA la parola («stabile, punto» → «stabile,.»),
# nella sequenza di segni risultante vince quello dettato — il marcato —
# ovunque si trovi. Il sentinella sparisce prima di restituire il testo.
_PUNT_M = "\x00"
_PUNT_LOCUZIONI: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bpunto a capo\b", re.IGNORECASE), _PUNT_M + ".\n"),
    (re.compile(r"\ba capo\b", re.IGNORECASE), "\n"),
    (re.compile(r"\bpunto e virgola\b", re.IGNORECASE), _PUNT_M + ";"),
    (re.compile(r"\bpunto esclamativo\b", re.IGNORECASE), _PUNT_M + "!"),
    (re.compile(r"\bpunto interrogativo\b", re.IGNORECASE), _PUNT_M + "?"),
    (re.compile(r"\bdue punti\b", re.IGNORECASE), _PUNT_M + ":"),
    # «tra parentesi» in dettatura apre quasi sempre un inciso vero (chiuso
    # poi da «chiusa parentesi»); l'idioma «detto tra parentesi» nei referti
    # non ricorre.
    (re.compile(r"\b(?:apert\w+|apri|tra),? (?:la )?parentesi\b|\bparentesi aperta\b", re.IGNORECASE), "("),
    (re.compile(r"\b(?:chius\w+|chiudi|chiudo),? (?:la )?parentesi\b|\bparentesi chiusa\b", re.IGNORECASE), ")"),
    # «vergola» non esiste in italiano: è il modo tipico in cui whisper
    # storpia «virgola» dettata in fretta.
    (re.compile(r"\b(?:virgola|vergola)\b", re.IGNORECASE), _PUNT_M + ","),
    (re.compile(r"[ \t]*\btrattino\b[ \t]*", re.IGNORECASE), "-"),
]
# «punto» da solo è ambiguo («dal punto di vista», «a questo punto», «punto
# di repere»): diventa segno solo se NON preceduto da articoli/dimostrativi
# e NON seguito dalle parole che lo rendono un sostantivo. Le guardie
# tollerano una virgola spuria di whisper attaccata al contorno
# («dal, punto, di vista» resta parola come «dal punto di vista»).
_PUNT_ARTICOLI = ("il", "un", "al", "dal", "nel", "sul", "quel", "ogni", "questo", "stesso")
_PUNT_PUNTO_GUARDIA = (
    "".join(f"(?<!\\b{w} )(?<!\\b{w}, )" for w in _PUNT_ARTICOLI)
    + r"\bpunto\b"
    + r"(?!\s*,?\s*(?:e virgola|di|del|dell\w*|della|dei|delle|da|dal|dalla|in|su|a)\b)"
)
# Prima il caso «punto» + parola (la parola prende la maiuscola), poi il
# «punto» rimasto (fine testo o già seguito da un segno).
_PUNT_PUNTO_PAROLA = re.compile(_PUNT_PUNTO_GUARDIA + r"[ \t]+(\w)", re.IGNORECASE)
_PUNT_PUNTO_SOLO = re.compile(_PUNT_PUNTO_GUARDIA, re.IGNORECASE)


def punteggiatura_dettata(testo: str) -> tuple[str, int]:
    """Trasforma la punteggiatura dettata a parole in segni veri e sistema
    gli spazi attorno ai segni. Restituisce (testo, n. segni convertiti)."""
    totale = 0
    for pattern, segno in _PUNT_LOCUZIONI:
        testo, n = pattern.subn(segno, testo)
        totale += n
    testo, n = _PUNT_PUNTO_PAROLA.subn(lambda m: _PUNT_M + ". " + m.group(1).upper(), testo)
    totale += n
    testo, n = _PUNT_PUNTO_SOLO.subn(_PUNT_M + ".", testo)
    totale += n
    if totale:
        # Sequenze di segni sulla stessa riga («stabile,.» da «stabile,
        # punto»): vince il segno dettato (marcato), ovunque sia; una
        # sequenza senza segni dettati (es. i «...» di whisper) resta sua.
        def _vince_dettato(m: re.Match) -> str:
            run = m.group(0)
            i = run.rfind(_PUNT_M)
            return run[i + 1] if i != -1 else run

        # Un segno dettato rimasto da solo a inizio riga (il «punto» dettato
        # dopo una pausa) chiude la riga precedente.
        testo = re.sub(r"[ \t]*\n[ \t]*" + _PUNT_M + r"([.,;:!?])", r"\1", testo)
        testo = re.sub(
            "[" + _PUNT_M + r".,;:!?](?:[ \t]*[" + _PUNT_M + r".,;:!?])+",
            _vince_dettato, testo,
        )
        testo = testo.replace(_PUNT_M, "")
        # Segni spuri subito dopo «(», prima di «)» o a inizio riga.
        testo = re.sub(r"\([ \t]*[.,;:]+[ \t]*", "(", testo)
        testo = re.sub(r"[,;:]+[ \t]*\)", ")", testo)
        testo = re.sub(r"(\n)[ \t]*[.,;:!?]+[ \t]*", r"\1", testo)
        # Spazi: mai prima di , ; : . ! ? ) — mai dopo ( — righe pulite.
        testo = re.sub(r"[ \t]+([,;:.!?)])", r"\1", testo)
        testo = re.sub(r"\(\s+", "(", testo)
        testo = re.sub(r"[ \t]+\n", "\n", testo)
        testo = re.sub(r"\n[ \t]+", "\n", testo)
        testo = re.sub(r"[ \t]{2,}", " ", testo)
        # A inizio riga (dopo un «a capo» dettato) si riparte in maiuscolo.
        testo = re.sub(r"\n([a-zàèéìíòóùú])", lambda m: "\n" + m.group(1).upper(), testo)
    return testo, totale


# ── Anti-loop (SPEC §3, passo 4b) ────────────────────────────────────────────
# Quando whisper «si incanta» ripete la stessa frase o lo stesso gruppo di
# parole decine di volte di fila. È un difetto meccanico e si ripara
# meccanicamente: niente AI, solo ripetizioni consecutive IDENTICHE, con
# soglie prudenti perché le ripetizioni brevi possono essere dettatura vera
# («3 3», «no no no»). I gruppi di parole che contengono cifre non si
# toccano MAI (§2.4); la frase intera ripetuta si tocca anche con cifre,
# perché la stessa frase identica 3+ volte di fila non è dettatura.

SOGLIA_LOOP_FRASI = 3    # frase intera identica, consecutiva
SOGLIA_LOOP_CICLI = 2    # ciclo di 2-4 frasi: A-B-A-B basta (referto reale 2026-08-21)
SOGLIA_LOOP_GRUPPI = 4   # gruppo di 2-8 parole senza cifre
SOGLIA_LOOP_PAROLA = 6   # parola singola senza cifre


def _frasi_span(testo: str) -> list[tuple[int, int]]:
    """Intervalli (inizio, fine) delle frasi: tagli su .!?; e sugli a capo."""
    spans, inizio = [], 0
    for m in re.finditer(r"[.!?;]+\s*|\n+", testo):
        spans.append((inizio, m.end()))
        inizio = m.end()
    if inizio < len(testo):
        spans.append((inizio, len(testo)))
    return spans


def _norma_frase(s: str) -> str:
    return re.sub(r"[\s.!?;]+", " ", s.lower()).strip()


# Frasi che whisper INVENTA sul silenzio o sul rumore (allucinazioni note del
# modello in italiano, documentate in letteratura — arXiv 2501.11378): non
# vengono mai dettate da un medico, si tolgono a monte di tutto. Confronto
# senza distinzione di maiuscole; si rimuove l'intera frase che le contiene.
FRASI_FANTASMA = (
    "sottotitoli a cura di",
    "sottotitoli e revisione",
    "sottotitoli creati dalla",
    "amara.org",
    "grazie per aver guardato",
    "grazie per l'attenzione",
    "grazie per la visione",
    "iscriviti al canale",
    "alla prossima puntata",
    "www.",
)


def togli_frasi_fantasma(testo: str) -> tuple[str, int]:
    """Rimuove le frasi che contengono un marcatore di allucinazione nota.
    Testo pulito → restituito identico."""
    spans = _frasi_span(testo)
    da_togliere = []
    for a, b in spans:
        basso = testo[a:b].lower()
        if any(m in basso for m in FRASI_FANTASMA):
            da_togliere.append((a, b))
    for a, b in reversed(da_togliere):
        testo = testo[:a] + testo[b:]
    return testo, len(da_togliere)


def deduplica_loop(testo: str) -> tuple[str, int, list[str]]:
    """(testo bonificato, unità rimosse, citazioni delle frasi tenute).
    Le citazioni servono a segnalare in bozza il punto dell'intervento.
    Testo senza loop → restituito identico, nessuna citazione."""
    rimosse = 0
    citazioni: list[str] = []

    # 1) frase intera ripetuta di fila
    spans = _frasi_span(testo)
    norme = [_norma_frase(testo[a:b]) for a, b in spans]
    da_togliere: list[tuple[int, int]] = []
    i = 0
    while i < len(spans):
        j = i + 1
        while j < len(norme) and len(norme[i]) >= 3 and norme[j] == norme[i]:
            j += 1
        if j - i >= SOGLIA_LOOP_FRASI:
            da_togliere.append((spans[i][1], spans[j - 1][1]))
            rimosse += j - i - 1
            cit = testo[spans[i][0]:spans[i][1]].strip()
            if cit:
                citazioni.append(cit[:120])
        i = j
    for a, b in reversed(da_togliere):
        testo = testo[:a] + testo[b:]

    # 1b) frase QUASI identica ripetuta di fila: whisper «incantato» che
    #     varia una parola a ogni giro (visto dal vivo il 2026-08-17 sulla
    #     coda di un dettato lungo: la ripetizione sfuggiva al passo 1
    #     perché mai perfettamente uguale). Ogni frase si confronta con la
    #     PRIMA del suo gruppo: somiglianza ≥ 0.9, almeno 3 di fila, frasi
    #     non troppo corte. Cautela §2.4: il gruppo si tocca solo se tutte
    #     le copie hanno gli stessi numeri (in un loop vero anche i numeri
    #     si ripetono uguali); si tiene la prima copia.
    spans = _frasi_span(testo)
    frasi = [testo[a:b] for a, b in spans]
    norme = [_norma_frase(f) for f in frasi]
    da_togliere = []
    i = 0
    while i < len(spans):
        j = i + 1
        while (j < len(norme) and len(norme[i]) >= 12
               and difflib.SequenceMatcher(None, norme[i], norme[j]).ratio() >= 0.9):
            j += 1
        if (j - i >= SOGLIA_LOOP_FRASI
                and all(_numeri(frasi[k]) == _numeri(frasi[i]) for k in range(i, j))):
            da_togliere.append((spans[i][1], spans[j - 1][1]))
            rimosse += j - i - 1
            cit = frasi[i].strip()
            if cit:
                citazioni.append(cit[:120])
        i = j
    for a, b in reversed(da_togliere):
        testo = testo[:a] + testo[b:]

    # 1c) CICLO di 2-4 frasi ripetuto di fila (A-B-C-A-B-C…): whisper in
    #     loop che ALTERNA le stesse frasi — visto dal vivo il 2026-08-17
    #     in coda a un dettato lungo (ciclo di 3 frasi per ~15 giri), che
    #     sfugge ai passi 1 e 1b perché nessuna frase è uguale alla sua
    #     consecutiva. Norme identiche ⇒ numeri identici (§2.4): si tiene
    #     il primo giro del ciclo, il resto va.
    spans = _frasi_span(testo)
    norme = [_norma_frase(testo[a:b]) for a, b in spans]
    da_togliere = []
    i = 0
    while i < len(norme):
        avanzato = False
        for periodo in (2, 3, 4):
            if i + 2 * periodo > len(norme):
                continue
            if any(len(norme[i + k]) < 3 for k in range(periodo)):
                continue
            giri = 1
            while (i + (giri + 1) * periodo <= len(norme)
                   and all(norme[i + k] == norme[i + giri * periodo + k]
                           for k in range(periodo))):
                giri += 1
            if giri >= SOGLIA_LOOP_CICLI:
                fine = i + giri * periodo
                # Coda mozza del ciclo: whisper spesso interrompe l'ultimo
                # giro a metà frase (referto reale 2026-08-21). Le frasi in
                # coda che sono un troncone di quelle attese del ciclo
                # vengono tolte con il resto.
                extra = 0
                while fine + extra < len(norme):
                    attesa = norme[i + (extra % periodo)]
                    corta = norme[fine + extra]
                    if len(corta) >= 8 and attesa.startswith(corta):
                        extra += 1
                    else:
                        break
                da_togliere.append((spans[i + periodo - 1][1],
                                    spans[fine + extra - 1][1]))
                rimosse += (giri - 1) * periodo + extra
                cit = testo[spans[i][0]:spans[i][1]].strip()
                if cit:
                    citazioni.append(cit[:120])
                i = fine + extra
                avanzato = True
                break
        if not avanzato:
            i += 1
    for a, b in reversed(da_togliere):
        testo = testo[:a] + testo[b:]

    # 2) gruppo di 1-8 parole ripetuto di fila senza punteggiatura di frase.
    #    Periodo più corto per primo: «x x x x x x» è un loop di 1 parola,
    #    non di 3. Le finestre con cifre si saltano in blocco.
    token = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", testo)]
    bassi = [t[0].lower() for t in token]
    con_cifre = [bool(re.search(r"\d", t[0])) for t in token]
    da_togliere = []
    i = 0
    while i < len(token):
        salto = 1
        for n in range(1, 9):
            if i + 2 * n > len(token) or any(con_cifre[i:i + n]):
                continue
            r = 1
            while (i + (r + 1) * n <= len(token)
                   and bassi[i + r * n:i + (r + 1) * n] == bassi[i:i + n]):
                r += 1
            soglia = SOGLIA_LOOP_PAROLA if n == 1 else SOGLIA_LOOP_GRUPPI
            if r >= soglia:
                da_togliere.append((token[i + n - 1][2], token[i + r * n - 1][2]))
                rimosse += (r - 1) * n
                citazioni.append(testo[token[i][1]:token[i + n - 1][2]][:120])
                salto = r * n
                break
        i += salto
    for a, b in reversed(da_togliere):
        testo = testo[:a] + testo[b:]

    uniche: list[str] = []
    for c in citazioni:
        if c not in uniche:
            uniche.append(c)
    return testo, rimosse, uniche[:5]


def ollama_pronto() -> str | None:
    """Controllo d'avvio: Ollama raggiungibile e modello scaricato.
    Restituisce il motivo dell'errore, o None se tutto è a posto."""
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=5) as r:
            dati = json.loads(r.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError):
        return "ollama_non_raggiungibile"
    nomi = [m.get("name", "") for m in dati.get("models", [])]
    for modello in MODELLI_LLM_TUTTI:
        if not any(n == modello or n.startswith(modello + ":") for n in nomi):
            return "modello_llm_mancante"
    return None


def libera_llm() -> None:
    """Chiede a Ollama di scaricare SUBITO il modello dalla memoria
    (keep_alive 0). Sul Mac da 24 GB gemma3:27b (~18 GB residenti) e
    whisper large-v3 non convivono sulla GPU: se il modello LLM è ancora
    caricato quando parte una trascrizione — capita quando due dettati
    arrivano di fila, Ollama tiene il modello 5 minuti dopo l'ultimo uso —
    whisper fallisce a metà e abortisce in chiusura (SIGABRT/-6, visto dal
    vivo e riprodotto il 2026-08-16; il file finiva in errori/ e il dettato
    sembrava «bloccato»). Best-effort: se Ollama non risponde, la
    trascrizione parte comunque."""
    for modello in MODELLI_LLM_TUTTI:
        corpo = json.dumps({"model": modello, "keep_alive": 0}).encode("utf-8")
        try:
            richiesta = urllib.request.Request(
                OLLAMA_URL + "/api/generate",
                data=corpo,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(richiesta, timeout=30).read()
        except (urllib.error.URLError, TimeoutError, OSError):
            pass


def chiama_ollama(prompt: str, file_id: str, fase: str, formato_json: bool = False,
                  modello: str | None = None) -> str:
    """Una chiamata a /api/generate con 3 tentativi e pausa crescente
    (SPEC §7.2). Temperatura 0: stessa domanda, stessa risposta."""
    richiesta_dati = {
        "model": modello or MODELLO_LLM,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0, "num_ctx": OLLAMA_NUM_CTX},
    }
    if formato_json:
        richiesta_dati["format"] = "json"  # SPEC §6.3: output JSON garantito
    corpo = json.dumps(richiesta_dati).encode("utf-8")
    for tentativo in range(1, OLLAMA_TENTATIVI + 1):
        try:
            richiesta = urllib.request.Request(
                OLLAMA_URL + "/api/generate",
                data=corpo,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(richiesta, timeout=OLLAMA_TIMEOUT_S) as r:
                risposta = json.loads(r.read().decode("utf-8"))
            testo = risposta.get("response", "")
            if isinstance(testo, str) and testo.strip():
                return testo
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            pass
        if tentativo < OLLAMA_TENTATIVI:
            time.sleep(5 * tentativo)
    log.error(
        "fase=%s file=%s esito=errore motivo=ollama_non_risponde tentativi=%d",
        fase, file_id, OLLAMA_TENTATIVI,
    )
    raise RuntimeError("ollama non risponde")


def _numeri(testo: str) -> list[str]:
    """Tutti i numeri del testo (con eventuale decimale), ordinati: la firma
    numerica che la correzione AI non deve mai alterare."""
    return sorted(re.findall(r"\d+(?:[.,]\d+)?", testo))


def _distanza_battitura(a: str, b: str) -> int:
    """Distanza di Levenshtein semplice (parole corte: costo trascurabile)."""
    if a == b:
        return 0
    prec = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (ca != cb)))
        prec = cur
    return prec[-1]


def _riparazione_plausibile(da: str, a: str) -> bool:
    """Una vera storpiatura di trascrizione SUONA come la parola giusta:
    accetta solo coppie foneticamente vicine (visto dal vivo il 2026-08-21:
    il modello proponeva «serrada → severa» — parola sensata ma sbagliata —
    e ritocchi di stile tipo «grammi → g/dL»). Vietate anche le barre
    introdotte dal nulla (unità di misura)."""
    if "/" in a and "/" not in da:
        return False
    ba, bb = da.lower(), a.lower()
    dist = _distanza_battitura(ba, bb)
    if dist <= max(1, round(max(len(ba), len(bb)) * 0.34)):
        return True
    # Sigle: «reg → ECG» (visto dal vivo) suona uguale ma per lettere è
    # lontano; per le sigle corte tutte maiuscole basta una vicinanza lasca.
    return a.isupper() and len(a) <= 5 and len(da.split()) == 1 and dist <= 2


def _correggi_a_lista(testo: str, file_id: str) -> str | None:
    """Correzione «a lista di riparazioni» (idea dell'utente, 2026-08-21):
    il modello NON riscrive il testo — elenca solo gli scambi «parola
    storpiata → forma giusta» e il CODICE li applica, come già fa col
    dizionario dello studio. Vantaggi: risposta corta (minuti invece di
    decine di minuti) e numeri intoccabili PER COSTRUZIONE, perché ogni
    coppia che contiene cifre viene rifiutata a priori. Ritorna None se il
    modello non produce una lista utilizzabile: il chiamante ripiega sulla
    vecchia riscrittura integrale."""
    inizio = time.monotonic()
    try:
        uscita = chiama_ollama(
            PROMPT_CORREZIONE_LISTA.replace("{testo}", testo), file_id,
            "correzione_llm", formato_json=True, modello=MODELLO_CORREZIONE,
        )
        dati = json.loads(uscita)
    except (RuntimeError, json.JSONDecodeError):
        return None
    coppie = dati.get("riparazioni") if isinstance(dati, dict) else None
    if not isinstance(coppie, list):
        return None
    applicate = 0
    scartate = 0
    nuovo = testo
    for voce in coppie[:60]:
        if not isinstance(voce, dict):
            scartate += 1
            continue
        da = str(voce.get("da", "")).strip()
        a = str(voce.get("a", "")).strip()
        if (not da or not a or da == a or len(da) > 60 or len(a) > 60
                or re.search(r"\d", da) or re.search(r"\d", a)
                or len(a.split()) > len(da.split()) + 2
                or not _riparazione_plausibile(da, a)):
            scartate += 1
            continue
        patt = re.compile(r"(?<!\w)" + re.escape(da) + r"(?!\w)")
        nuovo, n = patt.subn(lambda _m: a, nuovo)
        if n > 0:
            applicate += 1
        else:
            scartate += 1
    if _numeri(nuovo) != _numeri(testo):
        # Non dovrebbe mai accadere (le coppie con cifre sono rifiutate):
        # cintura di sicurezza sul vincolo §2.4.
        log.warning(
            "fase=correzione_llm file=%s esito=lista_scartata motivo=numeri_cambiati",
            file_id,
        )
        return None
    log.info(
        "fase=correzione_llm file=%s esito=ok_lista riparazioni=%d scartate=%d durata=%.1fs",
        file_id, applicate, scartate, time.monotonic() - inizio,
    )
    return nuovo


def correggi_llm(testo: str, file_id: str, rapporto_scarto: Path) -> str:
    """Correzione col prompt §6.1. Rete di sicurezza sul vincolo §2.4:
    se la firma numerica cambia, o il testo esce troppo accorciato
    (modello che riassume) o troppo allungato (modello che inventa),
    la correzione AI si scarta IN BLOCCO e si tiene il testo d'ingresso.
    Meglio nessuna correzione che una correzione infedele.
    Allo scarto per numeri, le differenze finiscono in un file locale
    accanto agli altri (mai nei log, SPEC §2.2): serve a capire se è stata
    una manomissione vera o un falso allarme del controllo.
    Dal 2026-08-21 il metodo di prima scelta è la lista di riparazioni
    (REFERTI_CORREZIONE_METODO=lista): la riscrittura integrale qui sotto
    scatta solo come ripiego."""
    if METODO_CORREZIONE == "lista":
        esito_lista = _correggi_a_lista(testo, file_id)
        if esito_lista is not None:
            return esito_lista
        log.warning(
            "fase=correzione_llm file=%s esito=lista_fallita ripiego=riscrittura",
            file_id,
        )
    inizio = time.monotonic()
    uscita = chiama_ollama(
        PROMPT_CORREZIONE.replace("{testo}", testo), file_id, "correzione_llm",
        modello=MODELLO_CORREZIONE,
    ).strip() + "\n"
    durata = time.monotonic() - inizio
    if _numeri(uscita) != _numeri(testo):
        prima, dopo = _numeri(testo), _numeri(uscita)
        rapporto = {
            "numeri_solo_nel_testo_originale": [n for n in prima if n not in dopo or prima.count(n) > dopo.count(n)],
            "numeri_solo_nella_correzione_ai": [n for n in dopo if n not in prima or dopo.count(n) > prima.count(n)],
        }
        rapporto_scarto.write_text(
            json.dumps(rapporto, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        log.warning(
            "fase=correzione_llm file=%s esito=scartata motivo=numeri_cambiati durata=%.1fs",
            file_id, durata,
        )
        return _correggi_a_blocchi(testo, file_id)
    if not 0.6 <= len(uscita) / max(len(testo), 1) <= 1.4:
        log.warning(
            "fase=correzione_llm file=%s esito=scartata motivo=lunghezza_anomala durata=%.1fs",
            file_id, durata,
        )
        return _correggi_a_blocchi(testo, file_id)
    log.info("fase=correzione_llm file=%s esito=ok durata=%.1fs", file_id, durata)
    return uscita


def _correggi_a_blocchi(testo: str, file_id: str) -> str:
    """Ripiego chirurgico quando la correzione del testo intero viene
    scartata (palestra del 2026-07-24: il difetto «3 3» ripetuto non si
    corregge via prompt). Stesso prompt §6.1, applicato blocco per blocco:
    ogni blocco con la firma numerica intatta si tiene corretto, ogni
    blocco dove l'AI ha toccato un numero resta originale. Il danno si
    limita alla singola frase invece di buttare tutte le correzioni."""
    inizio = time.monotonic()
    blocchi = testo.splitlines()
    if len(blocchi) <= 1:
        blocchi = re.split(r"(?<=[.!?])\s+", testo)
    corretti: list[str] = []
    scartati = 0
    for blocco in blocchi:
        if not any(c.isalpha() for c in blocco):
            corretti.append(blocco)
            continue
        uscita = chiama_ollama(
            PROMPT_CORREZIONE.replace("{testo}", blocco), file_id, "correzione_llm",
            modello=MODELLO_CORREZIONE,
        ).strip()
        lunghezza_ok = len(blocco) < 40 or 0.5 <= len(uscita) / len(blocco) <= 2.0
        if _numeri(uscita) == _numeri(blocco) and lunghezza_ok:
            corretti.append(uscita)
        else:
            scartati += 1
            corretti.append(blocco)
    log.info(
        "fase=correzione_llm file=%s esito=ok_a_blocchi blocchi=%d scartati=%d durata=%.1fs",
        file_id, len(blocchi), scartati, time.monotonic() - inizio,
    )
    return "\n".join(corretti) + "\n"


def _parse_ispezione(uscita: str) -> list[str]:
    """Dall'elenco puntato del prompt §6.2 alla lista dei segmenti dubbi.
    «nessuno» (anche con punto) = lista vuota; righe di cornice tipo
    «Ecco i segmenti:» scartate."""
    dubbi: list[str] = []
    for riga in uscita.strip().splitlines():
        r = riga.strip()
        r = re.sub(r"^[-*•–—]+\s*", "", r)
        r = re.sub(r"^\d+[.)]\s*", "", r)
        r = r.strip().strip('"«»""')
        if not r or r.endswith(":"):
            continue
        if r.lower().rstrip(".") == "nessuno":
            continue
        dubbi.append(r)
    return dubbi[:100]


# ── Pertinenza (evidenziatore) e senso delle frasi (2026-08-17) ──────────────
# Richiesta del medico: (1) i medici dettando a volte DIVAGANO — l'AI segnala
# le frasi fuori tema, la pagina di revisione le mostra «spente» e la persona
# decide con un clic cosa entra nel referto (l'AI non toglie MAI nulla da
# sola); (2) le frasi uscite storpiate e prive di senso dalla trascrizione
# vengono segnalate frase per frase, con una proposta di ricostruzione basata
# sul GLOSSARIO dello studio (mai applicata da sola, numeri mai toccati).

PROMPT_PERTINENZA = """Sei un assistente che prepara referti medici. Il testo qui sotto è un referto cardiologico dettato a voce. A volte il medico, parlando, DIVAGA: commenti personali, chiacchiere, riferimenti ad altre faccende che non c'entrano con il paziente né con la lettera al collega.

Il tuo compito: individua SOLO le frasi fuori tema rispetto al referto.

NON segnalare MAI: saluti e formule di cortesia della lettera, dati clinici, valori, diagnosi, farmaci, raccomandazioni al collega o al paziente, la firma.

Regole obbligatorie:
1. Riporta ogni frase ESATTAMENTE come appare nel testo, parola per parola.
2. Nel dubbio NON segnalare: meglio una divagazione nel referto che una frase clinica esclusa.
3. Non segnalare mai frasi che contengono misure, valori o giudizi clinici.

Rispondi SOLO con un oggetto JSON valido:
{"fuori_tema": ["prima frase esatta", "seconda frase esatta"]}
Se non ce ne sono: {"fuori_tema": []}

TESTO:
{testo}"""


def trova_divagazioni(testo: str, file_id: str) -> list[str]:
    """Fase «pertinenza»: l'AI segnala le frasi fuori tema, il testo resta
    INTATTO — le citazioni finiscono in bozza e la pagina le mostra spente,
    la persona riaccende con un clic. Difese: solo citazioni esatte; se l'AI
    volesse spegnere più di un terzo del testo, si ignora tutto."""
    inizio = time.monotonic()
    uscita = chiama_ollama(
        PROMPT_PERTINENZA.replace("{testo}", testo), file_id, "pertinenza",
        formato_json=True, modello=MODELLO_PERTINENZA,
    )
    frasi: list[str] = []
    try:
        dati = json.loads(uscita)
        if isinstance(dati, dict) and isinstance(dati.get("fuori_tema"), list):
            frasi = [f for f in dati["fuori_tema"] if isinstance(f, str)]
    except json.JSONDecodeError:
        pass
    vere = [f.strip() for f in frasi if len(f.strip()) >= 8 and f.strip() in testo]
    if sum(len(f) for f in vere) > len(testo) * 0.35:
        log.warning(
            "fase=pertinenza file=%s esito=ignorata motivo=esclusione_eccessiva proposte=%d durata=%.1fs",
            file_id, len(vere), time.monotonic() - inizio,
        )
        return []
    log.info(
        "fase=pertinenza file=%s esito=ok fuori_tema=%d scartate=%d durata=%.1fs",
        file_id, len(vere), len(frasi) - len(vere), time.monotonic() - inizio,
    )
    return vere[:60]


PROMPT_SENSO = """Sei un revisore di trascrizioni mediche in italiano. Il testo qui sotto è un referto dettato a voce e trascritto automaticamente: alcune frasi possono essere uscite STORPIATE, prive di senso in un italiano corretto.

Il tuo compito, frase per frase: individua le frasi che NON hanno senso, anche considerando il contesto del referto. Per ognuna prova a ricostruire il senso più probabile aiutandoti con il GLOSSARIO dei termini dello studio; se non ci riesci, lascia la proposta vuota.

GLOSSARIO: {glossario}

Regole obbligatorie:
1. «frase» deve essere una citazione ESATTA del testo, parola per parola.
2. La proposta non deve MAI cambiare i numeri, aggiungerne o toglierne.
3. Nel dubbio NON segnalare: le frasi corrette, anche se colloquiali o burocratiche, non si toccano.

Rispondi SOLO con un oggetto JSON valido:
{"frasi": [{"frase": "citazione esatta", "proposta": "ricostruzione oppure stringa vuota"}]}
Se tutte le frasi hanno senso: {"frasi": []}

TESTO:
{testo}"""


def controlla_senso(testo: str, glossario: str, file_id: str) -> list[dict]:
    """Fase «senso»: frase per frase, le frasi prive di senso vengono
    segnalate con una proposta di ricostruzione basata sul glossario dello
    studio. La proposta è SOLO un suggerimento per chi rivede: mai applicata
    da sola, e se cambia anche un numero viene azzerata (resta la
    segnalazione)."""
    inizio = time.monotonic()
    prompt = PROMPT_SENSO.replace("{glossario}", glossario or "(vuoto)").replace("{testo}", testo)
    uscita = chiama_ollama(prompt, file_id, "senso", formato_json=True, modello=MODELLO_SENSO)
    voci: list[dict] = []
    try:
        dati = json.loads(uscita)
        grezzi = dati.get("frasi") if isinstance(dati, dict) else None
        for g in grezzi if isinstance(grezzi, list) else []:
            if not isinstance(g, dict):
                continue
            frase = str(g.get("frase", "")).strip()
            proposta = str(g.get("proposta", "")).strip()
            if len(frase) < 8 or frase not in testo:
                continue
            if proposta and _numeri(proposta) != _numeri(frase):
                proposta = ""  # veto §2.4: resta la segnalazione, cade la proposta
            voci.append({"frase": frase[:300], "proposta": proposta[:300]})
    except json.JSONDecodeError:
        pass
    log.info(
        "fase=senso file=%s esito=ok segnalate=%d con_proposta=%d durata=%.1fs",
        file_id, len(voci), sum(1 for v in voci if v["proposta"]), time.monotonic() - inizio,
    )
    return voci[:50]


def ispeziona_llm(testo: str, file_id: str) -> list[str]:
    """Ispezione col prompt §6.2: SOLO elenco dei segmenti dubbi, nessuna
    modifica al testo (compito separato apposta: un 12B non riesce a
    trasformare e annotare insieme)."""
    inizio = time.monotonic()
    uscita = chiama_ollama(
        PROMPT_ISPEZIONE.replace("{testo}", testo), file_id, "ispezione_llm",
        modello=MODELLO_ISPEZIONE,
    )
    dubbi = _parse_ispezione(uscita)
    log.info(
        "fase=ispezione_llm file=%s esito=ok dubbi=%d durata=%.1fs",
        file_id, len(dubbi), time.monotonic() - inizio,
    )
    return dubbi


def _applica_note_segreteria(testo: str, frasi: list) -> tuple[str, list[str]]:
    """Applica con prudenza l'elenco della fase segretaria: una frase viene
    spostata nelle note SOLO se è una citazione esatta del testo (almeno 8
    caratteri, senza sovrapposizioni) e se il referto che resta è ancora
    sostanzioso (almeno il 40% del testo e mai poche parole) — se l'AI chiede
    di togliere troppo, è più probabile un suo errore che un medico molto
    chiacchierone: si tiene tutto. Logica pura, testabile."""
    intervalli: list[tuple[int, int, str]] = []
    for f in frasi:
        if not isinstance(f, str):
            continue
        f = f.strip()
        if len(f) < 8:
            continue
        i = testo.find(f)
        if i == -1:
            continue
        fine = i + len(f)
        if any(i < b and fine > a for a, b, _ in intervalli):
            continue
        intervalli.append((i, fine, f))
    if not intervalli:
        return testo, []
    resto = len(testo) - sum(b - a for a, b, _ in intervalli)
    if resto < max(40, len(testo) * 0.4):
        return testo, []
    intervalli.sort()
    pezzi: list[str] = []
    pos = 0
    note: list[str] = []
    for a, b, f in intervalli:
        pezzi.append(testo[pos:a])
        note.append(f)
        pos = b
    pezzi.append(testo[pos:])
    pulito = "".join(pezzi)
    # Ricuci gli spazi lasciati dalle rimozioni, senza toccare altro.
    pulito = re.sub(r"[ \t]{2,}", " ", pulito)
    pulito = re.sub(r" +([,.;:])", r"\1", pulito)
    pulito = re.sub(r"\n{3,}", "\n\n", pulito).strip()
    if not pulito:
        return testo, []
    return pulito, note


def separa_segreteria(testo: str, file_id: str) -> tuple[str, list[str]]:
    """Fase «segretaria» (SPEC §6.4): individua le frasi in cui il medico si
    rivolge alla segreteria e le sposta nelle note. Difensiva come tutto il
    resto: JSON non valido o citazioni non esatte → il testo resta intero."""
    inizio = time.monotonic()
    uscita = chiama_ollama(
        PROMPT_SEGRETERIA.replace("{testo}", testo), file_id, "segreteria",
        formato_json=True, modello=MODELLO_SEGRETERIA,
    )
    frasi: list = []
    try:
        dati = json.loads(uscita)
        if isinstance(dati, dict) and isinstance(dati.get("per_segreteria"), list):
            frasi = dati["per_segreteria"]
    except json.JSONDecodeError:
        pass
    pulito, note = _applica_note_segreteria(testo, frasi)
    log.info(
        "fase=segreteria file=%s esito=ok note=%d scartate=%d durata=%.1fs",
        file_id, len(note), len(frasi) - len(note), time.monotonic() - inizio,
    )
    return pulito, note


def estrai_campi(testo: str, file_id: str) -> dict:
    """Estrazione col prompt §6.3. JSON non parsabile → un solo retry
    (SPEC §7.2). Campi assenti riempiti con «non indicato»: mai dedotti."""
    inizio = time.monotonic()
    prompt = PROMPT_ESTRAZIONE.replace("{testo}", testo)
    dati = None
    for _ in range(2):
        uscita = chiama_ollama(prompt, file_id, "estrazione", formato_json=True,
                               modello=MODELLO_ESTRAZIONE)
        try:
            candidato = json.loads(uscita)
        except json.JSONDecodeError:
            continue
        if isinstance(candidato, dict):
            dati = candidato
            break
    if dati is None:
        log.error("fase=estrazione file=%s esito=errore motivo=json_non_parsabile", file_id)
        raise RuntimeError("estrazione non parsabile")

    for chiave in CAMPI_RICHIESTI:
        if chiave not in dati or dati[chiave] in (None, ""):
            dati[chiave] = {} if chiave == "valori_numerici" else "non indicato"
    if not isinstance(dati["valori_numerici"], dict):
        dati["valori_numerici"] = {}

    presenti = sum(
        1 for c in CAMPI_RICHIESTI
        if c != "valori_numerici" and dati[c] != "non indicato"
    )
    log.info(
        "fase=estrazione file=%s esito=ok campi_presenti=%d valori=%d durata=%.1fs",
        file_id, presenti, len(dati["valori_numerici"]), time.monotonic() - inizio,
    )
    return dati


def _primo_numero(valore) -> float | None:
    """Il primo numero dentro un valore estratto, comunque sia fatto
    (numero, stringa «70 bpm», oggetto {valore, unita})."""
    if isinstance(valore, bool):
        return None
    if isinstance(valore, (int, float)):
        return float(valore)
    if isinstance(valore, str):
        m = re.search(r"\d+(?:[.,]\d+)?", valore)
        return float(m.group(0).replace(",", ".")) if m else None
    if isinstance(valore, dict):
        for v in valore.values():
            n = _primo_numero(v)
            if n is not None:
                return n
    return None


def controlla_valori(campi: dict, testo: str, controlli: dict, file_id: str) -> list[dict]:
    """Controlli numerici (SPEC §3 passo 10): si SEGNALA, mai si corregge
    (§2.4). Tre tipi di allarme: «fuori» dall'intervallo, «limite» (entro il
    10% dell'ampiezza dal bordo), «non_trovato_nel_testo» (valore estratto
    che nel testo non c'è: possibile allucinazione dell'estrazione)."""
    inizio = time.monotonic()
    allarmi: list[dict] = []
    numeri_testo = {float(n.replace(",", ".")) for n in _numeri(testo)}

    def _norm_nome(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")

    basi = {
        ctrl: re.sub(r"_(bpm|mmhg|pct|mm|kg|cm|anni)$", "", ctrl)
        for ctrl in controlli
    }
    # Unità → controllo, solo dove l'unità è inequivocabile (mm = aorta;
    # mmhg no: sistolica o diastolica?). Serve per la forma invertita.
    per_unita: dict[str, list[str]] = {}
    for ctrl in controlli:
        m = re.search(r"_(bpm|mmhg|pct|mm|kg|cm|anni)$", ctrl)
        if m:
            per_unita.setdefault(m.group(1), []).append(ctrl)

    for nome, valore in (campi.get("valori_numerici") or {}).items():
        n = _primo_numero(valore)
        if n is None:
            # Forma invertita, vista su dettati reali: {"57": "mm"} —
            # il numero nella chiave, l'unità nel valore.
            n = _primo_numero(nome)
            if n is None:
                continue
            nome = str(valore) if isinstance(valore, str) and valore.strip() else "valore"
        if n not in numeri_testo:
            allarmi.append({
                "campo": nome, "valore": n,
                "intervallo": None, "stato": "non_trovato_nel_testo",
            })
        nome_n = _norm_nome(nome)
        candidati = [
            ctrl for ctrl, base in basi.items()
            if base in nome_n or nome_n in base
        ]
        if not candidati and nome_n in per_unita and len(per_unita[nome_n]) == 1:
            # Il nome è solo un'unità («mm»): se identifica un unico
            # controllo, si usa quello; se è ambigua, meglio non indovinare.
            candidati = per_unita[nome_n]
        for ctrl in candidati:
            minimo, massimo = controlli[ctrl].get("min"), controlli[ctrl].get("max")
            if minimo is None or massimo is None:
                continue
            margine = (massimo - minimo) * 0.10
            intervallo = f"{minimo}-{massimo}"
            if n < minimo or n > massimo:
                stato = "fuori"
            elif n < minimo + margine or n > massimo - margine:
                stato = "limite"
            else:
                break
            allarmi.append({
                "campo": nome, "valore": n,
                "intervallo": intervallo, "stato": stato,
            })
            break
    log.info(
        "fase=controlli file=%s esito=ok allarmi=%d durata=%.1fs",
        file_id, len(allarmi), time.monotonic() - inizio,
    )
    return allarmi


class ErroreElaborazione(Exception):
    """Fallimento di una fase su un singolo file: porta con sé fase e tipo
    (mai contenuti). In modalità servizio manda il file in errori/."""

    def __init__(self, fase: str, tipo: str, file_id: str | None = None):
        super().__init__(f"{fase}:{tipo}")
        self.fase = fase
        self.tipo = tipo
        self.file_id = file_id


def controlli_avvio():
    """Verifiche una-volta-sola prima di lavorare: strumenti, modelli,
    configurazione. Restituisce (sostituzioni, controlli) o None."""
    if not 0.5 <= ATEMPO <= 1.5:
        log.error("fase=avvio file=? esito=errore motivo=atempo_non_valido")
        return None
    if shutil.which(WHISPER_BIN) is None:
        log.error("fase=avvio file=? esito=errore motivo=whisper_mancante")
        return None
    if not PERCORSO_MODELLO.is_file():
        log.error("fase=avvio file=? esito=errore motivo=modello_mancante")
        return None
    try:
        sostituzioni = carica_sostituzioni()
        controlli = {
            k: v
            for k, v in json.loads(PERCORSO_CORREZIONI.read_text(encoding="utf-8"))
            .get("controlli_numerici", {}).items()
            if not k.startswith("_") and isinstance(v, dict)
        }
    except FileNotFoundError:
        log.error("fase=avvio file=? esito=errore motivo=correzioni_mancanti")
        return None
    except (json.JSONDecodeError, AttributeError, TypeError):
        log.error("fase=avvio file=? esito=errore motivo=correzioni_non_valide")
        return None
    motivo = ollama_pronto()
    if motivo:
        log.error("fase=avvio file=? esito=errore motivo=%s", motivo)
        return None
    return sostituzioni, controlli


def elabora(ingresso: Path, dir_out: Path, sostituzioni, controlli, notifica=None) -> tuple[str, dict]:
    """L'intera catena su un file audio. I file intermedi nascono in dir_out;
    il risultato è (file_id, payload SPEC §8). Su errore alza
    ErroreElaborazione dopo aver loggato (mai contenuti nei log).
    `notifica(fase)`, se passata, viene chiamata a ogni cambio di fase
    (avanzamento vivo sulla piattaforma per i dettati del drag & drop)."""
    file_id = file_id_di(ingresso)
    # La configurazione nel log (mai contenuti): serve a sapere, a posteriori,
    # con quali impostazioni è stata prodotta una corsa.
    log.info("fase=avvio file=%s atempo=%s denoise=%d vad=%d", file_id, ATEMPO, int(DENOISE), int(USA_VAD))

    def percorso(suffisso: str) -> Path:
        return dir_out / f"{file_id}{suffisso}"

    fase = "preprocessing"
    _ = notifica and notifica(fase)
    try:
        preprocessa(ingresso, percorso(".wav"), file_id)
        # Vocabolario di dominio per whisper (SPEC §4.2): stesso prompt per le due
        # passate. Nel log solo il numero di termini, mai il contenuto.
        vocab = carica_vocabolario()
        n_vocab = vocab.count(",") + 1 if vocab else 0
        log.info("fase=vocabolario file=%s termini=%d", file_id, n_vocab)
        fase = "trascrizione_a"
        _ = notifica and notifica(fase)
        # Prima delle trascrizioni: via il modello LLM dalla memoria — sulla
        # GPU whisper e gemma non ci stanno insieme (vedi libera_llm).
        libera_llm()
        trascrivi(percorso(".wav"), percorso(".txt"), file_id, fase, vocab, con_tempi=True)
        # Anti-troncamento (vedi TRONC_*): se la trascrizione copre molto meno
        # audio del WAV, quasi sempre un loop si è mangiato la coda del
        # dettato. Corsa di recupero con -nc; vince chi copre più audio.
        # Mai bloccante: se il recupero fallisce si tiene la corsa originale.
        try:
            durata_wav = _durata_wav_s(percorso(".wav"))
            ultimo_a = _ultimo_secondo(percorso(".json"))
        except Exception:
            durata_wav = ultimo_a = 0.0
        scoperto = durata_wav - ultimo_a
        if (durata_wav >= TRONC_AUDIO_MIN_S and scoperto >= TRONC_GAP_MIN_S
                and scoperto / durata_wav >= TRONC_GAP_FRAZ):
            log.warning(
                "fase=trascrizione_a file=%s esito=riprovo_troncamento audio_s=%d trascritto_s=%d",
                file_id, int(durata_wav), int(ultimo_a),
            )
            ultimo_nc = 0.0
            try:
                trascrivi(percorso(".wav"), percorso(".nc.txt"), file_id,
                          "trascrizione_a_nc", "", con_tempi=True)
                ultimo_nc = _ultimo_secondo(percorso(".nc.json"))
            except Exception:
                pass
            if ultimo_nc > ultimo_a:
                percorso(".nc.txt").replace(percorso(".txt"))
                percorso(".nc.json").replace(percorso(".json"))
                log.info(
                    "fase=trascrizione_a file=%s esito=coda_recuperata trascritto_s=%d",
                    file_id, int(ultimo_nc),
                )
            else:
                log.info("fase=trascrizione_a file=%s esito=coda_non_recuperata", file_id)
        fase = "trascrizione_b"
        _ = notifica and notifica(fase)
        trascrivi(percorso(".wav"), percorso(".b.txt"), file_id, fase, vocab)

        # Dizionario PRIMA del confronto (ordine invertito rispetto alla prima
        # stesura della SPEC, deviazione documentata in §3): così le àncore
        # delle divergenze nascono già dal testo corretto e combaciano per
        # costruzione, e gli errori ricorrenti corretti in entrambe le passate
        # non generano false divergenze. I .txt grezzi restano su disco.
        # Anti-loop PRIMA di tutto il resto: la frase ripetuta all'infinito
        # dal whisper «incantato» esce subito, così dizionario, confronto e
        # correzione AI lavorano sul testo bonificato. I .txt grezzi restano
        # su disco intatti; l'intervento si segnala in bozza (punti_loop).
        fase = "deloop"
        inizio = time.monotonic()
        grezzo_a, fant_a = togli_frasi_fantasma(
            percorso(".txt").read_text(encoding="utf-8"))
        grezzo_b, fant_b = togli_frasi_fantasma(
            percorso(".b.txt").read_text(encoding="utf-8"))
        grezzo_a, rip_a, punti_loop = deduplica_loop(grezzo_a)
        grezzo_b, rip_b, _ = deduplica_loop(grezzo_b)
        log.info(
            "fase=deloop file=%s esito=ok rimosse_a=%d rimosse_b=%d fantasmi_a=%d fantasmi_b=%d durata=%.1fs",
            file_id, rip_a, rip_b, fant_a, fant_b, time.monotonic() - inizio,
        )

        fase = "dizionario"
        _ = notifica and notifica(fase)
        inizio = time.monotonic()
        corretto_a, n_sost = applica_correzioni(grezzo_a, sostituzioni)
        corretto_b, _ = applica_correzioni(grezzo_b, sostituzioni)
        log.info(
            "fase=dizionario file=%s esito=ok sostituzioni=%d durata=%.1fs",
            file_id, n_sost, time.monotonic() - inizio,
        )

        # Punteggiatura dettata (SPEC §3, passo 5b): i segni detti a voce
        # diventano segni veri, su entrambe le passate prima del confronto.
        fase = "punteggiatura"
        corretto_a, n_punt = punteggiatura_dettata(corretto_a)
        corretto_b, _ = punteggiatura_dettata(corretto_b)
        percorso(".corretto.txt").write_text(corretto_a, encoding="utf-8")
        log.info("fase=punteggiatura file=%s esito=ok segni=%d", file_id, n_punt)

        fase = "confronto"
        _ = notifica and notifica(fase)
        inizio = time.monotonic()
        divergenze = confronta(corretto_a, corretto_b)
        percorso(".divergenze.json").write_text(
            json.dumps(divergenze, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        log.info(
            "fase=confronto file=%s esito=ok divergenze=%d durata=%.1fs",
            file_id, len(divergenze), time.monotonic() - inizio,
        )

        fase = "correzione_llm"
        _ = notifica and notifica(fase)
        finale = correggi_llm(corretto_a, file_id, percorso(".scarto_ai.json"))
        percorso(".finale.txt").write_text(finale, encoding="utf-8")

        # Il testo integrale PRIMA della segretaria: il nome del paziente
        # spesso è dettato solo nell'apertura rivolta alla segreteria
        # («…in merito al signor X e scrivi»), che la fase successiva toglie
        # dal corpo. L'estrazione campi e i controlli devono vederlo.
        testo_integrale = finale

        # La «segretaria»: le frasi rivolte alla segreteria escono dal corpo
        # del referto e diventano note. L'ispezione lavora sul testo pulito.
        fase = "segreteria"
        _ = notifica and notifica(fase)
        finale, note_segreteria = separa_segreteria(finale, file_id)
        percorso(".segreteria.json").write_text(
            json.dumps(note_segreteria, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if note_segreteria:
            percorso(".finale.txt").write_text(finale, encoding="utf-8")

        # L'evidenziatore: le frasi fuori tema restano NEL testo ma la pagina
        # di revisione le mostra spente; entra nel referto solo l'evidenziato.
        fase = "pertinenza"
        _ = notifica and notifica(fase)
        divagazioni = trova_divagazioni(finale, file_id)
        percorso(".divagazioni.json").write_text(
            json.dumps(divagazioni, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        # Il controllo del senso: frasi storpiate segnalate con proposta di
        # ricostruzione dal glossario (stesso vocabolario dato a whisper).
        fase = "senso"
        _ = notifica and notifica(fase)
        frasi_da_chiarire = controlla_senso(finale, vocab, file_id)
        # Una frase già segnalata come fuori tema non va anche «chiarita»:
        # è spenta dall'evidenziatore, il doppione confonderebbe.
        frasi_da_chiarire = [v for v in frasi_da_chiarire if v["frase"] not in divagazioni]
        percorso(".senso.json").write_text(
            json.dumps(frasi_da_chiarire, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        fase = "ispezione_llm"
        _ = notifica and notifica(fase)
        dubbi = ispeziona_llm(finale, file_id)
        # I punti dove l'anti-loop è intervenuto vanno in testa ai segmenti
        # dubbi: la bozza li evidenzia e il revisore sa che lì c'era una
        # ripetizione ridotta a una. (Se la correzione ha ritoccato la frase
        # l'evidenziazione può non agganciarsi: resta comunque in lista.)
        if punti_loop:
            dubbi = punti_loop + dubbi
        percorso(".dubbi.json").write_text(
            json.dumps(dubbi, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        fase = "estrazione"
        _ = notifica and notifica(fase)
        campi = estrai_campi(testo_integrale, file_id)
        percorso(".campi.json").write_text(
            json.dumps(campi, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        fase = "controlli"
        _ = notifica and notifica(fase)
        allarmi = controlla_valori(campi, testo_integrale, controlli, file_id)
        percorso(".allarmi.json").write_text(
            json.dumps(allarmi, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        # Tempi parola-per-parola per il testo sincronizzato: facoltativi,
        # mai bloccanti (senza, la pagina mostra il testo semplice).
        parole: list = []
        parole_audio: list = []
        try:
            parole_audio = parole_da_json(percorso(".json"))
            parole = allinea_parole(finale, parole_audio)
            log.info("fase=tempi file=%s esito=ok parole=%d", file_id, len(parole))
        except Exception as e:
            log.info("fase=tempi file=%s esito=saltato tipo=%s", file_id, type(e).__name__)

        # Sentinella di troncamento: quando whisper «si incanta» in un loop,
        # spesso butta il resto dell'audio dentro il loop e la seconda metà
        # del dettato non viene mai trascritta. Qui si confronta la durata
        # del WAV con il tempo dell'ultima parola trascritta: se manca una
        # coda importante, la bozza arriva con un avviso ben visibile.
        # Solo segnalazione, mai blocco; facoltativa, mai bloccante.
        avvisi: list[str] = []
        try:
            durata_wav = _durata_wav_s(percorso(".wav"))
            ultimo = parole_audio[-1][1] if parole_audio else 0.0
            scoperto = durata_wav - ultimo
            # Soglie abbassate il 2026-08-17: il caso reale (35 s mancanti su
            # 338, ~10%) passava sotto le vecchie (60 s e 15%) senza avviso.
            if durata_wav >= 120 and scoperto >= 25 and scoperto / durata_wav >= 0.08:
                avvisi.append(
                    "Possibile dettato incompleto: l'audio dura circa "
                    f"{int(round(durata_wav / 60))} minuti ma la trascrizione si ferma "
                    f"verso il minuto {int(ultimo // 60)}. Riascolta la parte finale "
                    "dell'audio prima di confermare; se manca testo, il dettato va rifatto."
                )
                log.warning(
                    "fase=copertura file=%s esito=avviso audio_s=%d trascritto_s=%d",
                    file_id, int(durata_wav), int(ultimo),
                )
            else:
                log.info(
                    "fase=copertura file=%s esito=ok audio_s=%d trascritto_s=%d",
                    file_id, int(durata_wav), int(ultimo),
                )
        except Exception as e:
            log.info("fase=copertura file=%s esito=saltato tipo=%s", file_id, type(e).__name__)
    except subprocess.TimeoutExpired:
        log.error("fase=%s file=%s esito=errore motivo=timeout", fase, file_id)
        raise ErroreElaborazione(fase, "timeout", file_id) from None
    except RuntimeError as e:
        # già loggato nella fase che ha fallito
        raise ErroreElaborazione(fase, type(e).__name__, file_id) from None
    except ErroreElaborazione:
        raise
    except Exception as e:
        # Mai str(e): può contenere percorsi o contenuti.
        log.error("fase=%s file=%s esito=errore tipo=%s", fase, file_id, type(e).__name__)
        raise ErroreElaborazione(fase, type(e).__name__, file_id) from None

    # richiede_revisione è SEMPRE true: non esiste un percorso in cui un
    # referto sia pronto senza passare da un umano (SPEC §8).
    payload = {
        "file_id": file_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "testo_corretto": finale,
        "note_segreteria": note_segreteria,
        "campi_estratti": campi,
        "parole": parole,
        "divergenze": divergenze,
        "segmenti_dubbi": dubbi,
        "allarmi_numerici": allarmi,
        "avvisi": avvisi,
        # Evidenziatore: frasi fuori tema (spente in pagina, la persona
        # decide) e frasi prive di senso con proposta dal glossario.
        "divagazioni": divagazioni,
        "frasi_da_chiarire": frasi_da_chiarire,
        "richiede_revisione": True,
    }
    return file_id, payload


# ── Modalità servizio (SPEC §3 passo 1, §5, §7) ─────────────────────────────
# Sorveglianza di ~/referti/ingresso/ con un ciclo di scansione in puro
# Python (deviazione documentata in SPEC §4: niente libreria watchdog —
# zero dipendenze, robusto coi file ancora in copia, la latenza di qualche
# secondo è irrilevante). Un file che fallisce va in errori/ col suo .log
# e la coda prosegue: non si blocca mai (§7.1).

INTERVALLO_SCANSIONE_S = 15
SPAZIO_MINIMO_BYTE = 500 * 1024 * 1024  # sotto il mezzo GB ci si ferma (§7.2)

# ── Invio a ReferralFlow (SPEC §3 passi 11-12, §8.1) ────────────────────────
# Senza URL+token configurati l'invio resta spento: le bozze si accumulano
# in output/ e nulla viene mai cancellato. Il token si genera in ReferralFlow
# da Impostazioni → Dati dello studio ed è una credenziale: vive solo nella
# configurazione del servizio, mai nei log.
FLOW_URL = os.environ.get("REFERTI_FLOW_URL", "").rstrip("/")
FLOW_TOKEN = os.environ.get("REFERTI_FLOW_TOKEN", "")
FLOW_TIMEOUT_S = 60


def _pulisci_intermedi(cartella: Path, file_id: str) -> None:
    for p in cartella.glob(f"{file_id}*"):
        try:
            p.unlink()
        except OSError:
            pass


_PREFISSO_PIATTAFORMA = "piattaforma-"


def scarica_coda(cartelle: dict) -> None:
    """Preleva dalla piattaforma gli audio caricati col drag & drop (pagina
    Referti) e li mette in ingresso/: da lì la catena è identica ai file della
    cartella condivisa. Il nome locale è piattaforma-<id>.<ext>: l'id permette
    di ricollegare la bozza all'audio sul server (riascolto). Best-effort: se
    la piattaforma non risponde, si riprova al giro dopo."""
    if not FLOW_URL or not FLOW_TOKEN:
        return
    try:
        richiesta = urllib.request.Request(
            FLOW_URL + "/api/referti/coda",
            headers={"Authorization": f"Bearer {FLOW_TOKEN}"},
        )
        with urllib.request.urlopen(richiesta, timeout=FLOW_TIMEOUT_S) as r:
            corpo = json.loads(r.read().decode("utf-8"))
    except Exception:
        return
    voci = corpo.get("coda", []) if isinstance(corpo, dict) else []
    for voce in voci:
        audio_id = str(voce.get("id", ""))
        nome = str(voce.get("filename", ""))
        if not audio_id:
            continue
        punto = nome.rfind(".")
        ext = nome[punto:].lower() if punto != -1 else ".m4a"
        destinazione = cartelle["ingresso"] / f"{_PREFISSO_PIATTAFORMA}{audio_id}{ext}"
        # Già scaricato (o già in lavorazione/archivio): non duplicare.
        occupato = any(
            any(c.glob(f"{_PREFISSO_PIATTAFORMA}{audio_id}*"))
            for c in (cartelle["ingresso"], cartelle["lavorazione"], cartelle["errori"])
        )
        if occupato:
            continue
        provvisorio = destinazione.with_suffix(destinazione.suffix + ".part")
        try:
            req = urllib.request.Request(
                f"{FLOW_URL}/api/referti/coda/{audio_id}",
                headers={"Authorization": f"Bearer {FLOW_TOKEN}"},
            )
            with urllib.request.urlopen(req, timeout=FLOW_TIMEOUT_S * 4) as r, open(provvisorio, "wb") as out:
                shutil.copyfileobj(r, out)
            provvisorio.replace(destinazione)
            segnala_fase(audio_id, "scaricato")
            log.info("fase=coda_piattaforma esito=scaricato")
        except Exception:
            try:
                provvisorio.unlink(missing_ok=True)
            except OSError:
                pass
            log.warning("fase=coda_piattaforma esito=rinviato")
            return


def _audio_id_da_nome(nome: str) -> str | None:
    """piattaforma-<uuid>.<ext> → <uuid>; altrimenti None."""
    if not nome.startswith(_PREFISSO_PIATTAFORMA):
        return None
    resto = nome[len(_PREFISSO_PIATTAFORMA):]
    punto = resto.rfind(".")
    candidato = resto[:punto] if punto != -1 else resto
    return candidato if re.fullmatch(r"[0-9a-f-]{36}", candidato) else None


def segnala_fase(audio_id: str | None, fase: str) -> None:
    """Dice alla piattaforma a che punto è un dettato del drag & drop (solo il
    nome della fase): la pagina Referti lo mostra come avanzamento. Best-effort
    e veloce: se la piattaforma non risponde, la lavorazione non si ferma."""
    if not audio_id or not FLOW_URL or not FLOW_TOKEN:
        return
    corpo = json.dumps({"fase": fase}).encode("utf-8")
    try:
        req = urllib.request.Request(
            f"{FLOW_URL}/api/referti/coda/{audio_id}/fase",
            data=corpo,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {FLOW_TOKEN}",
            },
        )
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass


def _processa_uno(audio: Path, cartelle: dict, sostituzioni, controlli) -> None:
    audio_id = _audio_id_da_nome(audio.name)
    notifica = (lambda fase: segnala_fase(audio_id, fase)) if audio_id else None
    lavoro = cartelle["lavorazione"] / audio.name
    shutil.move(str(audio), str(lavoro))
    try:
        file_id, payload = elabora(lavoro, cartelle["lavorazione"], sostituzioni, controlli, notifica)
        if audio_id:
            # Dettato arrivato dal drag & drop della piattaforma: l'id permette
            # al server di collegare la bozza all'audio (riascolto nel dettaglio).
            payload["audio_id"] = audio_id
        uscita = cartelle["output"] / f"{file_id}.json"
        provvisorio = uscita.with_suffix(".json.tmp")
        provvisorio.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        provvisorio.replace(uscita)  # mai un JSON scritto a metà in output/
        # L'audio resta in archivio_temp/ finché ReferralFlow non conferma
        # il salvataggio: MAI cancellato prima (§2.3). Rinominato col
        # file_id: l'invio lo ritrova, e il nome originale (che può
        # contenere il nome del paziente) sparisce dall'archivio.
        shutil.move(
            str(lavoro),
            str(cartelle["archivio_temp"] / (file_id + lavoro.suffix.lower())),
        )
        _pulisci_intermedi(cartelle["lavorazione"], file_id)
        _ = notifica and notifica("invio")
        log.info("fase=servizio file=%s esito=ok", file_id)
    except ErroreElaborazione as e:
        shutil.move(str(lavoro), str(cartelle["errori"] / lavoro.name))
        # Il .log accanto al file rispetta §2.2/§7.4: fase, tipo, timestamp.
        (cartelle["errori"] / (lavoro.name + ".log")).write_text(
            f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} "
            f"file_id={e.file_id or '?'} fase={e.fase} tipo={e.tipo}\n",
            encoding="utf-8",
        )
        if e.file_id:
            _pulisci_intermedi(cartelle["lavorazione"], e.file_id)
        _ = notifica and notifica("errore")
        log.error(
            "fase=servizio file=%s esito=errore fase_fallita=%s", e.file_id or "?", e.fase
        )


def invia_bozze(cartelle: dict) -> None:
    """Prova a consegnare ogni bozza in output/ a ReferralFlow. Solo un 2xx
    del server (201 scritta, 200 duplicato) autorizza la cancellazione di
    audio e bozza (SPEC §3 passo 12): qualsiasi altro esito lascia tutto
    dov'è. Server irraggiungibile: si riprova al giro successivo (§7.2).
    Errori 4xx (token, payload): bozza in errori/, audio MAI cancellato."""
    if not FLOW_URL or not FLOW_TOKEN:
        return
    for bozza in sorted(cartelle["output"].glob("*.json")):
        file_id = bozza.stem
        richiesta = urllib.request.Request(
            FLOW_URL + "/api/referti/bozza",
            data=bozza.read_bytes(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {FLOW_TOKEN}",
            },
        )
        try:
            with urllib.request.urlopen(richiesta, timeout=FLOW_TIMEOUT_S) as r:
                codice = r.status
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429:
                # Non passerà da solo (token errato, payload rifiutato):
                # la bozza va in errori/ per diagnosi, l'audio resta.
                shutil.move(str(bozza), str(cartelle["errori"] / bozza.name))
                (cartelle["errori"] / (bozza.name + ".log")).write_text(
                    f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} "
                    f"file_id={file_id} fase=invio tipo=http_{e.code}\n",
                    encoding="utf-8",
                )
                log.error("fase=invio file=%s esito=errore codice=%d", file_id, e.code)
            else:
                log.warning("fase=invio file=%s esito=rinviato codice=%d", file_id, e.code)
            continue
        except (urllib.error.URLError, TimeoutError, OSError):
            # ReferralFlow non raggiungibile: inutile insistere sulle altre
            # bozze in questo giro. L'audio NON si cancella (§7.2).
            log.warning("fase=invio esito=rinviato motivo=non_raggiungibile")
            return
        if codice in (200, 201):
            # Salvataggio confermato: ORA (e solo ora) l'audio lascia la coda
            # (§2.3). Con la conserva attiva finisce nella cassaforte locale
            # per il futuro addestramento; altrimenti si cancella come prima.
            # La protezione dei dati a riposo è FileVault, verificata all'avvio.
            for audio in cartelle["archivio_temp"].glob(file_id + ".*"):
                if CONSERVA_AUDIO:
                    try:
                        DATASET_DIR.mkdir(parents=True, exist_ok=True)
                        os.chmod(DATASET_DIR, 0o700)
                        os.chmod(DATASET_DIR.parent, 0o700)
                        audio.rename(DATASET_DIR / audio.name)
                    except OSError:
                        # Cassaforte non disponibile: meglio cancellare che
                        # lasciare l'audio in coda per sempre.
                        audio.unlink()
                else:
                    audio.unlink()
            bozza.unlink()
            log.info("fase=invio file=%s esito=ok codice=%d", file_id, codice)
        else:
            log.warning("fase=invio file=%s esito=rinviato codice=%d", file_id, codice)


def filevault_attivo() -> bool:
    """Prerequisito §2.3: su macOS il disco deve essere cifrato (FileVault).
    Fuori da macOS (solo collaudo) serve l'esplicito REFERTI_SENZA_FILEVAULT=1."""
    if sys.platform != "darwin":
        return os.environ.get("REFERTI_SENZA_FILEVAULT") == "1"
    try:
        esito = subprocess.run(
            ["fdesetup", "status"], capture_output=True, text=True, timeout=10
        )
        return esito.returncode == 0 and "On" in esito.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False


def servizio(sostituzioni, controlli) -> int:
    base = Path(os.environ.get("REFERTI_BASE", str(Path.home() / "referti")))
    cartelle = {
        nome: base / nome
        for nome in ("ingresso", "lavorazione", "errori", "archivio_temp", "output")
    }
    if not filevault_attivo():
        # Senza cifratura del disco la cancellazione post-invio non protegge
        # nulla: il servizio si rifiuta di partire (§2.3).
        log.error("fase=servizio esito=fermato motivo=filevault_spento")
        return 1
    for c in [base, *cartelle.values(), base / "log"]:
        c.mkdir(parents=True, exist_ok=True)
        os.chmod(c, 0o700)  # solo l'utente proprietario (SPEC §5)
    # Registro anche su file (già pulito by design, §2.2): lo leggono il
    # pannello locale e launchd.
    su_file = logging.FileHandler(base / "log" / "servizio.log", encoding="utf-8")
    su_file.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S"))
    log.addHandler(su_file)
    log.info(
        "fase=servizio esito=avviato intervallo=%ds invio=%s",
        INTERVALLO_SCANSIONE_S, "attivo" if FLOW_URL and FLOW_TOKEN else "spento",
    )

    in_attesa: dict[Path, int] = {}
    while True:
        try:
            # Dizionario ricaricato a ogni giro: le voci aggiunte dal
            # pannello valgono subito. Se un file è rotto si tiene l'ultimo
            # buono e si segnala.
            try:
                sostituzioni = carica_sostituzioni()
            except (OSError, json.JSONDecodeError, AttributeError, TypeError):
                log.warning("fase=servizio esito=avviso motivo=correzioni_non_ricaricabili")
            if shutil.disk_usage(base).free < SPAZIO_MINIMO_BYTE:
                # Disco pieno: fermare tutto e segnalare, non tentare di
                # procedere (§7.2). L'audio resta dov'è.
                log.error("fase=servizio esito=fermato motivo=disco_pieno")
                return 1
            for f in sorted(cartelle["ingresso"].iterdir()):
                if not f.is_file() or f.name.startswith("."):
                    continue
                dimensione = f.stat().st_size
                if dimensione == 0 or in_attesa.get(f) != dimensione:
                    # Copia forse ancora in corso: si riguarda al giro dopo,
                    # si lavora solo quando la dimensione è stabile.
                    in_attesa[f] = dimensione
                    continue
                in_attesa.pop(f, None)
                _processa_uno(f, cartelle, sostituzioni, controlli)
            in_attesa = {p: d for p, d in in_attesa.items() if p.exists()}
            invia_bozze(cartelle)
            # Dopo l'invio: prendi eventuali dettati caricati dalla pagina
            # Referti (drag & drop). Al giro dopo entrano nella catena normale.
            scarica_coda(cartelle)
            time.sleep(INTERVALLO_SCANSIONE_S)
        except KeyboardInterrupt:
            log.info("fase=servizio esito=fermato motivo=richiesta_utente")
            return 0
        except OSError as e:
            if e.errno == errno.ENOSPC:
                log.error("fase=servizio esito=fermato motivo=disco_pieno")
                return 1
            log.error("fase=servizio esito=errore tipo=%s", type(e).__name__)
            time.sleep(INTERVALLO_SCANSIONE_S)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2

    ambiente = controlli_avvio()
    if ambiente is None:
        return 1
    sostituzioni, controlli = ambiente

    if argv[1] == "--servizio":
        return servizio(sostituzioni, controlli)

    ingresso = Path(argv[1])
    if not ingresso.is_file():
        log.error("fase=avvio file=? esito=errore motivo=file_inesistente")
        return 1
    try:
        file_id, payload = elabora(ingresso, ingresso.parent, sostituzioni, controlli)
        ingresso.with_name(f"{file_id}.payload.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return 0
    except ErroreElaborazione:
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
