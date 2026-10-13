# Pagine INVENTATE per il banco «scritta a mano o stampata?» di Dividi cartella: stampate, scritte con caratteri che
# imitano la penna, moduli compilati a penna. Niente di vero: testi finti, nomi finti. Uso: pagine.py <cartella di uscita>
import sys, os, random
from PIL import Image, ImageDraw, ImageFont
S = '/System/Library/Fonts/Supplemental/'
def car(nome, px, indice=0):
    for p in (S + nome, '/System/Library/Fonts/' + nome):
        if os.path.exists(p):
            return ImageFont.truetype(p, px, index=indice)
    return ImageFont.load_default()
ST = lambda px: car('Helvetica.ttc', px)
STB = lambda px: car('Helvetica.ttc', px, 1)
MANO = {'bradley': lambda px: car('Bradley Hand Bold.ttf', px), 'snell': lambda px: car('SnellRoundhand.ttc', px), 'brush': lambda px: car('Brush Script.ttf', px), 'chalk': lambda px: car('Chalkduster.ttf', px)}
W, H = 1240, 1754   # A4 a 150 punti
BLU, NERO = (25, 40, 150), (20, 20, 20)
def foglio(): im = Image.new('RGB', (W, H), (252, 252, 250)); return im, ImageDraw.Draw(im)
def righe(d, x, y, testo, f, passo, colore=NERO, storta=0):
    for r in testo:
        d.text((x + random.randint(-storta, storta), y + random.randint(-storta, storta)), r, font=f, fill=colore); y += passo
    return y
LETTERA = ['Caro collega,', '', 'ho rivisto il paziente inventato in data 03.02.2021 per il controllo annuale.', 'Riferisce di stare bene, senza dispnea né dolori toracici. Assume regolarmente', 'la terapia prescritta e non segnala effetti collaterali.', '',
           'Clinicamente compensato, PA 130/80 mmHg, FC 64/min, peso 78 kg.', "All'ECG ritmo sinusale, 64/min, senza alterazioni della ripolarizzazione.", "All'ecocardiogramma funzione sistolica conservata, FE 60%, valvole nella norma.", '',
           'In conclusione quadro stabile. Propongo di proseguire la terapia in corso', 'e un controllo clinico fra dodici mesi.', '', 'Cordiali saluti', '', 'Dr. med. Inventato Finto']
APPUNTI = ['12.3.2021', 'ctrl. annuale - sta bene', 'no dispnea, no DT', 'PA 135/80   FC 68   kg 79', 'ECG: RS 68/min ok', 'eco: FE 60%, valv. ok', '-> continua terapia', '-> ctrl 12 mesi + Holter', 'tel. alla figlia per appuntamento', 'chiedere esami al medico curante', 'ricetta ripetibile fatta']
def testata(d): d.text((90, 70), 'Studio Medico Inventato', font=STB(34), fill=(30, 60, 140)); d.text((90, 115), 'Via Finta 1 · 6900 Città di Prova · Tel. 091 000 00 00', font=ST(20), fill=(90, 90, 90)); d.line((90, 150, W - 90, 150), fill=(30, 60, 140), width=2)
def stampata_lettera(firma=True, nota=False):
    im, d = foglio(); testata(d); d.text((760, 200), 'Egregio Signor\nDr. med. Altro Inventato\nVia di Prova 2', font=ST(24), fill=NERO); d.text((90, 360), 'Città di Prova, 03.02.2021', font=ST(24), fill=NERO)
    d.text((90, 420), 'VISITA AMBULATORIALE, RAPPORTO', font=STB(26), fill=NERO); y = righe(d, 90, 490, LETTERA, ST(25), 42)
    if firma: d.text((110, y - 30), 'I. Finto', font=MANO['snell'](54), fill=BLU)
    if nota: d.text((820, 430), 'visto, ok  4.2.21', font=MANO['bradley'](34), fill=BLU)
    return im
def manoscritta(stile, colore=BLU):
    im, d = foglio(); f = MANO[stile](58 if stile != 'snell' else 66); y = 120
    for k in range(18): d.line((80, 200 + k * 84, W - 80, 200 + k * 84), fill=(205, 215, 235), width=1)
    righe(d, 110, y, APPUNTI + APPUNTI[1:6], f, 84, colore, storta=7); return im
