# Cartella comune e Dividi cartella

«Cartella comune» porta da sola nella scheda dei pazienti le lettere salvate nella cartella comune dello studio (il disco condiviso), e ti mostra quelle che aspettano una decisione. «Dividi cartella» separa un PDF grande (una cartella di carta scansionata) nei suoi singoli documenti.
Tutte e due stanno nel menu a sinistra, sezione «Clinico», dopo «Documenti»; sul telefono sotto «Altro».
Le vedono e le usano tutti i ruoli dello studio: medico, aiuto medico, segreteria, amministrazione e tecnico.

## Che cosa fa la pagina «Cartella comune»?
Le lettere che lo studio salva nella cartella comune (CentroCardio/Pazienti → Rapporti_…) entrano da sole nella scheda del paziente giusto, senza caricarle a mano.
Nella pagina vedi:
- se il Mac è collegato alla cartella comune («Collegata» o «Non collegata») e com'è andato l'ultimo controllo;
- i numeri: lettere caricate, cartelle riconosciute, pazienti creati, doppioni saltati…;
- «Arrivate negli ultimi sette giorni»: le lettere entrate di recente;
- «Cartelle da assegnare»: quelle che aspettano che una persona scelga il paziente.
Parole: cartella comune, sincronizzare, lettere, rapporti, disco condiviso, server, comune, automatico

## Quali cartelle della cartella comune vengono lette?
- Tutte le cartelle dei medici che cominciano con «Rapporti_» (Rapporti_Moccetti, Rapporti_Paiocchi…), sotto CentroCardio/Pazienti. Le lettere dei vari medici finiscono nella stessa scheda del paziente.
- La cartella «Lavori archivio DocuWare»: le cartelle di carta scansionate, un PDF per paziente.
Dentro si leggono i file Word (.docx e .doc) e PDF, anche nelle sottocartelle della cartella del paziente. Il resto (modelli di Word, file temporanei «~$…», altri formati) resta fuori.
Le altre cartelle (per esempio esami o convocazioni) oggi non vengono lette.
Parole: quali cartelle, Rapporti, medici, DocuWare, Word, PDF, formati, cosa legge

## Quando entrano le lettere nuove?
- Ogni notte alle 2 c'è un controllo automatico di tutto quello che è stato aggiunto.
- Quando c'è molto lavoro (la prima volta erano migliaia di lettere) continua da solo a lotti di 150 lettere ogni due minuti, finché ha finito. La pagina lo dice con «Caricamento in corso».
- Puoi farlo partire subito con «Controlla adesso».
Un file salvato nell'ultimo minuto si lascia al giro dopo, per non prenderlo mentre Word lo sta ancora scrivendo.
Parole: quando, orario, notte, alle 2, ogni giorno, controllo giornaliero, automatico, tempi, aspettare

## Come faccio partire il controllo subito?
Nella pagina «Cartella comune» premi «Controlla adesso» in alto a destra. Il tasto diventa «Controllo…» mentre lavora.
Alla fine un avviso dice quante lettere sono state caricate, quante sono in cartelle da assegnare, quante ne ha lette l'AI locale e se ne restano (allora continua da solo ogni due minuti).
Se dice «Un controllo è già in corso: tra poco i numeri si aggiornano», aspetta un paio di minuti e ricarica la pagina.
Parole: controlla adesso, aggiornare, sincronizza ora, forzare, subito, ricaricare, lettera appena salvata

## Dove finisce una lettera della cartella comune nella scheda del paziente?
Nella scheda del paziente → «Documenti», sottocartella «01_Rapporti».
Il documento ha il nome del file originale e, come data, quella della lettera: presa dal nome del file (per esempio «24 05 12 …» = 12.5.2024) o, se manca, dal giorno in cui il file è stato salvato. Così le lettere stanno in ordine di data.
I vecchi file .doc diventano .docx, perché il dittafono legge solo quelli.
Le cartelle di carta scansionate (DocuWare) vanno invece nella sottocartella «Cartella cartacea scansionata».
Parole: dove finisce, dove la trovo, 01_Rapporti, documenti paziente, nome file, data lettera, scheda

