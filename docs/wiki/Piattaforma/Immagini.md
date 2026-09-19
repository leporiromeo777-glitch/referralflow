---
tipo: piattaforma
aggiornata: 2026-09-18
---
# Immagini diagnostiche

Gli esami per immagini erano l'unica parte della cartella che la piattaforma non sapeva tenere. Arrivavano su CD e su chiavette, e per guardarli bisognava andare al PC dove è installato il visualizzatore — quello del concorrente costa **35.000 franchi l'anno** ed è monoutente ([[Proposte/CardioOS confronto per funzione]]). Dal 18.9.2026 gli esami sono una voce del menu come le altre: stesso studio, stesso paziente, stessi ruoli, stesso registro.

## Da dove viene

Il codice nasce dal progetto `imaging-server` (repo GitHub privato `leporiromeo777-glitch/imaging-server`), scritto a parte: FastAPI + SQLite + Orthanc + un visore React con Cornerstone3D. **Qui dentro non è stato copiato niente di quel programma**: è stato ripreso il modello dei dati — che è poi il modello del DICOM, e non si semplifica — e il lettore dei pixel, che è la parte difficile e provata. Il resto (elenco, permessi, abbinamento al paziente, registro) è della piattaforma, come deve essere: quello che si vede non è un programma esterno aperto dentro una finestra.

## Come è fatta

Un **esame** ha più **serie**, e ogni serie più **immagini**; un'immagine può avere più fotogrammi (un'ecografia in movimento è un file solo). Sono le tre tabelle della migrazione 065, più `imaging_accessi`.

Il DICOM non lo apre Node: lo apre `imaging/leggi-dicom.py` in un processo separato che muore subito dopo, con pydicom, Pillow e numpy in un venv suo (`~/.referralflow-imaging`). È la stessa scelta della catena dei referti — il lavoro sporco in un processo suo — e per lo stesso motivo: dagli apparecchi arrivano file malformati, e uno di quelli deve rovinare al massimo la sua richiesta.

Al browser arriva un **PNG già finestrato**, non il DICOM. Tre conseguenze, tutte volute: nessuna libreria da megabyte da scaricare, funziona sul telefono, e l'anagrafica scritta dentro il file non esce dal Mac. I fotogrammi disegnati restano in cache su disco (`uploads/imaging-cache`), con la finestra nella chiave.

L'ordine dei pixel non è opinabile ed è quello del DICOM: prima la LUT di modalità (che porta i numeri grezzi in unità vere — gli HU di una TAC), poi la finestra, **che è espressa in quelle unità**. Applicare la finestra ai numeri grezzi dà un'immagine tutta di un colore: è successo, ed è il motivo per cui questa riga è scritta qui.

## L'abbinamento al paziente, e perché è severo

Un esame si aggancia da solo a una persona della cartella **solo se nome e data di nascita combaciano tutti e due, e una persona sola corrisponde**. Un omonimo senza data non si indovina: l'esame resta «da verificare» e lo abbina chi guarda.

Non è prudenza formale. Attaccare le immagini di qualcuno alla cartella di qualcun altro è il danno peggiore che questa pagina possa fare, e il generatore di prova contiene apposta due «Rossi Mario» con date diverse.

## Che cos'è, e che cosa non è

Le immagini qui si **consultano**: ritrovare l'esame giusto della persona giusta e guardarlo nel contesto della cartella. **La diagnosi si fa sulla console dell'apparecchio o su un visualizzatore certificato**, e il referto nasce dal dettato come sempre. Tre scelte tengono in piedi questa dichiarazione e vanno difese: **niente misure**, niente elaborazione presentata come diagnostica, e l'avviso visibile dove si guardano le immagini. Il giorno che si aggiunge un righello, ReferralFlow diventa un dispositivo medico di classe IIa. Il documento è `docs/legale/destinazione-uso-immagini.md`.

## Chi la vede

Segreteria, medico, aiuto medico, amministrazione. **Il tecnico no**, come per la scheda del paziente ([[Piattaforma/Revisione del 18.9.2026]]): le immagini sono dati sanitari, le vede chi cura.

Ogni apertura di un esame finisce in `imaging_accessi` e si legge in fondo alla pagina dell'esame. Alla domanda «chi l'ha visto?» c'è una risposta.

## Dagli apparecchi, senza PACS (18.9.2026)

