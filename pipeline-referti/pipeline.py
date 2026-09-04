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
import tempfile
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
# DENOISE ACCESO: due misure in conflitto, vince l'audio vero (2026-08-23).
# Sul set d'oro SINTETICO senza denoise il WER migliora (26.5%→23.6%),
# coerente con arXiv 2512.17562 — ma sull'audio VERO del dittafono DPM 7200
# whisper senza denoise va in loop catastrofico (autopsia su un dettato di
# 23 min: 416 frasi-copia su 441, testo utile 3.9k car contro 9.7k con
# denoise). Le voci sintetiche sono troppo pulite per decidere: qui comanda
# il microfono dello studio. Rimisurare solo se cambia il registratore.
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
MODELLO_RIASSUNTO = os.environ.get("REFERTI_LLM_RIASSUNTO", MODELLO_LLM)
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

# ── Correzione esterna (SPENTA di default, 2026-08-26) ───────────────────────
# Idea dell'utente: il testo ANONIMIZZATO (nomi → «Persona N», date → «[data
# N]», contatti oscurati) va a un modello di punta esterno che rimanda SOLO la
# lista di riparazioni; il codice la applica al testo ORIGINALE con le stesse
# guardie del percorso locale. Le coppie che citano un segnaposto cadono da
# sole (contengono cifre → guardia della regola d'oro): il modello esterno non
# vede mai un nome vero e non serve nessuna ri-sostituzione.
# DOPPIO interruttore: serve sia la chiave API sia il flag esplicito.
# NON accendere prima della validazione legale (stessa di Stripe e della
# cattura impegnativa: DPA col fornitore + informativa). Se l'anonimizzazione
# non supera la controprova, o l'API non risponde, si ripiega in silenzio
# sulla catena locale: il referto esce comunque.
CORREZIONE_ESTERNA = os.environ.get("REFERTI_CORREZIONE_ESTERNA", "0") == "1"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODELLO_ESTERNO = os.environ.get("REFERTI_LLM_ESTERNO", "claude-opus-5")
ANTHROPIC_URL = os.environ.get(
    "REFERTI_ANTHROPIC_URL", "https://api.anthropic.com/v1/messages")
ESTERNO_TIMEOUT_S = int(os.environ.get("REFERTI_ESTERNO_TIMEOUT", "180"))
# Trasporto MANUALE per il collaudo (2026-08-26): se esiste il file ATTIVO
# nella cartella di scambio, il testo anonimizzato viene scritto lì come
# <file_id>.anon.txt e la pipeline attende <file_id>.lista.json (il
# correttore è una persona/AI che lavora sul Mac, niente chiave API).
# Stessa anonimizzazione, stessa controprova, stesse guardie del percorso
# API. Timeout → ripiego sulla catena locale come sempre.
SCAMBIO_ESTERNO_DIR = Path(os.environ.get(
    "REFERTI_SCAMBIO_ESTERNO",
    str(Path.home() / "referti" / "scambio-esterno")))
SCAMBIO_ATTESA_S = int(os.environ.get("REFERTI_SCAMBIO_ATTESA", "900"))


# Trasporto «cloud a consumo» (2026-08-26, dopo il banco dei 12 modelli):
# un endpoint compatibile OpenAI (es. Infomaniak, server svizzeri, il
# vincitore del banco è Qwen3.5-122B con 11/22 contro il 3/22 del modello
# locale). Configurato da un file fuori dal repo (chmod 600), riletto a
# OGNI referto: si accende/spegne modificando il file, niente riavvii.
# Formato del file:  attivo=1 / url=... / chiave=... / modello=...
CONFIG_ESTERNO = Path(os.environ.get(
    "REFERTI_ESTERNO_CONF",
    str(Path.home() / ".referralflow-esterno.conf")))


def _config_esterno() -> dict | None:
    try:
        if not CONFIG_ESTERNO.exists():
            return None
        cfg: dict[str, str] = {}
        for riga in CONFIG_ESTERNO.read_text(encoding="utf-8").splitlines():
            if "=" in riga and not riga.strip().startswith("#"):
                k, v = riga.split("=", 1)
                cfg[k.strip()] = v.strip()
        if cfg.get("attivo") != "1":
            return None
        if not (cfg.get("url") and cfg.get("chiave") and cfg.get("modello")):
            return None
        return cfg
    except OSError:
        return None


def _esterno_attivo() -> str | None:
    """Com'è acceso il percorso esterno, valutato A OGNI referto (così le
    modalità manuale e cloud si accendono/spengono da file, senza riavvii)."""
    if (SCAMBIO_ESTERNO_DIR / "ATTIVO").exists():
        return "manuale"
    if _config_esterno():
        return "openai"
    if CORREZIONE_ESTERNA and ANTHROPIC_API_KEY:
        return "api"
    return None

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

# Catena compatta esterna (2026-08-27, idea dell'utente: «cicli nella stessa
# chiamata» — il testo si paga una volta sola e il modello che separa le note
# ha appena fatto lui stesso le correzioni). UNA chiamata al modello di punta
# per quattro fasi; l'avvocato resta separato (chi verifica non è chi scrive)
# e le guardie del codice valgono su ogni sezione come per le fasi locali.
PROMPT_CATENA_COMPATTA = """Sei l'assistente di redazione dei referti di uno studio cardiologico svizzero. Il testo qui sotto è un referto dettato a voce e trascritto automaticamente: contiene errori di riconoscimento, frasi rivolte alla segretaria e divagazioni.

Lavora in QUATTRO CICLI ordinati, uno alla volta, rileggendo ogni volta il testo. Non fare tutto insieme.

CICLO 1 — RIPARAZIONI: elenca le parole o brevi espressioni storpiate dalla trascrizione, ciascuna con la forma corretta. Regole: «da» è una citazione ESATTA (stesse maiuscole e accenti, max 4 parole); MAI numeri, dosaggi, misure o date dentro «da» o «a»; la forma corretta deve SUONARE come quella storpiata (stai riparando errori d'ascolto, non riscrivendo); nel dubbio non proporre; max 40 riparazioni.

CICLO 2 — NOTE PER LA SEGRETERIA: elenca le frasi in cui il medico si rivolge a chi scrive invece che al referto: saluti e congedi, istruzioni («recuperate», «copiate», «potete prendere…»), domande, scuse e ripetizioni annunciate, commenti organizzativi. Citazioni ESATTE del testo. MAI frasi che contengono numeri o dati clinici: nel dubbio, non è una nota.

CICLO 3 — FUORI TEMA: elenca le frasi estranee al referto (chiacchiere, parentesi personali, meta-commenti sul dettato). Citazioni ESATTE. MAI frasi con cifre o contenuto clinico; nel dubbio, lasciala nel referto.

CICLO 4 — SENZA SENSO: elenca le frasi rimaste prive di senso in italiano dopo il ciclo 1, ciascuna con una proposta di ricostruzione SOLO se il suono la giustifica (mai cambiare i numeri); altrimenti proposta vuota.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"riparazioni": [{"da": "…", "a": "…"}], "note_segreteria": ["…"], "fuori_tema": ["…"], "senza_senso": [{"frase": "…", "proposta": ""}]}

TESTO:
{testo}"""

# ── Memoria della visita (2026-09-02, idea dell'utente) ─────────────────────
# La registrazione completa della seduta come memoria di consulto: la
# dettatura resta la fonte autorevole; per le sole frasi DUBBIE della bozza
# si cercano (in locale: embedding BGE-M3 + coseno) i passaggi pertinenti
# della visita e si chiede al modello esterno di verificare/proporre SOLO
# sulla base di quegli estratti. Esiti come PROPOSTE nel wizard, mai
# applicati da soli. Modulare: embedding, ricerca e risolutore sostituibili.
MODELLO_EMBED = os.environ.get("REFERTI_EMBED", "bge-m3")
CONSULTO_MAX_DUBBI = int(os.environ.get("REFERTI_CONSULTO_DUBBI", "10"))
CONSULTO_BLOCCO_PAROLE = 60   # ~30 secondi di parlato per blocco
CONSULTO_TOP_BLOCCHI = 4
CONSULTO_VISITA_ORE = 12      # abbinamento v1: la visita più recente del giorno

PROMPT_CONSULTO_VISITA = """Sei l'assistente di redazione di referti di uno studio cardiologico. Durante la visita è stata registrata la conversazione medico-paziente; il medico ha poi dettato il referto. Alcune frasi del referto sono DUBBIE (trascritte male o ambigue).

Per ogni dubbio ricevi la frase del referto e alcuni ESTRATTI della conversazione in visita. Il tuo compito: verificare se gli estratti chiariscono il dubbio.

Regole obbligatorie:
1. Usa ESCLUSIVAMENTE gli estratti forniti: mai conoscenze tue, mai supposizioni cliniche.
2. Se gli estratti chiariscono il dubbio, proponi la frase corretta («proposta»), fedele a ciò che si è detto in visita.
3. Ogni numero nella proposta deve comparire IDENTICO negli estratti o nella frase originale.
4. Se gli estratti non bastano, esito «irrisolto» e proposta vuota: mai inventare.
5. Se la frase del referto è già coerente con gli estratti, esito «conferma».

Rispondi SOLO con un oggetto JSON valido:
{"consulti": [{"n": 1, "esito": "conferma|proposta|irrisolto", "proposta": ""}]}

{dubbi}"""


