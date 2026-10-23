# Pazienti e documenti

Qui trovi come cercare un paziente, creare o correggere la sua anagrafica, importare i pazienti da un file e tenere in ordine i documenti della sua cartella (caricare, aprire, spostare, rinominare, eliminare, recuperare).
Le pagine «Pazienti» e «Documenti» stanno nel menu a sinistra, sezione «Clinico»; sul telefono «Pazienti» è nella barra in basso, «Documenti» sotto «Altro».
Le vedono tutti i ruoli dello studio: medico, aiuto medico, segreteria, amministrazione e tecnico. Le schede dentro la cartella del paziente cambiano un po' secondo il ruolo.

## Come trovo un paziente?
1. Apri «Pazienti» nel menu (sezione «Clinico»).
2. Scrivi nel campo «Cerca cognome, nome, data di nascita, AVS, telefono, e-mail…».
3. L'elenco si filtra mentre scrivi. Puoi scrivere più parole: restano i pazienti che le hanno tutte (per esempio cognome e anno di nascita).
4. Clicca la riga per aprire la scheda del paziente.
La ricerca guarda tutti i pazienti dello studio, non solo quelli che vedi a schermo. In alto sotto il titolo c'è quanti ne ha trovati.
Parole: cercare, trovare, paziente, ricerca, nome, cognome, data di nascita, AVS, elenco pazienti, scheda

## Perché nell'elenco dei pazienti non vedo tutti?
A schermo la pagina «Pazienti» mostra al massimo 300 righe, perché con circa 6000 pazienti la tabella intera rallenterebbe tutto. In fondo compare «A schermo i primi 300 di N: scrivi qualche lettera del cognome per trovare gli altri».
La ricerca però scorre sempre tutti i pazienti: scrivi il cognome (o una parte) nel campo di ricerca e il paziente compare.
Se anche così non c'è, non è in ReferralFlow: crealo con «Nuovo paziente» o importalo.
Parole: 300, elenco incompleto, mancano pazienti, non lo trovo, limite, troppi pazienti, lista corta

## Cosa vuol dire «solo agenda» accanto a un paziente?
È una persona che compare negli appuntamenti dell'agenda (che arriva da MediOnline) ma non ha ancora la sua scheda in anagrafica. In alto sotto «Pazienti» c'è anche il conto «N solo in agenda».
A una persona «solo agenda» non si possono caricare documenti: il caricamento risponde «Questo paziente ha solo la scheda dell'agenda: crea prima la sua scheda in anagrafica».
Per crearla: in «Agenda» apri l'appuntamento e premi «Crea la cartella» (cognome, nome e nascita sono proposti dal titolo dell'appuntamento: controllali), oppure usa «Nuovo paziente» in «Pazienti». La scheda nuova si collega da sola ai suoi appuntamenti e referti con lo stesso nome.
Parole: solo agenda, senza scheda, crea la cartella, paziente non registrato, agenda, MediOnline, anagrafica mancante

## Come creo un paziente nuovo?
1. Apri «Pazienti» e premi «Nuovo paziente» in alto a destra.
2. Compila la finestra: «Cognome» e «Nome» sono obbligatori (asterisco rosso). Poi data di nascita, sesso, telefono, e-mail, via, NPA, località, numero AVS, cassa malati, numero assicurato (tessera), indicazione clinica, percorso.
3. Premi «Salva».
Se un campo è sbagliato, l'errore compare sotto il campo e un avviso dice «Controlla i campi segnati». Se va bene, la scheda del nuovo paziente si apre da sola e l'avviso dice quanti appuntamenti e referti sono stati collegati.
Parole: nuovo paziente, creare paziente, aggiungere paziente, registrare, anagrafica nuova, inserire paziente

## Perché dice «Paziente già in cartella»?
Quando crei un paziente, ReferralFlow rifiuta il doppione: se c'è già qualcuno con lo stesso cognome, nome e data di nascita, compare «Paziente già in cartella (stesso cognome, nome e data di nascita)» e non ne crea un secondo.
Cerca il paziente in «Pazienti» (scrivi il cognome): la sua scheda c'è già.
Se è davvero un'altra persona, controlla di aver scritto bene la data di nascita.
Parole: già in cartella, doppione, duplicato, esiste già, non mi fa creare, stesso nome

