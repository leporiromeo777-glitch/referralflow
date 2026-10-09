#!/usr/bin/env python3
"""Dividi cartella: trova i fogli separatori col codice a barre (docs/wiki/Piattaforma/Dividi cartella.md).

Una cartella cartacea scansionata porta spesso, fra un gruppo di documenti e l'altro, un foglio con un
codice a barre (Code 39) che dice che tipo di documenti seguono. Qui si trovano quei fogli e si legge il
codice: niente altro della pagina. Tutto in locale (ghostscript + Pillow + numpy).

  separatori.py <file.pdf>            → JSON {"pagine": N, "separatori": [{"pagina", "codice"}]}
Nei log non finisce niente: l'uscita è solo quel JSON.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

GS = os.environ.get('GS_BIN', '/opt/homebrew/bin/gs')
# Code 39: nove elementi per carattere (barra, spazio, barra, …), tre larghi (1) e sei stretti (0).
C39 = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001', '5': '100110000',
    '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000', 'G': '000001101', 'H': '100001100',
    'I': '001001100', 'J': '000011100', 'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110',
    'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100', '$': '010101000', '/': '010100010',
    '+': '010001010', '%': '000101010',
}
DA_MOTIVO = {v: k for k, v in C39.items()}


def fasce(a, alta=24):
    """Le fasce orizzontali che sembrano un codice a barre: colonne nette (tutte scure o tutte chiare) e molte alternanze."""
    h, w = a.shape
    trovate = []
    for y in range(0, h - alta, alta // 2):
        m = a[y:y + alta].mean(axis=0)
        cambi = np.flatnonzero(np.diff((m < 0.5).astype(np.int8)))
        if len(cambi) < 24:
            continue
        larga = int(w * 0.3)
        j = meglio = x0 = 0
        for i in range(len(cambi)):
            while cambi[i] - cambi[j] > larga:
                j += 1
            if i - j + 1 > meglio:
                meglio, x0 = i - j + 1, int(cambi[j])
        if meglio < 24:
            continue
        tratto = m[x0:x0 + larga]
        if ((tratto < 0.25) | (tratto > 0.75)).mean() > 0.8:
            trovate.append(y)
    return trovate


def corse(riga):
    """Da una riga di grigi alle lunghezze delle barre e degli spazi, cominciando da una barra."""
    lo, hi = np.percentile(riga, 5), np.percentile(riga, 95)
    if hi - lo < 0.25:
        return []
    b = (riga < (lo + hi) / 2).astype(np.int8)
    bordi = np.flatnonzero(np.diff(b)) + 1
    tagli = np.concatenate(([0], bordi, [len(b)]))
    lung = np.diff(tagli)
    primo = 0 if b[0] == 1 else 1
    return list(lung[primo:])


def leggi_corse(c):
    """Cerca nelle corse «*…*»: il testo fra i due asterischi, o None."""
    n = len(c)
    for i in range(0, n - 18, 2):
        testo, k, ok = [], i, True
        while k + 9 <= n:
            nove = c[k:k + 9]
            ordinate = sorted(nove)
            stretto, largo = ordinate[5], ordinate[6]
            if largo < 1.5 * stretto or ordinate[8] > 4.5 * max(1, ordinate[0]) * 2.2:
                ok = False
                break
            soglia = (stretto + largo) / 2
            motivo = ''.join('1' if x > soglia else '0' for x in nove)
            car = DA_MOTIVO.get(motivo)
            if car is None or (not testo and car != '*'):
                ok = False
                break
            testo.append(car)
            if car == '*' and len(testo) > 1:
                break
            # lo spazio fra un carattere e l'altro è stretto
            if k + 9 >= n or c[k + 9] > soglia * 1.6:
                ok = False
                break
            k += 10
        if ok and len(testo) >= 3 and testo[0] == '*' and testo[-1] == '*':
            return ''.join(testo[1:-1])
    return None


def leggi_codice(a):
    """Il codice della pagina (immagine in grigi 0..1), provando più righe delle fasce e i due versi."""
    voti = {}
    for y in fasce(a):
        for dy in (4, 10, 16):
            riga = a[y + dy - 2:y + dy + 2].mean(axis=0)
            for verso in (riga, riga[::-1]):
                t = leggi_corse(corse(verso))
                if t:
                    voti[t] = voti.get(t, 0) + 1
    return max(voti, key=voti.get) if voti else None


def immagine(f):
    return np.asarray(Image.open(f).convert('L'), dtype=np.float32) / 255.0


def separatori(pdf):
    with tempfile.TemporaryDirectory(prefix='rf-sep-') as d:
        os.chmod(d, 0o700)
        subprocess.run([GS, '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pnggray', '-r72', f'-sOutputFile={d}/p-%04d.png', pdf],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=900)
        file = sorted(x for x in os.listdir(d) if x.startswith('p-'))
        trovati = []
        for k, nome in enumerate(file, start=1):
            a = immagine(os.path.join(d, nome))
            candidati = [a, a.T] if fasce(a) or fasce(a.T) else []
            if not candidati:
                continue
            # La pagina candidata si rilegge più fitta: a 72 punti le barre strette sono un pixel.
            fitta = os.path.join(d, f'f-{k}.png')
            subprocess.run([GS, '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pnggray', '-r200', f'-dFirstPage={k}', f'-dLastPage={k}', f'-sOutputFile={fitta}', pdf],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
            b = immagine(fitta)
            codice = leggi_codice(b) or leggi_codice(b.T)
            os.remove(fitta)
            if codice:
                trovati.append({'pagina': k, 'codice': codice})
        return {'pagine': len(file), 'separatori': trovati}


if __name__ == '__main__':
    try:
        print(json.dumps(separatori(sys.argv[1])))
    except Exception as e:  # mai il contenuto: solo il tipo d'errore
        print(json.dumps({'errore': type(e).__name__}))
        sys.exit(1)
