# Analisi dei rischi — Righello ReferralFlow

Impostata come ISO 14971 (pericolo → situazione pericolosa → danno → misure →
rischio residuo → verifica). Versione 1.0, 19.9.2026. Gravità: **A** lieve
(nessun effetto clinico), **B** moderata (misura errata che potrebbe
orientare una decisione, ma verificabile), **C** grave (misura errata non
riconoscibile che entra in una decisione). Probabilità: 1 rara, 2 possibile,
3 probabile.

| # | Pericolo | Situazione | Danno | G | P | Misure adottate (dove) | Residuo | Verifica |
|---|---|---|---|---|---|---|---|---|
| R1 | Calibrazione letta con gli assi invertiti (PixelSpacing = [riga, colonna]) | pixel anisotropi, misura obliqua | misura sbagliata fino al rapporto fra i due spacing | C | 2 | lettura esplicita riga→dy, colonna→dx (`leggi-dicom.py calibrazione_di`); prova sintetica con spacing 0,75/0,5 | A | `prova-calibrazione.py` caso 1; test node «diagonale» |
| R2 | Unità sbagliata nelle ecografie (cm invece di mm) | misura 10 volte più piccola | C | 2 | si accettano solo regioni con `PhysicalUnits = 3 (cm)` su entrambi gli assi e si converte ×10; tutto il resto scartato | A | `prova-calibrazione.py` caso 3 |
| R3 | Misura su regione M-mode o Doppler (X = tempo) | numero senza significato mostrato come distanza | C | 2 | solo `RegionSpatialFormat = 1` (2D); le altre regioni non esistono per il righello → «fuori regione» | A | caso 3 (regione M-mode scartata); test «fuori regione» |
| R4 | Punti in due regioni con calibrazioni diverse | distanza calcolata con la calibrazione sbagliata | B | 2 | rifiuto esplicito `regioni_diverse` | A | test node |
| R5 | Immagine senza calibrazione (esportata, ricampionata, `OT`) | misura in pixel spacciata per mm | C | 2 | senza calibrazione non c'è tasto attivo utile: rifiuto `non_calibrata` in browser E in server | A | test node; e2e (`non_calibrata` 422) |
| R6 | Radiografia con `ImagerPixelSpacing` | errore d'ingrandimento 5–10% non dichiarato | B | 2 | tipo distinto `imager_pixel_spacing`, rifiuto `rivelatore` | A | caso 5; test node |
| R7 | Immagine mostrata rimpicciolita o ingrandita nel browser | coordinate dello schermo usate come pixel nativi | C | 3 | conversione `versoNativo` con scala = colonne native / larghezza mostrata, calcolata a ogni evento dal `getBoundingClientRect` | A | test node «metà larghezza»; prova nel browser a finestra ridotta |
| R8 | Schermo ad alta densità (Retina), zoom del browser | disegno sfalsato rispetto all'immagine | A | 3 | canvas dimensionato in CSS px e scalato con `devicePixelRatio`; nessuna misura dipende dal disegno, solo dai punti | A | prova visiva |
| R9 | Il browser manda un valore già calcolato | manomissione o bug lato client | B | 1 | il browser manda **solo i punti**; il server ricalcola con lo stesso `misura.js` e salva il suo risultato | A | e2e: valore atteso dal server |
| R10 | Codice del calcolo diverso fra browser e server | numeri diversi nelle due sedi | B | 1 | un solo file (`public/prototipo/misura.js`) caricato da entrambi; `versione_calcolo` salvata con la misura | A | test carica quel file; ispezione |
| R11 | Misura attribuita all'immagine o al fotogramma sbagliato | misura di un'altra immagine mostrata su questa | C | 1 | la misura salva `immagine_id` e `frame`; si disegna e si elenca solo su quelli; cambio di serie/immagine cancella la bozza | A | e2e; `fotogramma_non_valido` |
| R12 | Immagine abbinata al paziente sbagliato | misura corretta sulla persona sbagliata | C | 1 | abbinamento automatico solo con nome **e** data di nascita univoci; altrimenti «da verificare» e abbinamento manuale ([Piattaforma/Immagini]) | B | `prove-imaging.test.ts` (omonimi) |
| R13 | Punto messo con imprecisione (dito su tablet, tremolio) | errore di 1–3 px → 0,2–1 mm in eco | B | 3 | punti in coordinate frazionarie; il valore resta sullo schermo finché non si salva; si può annullare; la misura di riferimento resta quella dell'apparecchio | B | validazione clinica (scarto medio) |
| R14 | Il numero letto come diagnosi | decisione presa su una misura di supporto | B | 2 | destinazione d'uso; avviso a schermo; il referto nasce dal dettato e la misura non vi entra da sola; formazione del personale | B | lista di controllo README |
| R15 | Misura salvata e poi persa | l'operatore crede che esista | A | 1 | transazione sul database; risposta 201 solo dopo l'inserimento; elenco ricaricato dal server | A | e2e |
| R16 | Misura cancellata senza traccia | impossibile ricostruire la storia | B | 1 | niente cancellazione: `annullata_at` + `annullata_da`; l'annullata resta in elenco barrata | A | e2e (annullamento, non due volte) |
| R17 | Persona non abilitata che misura | misura di chi non ha la competenza | B | 2 | ruoli: medico, aiuto medico, amministrazione; segreteria e tecnico esclusi nel server (403) | A | e2e segretaria → 403 |
| R18 | File DICOM modificato dopo la misura | calibrazione diversa da quella usata | B | 1 | i file si scrivono una volta e mai si riscrivono; la calibrazione usata è **copiata dentro la misura** | A | ispezione; `imaging_misure_manuali.calibrazione` |
| R19 | Aggiornamento del software che cambia il calcolo | vecchie e nuove misure non confrontabili | B | 2 | `VERSIONE` del calcolo salvata per misura; ogni cambio a `misura.js` o a `calibrazione_di` richiede rivalidazione (piano §4) | A | controllo delle modifiche |
| R20 | Lettore Python assente o file illeggibile | nessuna calibrazione | A | 2 | risposta esplicita «leggo…» → «non calibrata»; niente stime | A | codice |
| R21 | Spaziatura diversa da un fotogramma all'altro (Enhanced per-frame) | si misura col valore di un altro fotogramma | C | 1 | il lettore la segnala (`per_frame`), il Gate blocca (`spacing_per_frame`) | A | `prova-geometria.py` 12; test gate |
| R22 | Due calibrazioni discordanti nello stesso file (PixelSpacing e regioni US) | si usa quella sbagliata | B | 1 | avviso di lettura → CAUTION, bloccata finché non validata; vincono le regioni | A | `prova-geometria.py` 20; test gate |
| R23 | Punto in regioni ecografiche sovrapposte con scale diverse | scala sbagliata | B | 2 | scelta per priorità dichiarata (Region Flags bit 0), poi tessuto, poi ordine; avviso → CAUTION | A | test «regioni» ×5; doppio controllo |
| R24 | Immagine derivata (MPR, secondaria) misurata come originale | ricampionamento non dichiarato | B | 2 | `ImageType` DERIVED/SECONDARY → CAUTION bloccata finché non validata | A | `prova-geometria.py` 32; e2e |
| R25 | Un solo calcolo, un solo errore | errore sistematico non visto | C | 1 | doppio controllo con implementazione separata (numpy); |A−B| > 1e-9 → non si salva, log | A | `prova-doppio-controllo.py` 1000 casi; e2e |
| R26 | Aggiornamento del software che cambia numeri già salvati | studi vecchi non più confrontabili | B | 2 | `scripts/misure-regressione.ts` ricalcola tutto prima del riavvio e blocca la distribuzione | A | `mac/aggiorna-server.sh` |
| R27 | CAUTION accettata «a occhio» | uso di una situazione non validata | B | 2 | lista `caution-validati.json`, vuota di default; solo il piano di V&V la riempie | A | test gate «bloccata finché…»; e2e DERIVED |
| R28 | Viewer con zoom/pan/rotazione che sposta i punti | misura dipendente dalla vista | C | 2 | matrice affine invertibile (`versoImmagine`); 504 combinazioni provate alla 12ª cifra | A | test «invarianza» |
| R29 | Angolo calcolato sui pixel invece che sui millimetri (pixel non quadrati) | angolo sbagliato di decine di gradi | C | 2 | bracci convertiti in mm prima dell'`atan2`; prova con 0,5 × 0,25 mm/px: 45° in pixel = 26,6° veri | A | test «angolo» |
| R30 | Poligono che si autointerseca | «area» senza significato | B | 2 | rifiuto `poligono_intrecciato` (controllo di intersezione fra tutti i lati non adiacenti) in A e in B | A | test «poligono»; doppio controllo; e2e |
| R31 | Figura con vertici in regioni ecografiche diverse | scale mescolate | C | 2 | tutti i vertici nella stessa regione o `regioni_diverse`; ordine dei rifiuti identico in A e B | A | test; doppio controllo 3000 casi |
| R32 | Perimetro dell'ellisse preso per esatto | errore fino allo 0,04 % (Ramanujan II) | A | 3 | il campo si chiama `perimetro_mm_approssimato`; l'area è esatta | A | test «ellisse» (cerchio esatto) |
| R33 | Rettangolo/ellisse ruotati rispetto agli assi dell'immagine | l'operatore crede di misurare una figura inclinata | B | 2 | gli strumenti sono dichiarati allineati agli assi (destinazione d'uso); per figure inclinate c'è il poligono | B | destinazione d'uso |
| R34 | Figura chiusa con troppo pochi punti o degenere (allineati) | area nulla presentata | B | 1 | `area_nulla`; minimo 3 vertici per poligono/perimetro | A | test «poligono» (allineati) |
| R35 | Chiusura del poligono al vertice sbagliato (doppio clic che aggiunge un vertice doppio) | un lato in più di lunghezza zero | A | 3 | il doppio clic toglie il vertice ripetuto; i vertici coincidenti sono `punti_uguali` | A | codice; prova nel browser |
| R36 | HU calcolate senza Rescale o con Rescale non in HU | numeri spacciati per Hounsfield | C | 2 | HU solo se `Modality=CT`, Rescale presente, `RescaleType` assente o HU; altrimenti `hu_non_disponibili` | A | `prova-statistiche.py` 10-11 |
| R37 | Statistiche su ecografie, immagini a colori, secondarie | livelli di grigio letti come dato clinico | B | 2 | `statistiche_non_applicabili` per tutto ciò che non è CT/MR monocromatico | A | `prova-statistiche.py` 12-13; e2e |
| R38 | Maschera della ROI sbagliata (bordi, poligono concavo) | media su pixel sbagliati | B | 2 | maschera sui centri dei pixel; ellisse per disuguaglianza; poligono pari/dispari; conteggi verificati contro l'area geometrica | A | `prova-statistiche.py` 6-8 |
| R39 | Un solo calcolo statistico | errore numerico non visto | B | 1 | numpy e libreria standard devono coincidere entro 1e-9; se no `verifica_indipendente_fallita` | A | `prova-statistiche.py` 2 |
| R40 | Multiframe con spaziatura diversa per fotogramma misurato con quella di un altro | misura sbagliata | C | 1 | calibrazione effettiva costruita dal fotogramma corrente; senza valore → `calibrazione_assente`; variabilità = CAUTION da validare | A | test «fotogrammi»; `prova-geometria.py` 12 |
| R41 | Distanza fra fette presa da Slice Thickness | passo sbagliato (spesso lo è) | C | 3 | il passo si calcola dalle IPP proiettate sulla normale; Slice Thickness si legge e si ignora | A | test «serie» (3 dichiarati, 30 reali); e2e serie |
| R42 | Serie con fette non uniformi, doppie, dimensioni o orientamento diversi, FoR diversi | volume e MPR su un volume che non è tale | C | 2 | `analizzaSerie` → `volume_possibile=false` con avvisi; volume e MPR rifiutati | A | test «serie» ×5; e2e |
| R43 | Punti 3D su immagini con Frame of Reference diverso | coordinate non confrontabili | C | 1 | `frame_of_reference_diversi`; stessa serie e stesso studio richiesti dal server | A | test; doppio controllo 3000 casi |
| R44 | Volume da ROI non consecutive, o una fetta con due ROI | somma su un insieme che non è un volume | B | 2 | `poligoni_non_consecutivi`; una sola ROI per fetta; CAUTION «somma di fette» finché non validata | A | test «volume»; e2e |
| R45 | Misura su un piano MPR con la calibrazione mandata dal browser | griglia virtuale manomessa o sbagliata | C | 1 | la griglia e la calibrazione virtuale le costruisce il SERVER dalla geometria di serie; il browser manda piano e indice; CAUTION «immagine ricostruita» | A | e2e (misura su MPR bloccata; indice fuori → 400) |
| R46 | PNG dell'MPR ricampionato a pixel isotropi letto come griglia nativa | scala sbagliata lungo le fette | C | 2 | scala PER ASSE dallo schermo alla griglia virtuale (matrice affine), y capovolta dichiarata | A | `prova-mpr.py` 1-2; codice `rfMisPunto` |
| R47 | Cache del volume MPR non aggiornata dopo un cambio dei file | ricostruzione di un volume vecchio | A | 1 | i file non si riscrivono mai; chiave della cache = sha256 dell'elenco dei file | A | `prova-mpr.py` 7 |

## Rischio complessivo

Dopo le misure, il rischio residuo più alto è **B** (R12, R13, R14) e dipende
da comportamenti umani già disciplinati (abbinamento verificato, misura di
riferimento sull'apparecchio, referto dal dettato). È accettabile per la
destinazione d'uso dichiarata (supporto, non sostituzione della console).

## Che cosa riapre questa analisi

Un nuovo tipo di misura, un piano MPR obliquo, un volume interpolato, un
cambio del lettore DICOM, del ricostruttore o del Gate,
l'aggiunta di un codice a `caution-validati.json`, una segnalazione di misura
sbagliata dall'uso clinico.