## Come correggo i dati di un paziente?
1. Apri la scheda del paziente.
2. Premi «Modifica dati» in alto a destra (lo stesso tasto «Modifica» c'è anche nel riquadro «Anagrafica» della Overview e nella scheda «Amministrazione»).
3. Si apre la finestra «Anagrafica» con gli stessi campi della creazione: correggi e premi «Salva».
L'avviso dice «Anagrafica salvata». Dopo una correzione del nome, la scheda si ricollega da sola agli appuntamenti e ai referti con il nome giusto.
Il numero del paziente di MediOnline non si modifica da qui: arriva solo dall'importazione.
Parole: modificare, correggere, cambiare dati, anagrafica, nome sbagliato, telefono, indirizzo, cassa malati, AVS

## Come importo i pazienti da un file CSV?
1. In «Pazienti» premi «Importa CSV».
2. Scegli il file, oppure incolla il testo nel riquadro. La prima riga deve essere l'intestazione (cognome, nome, data di nascita, telefono…; l'ordine non conta; separatore punto e virgola, virgola o tabulazione; date come 31.12.1950).
3. Premi «Anteprima»: vedi quanti sono «nuovi», «già in cartella», «non importabili», «doppioni nel file», e quali colonne sono state lette o ignorate.
4. Premi «Importa N nuovi». Può volerci un minuto: aspetta che finisca.
Chi c'è già (stesso cognome, nome e nascita) non viene duplicato. Un file Excel (.xlsx) aprilo in Excel, copia e incolla nel riquadro.
Parole: importare, CSV, Excel, caricare pazienti, file pazienti, elenco, anteprima, importazione

## Come importo l'esportazione dei pazienti di MediOnline?
Usa «Pazienti» → «Importa CSV» come per ogni CSV. L'esportazione di MediOnline è riconosciuta: colonne come «Data nasc.», «M/F», «N° AVS», «N° tel. 1/2/3», «Assicurazione LAMal», «N° assicurato LAMal».
Anche gli accenti rovinati dalla codifica di Windows vengono letti, e le note su più righe non spezzano il paziente.
Solo cognome e nome bloccano una riga. Se un altro campo è sbagliato (NPA straniero, e-mail senza @, AVS incompleto, data illeggibile) quel campo resta vuoto e l'anteprima lo dice («nuovi con un campo lasciato vuoto», «nuovi senza data di nascita»).
L'anteprima mostra a schermo al massimo 400 righe, prima quelle da guardare.
Parole: MediOnline, esportazione, export, importare pazienti, colonne, accenti, file di MediOnline

## A cosa serve la colonna «N° paziente» nell'importazione?
Se il file ha una colonna «N° paziente» (vanno bene anche «N°», «Nr.», «Numero», «ID», «ID paziente», «N° cartella»), ReferralFlow salva il numero del paziente di MediOnline.
Serve a riconoscere le cartelle cartacee scansionate (DocuWare), che nella cartella comune si chiamano «numero_Cognome_Nome.pdf».
Il numero si scrive anche per i pazienti che c'erano già, ma solo se non ne avevano uno e se quel numero non è già di un altro paziente. Non compare fra i dati da modificare.
Parole: numero paziente, N°, ID, MediOnline, DocuWare, scansioni, numero cartella, colonna

## Cosa c'è nella scheda di un paziente?
In alto: nome, età, data di nascita, i tasti «Modifica dati», «Nuovo documento», «Appuntamento». Sotto, le schede (tab), che cambiano col ruolo:
- medico e amministrazione: Overview, Timeline, Visite, Referti, Esami, Terapia, Documenti, Comunicazioni, Amministrazione, Audit;
- aiuto medico: Overview, Esami, Documenti;
- segreteria e tecnico: Overview, Documenti, Comunicazioni, Amministrazione.
Se manca una scheda che un collega vede, è il tuo ruolo: non è un guasto.
Parole: scheda paziente, cartella paziente, tab, schede, Overview, Timeline, Visite, Referti, Esami, Terapia, Documenti, Amministrazione, ruolo

## Cosa mostrano Overview, Timeline, Visite, Referti e Amministrazione?
- Overview: quattro riquadri (indicazione e percorso, visite fatte, referti confermati, cassa malati), «Terapia in corso» presa dall'ultimo referto confermato (solo medico e amministrazione), quesiti e referral, esami recenti, prossimo appuntamento, FC massimale teorica, attività aperte, anagrafica con «Modifica».
- Timeline: referral, visite, documenti e referti in ordine di data, i più recenti in alto; clic per aprire.
- Visite: gli appuntamenti dell'agenda del paziente, passati e «in programma».
- Referti: i referti dettati con stato «Confermato» o «Da controllare»; clic per aprirli.
- Amministrazione: anagrafica completa e referral.
Parole: overview, riepilogo, timeline, cronologia, visite, appuntamenti, referti, terapia in corso, amministrazione, assicurazione