## Come vedo quali lettere sono arrivate negli ultimi giorni?
Nella pagina «Cartella comune» c'è il riquadro «Arrivate negli ultimi sette giorni»: per ogni lettera il paziente, il nome del file, la data della lettera e quando è stata caricata.
Clicca una riga per aprire la scheda di quel paziente.
Se dice «Nessuna lettera nuova negli ultimi sette giorni», nell'ultima settimana non è entrato niente.
Parole: ultime lettere, arrivate, nuove lettere, settimana, recenti, controllo, cosa è entrato

## Cosa vogliono dire i numeri in alto nella pagina?
- «lettere caricate»: entrate nelle schede dei pazienti;
- «cartelle di pazienti riconosciute»: cartelle abbinate a un paziente;
- «pazienti creati dalla cartella»: pazienti nuovi creati da soli;
- «col nome quasi uguale e la stessa nascita»: abbinate a un paziente con un secondo nome in più o in meno;
- «riconosciute dall'AI locale»: decise dopo che l'AI del Mac ha letto il documento;
- «cartelle da assegnare»: aspettano una persona;
- «doppioni saltati (anche il PDF di un Word)»;
- «cartelle lasciate fuori»: scartate da una persona o da sole.
Parole: numeri, contatori, statistiche, riquadri, caricate, riconosciute, creati, doppioni, scartate

## Come capisce ReferralFlow di chi è una cartella?
Una cartella è di un paziente quando nome e cognome della cartella (in qualunque ordine, almeno due parole) sono identici a quelli di una persona sola in ReferralFlow.
Se no, servono il nome e la data di nascita scritta nel nome della cartella o nelle lettere.
Con un secondo nome in più o in meno e la stessa data di nascita è la stessa persona. Se in ReferralFlow non c'è nessuno con quel nome e la data di nascita è sicura (accanto a «nato/a il» o subito dopo il nome), il paziente si crea da solo.
Il solo cognome non basta mai. Nei casi dubbi la cartella aspetta una persona.
Parole: riconoscere, abbinare, di chi è, regola, nome e cognome, data di nascita, abbinamento, automatico

## Cosa sono le «Cartelle da assegnare»?
Sono le cartelle (o i singoli file) di cui ReferralFlow non è sicuro: nessun paziente con quel nome, data di nascita che non si trova o diversa, più persone con lo stesso nome.
Le loro lettere non entrano finché una persona non decide. Per ognuna vedi: il nome letto, quante lettere, la data di nascita trovata nelle lettere, il percorso nella cartella comune, il perché aspetta.
In alto puoi cercare con «Cerca nel nome della cartella…» e filtrare per medico («Tutte le cartelle dei medici»). Si vedono 50 cartelle alla volta: «Mostra altre 50» per le altre.
Parole: da assegnare, in attesa, cartelle in sospeso, non riconosciute, decidere, lista, filtrare

## Come guardo il documento prima di decidere?
In ogni cartella da assegnare c'è un tasto «Apri» per ogni file (fino a 15; se sono più file il tasto porta anche il nome del file).
Si apre in un'altra scheda del browser: il PDF com'è, il Word trasformato in una pagina da leggere.
Il file viene letto dalla cartella comune e non entra in ReferralFlow finché non assegni la cartella. Guarda nome e data di nascita nella lettera, poi torna alla pagina e decidi.
Parole: apri, aprire file, guardare, vedere lettera, controllare, leggere prima, anteprima

## Come assegno una cartella al paziente giusto?
1. In «Cartelle da assegnare» guarda i pazienti proposti (quelli col cognome scritto nel nome della cartella): sono tasti con nome e data di nascita.
2. Se non c'è quello giusto, scrivi il cognome nel campo «Di chi è? Scrivi il cognome» e scegli fra i nomi che compaiono.
3. Il nome scelto compare in evidenza: controlla, oppure «Cambia».
4. Premi «Carica nella sua cartella».
L'avviso dice «Cartella assegnata: le sue lettere entrano adesso». Le lettere che arriveranno in quella cartella andranno da sole allo stesso paziente.
Parole: assegnare, scegliere paziente, abbinare a mano, carica nella sua cartella, collegare, decidere

