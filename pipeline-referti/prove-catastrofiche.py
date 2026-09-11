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
import json
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
    e = m._analizza_integrita("", "mean_volume: -20.0 dB\nmax_volume: -3.0 dB\ntime=00:06:43.20 bitrate=N/A", "mean_volume: -19.0 dB", 600.0)
    assert e["troncato_s"] > 190 and e["coda_parlata"] is True, e
    e2 = m._analizza_integrita("", "mean_volume: -20.0 dB\ntime=00:10:00.00", "mean_volume: -45.0 dB", 600.0)
    assert e2["troncato_s"] == 0.0 and e2["coda_parlata"] is False, e2
    # rumore di fondo di un dittafono rumoroso (-31 dB su parlato a -20): NON è coda parlata
    e3 = m._analizza_integrita("", "mean_volume: -20.0 dB\ntime=00:10:00.00", "mean_volume: -31.0 dB", 600.0)
    assert e3["coda_parlata"] is False, e3
    e5 = m._analizza_integrita("", "mean_volume: -20.0 dB\ntime=00:00:15.00", "mean_volume: -19.0 dB", 15.0)
    assert e5["coda_parlata"] is False, "sotto i 20 s non si giudica la coda"
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


# 15. Profili per medico (2026-09-07): il marcatore nel nome del file deve
# essere letto e tolto correttamente su entrambi gli ingressi, un profilo
# sconosciuto non deve cambiare la catena, e il rallentamento deve seguire
# il medico (o l'ambiente, se forzato).
@caso("doctor marker in file names")
def _():
    uuid = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"
    assert m._medico_da_nome("medico-moccetti--dettato.m4a") == "moccetti"
    assert m._medico_da_nome("piattaforma-medico-moschovitis--" + uuid + ".m4a") == "moschovitis"
    assert m._medico_da_nome("piattaforma-visita-medico-moccetti--" + uuid + ".m4a") == "moccetti"
    assert m._medico_da_nome("dettato.m4a") is None
    assert m._medico_da_nome("medico-Rossi--x.m4a") is None, "maiuscole = marcatore non valido"
    assert m._audio_id_da_nome("piattaforma-medico-moccetti--" + uuid + ".m4a") == uuid
    assert m._audio_id_da_nome("piattaforma-visita-medico-moccetti--" + uuid + ".m4a") == uuid
    assert m._audio_id_da_nome("piattaforma-" + uuid + ".m4a") == uuid
    assert m._e_visita("piattaforma-visita-medico-moccetti--" + uuid + ".m4a")
    assert not m._e_visita("piattaforma-medico-moccetti--" + uuid + ".m4a")


@caso("doctor profile drives atempo, unknown doctor stays default")
def _():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d, "medici.json")
        p.write_text('{"medici": [{"id": "lento", "nome": "Dr. Lento", "atempo": 0.7, "modalita": "aggiornamento"},'
                     ' {"id": "ro tto", "atempo": 0.7}, {"id": "fuori", "atempo": 3}, {"id": "lento", "atempo": 0.9}]}',
                     encoding="utf-8")
        vecchio, vecchio_env = m.PERCORSO_MEDICI, m.ATEMPO_ENV
        try:
            m.PERCORSO_MEDICI = p
            m.ATEMPO_ENV = None
            medici = m.carica_medici()
            assert [x["id"] for x in medici] == ["lento"], medici
            assert medici[0]["modalita"] == "aggiornamento"
            prof = m._imposta_corsa("lento")
            assert prof and abs(m.atempo_corsa() - 0.7) < 1e-9, m.atempo_corsa()
            assert m._imposta_corsa("ignoto") is None and abs(m.atempo_corsa() - m.ATEMPO) < 1e-9
            assert m._imposta_corsa(None) is None and abs(m.atempo_corsa() - m.ATEMPO) < 1e-9
            # Ambiente forzato (esperimenti): vince sul profilo.
            m.ATEMPO_ENV = "0.9"
            m._imposta_corsa("lento")
            assert abs(m.atempo_corsa() - m.ATEMPO) < 1e-9
        finally:
            m.PERCORSO_MEDICI, m.ATEMPO_ENV = vecchio, vecchio_env
            m._imposta_corsa(None)


