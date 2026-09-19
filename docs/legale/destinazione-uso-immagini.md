# Destinazione d'uso delle immagini diagnostiche in ReferralFlow

Stato: bozza di lavoro, 19 settembre 2026. Da far validare dallo stesso
incarico regolatorio di [destinazione-uso-ai.md](destinazione-uso-ai.md).
**Non è un parere legale né regolatorio.**

## Perché questa pagina esiste

Il 18.9.2026 la funzione «Immagini» è entrata in ReferralFlow riprendendo il
modello dei dati e il lettore DICOM dal progetto a sé `imaging-server`. Quel
progetto ha una destinazione d'uso **dichiaratamente diagnostica** («il medico
riceve, consulta e misura le immagini in questo sistema e vi redige e firma il
referto») e quindi un percorso da **classe IIa con organismo notificato**.

ReferralFlow ha la strategia opposta, scritta e motivata: restare **fuori** dal
perimetro dispositivo medico. Le due cose non possono convivere nello stesso
prodotto. Questa pagina fissa quale delle due vale **dentro ReferralFlow**.

## La destinazione d'uso, in una frase

> La funzione Immagini di ReferralFlow **riceve, archivia, organizza e mostra**
> gli esami per immagini di un paziente. Serve a **ritrovare e consultare** un
> esame nel contesto della sua cartella. **Non è lo strumento su cui si formula
> la diagnosi**: la lettura diagnostica avviene sulla console dell'apparecchio
> o su un visualizzatore certificato, e il referto nasce dal dettato del medico
> come tutti gli altri referti della piattaforma.

| Voce | Contenuto |
|---|---|
| Funzione | ricezione DICOM (C-STORE), archiviazione, indicizzazione, abbinamento al paziente, visualizzazione per consultazione |
| Uso previsto | ritrovare l'esame giusto della persona giusta; guardarlo mentre si parla con il paziente o si prepara la visita; sapere che esiste |
| **Non** previsto | refertazione primaria sull'immagine; misure a scopo diagnostico; confronto quantitativo; screening; qualunque decisione clinica presa guardando questo schermo |
| Utilizzatori | medici, aiuto medici, segreteria, amministrazione dello studio (mai il ruolo tecnico) |
| Prestazioni essenziali | integrità (i byte archiviati sono i byte ricevuti), **corretta associazione immagine–paziente**, tracciabilità di chi ha aperto cosa |

## Le tre cose che tengono in piedi questa dichiarazione

Una destinazione d'uso vale quanto quello che il prodotto fa davvero. Tre
scelte la rendono vera, e vanno difese:

1. **Niente misure.** Nessuno strumento di misura sull'immagine, nessuna
   calibrazione dichiarata, nessun valore numerico derivato dai pixel. Il
   giorno che si aggiunge un righello, questa pagina non vale più.
2. **Niente elaborazione presentata come diagnostica.** Le finestre
   (mediastino, polmone, osso) sono presentazione, non analisi. MPR, 3D e
   qualunque calcolo automatico restano fuori.
3. **L'avviso a schermo**, visibile dove si guardano le immagini: *«Consultazione:
   la diagnosi si fa sulla console dell'apparecchio o su un visualizzatore
   certificato»*. Non è burocrazia — è ciò che rende la dichiarazione onesta
   davanti a chi lavora.

## Che cosa NON si può aggiungere senza una Regulatory Opinion

- Misure, ROI, angoli, calibrazione del monitor.
- Confronto automatico con esami precedenti, o qualunque evidenziazione di
  «cosa è cambiato».
- Qualunque analisi automatica o AI sulle immagini (rilevazione, segmentazione,
  punteggi), anche solo «come proposta».
- Presentare la piattaforma come PACS diagnostico in un'offerta commerciale.

## Se un giorno si vuole la strada diagnostica

Allora vale il percorso di `imaging-server/docs/DESTINAZIONE_D_USO.md`: classe
IIa (da confermare), organismo notificato, ISO 13485, ISO 14971, IEC 62304,
IEC 62366-1, IEC 81001-5-1, valutazione clinica, sorveglianza post-vendita,
PRRC, UDI, registrazione Swissmedic. È una decisione d'impresa, non una
funzione da aggiungere: si comincia dal sistema qualità, non dal codice.

Esiste una terza via per il **solo uso interno** (MDR art. 5(5) / ODmed art. 9,
dispositivi fabbricati e usati nella stessa istituzione sanitaria): niente
marcatura CE, ma sistema qualità, fascicolo, dichiarazione pubblica e revisione
dell'esperienza d'uso — e soprattutto **il divieto di cederlo ad altri** e
l'obbligo di giustificare che nessun dispositivo equivalente sul mercato copre
il bisogno *al livello di prestazione adeguato*. Il prezzo di un concorrente
**non è** una giustificazione ammessa.