## Il paziente non c'è in ReferralFlow: come lo creo dalla cartella comune?
1. Nella cartella da assegnare premi «Non è in ReferralFlow: crealo».
2. Compaiono tre campi già compilati con quello che è stato letto: «Cognome», «Nome», data di nascita (formato 31.12.1950). Controllali con la lettera aperta con «Apri».
3. Premi «Crea il paziente e carica» (o «Annulla»).
L'avviso dice «Paziente creato: le sue lettere entrano adesso». Se la persona c'era già con quei dati, dice «Il paziente c'era già» e usa la sua scheda.
Servono tutti e tre i campi; altrimenti compare «Servono cognome, nome e data di nascita».
Parole: creare paziente, crealo, nuovo paziente, non esiste, non è in ReferralFlow, aggiungere, cartella comune

## Come lascio fuori una cartella che non va caricata?
1. Nella cartella da assegnare premi «Non caricare» (a destra).
2. Conferma la domanda «Non caricare le lettere di questa cartella?».
L'avviso dice «Cartella lasciata fuori». I file restano sulla cartella comune, nessuno li tocca; semplicemente non entrano in ReferralFlow, nemmeno quelli che arriveranno dopo in quella cartella.
Dalla pagina non c'è un tasto per tornare indietro: se l'hai scartata per sbaglio, chiedi al tecnico.
Parole: non caricare, scartare, ignorare, lasciare fuori, escludere, saltare cartella, sbaglio

## Cosa vogliono dire i motivi sotto una cartella da assegnare?
- «in ReferralFlow non c'è un paziente con questo nome»: crealo o scegli tu il paziente;
- «c'è un paziente con questo nome, ma nelle lettere non trovo la sua data di nascita»: apri la lettera e, se è lui, sceglilo;
- «c'è un paziente con questo nome, ma con un'altra data di nascita»: forse è un omonimo, o la data è il giorno di un esame: controlla;
- «più pazienti con questo nome: quale?»: omonimi, scegli quello giusto;
- «dal nome della cartella non si capisce chi è»: apri il file e decidi.
Parole: motivo, perché aspetta, spiegazione, omonimi, data di nascita diversa, nessun paziente, messaggio

## Cosa fa l'AI locale con le cartelle da assegnare?
Per ogni cartella che aspetta, l'AI che gira sul Mac dello studio legge l'inizio del documento più recente e dice chi è il paziente. Niente va su internet.
Il programma poi controlla che nome e data di nascita siano scritti davvero nel testo e che il nome c'entri con la cartella; solo allora abbina il paziente (o lo crea).
Lavora quando il Mac non trascrive referti, fino a 12 cartelle ogni due minuti; «Controlla adesso» ne legge 5. Ogni cartella si legge una volta sola.
Se non riesce, sotto la cartella compare «L'AI locale legge: …— in ReferralFlow non lo trovo così» oppure «L'AI locale non ha trovato nome e data di nascita sicuri»: decidi tu.
Parole: AI locale, intelligenza artificiale, legge il documento, riconosce, automatico, modello, Mac

