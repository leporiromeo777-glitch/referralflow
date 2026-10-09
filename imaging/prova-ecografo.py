#!/usr/bin/env python3
"""Prova del lettore sui file come li manda un ecografo (7.10.2026).

Un ecocardiogramma non è una TAC: è quasi tutto **filmati a colori** — un file
solo con decine o centinaia di fotogrammi, compressi JPEG uno per uno, coi
colori scritti in YCbCr (`YBR_FULL_422`). Qui si costruiscono file SINTETICI
fatti così (nessun paziente, nessun esame vero) e si controlla che il lettore:

- disegni il fotogramma chiesto, e non un altro;
- restituisca i colori giusti (un rosso resta rosso: YCbCr letto come RGB dà
  un'immagine verde-viola, ed è l'errore classico);
- **non decodifichi tutto il filmato per disegnarne un fotogramma**: su un
  filmato lungo è la differenza fra un visore che scorre e uno fermo;
- legga anche il colore non compresso, la tavolozza (PALETTE COLOR) e il
  grigio compresso.

    ~/.referralflow-imaging/bin/python imaging/prova-ecografo.py
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.encaps import encapsulate
from pydicom.uid import ExplicitVRLittleEndian, JPEGBaseline8Bit, generate_uid

QUI = Path(__file__).resolve().parent
LETTORE = QUI / "leggi-dicom.py"
US_MULTIFRAME = "1.2.840.10008.5.1.4.1.1.3.1"
US_IMMAGINE = "1.2.840.10008.5.1.4.1.1.6.1"


def base(sop: str, righe: int, colonne: int, sintassi) -> FileDataset:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = sop
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = sintassi
    ds = FileDataset("", {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID, ds.SOPInstanceUID = sop, meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID, ds.SeriesInstanceUID = generate_uid(), generate_uid()
    ds.Modality, ds.PatientName, ds.PatientID = "US", "PROVA^SINTETICA", "PROVA"
    ds.Rows, ds.Columns = righe, colonne
    return ds


def fotogramma(i: int, righe: int, colonne: int) -> np.ndarray:
    """Fondo scuro, un quadrato ROSSO fisso in alto a sinistra e una barra
    bianca che scende di una riga di blocchi a ogni fotogramma: dal disegno si
    capisce quale fotogramma è."""
    a = np.zeros((righe, colonne, 3), dtype=np.uint8)
    a[:, :] = (16, 16, 16)
    a[8:72, 8:72] = (230, 20, 20)
    y = 80 + (i * 8) % (righe - 96)
    a[y:y + 8, colonne // 2:] = (240, 240, 240)
    return a


def filmato_jpeg(n: int, righe: int, colonne: int) -> FileDataset:
    ds = base(US_MULTIFRAME, righe, colonne, JPEGBaseline8Bit)
    ds.SamplesPerPixel, ds.PhotometricInterpretation, ds.PlanarConfiguration = 3, "YBR_FULL_422", 0
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 8, 8, 7, 0
    ds.NumberOfFrames = n
    pezzi = []
    for i in range(n):
        b = io.BytesIO()
        Image.fromarray(fotogramma(i, righe, colonne), "RGB").save(b, format="JPEG", quality=90, subsampling="4:2:2")
        pezzi.append(b.getvalue())
    ds.PixelData = encapsulate(pezzi)
    return ds


def fermo_rgb(righe: int, colonne: int) -> FileDataset:
    ds = base(US_IMMAGINE, righe, colonne, ExplicitVRLittleEndian)
    ds.SamplesPerPixel, ds.PhotometricInterpretation, ds.PlanarConfiguration = 3, "RGB", 0
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 8, 8, 7, 0
    ds.PixelData = fotogramma(0, righe, colonne).tobytes()
    return ds


def fermo_tavolozza(righe: int, colonne: int) -> FileDataset:
    """Indice 0 = fondo, 1 = rosso, 2 = bianco: i colori stanno nella tavolozza."""
    ds = base(US_IMMAGINE, righe, colonne, ExplicitVRLittleEndian)
    ds.SamplesPerPixel, ds.PhotometricInterpretation = 1, "PALETTE COLOR"
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 8, 8, 7, 0
    for nome, valori in (("Red", (16, 230, 240)), ("Green", (16, 20, 240)), ("Blue", (16, 20, 240))):
        setattr(ds, f"{nome}PaletteColorLookupTableDescriptor", [256, 0, 16])
        tav = np.zeros(256, dtype=np.uint16)
        tav[:3] = [v * 257 for v in valori]
        setattr(ds, f"{nome}PaletteColorLookupTableData", tav.tobytes())
    idx = np.zeros((righe, colonne), dtype=np.uint8)
    idx[8:72, 8:72] = 1
    idx[80:88, colonne // 2:] = 2
    ds.PixelData = idx.tobytes()
    return ds


def filmato_grigio_jpeg(n: int, righe: int, colonne: int) -> FileDataset:
    ds = base(US_MULTIFRAME, righe, colonne, JPEGBaseline8Bit)
    ds.SamplesPerPixel, ds.PhotometricInterpretation = 1, "MONOCHROME2"
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 8, 8, 7, 0
    ds.NumberOfFrames = n
    pezzi = []
    for i in range(n):
        b = io.BytesIO()
        Image.fromarray(fotogramma(i, righe, colonne)[:, :, 1], "L").save(b, format="JPEG", quality=90)
        pezzi.append(b.getvalue())
    ds.PixelData = encapsulate(pezzi)
    return ds


def png(file: Path, frame: int, uscita: Path) -> tuple[dict, float]:
    t = time.monotonic()
    r = subprocess.run([sys.executable, str(LETTORE), "png", str(file), "--frame", str(frame), "--out", str(uscita)],
                       capture_output=True, text=True, timeout=120)
    try:
        return json.loads(r.stdout or "{}"), time.monotonic() - t
    except json.JSONDecodeError:
        return {"errore": "uscita_non_json"}, time.monotonic() - t


def main() -> int:
    falliti = 0

    def check(nome: str, ok: bool, dettaglio: str = "") -> None:
        nonlocal falliti
        falliti += 0 if ok else 1
        print(f"{'OK  ' if ok else 'ERR '} {nome}{(' — ' + dettaglio) if dettaglio else ''}")

    def rosso(p: Path) -> bool:
        r, g, b = Image.open(p).convert("RGB").getpixel((40, 40))
        return r > 170 and g < 80 and b < 80

    def barra(p: Path, i: int, righe: int, colonne: int) -> bool:
        im = Image.open(p).convert("RGB")
        y = 80 + (i * 8) % (righe - 96) + 4
        dentro, fuori = im.getpixel((colonne - 20, y)), im.getpixel((colonne - 20, (y + 40) if y + 48 < righe else (y - 40)))
        return min(dentro) > 170 and max(fuori) < 80

    with tempfile.TemporaryDirectory() as d:
        t = Path(d)
        R, C = 240, 320

        f = t / "filmato.dcm"; filmato_jpeg(24, R, C).save_as(f)
        for i in (0, 7, 23):
            esito, _ = png(f, i, t / f"f{i}.png")
            check(f"filmato JPEG a colori: fotogramma {i}", bool(esito.get("ok")) and esito.get("frame") == i and esito.get("frame_totali") == 24, json.dumps(esito)[:90])
            if esito.get("ok"):
                check(f"  il rosso resta rosso ({i})", rosso(t / f"f{i}.png"))
                check(f"  è proprio il fotogramma {i}", barra(t / f"f{i}.png", i, R, C))

        f = t / "rgb.dcm"; fermo_rgb(R, C).save_as(f)
        esito, _ = png(f, 0, t / "rgb.png")
        check("immagine ferma a colori non compressa", bool(esito.get("ok")) and rosso(t / "rgb.png"), json.dumps(esito)[:90])

        f = t / "tav.dcm"; fermo_tavolozza(R, C).save_as(f)
        esito, _ = png(f, 0, t / "tav.png")
        check("immagine con tavolozza (PALETTE COLOR): i colori sono quelli della tavolozza", bool(esito.get("ok")) and rosso(t / "tav.png"), json.dumps(esito)[:90])

        f = t / "grigio.dcm"; filmato_grigio_jpeg(12, R, C).save_as(f)
        esito, _ = png(f, 5, t / "g.png")
        check("filmato JPEG in grigio: fotogramma 5", bool(esito.get("ok")) and esito.get("frame") == 5 and barra(t / "g.png", 5, R, C), json.dumps(esito)[:90])

        # Il filmato lungo: disegnare UN fotogramma non deve costare come
        # decodificarli tutti. Si confronta un filmato di 4 fotogrammi con uno
        # di 240, stessa dimensione: il tempo non deve crescere col numero.
        RG, CG = 600, 800
        corto, lungo = t / "corto.dcm", t / "lungo.dcm"
        filmato_jpeg(4, RG, CG).save_as(corto)
        filmato_jpeg(240, RG, CG).save_as(lungo)
        tc = min(png(corto, 2, t / "c.png")[1] for _ in range(2))
        esito, _ = png(lungo, 200, t / "l.png")
        tl = min(png(lungo, 200, t / "l.png")[1] for _ in range(2))
        check("filmato lungo (240 fotogrammi): fotogramma 200", bool(esito.get("ok")) and esito.get("frame") == 200 and barra(t / "l.png", 200, RG, CG), json.dumps(esito)[:90])
        check("  un fotogramma non costa come tutto il filmato", tl < tc * 3 + 0.5, f"corto {tc:.2f}s · lungo {tl:.2f}s")

        # Il filmato intero in un file, per riprodurlo (9.10.2026): tutti i
        # fotogrammi, nell'ordine, coi colori giusti, e la durata dichiarata dal file.
        def filmato(file: Path, uscita: Path, *altri: str) -> tuple[dict, float]:
            t0 = time.monotonic()
            r = subprocess.run([sys.executable, str(LETTORE), "filmato", str(file), "--out", str(uscita), *altri], capture_output=True, text=True, timeout=180)
            try:
                return json.loads(r.stdout or "{}"), time.monotonic() - t0
            except json.JSONDecodeError:
                return {"errore": "uscita_non_json"}, time.monotonic() - t0

        def apri(p: Path) -> tuple[dict, list[bytes]]:
            b = p.read_bytes()
            assert b[:8] == b"RFCINE1\n"
            lung = int.from_bytes(b[8:12], "little")
            testa = json.loads(b[12:12 + lung]); pos = 12 + lung; pezzi = []
            for n in testa["lunghezze"]:
                pezzi.append(b[pos:pos + n]); pos += n
            assert pos == len(b)
            return testa, pezzi

        def come_png(pezzo: bytes, dove: Path) -> Path:
            Image.open(io.BytesIO(pezzo)).save(dove); return dove

        ds = filmato_jpeg(24, R, C); ds.FrameTime = "33.3"; f = t / "tempo.dcm"; ds.save_as(f)
        esito, _ = filmato(f, t / "tempo.bin")
        ok = bool(esito.get("ok")) and esito.get("frame_totali") == 24
        check("filmato intero: 24 fotogrammi in un file, con la durata del file (33,3 ms)", ok and esito.get("ms") == 33.3, json.dumps(esito)[:110])
        if ok:
            testa, pezzi = apri(t / "tempo.bin")
            check("  intestazione e pezzi tornano", testa["n"] == 24 and len(pezzi) == 24 and (testa["larghezza"], testa["altezza"]) == (C, R) and all(x[:2] == b"\xff\xd8" for x in pezzi))
            check("  ogni fotogramma è il suo, e il rosso resta rosso", all(barra(come_png(pezzi[i], t / f"b{i}.png"), i, R, C) and rosso(t / f"b{i}.png") for i in (0, 7, 23)))
            check("  nessun file a metà lasciato accanto", not list(t.glob("tempo.bin.*")))
        ds = filmato_jpeg(6, R, C); ds.RecommendedDisplayFrameRate = 25; f = t / "fps.dcm"; ds.save_as(f)
        check("  senza FrameTime vale la velocità consigliata (25/s → 40 ms)", filmato(f, t / "fps.bin")[0].get("ms") == 40.0)
        check("  se il file non dice niente, la durata è null (decide la pagina)", filmato(t / "filmato.dcm", t / "muto.bin")[0].get("ms", 0) is None)
        esito, _ = filmato(t / "grigio.dcm", t / "grigio.bin")
        if esito.get("ok"):
            _, pezzi = apri(t / "grigio.bin")
            check("  filmato in grigio: 12 fotogrammi, il 5 è il 5", len(pezzi) == 12 and barra(come_png(pezzi[5], t / "bg.png"), 5, R, C))
        else:
            check("  filmato in grigio", False, json.dumps(esito)[:90])
        check("  un'immagine ferma non è un filmato", filmato(t / "rgb.dcm", t / "no.bin")[0].get("errore") == "non_filmato" and not (t / "no.bin").exists())
        esito, tempo = filmato(lungo, t / "lungo.bin")
        check("  240 fotogrammi 800×600 in un processo solo", bool(esito.get("ok")) and esito.get("frame_totali") == 240, f"{tempo:.1f}s · {esito.get('byte', 0) / 1048576:.1f} MB")

    print(f"\n{'TUTTO OK' if not falliti else f'{falliti} FALLITI'}")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(main())
