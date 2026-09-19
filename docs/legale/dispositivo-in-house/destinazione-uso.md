# Destinazione d'uso — Righello ReferralFlow

Versione 1.0 · 19 settembre 2026 · bozza per il titolare dello studio.

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

> Il Righello misura la **distanza lineare** fra due punti scelti dall'operatore
> su un'immagine diagnostica bidimensionale in formato DICOM, applicando la
> calibrazione (millimetri per pixel) scritta nel file dall'apparecchio che ha
> acquisito l'immagine. Serve al medico come **supporto alla valutazione** di
> un esame già acquisito, nel contesto della cartella del paziente.

## Uso previsto

| Voce | Contenuto |
|---|---|
| Funzione | distanza fra due punti, in millimetri, con un decimale |
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
- Non calcola aree, volumi, angoli, frazioni, velocità, gradienti.
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
   fotogramma, con quali punti e quale calibrazione; annullamenti registrati.
5. **Stesso numero ovunque**: il browser mostra ciò che il server ricalcola e
   salva, con lo stesso codice.
