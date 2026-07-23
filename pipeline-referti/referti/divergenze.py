"""Fase 3 — confronto tra le due trascrizioni (SPEC §3 [5]).

Individua i punti dove A e B divergono. Nessuna scelta automatica:
entrambe le versioni vengono mostrate all'utente."""

import difflib
import string

_PUNTEGGIATURA = string.punctuation + "«»“”’…"


def _normalizza(parola):
    return parola.strip(_PUNTEGGIATURA).lower()


def confronta(testo_a, testo_b):
    parole_a = testo_a.split()
    parole_b = testo_b.split()
    sm = difflib.SequenceMatcher(
        a=[_normalizza(p) for p in parole_a],
        b=[_normalizza(p) for p in parole_b],
        autojunk=False,
    )
    divergenze = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        contesto = " ".join(parole_a[max(0, i1 - 4):min(len(parole_a), i2 + 4)])
        divergenze.append({
            "posizione": f"parole {i1 + 1}-{max(i2, i1 + 1)} della trascrizione A",
            "versione_a": " ".join(parole_a[i1:i2]) or "(assente)",
            "versione_b": " ".join(parole_b[j1:j2]) or "(assente)",
            "contesto": contesto,
        })
    return divergenze
