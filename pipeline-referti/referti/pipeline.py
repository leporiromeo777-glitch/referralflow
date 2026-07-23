"""Orchestratore della catena (SPEC §3). Flusso lineare ed esplicito,
nessun framework (SPEC §4).

Percorso di un file:
  ingresso/ → lavorazione/ (rinominato col solo file_id: il nome originale
  può contenere il nome del paziente e non deve mai finire nei log) →
  elaborazione fasi 2-10 → output/<file_id>.json + audio originale in
  archivio_temp/ → dopo il salvataggio riuscito nel DB, cancellazione
  sicura di audio e JSON (SPEC §2.3).

Un file che fallisce non blocca la coda: va in errori/ con un .log
accanto (SPEC §7.1)."""

import datetime
import json
import shutil
import time
import uuid

from . import audio, controlli, divergenze, dizionario, llm, salvataggio, trascrizione
from .cancellazione import cancella_intermedi, cancella_sicuro
from .config import (
    BASE,
    CORREZIONI,
    DIR_ARCHIVIO,
    DIR_ERRORI,
    DIR_LAVORAZIONE,
    DIR_OUTPUT,
    SOGLIA_DISCO_LIBERO,
)
from .errori import DiscoPieno, ErroreFase
from .logsetup import critico, evento

FASE_PREPROCESSING = 1
FASE_TRASCRIZIONE = 2
FASE_CONFRONTO = 3
FASE_DIZIONARIO = 4
FASE_LLM = 5
FASE_ESTRAZIONE = 6


def controlla_disco():
    if shutil.disk_usage(BASE).free < SOGLIA_DISCO_LIBERO:
        critico("disco quasi pieno: pipeline ferma (SPEC §7.2)")
        raise DiscoPieno()


def _misura(file_id, fase, funzione, *argomenti):
    inizio = time.monotonic()
    try:
        risultato = funzione(*argomenti)
    except ErroreFase as exc:
        evento(file_id, fase, "errore", time.monotonic() - inizio, exc.motivo)
        raise
    evento(file_id, fase, "ok", time.monotonic() - inizio)
    return risultato


def _in_errore(file_id, audio_lavorazione, exc):
    """Sposta l'audio in errori/ con un log accanto; gli intermedi
    (wav, txt: contengono dati clinici) vengono cancellati in modo sicuro."""
    try:
        # Prima si mette in salvo l'audio (in caso di errore NON si cancella,
        # SPEC §2.3), poi si eliminano gli intermedi clinici.
        if audio_lavorazione.exists():
            shutil.move(str(audio_lavorazione), DIR_ERRORI / audio_lavorazione.name)
        cancella_intermedi(DIR_LAVORAZIONE, file_id + ".")
        (DIR_ERRORI / (file_id + ".log")).write_text(
            f"{datetime.datetime.now().isoformat()} fase={exc.fase} motivo={exc.motivo}\n",
            encoding="utf-8",
        )
    except OSError:
        pass