def _embeddings(testi: list[str]) -> list[list[float]] | None:
    """Vettori BGE-M3 via Ollama locale (mai contenuti nei log)."""
    if not testi:
        return []
    corpo = json.dumps({"model": MODELLO_EMBED, "input": testi}).encode("utf-8")
    try:
        r = urllib.request.Request(
            OLLAMA_URL + "/api/embed", data=corpo,
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(r, timeout=OLLAMA_TIMEOUT_S) as resp:
            dati = json.loads(resp.read().decode("utf-8"))
        emb = dati.get("embeddings")
        return emb if isinstance(emb, list) and len(emb) == len(testi) else None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def _coseno(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return num / (na * nb) if na and nb else 0.0


def _blocchi_visita(testo: str, parole: list) -> list[dict]:
    """Blocchi di ~CONSULTO_BLOCCO_PAROLE parole con il tempo d'inizio nella
    registrazione (se i tempi mancano, blocchi per frasi senza tempo)."""
    blocchi: list[dict] = []
    if parole:
        for i in range(0, len(parole), CONSULTO_BLOCCO_PAROLE):
            gruppo = parole[i:i + CONSULTO_BLOCCO_PAROLE]
            blocchi.append({
                "testo": " ".join(str(p[0]) for p in gruppo),
                "tempo": float(gruppo[0][1]),
            })
    else:
        for pezzo in _blocchi_di_testo(testo, 400):
            blocchi.append({"testo": pezzo, "tempo": None})
    return [b for b in blocchi if len(b["testo"]) >= 40]


def _visita_recente(file_id: str) -> dict | None:
    """La visita registrata più recente (ultime CONSULTO_VISITA_ORE) dalla
    piattaforma. None = niente consulto, la catena procede come sempre."""
    base = os.environ.get("REFERTI_FLOW_URL", "")
    token = os.environ.get("REFERTI_FLOW_TOKEN", "")
    if not base or not token:
        return None
    try:
        r = urllib.request.Request(
            base.rstrip("/") + "/api/referti/visita-recente?ore=%d" % CONSULTO_VISITA_ORE,
            headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(r, timeout=30) as resp:
            dati = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    if not isinstance(dati, dict) or not dati.get("testo"):
        return None
    return dati


def consulto_visita(dubbi: list[str], file_id: str) -> list[dict]:
    """Per ogni frase dubbia: ricerca semantica LOCALE nella trascrizione
    della visita, poi UNA chiamata esterna (anonimizzata) che verifica sui
    soli estratti. Ritorna [{frase, proposta, tempo_visita}] — solo esiti
    «proposta»; conferme e irrisolti restano fuori (la frase resta comunque
    segnalata dalle fasi che l'hanno prodotta). Ogni intoppo → lista vuota."""
    inizio = time.monotonic()
    dubbi = [d.strip() for d in dubbi if len(d.strip()) >= 12][:CONSULTO_MAX_DUBBI]
    if not dubbi:
        return []
    visita = _visita_recente(file_id)
    if not visita:
        return []
    blocchi = _blocchi_visita(str(visita.get("testo") or ""),
                              visita.get("parole") or [])
    if len(blocchi) < 3:
        return []
    emb_b = _embeddings([b["testo"] for b in blocchi])
    emb_d = _embeddings(dubbi)
    if not emb_b or not emb_d:
        log.warning("fase=consulto_visita file=%s esito=saltato motivo=embedding", file_id)
        return []
    scelte: list[list[dict]] = []
    for ed in emb_d:
        punte = sorted(range(len(blocchi)),
                       key=lambda j: _coseno(ed, emb_b[j]), reverse=True)
        scelte.append([blocchi[j] for j in punte[:CONSULTO_TOP_BLOCCHI]])
    # Un solo documento dubbi+estratti → UNA anonimizzazione, UNA chiamata.
    righe: list[str] = []
    for i, (d, bs) in enumerate(zip(dubbi, scelte), 1):
        righe.append(f"DUBBIO {i}: {d}")
        for b in bs:
            righe.append(f"  ESTRATTO: {b['testo']}")
    documento = "\n".join(righe)
    esito_anon = _anonimizza_per_esterno(documento, file_id, con_mappa=True)
    if esito_anon is None:
        log.warning("fase=consulto_visita file=%s esito=annullato motivo=anonimizzazione", file_id)
        return []
    anon, mappa = esito_anon

    def rip(s: str) -> str:
        for segnaposto, vero in mappa.items():
            s = s.replace(segnaposto, vero)
        return s

    try:
        uscita = _chiama_esterno_openai(
            PROMPT_CONSULTO_VISITA.replace("{dubbi}", anon), file_id)
    except RuntimeError:
        log.warning("fase=consulto_visita file=%s esito=fallito motivo=nessuna_risposta", file_id)
        return []
    dati = _estrai_json(uscita) or {}
    voci = dati.get("consulti") if isinstance(dati, dict) else None
    fuori: list[dict] = []
    for v in voci if isinstance(voci, list) else []:
        if not isinstance(v, dict) or str(v.get("esito")) != "proposta":
            continue
        try:
            i = int(v.get("n", 0)) - 1
        except (TypeError, ValueError):
            continue
        if not 0 <= i < len(dubbi):
            continue
        proposta = rip(str(v.get("proposta", "")).strip())[:300]
        if not proposta or proposta == dubbi[i]:
            continue
        # Regola d'oro del consulto: ogni numero della proposta deve esistere
        # negli estratti usati o nella frase dubbia (verifica del CODICE).
        ammessi = _numeri(dubbi[i] + " " + " ".join(b["testo"] for b in scelte[i]))
        if any(n not in ammessi for n in _numeri(proposta)):
            continue
        tempo = next((b["tempo"] for b in scelte[i] if b["tempo"] is not None), None)
        fuori.append({"frase": dubbi[i], "proposta": proposta,
                      "tempo_visita": tempo})
    log.info(
        "fase=consulto_visita file=%s esito=ok dubbi=%d proposte=%d durata=%.1fs",
        file_id, len(dubbi), len(fuori), time.monotonic() - inizio,
    )
    return fuori


# Cicli 2-4 da soli (variante «spezzata», 2026-09-01): sul dettato lungo i
# modelli medi (Qwen) diluiti sui 4 cicli quasi saltano le correzioni
# (palestra dal vivo: 5 proposte, 0 applicate, contro le 16-21 in modalità
# lista). Con spezzata=1 nel .conf la correzione resta una chiamata dedicata
# (il formato dove rendono al massimo) e questi tre cicli vanno in una
# seconda chiamata sul testo già corretto.
PROMPT_TRE_CICLI = """Sei l'assistente di redazione dei referti di uno studio cardiologico svizzero. Il testo qui sotto è un referto dettato a voce, già corretto dagli errori di trascrizione: contiene ancora frasi rivolte alla segretaria e divagazioni.

Lavora in TRE CICLI ordinati, uno alla volta, rileggendo ogni volta il testo.

CICLO 1 — NOTE PER LA SEGRETERIA: elenca le frasi in cui il medico si rivolge a chi scrive invece che al referto: saluti e congedi, istruzioni («recuperate», «copiate», «potete prendere…»), domande, scuse e ripetizioni annunciate, commenti organizzativi. Citazioni ESATTE del testo. MAI frasi che contengono numeri o dati clinici. POCHE E SICURE: al massimo 25, solo quelle inequivocabili — nel dubbio, non è una nota.

CICLO 2 — FUORI TEMA: elenca le frasi estranee al referto (chiacchiere, parentesi personali, meta-commenti sul dettato). Citazioni ESATTE. MAI frasi con cifre o contenuto clinico. POCHE E SICURE: al massimo 12 — nel dubbio, lasciala nel referto.

CICLO 3 — SENZA SENSO: elenca le frasi rimaste prive di senso in italiano, ciascuna con una proposta di ricostruzione SOLO se il suono la giustifica (mai cambiare i numeri); altrimenti proposta vuota. Al massimo 10, le più gravi.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"note_segreteria": ["…"], "fuori_tema": ["…"], "senza_senso": [{"frase": "…", "proposta": ""}]}

TESTO:
{testo}"""

# Prompt per l'anonimizzazione pre-invio esterno (modello LOCALE): individua
# i dati identificativi, il CODICE li sostituisce — l'AI non riscrive mai.
PROMPT_DATI_PERSONALI = """Nel testo qui sotto individua i DATI IDENTIFICATIVI di persone: nomi e cognomi (anche storpiati dalla trascrizione automatica), date di nascita, indirizzi privati, numeri di telefono, email, numeri AVS.

NON riscrivere il testo. NON correggere nulla. Elenca solo i dati trovati, citando ciascuno ESATTAMENTE come compare nel testo (stesse maiuscole e accenti).

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"dati": [{"testo": "citazione esatta", "tipo": "nome"}]}
Tipi possibili: "nome", "data_nascita", "indirizzo", "contatto".
Se non trovi nulla, rispondi {"dati": []}.

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
PROMPT_SEGRETERIA = """Sei una segretaria medica esperta. Il testo qui sotto è un referto cardiologico dettato a voce, già trascritto. Il medico, mentre detta, parla anche CON TE: ti saluta, ti fa domande, ti dà istruzioni, si corregge, commenta. Tutto ciò che il medico dice A TE non fa parte della lettera al collega e va segnalato.

LA PROVA DEL DESTINATARIO — per OGNI frase chiediti: questa frase è rivolta al collega che riceverà la lettera, oppure a chi la sta preparando?
- La lettera al collega parla DEL PAZIENTE, in tono formale («Il paziente riferisce…», «All'esame clinico…», «In conclusione…»).
- Tutto il resto — frasi rivolte a «te/voi» che preparate la lettera — va nelle note.

CATEGORIE DA SEGNALARE SEMPRE (con esempi reali):
1. SALUTI E CONVENEVOLI alla segreteria: «Buongiorno Maria, sono il dottor Rossi», «ho letto la prima parte della lettera», «Grazie, per ora è tutto, ciao», «buon lavoro», «ci sentiamo dopo».
2. DOMANDE a chi prepara la lettera: qualsiasi frase interrogativa rivolta a «voi/te»: «le diagnosi sono uguali?», «come fate di solito?», «me lo potete dire per la prossima volta?», «riuscite a leggerlo?». Le domande RETORICHE dentro la lettera formale invece restano.
3. ISTRUZIONI DI LAVORAZIONE (verbi rivolti a te/voi: copiate, riprendete, allegate, mandate, mettete in intestazione, cambiate, abbreviate, firmate): «riprendi la lettera precedente», «copiate le diagnosi», «allegate il laboratorio», «mandane copia al curante», «mettete la diagnosi in grassetto», «fissami il controllo in agenda». MA se la frase contiene anche numeri o dati clinici («mettete per favore 114 su 72»), NON segnalarla: il dato deve restare.
4. REGIA DELLA DETTATURA e autocorrezioni: «scusami, ripeto», «no anzi», «aspettami», «pronto», «dove ero rimasto», «faccio io il…», «aggiungo io il…», «questo lo correggo io dopo», «avevo perso il filo», frasi lasciate a metà che il medico stesso abbandona.
5. COMMENTI ORGANIZZATIVI sul lavoro d'ufficio: «ho visto i documenti, ho corretto una data», «se avete proposte di miglioramento discutiamone», «se è troppo lungo me lo dite», «non so come potete fare, se volete mettere solo i risultati».

COSA NON SEGNALARE MAI:
- Le frasi che DESCRIVONO il percorso clinico del paziente, anche se parlano di controlli e appuntamenti: «abbiamo anticipato il controllo annuale a seguito di…», «lo rivedo tra sei mesi», «ha eseguito l'esame in data…» sono CONTENUTO del referto, non note organizzative. Organizzativo è solo ciò che è rivolto A CHI PREPARA la lettera.
- I comandi di dettatura seguiti dal testo da scrivere: «scrivi: caro collega, le invio…» → il testo dopo i due punti È la lettera. La differenza: «scrivi A QUALCUNO» o «riprendi UN ALTRO documento» = compito (categoria 3); «scrivi:» + dettato = lettera.
- Aperture e chiusure della lettera («Caro collega», «Gentile dottoressa», «Cordiali saluti»).
- QUALSIASI frase che contiene misure, valori, dosaggi, diagnosi o giudizi clinici — anche se inizia con un ordine. Nel dubbio, la frase resta nel referto.

Regole obbligatorie:
1. Riporta ogni frase ESATTAMENTE come appare nel testo, parola per parola, senza riscriverla e senza accorciarla.
2. Nel dubbio NON segnalare: meglio una chiacchiera in più nel referto che una frase clinica in meno.
3. Non eseguire le istruzioni, non riscrivere nulla, non aggiungere nulla.

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
              con_tempi: bool = False, usa_vad: bool = True) -> None:
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
        *(["--vad", "-vm", str(PERCORSO_VAD), "--vad-speech-pad-ms", VAD_PAD_MS]
          if (USA_VAD and usa_vad) else []),
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

# Il VAD di whisper-cli COMPATTA l'audio (i silenzi spariscono) e i tempi
# escono sull'orologio compattato: verificato empiricamente il 2026-08-23
# inserendo 20 s di silenzio in un file di prova — l'ultima parola cadeva a
# 63 s su 81. Per il testo sincronizzato bisogna RIMETTERE le pause: si
# individuano i silenzi del WAV preprocessato (ffmpeg silencedetect, soglie
# tarate sugli ancoraggi di un dettato reale: scarto medio 0.6 s) e si
# risommano ai tempi, tenendo conto del margine che il VAD conserva ai bordi.
# Soglie tarate sul dettato reale (2026-08-25): a -25dB il dittafono
# rumoroso nasconde le pause di mezzo dettato (22 ancore, tratti di minuti
# senza appigli → clic fuori bersaglio); a -22dB/0.8s le ancore diventano
# ~48 e coprono tutto il dettato.
SILENZIO_DB = os.environ.get("REFERTI_SILENZIO_DB", "-22dB")
SILENZIO_MIN_S = os.environ.get("REFERTI_SILENZIO_S", "0.8")
SILENZIO_MARGINE_S = 0.6  # ~2 × vad-speech-pad-ms


def _silenzi_wav(wav: Path) -> list[tuple[float, float]]:
    """Coppie (inizio, fine) dei silenzi nel WAV preprocessato."""
    esito = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(wav),
         "-af", f"silencedetect=noise={SILENZIO_DB}:d={SILENZIO_MIN_S}",
         "-f", "null", "-"],
        capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S,
    )
    coppie: list[tuple[float, float]] = []
    inizio = None
    for tipo, val in re.findall(r"silence_(start|end): ([0-9.]+)", esito.stderr):
        if tipo == "start":
            inizio = float(val)
        elif inizio is not None:
            coppie.append((inizio, float(val)))
            inizio = None
    return coppie


def _decompatta_tempi(parole: list[tuple[str, float]],
                      silenzi: list[tuple[float, float]]) -> list[tuple[str, float]]:
    """Orologio compattato dal VAD → orologio del WAV intero: ogni silenzio
    risomma la sua durata (meno il margine conservato) ai tempi successivi."""
    tagli: list[tuple[float, float]] = []
    tolto = 0.0
    for s, e in silenzi:
        durata = max(0.0, (e - s) - SILENZIO_MARGINE_S)
        if durata <= 0:
            continue
        tagli.append((s - tolto, durata))
        tolto += durata
    if not tagli:
        return parole
    fuori: list[tuple[str, float]] = []
    for w, t in parole:
        agg = sum(d for pos, d in tagli if t >= pos)
        fuori.append((w, t + agg))
    return fuori


VAD_SEGMENTS_BIN = os.environ.get("REFERTI_VAD_SEGMENTS_BIN", "whisper-vad-speech-segments")


def _segmenti_vad(wav: Path) -> list[tuple[float, float]]:
    """La MAPPA dei tagli del VAD, dallo stesso Silero di whisper-cli
    (strumento whisper-vad-speech-segments, output in centesimi di secondo).
    È la chiave della sincronizzazione esatta (2026-08-25): whisper lavora
    sull'audio compattato e questa mappa dice dove ogni pezzo stava davvero.
    Banco della verità: scarto massimo 0.87 s."""
    try:
        esito = subprocess.run(
            [VAD_SEGMENTS_BIN, "-np", "-vm", str(PERCORSO_VAD),
             "--vad-speech-pad-ms", VAD_PAD_MS, "-f", str(wav)],
            capture_output=True, text=True, timeout=600,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    seg: list[tuple[float, float]] = []
    for m in re.finditer(r"start = ([0-9.]+), end = ([0-9.]+)", esito.stdout):
        seg.append((float(m.group(1)) / 100.0, float(m.group(2)) / 100.0))
    return seg


def _decompatta_su_segmenti(t: float, seg: list[tuple[float, float]],
                            giuntura: float = 0.0) -> float:
    """Orologio compattato dal VAD → orologio del WAV intero, esatto.
    whisper-cli mette un cuscinetto di silenzio sintetico a ogni giuntura
    tra segmenti quando ricuce l'audio compattato: misurato 0.200 s/giuntura
    identico sul banco della verità e su un dettato reale (2026-08-25);
    senza toglierlo l'errore si accumula (fino a +45 s sul banco lungo,
    con il cuscinetto gli ultimi punti di controllo tornano entro 0.8 s).
    `giuntura` è quel cuscinetto, auto-calibrato da _giuntura_vad."""
    cum = 0.0
    for k, (s, e) in enumerate(seg):
        if k > 0:
            if t <= cum + giuntura:
                return s  # caduto dentro il cuscinetto sintetico
            cum += giuntura
        d = e - s
        if t <= cum + d:
            return s + (t - cum)
        cum += d
    return seg[-1][1] if seg else t


def _giuntura_vad(seg: list[tuple[float, float]], ultima_compatta: float) -> float:
    """Auto-calibra il cuscinetto per giuntura: l'orologio compatto di whisper
    (ultima parola) supera la somma dei segmenti VAD esattamente del
    cuscinetto × (n−1). Se la trascrizione è mozza (ultima < somma) torna 0;
    il tetto 0.35 para le stime gonfiate da allucinazioni sulla coda."""
    somma = sum(e - s for s, e in seg)
    if len(seg) < 2 or ultima_compatta <= somma:
        return 0.0
    return min(0.35, (ultima_compatta - somma) / (len(seg) - 1))


def _ancore_audio(originale: Path) -> tuple[list[float], float]:
    """Ancore sull'orologio dell'audio ORIGINALE (quello che la pagina
    riascolta): le fini dei silenzi trovate sull'originale ripulito al volo
    (stessa pulizia della pipeline ma SENZA atempo, così l'orologio non
    cambia). Ritorna anche la durata dell'originale."""
    esito = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-i", str(originale),
         "-af", ("highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11,"
                 f"silencedetect=noise={SILENZIO_DB}:d={SILENZIO_MIN_S}"),
         "-f", "null", "-"],
        capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S,
    )
    fini = [float(v) for tipo, v in
            re.findall(r"silence_(start|end): ([0-9.]+)", esito.stderr)
            if tipo == "end"]
    durata = 0.0
    sonda = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(originale)],
        capture_output=True, text=True, timeout=60,
    )
    try:
        durata = float(sonda.stdout.strip())
    except ValueError:
        pass
    return fini, durata


def _accoppia_ancore(anc_w: list[float], anc_a: list[float]) -> list[tuple[float, float]]:
    """Accoppiamento monotono (programmazione dinamica) tra le riprese dopo
    pausa dell'orologio whisper e le fini dei silenzi dell'audio originale.
    Un tratto è credibile se nell'originale dura almeno quanto il parlato
    compattato (dw × ATEMPO); lo scostamento in più sono le pause reinserite."""
    INF = float("inf")
    nW, nA = len(anc_w), len(anc_a)
    if not nW or not nA:
        return []
    SALTO = 6.0

    def tratto(w0: float, a0: float, w1: float, a1: float) -> float:
        dw, da = w1 - w0, a1 - a0
        if dw <= 0 or da <= 0:
            return INF
        atteso = dw * ATEMPO
        if da < atteso - 2:
            return INF
        if da > atteso * 6 + 60:  # stiramento assurdo = accoppiamento sbagliato
            return INF
        return abs(da - atteso) * 0.15

    f = [[INF] * nA for _ in range(nW)]
    prev: list[list[tuple[int, int] | None]] = [[None] * nA for _ in range(nW)]
    for i in range(nW):
        for j in range(nA):
            f[i][j] = tratto(0.0, 0.0, anc_w[i], anc_a[j]) + SALTO * (i + j)
            for i0 in range(max(0, i - 8), i):
                for j0 in range(max(0, j - 8), j):
                    if f[i0][j0] == INF:
                        continue
                    c = (f[i0][j0] + tratto(anc_w[i0], anc_a[j0], anc_w[i], anc_a[j])
                         + SALTO * ((i - i0 - 1) + (j - j0 - 1)))
                    if c < f[i][j]:
                        f[i][j] = c
                        prev[i][j] = (i0, j0)
    best, bi, bj = INF, -1, -1
    for i in range(nW):
        for j in range(nA):
            if f[i][j] == INF:
                continue
            c = f[i][j] + SALTO * ((nW - 1 - i) + (nA - 1 - j))
            if c < best:
                best, bi, bj = c, i, j
    if bi < 0:
        return []
    coppie: list[tuple[float, float]] = []
    passo: tuple[int, int] | None = (bi, bj)
    while passo is not None:
        i, j = passo
        coppie.append((anc_w[i], anc_a[j]))
        passo = prev[i][j]
    coppie.reverse()
    return coppie


