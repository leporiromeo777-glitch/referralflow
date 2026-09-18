#!/usr/bin/env python3
"""Ricezione DICOM dagli apparecchi (18.9.2026) — il C-STORE di ReferralFlow.

    python ricevi-dicom.py            # legge ~/referti-imaging/ricezione.conf
    python ricevi-dicom.py --prova    # una sola associazione, poi esce (banco)

A che serve. Un ecografo, una RM, una TAC non «esportano file»: parlano DICOM
in rete, e mandano le immagini a chi risponde. Il pezzo che risponde si chiama
SCP, è uno standard pubblico dal 1993, e costa zero: quello che si paga a peso
d'oro è il visualizzatore, non il protocollo. Questo file è il nostro SCP.

Che cosa fa, e solo questo:
- **C-ECHO**: «ci sei?». È il tasto che il tecnico preme sull'apparecchio per
  provare la connessione. Senza, l'installazione è alla cieca.
- **C-STORE**: riceve un'immagine e la scrive nello spool. Risponde Success
  SOLO dopo che il file è sul disco e rinominato: se rispondesse prima,
  l'apparecchio cancellerebbe la sua copia di una cosa che non abbiamo.
- Finita l'associazione, sveglia la piattaforma, che legge lo spool e mette gli
  esami in cartella.

Chi può mandare: solo gli AE Title elencati in `CONSENTITI`, e — se è scritto
l'indirizzo — solo da quell'indirizzo. Tutto il resto si rifiuta e si annota.

Nei log non entra mai niente del paziente: AE Title, indirizzo, conteggi,
durate. Nemmeno gli identificativi dello studio.

I byte si scrivono COME ARRIVANO, senza decodificare e ricodificare: un file
DICOM è anche un documento legale, e rigenerarlo significa cambiarlo.
"""
from __future__ import annotations

import argparse
import io
import logging
import os
import socket
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

BASE = Path(os.environ.get("REFERTI_IMAGING_BASE", Path.home() / "referti-imaging"))
CONF = BASE / "ricezione.conf"
PREDEFINITI = {
    "AE_TITLE": "REFERRALFLOW",
    "PORTA": "11112",
    "SPOOL": str(BASE / "ingresso"),
    "CONSENTITI": "",            # «ECOGRAFO1@192.168.1.50, TAC» — vuoto = nessuno
    "FLOW_URL": "http://127.0.0.1:3000/api/cron/imaging",
    "FLOW_TOKEN": "",
    "MAX_DISCO_LIBERO_MB": "2000",
}

log = logging.getLogger("imaging.ricezione")


def conf() -> dict[str, str]:
    valori = dict(PREDEFINITI)
    try:
        for riga in CONF.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga:
                continue
            k, v = riga.split("=", 1)
            valori[k.strip().upper()] = v.strip()
    except OSError:
        pass
    for k in ("AE_TITLE", "PORTA", "FLOW_TOKEN"):
        v = os.environ.get(f"REFERTI_{k}")
        if v:
            valori[k] = v
    return valori


def consentiti(testo: str) -> dict[str, set[str]]:
    """«ECOGRAFO1@192.168.1.50, TAC» → {'ECOGRAFO1': {'192.168.1.50'}, 'TAC': set()}

    Insieme vuoto = quell'AE Title può arrivare da qualunque indirizzo. È una
    scelta dello studio, non un buco: certe apparecchiature prendono l'IP dal
    DHCP e cambiano da sole."""
    fuori: dict[str, set[str]] = {}
    for pezzo in testo.replace(";", ",").split(","):
        pezzo = pezzo.strip()
        if not pezzo:
            continue
        aet, _, ip = pezzo.partition("@")
        aet = aet.strip().upper()
        if not aet:
            continue
        fuori.setdefault(aet, set())
        if ip.strip():
            fuori[aet].add(ip.strip())
    return fuori


def indirizzi(host: str) -> set[str]:
    try:
        return {ai[4][0] for ai in socket.getaddrinfo(host, None)}
    except OSError:
        return {host}


def disco_libero_mb(dove: Path) -> int:
    try:
        st = os.statvfs(dove)
        return int(st.f_bavail * st.f_frsize / 1024 / 1024)
    except OSError:
        return 10 ** 9