## Cosa c'è nella scheda Esami?
«Esami» mostra i documenti della cartella che sono esami (tutto tranne lettere e consensi), con il tipo riconosciuto e la data.
Per ognuno: «Apri» lo apre accanto, «↓ Scarica» lo salva sul tuo dispositivo, «✦ Chiedi all'AI» chiede a Cleo di riassumerlo.
Se è vuota compare «Nessun esame in cartella».
Parole: esami, ECG, Holter, ecocardiogramma, laboratorio, referti esami, scaricare esame, riassumere

## Perché le schede Terapia, Comunicazioni e Audit sono vuote?
Oggi queste tre schede non mostrano dati dello studio: sono ancora da collegare.
La terapia del paziente la trovi nella Overview, riquadro «Terapia in corso»: viene dal blocco Terapia dell'ultimo referto confermato e non va ridigitata.
Telefonate ed e-mail con il paziente per ora non si registrano in ReferralFlow.
Parole: terapia vuota, farmaci, comunicazioni, audit, accessi, scheda vuota, non funziona, niente dati

## Come sono organizzati i documenti di un paziente?
Nella scheda del paziente apri «Documenti». I documenti stanno in sottocartelle, in ordine di numero, come la cartella di carta dello studio:
01_Rapporti, 02_Rapporti esterni - ricoveri, 03_Appunti, 04_ECG - tracciato PM-ICD, 05_Apparecchi, 06_Ciclo - Ergospiro, 07_TAC - MRI - RX, 08_Intervento cardiologico, 09_Laboratorio e analisi, 10_Vari, 11_Documenti amministrativi, 12_Ricette.
Possono esserci anche altre sottocartelle (per esempio «Cartella cartacea scansionata»). I documenti senza sottocartella stanno in «Altri documenti».
Clicca il nome di una sottocartella per aprirla o chiuderla; accanto c'è quanti documenti contiene. Dentro, i documenti più recenti stanno in alto.
Parole: sottocartelle, cartelle, documenti paziente, Rapporti, Appunti, ECG, Laboratorio, Ricette, Altri documenti, ordine

## Come carico un documento nella cartella di un paziente?
1. Apri la scheda del paziente → «Documenti» e premi «Carica» (o «Nuovo documento» in alto).
2. Nella finestra «Carica documento» premi «Scegli i file» o trascinali nel riquadro. Puoi metterne più di uno.
3. Per ogni file controlla il tipo (indovinato dal nome: ECG, Holter, Laboratorio, Lettera…), scrivi se vuoi una descrizione e scegli la sottocartella (se non scegli: «Altri documenti»).
4. Premi «Carica» (o «Carica N file»). Ogni file mostra la percentuale e poi «✓ caricato».
Dalla pagina «Documenti» del menu la finestra è la stessa, ma prima devi cercare il paziente («Cerca il paziente (cognome nome)»).
Parole: caricare, upload, aggiungere documento, allegare, nuovo documento, inserire file, PDF, mettere in cartella

## Come carico un documento direttamente in una sottocartella?
Nella scheda «Documenti» del paziente, ogni sottocartella ha a destra il tasto «Carica qui».
Premilo: si apre la finestra «Carica documento» con quella sottocartella già scelta per ogni file. Scegli i file e premi «Carica».
Puoi comunque cambiare la sottocartella file per file prima di caricare.
Parole: carica qui, caricare in sottocartella, scegliere cartella, mettere nella cartella giusta, Rapporti, Laboratorio

## Quali file posso caricare e quanto grandi?
Formati: PDF, immagini (JPG, PNG, HEIC, TIFF), Word (.docx, .doc), testo (.txt), DICOM (.dcm).
Grandezza: fino a 50 MB per file; i PDF fino a 300 MB (anche una cartella intera scansionata).
Un file troppo grande compare con «oltre N MB» e non parte. Un formato diverso dà «Formato non ammesso».
Per le scansioni il consiglio è PDF in scala di grigi, 200–300 dpi.
Parole: formati, dimensione, MB, troppo grande, limite, PDF, Word, immagini, DICOM, foto

