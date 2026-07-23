"""Fase 4 — sostituzioni deterministiche da correzioni.json (SPEC §3 [6]).

Le sostituzioni non possono toccare i numeri (SPEC §2.4): qualsiasi voce
che contenga cifre viene rifiutata al caricamento della configurazione."""

import json
import re

from .errori import ErroreFase


def carica(percorso):
    """Carica e valida correzioni.json. Restituisce il dict completo."""
    if not percorso.exists():
        raise ErroreFase(
            "dizionario",
            "correzioni.json mancante (vedi correzioni.esempio.json)",
        )
    try:
        dati = json.loads(percorso.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise ErroreFase("dizionario", "correzioni.json non è JSON valido")

    sostituzioni = dati.get("sostituzioni", {})
    if not isinstance(sostituzioni, dict):
        raise ErroreFase("dizionario", "campo sostituzioni non valido")
    for errato, corretto in sostituzioni.items():
        if not isinstance(corretto, str):
            raise ErroreFase("dizionario", "sostituzione con valore non testuale")
        if any(c.isdigit() for c in errato + corretto):
            raise ErroreFase(
                "dizionario",
                "una sostituzione contiene cifre: vietato dal vincolo §2.4",
            )
    intervalli = dati.get("intervalli_numerici", {})
    if not isinstance(intervalli, dict):
        raise ErroreFase("dizionario", "campo intervalli_numerici non valido")
    return dati


def applica(testo, sostituzioni):
    """Applica le sostituzioni a parola intera, senza distinguere maiuscole.

    Restituisce (testo, numero di sostituzioni applicate)."""
    applicate = 0
    for errato, corretto in sostituzioni.items():
        schema = re.compile(r"\b" + re.escape(errato) + r"\b", re.IGNORECASE)
        testo, n = schema.subn(corretto, testo)
        applicate += n
    return testo, applicate
