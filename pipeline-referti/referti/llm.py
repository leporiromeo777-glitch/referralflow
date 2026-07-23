"""Fasi 5-6 — chiamate a gemma3:12b via Ollama locale (SPEC §3 [7][8][9]).

Correzione, ispezione (solo elenco, nessuna modifica) ed estrazione campi.
La guardia numerica scarta la correzione LLM se ha toccato un numero:
il sistema può segnalare un numero sospetto, mai cambiarlo (SPEC §2.4)."""

import json
import re
import time
import urllib.error
import urllib.request
from collections import Counter

from .config import OLLAMA_MODEL, OLLAMA_TIMEOUT, OLLAMA_URL, verifica_ollama_locale
from .errori import ErroreFase
from .prompts import PROMPT_CORREZIONE, PROMPT_ESTRAZIONE, PROMPT_ISPEZIONE

_NUMERO = re.compile(r"\d+(?:[.,]\d+)?")


def _chiama(prompt, formato_json=False):
    """Una chiamata a Ollama: 3 tentativi con backoff, timeout 300 s (SPEC §7)."""
    verifica_ollama_locale()
    corpo = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0},
    }
    if formato_json:
        corpo["format"] = "json"
    dati = json.dumps(corpo).encode("utf-8")
    ultimo_errore = "sconosciuto"
    for tentativo in range(3):
        if tentativo:
            time.sleep(2 ** tentativo)
        richiesta = urllib.request.Request(
            OLLAMA_URL.rstrip("/") + "/api/generate",
            data=dati,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(richiesta, timeout=OLLAMA_TIMEOUT) as risposta:
                return json.loads(risposta.read().decode("utf-8"))["response"]
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            ultimo_errore = type(exc).__name__
        except (KeyError, json.JSONDecodeError) as exc:
            ultimo_errore = type(exc).__name__
    raise ErroreFase("ollama", f"nessuna risposta dopo 3 tentativi ({ultimo_errore})")


def _impronta_numerica(testo):
    """Multinsieme dei numeri nel testo, con la virgola normalizzata a punto."""
    return Counter(n.replace(",", ".") for n in _NUMERO.findall(testo))


def correggi(testo):
    """Correzione LLM (§6.1) con guardia numerica.

    Restituisce (testo_corretto, nota). Se il modello ha alterato anche un
    solo numero, la correzione viene scartata per intero e si tiene il testo
    di partenza, con una nota per il revisore."""
    risposta = _chiama(PROMPT_CORREZIONE.replace("{testo}", testo)).strip()
    if not risposta:
        return testo, "correzione LLM vuota: mantenuto il testo precedente"
    if _impronta_numerica(risposta) != _impronta_numerica(testo):
        return testo, (
            "correzione LLM scartata: avrebbe modificato un numero (vincolo §2.4)"
        )
    return risposta, None


def ispeziona(testo):
    """Ispezione LLM (§6.2): elenco dei segmenti dubbi, nessuna modifica."""
    risposta = _chiama(PROMPT_ISPEZIONE.replace("{testo}", testo)).strip()
    if risposta.lower() == "nessuno":
        return []
    segmenti = []
    for riga in risposta.splitlines():
        riga = riga.strip()
        if not riga or riga.lower() == "nessuno":
            continue
        segmenti.append(riga.lstrip("-*•").strip())
    return segmenti


def estrai(testo):
    """Estrazione campi (§6.3) in modalità format: json.

    JSON non parsabile: riprova 1 volta, poi errore (SPEC §7.2)."""
    prompt = PROMPT_ESTRAZIONE.replace("{testo}", testo)
    for tentativo in range(2):
        risposta = _chiama(prompt, formato_json=True)
        try:
            campi = json.loads(risposta)
            if isinstance(campi, dict):
                return campi
        except json.JSONDecodeError:
            pass
    raise ErroreFase("estrazione", "JSON non parsabile dopo 2 tentativi")
