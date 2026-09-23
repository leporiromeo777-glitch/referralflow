#!/usr/bin/env python3
"""Ricollega alle bozze gli audio conservati nella cassaforte locale
(~/referti-dataset/audio/<file_id>.<ext>) che la piattaforma non ha: i
dettati entrati dalla cartella condivisa prima del 23.9.2026. Usa la stessa
consegna della catena (consegna_audio → /api/referti/audio-catena), che è
idempotente: 201 collegato, 200 già presente, 404 nessuna bozza con quella
impronta. Stampa solo conteggi. Uso: python3.14 collega-audio.py"""
import collections, importlib.util, os, plistlib, sys
from pathlib import Path

piano = Path.home() / "Library/LaunchAgents/ch.referralflow.referti-servizio.plist"
env = plistlib.loads(piano.read_bytes()).get("EnvironmentVariables", {})
for k in ("REFERTI_FLOW_URL", "REFERTI_FLOW_TOKEN"):
    if env.get(k):
        os.environ[k] = env[k]
os.environ.setdefault("REFERTI_LOG_SILENZIOSO", "1")
spec = importlib.util.spec_from_file_location("pipeline", Path(__file__).resolve().parent / "pipeline.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

esiti = collections.Counter()
m.log.info = m.log.warning = lambda msg, *a: esiti.update([msg.split("esito=")[1].split()[0] + (f" {a[-1]}" if a else "")])
cartella = m.DATASET_DIR
for f in sorted(cartella.glob("*.*")):
    if f.is_file() and len(f.stem) == 16 and f.suffix.lower() in m.ESTENSIONI_AUDIO:
        m.consegna_audio(f.stem, f)
print(f"cassaforte: {cartella}")
for k, n in sorted(esiti.items()):
    print(f"  {k}: {n}")
