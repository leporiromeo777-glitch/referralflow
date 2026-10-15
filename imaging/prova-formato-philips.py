"""Prova del formato privato dell'archivio Philips (imaging/pixel.py), con immagini INVENTATE (13.10.2026).

Qui si scrive il codificatore inverso (differenze, poi corse), si costruiscono file DICOM finti con la sintassi di
trasferimento privata e le etichette ELSCINT1, e si controlla che i pixel tornino IDENTICI — dal decodificatore, da
`pixel_di`, e dal lettore vero (`leggi-dicom.py png` e `statistiche`). Uso:  python imaging/prova-formato-philips.py
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import generate_uid

sys.path.insert(0, str(Path(__file__).parent))
from pixel import SINTASSI_PHILIPS, pixel_di, pmsct_rle1  # noqa: E402

ok = no = 0


def verifica(cond, cosa):
    global ok, no
    if cond:
        ok += 1; print("ok", cosa)
    else:
        no += 1; print("NO", cosa)


def codifica(valori: np.ndarray) -> bytes:
    """L'inverso di pmsct_rle1: prima le differenze (0x5A = valore intero), poi le corse (0xA5 n v)."""
    d = bytearray(); prima = 0
    for v in valori.astype(np.uint16).tolist():
        diff = (v - prima) & 0xFFFF
        if diff >= 0x8000: diff -= 0x10000
        byte = diff & 0xFF
        if -128 <= diff <= 127 and byte not in (0x5A, 0xA5):
            d.append(byte)
        else:
            d += bytes([0x5A, v & 0xFF, v >> 8])
        prima = v
    out = bytearray(); i = 0
    while i < len(d):
        j = i
        while j < len(d) and d[j] == d[i] and j - i < 256: j += 1
        if j - i >= 4 or d[i] == 0xA5:
            out += bytes([0xA5, j - i - 1, d[i]])
        else:
            out += d[i:j]
        i = j
    return bytes(out)


