# Glossario che impara dalle revisioni (2026-09-04, idea dalla ricerca
# di mercato dell'utente). Confronta, per ogni bozza CONFERMATA, il testo
# proposto dalla catena col testo finale approvato dal medico: le coppie
# sbagliato→giusto ricorrenti (>=2 referti diversi) diventano PROPOSTE di
# dizionario in ~/referti/proposte-glossario.json. NIENTE è automatico:
# una persona rivede il file e promuove a mano le voci buone in
# correzioni.json (l'auto-promozione avvelenerebbe il dizionario con le
# preferenze di stile di un singolo referto).
# Guardie: mai coppie con cifre, mai ribaltamenti clinici, mai coppie già
# in correzioni.json, solo sostituzioni foneticamente plausibili.
# Output e log: SOLO conteggi; le coppie vivono nel file locale.
# Uso: DATABASE_URL=... python3.14 proposte-glossario.py [giorni]
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline  # noqa: E402

USCITA = Path.home() / "referti" / "proposte-glossario.json"


def coppie_confermate(giorni: int) -> list[tuple[str, str]]:
    out = subprocess.run(
        ["psql", os.environ["DATABASE_URL"], "-t", "-A", "-F", "\x1f", "-c",
         "select payload->>'testo_corretto', testo_finale from referti_bozze "
         "where stato='confermata' and testo_finale is not null "
         f"and reviewed_at > now() - interval '{int(giorni)} days';"],
        capture_output=True, text=True, timeout=60,
    )
    righe = []
    for r in out.stdout.split("\n"):
        if "\x1f" in r:
            a, b = r.split("\x1f", 1)
            if a.strip() and b.strip():
                righe.append((a, b))
    return righe


def diff_parole(prima: str, dopo: str):
    """Coppie di parole sostituite 1:1 (via difflib): il caso pulito di un
    termine storpiato corretto dal medico. Sostituzioni più larghe (frasi
    riscritte) si ignorano: sono stile, non dizionario."""
    import difflib
    pa, pb = prima.split(), dopo.split()
    sm = difflib.SequenceMatcher(None, [w.lower() for w in pa],
                                 [w.lower() for w in pb])
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "replace" and (i2 - i1) == (j2 - j1) <= 2:
            for k in range(i2 - i1):
                yield pa[i1 + k], pb[j1 + k]


def main(argv: list[str]) -> int:
    giorni = int(argv[0]) if argv else 90
    esistenti: set[str] = set()
    try:
        dati = json.loads(pipeline.PERCORSO_CORREZIONI.read_text(encoding="utf-8"))
        for sez in dati.values():
            if isinstance(sez, dict):
                esistenti.update(k.lower() for k in sez)
    except (OSError, json.JSONDecodeError):
        pass

    conteggi: dict[tuple[str, str], int] = {}
    referti = coppie_confermate(giorni)
    for prima, dopo in referti:
        viste = set()
        for da, a in diff_parole(prima, dopo):
            da_p, a_p = da.strip(".,;:!?()«»\"'"), a.strip(".,;:!?()«»\"'")
            if (not da_p or not a_p or da_p.lower() == a_p.lower()
                    or any(c.isdigit() for c in da_p + a_p)
                    or len(da_p) < 4
                    or da_p.lower() in esistenti
                    or pipeline._ribaltamento_clinico(da_p, a_p)
                    or not pipeline._riparazione_plausibile(da_p, a_p)):
                continue
            chiave = (da_p.lower(), a_p.lower())
            if chiave not in viste:  # conta 1 volta per referto
                viste.add(chiave)
                conteggi[chiave] = conteggi.get(chiave, 0) + 1

    proposte = [
        {"da": da, "a": a, "referti": n}
        for (da, a), n in sorted(conteggi.items(), key=lambda kv: -kv[1])
        if n >= 2
    ]
    USCITA.write_text(
        json.dumps({"proposte": proposte, "referti_esaminati": len(referti)},
                   ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"referti confermati esaminati: {len(referti)} · "
          f"proposte (viste in >=2 referti): {len(proposte)} → {USCITA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