def avvisa(url: str, token: str) -> None:
    """Sveglia la piattaforma: «c'è roba nello spool». Se non risponde non è
    un dramma — il giro delle automazioni passa comunque, e i file restano
    dove sono. Un apparecchio non deve mai fallire per colpa nostra."""
    if not url:
        return
    try:
        req = urllib.request.Request(url, method="POST", data=b"{}")
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=30) as r:
            log.info("fase=avviso esito=%s", r.status)
    except Exception as e:  # noqa: BLE001
        log.warning("fase=avviso esito=fallito tipo=%s", type(e).__name__)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prova", action="store_true", help="esce dopo la prima associazione (banco)")
    a = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        datefmt="%Y-%m-%dT%H:%M:%S")
    c = conf()
    spool = Path(c["SPOOL"])
    spool.mkdir(parents=True, exist_ok=True)
    os.chmod(spool, 0o700)
    ammessi = consentiti(c["CONSENTITI"])
    minimo_mb = int(c.get("MAX_DISCO_LIBERO_MB") or 2000)

    from pydicom.filewriter import write_file_meta_info
    from pynetdicom import AE, ALL_TRANSFER_SYNTAXES, AllStoragePresentationContexts, evt
    from pynetdicom.sop_class import Verification

    NON_AUTORIZZATO, FUORI_RISORSE, NON_CAPITO = 0x0124, 0xA700, 0xC000

    stato = {"ricevute": 0, "associazioni": 0}

    def chi(event) -> tuple[str, str]:
        assoc = event.assoc
        aet = str(getattr(assoc.requestor, "ae_title", "") or "").strip().upper()
        ip = str(getattr(assoc.requestor, "address", "") or "")
        return aet, ip

    def autorizzato(aet: str, ip: str) -> bool:
        if aet not in ammessi:
            return False
        attesi = ammessi[aet]
        if not attesi:
            return True
        for atteso in attesi:
            if ip in indirizzi(atteso):
                return True
        return False

    def su_echo(event):
        aet, ip = chi(event)
        ok = autorizzato(aet, ip)
        log.info("fase=echo aet=%s ip=%s esito=%s", aet, ip, "ok" if ok else "rifiutato")
        return 0x0000 if ok else NON_AUTORIZZATO

    def su_store(event):
        aet, ip = chi(event)
        if not autorizzato(aet, ip):
            log.warning("fase=store aet=%s ip=%s esito=rifiutato motivo=non_in_elenco", aet, ip)
            return NON_AUTORIZZATO
        if disco_libero_mb(spool) < minimo_mb:
            log.error("fase=store esito=rifiutato motivo=disco_pieno liberi_mb=%d", disco_libero_mb(spool))
            return FUORI_RISORSE
        try:
            # Intestazione + dataset così come sono arrivati.
            testa = io.BytesIO()
            testa.write(b"\x00" * 128 + b"DICM")
            write_file_meta_info(testa, event.file_meta)
            fd, tmp = tempfile.mkstemp(dir=str(spool), suffix=".parziale")
            with os.fdopen(fd, "wb") as f:
                f.write(testa.getvalue())
                f.write(event.request.DataSet.getvalue())
                f.flush()
                os.fsync(f.fileno())          # durevole PRIMA di dire Success
            definitivo = Path(tmp).with_suffix(".dcm")
            os.rename(tmp, definitivo)
            os.chmod(definitivo, 0o600)
        except OSError:
            log.exception("fase=store esito=errore motivo=scrittura")
            return FUORI_RISORSE
        except Exception:  # noqa: BLE001
            log.exception("fase=store esito=errore motivo=inatteso")
            return NON_CAPITO
        stato["ricevute"] += 1
        return 0x0000

    def su_chiusura(event):
        aet, ip = chi(event)
        stato["associazioni"] += 1
        log.info("fase=associazione aet=%s ip=%s ricevute=%d", aet, ip, stato["ricevute"])
        if stato["ricevute"]:
            avvisa(c["FLOW_URL"], c["FLOW_TOKEN"])
            stato["ricevute"] = 0

    ae = AE(ae_title=c["AE_TITLE"])
    for contesto in AllStoragePresentationContexts:
        ae.add_supported_context(contesto.abstract_syntax, ALL_TRANSFER_SYNTAXES)
    ae.add_supported_context(Verification, ALL_TRANSFER_SYNTAXES)
    # Le immagini arrivano come sono: nessuna ricodifica, nessuna perdita.
    ae.maximum_pdu_size = 0

    gestori = [(evt.EVT_C_STORE, su_store), (evt.EVT_C_ECHO, su_echo), (evt.EVT_RELEASED, su_chiusura),
               (evt.EVT_CONN_CLOSE, su_chiusura)]
    porta = int(c["PORTA"])
    log.info("fase=avvio ae=%s porta=%d spool=%s apparecchi=%d", c["AE_TITLE"], porta, spool, len(ammessi))
    if not ammessi:
        log.warning("fase=avvio attenzione=nessun_apparecchio_consentito (scrivi CONSENTITI in %s)", CONF)

    server = ae.start_server(("0.0.0.0", porta), block=not a.prova, evt_handlers=gestori)
    if a.prova:
        inizio = time.time()
        while time.time() - inizio < 30 and not stato["associazioni"]:
            time.sleep(0.2)
        server.shutdown()
        log.info("fase=prova associazioni=%d", stato["associazioni"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
