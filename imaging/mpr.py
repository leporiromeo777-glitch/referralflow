"""Ricostruzione multiplanare (MSE fase 9, 20.9.2026).

Da una serie di fette (file DICOM ordinati lungo la normale, distanza uniforme,
stesse dimensioni e spaziatura) a un piano sagittale o coronale. Il volume si
costruisce UNA volta (modality LUT applicata, float32) e si tiene in cache
come .npy con chiave = sha256 dell'elenco dei file; poi ogni piano è un taglio.

Il piano è restituito in due forme, entrambe dichiarate nel JSON di ritorno:
- la griglia VIRTUALE, non ricampionata: colonne = pixel in piano lungo
  l'asse tagliato, righe = numero di fette; spaziatura (sp_x = spaziatura in
  piano, sp_y = distanza fra le fette). È su questa griglia che si misura.
- il PNG mostrato, ricampionato a pixel isotropi perché non appaia
  schiacciato (l'altezza è righe × sp_y / sp_x).
Chi misura converte lo schermo nella griglia virtuale con una scala per
asse; la calibrazione della griglia è nota esattamente, e la misura
sull'MPR resta una CAUTION dichiarata («immagine ricostruita»).

    echo '{"file":[...], "piano":"sagittale", "indice":N, "ww":..,"wl":..,"out":"x.png","cache":"dir","sp":[dx,dy],"d":dist}' | python mpr.py
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path


def _chiave(file: list[str]) -> str:
    h = hashlib.sha256()
    for f in file:
        h.update(f.encode("utf-8")); h.update(b"\n")
    return h.hexdigest()[:32]


def volume(file: list[str], cache: Path):
    import numpy as np
    import pydicom
    from pydicom.pixels import apply_modality_lut

    cache.mkdir(parents=True, exist_ok=True)
    npy = cache / f"vol-{_chiave(file)}.npy"
    if npy.is_file():
        return np.load(str(npy), mmap_mode="r")
    fette = []
    forma = None
    for f in file:
        ds = pydicom.dcmread(f, force=False)
        if int(getattr(ds, "SamplesPerPixel", 1) or 1) != 1:
            raise ValueError("colore")
        arr = apply_modality_lut(ds.pixel_array, ds).astype(np.float32)
        if arr.ndim != 2:
            raise ValueError("multiframe")
        if forma is None:
            forma = arr.shape
        elif arr.shape != forma:
            raise ValueError("dimensioni_diverse")
        fette.append(arr)
    vol = np.stack(fette, axis=0)          # [z, y, x]
    tmp = npy.with_suffix(".tmp.npy")
    np.save(str(tmp), vol)
    tmp.replace(npy)
    return vol


def taglio(vol, piano: str, indice: int):
    """Il piano richiesto come immagine 2D [righe = fette, colonne = pixel in piano]."""
    nz, ny, nx = vol.shape
    if piano == "sagittale":
        if not 0 <= indice < nx: raise ValueError("indice")
        return vol[:, :, indice]            # [z, y]
    if piano == "coronale":
        if not 0 <= indice < ny: raise ValueError("indice")
        return vol[:, indice, :]            # [z, x]
    raise ValueError("piano")


def main() -> int:
    import numpy as np
    from PIL import Image

    try:
        d = json.load(sys.stdin)
        file = [str(x) for x in d["file"]]; piano = str(d["piano"]); indice = int(d["indice"])
        out = Path(d["out"]); cache = Path(d["cache"]); sp = [float(d["sp"][0]), float(d["sp"][1])]; dist = float(d["d"])
        ww = d.get("ww"); wl = d.get("wl")
    except Exception:  # noqa: BLE001
        json.dump({"errore": "ingresso_non_valido"}, sys.stdout); return 1
    if len(file) < 3 or dist <= 0 or min(sp) <= 0:
        json.dump({"errore": "serie_non_ricostruibile"}, sys.stdout); return 1
    try:
        vol = volume(file, cache)
        img = np.asarray(taglio(vol, piano, indice), dtype=np.float32)
    except ValueError as e:
        json.dump({"errore": str(e)}, sys.stdout); return 1
    except Exception as e:  # noqa: BLE001
        json.dump({"errore": "ricostruzione_fallita", "tipo": type(e).__name__}, sys.stdout); return 1

    righe_v, colonne_v = img.shape                    # fette × pixel in piano
    sp_x = sp[0] if piano == "coronale" else sp[1]    # coronale taglia lungo x (colonne), sagittale lungo y (righe)
    sp_y = dist
    # finestra
    if ww is not None and wl is not None and float(ww) > 0:
        basso, alto = float(wl) - float(ww) / 2.0, float(wl) + float(ww) / 2.0
    else:
        basso, alto = float(np.min(img)), float(np.max(img))
    if alto <= basso: alto = basso + 1.0
    grigio = (np.clip((img - basso) / (alto - basso), 0.0, 1.0) * 255.0).astype(np.uint8)
    # verso: la prima fetta (posizione minore lungo la normale) in basso, come
    # nei visori radiologici per l'assiale → sagittale/coronale con la testa in alto
    grigio = grigio[::-1, :]
    pil = Image.fromarray(grigio, mode="L")
    # pixel isotropi per lo schermo: larghezza in mm / altezza in mm
    larghezza = colonne_v
    altezza = max(1, int(round(righe_v * sp_y / sp_x)))
    pil = pil.resize((larghezza, altezza), Image.BILINEAR)
    out.parent.mkdir(parents=True, exist_ok=True)
    pil.save(str(out), format="PNG", optimize=False, compress_level=3)
    json.dump({"ok": True, "piano": piano, "indice": indice, "righe_virtuali": righe_v, "colonne_virtuali": colonne_v,
               "sp_x": sp_x, "sp_y": sp_y, "larghezza": larghezza, "altezza": altezza, "capovolto": True,
               "n_sagittale": int(vol.shape[2]), "n_coronale": int(vol.shape[1]), "n_fette": int(vol.shape[0])}, sys.stdout)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        json.dump({"errore": "imprevisto", "tipo": type(e).__name__}, sys.stdout); sys.exit(1)