## Come apro un documento?
Nella scheda «Documenti» clicca la riga del documento, o il tasto con l'occhio («Apri il documento accanto»). Il documento si apre in una colonna a destra, senza lasciare la pagina.
I PDF si sfogliano pagina per pagina; i Word e i testi si vedono come testo.
In alto nella colonna: «Estrai pagine» (solo PDF), l'icona per andare alla scheda del paziente, l'icona di Cleo per riassumerlo, «Scarica», e la X per chiudere.
Con il documento aperto puoi chiedere a Cleo «cosa dice questo documento?». Ogni apertura viene registrata.
Parole: aprire, vedere documento, leggere, visualizzare, anteprima, scaricare, riassunto, colonna a destra

## Come prendo solo alcune pagine di un PDF?
1. Apri il PDF accanto (clic sulla riga in «Documenti»).
2. Premi «Estrai pagine» in alto nella colonna del documento.
3. Scrivi le pagine (per esempio «12-15» oppure «3, 7-9»), scegli la categoria e scrivi una descrizione.
4. Premi «Estrai».
Nasce un documento nuovo nella cartella dello stesso paziente; l'originale resta com'è. Serve per esempio per mandare un solo ECG da una cartella scansionata intera.
Per dividere tutta una cartella in molti documenti usa invece la pagina «Dividi cartella».
Parole: estrarre pagine, tagliare PDF, separare pagine, un pezzo del PDF, allegare ECG, pagine

## Come sposto un documento in un'altra sottocartella?
Nella scheda «Documenti» del paziente:
- trascina il documento sopra un'altra sottocartella e lascialo (mentre trascini compaiono anche le sottocartelle vuote, con «vuota: lascialo qui»);
- oppure premi «Sposta» sulla riga e scegli la sottocartella nella finestra «Sposta in un'altra sottocartella».
L'avviso dice «Spostato in «…»». Sul telefono il trascinamento non c'è: usa «Sposta».
Un documento si sposta solo fra le sottocartelle dello stesso paziente.
Parole: spostare, trascinare, cambiare cartella, sottocartella sbagliata, riordinare, drag

## Come creo una sottocartella nuova o la rinomino?
Nuova: premi «Sposta» su un documento e, in fondo alla finestra, scrivi il nome nel campo «…oppure una sottocartella nuova (es. 13_Fisioterapia)», poi «Crea e sposta». La sottocartella esiste finché contiene almeno un documento.
Rinominare: sulla riga della sottocartella premi «Rinomina», scrivi il nome nuovo e conferma. Vale per tutti i suoi documenti.
Metti il numero davanti (13_, 14_…) se vuoi che stia in ordine dopo le altre.
Parole: nuova sottocartella, creare cartella, rinominare cartella, nome cartella, aggiungere sottocartella

## Come rinomino un documento?
Nella scheda «Documenti» del paziente premi «Rinomina» sulla riga del documento, scrivi il nome nuovo e conferma.
L'avviso dice «Rinominato». Il nome che si vede è la descrizione scritta al caricamento, se c'è, altrimenti il nome del file.
Parole: rinominare, cambiare nome, titolo documento, nome sbagliato, descrizione

## Come elimino un documento?
1. Nella scheda «Documenti» del paziente premi «Elimina» (in rosso) sulla riga del documento.
2. Si apre una finestra rossa «Eliminare il documento?» che dice quale documento e di quale paziente.
3. Premi «Elimina il documento» per confermare, o «Annulla».
Il documento sparisce dalla cartella per tutti, ma non è perso: va nello «Storico degli eliminati», in fondo ai documenti del paziente, da dove si può rimettere.
Parole: eliminare, cancellare, togliere documento, buttare, rimuovere, sbagliato paziente

## Come recupero un documento eliminato per sbaglio?
1. Apri la scheda del paziente → «Documenti».
2. In fondo apri «Storico degli eliminati»: c'è ogni documento eliminato, quando, da chi e da quale sottocartella.
3. Premi «Rimetti nella cartella» accanto al documento.
Torna com'era, nella sua sottocartella; lo storico scrive anche chi l'ha rimesso e quando. Se il tasto non c'è, il documento è già tornato o il file non esiste più (per esempio i pezzi tolti da «Dividi di nuovo»).
Parole: recuperare, ripristinare, rimettere, eliminato per sbaglio, storico, cestino, annullare eliminazione