def file_finto(cartella: Path, nome: str, immagine: np.ndarray, tipo="PMSCT_RLE1", con_segno=True, pendenza=1.0, intercetta=-1024.0) -> Path:
    meta = FileMetaDataset(); meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"; meta.MediaStorageSOPInstanceUID = generate_uid(); meta.TransferSyntaxUID = SINTASSI_PHILIPS
    ds = FileDataset(str(cartella / nome), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID; ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "CT"; ds.PatientName = "Prova^Inventata"; ds.StudyInstanceUID = generate_uid(); ds.SeriesInstanceUID = generate_uid()
    ds.Rows, ds.Columns = immagine.shape; ds.BitsAllocated = 16; ds.BitsStored = 16; ds.HighBit = 15; ds.SamplesPerPixel = 1
    ds.PixelRepresentation = 1 if con_segno else 0; ds.PhotometricInterpretation = "MONOCHROME2"
    ds.RescaleSlope = pendenza; ds.RescaleIntercept = intercetta; ds.RescaleType = "HU"; ds.PixelSpacing = [0.5, 0.5]
    ds.add_new((0x07A1, 0x0010), "LO", "ELSCINT1"); ds.add_new((0x07A1, 0x1011), "CS", tipo)
    ds.add_new((0x7FE0, 0x0010), "OW", codifica(immagine.astype(np.int16 if con_segno else np.uint16).view(np.uint16).ravel()) + b"")
    dati = ds[(0x7FE0, 0x0010)].value
    if len(dati) % 2: ds[(0x7FE0, 0x0010)].value = dati + b"\x00"      # i dati DICOM hanno lunghezza pari: un byte di riempimento
    ds.is_little_endian = True; ds.is_implicit_VR = False
    ds.save_as(str(cartella / nome), write_like_original=False)
    return cartella / nome


rng = np.random.default_rng(13)
# Un «torace» finto: fuori campo a -2000 (come gli apparecchi GE), aria, tessuto liscio, osso, un bordo netto.
y, x = np.mgrid[0:96, 0:128]
img = np.full((96, 128), -2000, dtype=np.int32)
dentro = (x - 64) ** 2 + (y - 48) ** 2 < 44 ** 2
img[dentro] = (40 + 30 * np.sin(x / 7.0) + rng.normal(0, 4, (96, 128)))[dentro].astype(np.int32)
img[(x - 64) ** 2 + (y - 48) ** 2 < 10 ** 2] = 1400
img[20:24, 30:60] = 90      # una riga col valore la cui differenza è 0x5A
img[30, 40:44] = [165, 330, 495, 660]      # differenze di 165 = 0xA5

for nome, valori in [("liscia", img), ("rumore puro", rng.integers(-2000, 3000, (64, 64))), ("tutta uguale", np.full((32, 32), -2000)), ("estremi", np.array([[-32768, 32767], [0, -1]]))]:
    v16 = valori.astype(np.int16).view(np.uint16).ravel()
    indietro = pmsct_rle1(codifica(v16))
    verifica(len(indietro) == len(v16) and np.array_equal(indietro, v16), f"decodifica senza perdita: {nome} ({len(codifica(v16))} byte per {len(v16)} valori)")

with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    f = file_finto(d, "finto.dcm", img)
    ds = pydicom.dcmread(str(f))
    try:
        ds.pixel_array; normale = True
    except Exception:  # noqa: BLE001
        normale = False
    verifica(not normale, "la libreria normale non legge questo formato (è il motivo di questo lavoro)")
    px = pixel_di(ds)
    verifica(px.dtype == np.int16 and px.shape == img.shape and np.array_equal(px, img.astype(np.int16)), "pixel_di restituisce l'immagine identica, col segno")
    senza = pixel_di(pydicom.dcmread(str(file_finto(d, "senza-segno.dcm", np.abs(img), con_segno=False))))
    verifica(senza.dtype == np.uint16 and np.array_equal(senza, np.abs(img).astype(np.uint16)), "anche senza segno")
    # un file dello stesso formato ma a colori, o con una lunghezza che non torna, NON si inventa
    for nome, modifica in [("a colori (PMSCT_RGB1)", lambda z: z.__setitem__((0x07A1, 0x1011), pydicom.DataElement((0x07A1, 0x1011), "CS", "PMSCT_RGB1"))), ("righe dichiarate in più", lambda z: setattr(z, "Rows", z.Rows + 3))]:
        z = pydicom.dcmread(str(f)); modifica(z)
        try:
            pixel_di(z); rifiutato = False
        except Exception:  # noqa: BLE001
            rifiutato = True
        verifica(rifiutato, f"rifiutato: {nome}")
    # il lettore vero della piattaforma
    py, lettore = sys.executable, str(Path(__file__).parent / "leggi-dicom.py")
    r = json.loads(subprocess.run([py, lettore, "png", str(f), "--out", str(d / "x.png")], capture_output=True, text=True).stdout or "{}")
    verifica(r.get("ok") is True and (d / "x.png").stat().st_size > 500, f"leggi-dicom.py png la disegna ({r.get('larghezza')}x{r.get('altezza')})")
    r = json.loads(subprocess.run([py, lettore, "statistiche", str(f), "--tipo", "rettangolo", "--punti", json.dumps([{"x": 57, "y": 41}, {"x": 71, "y": 55}])], capture_output=True, text=True).stdout or "{}")
    verifica(r.get("stato") == "ok" and r.get("unita") == "HU" and abs(r.get("media", 0) - (1400 - 1024)) < 1e-6, f"le statistiche sono in HU e giuste: l'«osso» finto vale {r.get('media')} (atteso {1400 - 1024})")

# La RICEZIONE (15.10.2026): il ricevitore del Mac accetta anche la sintassi privata — un ricevitore di prova in una
# cartella temporanea, su una porta a parte, riceve per C-STORE un'immagine finta in quel formato e la salva com'è.
import os, socket, time  # noqa: E401,E402
from pynetdicom import AE  # noqa: E402
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    sk = socket.socket(); sk.bind(("127.0.0.1", 0)); porta = sk.getsockname()[1]; sk.close()
    (d / "ricezione.conf").write_text(f"AE_TITLE=REFERRALFLOW\nPORTA={porta}\nCONSENTITI=*@127.0.0.1\nFLOW_URL=http://127.0.0.1:9/\nFLOW_TOKEN=prova\n")
    srv = subprocess.Popen([sys.executable, str(Path(__file__).parent / "ricevi-dicom.py")], env={**os.environ, "REFERTI_IMAGING_BASE": str(d)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        f = file_finto(d, "da-mandare.dcm", img)
        ds = pydicom.dcmread(str(f))
        # il mittente di prova deve sapere che è una sintassi «little endian, VR esplicito» (lo sa il Portal, non pydicom)
        # (solo in questo processo di prova, che fa la parte del Portal: il ricevitore vero non ne ha bisogno)
        U = pydicom.uid.UID
        for nome, val in [("is_transfer_syntax", True), ("is_implicit_VR", False), ("is_little_endian", True), ("is_compressed", False), ("is_deflated", False), ("is_encapsulated", False)]:
            vecchia = getattr(U, nome)
            setattr(U, nome, property(lambda self, v=val, o=vecchia: v if str(self) == SINTASSI_PHILIPS else o.fget(self)))
        ae = AE(ae_title="PROVAPHILIPS"); ae.add_requested_context(ds.SOPClassUID, [SINTASSI_PHILIPS])
        esito = None
        for _ in range(40):
            assoc = ae.associate("127.0.0.1", porta, ae_title="REFERRALFLOW")
            if assoc.is_established:
                accettata = any(c.transfer_syntax[0] == SINTASSI_PHILIPS for c in assoc.accepted_contexts)
                st = assoc.send_c_store(str(f)) if accettata else None      # il file com'è: il mittente non lo ricodifica
                esito = (accettata, getattr(st, "Status", None)); assoc.release(); break
            time.sleep(0.25)
        arrivati = list((d / "ingresso").glob("*.dcm")) if (d / "ingresso").exists() else []
        uguale = bool(arrivati) and np.array_equal(pixel_di(pydicom.dcmread(str(arrivati[0]))), img.astype(np.int16))
        verifica(esito == (True, 0) and len(arrivati) == 1 and uguale, f"ricezione: il formato privato è accettato, salvato e si rilegge identico ({esito}, {len(arrivati)} file)")
    finally:
        srv.terminate(); srv.wait(timeout=10)

print(f"{ok} ok, {no} no")
sys.exit(1 if no else 0)