def _ritara_parole(parole: list[tuple[str, float]], coppie: list[tuple[float, float]],
                   durata_audio: float) -> list[tuple[str, float]]:
    """Deforma i tempi a tratti lineari tra le ancore accoppiate; oltre
    l'ultima ancora prosegue al passo dell'atempo, mai oltre la fine."""
    nodi = [(0.0, 0.0)] + coppie

    def deforma(x: float) -> float:
        for k in range(len(nodi) - 1):
            w0, a0 = nodi[k]
            w1, a1 = nodi[k + 1]
            if x <= w1:
                return a1 if w1 == w0 else a0 + (x - w0) * (a1 - a0) / (w1 - w0)
        w0, a0 = nodi[-1]
        return a0 + (x - w0) * ATEMPO

    tetto = durata_audio - 0.5 if durata_audio > 1 else float("inf")
    return [(w, min(deforma(t), tetto)) for w, t in parole]


def _trasferisci_tempi(parole_a: list[tuple[str, float]],
                       parole_b: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """Il matrimonio delle due passate (2026-08-25): il TESTO buono della A
    (col VAD, orologio compattato) sposato con l\'OROLOGIO pieno della B
    (senza VAD, testo peggiore). Le parole di A che combaciano con B
    ereditano il tempo di B; le altre si interpolano tra le vicine. Se
    combacia meno di un quarto, il trasferimento non è affidabile: lista
    vuota, il chiamante ripiega."""
    if not parole_a or not parole_b:
        return []

    def norma(w: str) -> str:
        return re.sub(r"[^\w]+", "", w.lower())

    na = [norma(w) for w, _ in parole_a]
    nb = [norma(w) for w, _ in parole_b]
    tempi: list[float | None] = [None] * len(parole_a)
    combaciate = 0
    for blocco in difflib.SequenceMatcher(None, na, nb, autojunk=False).get_matching_blocks():
        for k in range(blocco.size):
            tempi[blocco.a + k] = parole_b[blocco.b + k][1]
            combaciate += 1
    if combaciate < len(parole_a) / 4:
        return []
    noti = [i for i, x in enumerate(tempi) if x is not None]
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
    # monotonia: whisper può incrociare due parole ai bordi dei blocchi
    fuori: list[tuple[str, float]] = []
    massimo = 0.0
    for (w, _), x in zip(parole_a, tempi):
        massimo = max(massimo, float(x))  # type: ignore[arg-type]
        fuori.append((w, massimo))
    return fuori


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


# ── Visite registrate (base ambient scribe, 2026-08-24) ─────────────────────
# Una registrazione di VISITA (conversazione medico-paziente, con consenso
# esplicito del paziente — art. 179ter CP, responsabilità dello studio) segue
# lo stesso binario dei dettati ma produce una NOTA DI VISITA strutturata al
# posto della lettera. Riconoscimento dal nome del file: le visite arrivano
# dalla piattaforma come «piattaforma-visita-<uuid>», o a mano con un nome
# che inizia per «visita».

PROMPT_VISITA = """Sei un assistente medico. Il testo qui sotto è la trascrizione automatica di una VISITA: una conversazione tra medico e paziente (le voci non sono etichettate e la trascrizione può contenere errori di riconoscimento).

Scrivi una NOTA DI VISITA strutturata in italiano, con queste sezioni (ometti quelle senza contenuto):
Motivo della visita:
Riferito dal paziente:
Esame e rilievi:
Valutazione:
Piano e istruzioni:

Regole obbligatorie:
1. SOLO informazioni presenti nella conversazione. MAI dedurre, MAI inventare, MAI completare.
2. Ogni numero (valori, dosaggi, date) deve comparire IDENTICO nella conversazione. Se un numero è incerto, non riportarlo.
3. Se un'informazione non emerge, ometti la sezione: non scrivere «non riferito».
4. Stile asciutto, in terza persona («Il paziente riferisce…»). Niente formule di cortesia.
5. Le chiacchiere non cliniche non entrano nella nota.

Rispondi SOLO con la nota, senza commenti prima o dopo.

CONVERSAZIONE:
{testo}"""


def _e_visita(nome_file: str) -> bool:
    basso = nome_file.lower()
    return (basso.startswith(f"{_PREFISSO_PIATTAFORMA}visita-")
            or basso.startswith("visita"))


def riassunto_visita(trascrizione: str, file_id: str) -> str | None:
    """Nota di visita dal trascritto della conversazione. Guardie nel codice:
    ogni numero della nota deve ESISTERE nella trascrizione (sottoinsieme,
    contando le ripetizioni — il riassunto può scartare numeri, mai
    inventarli) e la lunghezza deve essere sensata. None = il chiamante
    consegna la trascrizione integrale con un avviso."""
    inizio = time.monotonic()
    try:
        nota = chiama_ollama(
            PROMPT_VISITA.replace("{testo}", trascrizione), file_id,
            "riassunto", modello=MODELLO_RIASSUNTO,
        ).strip()
    except RuntimeError:
        return None
    if not 100 <= len(nota) <= max(2500, len(trascrizione)):
        log.warning("fase=riassunto file=%s esito=scartato motivo=lunghezza", file_id)
        return None
    num_t = _numeri(trascrizione)
    num_n = _numeri(nota)
    for n in set(num_n):
        if num_n.count(n) > num_t.count(n):
            log.warning(
                "fase=riassunto file=%s esito=scartato motivo=numero_estraneo", file_id)
            return None
    log.info("fase=riassunto file=%s esito=ok durata=%.1fs",
             file_id, time.monotonic() - inizio)
    return nota


PROMPT_ARBITRO = """Sei un correttore di trascrizioni mediche in italiano. Lo stesso dettato è stato trascritto DUE volte da due sistemi diversi: nei punti elencati le versioni divergono. Per ogni punto scegli la versione che è italiano corretto e ha senso medico nel contesto dato.

Regole obbligatorie:
1. Scegli "a" oppure "b". Se nessuna delle due è chiaramente giusta, rispondi "incerto".
2. Non inventare una terza versione: puoi solo scegliere.
3. Nel dubbio, "incerto": il punto resterà segnalato a una persona.

Rispondi SOLO con un oggetto JSON valido:
{"scelte": [{"punto": 1, "scelta": "a"}, {"punto": 2, "scelta": "incerto"}]}

PUNTI:
{punti}"""


def arbitra_divergenze(testo: str, divergenze: list[dict], file_id: str) -> tuple[str, int]:
    """Mini-GER a due ipotesi (piano precisione 2026-08-23, punto 5): dove le
    due passate di whisper divergono, il modello vede ENTRAMBE le versioni e
    sceglie la più sensata; il codice applica solo le scelte «b» (la «a» è
    già nel testo di lavoro). Paletti: mai punti in cui le versioni portano
    numeri diversi (il dubbio resta alla persona), mai segmenti lunghi, e la
    sostituzione avviene solo se il segmento è unico nel testo. Le divergenze
    restano comunque segnalate in bozza: la scelta è visibile e revocabile."""
    candidate: list[dict] = []
    for d in divergenze:
        va, vb = d.get("versione_a", ""), d.get("versione_b", "")
        if not va or not vb or va == vb:
            continue
        if _numeri(va) != _numeri(vb):
            continue
        if len(va) > 80 or len(vb) > 80:
            continue
        candidate.append(d)
    candidate = candidate[:30]
    if not candidate:
        return testo, 0
    inizio = time.monotonic()
    punti = "\n".join(
        f'{k + 1}) contesto: «{d["contesto"]}»\n'
        f'   a: «{d["versione_a"]}»\n   b: «{d["versione_b"]}»'
        for k, d in enumerate(candidate)
    )
    try:
        uscita = chiama_ollama(
            PROMPT_ARBITRO.replace("{punti}", punti), file_id, "confronto",
            formato_json=True, modello=MODELLO_CORREZIONE, max_gettoni=800,
        )
        dati = json.loads(uscita)
    except (RuntimeError, json.JSONDecodeError):
        return testo, 0
    scelte = dati.get("scelte") if isinstance(dati, dict) else None
    if not isinstance(scelte, list):
        return testo, 0
    applicate = 0
    for voce in scelte:
        if not isinstance(voce, dict) or voce.get("scelta") != "b":
            continue
        try:
            k = int(voce.get("punto", 0)) - 1
        except (TypeError, ValueError):
            continue
        if not 0 <= k < len(candidate):
            continue
        va, vb = candidate[k]["versione_a"], candidate[k]["versione_b"]
        if testo.count(va) == 1:
            testo = testo.replace(va, vb, 1)
            applicate += 1
    log.info(
        "fase=confronto file=%s esito=arbitrato punti=%d scelte_b=%d durata=%.1fs",
        file_id, len(candidate), applicate, time.monotonic() - inizio,
    )
    return testo, applicate


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


# ——— Passata B con Voxtral (doppia trascrizione, 2026-09-04) ———
# Secondo testimone INDIPENDENTE: al banco pesato Voxtral Mini prende più
# termini clinici di whisper (121 vs 113) e sbaglia in modo diverso — le
# divergenze A/B diventano due opinioni davvero indipendenti per l'arbitro.
# Whisper resta titolare di tempi e sincronizzazione: qui nasce SOLO il
# testo B. Interruttore: il file ~/.referralflow-voxtral-b (toccarlo =
# acceso, toglierlo = spento, letto a ogni dettato). Qualsiasi intoppo →
# False → passata B whisper come sempre: la catena non si ferma mai.
VOXTRAL_B_SWITCH = Path.home() / ".referralflow-voxtral-b"
VOXTRAL_VENV_PY = Path.home() / "voxtral-banco-venv" / "bin" / "python"
VOXTRAL_TIMEOUT_S = int(os.environ.get("REFERTI_VOXTRAL_TIMEOUT_S", "1500"))


def trascrivi_voxtral_b(originale: Path, uscita_txt: Path, wav_voxtral: Path,
                        file_id: str, caratteri_a: int) -> bool:
    inizio = time.monotonic()
    script = Path(__file__).resolve().parent / "trascrivi-voxtral.py"
    if not (VOXTRAL_VENV_PY.is_file() and script.is_file()):
        log.warning("fase=trascrizione_b motore=voxtral esito=saltato motivo=attrezzi file=%s",
                    file_id)
        return False
    # Voxtral vuole l'audio NATURALE: il rallentamento 0.8x tarato per
    # whisper lo PEGGIORA (misurato al banco 2026-09-03). Solo 16 kHz mono.
    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(originale),
             "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav_voxtral)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=600, check=True)
    except (subprocess.SubprocessError, OSError):
        log.warning("fase=trascrizione_b motore=voxtral esito=saltato motivo=ffmpeg file=%s",
                    file_id)
        return False
    # 9.5 GB di Voxtral e un gemma residente non convivono sul Mac da 24GB.
    libera_llm()
    try:
        esito = subprocess.run(
            [str(VOXTRAL_VENV_PY), str(script), str(wav_voxtral), str(uscita_txt)],
            capture_output=True, timeout=VOXTRAL_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        log.warning("fase=trascrizione_b motore=voxtral esito=fallito motivo=timeout file=%s",
                    file_id)
        return False
    if esito.returncode != 0 or not uscita_txt.is_file():
        log.warning("fase=trascrizione_b motore=voxtral esito=fallito codice=%d file=%s",
                    esito.returncode, file_id)
        return False
    testo = uscita_txt.read_text(encoding="utf-8").strip()
    # Sentinella anti-collasso: una passata B molto più corta della A è un
    # motore incantato, non un secondo parere. Si torna a whisper B.
    if len(testo) < max(400, int(caratteri_a * 0.4)):
        log.warning("fase=trascrizione_b motore=voxtral esito=scartato motivo=troppo_corto "
                    "caratteri=%d file=%s", len(testo), file_id)
        return False
    log.info("fase=trascrizione_b motore=voxtral esito=ok caratteri=%d durata=%.1fs file=%s",
             len(testo), time.monotonic() - inizio, file_id)
    return True


# ——— Rifinitura tempi col ForcedAligner (2026-09-04) ———
# Sgancia il riascolto dal motore: il testo FINALE viene riallineato
# all'audio da Qwen3-ForcedAligner (0.6B locale, scarto mediano 0.21s
# misurato al banco). Interruttore: file ~/.referralflow-aligner-tempi.
ALIGNER_SWITCH = Path.home() / ".referralflow-aligner-tempi"


def rifinisci_tempi(originale: Path, wav_naturale: Path,
                    parole: list, file_id: str) -> list:
    inizio = time.monotonic()
    script = Path(__file__).resolve().parent / "allinea-tempi.py"
    if not (VOXTRAL_VENV_PY.is_file() and script.is_file()):
        return parole
    if not wav_naturale.is_file():
        try:
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(originale),
                 "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav_naturale)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=600, check=True)
        except (subprocess.SubprocessError, OSError):
            return parole
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                         encoding="utf-8") as f:
            json.dump(parole, f, ensure_ascii=False)
            dentro = Path(f.name)
        fuori = dentro.with_suffix(".out.json")
        esito = subprocess.run(
            [str(VOXTRAL_VENV_PY), str(script), str(wav_naturale),
             str(dentro), str(fuori)],
            capture_output=True, timeout=900)
        if esito.returncode != 0 or not fuori.is_file():
            log.warning("fase=tempi motore=aligner esito=saltato codice=%d file=%s",
                        esito.returncode, file_id)
            return parole
        rifinite = json.loads(fuori.read_text(encoding="utf-8"))
        dentro.unlink(missing_ok=True)
        fuori.unlink(missing_ok=True)
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        log.warning("fase=tempi motore=aligner esito=saltato motivo=eccezione file=%s",
                    file_id)
        return parole
    if (not isinstance(rifinite, list) or len(rifinite) != len(parole)
            or any(not isinstance(p, list) or len(p) != 2 for p in rifinite)):
        log.warning("fase=tempi motore=aligner esito=scartato motivo=forma file=%s",
                    file_id)
        return parole
    log.info("fase=tempi motore=aligner esito=ok parole=%d durata=%.1fs file=%s",
             len(rifinite), time.monotonic() - inizio, file_id)
    return rifinite


# ——— Controllore di cifre con Parakeet (2026-09-04) ———
# Al banco pesato Parakeet-TDT è mediocre sulle parole ma È IL MIGLIORE
# sui numeri (104/108) ed è fulmineo (~2 s per minuto d'audio): terzo
# orecchio SOLO per le cifre. Non corregge mai nulla: se sente un numero
# che nel referto non c'è, aggiunge un AVVISO per chi rivede. Interruttore:
# file ~/.referralflow-parakeet-cifre. Qualsiasi intoppo → nessun avviso.
PARAKEET_SWITCH = Path.home() / ".referralflow-parakeet-cifre"
OPENASR_BIN = Path.home() / ".local" / "bin" / "openasr"
PARAKEET_MODELLO = "parakeet-tdt-0.6b-v3"


def controllo_cifre_parakeet(originale: Path, wav_naturale: Path,
                             finale: str, file_id: str) -> list[str]:
    inizio = time.monotonic()
    if not OPENASR_BIN.is_file():
        return []
    if not wav_naturale.is_file():
        try:
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(originale),
                 "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav_naturale)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=600, check=True)
        except (subprocess.SubprocessError, OSError):
            return []
    try:
        esito = subprocess.run(
            [str(OPENASR_BIN), "transcribe", str(wav_naturale),
             "--model", PARAKEET_MODELLO, "-f", "text", "--offline"],
            capture_output=True, text=True, timeout=900)
    except subprocess.SubprocessError:
        return []
    if esito.returncode != 0 or not esito.stdout.strip():
        log.warning("fase=controllo_cifre file=%s esito=saltato codice=%d",
                    file_id, esito.returncode)
        return []
    sentiti = set(_numeri(esito.stdout))
    presenti = set(_numeri(finale))
    mancanti = sorted(sentiti - presenti)[:8]
    log.info("fase=controllo_cifre file=%s esito=ok sentiti=%d presenti=%d "
             "mancanti=%d durata=%.1fs", file_id, len(sentiti), len(presenti),
             len(mancanti), time.monotonic() - inizio)
    return [
        f"Controllo cifre (secondo orecchio): nell'audio sembra esserci il numero "
        f"«{n}» che nel referto non compare — riascolta il passaggio."
        for n in mancanti
    ]


def chiama_ollama(prompt: str, file_id: str, fase: str, formato_json: bool = False,
                  modello: str | None = None, max_gettoni: int | None = None,
                  tentativi: int | None = None) -> str:
    """Una chiamata a /api/generate con 3 tentativi e pausa crescente
    (SPEC §7.2). Temperatura 0: stessa domanda, stessa risposta.
    `max_gettoni` (num_predict) mette un TETTO alla lunghezza della risposta:
    per le fasi a risposta corta (liste, verdetti) impedisce fisicamente le
    generazioni-fiume che sforano il tempo massimo (visto dal vivo il
    2026-08-24: 45 minuti persi per blocco sulla lista di riparazioni)."""
    richiesta_dati = {
        "model": modello or MODELLO_LLM,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0, "num_ctx": OLLAMA_NUM_CTX},
    }
    if max_gettoni:
        richiesta_dati["options"]["num_predict"] = max_gettoni
    if formato_json:
        richiesta_dati["format"] = "json"  # SPEC §6.3: output JSON garantito
    corpo = json.dumps(richiesta_dati).encode("utf-8")
    giri = tentativi or OLLAMA_TENTATIVI
    for tentativo in range(1, giri + 1):
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
        if tentativo < giri:
            time.sleep(5 * tentativo)
    log.error(
        "fase=%s file=%s esito=errore motivo=ollama_non_risponde tentativi=%d",
        fase, file_id, giri,
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


def _chiave_fonetica(parola: str) -> str:
    """Chiave fonetica per l'italiano (piano precisione, punto 3): due parole
    che SUONANO uguali producono la stessa chiave. Regole: accenti via, h
    muta via, doppie scempiate, consonanti sonore ripiegate sulle sorde
    (b→p, d→t, g→k, v→f): whisper confonde proprio quelle coppie
    («serrada»/«serrata»). Le vocali restano: «cardiaco»≠«cardiaca»."""
    s = parola.lower()
    s = s.translate(str.maketrans("àèéìíòóùú", "aeeiioouu"))
    s = re.sub(r"[^a-z]", "", s)
    s = s.replace("h", "")
    s = re.sub(r"(.)\1+", r"\1", s)
    return s.translate(str.maketrans({
        "b": "p", "d": "t", "g": "k", "v": "f", "w": "f",
        "z": "s", "q": "k", "c": "k", "y": "i", "j": "i",
    }))


def _parole_glossario() -> set[str]:
    """Parole singole (≥6 lettere) dei termini «giusti» dello studio: valori
    del dizionario + righe del vocabolario, stessi file di carica_vocabolario."""
    parole: set[str] = set()

    def aggiungi(termine: str) -> None:
        for w in re.findall(r"[a-zà-ÿ]{6,}", termine.lower()):
            parole.add(w)

    for p in (PERCORSO_CORREZIONI_LOCALI, PERCORSO_CORREZIONI):
        if not p.is_file():
            continue
        try:
            config = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for chiave, sezione in config.items():
            if not chiave.startswith("_") and isinstance(sezione, dict):
                for v in sezione.values():
                    aggiungi(str(v))
    for p in (PERCORSO_VOCABOLARIO_LOCALI, PERCORSO_VOCABOLARIO):
        if not p.is_file():
            continue
        try:
            righe = p.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for r in righe:
            r = r.strip()
            if r and not r.startswith("#"):
                aggiungi(r)
    return parole


def riparazioni_glossario(testo: str, file_id: str) -> tuple[str, int]:
    """Riparazioni deterministiche SENZA AI (piano precisione, punto 3): una
    parola del dettato che non è nel glossario ma ne è la storpiatura
    evidente — stessa chiave fonetica, oppure distanza di battitura ≤1
    (≤2 se lunga ≥9) — viene riparata col termine del glossario.
    Prudenza: solo parole minuscole di ≥7 lettere (le maiuscole possono
    essere nomi propri), solo se il candidato è UNO solo, mai cifre."""
    inizio = time.monotonic()
    gloss = _parole_glossario()
    if not gloss:
        return testo, 0
    per_chiave: dict[str, set[str]] = {}
    for w in gloss:
        per_chiave.setdefault(_chiave_fonetica(w), set()).add(w)
    coppie: dict[str, str] = {}
    viste: set[str] = set()
    for m in re.finditer(r"(?<![\w'])[a-zà-ÿ]{7,}(?![\w])", testo):
        parola = m.group(0)
        if parola in viste or parola in gloss:
            continue
        viste.add(parola)
        candidati = {c for c in per_chiave.get(_chiave_fonetica(parola), set())
                     if c != parola}
        if not candidati:
            max_d = 2 if len(parola) >= 9 else 1
            candidati = {c for c in gloss
                         if abs(len(c) - len(parola)) <= max_d
                         and _distanza_battitura(parola, c) <= max_d}
        # Desinenze, non storpiature: se le due parole coincidono una volta
        # tolte le vocali finali («pressoria»/«pressorio», «pressori»/
        # «pressorio», «cardiaca»/«cardiaco») è una flessione legittima
        # dell'italiano — non si tocca.
        stelo = re.sub(r"[aeiou]+$", "", parola)
        candidati = {c for c in candidati
                     if re.sub(r"[aeiou]+$", "", c) != stelo}
        # Guardia anti-ribaltamento anche qui (2026-08-27, visto dal vivo:
        # «regolare» era nel glossario dentro «sinusale regolare» e l'aggancio
        # ha riparato irregolare→regolare — inversione clinica): la stessa
        # regola della lista AI vale per il percorso deterministico.
        candidati = {c for c in candidati if not _ribaltamento_clinico(parola, c)}
        if len(candidati) == 1:
            coppie[parola] = candidati.pop()
    riparate = 0
    for da, a in coppie.items():
        nuovo, n = re.subn(r"(?<![\w'])" + re.escape(da) + r"(?![\w])",
                           lambda _m, a=a: a, testo)
        if n > 0:
            testo = nuovo
            riparate += 1
            registro = RIPARAZIONI_APPLICATE.setdefault(file_id, [])
            if (da, a) not in registro:
                registro.append((da, a))
    if riparate:
        log.info(
            "fase=dizionario_fonetico file=%s esito=ok riparazioni=%d durata=%.1fs",
            file_id, riparate, time.monotonic() - inizio,
        )
    return testo, riparate


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
    # Stessa chiave fonetica = suona uguale: la coppia è plausibile anche se
    # per lettere è lontana (punto 3 del piano precisione).
    if len(ba) >= 4 and _chiave_fonetica(ba) == _chiave_fonetica(bb):
        return True
    # Sigle: «reg → ECG» (visto dal vivo) suona uguale ma per lettere è
    # lontano; per le sigle corte tutte maiuscole basta una vicinanza lasca.
    return a.isupper() and len(a) <= 5 and len(da.split()) == 1 and dist <= 2


LISTA_BLOCCO_CAR = int(os.environ.get("REFERTI_LISTA_BLOCCO_CAR", "3500"))


def _blocchi_di_testo(testo: str, dimensione: int) -> list[str]:
    """Spezza il testo in blocchi di circa `dimensione` caratteri, tagliando
    solo a confine di frase/riga: nessuna parola resta a cavallo di due
    blocchi."""
    if len(testo) <= dimensione:
        return [testo]
    blocchi: list[str] = []
    corrente = ""
    for pezzo in re.split(r"(?<=[.!?;\n])\s+", testo):
        if corrente and len(corrente) + len(pezzo) + 1 > dimensione:
            blocchi.append(corrente)
            corrente = pezzo
        else:
            corrente = f"{corrente} {pezzo}".strip() if corrente else pezzo
    if corrente:
        blocchi.append(corrente)
    return blocchi


# Registro delle riparazioni APPLICATE per file (taratura 2026-08-26, dal
# referto reale: 5 cartellini su 7 dell'avvocato del diavolo erano le nostre
# stesse riparazioni risegnalate perché «non sono nel dettato» — ovvio, le
# abbiamo corrette apposta). L'avvocato lo consulta per non processare le
# correzioni volute. Si azzera a inizio corsa in elabora.
RIPARAZIONI_APPLICATE: dict[str, list[tuple[str, str]]] = {}

# Ribaltamenti clinici VIETATI nelle liste di riparazioni (buco scoperto al
# banco del 2026-08-26: Apertus proponeva «ma scrivete positivo → ma scrivete
# negativo» — suona simile, niente cifre, passava tutte le guardie ma inverte
# il significato medico). Una coppia che scambia questi opposti è respinta
# SEMPRE, qualunque modello la proponga.
ANTONIMI_CLINICI = [
    ("positivo", "negativo"), ("positiva", "negativa"),
    ("positivi", "negativi"), ("positive", "negative"),
    ("regolare", "irregolare"), ("regolari", "irregolari"),
    ("destro", "sinistro"), ("destra", "sinistra"),
    ("presente", "assente"), ("presenti", "assenti"),
    ("aumentato", "diminuito"), ("aumentata", "diminuita"),
    ("superiore", "inferiore"), ("superiori", "inferiori"),
    ("ascendente", "discendente"), ("ascendenti", "discendenti"),
    ("sistolico", "diastolico"), ("sistolica", "diastolica"),
    ("conservata", "ridotta"), ("conservato", "ridotto"),
    ("prossimale", "distale"), ("anteriore", "posteriore"),
]


def _ribaltamento_clinico(da: str, a: str) -> bool:
    """Vero se la coppia scambia due opposti clinici (o un prefisso
    iper-/ipo- sullo stesso stelo, es. ipertensione → ipotensione)."""
    tda = set(re.findall(r"[a-zà-ÿ]+", da.lower()))
    ta = set(re.findall(r"[a-zà-ÿ]+", a.lower()))
    for x, y in ANTONIMI_CLINICI:
        if (x in tda and y in ta) or (y in tda and x in ta):
            return True
    for wa in tda:
        for wb in ta:
            for p1, p2 in (("iper", "ipo"), ("ipo", "iper")):
                if (wa.startswith(p1) and wb.startswith(p2)
                        and wa[len(p1):] == wb[len(p2):]
                        and len(wa) > len(p1) + 2):
                    return True
    return False


def _applica_lista(testo: str, coppie: list, file_id: str,
                   fase: str) -> tuple[str, int, int] | None:
    """Applica una lista di riparazioni con TUTTE le guardie della regola
    d'oro: niente cifre nelle coppie, lunghezze contenute, somiglianza
    fonetica (_riparazione_plausibile), cintura finale sulla firma numerica.
    Condivisa tra il percorso locale e quello esterno: le guardie sono le
    stesse qualunque sia il modello che propone."""
    applicate = 0
    scartate = 0
    nuovo = testo
    coppie_ok: list[tuple[str, str]] = []
    for voce in coppie[:150]:
        if not isinstance(voce, dict):
            scartate += 1
            continue
        da = str(voce.get("da", "")).strip()
        a = str(voce.get("a", "")).strip()
        if (not da or not a or da == a or len(da) > 60 or len(a) > 60
                or re.search(r"\d", da) or re.search(r"\d", a)
                or len(a.split()) > len(da.split()) + 2
                or _ribaltamento_clinico(da, a)
                or not _riparazione_plausibile(da, a)):
            scartate += 1
            continue
        patt = re.compile(r"(?<!\w)" + re.escape(da) + r"(?!\w)")
        nuovo, n = patt.subn(lambda _m: a, nuovo)
        if n > 0:
            applicate += 1
            coppie_ok.append((da, a))
        else:
            scartate += 1
    if _numeri(nuovo) != _numeri(testo):
        # Non dovrebbe mai accadere (le coppie con cifre sono rifiutate):
        # cintura di sicurezza sul vincolo §2.4.
        log.warning(
            "fase=%s file=%s esito=lista_scartata motivo=numeri_cambiati",
            fase, file_id,
        )
        return None
    registro = RIPARAZIONI_APPLICATE.setdefault(file_id, [])
    registro.extend(c for c in coppie_ok if c not in registro)
    return nuovo, applicate, scartate


# ── Percorso esterno: anonimizza → modello di punta → lista → guardie ───────

def _anonimizza_per_esterno(testo: str, file_id: str,
                            con_mappa: bool = False):
    """Prepara il testo per l'invio esterno: il modello LOCALE individua i
    dati identificativi, il CODICE li sostituisce con segnaposto («Persona
    N», «[data N]», «[contatto]») più la rete regex (AVS, email, telefoni,
    date). CONTROPROVA BLOCCANTE in due tempi: (1) il codice verifica che
    nessun dato trovato sia ancora nel testo; (2) una seconda passata AI
    sul testo anonimizzato — se trova un nome che c'è davvero (verificato
    dal codice, i segnaposto non contano), si torna None e il chiamante
    resta sulla catena locale. Nei log SOLO conteggi, mai i dati."""
    try:
        uscita = chiama_ollama(
            PROMPT_DATI_PERSONALI.replace("{testo}", testo), file_id,
            "correzione_esterna", formato_json=True, max_gettoni=1600,
        )
        dati = json.loads(uscita)
    except (RuntimeError, json.JSONDecodeError):
        return None
    voci = dati.get("dati") if isinstance(dati, dict) else None
    if not isinstance(voci, list):
        return None
    anon = testo
    persone = 0
    date_n = 0
    altri_n = 0
    sensibili: list[str] = []  # tutto ciò che NON deve più comparire
    # La mappa segnaposto → dato vero serve alla catena compatta per
    # riportare le citazioni del modello esterno sul testo reale. Vive
    # SOLO in memoria e solo per questa corsa: mai su disco, mai nei log.
    mappa: dict[str, str] = {}
    for voce in voci[:80]:
        if not isinstance(voce, dict):
            continue
        s = str(voce.get("testo", "")).strip()
        tipo = str(voce.get("tipo", "")).strip()
        if not s or len(s) > 80 or s not in anon and s.lower() not in anon.lower():
            continue
        # Ogni segnaposto è NUMERATO e finisce in mappa (2026-09-04): serve
        # alla bella copia per ricostruire il testo vero al carattere. Fuori
        # esce solo il numero progressivo — stessa privacy di prima.
        if tipo == "nome":
            persone += 1
            segnaposto = f"Persona {persone}"
        elif tipo == "data_nascita":
            date_n += 1
            segnaposto = f"[data {date_n}]"
        else:
            altri_n += 1
            segnaposto = f"[dato {altri_n}]"
        if segnaposto not in mappa:
            mappa[segnaposto] = s
        anon = re.sub(re.escape(s), segnaposto, anon, flags=re.IGNORECASE)
        sensibili.append(s)
        # Le singole parole di un nome composto (≥4 lettere) coprono le
        # citazioni parziali («la signora Rossi» dopo «Maria Rossi»): ogni
        # pezzo ha il SUO segnaposto, così il ripristino è esatto (il nome
        # intero al posto del solo cognome romperebbe l'impronta).
        if tipo == "nome":
            for pezzo in s.split():
                if len(pezzo) >= 4 and pezzo.isalpha() and re.search(
                        r"(?<!\w)" + re.escape(pezzo) + r"(?!\w)", anon, re.IGNORECASE):
                    persone += 1
                    segnaposto_p = f"Persona {persone}"
                    mappa[segnaposto_p] = pezzo
                    anon = re.sub(r"(?<!\w)" + re.escape(pezzo) + r"(?!\w)",
                                  segnaposto_p, anon, flags=re.IGNORECASE)
                    sensibili.append(pezzo)

    # Rete regex: cose a struttura fissa che l'AI può mancare. Anche qui
    # segnaposto numerati per occorrenza, registrati in mappa.
    def _rete(motivo: str, etichetta: str) -> None:
        nonlocal anon
        def _sost(m: "re.Match[str]") -> str:
            nonlocal altri_n, date_n
            if etichetta == "data":
                date_n += 1
                seg = f"[data {date_n}]"
            else:
                altri_n += 1
                seg = f"[dato {altri_n}]"
            mappa[seg] = m.group(0)
            return seg
        anon = re.sub(motivo, _sost, anon)

    _rete(r"756\.\d{4}\.\d{4}\.\d{2}", "dato")
    _rete(r"[\w.+-]+@[\w-]+\.[\w.]+", "dato")
    _rete(r"(?<!\d)(?:\+41|0041|0)\s?7[5-9](?:[ .]?\d{2,3}){3}(?!\d)", "dato")
    _rete(r"(?<!\d)\d{1,2}[./]\d{1,2}[./](?:19|20)?\d{2}(?!\d)", "data")
    # Controprova 1 (codice): nessun dato trovato deve essere sopravvissuto.
    for s in sensibili:
        if re.search(r"(?<!\w)" + re.escape(s) + r"(?!\w)", anon, re.IGNORECASE):
            log.warning(
                "fase=correzione_esterna file=%s esito=annullata motivo=dato_sopravvissuto",
                file_id)
            return None
    # Controprova 2 (seconda passata AI sul testo anonimizzato).
    try:
        uscita2 = chiama_ollama(
            PROMPT_DATI_PERSONALI.replace("{testo}", anon), file_id,
            "correzione_esterna", formato_json=True, max_gettoni=1600,
        )
        dati2 = json.loads(uscita2)
    except (RuntimeError, json.JSONDecodeError):
        return None
    # Ciò che la seconda passata considera un nome NON annulla più tutto:
    # viene REDATTO anche lui (2026-09-04, visto dal vivo: sigle tipo H1N1
    # scambiate per nomi bocciavano stabilmente la fase). Privacy uguale o
    # migliore — un nome vero sfuggito viene coperto, una sigla oscurata
    # per eccesso non fa male: al ritorno la rimette la mappa.
    redatte = 0
    for voce in (dati2.get("dati") or []) if isinstance(dati2, dict) else []:
        if not isinstance(voce, dict) or str(voce.get("tipo", "")) != "nome":
            continue
        s = str(voce.get("testo", "")).strip()
        # Conta solo se è davvero nel testo e non è un nostro segnaposto.
        if (s and len(s) <= 80 and s in anon and not s.startswith("Persona")
                and not s.startswith("[")):
            persone += 1
            segnaposto = f"Persona {persone}"
            mappa[segnaposto] = s
            anon = re.sub(re.escape(s), segnaposto, anon, flags=re.IGNORECASE)
            redatte += 1
    if redatte:
        log.info("fase=correzione_esterna file=%s controprova_redatte=%d",
                 file_id, redatte)
    log.info(
        "fase=correzione_esterna file=%s anonimizzazione=ok persone=%d date=%d",
        file_id, persone, date_n)
    return (anon, mappa) if con_mappa else anon


def _chiama_esterno(prompt: str, file_id: str) -> str:
    """Una chiamata all'API Anthropic (messages), 2 tentativi, temperatura 0.
    Mai contenuti nei log; qui arriva SOLO testo già anonimizzato."""
    corpo = json.dumps({
        "model": MODELLO_ESTERNO,
        "max_tokens": 2000,
        "temperature": 0,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    for tentativo in (1, 2):
        try:
            richiesta = urllib.request.Request(
                ANTHROPIC_URL, data=corpo,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                })
            with urllib.request.urlopen(richiesta, timeout=ESTERNO_TIMEOUT_S) as r:
                dati = json.loads(r.read().decode("utf-8"))
            testo = "".join(b.get("text", "") for b in dati.get("content") or []
                            if isinstance(b, dict) and b.get("type") == "text")
            if testo.strip():
                return testo
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            pass
        if tentativo == 1:
            time.sleep(5)
    raise RuntimeError("api esterna non risponde")


def _chiama_esterno_manuale(anon: str, file_id: str) -> str:
    """Trasporto manuale del collaudo: scrive il testo ANONIMIZZATO in
    scambio-esterno/<file_id>.anon.txt e attende la lista di riparazioni
    in <file_id>.lista.json (stesso formato del prompt §6.1b). Il file di
    scambio viene tolto in ogni caso; niente risposta entro il tempo
    massimo → RuntimeError → ripiego sulla catena locale."""
    SCAMBIO_ESTERNO_DIR.mkdir(parents=True, exist_ok=True)
    consegna = SCAMBIO_ESTERNO_DIR / f"{file_id}.anon.txt"
    risposta = SCAMBIO_ESTERNO_DIR / f"{file_id}.lista.json"
    risposta.unlink(missing_ok=True)
    consegna.write_text(anon, encoding="utf-8")
    log.info("fase=correzione_esterna file=%s trasporto=manuale attesa_s=%d",
             file_id, SCAMBIO_ATTESA_S)
    scadenza = time.monotonic() + SCAMBIO_ATTESA_S
    try:
        while time.monotonic() < scadenza:
            if risposta.exists():
                time.sleep(1)  # margine: il file potrebbe essere a metà scrittura
                testo = risposta.read_text(encoding="utf-8")
                if testo.strip():
                    return testo
            time.sleep(5)
    finally:
        consegna.unlink(missing_ok=True)
        risposta.unlink(missing_ok=True)
    raise RuntimeError("correttore manuale non ha risposto")


def _chiama_esterno_openai(prompt: str, file_id: str,
                           modello: str | None = None) -> str:
    """Una chiamata a un endpoint compatibile OpenAI (config da
    _config_esterno). Pensatoio spento dove il server lo onora; per i
    modelli che ragionano comunque, la risposta si pesca anche dal campo
    reasoning. 2 tentativi. Qui arriva SOLO testo già anonimizzato.
    `modello` scavalca la riga modello= della config (righe per-fase:
    modello_bella=, modello_struttura=)."""
    cfg = _config_esterno()
    if not cfg:
        raise RuntimeError("config esterna mancante")
    base = {
        "model": modello or cfg["modello"],
        "max_tokens": int(cfg.get("max_gettoni", "8000")),
        "messages": [{"role": "user", "content": prompt}],
    }
    for tentativo in (1, 2):
        try:
            dati = None
            # Scaletta di varianti: temperatura 0 e pensatoio spento dove il
            # server li accetta; chi rifiuta un campo (Google valida stretto,
            # i modelli Anthropic «ragionanti» non vogliono la temperatura
            # fissa) riceve via via la richiesta più nuda. Ogni rifiuto è un
            # 400 immediato: le varianti extra non costano nulla.
            for extra in (
                {"temperature": 0,
                 "chat_template_kwargs": {"enable_thinking": False}},
                {"temperature": 0},
                {},
            ):
                corpo = json.dumps({**base, **extra}).encode("utf-8")
                richiesta = urllib.request.Request(
                    cfg["url"], data=corpo,
                    headers={"Content-Type": "application/json",
                             "Authorization": f"Bearer {cfg['chiave']}"})
                try:
                    with urllib.request.urlopen(richiesta, timeout=ESTERNO_TIMEOUT_S) as r:
                        dati = json.loads(r.read().decode("utf-8"))
                    break
                except urllib.error.HTTPError as e:
                    if e.code != 400:
                        raise
            if dati is None:
                raise urllib.error.URLError("richiesta rifiutata")
            msg = dati["choices"][0]["message"]
            testo = msg.get("content")
            if isinstance(testo, list):
                testo = "".join(b.get("text", "") for b in testo
                                if isinstance(b, dict))
            if not testo:
                testo = msg.get("reasoning_content") or msg.get("reasoning") or ""
            testo = re.sub(r"<think>.*?</think>", "", testo, flags=re.DOTALL)
            if testo.strip():
                return testo
        except (urllib.error.URLError, TimeoutError, OSError,
                json.JSONDecodeError, KeyError, IndexError):
            pass
        if tentativo == 1:
            time.sleep(5)
    raise RuntimeError("endpoint esterno non risponde")


def _estrai_json(uscita: str) -> dict | None:
    """Pesca l'oggetto JSON nella risposta anche se il modello lo incornicia
    di testo o di ragionamento (che può contenere altre graffe)."""
    i = uscita.rfind('{"riparazioni"')
    if i == -1:
        i = uscita.find("{")
    if i == -1:
        return None
    for j in range(len(uscita) - 1, i, -1):
        if uscita[j] == "}":
            try:
                dati = json.loads(uscita[i:j + 1])
                return dati if isinstance(dati, dict) else None
            except json.JSONDecodeError:
                continue
    return None


# Esiti delle fasi «assorbite» dalla catena compatta, per file: elabora li
# consuma al posto delle chiamate locali. Azzerato a inizio corsa.
COMPATTA_ESITI: dict[str, dict] = {}


def _catena_compatta_esterna(testo: str, file_id: str) -> str | None:
    """UNA chiamata esterna per quattro fasi (riparazioni, note segreteria,
    fuori tema, senza senso). Il testo viaggia ANONIMIZZATO; le citazioni
    tornano coi segnaposto e vengono riportate ai dati veri SUL MAC (mappa
    in sola memoria), poi passano dalle STESSE guardie delle fasi locali.
    Qualsiasi intoppo → None → catena tradizionale."""
    inizio = time.monotonic()
    esito_anon = _anonimizza_per_esterno(testo, file_id, con_mappa=True)
    if esito_anon is None:
        return None
    anon, mappa = esito_anon

    def rip(s: str) -> str:
        for segnaposto, vero in mappa.items():
            s = s.replace(segnaposto, vero)
        return s

    spezzata = (_config_esterno() or {}).get("spezzata") == "1"
    try:
        if spezzata:
            # Chiamata A: SOLO la lista di riparazioni (il formato dove anche
            # i modelli medi rendono al massimo).
            uscita = _chiama_esterno_openai(
                PROMPT_CORREZIONE_LISTA.replace("{testo}", anon), file_id)
        else:
            uscita = _chiama_esterno_openai(
                PROMPT_CATENA_COMPATTA.replace("{testo}", anon), file_id)
    except RuntimeError:
        log.warning(
            "fase=correzione_esterna file=%s esito=fallita motivo=nessuna_risposta modo=compatta",
            file_id)
        return None
    dati = _estrai_json(uscita)
    if not isinstance(dati, dict):
        return None

    coppie_anon = [(str(v.get("da", "")), str(v.get("a", "")))
                   for v in (dati.get("riparazioni") or []) if isinstance(v, dict)]
    coppie = [{"da": rip(da), "a": rip(a)} for da, a in coppie_anon]
    esito = _applica_lista(testo, coppie, file_id, "correzione_esterna")
    if esito is None:
        return None
    nuovo, applicate, scartate = esito

    if spezzata:
        # Il testo anonimo segue le stesse riparazioni appena applicate al
        # testo vero, così la chiamata B lavora sul referto già corretto.
        applicate_reali = {(d, a) for d, a in RIPARAZIONI_APPLICATE.get(file_id, [])}
        anon_corr = anon
        for da, a in coppie_anon:
            if (rip(da), rip(a)) in applicate_reali:
                anon_corr = re.sub(r"(?<!\w)" + re.escape(da) + r"(?!\w)",
                                   lambda _m, a=a: a, anon_corr)
        # Chiamata B: i tre cicli «segretariali» sul testo corretto.
        try:
            uscita_b = _chiama_esterno_openai(
                PROMPT_TRE_CICLI.replace("{testo}", anon_corr), file_id)
            dati_b = _estrai_json(uscita_b)
        except RuntimeError:
            dati_b = None
        if isinstance(dati_b, dict):
            for chiave in ("note_segreteria", "fuori_tema", "senza_senso"):
                dati[chiave] = dati_b.get(chiave)
        else:
            log.warning(
                "fase=correzione_esterna file=%s esito=cicli_b_falliti (solo riparazioni)",
                file_id)
    # Le citazioni degli altri cicli si riferiscono al testo PRIMA delle
    # riparazioni: si aggiornano con gli stessi scambi appena applicati,
    # così l'aggancio esatto sul testo nuovo torna a combaciare.
    applicate_coppie = RIPARAZIONI_APPLICATE.get(file_id, [])

    def aggiorna(s: str) -> str:
        s = rip(s)
        for da, a in applicate_coppie:
            s = s.replace(da, a)
        return s

    note = [aggiorna(str(s)) for s in (dati.get("note_segreteria") or [])
            if isinstance(s, str) and s.strip()]
    fuori = [aggiorna(str(s)) for s in (dati.get("fuori_tema") or [])
             if isinstance(s, str) and s.strip()]
    chiarire = [{"frase": aggiorna(str(v.get("frase", ""))),
                 "proposta": aggiorna(str(v.get("proposta", "")))}
                for v in (dati.get("senza_senso") or []) if isinstance(v, dict)]
    COMPATTA_ESITI[file_id] = {
        "note": note[:60], "fuori_tema": fuori[:60], "chiarire": chiarire[:40],
    }
    log.info(
        "fase=correzione_esterna file=%s esito=ok_compatta riparazioni=%d scartate=%d "
        "note=%d fuori=%d senza_senso=%d durata=%.1fs",
        file_id, applicate, scartate, len(note), len(fuori), len(chiarire),
        time.monotonic() - inizio,
    )
    return nuovo


def _correggi_a_lista_esterna(testo: str, file_id: str,
                              modo: str = "api") -> str | None:
    """Correzione a lista col modello di punta esterno (2026-08-26, idea
    dell'utente): il testo viaggia ANONIMIZZATO, torna solo la lista di
    riparazioni, il codice la applica al testo ORIGINALE con le stesse
    guardie del percorso locale. Le coppie che citano un segnaposto cadono
    da sole (contengono cifre). Ogni intoppo → None → catena locale."""
    inizio = time.monotonic()
    anon = _anonimizza_per_esterno(testo, file_id)
    if anon is None:
        return None
    try:
        if modo == "manuale":
            uscita = _chiama_esterno_manuale(anon, file_id)
        elif modo == "openai":
            uscita = _chiama_esterno_openai(
                PROMPT_CORREZIONE_LISTA.replace("{testo}", anon), file_id)
        else:
            uscita = _chiama_esterno(
                PROMPT_CORREZIONE_LISTA.replace("{testo}", anon), file_id)
    except RuntimeError:
        log.warning(
            "fase=correzione_esterna file=%s esito=fallita motivo=nessuna_risposta modo=%s",
            file_id, modo)
        return None
    m = re.search(r"\{.*\}", uscita, re.DOTALL)
    if not m:
        return None
    try:
        dati = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    coppie = dati.get("riparazioni") if isinstance(dati, dict) else None
    if not isinstance(coppie, list):
        return None
    esito = _applica_lista(testo, coppie, file_id, "correzione_esterna")
    if esito is None:
        return None
    nuovo, applicate, scartate = esito
    log.info(
        "fase=correzione_esterna file=%s esito=ok riparazioni=%d scartate=%d durata=%.1fs",
        file_id, applicate, scartate, time.monotonic() - inizio,
    )
    return nuovo


def _correggi_a_lista(testo: str, file_id: str) -> str | None:
    """Correzione «a lista di riparazioni» (idea dell'utente, 2026-08-21):
    il modello NON riscrive il testo — elenca solo gli scambi «parola
    storpiata → forma giusta» e il CODICE li applica, come già fa col
    dizionario dello studio. Vantaggi: risposta corta e numeri intoccabili
    PER COSTRUZIONE, perché ogni coppia che contiene cifre viene rifiutata
    a priori. Dal 2026-08-23 i dettati lunghi vanno A BLOCCHI (~3500 car,
    tagli a confine di frase): sul dettato vero da 23 minuti la chiamata
    unica sforava il tempo massimo tre volte di fila (45 minuti persi)
    prima del ripiego. Un blocco che non risponde si salta (le sue frasi
    restano com'erano); si ritorna None solo se NESSUN blocco risponde —
    allora il chiamante ripiega sulla riscrittura integrale."""
    inizio = time.monotonic()
    blocchi = _blocchi_di_testo(testo, LISTA_BLOCCO_CAR)
    dati_blocchi: list[dict | None] = []
    for blocco in blocchi:
        try:
            uscita = chiama_ollama(
                PROMPT_CORREZIONE_LISTA.replace("{testo}", blocco), file_id,
                "correzione_llm", formato_json=True, modello=MODELLO_CORREZIONE,
                max_gettoni=1600, tentativi=2,
            )
            dati_blocchi.append(json.loads(uscita))
        except (RuntimeError, json.JSONDecodeError):
            dati_blocchi.append(None)
    if all(d is None for d in dati_blocchi):
        return None
    dati = {"riparazioni": []}
    for d in dati_blocchi:
        if isinstance(d, dict) and isinstance(d.get("riparazioni"), list):
            dati["riparazioni"].extend(d["riparazioni"])
    coppie = dati.get("riparazioni") if isinstance(dati, dict) else None
    if not isinstance(coppie, list):
        return None
    esito = _applica_lista(testo, coppie, file_id, "correzione_llm")
    if esito is None:
        return None
    nuovo, applicate, scartate = esito
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
    modo_esterno = _esterno_attivo()
    if modo_esterno == "openai" and (_config_esterno() or {}).get("compatta") == "1":
        esito_compatta = _catena_compatta_esterna(testo, file_id)
        if esito_compatta is not None:
            return esito_compatta
        log.warning(
            "fase=correzione_esterna file=%s esito=compatta_fallita ripiego=lista",
            file_id,
        )
    if modo_esterno:
        esito_esterno = _correggi_a_lista_esterna(testo, file_id, modo_esterno)
        if esito_esterno is not None:
            return esito_esterno
        log.warning(
            "fase=correzione_esterna file=%s esito=fallita ripiego=catena_locale",
            file_id,
        )
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


# Salvagente clinico della pertinenza (referto reale 2026-08-26: spente
# «Ma nessuna franca fibrillazione atriale», «In parte, in quadrigemino»,
# «…si presenta da noi in buone condizioni generali»): il dettato a
# frammenti brevi fa sembrare chiacchiere anche il contenuto clinico.
# Una frase con un termine clinico forte non parte MAI spenta d'ufficio:
# resta accesa, decide la persona.
TERMINI_CLINICI_RE = re.compile(
    r"(?i)(?<!\w)(?:"
    r"fibrillazion\w*|aritmi\w*|extrasistol\w*|quadrigemin\w*|bigemin\w*|"
    r"trigemin\w*|dispnea|ortopnea|sincope|edem\w*|stenosi|insufficienz\w*|"
    r"valvol\w*|atriale|atriali|ventricolar\w*|sistolic\w*|diastolic\w*|"
    r"coronar\w*|ipertrofi\w*|pericardit\w*|cardiopat\w*|scompens\w*|"
    r"ischemi\w*|infart\w*|angina|palpitazion\w*|ipertension\w*|"
    r"ipotension\w*|tachicardi\w*|bradicardi\w*|soffio|compensat\w*|"
    r"diagnosi|terapia|farmac\w*|sintom\w*|paziente|anamnesi|eiezion\w*|"
    r"frazion\w*|mitralic\w*|aortic\w*|sinusale|calcificazion\w*|"
    r"cicloergometri\w*|ecocardiogramm\w*|elettrocardiogramm\w*|"
    # Allargato il 2026-08-27 (referto Qwen dal vivo: spente a torto la riga
    # del subileo e la narrazione della cicloergometria a frammenti).
    r"dolor\w*|addominal\w*|aderenz\w*|conservativ\w*|subile\w*|"
    r"carico|watt\w*|sforzo|massimale|negativ\w*|positiv\w*|pressori\w*|"
    r"ricover\w*|chirurg\w*|trattament\w*|dispositiv\w*|laboratori\w*"
    r")(?!\w)|condizioni generali|esame clinico"
)


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
    vere = _filtra_divagazioni(frasi, testo, file_id)
    log.info(
        "fase=pertinenza file=%s esito=ok fuori_tema=%d scartate=%d durata=%.1fs",
        file_id, len(vere), len(frasi) - len(vere), time.monotonic() - inizio,
    )
    return vere


def _filtra_divagazioni(frasi: list[str], testo: str, file_id: str) -> list[str]:
    """TUTTE le guardie dell'evidenziatore, riusabili da qualunque fonte
    (fase locale o catena compatta esterna): citazioni esatte, mai frasi
    con cifre (regola d'oro), mai frasi con termini clinici forti, e se
    l'esclusione supera un terzo del testo si ignora tutto."""
    vere = [f.strip() for f in frasi if len(f.strip()) >= 8 and f.strip() in testo]
    con_cifre = sum(1 for f in vere if re.search(r"\d", f))
    vere = [f for f in vere if not re.search(r"\d", f)]
    if con_cifre:
        log.info("fase=pertinenza file=%s salvate_con_cifre=%d", file_id, con_cifre)
    cliniche = sum(1 for f in vere if TERMINI_CLINICI_RE.search(f))
    vere = [f for f in vere if not TERMINI_CLINICI_RE.search(f)]
    if cliniche:
        log.info("fase=pertinenza file=%s salvate_cliniche=%d", file_id, cliniche)
    if sum(len(f) for f in vere) > len(testo) * 0.35:
        log.warning(
            "fase=pertinenza file=%s esito=ignorata motivo=esclusione_eccessiva proposte=%d",
            file_id, len(vere),
        )
        return []
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
    grezzi: list = []
    try:
        dati = json.loads(uscita)
        if isinstance(dati, dict) and isinstance(dati.get("frasi"), list):
            grezzi = dati["frasi"]
    except json.JSONDecodeError:
        pass
    voci = _filtra_senso(grezzi, testo, file_id)
    log.info(
        "fase=senso file=%s esito=ok segnalate=%d con_proposta=%d durata=%.1fs",
        file_id, len(voci), sum(1 for v in voci if v["proposta"]), time.monotonic() - inizio,
    )
    return voci


def _filtra_senso(grezzi: list, testo: str, file_id: str) -> list[dict]:
    """Guardie della fase «senso», riusabili da qualunque fonte: citazioni
    esatte, veto numerico sulle proposte (§2.4), e cintura anti-diluvio
    (referto reale 2026-08-26: 90 frasi segnalate, zero proposte — se la
    fase vuole segnalare troppo, è lei a sbagliare: restano al più 25 voci
    e solo quelle con una proposta)."""
    voci: list[dict] = []
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
    if len(voci) > 25:
        con_proposta = [v for v in voci if v["proposta"]]
        log.warning(
            "fase=senso file=%s esito=diluvio segnalate=%d tenute_con_proposta=%d",
            file_id, len(voci), min(len(con_proposta), 25),
        )
        voci = con_proposta
    return voci[:25]


PROMPT_AVVOCATO = """Sei un revisore severo («avvocato del diavolo») di referti medici in italiano. Confronta la BOZZA con il DETTATO ORIGINALE: sono lo stesso referto, il dettato è la trascrizione grezza dell'audio, la bozza è la versione ripulita.

Elenca le frasi della bozza che NON sono supportate dal dettato: affermazioni cliniche che nel dettato non compaiono, o che nel dettato dicono una cosa DIVERSA (soprattutto se cambia il significato clinico).

Regole obbligatorie:
1. Cita ogni frase ESATTAMENTE come compare nella bozza.
2. Ignora le differenze di forma: punteggiatura, maiuscole, refusi corretti, riformulazioni fedeli NON vanno segnalate. Conta solo il contenuto clinico.
3. Poche segnalazioni e fondate: nel dubbio, non segnalare.
4. Se tutto è supportato, lista vuota.

Rispondi SOLO con un oggetto JSON valido:
{"non_supportate": [{"frase": "...", "motivo": "..."}]}

DETTATO ORIGINALE:
{grezzo}

BOZZA:
{bozza}"""


AVVOCATO_REGOLA_RIASSUNTO = """ATTENZIONE: la bozza è un RIASSUNTO della conversazione — riformulare, sintetizzare e riordinare è il suo mestiere e NON va segnalato. Segnala SOLO: informazioni cliniche che nella conversazione non ci sono (lati del corpo, tempi, qualità dei sintomi mai detti), o che nella conversazione sono DIVERSE. Ignora completamente la forma."""


def avvocato_diavolo(bozza: str, grezzo: str, file_id: str,
                     riassunto: bool = False) -> list[dict]:
    """Verifica delle affermazioni (piano precisione 2026-08-23, punto 6,
    ispirata alla claim-verification di Abridge): un passaggio SEPARATO dal
    generatore rilegge la bozza contro il dettato grezzo e segnala le frasi
    non supportate, col motivo. Non riscrive niente: solo bandierine per la
    persona. Il codice tiene solo le citazioni che esistono davvero nella
    bozza. Qualsiasi errore → lista vuota (fase facoltativa)."""
    inizio = time.monotonic()
    try:
        uscita = chiama_ollama(
            (PROMPT_AVVOCATO.replace(
                "Regole obbligatorie:",
                AVVOCATO_REGOLA_RIASSUNTO + "\n\nRegole obbligatorie:")
             if riassunto else PROMPT_AVVOCATO)
            .replace("{grezzo}", grezzo).replace("{bozza}", bozza),
            file_id, "avvocato", formato_json=True, modello=MODELLO_ISPEZIONE,
            max_gettoni=1600,
        )
        dati = json.loads(uscita)
    except (RuntimeError, json.JSONDecodeError):
        log.warning("fase=avvocato file=%s esito=saltato motivo=ai_non_risponde", file_id)
        return []
    voci = dati.get("non_supportate") if isinstance(dati, dict) else None
    if not isinstance(voci, list):
        return []
    fuori = _filtra_avvocato(voci, bozza, grezzo, file_id)
    log.info(
        "fase=avvocato file=%s esito=ok segnalate=%d durata=%.1fs",
        file_id, len(fuori), time.monotonic() - inizio,
    )
    return fuori


def _filtra_avvocato(voci: list, bozza: str, grezzo: str,
                     file_id: str) -> list[dict]:
    """Le guardie dell'avvocato, riusabili da qualunque fonte (modello
    locale o verificatore esterno): citazioni esatte in bozza,
    anti-pedanteria (punteggiatura e trattini), niente riprocessi delle
    riparazioni volute."""
    def _nudo(s: str) -> str:
        return re.sub(r"[^\w\s]", "", s.lower())
    grezzo_nudo = re.sub(r"\s+", " ", _nudo(grezzo))
    fuori: list[dict] = []
    for voce in voci[:20]:
        if not isinstance(voce, dict):
            continue
        frase = str(voce.get("frase", "")).strip()
        motivo = str(voce.get("motivo", "")).strip()[:200]
        if len(frase) < 8 or frase not in bozza:
            continue
        # Anti-pedanteria (primo referto reale 2026-08-24: 9 segnalazioni su
        # 14 erano «senza punto»/«senza virgola»): se la frase, spogliata
        # della punteggiatura, esiste tale e quale nel dettato, il contenuto
        # È supportato — la segnalazione muore qui. Dal 2026-08-27 anche i
        # TRATTINI non fanno cartellino («Ma-lieve» vs «ma lieve»,
        # «steno-insufficienza» vs «stenoinsufficienza»): si confrontano le
        # varianti col trattino tolto e col trattino reso spazio.
        varianti = (frase, frase.replace("-", " "), frase.replace("-", ""))
        if any(re.sub(r"\s+", " ", _nudo(v)).strip() in grezzo_nudo
               for v in varianti):
            continue
        # Le riparazioni VOLUTE non si processano (taratura 2026-08-26): se
        # la frase, riportata alla forma pre-riparazione, esiste nel dettato,
        # l'unica differenza è una correzione applicata apposta dalla catena
        # (con le sue guardie) — risegnalarla raddoppia la revisione a vuoto.
        prima = frase
        for da, a in RIPARAZIONI_APPLICATE.get(file_id, []):
            if a and a in prima:
                prima = prima.replace(a, da)
        if prima != frase and re.sub(r"\s+", " ", _nudo(prima)).strip() in grezzo_nudo:
            continue
        fuori.append({"frase": frase[:400], "motivo": motivo})
    return fuori


AVVOCATO_SEP = "\n=====BOZZA=====\n"


def avvocato_esterno(bozza: str, grezzo: str, file_id: str) -> list[dict] | None:
    """Avvocato del diavolo sul modello di punta ESTERNO (2026-08-27,
    «opus per tutto»): seconda chiamata indipendente dal correttore.
    Grezzo e bozza vengono anonimizzati INSIEME (stesso passaggio, stessa
    controprova) e separati da un marcatore; le citazioni tornano coi
    segnaposto e vengono riportate ai dati veri prima delle guardie
    condivise. None = si ripiega sull'avvocato locale."""
    inizio = time.monotonic()
    if AVVOCATO_SEP.strip() in bozza or AVVOCATO_SEP.strip() in grezzo:
        return None
    esito_anon = _anonimizza_per_esterno(grezzo + AVVOCATO_SEP + bozza,
                                         file_id, con_mappa=True)
    if esito_anon is None:
        return None
    anon, mappa = esito_anon
    if AVVOCATO_SEP not in anon:
        return None
    anon_grezzo, anon_bozza = anon.split(AVVOCATO_SEP, 1)
    try:
        uscita = _chiama_esterno_openai(
            PROMPT_AVVOCATO.replace("{grezzo}", anon_grezzo)
            .replace("{bozza}", anon_bozza), file_id)
    except RuntimeError:
        log.warning(
            "fase=avvocato file=%s esito=esterno_fallito ripiego=locale", file_id)
        return None
    dati = _estrai_json(uscita)
    voci = dati.get("non_supportate") if isinstance(dati, dict) else None
    if not isinstance(voci, list):
        return None

    def rip(s: str) -> str:
        for segnaposto, vero in mappa.items():
            s = s.replace(segnaposto, vero)
        return s

    voci = [{"frase": rip(str(v.get("frase", ""))),
             "motivo": rip(str(v.get("motivo", "")))[:200]}
            for v in voci if isinstance(v, dict)]
    fuori = _filtra_avvocato(voci, bozza, grezzo, file_id)
    log.info(
        "fase=avvocato file=%s esito=ok_esterno segnalate=%d durata=%.1fs",
        file_id, len(fuori), time.monotonic() - inizio,
    )
    return fuori


# ——— Bella copia (2026-09-03, richiesta utente) ———
# Punteggiatura e maiuscole sistemate dall'esterno. È l'UNICA fase a cui è
# permesso riscrivere il testo intero, ed è permesso solo perché esiste una
# guardia assoluta: l'impronta «solo lettere e cifre» deve restare identica
# al carattere — se l'AI cambia, aggiunge o perde anche una sola parola o
# cifra, la proposta muore. Controllata DUE volte: sul testo anonimo
# (contro l'AI) e dopo il ripristino dei nomi (contro il giro di
# anonimizzazione: un dato redatto senza segnaposto non tornerebbe).

# ——— Formato standard dello studio (2026-09-04) ———
# Stampo ricavato dal rapporto-tipo VERO dello studio (foto dell'utente,
# nomi finti): la fase «struttura» produce nel payload una PROPOSTA
# testo_strutturato già nel formato della carta intestata — in pagina si
# applica con un clic, al posto dei 5 minuti del 27B locale. Guardie:
# firma numerica identica (esclusa la numerazione d'elenco), lunghezza,
# mai applicata da sola. Interruttore struttura=1 nella config esterna.

PROMPT_STRUTTURA = """Sei l'assistente di un cardiologo. Riorganizza il REFERTO DETTATO qui sotto nel formato standard dello studio, definito ESATTAMENTE così (solo le sezioni per cui il testo ha davvero contenuto, in quest'ordine):

Il saluto iniziale (es. «Cara collega, ti riferisco…») resta PRIMA di tutto, così com'è.

Diagnosi principali
1. Titolo della diagnosi (mese.anno se detto)
   - reperto o esame, con sigla, data e luogo se detti (es. «- ETT (11.03.2014): versamento…»)
   - altri reperti, uno per riga, ognuno preceduto da «- »
   - Attuale: la situazione di oggi di QUESTA diagnosi, se il testo la dice

Diagnosi secondarie
(numerazione che CONTINUA dalla precedente: 5., 6., …, stesso formato)

Comorbidità
(elenco breve, anche in prosa compatta)

Anamnesi attuale
(prosa: il decorso recente e i sintomi riferiti)

Terapia domiciliare
(un farmaco per riga: «Nome dose    schema» — lo schema posologico come dettato, es. «½-0-0-0», «1-0-1-0»)

Esami
(un paragrafo per esame, che inizia con il nome e la data tra parentesi SOLO se dettata: «Esame clinico (09.10.2025): …», «ECG basale (…): …», «Ecocardiografia transtoracica (…): …», laboratorio, ergometria…)

Valutazione
(il giudizio clinico complessivo)

Procedere
(il piano: controlli, terapia, «Programmiamo il prossimo controllo tra…»)

I saluti finali e la firma restano in FONDO, dopo Procedere.

REGOLE ASSOLUTE:
1. NON inventare MAI nulla: niente diagnosi, valori, esami, date o frasi che non siano nel testo. Sezione senza contenuto = non scrivere nemmeno il titolo.
2. Conserva TUTTI i numeri ESATTAMENTE come scritti (valori, date, dosaggi, schemi posologici): non aggiungerne, non toglierne, non riformattarli.
3. Ogni informazione va in UNA SOLA sezione: mai ripetere gli stessi dati in due punti.
4. Frasi scorrevoli e complete: puoi sistemare punteggiatura e ricucire i pezzi spostati, senza cambiare significato.
5. I segnaposto come «Persona 1» o «[data 3]» restano ESATTAMENTE come sono.
6. Rispondi SOLO con il referto riorganizzato, senza commenti.

REFERTO DETTATO:
{testo}"""


def _conta_numeri(testo: str) -> dict[str, int]:
    """Quante volte compare ogni numero, ESCLUSA la numerazione d'elenco a
    inizio riga («1. », «2. »…): è il formato a chiederla, non è un dato."""
    senza_elenchi = re.sub(r"^\s*\d{1,2}\.\s+", "", testo, flags=re.MULTILINE)
    conteggio: dict[str, int] = {}
    for n in re.findall(r"\d+(?:[.,]\d+)?", senza_elenchi):
        conteggio[n] = conteggio.get(n, 0) + 1
    return conteggio


def _numeri_conservati(prima: str, dopo: str) -> bool:
    """La riorganizzazione può far COLLASSARE i doppioni (il formato vieta
    di ripetere i dati in due sezioni), ma: nessun numero nuovo, nessun
    numero distinto perso, nessuna occorrenza in più."""
    a, b = _conta_numeri(prima), _conta_numeri(dopo)
    if set(a) != set(b):
        return False
    return all(b[n] <= a[n] for n in b)


def struttura_standard(testo: str, file_id: str) -> str | None:
    """La proposta nel formato standard dello studio, o None (esterno giù,
    anonimizzazione incerta, numeri cambiati, testo dimagrito troppo)."""
    inizio = time.monotonic()
    esito_anon = _anonimizza_per_esterno(testo, file_id, con_mappa=True)
    if esito_anon is None:
        log.warning("fase=struttura file=%s esito=annullata motivo=anonimizzazione", file_id)
        return None
    anon, mappa = esito_anon
    modello = (_config_esterno() or {}).get("modello_struttura") or None
    # Due tentativi: i fornitori non sono deterministici e la guardia è
    # severa — una bocciatura singola non condanna la fase.
    for giro in (1, 2):
        try:
            uscita = _chiama_esterno_openai(
                PROMPT_STRUTTURA.replace("{testo}", anon), file_id, modello=modello)
        except RuntimeError:
            log.warning("fase=struttura file=%s esito=fallita motivo=esterno", file_id)
            return None
        uscita = (uscita or "").strip()
        if not uscita or not _numeri_conservati(anon, uscita):
            log.warning("fase=struttura file=%s esito=scartata motivo=numeri giro=%d",
                        file_id, giro)
            continue
        if len(uscita) < len(anon) * 0.6:
            log.warning("fase=struttura file=%s esito=scartata motivo=troppo_corta giro=%d",
                        file_id, giro)
            continue
        for segnaposto in sorted(mappa, key=len, reverse=True):
            uscita = uscita.replace(segnaposto, mappa[segnaposto])
        if not _numeri_conservati(testo, uscita):
            log.warning("fase=struttura file=%s esito=scartata motivo=numeri_reali giro=%d",
                        file_id, giro)
            continue
        log.info("fase=struttura file=%s esito=ok caratteri=%d giro=%d durata=%.1fs",
                 file_id, len(uscita), giro, time.monotonic() - inizio)
        return uscita
    return None


PROMPT_BELLA_COPIA = """Sei un correttore di bozze per referti cardiologici. Sistema SOLO la punteggiatura e le maiuscole/minuscole del testo qui sotto: virgole al posto giusto, punti, maiuscola a inizio frase e nei nomi propri, spazi corretti attorno ai segni.

REGOLE ASSOLUTE:
- NON aggiungere, togliere o cambiare NEMMENO UNA parola.
- NON toccare numeri, date, sigle, unità di misura.
- NON riformulare, NON riordinare le frasi, NON unire o dividere i paragrafi: gli a-capo restano dove sono.
- I segnaposto come «Persona 1» o «[data 1]» restano ESATTAMENTE come sono.
- Rispondi SOLO con il testo sistemato, senza commenti.

TESTO:
{testo}"""


def _impronta_lettere(testo: str) -> str:
    """Solo lettere e cifre, minuscole, in fila: ciò che la bella copia non
    può cambiare (le è concesso toccare solo segni, spazi e maiuscole)."""
    return "".join(ch.lower() for ch in testo if ch.isalnum())


def bella_copia(testo: str, file_id: str) -> str | None:
    """Il testo torna ripunteggiato o non torna affatto: None = si tiene
    l'originale (esterno giù, anonimizzazione incerta o impronta violata)."""
    inizio = time.monotonic()
    esito_anon = _anonimizza_per_esterno(testo, file_id, con_mappa=True)
    if esito_anon is None:
        log.warning("fase=bella_copia file=%s esito=annullato motivo=anonimizzazione", file_id)
        return None
    anon, mappa = esito_anon
    modello = (_config_esterno() or {}).get("modello_bella") or None
    for giro in (1, 2):
        try:
            uscita = _chiama_esterno_openai(
                PROMPT_BELLA_COPIA.replace("{testo}", anon), file_id, modello=modello)
        except RuntimeError:
            log.warning("fase=bella_copia file=%s esito=fallito motivo=esterno", file_id)
            return None
        uscita = (uscita or "").strip()
        if not uscita or _impronta_lettere(uscita) != _impronta_lettere(anon):
            log.warning("fase=bella_copia file=%s esito=scartata motivo=impronta_anon giro=%d",
                        file_id, giro)
            continue
        # Segnaposto lunghi prima: «Persona 12» va ripristinato prima di
        # «Persona 1», che altrimenti gli mangerebbe il prefisso.
        for segnaposto in sorted(mappa, key=len, reverse=True):
            uscita = uscita.replace(segnaposto, mappa[segnaposto])
        if _impronta_lettere(uscita) != _impronta_lettere(testo):
            log.warning("fase=bella_copia file=%s esito=scartata motivo=impronta_reale giro=%d",
                        file_id, giro)
            continue
        log.info("fase=bella_copia file=%s esito=ok giro=%d durata=%.1fs",
                 file_id, giro, time.monotonic() - inizio)
        return uscita
    return None


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
        # Regola d'oro NEL CODICE (2026-08-23, visto dal vivo: il modello
        # segnalava «Scusami, ripeto, 108 su 70»): una frase che contiene
        # cifre porta un dato clinico e NON lascia mai il referto, qualunque
        # cosa dica il modello. Il prompt lo chiede già; qui si garantisce.
        if re.search(r"\d", f):
            continue
        # Narrazione clinica al passato («abbiamo anticipato il controllo…»):
        # racconta il percorso del paziente, non è un compito — resta nel
        # referto qualunque cosa dica il modello (che sul punto è recidivo:
        # regola nel prompt ignorata due corse di fila, 2026-08-25).
        if re.search(r"\babbiamo\s+(anticipat|eseguit|effettuat|riscontrat|rivalutat|osservat)", f, re.IGNORECASE):
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
    # Registro delle riparazioni pulito a ogni corsa (il servizio è un
    # processo lungo: senza azzeramento un retry sommerebbe corse diverse).
    RIPARAZIONI_APPLICATE.pop(file_id, None)
    COMPATTA_ESITI.pop(file_id, None)
    # Visita registrata o dettato classico? Dal nome del file (vedi _e_visita).
    visita = _e_visita(ingresso.name)
    # Avvisi per chi rivede: raccolti lungo tutta la corsa.
    avvisi: list[str] = []
    # La configurazione nel log (mai contenuti): serve a sapere, a posteriori,
    # con quali impostazioni è stata prodotta una corsa.
    log.info("fase=avvio file=%s atempo=%s denoise=%d vad=%d visita=%d",
             file_id, ATEMPO, int(DENOISE), int(USA_VAD), int(visita))

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
        # Sentinella anti-nano (2026-09-01, visto dal vivo: due corse del
        # servizio hanno prodotto 1'700 caratteri invece di 9'900 sullo
        # stesso audio, e la bozza decapitata è arrivata in pagina senza un
        # avviso). Un dettato vero rende ~5-8 caratteri per secondo di
        # parlato: sotto i 2 la trascrizione è quasi certamente collassata
        # → una corsa di recupero, e comunque un avviso ben visibile.
        try:
            testo_a = percorso(".txt").read_text(encoding="utf-8")
        except OSError:
            testo_a = ""
        densita = len(testo_a) / max(durata_wav, 1.0)
        if durata_wav >= TRONC_AUDIO_MIN_S and densita < 2.0:
            log.warning(
                "fase=trascrizione_a file=%s esito=sospetto_collasso caratteri=%d densita=%.2f",
                file_id, len(testo_a), densita,
            )
            avvisi.append(
                "ATTENZIONE: la trascrizione è sospettosamente corta rispetto alla "
                "durata dell'audio — è probabile che manchi gran parte del dettato. "
                "NON confermare questa bozza: riascolta l'audio e, se incompleta, "
                "ricarica il dettato."
            )
        # Col VAD i tempi di whisper sono sull'orologio COMPATTO: il metro
        # del «quanto doveva coprire» è la somma dei segmenti di parlato
        # (più i cuscinetti di giuntura), non la durata del WAV pieno —
        # sennò ogni dettato pieno di pause fa scattare un retry a vuoto.
        attesa = durata_wav
        if USA_VAD and durata_wav >= TRONC_AUDIO_MIN_S:
            seg_tr = _segmenti_vad(percorso(".wav"))
            if seg_tr:
                attesa = (sum(e - s for s, e in seg_tr)
                          + 0.2 * (len(seg_tr) - 1))
        scoperto = attesa - ultimo_a
        if (durata_wav >= TRONC_AUDIO_MIN_S and scoperto >= TRONC_GAP_MIN_S
                and scoperto / max(attesa, 1.0) >= TRONC_GAP_FRAZ):
            log.warning(
                "fase=trascrizione_a file=%s esito=riprovo_troncamento attesi_s=%d trascritto_s=%d",
                file_id, int(attesa), int(ultimo_a),
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
        # Doppia trascrizione: con l'interruttore acceso la passata B la fa
        # Voxtral (testimone indipendente); su visite o intoppi, whisper B.
        fatto_b = False
        if VOXTRAL_B_SWITCH.is_file() and not visita:
            fatto_b = trascrivi_voxtral_b(
                ingresso, percorso(".b.txt"), percorso(".voxtral.wav"),
                file_id, len(percorso(".txt").read_text(encoding="utf-8")))
        if not fatto_b:
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
        # Aggancio fonetico al glossario (punto 3 del piano precisione):
        # riparazioni deterministiche delle storpiature evidenti, senza AI.
        corretto_a, n_fon = riparazioni_glossario(corretto_a, file_id)
        corretto_b, _ = riparazioni_glossario(corretto_b, file_id)
        log.info(
            "fase=dizionario file=%s esito=ok sostituzioni=%d fonetiche=%d durata=%.1fs",
            file_id, n_sost, n_fon, time.monotonic() - inizio,
        )

        # Punteggiatura dettata (SPEC §3, passo 5b): i segni detti a voce
        # diventano segni veri, su entrambe le passate prima del confronto.
        fase = "punteggiatura"
        # In una conversazione registrata nessuno detta «virgola» o «punto»:
        # sulle visite la conversione salterebbe su usi normali delle parole.
        if visita:
            n_punt = 0
        else:
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
        # Arbitro a due ipotesi (punto 5 del piano): l'AI sceglie tra le due
        # versioni nei punti di divergenza; i dubbi restano comunque in bozza.
        if divergenze:
            corretto_a, _ = arbitra_divergenze(corretto_a, divergenze, file_id)

        fase = "correzione_llm"
        _ = notifica and notifica(fase)
        finale = correggi_llm(corretto_a, file_id, percorso(".scarto_ai.json"))
        percorso(".finale.txt").write_text(finale, encoding="utf-8")

        # Il testo integrale PRIMA della segretaria: il nome del paziente
        # spesso è dettato solo nell'apertura rivolta alla segreteria
        # («…in merito al signor X e scrivi»), che la fase successiva toglie
        # dal corpo. L'estrazione campi e i controlli devono vederlo.
        testo_integrale = finale

        nota_visita: str | None = None
        if visita:
            # Visita registrata: segretaria/evidenziatore/senso sono fasi da
            # dettatura e si saltano; al loro posto la NOTA DI VISITA. Se il
            # riassunto non supera le guardie si consegna la trascrizione
            # integrale con un avviso: mai una nota inaffidabile in silenzio.
            fase = "riassunto"
            _ = notifica and notifica(fase)
            nota_visita = riassunto_visita(finale, file_id)
            if nota_visita is None:
                avvisi.append(
                    "Il riassunto della visita non ha superato i controlli: "
                    "qui sotto c'è la trascrizione integrale da riassumere a mano."
                )
            note_segreteria = []
            divagazioni = []
            frasi_da_chiarire = []
        else:
            # Catena compatta esterna: le tre fasi qui sotto sono già state
            # svolte dal modello di punta in un'unica chiamata (cicli 2-4);
            # qui si applicano SOLO le guardie del codice sugli stessi esiti.
            compatta = COMPATTA_ESITI.pop(file_id, None)

            # La «segretaria»: le frasi rivolte alla segreteria escono dal corpo
            # del referto e diventano note. L'ispezione lavora sul testo pulito.
            fase = "segreteria"
            _ = notifica and notifica(fase)
            if compatta is not None:
                finale, note_segreteria = _applica_note_segreteria(
                    finale, compatta["note"])
                log.info("fase=segreteria file=%s esito=compatta note=%d",
                         file_id, len(note_segreteria))
            else:
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
            if compatta is not None:
                divagazioni = _filtra_divagazioni(
                    compatta["fuori_tema"], finale, file_id)
                log.info("fase=pertinenza file=%s esito=compatta fuori_tema=%d",
                         file_id, len(divagazioni))
            else:
                divagazioni = trova_divagazioni(finale, file_id)
            percorso(".divagazioni.json").write_text(
                json.dumps(divagazioni, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

            # Il controllo del senso: frasi storpiate segnalate con proposta di
            # ricostruzione dal glossario (stesso vocabolario dato a whisper).
            fase = "senso"
            _ = notifica and notifica(fase)
            if compatta is not None:
                frasi_da_chiarire = _filtra_senso(
                    compatta["chiarire"], finale, file_id)
                log.info("fase=senso file=%s esito=compatta segnalate=%d",
                         file_id, len(frasi_da_chiarire))
            else:
                frasi_da_chiarire = controlla_senso(finale, vocab, file_id)
            # Una frase già segnalata come fuori tema non va anche «chiarita»:
            # è spenta dall'evidenziatore, il doppione confonderebbe.
            frasi_da_chiarire = [v for v in frasi_da_chiarire if v["frase"] not in divagazioni]
            percorso(".senso.json").write_text(
                json.dumps(frasi_da_chiarire, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

        # Avvocato del diavolo (punto 6 del piano): la bozza riletta contro
        # il dettato grezzo, frase per frase. Solo bandierine, mai riscritture.
        fase = "avvocato"
        _ = notifica and notifica(fase)
        # Sulle visite l'avvocato verifica la NOTA (dove il rischio di
        # invenzione è massimo: è un riassunto generato, non una pulizia).
        # Metro diverso (primo collaudo 2026-08-24: 1 invenzione vera presa
        # — «caviglia destra» mai detta — ma 5 falsi allarmi sul fatto che
        # la nota «riformula»): su un riassunto la riformulazione è attesa.
        cfg_est = _config_esterno()
        frasi_non_supportate = None
        if (cfg_est and cfg_est.get("avvocato") == "1"
                and _esterno_attivo() == "openai" and not nota_visita):
            frasi_non_supportate = avvocato_esterno(finale, grezzo_a, file_id)
        if frasi_non_supportate is None:
            frasi_non_supportate = avvocato_diavolo(
                nota_visita if nota_visita else finale, grezzo_a, file_id,
                riassunto=bool(nota_visita))
        frasi_non_supportate = [
            v for v in frasi_non_supportate if v["frase"] not in divagazioni
        ]

        fase = "ispezione_llm"
        _ = notifica and notifica(fase)
        # Sulle visite l'ispezione lavorerebbe su una conversazione colloquiale
        # (tutto «privo di senso medico» per costruzione): si salta.
        dubbi = [] if visita else ispeziona_llm(finale, file_id)
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

        # Memoria della visita (2026-09-02): per le frasi dubbie della bozza
        # si consulta la registrazione della seduta più recente. Gli esiti
        # buoni diventano PROPOSTE nel wizard (entrano tra le frasi da
        # chiarire); mai applicati da soli. Fase facoltativa: senza visita
        # abbinata, senza embedding o senza esterno non succede nulla.
        # Interruttore: si accende SOLO con visita=1 nella config esterna
        # (tenuta da parte su richiesta utente 2026-09-03).
        if (not visita and _esterno_attivo() == "openai"
                and cfg_est and cfg_est.get("visita") == "1"):
            fase = "consulto_visita"
            _ = notifica and notifica(fase)
            gia = {v["frase"] for v in frasi_da_chiarire}
            candidati = (
                [v["frase"] for v in frasi_da_chiarire if not v.get("proposta")]
                + [v["frase"] for v in frasi_non_supportate]
                + [d for d in dubbi if isinstance(d, str)]
            )
            visti_c: set[str] = set()
            domande = []
            for c in candidati:
                if c not in visti_c:
                    visti_c.add(c)
                    domande.append(c)
            for esito_c in consulto_visita(domande, file_id):
                voce = {"frase": esito_c["frase"][:300],
                        "proposta": esito_c["proposta"][:300]}
                if esito_c["frase"] in gia:
                    for v in frasi_da_chiarire:
                        if v["frase"] == esito_c["frase"] and not v.get("proposta"):
                            v["proposta"] = voce["proposta"]
                            break
                else:
                    frasi_da_chiarire.append(voce)
            frasi_da_chiarire = frasi_da_chiarire[:40]

        # Bella copia: punteggiatura e maiuscole (interruttore bella=1 nella
        # config esterna, solo sui referti). Se la proposta non supera le
        # guardie dell'impronta il testo resta com'è; sta PRIMA di estrazione
        # e tempi, così campi e riascolto lavorano sul testo definitivo.
        if (not visita and _esterno_attivo() == "openai"
                and (_config_esterno() or {}).get("bella") == "1"):
            fase = "bella_copia"
            _ = notifica and notifica(fase)
            pulito = bella_copia(finale, file_id)
            if pulito is not None:
                finale = pulito
                testo_integrale = finale

        # Formato standard dello studio (struttura=1): la catena prepara la
        # PROPOSTA già impaginata come il rapporto-tipo — in pagina si
        # applica con un clic. Il testo ufficiale resta `finale`.
        testo_strutturato: str | None = None
        if (not visita and _esterno_attivo() == "openai"
                and (_config_esterno() or {}).get("struttura") == "1"):
            fase = "struttura"
            _ = notifica and notifica(fase)
            testo_strutturato = struttura_standard(finale, file_id)

        fase = "estrazione"
        _ = notifica and notifica(fase)
        campi = estrai_campi(testo_integrale, file_id)
        percorso(".campi.json").write_text(
            json.dumps(campi, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        fase = "controlli"
        _ = notifica and notifica(fase)
        # Terzo orecchio sulle cifre (Parakeet): solo avvisi, mai correzioni.
        if PARAKEET_SWITCH.is_file() and not visita:
            avvisi.extend(controllo_cifre_parakeet(
                ingresso, percorso(".voxtral.wav"), finale, file_id))
        allarmi = controlla_valori(campi, testo_integrale, controlli, file_id)
        percorso(".allarmi.json").write_text(
            json.dumps(allarmi, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        # Tempi parola-per-parola per il testo sincronizzato: facoltativi,
        # mai bloccanti (senza, la pagina mostra il testo semplice).
        parole: list = []
        parole_audio: list = []
        durata_audio_originale = 0.0
        try:
            # Orologio PIENO della passata B (senza VAD): basta l'atempo.
            sonda = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=nw=1:nk=1", str(ingresso)],
                capture_output=True, text=True, timeout=60,
            )
            try:
                durata_audio_originale = float(sonda.stdout.strip())
            except ValueError:
                durata_audio_originale = 0.0
            seg_vad = _segmenti_vad(percorso(".wav")) if USA_VAD else []
            if seg_vad:
                parole_audio = parole_da_json(percorso(".json"))
                giuntura = _giuntura_vad(
                    seg_vad, parole_audio[-1][1] if parole_audio else 0.0)
                parole_audio = [
                    (w, _decompatta_su_segmenti(x, seg_vad, giuntura) * ATEMPO)
                    for w, x in parole_audio
                ]
                log.info(
                    "fase=tempi file=%s orologio=mappa_vad segmenti=%d giuntura=%.3f",
                    file_id, len(seg_vad), giuntura)
            else:
                # Ripiego (JSON della B assente): vecchio metodo ad ancore.
                parole_audio = parole_da_json(percorso(".json"))
                tempi_w = [x for _, x in parole_audio]
                anc_w = [tempi_w[i + 1] for i in range(len(tempi_w) - 1)
                         if tempi_w[i + 1] - tempi_w[i] > 1.5]
                anc_a, durata_orig = _ancore_audio(ingresso)
                coppie = _accoppia_ancore(anc_w, anc_a) if USA_VAD else []
                if len(coppie) >= 3:
                    parole_audio = _ritara_parole(parole_audio, coppie, durata_orig)
                elif ATEMPO != 1.0:
                    parole_audio = [(w, t * ATEMPO) for w, t in parole_audio]
            parole = allinea_parole(finale, parole_audio)
            log.info("fase=tempi file=%s esito=ok parole=%d", file_id, len(parole))
            # Rifinitura col ForcedAligner (interruttore ~/.referralflow-
            # aligner-tempi): il testo FINALE viene riallineato all'audio
            # naturale — le parole ritoccate dalla catena tornano inchiodate
            # al secondo giusto. Qualsiasi intoppo → tempi whisper di sempre.
            if ALIGNER_SWITCH.is_file() and not visita and parole:
                parole = rifinisci_tempi(
                    ingresso, percorso(".voxtral.wav"), parole, file_id)
        except Exception as e:
            log.info("fase=tempi file=%s esito=saltato tipo=%s", file_id, type(e).__name__)
        parole_grezzo: list = []
        if visita:
            # La nota di visita è un riassunto: le sue parole non combaciano
            # con la trascrizione, il testo sincronizzato si spegne (la
            # pagina mostra il testo semplice; l'audio resta riascoltabile).
            # I tempi allineati al GREZZO però si conservano (parole_grezzo):
            # servono alla memoria della visita per il «riascolta qui» sui
            # blocchi consultati.
            try:
                parole_grezzo = allinea_parole(grezzo_a, parole_audio)
            except Exception:
                parole_grezzo = []
            parole = []

        # Sentinella di troncamento: quando whisper «si incanta» in un loop,
        # spesso butta il resto dell'audio dentro il loop e la seconda metà
        # del dettato non viene mai trascritta. Qui si confronta la durata
        # del WAV con il tempo dell'ultima parola trascritta: se manca una
        # coda importante, la bozza arriva con un avviso ben visibile.
        # Solo segnalazione, mai blocco; facoltativa, mai bloccante.
        # (avvisi è creato in cima a elabora: qui si aggiunge soltanto.)
        try:
            # Coi tempi ritarati sulle ancore l'orologio è quello dell'audio
            # ORIGINALE: il confronto va fatto con la sua durata, non col WAV
            # rallentato (che è più lungo del 25%).
            durata_wav = (durata_audio_originale
                          if durata_audio_originale > 1
                          else _durata_wav_s(percorso(".wav")))
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
        # Visita: la nota strutturata (se ha superato le guardie), altrimenti
        # la trascrizione integrale; dettato classico: il testo di sempre.
        "tipo": "visita" if visita else "referto",
        "testo_corretto": nota_visita if nota_visita else finale,
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
        # Avvocato del diavolo + dettato grezzo (punto 6): la pagina di
        # revisione mostra le frasi non supportate col motivo e permette di
        # confrontare la bozza con ciò che è stato davvero trascritto.
        "frasi_non_supportate": frasi_non_supportate,
        "testo_grezzo": grezzo_a,
        # Trasparenza totale (2026-08-27, referto Qwen dal vivo: «REG→RAC»
        # applicata dalle guardie fonetiche ma sbagliata nel merito, e
        # l'avvocato tace sulle correzioni volute): OGNI scambio applicato
        # in automatico (lista AI + glossario fonetico) finisce in bozza,
        # e la revisione guidata li mostra uno a uno, annullabili.
        "riparazioni_applicate": [
            {"da": da, "a": a}
            for da, a in RIPARAZIONI_APPLICATE.get(file_id, [])[:80]
        ],
        "richiede_revisione": True,
    }
    if not visita and testo_strutturato:
        # Proposta nel formato standard dello studio (fase struttura):
        # in pagina si applica con un clic, mai da sola.
        payload["testo_strutturato"] = testo_strutturato
    if visita and parole_grezzo:
        # Tempi parola-per-parola della TRASCRIZIONE INTEGRALE della visita:
        # alimentano la memoria di consulto (blocchi con «riascolta qui»).
        payload["parole_grezzo"] = parole_grezzo
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
        # Le visite registrate portano il marcatore nel nome locale: da lì
        # elabora sceglie il binario della nota di visita (vedi _e_visita).
        marcatore = "visita-" if voce.get("tipo") == "visita" else ""
        destinazione = cartelle["ingresso"] / f"{_PREFISSO_PIATTAFORMA}{marcatore}{audio_id}{ext}"
        # Già scaricato (o già in lavorazione/archivio): non duplicare.
        occupato = any(
            any(c.glob(f"{_PREFISSO_PIATTAFORMA}*{audio_id}*"))
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
    """piattaforma-[visita-]<uuid>.<ext> → <uuid>; altrimenti None."""
    if not nome.startswith(_PREFISSO_PIATTAFORMA):
        return None
    resto = nome[len(_PREFISSO_PIATTAFORMA):]
    if resto.startswith("visita-"):
        resto = resto[len("visita-"):]
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