def modulo(compilato=True):
    im, d = foglio(); testata(d); d.text((90, 190), 'SCHEDA DI VISITA', font=STB(30), fill=NERO)
    campi = ['Cognome e nome', 'Data della visita', 'Motivo', 'Pressione arteriosa', 'Frequenza cardiaca', 'Peso', 'Terapia in corso', 'Allergie', 'ECG', 'Ecocardiogramma', 'Decisione', 'Prossimo controllo']
    valori = ['Prova Anna', '12.3.2021', 'controllo annuale', '135/80', '68', '79 kg', 'invariata', 'nessuna', 'RS, ok', 'FE 60%', 'continua', '12 mesi']
    y = 270
    for c, v in zip(campi, valori):
        d.text((90, y), c + ':', font=ST(24), fill=NERO); d.line((420, y + 34, W - 90, y + 34), fill=(120, 120, 120), width=1)
        if compilato: d.text((440 + random.randint(-6, 6), y - 22), v, font=MANO['bradley'](46), fill=BLU)
        y += 84
    for k, voce in enumerate(['Fumo', 'Diabete', 'Ipertensione', 'Dislipidemia', 'Familiarità']):
        x = 90 + k * 225; d.rectangle((x, y + 20, x + 30, y + 50), outline=NERO, width=2); d.text((x + 42, y + 22), voce, font=ST(22), fill=NERO)
        if compilato and k in (2, 3): d.line((x - 4, y + 16, x + 34, y + 54), fill=BLU, width=4); d.line((x + 34, y + 16, x - 4, y + 54), fill=BLU, width=4)
    if compilato: righe(d, 100, y + 110, ['note: tel. figlia, portare esami', 'rivedere con Holter'], MANO['bradley'](46), 70, BLU, 5)
    return im
def laboratorio():
    im, d = foglio(); d.text((90, 70), 'Laboratorio di Prova SA', font=STB(32), fill=NERO); d.text((90, 120), 'Rapporto di analisi · prelievo del 01.02.2021', font=ST(22), fill=NERO)
    voci = [('Emoglobina', '142', 'g/l', '120 - 160'), ('Leucociti', '6.4', 'G/l', '4.0 - 10.0'), ('Trombociti', '231', 'G/l', '150 - 400'), ('Creatinina', '78', 'µmol/l', '45 - 84'), ('Potassio', '4.2', 'mmol/l', '3.5 - 5.1'), ('Sodio', '140', 'mmol/l', '136 - 145'),
            ('Colesterolo totale', '4.9', 'mmol/l', '< 5.0'), ('LDL', '2.6', 'mmol/l', '< 3.0'), ('HDL', '1.5', 'mmol/l', '> 1.0'), ('Trigliceridi', '1.3', 'mmol/l', '< 1.7'), ('HbA1c', '5.6', '%', '< 6.0'), ('TSH', '2.1', 'mU/l', '0.3 - 4.2'), ('NT-proBNP', '96', 'ng/l', '< 125'), ('CRP', '2', 'mg/l', '< 5')]
    y = 210; d.text((90, y), 'Analisi', font=STB(24), fill=NERO); d.text((560, y), 'Risultato', font=STB(24), fill=NERO); d.text((760, y), 'Unità', font=STB(24), fill=NERO); d.text((930, y), 'Riferimento', font=STB(24), fill=NERO); y += 46
    for a, v, u, r in voci:
        d.line((90, y - 6, W - 90, y - 6), fill=(190, 190, 190), width=1); d.text((90, y), a, font=ST(24), fill=NERO); d.text((560, y), v, font=ST(24), fill=NERO); d.text((760, y), u, font=ST(24), fill=NERO); d.text((930, y), r, font=ST(24), fill=NERO); y += 46
    return im
random.seed(7)
PAGINE = [('stampata-lettera-firmata', stampata_lettera(True), False), ('stampata-lettera-con-una-nota', stampata_lettera(True, True), False), ('stampata-laboratorio', laboratorio(), False), ('modulo-vuoto', modulo(False), False),
          ('mano-appunti-bradley-blu', manoscritta('bradley'), True), ('mano-appunti-snell-nera', manoscritta('snell', NERO), True), ('mano-appunti-brush', manoscritta('brush', NERO), True), ('modulo-compilato-a-penna', modulo(True), True)]
if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for nome, im, mano in PAGINE: im.save(os.path.join(out, f"{'M' if mano else 'S'}-{nome}.png"))
    print(len(PAGINE))
