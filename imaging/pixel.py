"""I pixel di un file DICOM, anche quando sono scritti nel formato PRIVATO dell'archivio Philips (13.10.2026).

Le TAC e le risonanze che l'archivio Philips dello studio ha scritto sul NAS non sono cifrate: sono DICOM con le
intestazioni in chiaro e i pixel in una compressione privata — sintassi di trasferimento 1.3.46.670589.33.1.4.1,
creatore privato ELSCINT1, tipo «PMSCT_RLE1» in (07a1,1011) — che le librerie normali non conoscono (pydicom risponde
«NotImplementedError»). Lo schema è noto e pubblico (lo documenta GDCM, esempio rle2img), ed è SENZA PERDITA:
  1. corse:      0xA5, n, v            → il byte v ripetuto n+1 volte;
  2. differenze: 0x5A, basso, alto     → un valore intero a 16 bit;
                 qualunque altro byte  → si somma, col segno, al valore precedente.
Misurato su 12 immagini dell'archivio (solo numeri): tutte decodificate alla lunghezza esatta (righe × colonne),
TAC da −3024 a circa 1400 HU (−3024 è il riempimento fuori campo degli apparecchi GE), RM da 0 a qualche migliaio,
pixel vicini 25 volte più simili di due presi a caso — cioè immagini, non rumore.

`pixel_di(ds)` prova prima la via normale (pydicom) e, se il file è di questo tipo, decodifica qui. Le immagini a
colori dello stesso formato («PMSCT_RGB1») non sono gestite: restano «pixel non leggibili».
"""
import numpy as np

SINTASSI_PHILIPS = "1.3.46.670589.33.1.4.1"


def pmsct_rle1(dati: bytes) -> np.ndarray:
    """Da PMSCT_RLE1 ai valori a 16 bit, nell'ordine in cui sono scritti."""
    b = bytearray()
    i, n = 0, len(dati)
    while i < n:
        c = dati[i]
        if c == 0xA5 and i + 2 < n:
            b.extend(bytes([dati[i + 2]]) * (dati[i + 1] + 1))
            i += 3
        else:
            b.append(c)
            i += 1
    out = np.empty(len(b), dtype=np.uint16)
    k = v = i = 0
    n = len(b)
    while i < n:
        c = b[i]
        if c == 0x5A and i + 2 < n:
            v = b[i + 1] | (b[i + 2] << 8)
            i += 3
        else:
            v = (v + (c - 256 if c > 127 else c)) & 0xFFFF
            i += 1
        out[k] = v
        k += 1
    return out[:k]


def formato_philips(ds) -> bool:
    """Il file è scritto nel formato privato dell'archivio Philips, in bianco e nero a 16 bit?"""
    try:
        if str(ds.file_meta.TransferSyntaxUID) != SINTASSI_PHILIPS:
            return False
        tipo = ds.get((0x07A1, 0x1011))
        return (tipo is not None and str(tipo.value).strip() == "PMSCT_RLE1"
                and int(ds.get("SamplesPerPixel", 1)) == 1 and int(ds.get("BitsAllocated", 0)) == 16)
    except Exception:  # noqa: BLE001
        return False


def pixel_di(ds):
    """I pixel del file: come `ds.pixel_array`, più il formato privato Philips. Solleva come pydicom se non si può."""
    try:
        return ds.pixel_array
    except Exception:
        if not formato_philips(ds):
            raise
    righe, colonne = int(ds.Rows), int(ds.Columns)
    fotogrammi = int(getattr(ds, "NumberOfFrames", 1) or 1)
    px = pmsct_rle1(bytes(ds[(0x7FE0, 0x0010)].value))
    attesi = righe * colonne * fotogrammi
    # La lunghezza deve tornare ESATTA (al più un valore di riempimento in coda): se no il file non è quello che
    # sembra, e un'immagine spostata di qualche pixel è peggio di nessuna immagine.
    if not (attesi <= len(px) <= attesi + 1):
        raise ValueError("formato_privato_lunghezza")
    a = px[:attesi].astype(np.int16 if int(ds.get("PixelRepresentation", 0)) else np.uint16)
    return a.reshape((fotogrammi, righe, colonne) if fotogrammi > 1 else (righe, colonne))
