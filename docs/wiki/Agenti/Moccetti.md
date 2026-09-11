---
tipo: agente
medico: moccetti
aggiornata: 2026-09-12
---
# Conoscenza per gli agenti: Moccetti

Compilata in `medici.json` (profilo `moccetti`) da `compila-conoscenza.py`: le tre sezioni qui sotto diventano `contesto`, `frasi_fisse` e `farmaci_frequenti` ed entrano nel blocco «contesto del medico» di tutti i prompt di correzione. Vedi [[Agenti/Come funziona]]. Niente dati di pazienti.

## Come detta
Parla molto veloce, con frasi lunghe e incisi; detta lettere a colleghi che gli hanno inviato il paziente. Struttura tipica: saluto al collega; rimando agli incarti precedenti o breve anamnesi; esami eseguiti con date, sigle e valori (ecocardiogramma, cicloergometria o spiroergometria, CoroTAC, coronarografia, Holter); valutazione; proposta terapeutica con farmaci e dosaggi; controllo successivo; «Cordiali e collegiali saluti». Le istruzioni alla segretaria (a chi inviare, copia, cosa recuperare dalla cartella) le detta dentro il flusso.

## Frasi fisse
- non ritorno sull'anamnesi del paziente in quanto già presente nei miei incarti precedenti
- già presente nel mio incarto del
- rivedo in data … il paziente a margine
- Mi limito ad inviarti le mie considerazioni a seguito della valutazione avvenuta in data
- riferisce di stare bene e nega sintomatologia ascrivibile alla sfera cardiologica
- Clinicamente mi confronto con un paziente di … Kg per … cm, PA … mmHg, FC … bpm
- Non vi sono segni per scompenso cardiaco
- ritmo sinusale regolare normocardico con PR nella norma e QRS fine
- Assenza di alterazioni specifiche della ripolarizzazione
- In conclusione, alla luce degli elementi di cui sopra
- a completamento diagnostico prevedo nelle prossime settimane
- Frattanto la terapia in atto rimane invariata
- Dal canto mio un prossimo controllo è da prevedersi non prima di
- rimanendo a disposizione Tua e del paziente qualora la clinica richiedesse un controllo anticipato
- A Te chiedo di ricontrollare periodicamente il profilo lipidico e l'evoluzione pressoria
- propongo di continuare con la terapia in atto lasciando a Te il compito di rivalutare periodicamente il profilo lipidico e l'evoluzione pressoria
- che mi legge in copia
- Cordiali e collegiali saluti

## Lettera tipo
Scheletro della lettera come la scrive la segretaria, ricavato da dodici lettere anonimizzate (11.9.2026). Solo segnaposto, nessun dato. Compilato in `medici.json` (`lettera_tipo`) ed entra nel prompt di «Impagina come lettera» come primo esempio di forma; intestazione, data, titolo, riga del paziente, firma, «Copia» e «Allegato» li mette il codice o la segretaria, NON il modello.

```
Caro {nome del collega},

non ritorno sull'anamnesi del paziente in quanto già presente nei miei incarti precedenti.
Rivedo in data {gg.mm.aaaa} il paziente a margine nell'ambito di un controllo annuale. Egli riferisce di stare bene e nega sintomatologia ascrivibile alla sfera cardiologica.

FRCV: {fattori di rischio}.

Comorbidità: {comorbidità}.

Clinicamente mi confronto con un paziente di {peso} Kg per {altezza} cm, PA {sistolica}/{diastolica} mmHg, FC {frequenza} bpm. Non vi sono segni per scompenso cardiaco.

Elettrocardiogramma: ritmo sinusale regolare normocardico con PR nella norma e QRS fine. Assenza di alterazioni specifiche della ripolarizzazione.

Ecocardiogramma: {esito in una o due frasi, con FE in percentuale}.

In conclusione, alla luce degli elementi di cui sopra, {valutazione e proposta}. Frattanto la terapia in atto rimane invariata.
Dal canto mio un prossimo controllo è da prevedersi non prima di 12 mesi, rimanendo a disposizione Tua e del paziente qualora la clinica richiedesse un controllo anticipato.
A Te chiedo di ricontrollare periodicamente il profilo lipidico e l'evoluzione pressoria.

Cordiali e collegiali saluti.
```

## Regole di forma
- Saluto «Caro {nome},» o «Cara {nome},» con il nome del collega; senza nome «Gentile Collega,». Il corpo riprende in minuscolo.
- Paragrafi separati da una riga vuota; etichette a inizio riga: «FRCV:», «Comorbidità:», «Allergie e intolleranze:», «Elettrocardiogramma:», «Ecocardiogramma:», «Holter ({data}):».
- Misure sempre così: «{n} Kg per {n} cm, PA {n}/{n} mmHg, FC {n} bpm»; frazione di eiezione «FE {n}%»; date «gg.mm.aaaa».
- Forme di cortesia con la maiuscola: «Ti», «Te», «Tua», «Tuo».
- «il paziente a margine» indica il paziente della lettera; poi «egli», «ella», «la paziente».
- La conclusione comincia con «In conclusione, alla luce degli elementi di cui sopra,».
- Il blocco «Terapia:» (una riga per farmaco: NOME dose schema, «IR» = in riserva) e la chiusura «Cordiali e collegiali saluti.» li mette il codice: il modello non li scrive.
- «Copia:», «Allegato:», «(partito dopo dettatura)» stanno fuori dalla lettera: mai nel corpo.

## Farmaci frequenti
Aspirina Cardio (acido acetilsalicilico), Clopidogrel (Plavix), Brilique (ticagrelor), Efient (prasugrel), Xarelto (rivaroxaban), Eliquis (apixaban), Lixiana (edoxaban), Pradaxa (dabigatran), Marcoumar (fenprocumone), Concor (bisoprololo), Beloc Zok (metoprololo), Carvedilolo (Dilatrend), Nebilet (nebivololo), Valsartan (Diovan), Olmesartan (Votum, Olmetec), Candesartan (Atacand, Blopress), Losartan (Cosaar), Enalapril (Reniten), Lisinopril (Zestril), Perindopril (Coversum), Ramipril (Triatec), Co-Epril, Exforge, Entresto (sacubitril/valsartan), Amlodipina (Norvasc), Lercanidipina (Zanidip), Nifedipina (Adalat), Diltiazem (Dilzem), Verapamil (Isoptin), Torasemide (Torem), Lasix (furosemide), Spironolattone (Aldactone), Eplerenone (Inspra), Esidrex (idroclorotiazide), Comilorid (amiloride), Atorvastatina (Sortis), Rosuvastatina (Crestor), Pravastatina (Selipran), Ezetimibe (Ezetrol), Zenon (rosuvastatina/ezetimibe), Praluent (alirocumab), Repatha (evolocumab), Leqvio (inclisiran), Jardiance (empagliflozin), Forxiga (dapagliflozin), Metformina (Glucophage), Ozempic (semaglutide), Cordarone (amiodarone), Tambocor (flecainide), Multaq (dronedarone)

## Per le persone (non compilato)
Modalità lettera, formato lettera, terapia strutturata, atempo 0.8 (deciso il 7.9.2026). Il resto in [[Medici/Moccetti]].