**Il punto non era vedere le immagini: era smettere di pagare per farsele mandare.** Un ecografo, una RM, una TAC non «esportano file»: parlano DICOM in rete e spediscono a chi risponde. Il pezzo che risponde si chiama **SCP**, è nello standard pubblico dal 1993 e non costa niente. Quello che il concorrente paga **35.000 franchi l'anno** è il visualizzatore con la sua licenza, non il protocollo — e il visualizzatore ce l'abbiamo.

`imaging/ricevi-dicom.py` (pynetdicom) fa due cose sole:

- **C-ECHO** — «ci sei?». È il tasto «prova connessione» che il tecnico preme sull'apparecchio: senza, l'installazione è alla cieca.
- **C-STORE** — riceve l'immagine e la scrive nello spool. Risponde *Success* **solo dopo** `fsync` e `rename`: se rispondesse prima, l'apparecchio cancellerebbe la sua copia di una cosa che non abbiamo. I byte si scrivono **come arrivano**, senza decodificare e ricodificare — un file DICOM è anche un documento legale, e rigenerarlo significa cambiarlo.

**Chi può mandare**: solo gli AE Title scritti in `~/referti-imaging/ricezione.conf`, e con `@indirizzo` solo da quell'indirizzo. **Elenco vuoto = nessuno**, che è il punto di partenza giusto. Chi non è in elenco riceve un rifiuto (`0x0124`) e finisce nel log — dove entrano AE Title, indirizzo e conteggi, mai niente del paziente.

Finita la trasmissione il servizio chiama `POST /api/cron/imaging`, che svuota lo spool e mette gli esami in cartella; `mac/automazioni.sh` la richiama ogni quarto d'ora, perché **un avviso può perdersi e un esame no**. I file si cancellano solo dopo che l'esame è dentro; quelli illeggibili vanno in `scartati/`, non nel cestino: un file che l'apparecchio ci ha mandato è roba di un paziente.

Si accende una volta sola con `bash mac/installa-ricezione-dicom.sh`, e la pagina Immagini mostra i tre dati da scrivere sull'apparecchio (AE Title, indirizzo del Mac, porta 11112).

**Provato** il 18.9.2026 con un apparecchio simulato: C-ECHO da un AE in elenco → `0x0000`; da uno sconosciuto → `0x0124` rifiutato; sette immagini su sette accettate (RLE e deflated comprese), spool svuotato, due esami in cartella e il fotogramma disegnato. Poi cancellato tutto: era roba sintetica su un database vero.

Quello che la ricezione **non** fa ancora: **MPPS** (l'apparecchio che dichiara inizio e fine dell'esame), **Storage Commitment** (la conferma formale che ce lo siamo tenuto, dopo la quale la modalità può cancellare), **TLS con certificato** — oggi la rete degli apparecchi si assume segmentata — e la **worklist** (DICOM MWL: l'apparecchio che chiede «chi ho in lista oggi?»). Sono in `imaging-server` e sono il passo dopo: la worklist in particolare toglierebbe la digitazione del nome sull'ecografo, che è dove nascono gli omonimi.

## Quello che ancora non c'è

- **ZIP e DICOMDIR**: si trascinano i file, non l'archivio compresso. Gli ZIP vanno aperti prima — anche perché uno ZIP ostile è un modo noto di riempire un disco.
- **MPR e 3D**: il visore mostra le immagini come sono. La ricostruzione su altri piani e il rendering volumetrico esistono in `imaging-server` e qui non sono stati portati.
- **Misure e annotazioni** sull'immagine.
- **Referto sull'esame**: oggi il referto nasce dal dettato ([[Catena/Revisione guidata]]); legare un referto a un esame per immagini è un lavoro a sé.
- **S3**: se le immagini finissero su un bucket, ogni disegno le riscaricherebbe. Finché stanno sul Mac va bene così.

## Le prove

`src/lib/prove-imaging.test.ts` — 8 casi sul raggruppamento, sui doppioni, sull'abbinamento severo e sulle finestre. Il lettore è stato passato su **153 file DICOM sintetici** generati da `imaging-server/scripts/gen_synthetic.py`: 57 immagini disegnate su 57, due oggetti non grafici riconosciuti come tali, e l'unico errore è il file deliberatamente troncato della cartella `90_anomalie` — cioè esattamente quello che doveva fallire.
