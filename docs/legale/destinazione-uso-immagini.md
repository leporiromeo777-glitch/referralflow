# Destinazione d'uso delle immagini diagnostiche in ReferralFlow

Stato: bozza di lavoro, aggiornata il **19 settembre 2026** (prima stesura
18.9.2026). Da far validare dallo stesso incarico regolatorio di
[destinazione-uso-ai.md](destinazione-uso-ai.md). **Non è un parere legale
né regolatorio.**

## Perché questa pagina esiste

Il 18.9.2026 la funzione «Immagini» è entrata in ReferralFlow riprendendo il
modello dei dati e il lettore DICOM dal progetto a sé `imaging-server`. Il
19.9.2026 lo studio ha deciso di aggiungere un **righello** (distanze fra due
punti) e di percorrere per quella sola funzione la strada del **dispositivo
fabbricato e usato dentro lo studio** (ODmed art. 9, notifica art. 18).
Questa pagina divide in due la funzione Immagini: ciò che resta fuori dal
perimetro del dispositivo medico, e ciò che ci entra.

## Parte 1 — fuori dal perimetro: ricevere, archiviare, consultare

> La funzione Immagini di ReferralFlow **riceve, archivia, organizza e mostra**
> gli esami per immagini di un paziente e **presenta** le misure che
> l'apparecchio ha già fatto. Serve a **ritrovare e consultare** un esame nel
> contesto della sua cartella. Il referto nasce dal dettato del medico come
> tutti gli altri referti della piattaforma.

| Voce | Contenuto |
|---|---|
| Funzione | ricezione DICOM (C-STORE), archiviazione, indicizzazione, abbinamento al paziente, visualizzazione, lettura delle misure dal referto strutturato dell'apparecchio |
| Prestazioni essenziali | integrità (i byte archiviati sono i byte ricevuti), **corretta associazione immagine–paziente**, tracciabilità di chi ha aperto cosa |
| Non produce | nessun valore clinico derivato dai pixel; le finestre (mediastino, polmone, osso) sono presentazione, non analisi |

Questa parte **non è un dispositivo medico** e non lo diventa finché non
elabora né misura. Restano fuori, senza una Regulatory Opinion: confronto
automatico fra esami, qualunque analisi o AI sulle immagini, MPR/3D presentati
come diagnostici.

## Parte 2 — dentro il perimetro: il Righello

> Il Righello misura la **distanza lineare** fra due punti scelti dal medico
> su un'immagine DICOM, con la calibrazione scritta nel file dall'apparecchio.
> È un **dispositivo medico di classe IIa (regola 11) fabbricato e usato
> esclusivamente nello studio**, senza marcatura CE, ai sensi dell'art. 9 ODmed
> / art. 5 par. 5 MDR, con lo studio come fabbricante.

Tutto il fascicolo — destinazione d'uso di dettaglio, giustificazione
dell'assenza di equivalenti, analisi dei rischi, piano di validazione,
descrizione tecnica, notifica a Swissmedic, dichiarazione pubblica — è in
[dispositivo-in-house/](dispositivo-in-house/README.md). Le condizioni che
lo tengono in piedi:

1. **Il fabbricante è lo studio**, e lo dichiara: firma, notifica, riesame.
2. **Nessuna cessione**: il Righello non esce dallo studio. Il giorno che
   ReferralFlow entra in un secondo studio, lì il Righello è spento, oppure si
   certifica.
3. **Solo distanze, solo con calibrazione del file**: niente aree, angoli,
   Doppler, radiografie, immagini esportate. Il software rifiuta, non stima.
4. **Validato prima dell'uso** e rivalidato a ogni modifica del calcolo.
5. **La misura non entra da sola nel referto**: la cita il medico, nel dettato.

## L'avviso a schermo

Dove si guardano le immagini resta scritto: *«Consultazione e misura di
distanze — la diagnosi è del medico»*. Non è burocrazia: è ciò che rende
oneste entrambe le parti di questa pagina davanti a chi lavora.

## Se un giorno si vuole la strada commerciale

Allora vale il percorso di `imaging-server/docs/DESTINAZIONE_D_USO.md`: classe
IIa, organismo notificato, ISO 13485, ISO 14971, IEC 62304, IEC 62366-1,
IEC 81001-5-1, valutazione clinica, sorveglianza post-vendita, PRRC, UDI,
registrazione Swissmedic. Il fascicolo in-house è il primo mattone di quel
percorso, non un'alternativa.
