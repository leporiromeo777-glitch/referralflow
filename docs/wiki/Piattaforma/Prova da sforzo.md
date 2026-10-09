# Prova da sforzo (ciclo)

Che cosa è vero oggi (9.10.2026). Il referto della prova da sforzo nasce sul PC della ciclo, nel programma **Cardioline CubeStress** (v. 5.5.1), e arriva **da solo** nella cartella del paziente come documento «Ciclo».

## Come arriva

1. **Sul PC della ciclo** (`192.168.0.93`, utente Windows `Team`) a fine esame si preme **«Report PDF»**: CubeStress crea il referto in `C:\Users\Team\Documents\Cubestress\report\` e lo apre. Il file **non resta**: il programma lo toglie poco dopo (misurato: la cartella era vuota dieci minuti dopo un referto).
2. **Una copia nascosta** (`robocopy`, avviato da `ReferralFlow-ciclo.vbs` nella cartella «Esecuzione automatica» di Windows, senza finestre) porta ogni PDF nuovo nella cartella del Mac `\\192.168.0.188\Ciclo da leggere\referti`. Guarda una volta al minuto. Si installa col doppio clic su **«Collega i referti della ciclo.bat»** (sta nella cartella condivisa e in `mac/ciclo-windows/`), si toglie con **«Scollega…»**. Il collegamento scrive `registro-collegamento.txt` nella cartella: solo conteggi ed esiti, mai nomi.
3. **Sul Mac** la cartella è `~/Ciclo da leggere` (collegamento sulla Scrivania), condivisa in rete; sul PC è il disco `Y:`. Il giro (`src/lib/ciclo/cartella-server.ts`, ogni 15 secondi, avviato da `src/instrumentation.ts`; si spegne con `CICLO_CARTELLA_GIRO=spento`) legge i PDF di `referti/`.

## Che cosa fa la piattaforma

- **Legge il referto** (`src/lib/ciclo/referto.ts`, puro): dal testo del PDF «Nome : Cognome, Nome», «Data di nascita», «Data Esame»; dal nome del file (`STX_<id>_<nome>_<cognome>_<sesso>__<esame>__<referto>__<n>.pdf`) solo le due ore.
- **Regola severa**: nome **e** data di nascita, **una persona sola** (`abbinaPaziente`, la stessa delle immagini). Se combacia, il PDF diventa un documento della cartella con categoria `ciclo` e nome «Prova da sforzo gg.mm.aaaa.pdf». Se no — e succede quando sulla ciclo non si scrive la data di nascita — aspetta **«da assegnare»**.
- **Da assegnare**: pagina **Immagini**, scheda «Prova da sforzo: referti arrivati dalla ciclo» (compare solo se c'è qualcosa). Si apre il PDF per guardarlo, si sceglie il paziente, oppure «Non ha ancora la cartella: creala» (cognome, nome e data di nascita da confermare; mai un doppione), oppure si scarta. Lo fanno segreteria, aiuto medico, medico e amministrazione; il tecnico no.
- **Niente doppioni**: lo stesso nome di file (porta l'ora dell'esame e quella del referto) non entra due volte, nemmeno se il programma rifà il PDF. Un referto **modificato** ha un'altra ora di refertazione, quindi è un documento nuovo: il vecchio resta.
- **I file nella cartella non si spostano**: se sparissero mentre l'originale è ancora sul PC, la copia li rimanderebbe ogni minuto. Si tolgono da soli dopo sette giorni. Un PDF che non è un referto della ciclo si segna una volta come «non letto» e non si rilegge.
- Tabella `ciclo_arrivi` (migrazione 087). Il PDF in attesa sta nell'archivio dei file, non nel database. Nei log solo conteggi.

## Per far sì che si agganci da solo

Sulla ciclo, nei dati del paziente, scrivere **cognome, nome e data di nascita** come in ReferralFlow. Con la sola età il referto arriva lo stesso, ma va assegnato a mano.

## Quello che è stato provato e non funziona (9.10.2026)

La licenza di CubeStress ha attive le opzioni «Connettività, DICOM, GDT», ma:
- **DICOM**: con «URL Archiviazione» = `REFERRALFLOW@192.168.0.188:11112` (formato preso dal manuale di un altro programma Cardioline) al Mac non è arrivato nessun tentativo di collegamento. Il PC è comunque fra gli apparecchi ammessi (`ricezione.conf`).
- **GDT**: con le due cartelle su `Y:\` e una richiesta di prova nella cartella, il programma non l'ha letta e non ha scritto risultati. Non provato con la certezza che i campi fossero salvati e il programma riavviato.
Il modo esatto di configurarli lo sa il tecnico Cardioline: se un giorno servisse mandare i dati del paziente **da** ReferralFlow **alla** ciclo, la strada è GDT.

## Quello che ancora non c'è

- Il passaggio «Report PDF» va fatto a mano a fine esame: senza, il PDF non nasce.
- Se il PDF vive meno di un minuto la copia può perderlo (non osservato; una prova: arrivato in meno di un minuto).
- **touchECG** (ECG a riposo, stesso PC, build 4.8.0): ha l'invio impostato su GDT; non ancora collegato.
- I numeri dell'esame (carico massimo, FC, PA) non si estraggono: resta il PDF.

## Prove

`src/lib/prove-ciclo.test.ts` (3: nome del file, testo del referto con e senza data di nascita, nome del documento). `scripts/e2e/prova-ciclo.ts` (10, sul demo con PDF inventati): in cartella da solo, niente doppioni neanche rifatto, senza data di nascita in attesa, PDF apribile solo da chi può, assegna, crea la cartella, referto successivo da solo, PDF estraneo, scarta, pulizia dei vecchi.