@caso("doctor dictionary never carries digits")
def _():
    with tempfile.TemporaryDirectory() as d:
        base = Path(d).resolve()  # su macOS /var → /private/var: si confronta il percorso risolto
        (base / "medici.json").write_text('{"medici": [{"id": "uno", "correzioni": "correzioni-uno.json"}]}', encoding="utf-8")
        vecchio_med, vecchio_file = m.PERCORSO_MEDICI, m.__file__
        try:
            m.PERCORSO_MEDICI = base / "medici.json"
            # _file_medico cerca accanto allo script: si simula spostando __file__.
            (base / "pipeline.py").write_text("", encoding="utf-8")
            m.__file__ = str(base / "pipeline.py")
            (base / "correzioni-uno.json").write_text(
                '{"termini_clinici": {"sensuale": "sinusale", "fe 35": "FE 40"}}', encoding="utf-8")
            assert m._file_medico("uno", "correzioni") == base / "correzioni-uno.json"
            assert m._file_medico("uno", "vocabolario") is None
            assert m._file_medico("due", "correzioni") is None
            sost = m.carica_sostituzioni("uno")
            nuove = {s for _, s in sost}
            assert "sinusale" in nuove and "FE 40" not in nuove, "una coppia con cifre è entrata nel dizionario"
        finally:
            m.PERCORSO_MEDICI, m.__file__ = vecchio_med, vecchio_file


# 18. Doppioni (2026-09-07): via solo le ripetizioni sicure; le frasi che
# somigliano ma dicono cose diverse restano; gli oggetti protetti bloccano.
@caso("duplicate removal keeps look-alike sentences")
def _():
    t = ("Il paziente sta bene e l'ECG non mostra particolarità, in linea con la mia lettera del 1 settembre. "
         "Come da mio rapporto operatorio del 1 settembre 2026, prevedo una risonanza fra 3-4 settimane. "
         "Nel frattempo la terapia rimane invariata. Nel frattempo la terapia rimane invariata. "
         "Cordiali saluti.")
    nuovo, tolti, dubbi = m.togli_doppioni(t, "prova-18", usa_ai=False)
    assert len(tolti) == 1 and "terapia rimane invariata" in tolti[0]["tolta"], tolti
    assert nuovo.count("terapia rimane invariata") == 1
    assert "lettera del 1 settembre" in nuovo and "rapporto operatorio del 1 settembre 2026" in nuovo, "le due frasi del 1 settembre devono restare"
    assert m._numeri(nuovo) == m._numeri(t), "un doppione tolto non deve cambiare la firma numerica"


@caso("duplicate removal: protected object blocks, self-correction wins")
def _():
    # Quasi identiche ma la seconda porta un numero in più: NON si toglie, si segnala.
    t = "La frazione di eiezione è conservata. La frazione di eiezione è conservata, 55%. Fine."
    nuovo, tolti, dubbi = m.togli_doppioni(t, "prova-18b", usa_ai=False)
    assert not tolti and nuovo == t, (tolti, nuovo)
    # Stessa frase due volte con lo stesso numero: la seconda va via.
    t2 = "La frazione di eiezione è del 55%. La frazione di eiezione è del 55%. Fine della storia clinica."
    nuovo2, tolti2, _d = m.togli_doppioni(t2, "prova-18c", usa_ai=False)
    assert len(tolti2) == 1 and nuovo2.count("55%") == 1
    # Autocorrezione senza numeri: vince la seconda, senza marcatore.
    t3 = "Il paziente assume la terapia al mattino. Anzi, il paziente assume la terapia alla sera. Controllo tra sei mesi."
    nuovo3, tolti3, _d3 = m.togli_doppioni(t3, "prova-18d", usa_ai=False)
    assert len(tolti3) == 1 and "al mattino" not in nuovo3 and nuovo3.startswith("Il paziente assume la terapia alla sera"), nuovo3
    # Autocorrezione CON numeri diversi: non si applica, si segnala.
    t4 = "La frazione di eiezione è del 45%. Anzi, la frazione di eiezione è del 55%. Controllo tra sei mesi."
    nuovo4, tolti4, dubbi4 = m.togli_doppioni(t4, "prova-18e", usa_ai=False)
    assert not tolti4 and nuovo4 == t4 and dubbi4, (tolti4, dubbi4)
    # Negazione: «non» presente solo nella tolta blocca.
    t5 = "Il soffio è presente. Il soffio non è presente. Fine della visita odierna."
    nuovo5, tolti5, _d5 = m.togli_doppioni(t5, "prova-18f", usa_ai=False)
    assert not tolti5 and nuovo5 == t5


