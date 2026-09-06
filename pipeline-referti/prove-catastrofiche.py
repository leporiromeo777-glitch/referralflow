#!/usr/bin/env python3
"""Suite catastrofica (Ricerca 18 §18): ogni caso peggiore del documento
congelato in un test permanente sulle FUNZIONI PURE della catena. Niente
modelli, niente audio vero, niente file clinici: solo testo sintetico.
Gira in secondi con lo stesso Python del servizio; distribuisci.sh la
esegue prima di copiare la catena e si ferma se anche un solo caso fallisce.

Uso: python3.14 prove-catastrofiche.py            (exit 0 = tutto ok)
"""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from pathlib import Path

QUI = Path(__file__).resolve().parent
os.environ.setdefault("REFERTI_LOG_SILENZIOSO", "1")
spec = importlib.util.spec_from_file_location("pipeline", QUI / "pipeline.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)  # type: ignore[union-attr]
import logging  # noqa: E402

logging.getLogger().setLevel(logging.ERROR)
for nome in list(logging.Logger.manager.loggerDict):
    logging.getLogger(nome).setLevel(logging.ERROR)

ESITI: list[tuple[str, bool, str]] = []


def caso(nome: str):
    def deco(fn):
        try:
            fn()
            ESITI.append((nome, True, ""))
        except AssertionError as e:
            ESITI.append((nome, False, str(e) or "asserzione"))
        except Exception as e:  # noqa: BLE001
            ESITI.append((nome, False, f"{type(e).__name__}: {e}"))
        return fn
    return deco


# 1. Referto giusto, paziente sbagliato: legame audio↔bozza dal CONTENUTO e
#    guardia d'identità sulla fusione (lettera incollata vs dettato).
@caso("cross-patient report swap")
def _():
    with tempfile.TemporaryDirectory() as d:
        a, b, c = Path(d, "a.wav"), Path(d, "b.wav"), Path(d, "c.wav")
        a.write_bytes(b"RIFF" + b"\x01" * 4000)
        b.write_bytes(b"RIFF" + b"\x02" * 4000)
        c.write_bytes(b"RIFF" + b"\x01" * 4000)
        assert m.file_id_di(a) != m.file_id_di(b), "audio diversi con lo stesso id"
        assert m.file_id_di(a) == m.file_id_di(c), "stesso contenuto, id diverso"
    ok = m.identita_compatibile("Il signor Rossi Mario, nato il 03.05.1950, ...", "il signor Mario Rossi nato il 3.5.50")
    assert ok["esito"] == "uguale", ok
    ko = m.identita_compatibile("la signora Bianchi Anna, nata il 12.01.1961", "il signor Mario Rossi nato il 3.5.50")
    assert ko["esito"] == "diversa" and ko["motivo"] == "data di nascita", ko
    ko2 = m.identita_compatibile("la signora Bianchi Anna", "il signor Mario Rossi")
    assert ko2["esito"] == "diversa" and ko2["motivo"] == "cognome", ko2
    nv = m.identita_compatibile("Egregio collega, ti riferisco", "buongiorno, dettato senza nome")
    assert nv["esito"] == "non_verificabile", nv
    parole = m.identita_compatibile("nata il 3 marzo 1950, signora Verdi Lucia", "signora Lucia Verdi, nata il 03.03.1950")
    assert parole["esito"] == "uguale", parole


# 2. Audio incompleto: contenitore che promette più di quanto decodifica e
#    registrazione che finisce a metà parola.
@caso("truncated audio")
def _():
    e = m._analizza_integrita("", "max_volume: -3.0 dB\ntime=00:06:43.20 bitrate=N/A", "size=N/A time=00:00:03.00", 600.0)
    assert e["troncato_s"] > 190 and e["coda_parlata"] is True, e
    e2 = m._analizza_integrita("", "time=00:10:00.00", "silence_start: 1.8\nsilence_end: 3 | silence_duration: 1.2\ntime=00:00:03.00", 600.0)
    assert e2["troncato_s"] == 0.0 and e2["coda_parlata"] is False, e2
    e3 = m._analizza_integrita("", "time=00:10:00.00", "silence_start: 0.2\nsilence_end: 0.9 | silence_duration: 0.7\ntime=00:00:03.00", 600.0)
    assert e3["coda_parlata"] is True, e3  # dopo il silenzio si è ripreso a parlare fino alla fine
    e4 = m._analizza_integrita("frame corrotto\naltro errore\n", "time=00:10:00.00", "", 600.0)
    assert e4["errori_decodifica"] == 2, e4
    assert m.livello_verifica([], troncato=True) == "minimo"


# 3. A e B concordano ma sbagliano entrambi: il numero non sparisce mai dal
#    controllo — resta nella tabella dei numeri e nel punteggio.
@caso("A/B same wrong number")
def _():
    rischio, numeri = m.valuta_rischio_frasi("Frazione di eiezione 35%. Il paziente sta bene.", [], [], [], [], [], [], "prova-3")
    assert any(n["valore"] == "35" for n in numeri), numeri
    assert all(n["confermato"] is None for n in numeri), "senza secondo orecchio nessun numero può risultare confermato"
    mf = m.costruisci_manifesto({"errori_decodifica": 0}, True, True, False, "whisper", rischio, numeri, [], [], 0, [], "prova-3")
    assert mf["numeri"] == 1 and "terzo orecchio sui numeri" in mf["componenti_mancanti"], mf


# 4. Falso secondo testimone: B = whisper di nuovo → rischio in più e
#    indipendenza «bassa» nel manifesto.
@caso("whisper fallback masquerading as independent witness")
def _():
    con, _ = m.valuta_rischio_frasi("Frazione di eiezione 35%. Il paziente sta bene.", [], [], [], [], [], [], "prova-4a", b_indipendente=True)
    senza, _ = m.valuta_rischio_frasi("Frazione di eiezione 35%. Il paziente sta bene.", [], [], [], [], [], [], "prova-4b", b_indipendente=False)
    assert senza and any("non indipendente" in x for x in senza[0]["motivi"]), senza
    p_con = con[0]["punteggio"] if con else 0
    assert senza[0]["punteggio"] > p_con, (senza, con)
    mf = m.costruisci_manifesto({"errori_decodifica": 0}, False, True, True, "aligner", [], [], [], [], 0, [], "prova-4b")
    assert mf["indipendenza_testimoni"] == "bassa" and mf["livello_verifica"] == "ridotto", mf
    assert mf["testimoni"][1].startswith("whisper"), mf


# 5. Numeri giusti, concetti sbagliati: il multinsieme li lascia passare, il
#    lucchetto delle relazioni no (riscrittura, bella copia, paragrafo esame).
@caso("swapped clinical values")
def _():
    a = "FE 55%, gradiente medio 35 mmHg. PAPs 40 mmHg."
    b = "FE 35%, gradiente medio 55 mmHg. PAPs 40 mmHg."
    assert m._numeri(a) == m._numeri(b), "il caso deve essere invisibile alla firma numerica"
    ok, motivo = m.relazioni_intatte(a, b)
    assert not ok and motivo.startswith("misura"), (ok, motivo)
    assert m.relazioni_intatte(a, a.replace(".", ";"))[0] is True
    assert m._impronta_lettere(a) != m._impronta_lettere(b)
    ok2, _ = m.relazioni_intatte("Creatinina 95 µmol/l, eGFR 60.", "Creatinina 60 µmol/l, eGFR 95.")
    assert ok2 is False
    assert m._esame_relazioni_ok("ETT: FE 35%, PAPs 40 mmHg.", ["FE 55%"], "ETT: FE 55%, PAPs 40 mmHg.")[0] is True
    assert m._esame_relazioni_ok("ETT: FE 35%, PAPs 40 mmHg.", ["FE 55%"], "ETT: FE 40%, PAPs 55 mmHg.")[0] is False
    assert m._esame_relazioni_ok("ETT: FE 35%, PAPs 40 mmHg.", ["FE 55%"], "ETT: FE 35%, PAPs 40 mmHg.")[0] is False, "il valore vecchio è rimasto"
    # con la coda verbatim il valore nuovo è presente ma il vecchio resta nel paragrafo → no
    assert m._esame_relazioni_ok("ETT: FE 35%.", ["FE 55%"], "ETT: FE 35%.\n   ↳ Dettato inoltre: FE 55%")[0] is False


# 6. Punteggiatura che sposta il raggio di una negazione.
@caso("negation-scope drift")
def _():
    assert m._bella_copia_ammessa("non stenosi, insufficienza lieve", "Non stenosi, insufficienza lieve.") is True
    assert m._bella_copia_ammessa("non stenosi, insufficienza lieve", "Non stenosi insufficienza, lieve.") is False
    assert m._bella_copia_ammessa("senza dispnea né edemi, cammina", "Senza dispnea, né edemi cammina.") is False
    # senza negazione la virgola può muoversi (è il lavoro della bella copia)
    assert m._bella_copia_ammessa("ecg ritmo sinusale, 70 al minuto", "ECG: ritmo sinusale 70 al minuto.") is True


# 7. Lateralità: stessa regola dei confini + antonimi clinici.
@caso("laterality binding drift")
def _():
    assert m._bella_copia_ammessa("ipocinesia della parete inferiore, destra normale", "Ipocinesia della parete, inferiore destra normale.") is False
    assert m._ribaltamento_clinico("ventricolo destro", "ventricolo sinistro") is True
    assert m._ribaltamento_clinico("ipertensione", "ipotensione") is True
    assert m._ribaltamento_clinico("valvola mitrale", "valvola mitralica") is False


# 8. La lettera precedente vince sull'oggi.
@caso("previous-note stale value")
def _():
    var = [{"misura": "Frazione di eiezione", "prima": "35", "dopo": "55"}]
    assert m.esito_temporale(var, "ETT: FE 35%.")[0]["nella_lettera"] == "prima"
    assert m.esito_temporale(var, "ETT: FE 55%.")[0]["nella_lettera"] == "dopo"
    assert m.esito_temporale(var, "ETT (2024): FE 35%. Oggi FE 55%.")[0]["nella_lettera"] == "entrambi"
    assert m.esito_temporale(var, "Nessuna misura qui.")[0]["nella_lettera"] == "assente"
    v = m.variazioni_misure("FE 35%. PAPs 40 mmHg.", "FE 55%. PAPs 40 mmHg.")
    assert v and v[0]["misura"] == "Frazione di eiezione" and v[0]["grande"] is True, v


# 9. Segnaposto giusto, reinserimento sbagliato: ogni corsa ha la sua mappa.
@caso("wrong PII mapping namespace")
def _():
    testo = "Persona 1 visitata da [Medico 1] il [data 1]."
    a = m._ripristina(testo, {"Persona 1": "Rossi Mario", "[Medico 1]": "Dr. Bianchi", "[data 1]": "03.05.1950"})
    b = m._ripristina(testo, {"Persona 1": "Verdi Lucia", "[Medico 1]": "Dr. Neri", "[data 1]": "12.01.1961"})
    assert "Rossi" in a and "Verdi" not in a and "Verdi" in b and "Rossi" not in b
    assert "Persona" not in a and "[data" not in b
    assert isinstance(m._ANON_NOTI, dict), "cache dei segnaposto deve essere per id di file"


# 10. Evidenza (riascolta qui) con tempi coerenti: mai indietro, mai oltre l'audio.
@caso("wrong evidence timestamp")
def _():
    audio = [("controllo", 1.0), ("tra", 1.5), ("sei", 2.0), ("mesi", 2.5), ("cordarone", 4.0), ("duecento", 4.6)]
    parole = m.allinea_parole("Controllo tra sei mesi. Cordarone 200 mg.", audio)
    tempi = [float(p[1]) for p in parole if isinstance(p, (list, tuple)) and len(p) == 2]
    assert tempi, parole
    assert all(b >= a for a, b in zip(tempi, tempi[1:])), tempi
    assert max(tempi) <= 4.6 + 1e-6 and min(tempi) >= 0, tempi


# 11. Modalità degradata invisibile: il manifesto la rende esplicita.
@caso("degraded pipeline hidden from UI")
def _():
    assert m.livello_verifica([]) == "pieno"
    assert m.livello_verifica(["verificatore cloud"]) == "ridotto"
    assert m.livello_verifica(["secondo motore indipendente", "verificatore cloud"]) == "minimo"
    m._segna_trasporto("prova-11", "verificatore", "classico")
    mf = m.costruisci_manifesto({"errori_decodifica": 0}, True, False, True, "nessuno", [], [], [], [], 0, [], "prova-11")
    assert mf["modalita_degradata"] is True and mf["trasporti"].get("verificatore") == "classico", mf
    assert "tempi delle parole" in mf["componenti_mancanti"] and mf["verifica_cloud"] == "classica"
    pieno = m.costruisci_manifesto({"errori_decodifica": 0}, True, True, True, "aligner", [], [], [], [], 0, [], "prova-11b")
    assert pieno["livello_verifica"] == "pieno" and pieno["modalita_degradata"] is False
    for i in range(20):
        m._segna_trasporto(f"riempi-{i}", "x", "y")
    assert len(m._TRASPORTI) <= 12, "le tracce non devono crescere senza limite"


# 12. Il sistema impara il proprio errore: l'oro esportato è QA, mai
#     addestramento automatico.
@caso("self-reinforcing training promotion")
def _():
    testo = (QUI / "esporta-oro.sh").read_text(encoding="utf-8")
    assert "idoneo_addestramento: no" in testo, "manca il marcatore di quarantena nell'export dell'oro"


# 13. Fornitori: solo la lista autorizzata (Ricerca 17 §6, ribadita qui).
@caso("unauthorized cloud provider")
def _():
    assert m._fornitore_autorizzato("https://api.infomaniak.com/1/ai/x/openai/v1/chat/completions") is True
    assert m._fornitore_autorizzato("https://api.openai.com/v1/chat/completions") is False
    assert m._fornitore_autorizzato("http://api.infomaniak.com/") is False


# 14. Stato per referto: le tabelle in RAM non si mescolano tra corse.
@caso("stale state across runs")
def _():
    m._CIFRE_SENTITE["prova-14a"] = {"35"}
    _, numeri_b = m.valuta_rischio_frasi("FE 35%.", [], [], [], [], [], [], "prova-14b")
    assert numeri_b[0]["confermato"] is None, "le cifre sentite di un altro referto non devono confermare questo"
    _, numeri_a = m.valuta_rischio_frasi("FE 35%.", [], [], [], [], [], [], "prova-14a")
    assert numeri_a[0]["confermato"] is True
    m._CIFRE_SENTITE.pop("prova-14a", None)


def main() -> int:
    larg = max(len(n) for n, _, _ in ESITI)
    ko = 0
    for nome, ok, dettaglio in ESITI:
        print(f"{'OK ' if ok else 'ERR'}  {nome.ljust(larg)}  {dettaglio}")
        ko += 0 if ok else 1
    print(f"\nsuite catastrofica: {len(ESITI) - ko}/{len(ESITI)} casi superati")
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main())