## Perché un file con un solo nome è stato scartato?
Un file o una cartella che porta un solo nome o un solo cognome (per esempio «103479_Rossi.pdf») e che non si riesce ad abbinare viene scartato da solo: è una decisione dello studio, perché con una parola sola non si sa chi è.
Non resta fra le «Cartelle da assegnare» e conta fra le «cartelle lasciate fuori». Il file resta sulla cartella comune.
Se un file così ha il numero di MediOnline e quel numero è di un paziente (vedi l'importazione con la colonna «N° paziente»), può invece essere riconosciuto.
Parole: un nome solo, solo cognome, scartato, non caricato, file mancante, nome incompleto

## Cosa sono le scansioni DocuWare e quando arrivano?
Sono le vecchie cartelle di carta dei pazienti scansionate (cartella «Lavori archivio DocuWare»), un PDF per paziente, chiamato «numero_Cognome_Nome.pdf». Il numero è il N° del paziente di MediOnline.
Si riconoscono dal numero e dal nome; se no con nome e data di nascita lette nelle prime pagine.
Sono pesanti: se ne leggono poche alla volta, solo la sera dopo le 20, di notte fino alle 6 e nel fine settimana (o con «Controlla adesso»). Entrano nella scheda del paziente in «Cartella cartacea scansionata», poi il Mac ci aggiunge il testo (OCR).
Per dividerle nei singoli documenti si usa «Dividi cartella»: non si dividono da sole.
Parole: DocuWare, scansioni, cartella cartacea, archivio, vecchie cartelle, PDF scansionato, numero MediOnline

## Perché una lettera della cartella comune non è entrata?
Controlla in quest'ordine:
1. La cartella del paziente è fra le «Cartelle da assegnare»? Cerca il nome con «Cerca nel nome della cartella…» e assegnala.
2. Il file è stato salvato nell'ultimo minuto, o dopo l'ultimo controllo? Premi «Controlla adesso».
3. La pagina dice «Non collegata»? Il Mac non vede la cartella comune.
4. È in una cartella che non si legge (non «Rapporti_…»), è un modello di Word, o non è Word né PDF?
5. Il file ha un nome fatto solo di un codice, un solo nome, o la cartella è stata lasciata fuori?
6. È un doppione (stesso file, o il PDF di un Word già caricato)?
7. Il file è vuoto o supera i 40 MB?
Parole: non è entrata, manca lettera, non la trovo, non caricata, problema, sincronizzazione, perché

## Perché alcune lettere risultano «doppioni saltati»?
ReferralFlow non carica due volte la stessa cosa:
- lo stesso file (identico) nella stessa cartella entra una volta sola;
- il PDF di una lettera che c'è già in Word (stesso nome, o quasi tutte le parole uguali) si salta, perché è la stessa lettera.
I doppioni si contano nel riquadro «doppioni saltati (anche il PDF di un Word)». Non devi fare niente.
Parole: doppioni, duplicati, saltati, PDF e Word, due volte, stessa lettera

## Ho corretto una lettera nella cartella comune: cosa succede?
Se modifichi e risalvi una lettera già caricata (stesso nome e stesso posto), al controllo successivo ReferralFlow sostituisce il file dentro lo stesso documento del paziente: niente doppione, la versione nuova prende il posto della vecchia.
Se vuoi vederla subito, premi «Controlla adesso» qualche minuto dopo il salvataggio.
Parole: lettera corretta, modificata, nuova versione, aggiornare lettera, risalvare, sostituire

## ReferralFlow cambia qualcosa nella cartella comune?
No. La cartella comune si legge e basta: niente viene spostato, rinominato o cancellato lì.
Anche «Non caricare» e gli scarti lasciano i file dove sono. E se elimini una lettera dalla scheda di un paziente, il file sulla cartella comune resta.
Parole: modifica la cartella comune, cancella, sposta file, sicurezza, sola lettura, toccare file

## La pagina dice «Non collegata»: cosa faccio?
Vuol dire che il Mac dello studio non vede la cartella comune (per esempio dopo un riavvio o un problema di rete).
Sul Mac dello studio apri il Finder → menu «Vai» → «Connessione al server» e collega la cartella comune. Il controllo riprende da solo.
Se premi «Controlla adesso» mentre non è collegata, compare «La cartella comune non è collegata a questo Mac: aprila dal Finder (Vai → Connessione al server) e riprova».
Se non sai come fare, chiedi al tecnico.
Parole: non collegata, scollegata, errore, non vede, rete, server, Finder, connessione al server

## Cosa sono «Lasciate fuori: archivi» e le lettere fuori da una cartella di paziente?
- «Lasciate fuori: archivi»: cartelle con più di 250 lettere che non portano il nome di un paziente (lettere nominate con un codice). Non si caricano, perché non dicono di chi sono.
- Le lettere salvate direttamente nella cartella del medico o in una cartella per giorno o per anno: ognuna si tratta da sola, col nome preso dal nome del file. Entra se il nome e la data di nascita nel testo (o il nome quasi uguale e la stessa nascita) indicano un paziente; da un nome di file non si crea mai un paziente. Un file nominato solo con un codice resta fuori.
In fondo alla pagina una riga dice quante lettere stanno fuori da una cartella di paziente.
Parole: archivi, lasciate fuori, lettere sciolte, codice, fuori cartella, file nel posto sbagliato

## Una cartella è finita nel paziente sbagliato: cosa faccio?
Se è solo il nome del paziente creato a essere scritto male, correggilo nella sua scheda con «Modifica dati».
Se invece le lettere sono andate a un'altra persona: dalla pagina non c'è un tasto per cambiare il paziente di una cartella già assegnata, e un documento non si sposta da un paziente all'altro. Avvisa il tecnico o l'amministrazione, dicendo la cartella e il paziente.
Nel frattempo puoi eliminare le lettere sbagliate dalla scheda: restano nello «Storico degli eliminati» e il file sulla cartella comune non si tocca.
Parole: paziente sbagliato, errore abbinamento, lettere sbagliate, assegnata male, correggere, spostare

## A cosa serve «Dividi cartella»?
Una cartella intera arriva spesso come un PDF solo: la cartella di carta scansionata, o l'esportazione di un altro programma, con dentro lettere, referti, laboratori, ECG.
«Dividi cartella» la separa nei suoi documenti: ognuno diventa un PDF a sé, con tipo, data e nome, nella sottocartella giusta della scheda del paziente.
Il Mac propone dove tagliare; una persona controlla e conferma. Il PDF di partenza resta nella cartella com'era.
Parole: dividere, separare, spezzare PDF, cartella scansionata, cartella completa, PDF unico, documenti singoli

## Come divido una cartella scansionata?
1. Apri «Dividi cartella» nel menu «Clinico».
2. Trascina il PDF nel riquadro «Trascina qui la cartella completa, in PDF», o premi «Scegli il file…». Va bene anche per chi non è ancora in ReferralFlow.
3. Conferma di chi è (vedi la sezione su come riconosce il paziente).
4. Aspetta la proposta («Documenti trovati»): i documenti raggruppati per sottocartella, con le miniature delle pagine.
5. Correggi i tagli se serve.
6. Premi «Crea N documenti».
In alternativa, in «…oppure parti da un paziente che c'è già» scrivi il cognome, scegli il paziente e poi carica il PDF o premi «Dividi» su un PDF già nella sua cartella.
Parole: come si divide, procedura, passi, caricare cartella, PDF grande, iniziare, dividi

## Come riconosce Dividi cartella di chi è il PDF?
Legge il nome del file (per esempio «Cognome Nome 03.04.1950.pdf») e le prime pagine (righe come «Paziente:», «nata il», «Data di nascita»).
- Se nome e data di nascita sono di una persona sola, usa la sua cartella e lo scrive: «Riconosciuto …: la sua cartella c'era già».
- Se il nome del file è chiaro e la persona non c'è, crea la sua cartella: «…non c'era: ho creato la sua cartella».
- Negli altri casi chiede, con «Da controllare:» e il perché: tasti «È …: usa la sua cartella», «Non è lei/lui», oppure i campi Cognome, Nome, Nascita e «Crea la cartella e continua», o «…oppure è di qualcuno che c'è già».
Se ha sbagliato, premi «Cambia».
Parole: di chi è, riconoscere paziente, nome file, crea la cartella, usa la sua cartella, sbagliato paziente, cambia

## Come correggo i tagli proposti?
Nella proposta «Documenti trovati»:
- «✂» fra due pagine taglia: da lì comincia un documento nuovo;
- «Unisci al precedente» incolla il pezzo a quello prima (c'è solo se sono nella stessa sottocartella);
- «Lascia fuori» esclude pagine bianche o doppie («Rimetti» le riprende);
- tipo, data e nome si riscrivono nei campi del pezzo; la tendina a destra sposta il pezzo in un'altra sottocartella; il nome di una sottocartella si riscrive in testa al gruppo.
Clic su una pagina: si apre in grande; le frecce ‹ › (o quelle della tastiera) scorrono, «Qui comincia un documento» o «Non comincia qui: unisci al precedente» tagliano o uniscono, Esc chiude.
«Torna ai tagli proposti» cancella le tue correzioni.
Parole: correggere tagli, tagliare, unire, forbici, lascia fuori, pagine bianche, rinominare pezzo, data, sottocartella

## Cosa vogliono dire le etichette sui documenti proposti?
- «senza data»: nella prima pagina non c'è una data; scrivila tu, serve per l'ordine;
- «da guardare»: il taglio è probabile ma non sicuro, guarda la prima pagina;
- «senza testo: taglia tu»: la pagina non ha testo leggibile;
- «taglio tuo»: l'hai messo tu;
- «scritta a mano»: il Mac ha visto che è a mano, quindi va negli Appunti (un documento per giorno);
- «data letta a occhio: controlla»: la data non è nel testo, il Mac l'ha letta dalla scrittura;
- una nota come «era in «…»»: nella cartella di carta stava in un'altra sezione ed è stato spostato per il contenuto.
Parole: etichette, badge, da guardare, senza data, scritta a mano, data letta a occhio, avvisi

## Come sceglie Dividi cartella sottocartelle e nomi?
- I fogli col codice a barre della cartella di carta separano le sezioni: ognuna diventa una sottocartella (01_Rapporti, 03_Appunti, 09_Laboratorio e analisi…). I fogli separatori e la copertina restano fuori.
- Il contenuto può spostare un documento: le pagine scritte a mano negli Appunti, le tabelle di valori in Laboratorio, procure e dispense nei Documenti amministrativi, i piani di medicazione nelle Ricette.
- Il nome è «anno.mese.giorno Cognome Nome Che cos'è» (per esempio «2023.10.18 Rossi Maria Holter»), così l'ordine alfabetico è quello del tempo.
Parole: sottocartelle, nomi documenti, codice a barre, separatori, copertina, sezioni, ordine, nome file

## Perché la proposta cambia da sola o ci mette tanto?
Il Mac lavora in due tempi:
- se il PDF è una scansione senza testo, prima la legge (OCR): «È una scansione: il Mac la sta leggendo»;
- poi ragiona pagina per pagina: «Il Mac sta ragionando sui documenti», con quante pagine ha letto e quanto manca. Fino ad allora la proposta è provvisoria.
La pagina si aggiorna da sola. Ci vogliono circa 6–13 secondi per pagina: una cartella di 150 pagine è sulla mezz'ora. Se il Mac sta trascrivendo un referto, quello ha la precedenza.
Se hai già cominciato a correggere, la proposta nuova non sovrascrive: compare «Il Mac ha finito…» e scegli tu se passare alla proposta nuova (le tue correzioni si perdono).
Parole: lento, aspetta, ci mette tanto, si aggiorna, proposta provvisoria, il Mac sta leggendo, ragionando

## Come ritrovo una cartella lasciata a metà?
Nella prima schermata di «Dividi cartella», in fondo, c'è «Cartelle già caricate» (ultimi 90 giorni): paziente, nome del file, giorno e stato: «il Mac la sta leggendo», «il Mac ci sta ragionando», «da dividere» o «divisa in N documenti il …».
Premi «Dividi» per riprenderla, «Dividi di nuovo» se era già divisa, o «Cartella» per andare alla scheda del paziente.
Le correzioni fatte a mano non si salvano: se ricarichi la pagina riparti dalla proposta del Mac.
Parole: ritrovare, riprendere, lasciata a metà, storico, cartelle già caricate, continuare dopo

## Cosa succede se divido di nuovo una cartella già divisa?
La pagina avvisa: «Questa cartella è già stata divisa: N documenti creati la volta prima».
Creando i nuovi, quelli di prima vengono tolti e sostituiti (sono copie di pagine dell'originale, che resta). Quelli già allegati a un referto si tengono.
Se vuoi tenere anche quelli vecchi, spunta «tienili accanto ai nuovi» prima di premere «Crea N documenti».
I documenti tolti finiscono nello «Storico degli eliminati» del paziente.
Parole: dividere di nuovo, rifare, sostituire, già divisa, documenti vecchi, tienili accanto ai nuovi

## Come scarico i documenti creati?
Dopo «Crea N documenti» la pagina mostra «Documenti creati», raggruppati per sottocartella.
- «Apri» o «Scarica» su ogni documento;
- «Scarica tutti (.zip)» per averli tutti in un file .zip, con le stesse sottocartelle;
- «Apri la cartella di …» porta alla scheda del paziente; «Dividi un'altra cartella» ricomincia.
Un documento scaricato finisce sul tuo dispositivo: da lì sei tu responsabile di dove va.
Parole: scaricare, zip, download, documenti creati, salvare, esportare, aprire cartella

## Quali sono i limiti di «Dividi cartella»?
- Solo PDF, fino a 300 MB (circa mille pagine); oltre compare «Il file supera i 300 MB», un altro formato dà «Serve un PDF».
- Le pagine scritte a mano si riconoscono ma non si leggono: la data spesso manca e la metti tu.
- Dove una pagina non ha testo leggibile i tagli li metti tu con le forbici.
- Le correzioni a mano non si salvano se ricarichi la pagina.
- Non si possono ruotare o riordinare le pagine.
- Il PDF di partenza resta nella cartella: se non serve più, eliminalo tu dalla scheda del paziente.
- La conferma è sempre di una persona: niente nasce prima di «Crea N documenti».
Parole: limiti, non funziona, troppo grande, 300 MB, scritto a mano, ruotare pagine, problemi, errori