@caso("20 · passata A collassata: la sentinella A-vs-B la vede")
def _prova_20() -> None:
    # Il caso vero del 2026-09-07: 289 s di dettato, whisper 600 caratteri,
    # Voxtral 3'084, e la bozza è arrivata in pagina senza un avviso.
    assert m.collasso_a_vs_b(600, 3084)
    # Un dettato lungo con la A a metà: collasso.
    assert m.collasso_a_vs_b(1000, 3000)
    # Differenze normali tra due motori: NON è un collasso.
    assert not m.collasso_a_vs_b(3000, 3300)
    assert not m.collasso_a_vs_b(1000, 1500)
    # Testi cortissimi (dettato di pochi secondi): mai allarme.
    assert not m.collasso_a_vs_b(100, 380)
    # La A più lunga della B non è mai un collasso della A.
    assert not m.collasso_a_vs_b(3084, 600)


@caso("21 · collasso della A: verifica al livello minimo")
def _prova_21() -> None:
    assert m.livello_verifica(["trascrizione principale completa"]) == "minimo"
    assert m.livello_verifica(["verificatore cloud"]) == "ridotto"
    assert m.livello_verifica([]) == "pieno"


@caso("22 · riga di sola punteggiatura ricucita alla frase prima")
def _prova_22() -> None:
    # Il «virgola» dettato a inizio segmento lasciava una riga con la sola
    # virgola: nel wizard diventava una frase vuota che si agganciava a
    # TUTTE le segnalazioni (schede senza testo, 2026-09-07).
    t = "Il paziente sta bene\n,\nla terapia resta invariata."
    assert m.ricuci_punteggiatura_orfana(t) == "Il paziente sta bene,\nla terapia resta invariata."
    # Righe normali intatte, righe vuote intatte.
    t2 = "Prima riga.\n\nSeconda riga."
    assert m.ricuci_punteggiatura_orfana(t2) == t2
    # Niente riga prima: la punteggiatura orfana resta dov'è (non si perde).
    t3 = ",\nTesto."
    assert m.ricuci_punteggiatura_orfana(t3) == t3
    # Nessuna frase del wizard può ridursi a nulla.
    frasi = m._spezza_frasi_wizard(m.ricuci_punteggiatura_orfana(t))
    assert all(any(c.isalnum() for c in f) for f in frasi), frasi


@caso("23 · divergenze che cambiano il senso marcate come pesanti")
def _prova_23() -> None:
    # Il caso vero: «diminuiti» sentito solo dalla passata B.
    assert m.parole_pesanti("profili pressori", "profili pressori diminuiti") == ["diminuiti"]
    # Negazione da una parte sola, lateralità, numero.
    assert "non" in m.parole_pesanti("il soffio è presente", "il soffio non è presente")
    assert m.parole_pesanti("arteria destra", "arteria sinistra")
    assert "135" in m.parole_pesanti("pressione 135", "pressione 130")
    # Differenze di sole parole neutre: nessun peso.
    assert m.parole_pesanti("il paziente riferisce", "la paziente riferiva") == []
    # La marcatura arriva nelle divergenze, col contesto spezzato in prima/dopo
    # (serve al tasto «ha ragione B» per inserire al posto giusto).
    div = m.confronta("i profili pressori associati ad astenia",
                      "i profili pressori diminuiti associati ad astenia")
    assert any(d.get("pesanti") for d in div), div
    d0 = div[0]
    assert d0["versione_a"] == "" and d0["versione_b"] == "diminuiti", d0
    assert d0["contesto_prima"].endswith("pressori") and d0["contesto_dopo"].startswith("associati"), d0