## Perché non riesco a eliminare un documento?
Un documento allegato a un referto non si può eliminare: compare «È allegato a un referto: non si può eliminare». È voluto: il referto ha bisogno di quel documento, quindi resta nella cartella.
Se compare «Il tuo ruolo non modifica la cartella», il tuo accesso non può cambiare i documenti: chiedi a un collega o all'amministrazione.
Parole: non si elimina, errore eliminare, allegato referto, bloccato, non posso cancellare, ruolo

## Cos'è l'OCR e perché una scansione dice «in coda per l'OCR»?
Un PDF scansionato è fatto di sole immagini: senza testo non si può cercare e Cleo non lo legge. Quando carichi un PDF così, il Mac dello studio ci aggiunge il testo da solo (OCR).
Al caricamento compare «senza testo: il Mac aggiunge l'OCR appena la catena dei referti è ferma». La lettura parte solo quando il Mac non sta trascrivendo referti, un documento alla volta: può volerci qualche minuto o di più.
Il documento resta lo stesso e si apre subito; dopo l'OCR ha anche il testo. Le pagine scritte a mano restano immagini e non diventano testo.
Parole: OCR, scansione, senza testo, testo, ricerca nel PDF, coda OCR, leggere scansione, DocuWare

## Perché Cleo non trova o non legge un documento?
- È una scansione ancora in coda per l'OCR: aspetta che il Mac la legga (parte quando la catena dei referti è ferma).
- È scritto a mano: l'OCR non legge la scrittura a mano, quindi il testo non c'è.
- È nel paziente sbagliato o in «Altri documenti»: guarda nella scheda «Documenti» del paziente.
- È stato eliminato: guarda nello «Storico degli eliminati».
Puoi aprire il documento accanto e chiedere a Cleo «cosa dice questo documento?».
Parole: non trova, Cleo non legge, documento introvabile, cercare documento, testo mancante, scritto a mano

## Cosa mostra la pagina «Documenti» del menu?
La pagina «Documenti» (menu «Clinico») elenca gli ultimi 200 documenti caricati in tutto lo studio, con tipo, paziente e data.
Il tasto «Carica» apre la finestra «Carica documento»: cerca il paziente, scegli i file e la sottocartella, premi «Carica».
I tasti «Conferma sicuri», «Da confermare», «Archivio» e «Per categoria» oggi non fanno niente di reale, e i numeri sotto il titolo non sono dello studio. Per aprire, spostare o eliminare un documento vai nella scheda del paziente → «Documenti».
Parole: pagina documenti, menu documenti, elenco documenti, ultimi documenti, conferma sicuri, da confermare

## Cosa vuol dire «Doc. nuovi» o «Documenti nuovi»?
Nell'elenco «Pazienti» la colonna «Indicatori» mostra «Doc. nuovi» se al paziente è arrivato un documento negli ultimi sette giorni; nella sua scheda, sotto il nome, compare «Documenti nuovi».
Non serve confermare niente: sparisce da solo dopo sette giorni. Gli altri indicatori sono «Task» (attività aperte) e gli avvisi (per esempio una referral urgente aperta).
Parole: doc nuovi, documenti nuovi, indicatori, badge, etichetta, novità, task

## Il caricamento non riesce: cosa faccio?
Guarda il messaggio rosso accanto al file:
- «oltre N MB»: il file è troppo grande (50 MB, i PDF 300 MB);
- «Formato non ammesso»: usa PDF, immagine, Word, testo o DICOM;
- «Scegli un paziente con la scheda in anagrafica»: scegli il paziente dall'elenco proposto, o crealo prima;
- «…ha solo la scheda dell'agenda»: crea prima la scheda del paziente;
- «rete non raggiungibile» o «Piattaforma non raggiungibile»: controlla la connessione e premi di nuovo «Carica» (riprova solo i file non riusciti).
Parole: errore caricamento, non carica, upload fallito, file rifiutato, problema, non riesce

## Un paziente compare due volte: cosa faccio?
Succede, per esempio, quando nell'anagrafica importata da MediOnline la stessa persona c'è due volte con cognome e nome scambiati e la stessa data di nascita.
In ReferralFlow non c'è un tasto per unire due schede, né per eliminare un paziente, e un documento non si sposta da un paziente all'altro.
Usa la scheda che ha più cose (documenti, appuntamenti) e segnala il doppione all'amministrazione o al tecnico, che lo uniscono a mano.
Parole: doppione, paziente doppio, due schede, unire, fondere, duplicato, cognome e nome invertiti, eliminare paziente
