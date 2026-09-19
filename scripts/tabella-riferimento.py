#!/usr/bin/env python3
"""Tabella di riferimento del righello (MSE fase 7, punto 13 della specifica).

Dal CSV di validazione (`/api/prototipo/imaging/misure?formato=csv`, misure
legate a quelle dell'apparecchio) produce la tabella:
    Test · Ground truth · Risultato · Errore assoluto · Errore relativo · PASS/FAIL
Le SOGLIE NON LE SCEGLIE QUESTO SCRIPT: vanno passate, e sono quelle firmate
nel piano di V&V dal responsabile clinico. Senza soglie non gira.

    python3 scripts/tabella-riferimento.py validazione-righello.csv --assoluta-mm 2 --relativa-pct 5 [--media-mm 1]
Il CSV contiene identificativi di esame e immagine, non nomi: la tabella li
riporta troncati. Uscita in Markdown su stdout.
"""
from __future__ import annotations

import argparse
import csv
import sys


def num(v: str):
    v = (v or "").strip().replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--assoluta-mm", type=float, required=True, help="soglia sull'errore assoluto (mm), dal piano di V&V")
    ap.add_argument("--relativa-pct", type=float, required=True, help="soglia sull'errore relativo (%%), dal piano di V&V")
    ap.add_argument("--media-mm", type=float, default=None, help="soglia sull'errore assoluto medio (mm), facoltativa")
    ap.add_argument("--quota-pct", type=float, default=95.0, help="quota minima di coppie entro soglia (default 95)")
    a = ap.parse_args()

    with open(a.csv, encoding="utf-8-sig", newline="") as f:
        righe = list(csv.DictReader(f, delimiter=";"))
    coppie = []
    for r in righe:
        if (r.get("annullata") or "").strip() == "sì":
            continue
        gt, ris = num(r.get("riferimento_mm", "")), num(r.get("valore_mm", ""))
        if gt is None or ris is None or gt == 0:
            continue
        ea = abs(ris - gt); er = ea / abs(gt) * 100
        # PASS se entro la soglia assoluta OPPURE entro quella relativa (il maggiore dei due, come nel piano)
        ok = ea <= a.assoluta_mm or er <= a.relativa_pct
        coppie.append((r, gt, ris, ea, er, ok))

    print(f"# Tabella di riferimento — righello\n")
    print(f"Soglie (piano di V&V): |errore| ≤ {a.assoluta_mm} mm oppure ≤ {a.relativa_pct} % · quota minima {a.quota_pct} %" + (f" · media ≤ {a.media_mm} mm" if a.media_mm is not None else "") + "\n")
    print("| Test | Ground truth (apparecchio) | Risultato software | Errore assoluto | Errore relativo | Esito |")
    print("|---|---|---|---|---|---|")
    for r, gt, ris, ea, er, ok in coppie:
        nome = f"{(r.get('etichetta') or 'distanza')} · {(r.get('modalita') or '')} · {(r.get('immagine') or '')[:8]} f{r.get('fotogramma') or ''} · {(r.get('riferimento') or '')}"
        print(f"| {nome} | {gt:.2f} mm | {ris:.2f} mm | {ea:.2f} mm | {er:.1f} % | {'PASS' if ok else 'FAIL'} |")
    if not coppie:
        print("\nNessuna coppia confrontabile nel CSV.")
        return 2
    n = len(coppie); passate = sum(1 for c in coppie if c[5]); media = sum(c[3] for c in coppie) / n; massimo = max(c[3] for c in coppie)
    quota = passate / n * 100
    esito = quota >= a.quota_pct and (a.media_mm is None or media <= a.media_mm)
    print(f"\n**Coppie**: {n} · **entro soglia**: {passate} ({quota:.1f} %) · **errore medio**: {media:.2f} mm · **massimo**: {massimo:.2f} mm · **esito complessivo**: {'PASS' if esito else 'FAIL'}")
    print("\nLe soglie sopra sono quelle passate a riga di comando: la loro validità la decide chi firma il piano di V&V, non questo script.")
    return 0 if esito else 1


if __name__ == "__main__":
    sys.exit(main())
