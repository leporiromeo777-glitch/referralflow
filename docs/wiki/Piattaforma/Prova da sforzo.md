# Prova da sforzo ed ECG a riposo

Che cosa è vero oggi (9.10.2026). Sul PC della ciclo (`192.168.0.93`, utente Windows `Team`) girano due programmi Cardioline: **CubeStress** (prova da sforzo, v. 5.5.1) e **touchECG** (ECG a riposo, build 4.8.0). Il referto della prova da sforzo e il tracciato dell'ECG arrivano **da soli** nella cartella del paziente, come documenti «Ciclo» ed «ECG». Sul PC la cartella condivisa del Mac `~/Ciclo da leggere` è il disco **`R:`**.

## ECG a riposo (touchECG)

- **Sul PC**: Impostazioni → Connettività: «Invio automatico» **ON**, protocollo di invio e di ricezione **GDT**; in «Configurazione protocollo → GDT»: Path Folder In `R:\ecg-richieste\`, Path Folder Out `R:\ecg\`, **PDF Enabled** spuntato. A fine esame touchECG scrive in `ecg/` un file GDT (`<uuid>.GDT`, GDT 2.10, tipo 6310, `EKG01`, codifica ISO 8859-1) e il tracciato in PDF; il GDT dice chi è il paziente (3101 cognome, 3102 nome, 3103 nascita `GGMMAAAA` se scritta), quando è l'esame (6200, 6201) e come si chiama il PDF (6305). Alla prima accensione ha mandato in un colpo i quattro esami che aveva in archivio.
- **Sul Mac** (`giroEcg` in `src/lib/ciclo/cartella-server.ts`, ogni 15 secondi; cartella `ECG_CARTELLA`, di serie `~/Ciclo da leggere/ecg`): per ogni GDT si aspetta il suo PDF (fino a dieci minuti), poi vale la **stessa regola severa** della ciclo. Il documento si chiama «ECG gg.mm.aaaa hh.mm.pdf», categoria `ecg`. Letti, **GDT e PDF si tolgono dalla cartella** (qui scrive direttamente il programma, non una copia: l'originale resta nell'archivio di touchECG). Lo stesso esame rimandato ha lo stesso nome di PDF e non entra due volte.
- **Del GDT si leggono solo identità, data e nome del PDF** (`src/lib/ciclo/gdt.ts`, puro). Il testo del referto automatico (6220) e la tabella delle misure (6228) non si leggono: stanno nel PDF, e non devono finire nel database né nei log.
- `ecg-richieste/` è vuota: servirà se un giorno ReferralFlow manderà i dati del paziente a touchECG (GDT in ingresso). Oggi non lo fa.
- Se il Mac è spento, a fine ECG touchECG non riesce a scrivere: l'esame resta nel suo archivio e si rimanda dopo.

## Prova da sforzo (CubeStress)

Il referto nasce nel programma **CubeStress** e arriva come PDF.

## Come arriva

1. **Sul PC della ciclo** (`192.168.0.93`, utente Windows `Team`) a fine esame si preme **«Report PDF»**: CubeStress crea il referto in `C:\Users\Team\Documents\Cubestress\report\` e lo apre. Il file **non resta**: il programma lo toglie poco dopo (misurato: la cartella era vuota dieci minuti dopo un referto).
2. **Una copia nascosta** (`robocopy`, avviato da `ReferralFlow-ciclo.vbs` nella cartella «Esecuzione automatica» di Windows, senza finestre) porta ogni PDF nuovo nella cartella del Mac `\\192.168.0.188\Ciclo da leggere\referti`. Guarda una volta al minuto. Si installa col doppio clic su **«Collega i referti della ciclo.bat»** (sta nella cartella condivisa e in `mac/ciclo-windows/`), si toglie con **«Scollega…»**. Il collegamento scrive `registro-collegamento.txt` nella cartella: solo conteggi ed esiti, mai nomi.
3. **Sul Mac** la cartella è `~/Ciclo da leggere` (collegamento sulla Scrivania), condivisa in rete; sul PC è il disco `Y:`. Il giro (`src/lib/ciclo/cartella-server.ts`, ogni 15 secondi, avviato da `src/instrumentation.ts`; si spegne con `CICLO_CARTELLA_GIRO=spento`) legge i PDF di `referti/`.

## Che cosa fa la piattaforma

- **Legge il referto** (`src/lib/ciclo/referto.ts`, puro): dal testo del PDF «Nome : Cognome, Nome», «Data di nascita», «Data Esame»; dal nome del file (`STX_<id>_<nome>_<cognome>_<sesso>__<esame>__<referto>__<n>.pdf`) solo le due ore.
- **Regola severa**: nome **e** data di nascita, **una persona sola** (`abbinaPaziente`, la stessa delle immagini). Se combacia, il PDF diventa un documento della cartella con categoria `ciclo` e nome «Prova da sforzo gg.mm.aaaa.pdf». Se no — e succede quando sulla ciclo non si scrive la data di nascita — aspetta **«da assegnare»**.
- **Da assegnare**: pagina **Immagini**, scheda «ECG e prove da sforzo arrivati dagli apparecchi» (compare solo se c'è qualcosa; vale per tutti e due). Si apre il PDF per guardarlo, si sceglie il paziente, oppure «Non ha ancora la cartella: creala» (cognome, nome e data di nascita da confermare; mai un doppione), oppure si scarta. Lo fanno segreteria, aiuto medico, medico e amministrazione; il tecnico no.
- **Niente doppioni**: lo stesso nome di file (porta l'ora dell'esame e quella del referto) non entra due volte, nemmeno se il programma rifà il PDF. Un referto **modificato** ha un'altra ora di refertazione, quindi è un documento nuovo: il vecchio resta.
- **I file nella cartella non si spostano**: se sparissero mentre l'originale è ancora sul PC, la copia li rimanderebbe ogni minuto. Si tolgono da soli dopo sette giorni. Un PDF che non è un referto della ciclo si segna una volta come «non letto» e non si rilegge.
- Tabella `ciclo_arrivi` (migrazione 087; dalla 088 la colonna `tipo` dice `ciclo` o `ecg`): una riga per arrivo, di tutti e due gli apparecchi. Il PDF in attesa sta nell'archivio dei file, non nel database. Nei log solo conteggi.

## Per far sì che si agganci da solo

Sulla ciclo, nei dati del paziente, scrivere **cognome, nome e data di nascita** come in ReferralFlow. Con la sola età il referto arriva lo stesso, ma va assegnato a mano.

## Quello che è stato provato e non funziona (9.10.2026)

La licenza di CubeStress ha attive le opzioni «Connettività, DICOM, GDT», ma:
- **DICOM**: con «URL Archiviazione» = `REFERRALFLOW@192.168.0.188:11112` (formato preso dal manuale di un altro programma Cardioline) al Mac non è arrivato nessun tentativo di collegamento. Il PC è comunque fra gli apparecchi ammessi (`ricezione.conf`).
- **GDT**: la prova fatta non vale — nei campi era scritto `Y:\`, e su quel PC il disco del Mac è `R:` (visto dopo, configurando touchECG). Da rifare con `R:\ciclo-richieste\` e `R:\ciclo-gdt\` (le cartelle ci sono). In touchECG, dello stesso produttore, GDT ha funzionato al primo colpo.
Il modo esatto di configurarli lo sa il tecnico Cardioline: se un giorno servisse mandare i dati del paziente **da** ReferralFlow **alla** ciclo, la strada è GDT.

## Quello che ancora non c'è

- Il passaggio «Report PDF» va fatto a mano a fine esame: senza, il PDF non nasce.
- Se il PDF vive meno di un minuto la copia può perderlo (non osservato; una prova: arrivato in meno di un minuto).
- I numeri dell'esame (carico massimo, FC, PA) non si estraggono: resta il PDF.

## Prove

`src/lib/prove-ciclo.test.ts` (4: nome del file, testo del referto con e senza data di nascita, nome del documento, GDT dell'ECG). `scripts/e2e/prova-ciclo.ts` (13, sul demo con PDF e GDT inventati; le ultime tre sull'ECG: il GDT aspetta il suo PDF, niente doppioni, senza data di nascita in attesa, GDT senza PDF tolto): in cartella da solo, niente doppioni neanche rifatto, senza data di nascita in attesa, PDF apribile solo da chi può, assegna, crea la cartella, referto successivo da solo, PDF estraneo, scarta, pulizia dei vecchi.