@caso("24 · «barra» dettata diventa / e le omissioni tornano pulite")
def _prova_24() -> None:
    t, n = m.punteggiatura_dettata("vena su RPLA barra RIVP")
    assert "RPLA/RIVP" in t, t
    # Le frasi omesse portano la versione pulita: chi le rimette nel referto
    # non si ritrova la punteggiatura scritta a parole (2026-09-08).
    grezzo = "Il paziente sta bene. Tabagismo pregresso tra parentesi stoppa due punti cumulativo chiusa parentesi virgola."
    finale = "Il paziente sta bene."
    omesse = m.rileva_omissioni(grezzo, finale, [], [], "prova-24", [])
    assert omesse, omesse
    pulita = omesse[0].get("pulita", omesse[0]["frase"])
    assert "due punti" not in pulita and "chiusa parentesi" not in pulita, pulita


@caso("25 · buco nel mezzo della passata A: numeri solo in B o motore incantato")
def _prova_25() -> None:
    # Caso vero 2026-09-09: lunghezze simili, ma 8 numeri su 15 solo in B.
    a = "Il paziente sta bene e la terapia resta invariata. Controllo fra 6 mesi. Valori 120 e 80."
    b = "Il paziente sta bene, pressione 135 su 85, frequenza 70, peso 84 chili per 174 cm. Controllo fra 6 mesi. Valori 120 e 80."
    assert m.motivo_buco_in_a(a, b, rimosse_a=0, righe_a=10) == "numeri"
    # Motore incantato: molte righe tolte dall'anti-loop.
    assert m.motivo_buco_in_a(b, b, rimosse_a=21, righe_a=30) == "loop"
    # Accordo normale: nessun motivo.
    assert m.motivo_buco_in_a(b, b, rimosse_a=1, righe_a=30) is None
    # La corsa di recupero vince solo se concorda di più col testimone.
    assert m.accordo_con_b(b, b) > m.accordo_con_b(a, b)
    assert m.collasso_a_vs_b(600, 3084)


@caso("26 · testimone promosso: base Voxtral, verifica ridotta e non minima")
def _prova_26() -> None:
    m._TESTIMONE_PROMOSSO.add("prova-26"); m._COLLASSO_A.add("prova-26")
    mf = m.costruisci_manifesto({}, True, True, True, "aligner", [], [], [], [], 0, [], "prova-26")
    assert mf["testimoni"][0].startswith("voxtral"), mf["testimoni"]
    assert "primo motore completo (base: secondo motore)" in mf["componenti_mancanti"]
    assert mf["livello_verifica"] == "ridotto", mf["livello_verifica"]
    m._TESTIMONE_PROMOSSO.discard("prova-26"); m._COLLASSO_A.discard("prova-26")
    m._COLLASSO_A.add("prova-26b")
    assert m.costruisci_manifesto({}, True, True, True, "aligner", [], [], [], [], 0, [], "prova-26b")["livello_verifica"] == "minimo"
    m._COLLASSO_A.discard("prova-26b")


