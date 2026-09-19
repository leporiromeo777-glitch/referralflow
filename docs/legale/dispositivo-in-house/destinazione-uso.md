# Destinazione d'uso — Righello ReferralFlow

Versione 1.2 · 20 settembre 2026 · bozza per il titolare dello studio. **La 1.1 estende la 1.0** (sola distanza) agli strumenti della fase 3; **la 1.2** aggiunge le statistiche dei pixel (HU), i multiframe con spaziatura per fotogramma, la distanza 3D fra fette, il volume per somma di fette e i piani ricostruiti (MPR). Ogni funzione nuova entra in uso clinico solo dopo la sua validazione (piano §3); quelle della 1.2 nascono come CAUTION bloccate.

## Nome e identificazione

- **Nome**: Righello ReferralFlow (funzione «Misura» della pagina Immagini).
- **Versione**: `RFMisura.VERSIONE` in `public/prototipo/misura.js` (oggi **1.0**),
  più l'hash del commit di ReferralFlow con cui è distribuito. Ogni misura
  salvata registra la versione che l'ha calcolata.
- **Tipo**: software, funzione di un sistema più ampio (ReferralFlow), usato
  su computer e tablet dello studio attraverso il browser.
- **Fabbricante**: lo studio medico (Centro Cardiologico Ticino), ai sensi
  dell'art. 9 ODmed / art. 5 par. 5 MDR.

## Destinazione d'uso, in una frase

> Il Righello misura, su un'immagine diagnostica bidimensionale in formato
> DICOM e con la calibrazione (millimetri per pixel) scritta nel file
> dall'apparecchio che l'ha acquisita, **grandezze geometriche nel piano
> dell'immagine** scelte dall'operatore: distanza fra due punti, lunghezza di
> una polilinea, angolo fra due bracci, area e perimetro di un rettangolo, di
> un'ellisse e di un poligono tracciato a mano, coordinate di un punto. Serve
> al medico come **supporto alla valutazione** di un esame già acquisito, nel
> contesto della cartella del paziente.

## Uso previsto

| Voce | Contenuto |
|---|---|
| Funzione | **distanza** (mm, un decimale); **polilinea** (mm); **angolo** (gradi, un decimale, calcolato sui millimetri); **rettangolo** ed **ellisse** con lati/assi lungo gli assi dell'immagine (area in cm² con due decimali, perimetro in mm; per l'ellisse il perimetro è dichiarato approssimato, formula di Ramanujan); **poligono** chiuso tracciato per vertici (area cm², perimetro mm; un contorno che si incrocia si rifiuta); **perimetro** di un contorno chiuso (mm); **punto** (coordinate in mm); **statistiche dei pixel** dentro rettangolo/ellisse/poligono (min, max, media, deviazione standard: in HU solo per TAC con Rescale in HU, in unità arbitrarie per la RM, mai per ecografie o immagini a colori); **distanza 3D** fra due punti su fette diverse della stessa serie, nello spazio paziente (IOP/IPP), stesso Frame of Reference; **volume** per somma delle aree di ROI su fette consecutive per la distanza reale fra le fette (mL, due decimali; CAUTION); **piani ricostruiti** sagittale e coronale da una serie a fette uniformi, su cui gli strumenti 2D misurano con la griglia virtuale dichiarata dal server (CAUTION «immagine ricostruita») |
| Immagini | DICOM ricevuti dagli apparecchi dello studio o importati da supporto; ecografie con `SequenceOfUltrasoundRegions`, TAC/RM con `PixelSpacing` |
| Utilizzatori | medici e aiuto medici dello studio (ruoli medico, aiuto medico, amministrazione); la segreteria vede le immagini ma non misura |
| Pazienti | i pazienti dello studio, adulti, in ambito cardiologico ambulatoriale |
| Contesto | consultazione dell'esame nella cartella, preparazione e discussione della visita, confronto con le misure fatte dall'apparecchio |
| Ambiente | rete locale dello studio; browser moderni (Safari, Chrome, Firefox) su Mac, PC, iPad |
| Beneficio clinico atteso | rimisurare una struttura senza tornare alla console dell'apparecchio; verificare una misura dell'apparecchio; misurare su esami arrivati da fuori |

## Non previsto (limiti d'uso dichiarati)

- **Non misura** immagini senza calibrazione nel file, immagini M-mode o
  Doppler (l'asse X è tempo o velocità), radiografie (spaziatura del
  rivelatore, non del paziente), fotogrammi esportati in JPEG/PNG. In tutti
  questi casi il software rifiuta la misura e spiega perché.
- Non calcola frazioni di eiezione, velocità, gradienti; non traccia contorni
  da solo; le figure regolari (rettangolo, ellisse) sono allineate agli assi
  dell'immagine, non ruotabili; il volume è una somma di fette (nessuna
  interpolazione, nessun modello); i piani ricostruiti sono ortogonali agli
  assi del volume (nessun piano obliquo, nessun rendering 3D); la distanza
  fra le fette viene dalle posizioni, mai da Slice Thickness.
- Non confronta esami, non segnala «cosa è cambiato», non propone diagnosi.
- Non sostituisce le misure fatte dall'ecografista sulla console durante
  l'esame, che restano la misura di riferimento.
- **Il numero non entra da solo nel referto**: il referto nasce dal dettato
  del medico, che decide se e come citare la misura.

## Classificazione

Software che fornisce informazioni usate per decisioni diagnostiche o
terapeutiche: MDR regola 11 → **classe IIa**. Dentro l'eccezione dell'art. 9
ODmed non c'è marcatura CE né organismo notificato; restano i requisiti
generali di sicurezza e prestazione (MDR allegato I), coperti in
[analisi-rischi.md](analisi-rischi.md).

## Prestazioni essenziali

1. **Esattezza della calibrazione**: i millimetri per pixel usati sono
   esattamente quelli del file DICOM, letti con l'ordine giusto (riga → Y,
   colonna → X) e con l'unità giusta (cm → mm per le ecografie).
2. **Esattezza del calcolo**: la distanza è la radice della somma dei quadrati
   degli spostamenti *in millimetri* su ciascun asse (anisotropia rispettata).
3. **Rifiuto quando non si può**: senza calibrazione, fuori dalla regione
   calibrata, fra due regioni diverse, su radiografie → nessun numero.
4. **Tracciabilità**: chi ha misurato, quando, su quale immagine e
   fotogramma, con quale strumento, quali punti e quale calibrazione;
   annullamenti e sostituzioni registrati.
5. **Stesso numero ovunque**: il browser mostra ciò che il server ricalcola e
   salva, con lo stesso codice, e un secondo calcolo indipendente coincide.
6. **Tutti i vertici nella stessa calibrazione**: per le ecografie ogni
   punto di una figura sta nella stessa regione, o la misura non esiste.
7. **Spazio paziente solo dai tag**: IOP, IPP, spaziatura e Frame of
   Reference; fette ordinate lungo la normale, distanza dalle posizioni;
   serie non uniformi → niente volume, niente MPR.
8. **Statistiche solo dove hanno senso**: HU con Rescale in HU, due calcoli
   che coincidono, altrimenti nessun numero.