def elabora(percorso_ingresso, fino_a_fase=FASE_ESTRAZIONE):
    """Elabora un singolo file audio fino alla fase indicata (1-6).

    Con fino_a_fase < 6 il file resta in lavorazione/ per il collaudo
    manuale fase-per-fase (SPEC §9); a catena completa produce il JSON in
    output/ e mette l'audio in archivio_temp/. Restituisce il percorso
    dell'ultimo artefatto prodotto."""
    controlla_disco()
    file_id = uuid.uuid4().hex[:12]
    audio_lavorazione = DIR_LAVORAZIONE / (file_id + percorso_ingresso.suffix.lower())
    shutil.move(str(percorso_ingresso), audio_lavorazione)
    evento(file_id, "ingresso", "ok")

    try:
        # [2] preprocessing
        wav = DIR_LAVORAZIONE / (file_id + ".pulito.wav")
        _misura(file_id, "preprocessing", audio.preprocessa, audio_lavorazione, wav)
        if fino_a_fase < FASE_TRASCRIZIONE:
            return wav

        # [3][4] doppia trascrizione
        testo_a = _misura(
            file_id, "trascrizione_a", trascrizione.trascrivi,
            wav, DIR_LAVORAZIONE / (file_id + ".a"), trascrizione.PARAMETRI_A,
        )
        if fino_a_fase < FASE_CONFRONTO:
            return DIR_LAVORAZIONE / (file_id + ".a.txt")
        testo_b = _misura(
            file_id, "trascrizione_b", trascrizione.trascrivi,
            wav, DIR_LAVORAZIONE / (file_id + ".b"), trascrizione.PARAMETRI_B,
        )

        # [5] confronto: rilevatore di dubbi, mai un voto
        lista_divergenze = _misura(file_id, "confronto", divergenze.confronta, testo_a, testo_b)
        if fino_a_fase < FASE_DIZIONARIO:
            return DIR_LAVORAZIONE / (file_id + ".b.txt")

        # [6] dizionario deterministico
        correzioni = _misura(file_id, "dizionario", dizionario.carica, CORREZIONI)
        testo, n_sostituzioni = dizionario.applica(testo_a, correzioni.get("sostituzioni", {}))
        evento(file_id, "dizionario", "ok", dettaglio=f"sostituzioni={n_sostituzioni}")
        note_pipeline = []
        if fino_a_fase < FASE_LLM:
            percorso = DIR_LAVORAZIONE / (file_id + ".dizionario.txt")
            percorso.write_text(testo, encoding="utf-8")
            return percorso

        # [7] correzione LLM (con guardia numerica) e [8] ispezione
        testo, nota = _misura(file_id, "correzione_llm", llm.correggi, testo)
        if nota:
            note_pipeline.append(nota)
            evento(file_id, "correzione_llm", "ok", dettaglio="correzione scartata dalla guardia numerica")
        segmenti_dubbi = _misura(file_id, "ispezione_llm", llm.ispeziona, testo)
        if fino_a_fase < FASE_ESTRAZIONE:
            percorso = DIR_LAVORAZIONE / (file_id + ".corretto.txt")
            percorso.write_text(testo, encoding="utf-8")
            return percorso

        # [9] estrazione campi e [10] controlli numerici
        campi = _misura(file_id, "estrazione", llm.estrai, testo)
        allarmi = controlli.controlla(
            campi.get("valori_numerici"),
            correzioni.get("intervalli_numerici", {}),
            correzioni.get("margine_limite_pct"),
        )
        evento(file_id, "controlli_numerici", "ok", dettaglio=f"allarmi={len(allarmi)}")

        payload = {
            "file_id": file_id,
            "timestamp": datetime.datetime.now().astimezone().isoformat(),
            "testo_corretto": testo,
            "campi_estratti": campi,
            "divergenze": lista_divergenze,
            "segmenti_dubbi": segmenti_dubbi,
            "allarmi_numerici": allarmi,
            # Sempre true: non esiste un percorso senza revisione umana (SPEC §8).
            "richiede_revisione": True,
            "note_pipeline": note_pipeline,
            "nome_file_originale": percorso_ingresso.name,
        }
        json_uscita = DIR_OUTPUT / (file_id + ".json")
        json_uscita.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        # Audio in attesa di conferma del salvataggio; intermedi clinici via.
        shutil.move(str(audio_lavorazione), DIR_ARCHIVIO / audio_lavorazione.name)
        cancella_intermedi(DIR_LAVORAZIONE, file_id + ".")
        evento(file_id, "elaborazione", "ok")
        return json_uscita

    except ErroreFase as exc:
        _in_errore(file_id, audio_lavorazione, exc)
        return None


def invia_pendenti():
    """Fase 8 — invio dei JSON in output/ a ReferralFlow.

    Solo dopo il salvataggio riuscito: cancellazione sicura dell'audio in
    archivio_temp/ e del JSON (SPEC §2.3, §3 [12]). Se il DB non è
    raggiungibile, tutto resta dov'è e si riprova al ciclo successivo."""
    for json_uscita in sorted(DIR_OUTPUT.glob("*.json")):
        file_id = json_uscita.stem
        try:
            payload = json.loads(json_uscita.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            evento(file_id, "invio", "errore", dettaglio="json illeggibile")
            shutil.move(str(json_uscita), DIR_ERRORI / json_uscita.name)
            continue
        inizio = time.monotonic()
        try:
            salvataggio.salva(payload)
        except ErroreFase as exc:
            evento(file_id, "invio", "rinviato", time.monotonic() - inizio, exc.motivo)
            continue
        evento(file_id, "invio", "ok", time.monotonic() - inizio)
        cancella_intermedi(DIR_ARCHIVIO, file_id)
        cancella_sicuro(json_uscita)
        evento(file_id, "cancellazione_audio", "ok")