@caso("27 · contesto per medico nel prompt di correzione: dati, con tetto, mai cifre")
def _prova_27() -> None:
    m._CORSA["medico"] = "moccetti"
    try:
        c = m.contesto_medico("moccetti")
        assert c.startswith("CONTESTO DEL MEDICO"), c[:40]
        assert "anamnesi" in c and "RIVA" in c, c[:300]
        assert not any(ch.isdigit() for ch in c.split("ERRORI D'ASCOLTO")[-1]), "cifre nel contesto"
        assert len(c) <= m.CONTESTO_MEDICO_MAX + 2
        pr = m.prompt_correzione(m.PROMPT_CATENA_COMPATTA, "testo di prova")
        assert "{contesto_medico}" not in pr and "{testo}" not in pr and "CONTESTO DEL MEDICO" in pr
        assert pr.index("CONTESTO DEL MEDICO") < pr.index("TESTO:\ntesto di prova")
    finally:
        m._CORSA["medico"] = None
    assert m.contesto_medico("nessuno-di-nome") == ""
    pr0 = m.prompt_correzione(m.PROMPT_CATENA_COMPATTA, "x")
    assert "CONTESTO DEL MEDICO" not in pr0 and "{contesto_medico}" not in pr0


@caso("28 · omissioni semantiche: guardie sulle proposte del modello")
def _prova_28() -> None:
    dettato = "I profili pressori risultano diminuiti e associati ad astenia. Sospendo il Valsartan. Saluti alla segretaria."
    bozza = "I profili pressori risultano associati ad astenia. Sospendo il Valsartan."
    voci = [
        {"frase": "I profili pressori risultano diminuiti e associati ad astenia", "motivo": "manca diminuiti"},  # vera omissione
        {"frase": "Sospendo il Valsartan", "motivo": "…"},                       # già nella bozza → scartata
        {"frase": "frase inventata non nel dettato", "motivo": "…"},            # non citazione → scartata
        {"frase": "I profili pressori risultano diminuiti e associati ad astenia", "motivo": "doppione"},
    ]
    fuori = m._filtra_omissioni(voci, dettato, bozza)
    assert len(fuori) == 1 and "diminuiti" in fuori[0]["frase"], fuori
    # La parola citata da sola passa se manca davvero; se c'è già, no.
    assert m._filtra_omissioni([{"frase": "diminuiti", "motivo": ""}], dettato, bozza)
    assert not m._filtra_omissioni([{"frase": "astenia", "motivo": ""}], dettato, bozza)


@caso("29 · terapia dal dettato: posologie tradotte, numeri e nomi controllati")
def _prova_29() -> None:
    ps = m.posologia_schema
    assert ps("una al mattino e mezza la sera") == "1-0-1/2-0", ps("una al mattino e mezza la sera")
    assert ps("1-0-0") == "1-0-0-0" and ps("0-0-1/2-0") == "0-0-1/2-0" and ps("½-0-0-0") == "1/2-0-0-0"
    assert ps("una compressa la sera") == "0-0-1-0" and ps("una mattina e sera") == "1-0-1-0"
    assert ps("al bisogno") == "al bisogno" and ps("ogni due settimane") == "ogni due settimane"
    assert ps("come da schema") == "come da schema" and ps("") == ""
    dettato = "Prosegue con Aspirina Cardio 100 mg una al mattino e Concor 2.5 mg mezza la sera. Sospendo il Valsartan."
    voci = [
        {"nome": "Aspirina Cardio", "dose": "100 mg", "posologia": "una al mattino", "stato": "in corso", "nota": ""},
        {"nome": "Concor", "dose": "2.5 mg", "posologia": "mezza la sera", "stato": "in corso", "nota": ""},
        {"nome": "Valsartan", "dose": "160 mg", "posologia": "", "stato": "sospeso", "nota": ""},
        {"nome": "Farmacoinventato", "dose": "50 mg", "posologia": "1-0-0", "stato": "nuovo", "nota": ""},  # numero non nel dettato
    ]
    righe, tenute, dubbi = m.righe_terapia(voci, dettato)
    assert len(righe) == 2, righe
    assert righe[0].startswith("ASPIRIN") and righe[0].endswith("100 mg 1-0-0-0"), righe[0]
    assert righe[1].endswith("2.5 mg 0-0-1/2-0"), righe[1]
    motivi = " ".join(d["motivo"] for d in dubbi)
    assert "sospeso" in motivi and "numero non presente" in motivi, dubbi
    assert m.sospesi_terapia(voci) == ["VALSARTAN"], m.sospesi_terapia(voci)


