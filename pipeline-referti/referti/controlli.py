"""Fase 6 — controlli numerici sugli intervalli di correzioni.json
(SPEC §3 [10]). Producono ALLARMI, mai correzioni (SPEC §2.4)."""

import re

_NUMERO = re.compile(r"-?\d+(?:[.,]\d+)?")

# Un valore entro questa frazione dell'ampiezza dell'intervallo dai bordi
# è segnalato come "limite". Sovrascrivibile da correzioni.json.
MARGINE_LIMITE_PCT_DEFAULT = 15


def _estrai_numero(valore):
    if isinstance(valore, (int, float)) and not isinstance(valore, bool):
        return float(valore)
    if isinstance(valore, str):
        trovato = _NUMERO.search(valore)
        if trovato:
            return float(trovato.group().replace(",", "."))
        return None
    if isinstance(valore, dict):
        for chiave in ("valore", "value"):
            if chiave in valore:
                return _estrai_numero(valore[chiave])
    return None


def _normalizza_chiave(chiave):
    return re.sub(r"[^a-z0-9]+", "_", chiave.strip().lower()).strip("_")


def controlla(valori_numerici, intervalli, margine_pct=None):
    """Confronta i valori estratti con gli intervalli configurati.

    Restituisce la lista allarmi_numerici (SPEC §8): solo i valori fuori
    intervallo, al limite, o illeggibili. Nessun valore viene modificato."""
    if margine_pct is None:
        margine_pct = MARGINE_LIMITE_PCT_DEFAULT
    if not isinstance(valori_numerici, dict):
        return []
    indice = {_normalizza_chiave(k): (k, v) for k, v in intervalli.items()}
    allarmi = []
    for campo, valore in valori_numerici.items():
        voce = indice.get(_normalizza_chiave(campo))
        if voce is None:
            continue
        _, limiti = voce
        minimo, massimo = limiti.get("min"), limiti.get("max")
        if minimo is None or massimo is None:
            continue
        numero = _estrai_numero(valore)
        etichetta = f"{minimo}-{massimo}"
        if numero is None:
            allarmi.append({
                "campo": campo, "valore": valore,
                "intervallo": etichetta, "stato": "illeggibile",
            })
            continue
        margine = (massimo - minimo) * margine_pct / 100.0
        if numero < minimo or numero > massimo:
            stato = "fuori"
        elif numero < minimo + margine or numero > massimo - margine:
            stato = "limite"
        else:
            continue
        allarmi.append({
            "campo": campo,
            "valore": numero if numero != int(numero) else int(numero),
            "intervallo": etichetta,
            "stato": stato,
        })
    return allarmi