@caso("30 · arbitro informato: contesto, parole pesanti, A vuota inserita, numeri e B vuota alla persona")
def _prova_30() -> None:
    a = "Ho rivisto il paziente per profili pressori associati ad astenia. Frequenza 70. Sospendo il Valsartan."
    b = "Ho rivisto il paziente per profili pressori diminuiti associati ad astenia. Frequenza 70 e pressione 160 su 70. Non sospendo il Valsartan."
    div = m.confronta(a, b)
    assert any(d["versione_a"] == "" and d["versione_b"] == "diminuiti" and d.get("pesanti") for d in div), div
    catturato: dict = {}

    def finto_ollama(prompt, file_id, fase, **kw):
        catturato["prompt"] = prompt
        n = prompt.count("\n   a: «")
        return json.dumps({"scelte": [{"punto": k + 1, "scelta": "b"} for k in range(n)]})

    vecchi = (m.chiama_ollama, m._config_esterno, m.CORREZIONE_ESTERNA, m._CORSA.get("medico"))
    m.chiama_ollama, m._config_esterno, m.CORREZIONE_ESTERNA = finto_ollama, (lambda: None), False
    m._CORSA["medico"] = "moccetti"
    try:
        fuori, n = m.arbitra_divergenze(a, div, "prova-30")
        pr = catturato["prompt"]
        assert pr.startswith("CONTESTO DEL MEDICO") and "parole presenti da una parte sola: diminuiti" in pr, pr[:200]
        assert "{contesto_medico}" not in pr and "{punti}" not in pr
        # La parola sentita dal solo B entra dopo il contesto che precede…
        assert "profili pressori diminuiti associati" in fuori, fuori
        # …i numeri solo in B NON entrano (restano alla persona)…
        assert "160" not in fuori, fuori
        # …e la negazione in B su una frase con la A piena entra come prima
        # (segmento unico), mentre i punti con B vuota non sono mai candidati.
        assert "Non sospendo" in fuori or "non sospendo" in fuori, fuori
        assert n == 2, n
        div2 = m.confronta("profili pressori diminuiti associati", "profili pressori associati")
        assert div2 and div2[0]["versione_b"] == ""
        fuori2, n2 = m.arbitra_divergenze("profili pressori diminuiti associati", div2, "prova-30b")
        assert n2 == 0 and fuori2 == "profili pressori diminuiti associati"
    finally:
        m.chiama_ollama, m._config_esterno, m.CORREZIONE_ESTERNA = vecchi[:3]
        m._CORSA["medico"] = vecchi[3]
    pr0 = m._prompt_arbitro("x")
    assert "CONTESTO DEL MEDICO" not in pr0 and "{contesto_medico}" not in pr0


@caso("31 · coerenza interna: guardie sulle contraddizioni proposte dal modello")
def _prova_31() -> None:
    testo = "I profili pressori risultano diminuiti. La terapia resta invariata. Sospendo il Valsartan per i profili pressori aumentati."
    voci = [
        {"passaggio_a": "profili pressori risultano diminuiti", "passaggio_b": "profili pressori aumentati", "motivo": "segno opposto"},
        {"passaggio_a": "La terapia resta invariata", "passaggio_b": "Sospendo il Valsartan", "motivo": "modifica dichiarata"},
        {"passaggio_a": "La terapia resta invariata", "passaggio_b": "Sospendo il Valsartan", "motivo": "doppione"},
        {"passaggio_a": "frase che non c'è", "passaggio_b": "Sospendo il Valsartan", "motivo": "non citazione"},
        {"passaggio_a": "profili pressori", "passaggio_b": "profili pressori risultano diminuiti", "motivo": "uno dentro l'altro"},
        {"passaggio_a": "diminuiti", "passaggio_b": "aumentati", "motivo": "troppo corti"},
    ]
    fuori = m._filtra_incoerenze(voci, testo)
    assert len(fuori) == 2, fuori
    assert fuori[0]["motivo"] == "segno opposto" and fuori[1]["passaggio_b"] == "Sospendo il Valsartan", fuori
    assert m._filtra_incoerenze([], testo) == [] and m._filtra_incoerenze([None, "x"], testo) == []
    assert "{contesto_medico}" in m.PROMPT_COERENZA and "{testo}" in m.PROMPT_COERENZA


@caso("32 · dizionario dalla piattaforma: file per medico letto dal dizionario, mai cifre, svuotato se tolto")
def _prova_32() -> None:
    p = m._file_dizionario_piattaforma("moccetti")
    assert p is not None and p.name == "correzioni-moccetti-piattaforma.json"
    assert m._file_dizionario_piattaforma("../x") is None and m._file_dizionario_piattaforma(None) is None
    esisteva = p.is_file()
    vecchio = p.read_text(encoding="utf-8") if esisteva else None
    try:
        n = m.scrivi_dizionario_piattaforma({"moccetti": {"tucarografico di prova": "elettrocardiografico", "dose 5": "x"}, "../y": {"a": "b"}})
        assert n == 1, n
        sost = m.carica_sostituzioni("moccetti")
        testo, k = m.applica_correzioni("Tracciato tucarografico di prova normale.", sost)
        assert k >= 1 and "elettrocardiografico" in testo, testo
        assert "tucarografico di prova" in m.contesto_medico("moccetti")
        m.scrivi_dizionario_piattaforma({})
        assert json.loads(p.read_text(encoding="utf-8"))["linguaggio_comune"] == {}
    finally:
        if esisteva and vecchio is not None:
            p.write_text(vecchio, encoding="utf-8")
        elif p.is_file():
            p.unlink()


@caso("33 · conoscenza dalla wiki: compilata nei prompt degli agenti, spegnibile, nell'impronta della versione")
def _prova_33() -> None:
    import importlib.util as _iu
    spec_c = _iu.spec_from_file_location("compila", QUI / "compila-conoscenza.py")
    c = _iu.module_from_spec(spec_c); spec_c.loader.exec_module(c)
    medici, agenti = c.compila()
    # La compilazione è un'identità sui file già allineati (distribuisci la esegue).
    assert json.dumps(medici, ensure_ascii=False, indent=2) + "\n" == (QUI / "medici.json").read_text(encoding="utf-8"), "medici.json non allineato alla wiki"
    assert set(agenti) >= {"arbitro", "correttore", "omissioni", "terapia", "coerenza"}, set(agenti)
    for nome, v in agenti.items():
        assert v["esempi"] and all(e["dato"] and e["risposta"] for e in v["esempi"]), nome
    # Il blocco entra nei prompt e sparisce con REFERTI_CONOSCENZA=0.
    pr = m._prompt_arbitro("x")
    assert "ESEMPI (casi finti con la risposta giusta)" in pr and "{conoscenza}" not in pr and pr.index("ESEMPI") < pr.index("Rispondi SOLO"), pr[-400:]
    assert "{conoscenza}" not in m._prompt_agente(m.PROMPT_TERAPIA, "terapia")
    assert "ATTENZIONE:" in m.prompt_correzione(m.PROMPT_CORREZIONE_LISTA, "t")
    vecchio = m.CONOSCENZA_ATTIVA
    m.CONOSCENZA_ATTIVA = False
    try:
        assert "ESEMPI" not in m._prompt_arbitro("x") and "{conoscenza}" not in m._prompt_arbitro("x")
    finally:
        m.CONOSCENZA_ATTIVA = vecchio
    assert m.conoscenza_agente("agente-inesistente") == ""


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
