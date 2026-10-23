# Pressione e saturazione

«Pressione» mostra il profilo pressorio delle 24 ore (o di più giorni, fino a otto) con sopra la terapia e le finestre d'azione dei farmaci; «Saturazione notturna» mostra le notti registrate con l'anello O2Ring.
Le vedono segreteria, aiuto medico, medico e amministrazione; il tecnico vede la voce nel menu ma non i dati. Terapia, soglie e tabella dei farmaci hanno permessi più stretti (vedi le sezioni).
Nel menu a sinistra: gruppo «Clinico» → «Pressione», e subito sotto «Saturazione notturna». Sul telefono: «Altro».

## Come arriva un profilo della pressione nella piattaforma?
Tre strade:
1. Dal **generatore dei referti Aktiia** (il file sui computer dello studio): dopo la conferma del medico manda misure e referto Word.
2. Dalla **cartella condivisa «Pressione da leggere»**: ci metti il rapporto PDF o il CSV del misuratore e la piattaforma lo legge da sola in pochi secondi.
3. **A mano** dalla pagina «Pressione», riquadro «Nuovo profilo».
In tutti i casi il profilo va da solo nel paziente giusto se nome e data di nascita combaciano con una sola persona; se no compare fra gli «Arrivati dalla cartella, da assegnare».
Parole: pressione 24 ore, ABPM, holter pressorio, profilo pressorio, caricare pressione, Aktiia, misure pressione

## Come mando un referto Aktiia dal generatore?
Nel generatore (scheda «Pressione · Aktiia»):
1. Carica il file delle misurazioni e compila i «Dati del paziente»: «Nome paziente», «Cognome paziente» e «Data di nascita» sono obbligatori e devono essere come in ReferralFlow.
2. Premi «Genera referto Word», apri il Word e controllalo.
3. Spunta «Ho controllato il referto: paziente, date e valori sono corretti.» e premi «Conferma e invia».
Il profilo nasce nella pagina «Pressione» e il Word va nei «Documenti» del paziente come referto. Se dopo aver generato il referto cambi un dato, va rigenerato prima di inviare.
Parole: generatore Aktiia, referto Word, conferma e invia, inviare pressione, report generator, braccialetto Aktiia

## Come collego il generatore Aktiia a ReferralFlow (la chiave)?
Serve una volta per computer.
1. L'amministrazione apre Studio → scheda «Dati» → riquadro «Generatore referti pressione (Aktiia)» e preme «Genera la chiave».
2. La chiave si vede **una volta sola**: premi «Copia», poi «L'ho copiata: nascondi».
3. Nel generatore, in alto a destra, apri «Collegamento ReferralFlow»: scrivi l'indirizzo indicato nel riquadro e incolla la chiave in «Chiave».
4. Premi «Salva e prova».
La stessa chiave vale anche per la saturazione O2Ring. Non mandare la chiave per e-mail o chat.
Parole: chiave, collegamento ReferralFlow, generatore, token, configurare, nuovo computer, Salva e prova

## Ho perso la chiave o un computer non riesce più a inviare
- Se il generatore dice che ReferralFlow non accetta la chiave, la chiave è sbagliata o è stata revocata.
- La chiave non si può rivedere. L'amministrazione va in Studio → «Dati» → «Generatore referti pressione (Aktiia)» e preme «Rigenera la chiave»: la vecchia smette di funzionare su **tutti** i computer, quindi la nuova va incollata in ognuno.
- «Revoca» spegne l'invio da tutti i computer finché non se ne genera una nuova.
- Nel generatore, «Togli la chiave» la cancella da quel computer.
Solo l'amministrazione genera, rigenera o revoca.
Parole: chiave persa, chiave non valida, 401, non invia, rigenera, revoca, errore generatore

## Come uso la cartella «Pressione da leggere»?
1. Metti nella cartella il rapporto PDF del misuratore oppure un CSV o testo con una riga per misura.
2. La piattaforma lo legge da sola entro pochi secondi.
3. Dal rapporto PDF prende da sola nome e data di nascita. Per un CSV, chiama il file «Cognome Nome data di nascita» (per esempio «Cognome Nome 31.12.1950.csv») oppure scrivi nome e data di nascita nelle prime righe.
Se combacia con una sola persona, il profilo va nella sua cartella. Se no compare in «Arrivati dalla cartella, da assegnare».
I file letti passano in «Letti» e dopo sette giorni si cancellano da soli.
Parole: cartella condivisa, Pressione da leggere, mettere file, rapporto PDF, CSV, misuratore, lettura automatica

## Come collego la cartella della pressione da un altro computer?
Nella pagina «Pressione», in fondo, c'è il riquadro «Cartella «…»».
- Se dice «condivisa in rete»: premi «Collegala da un PC Windows» (scarica un piccolo file: aprilo una volta e sulla Scrivania compare il collegamento) oppure «Collegala da un Mac». Utente e password li chiede il computer la prima volta.
- Se dice «non ancora condivisa»: va condivisa una volta dal Mac del server, in Impostazioni di Sistema → Generali → Condivisione → Condivisione file, aggiungendo la cartella col «+».
Funziona solo dentro la rete dello studio.
Parole: collegare cartella, Windows, condivisione, cartella di rete, PC segreteria, smb, collegamento Scrivania

## Il file messo nella cartella non compare
- Guarda nella sottocartella «Non letti»: accanto al file c'è un file «….perche.txt» che dice che cosa non va.
- Formati letti: PDF (fino a 8 MB), CSV, TXT, TSV (fino a 400 KB). Un foglio Excel non si legge: da Excel «Salva con nome» → CSV.
- Servono almeno 10 misure; un PDF senza elenco delle misure (una scansione) non si legge.
- Un file appena copiato si legge dopo qualche secondo.
- Lo stesso profilo rimesso nella cartella non si carica due volte.
- Forse è arrivato ma «da assegnare»: guarda il riquadro «Arrivati dalla cartella, da assegnare».
Parole: file non letto, Non letti, perche.txt, Excel, errore cartella, profilo mancante, non arriva

## Come carico un profilo a mano?
Nella pagina «Pressione», riquadro «Nuovo profilo»:
1. In «Paziente» scrivi il cognome e clicca il paziente giusto.
2. In «Misure esportate dal programma dell'apparecchio» premi «Scegli il file…» (PDF del misuratore, CSV o testo), oppure incolla le righe nel campo sotto.
3. Solo se nel file manca la data, compila «Giorno d'inizio». «Apparecchio» è facoltativo.
4. Premi «Carica il profilo».
Con la riga d'intestazione le colonne si riconoscono dal nome, in qualunque ordine (anche in tedesco e inglese).
Parole: nuovo profilo, caricare a mano, importare pressione, incollare misure, CSV pressione, file misuratore

## Come assegno un profilo «da assegnare»?
Nella pagina «Pressione», riquadro «Arrivati dalla cartella, da assegnare» (sotto l'elenco dei profili):
1. Leggi la riga: nome del file, numero di misure, periodo e il motivo («Non agganciato da solo: …»).
2. Nel campo «Di chi è? Scrivi il cognome» scrivi almeno due lettere e clicca il paziente giusto.
3. Premi «Crea il profilo». «Cambia» per scegliere un altro paziente.
Qui arrivano anche gli invii del generatore Aktiia non riconosciuti: assegnati, il loro referto Word va nei Documenti del paziente.
Parole: da assegnare, assegnare profilo, pressione non agganciata, scegliere paziente, arrivati dalla cartella

## Il paziente del profilo pressione non ha ancora la cartella
Nel riquadro «Arrivati dalla cartella, da assegnare», sulla riga del file:
1. Premi «Non ha ancora la cartella: creala».
2. Controlla «Cognome», «Nome» e data di nascita (formato 31.12.1950): sono letti dal file, ma l'ordine di nome e cognome non è sicuro.
3. Premi «Crea cartella e profilo».
Nascono insieme la cartella e il profilo. Se una cartella con lo stesso nome e la stessa data esiste già, si usa quella: niente doppioni. Da lì i file successivi della persona vanno a posto da soli.
Parole: nuovo paziente, creare cartella, paziente nuovo pressione, crea cartella e profilo, prima volta

## Come scarto un file della pressione arrivato per sbaglio?
Sulla riga in «Arrivati dalla cartella, da assegnare» premi «Scarta» e conferma.
Attenzione: le misure del file non si recuperano da qui; se serve, rimetti il file nella cartella o rimandalo dal generatore. Se l'invio veniva dal generatore, anche il suo referto Word si cancella.
Parole: scartare, eliminare file, file sbagliato, togliere arrivo, doppione, cancellare

## Come leggo la pagina di un profilo della pressione?
Clicca un profilo nell'elenco «Profili». In alto ci sono i riquadri: media delle 24 ore, media di giorno, media di notte, calo notturno (atteso 10–20%), picco del mattino, misure valide, punteggio del profilo.
Sotto: «Profilo delle 24 ore e finestre d'azione dei farmaci» (il grafico), «Dove la pressione esce dai valori» (le fasce sopra soglia o troppo basse), «Terapia al momento del profilo», «Proposte di orario», «Giorno, notte e soglie», «Come nasce il punteggio».
Se compare «Registrazione non affidabile», i numeri si vedono ma non reggono una conclusione. «← Pressione» torna all'elenco.
Parole: leggere profilo, medie, calo notturno, dipping, picco mattutino, punteggio, grafico pressione

## Come guardo un giorno alla volta nel grafico della pressione?
Se la registrazione dura più giorni, sopra il grafico ci sono i tasti «Tutto» e uno per ogni giorno.
- «Tutto» mostra tutta la registrazione, con la data a ogni mezzanotte.
- Un giorno mostra da mezzanotte a mezzanotte, con accanto le medie di quel giorno (tutte, di giorno, di notte).
Passando col mouse (o col dito) sul grafico vedi la misura più vicina: sistolica/diastolica, frequenza, giorno e ora.
La scelta cambia solo la vista: i numeri in alto restano calcolati su tutta la registrazione.
Parole: grafico, giorno per giorno, più giorni, zoom giorno, misura singola, cursore, vista

## Come scrivo la terapia di un profilo?
Lo fanno medico e aiuto medico.
1. Nel profilo, riquadro «Terapia al momento del profilo», premi «Modifica».
2. Per ogni farmaco scrivi il nome come lo scrivete (per esempio «Coversum 5 mg»), la dose e gli orari delle prese separati da virgola («08:00, 20:00»).
3. «Aggiungi un farmaco» per un'altra riga, «Togli» per eliminarla.
4. Premi «Salva la terapia» («Annulla» per uscire).
Al secondo profilo dello stesso paziente la terapia si riprende dal precedente: va controllata.
Parole: terapia, farmaci, orari farmaci, antipertensivi, scrivere terapia, modificare terapia, dose

## Perché un farmaco non ha la finestra d'azione?
Nella tabella della terapia, accanto a ogni farmaco, c'è il motivo:
- «non in tabella»: il nome non è stato riconosciuto; scrivilo come marchio noto o con il principio attivo.
- «numeri da confermare»: il medico non ha ancora confermato quella riga nella «Tabella dei farmaci».
- «senza finestra oraria»: per quel farmaco l'orario non conta.
- «orario non scritto»: mancano gli orari delle prese.
Solo i farmaci confermati entrano nel grafico e nei calcoli. La finestra è un disegno dei numeri della tabella, non una misura sul paziente.
Parole: finestra d'azione, farmaco non riconosciuto, non in tabella, da confermare, barra farmaco, effetto farmaco

## Come cambio sveglia, notte e soglie?
Nel profilo, riquadro «Giorno, notte e soglie», premi «Modifica».
- «Sveglia» e «A letto» li cambiano medico e aiuto medico (di partenza 07:00 e 22:00).
- Le soglie («Giorno sist.», «Giorno diast.», «Notte sist.», «Notte diast.», «Bassa di giorno sotto», «Bassa di notte sotto») le cambia solo il medico. Di partenza: 135/85 di giorno, 120/70 di notte.
Premi «Salva». Cambiare questi valori cancella le proposte di orario aperte.
Parole: soglie, sveglia, sonno, notte, giorno, valori bersaglio, impostazioni profilo, ora di dormire

## Che cos'è la tabella dei farmaci e come si conferma?
Nella pagina «Pressione» premi «Tabella dei farmaci» (in alto a destra, accanto a «Profili»).
Per ogni principio attivo: inizio, picco, durata ed emivita in ore, calo in mmHg e stato («confermato» o «da confermare»). Sotto ogni numero è scritto da dove viene: «dal testo», «bozza» o «a mano». «Cinetica» apre la scheda con la curva e le fonti citate.
Solo il medico conferma: controlla la riga sul testo svizzero (swissmedicinfo.ch), corregge se serve, preme «Conferma». «Salva» salva senza confermare, «Togli conferma» la toglie. Cambiare un numero toglie la conferma.
Parole: tabella farmaci, farmacocinetica, confermare farmaco, emivita, picco, cinetica, swissmedicinfo

## Che cosa sono le proposte di orario?
Sono accese dall'8.10.2026. Il software propone solo **a che ora** prendere un farmaco già prescritto, preso una volta al giorno e con la riga confermata. Mai farmaci, dosi, aggiunte o sospensioni.
Solo il medico, nel riquadro «Proposte di orario», preme «Calcola le proposte di orario» (o «Ricalcola le proposte»). Su ogni proposta: «Accetta», scrivi un'ora e «Scelgo un altro orario», oppure «Scarta». Resta scritto chi ha deciso.
Sono stime: la conferma è un nuovo monitoraggio. Con una registrazione non affidabile non nascono proposte.
Parole: proposte orario, cronoterapia, spostare farmaco, orario assunzione, accetta proposta, calcola proposte

## Come confronto un profilo con il precedente?
Se lo stesso paziente ha un profilo precedente, nella pagina del profilo compare il riquadro «Rispetto al profilo precedente»: differenze di punteggio, media 24 ore, calo notturno e ore in bersaglio, e la terapia di allora.
«Apri» apre il profilo precedente. Nel grafico la curva precedente è tratteggiata.
Il punteggio serve a confrontare due profili dello stesso paziente, non a promettere un beneficio.
Parole: confronto, prima e dopo, profilo precedente, controllo, differenza, andamento, follow-up

## Come elimino un profilo della pressione?
Lo fanno medico e aiuto medico. Nel profilo, in alto a destra, premi «Elimina il profilo» e poi «Elimina» nella finestra.
Si tolgono le misure, la terapia scritta per quel profilo e le proposte. **Non si può annullare.** Il referto Word eventualmente arrivato resta nei Documenti del paziente.
Parole: eliminare profilo, cancellare pressione, profilo sbagliato, togliere profilo, elimina

## Limiti della pagina Pressione
- Un profilo dura al massimo otto giorni; oltre si rifiuta (anche dal generatore).
- Servono almeno 10 misure. È affidabile con almeno il 70% di misure valide, 20 di giorno e 7 di notte.
- Due misure allo stesso minuto diventano una.
- La terapia non si prende dalla cartella: si scrive nel profilo.
- La pagina non sceglie farmaci né dosi e non scrive il commento del referto.
Parole: limiti, otto giorni, troppo lungo, misure minime, non affidabile, cosa non fa

## Come arriva una registrazione di saturazione notturna (O2Ring)?
Dal generatore dei referti dello studio, scheda «Sonno · O2Ring»:
1. In «I file delle notti» carica i CSV delle notti esportati dall'app ViHealth.
2. In «Dati del paziente» compila «Nome paziente», «Cognome paziente», «Data di nascita» come in ReferralFlow (nota e valutazione del medico sono facoltative).
3. Controlla l'anteprima del referto.
4. In «Conferma e invia a ReferralFlow» spunta «Ho controllato il rapporto: paziente, notti e valori sono corretti.» e premi «Conferma e invia».
Le notti vanno nella pagina «Saturazione notturna» e il rapporto PDF nei «Documenti» del paziente. Serve il «Collegamento ReferralFlow» con la stessa chiave della pressione.
Parole: O2Ring, saturazione notturna, ossimetria, anello, ViHealth, invio notti, generatore sonno

## Dove vedo le registrazioni di saturazione?
Menu «Saturazione notturna». L'elenco mostra per ogni registrazione: paziente con data di nascita, periodo delle notti, numero di notti, SpO₂ media, minima, minuti sotto il 90%, ODI 4% con il livello, e il link «rapporto».
Clicca la riga per il dettaglio; il link «rapporto» apre il PDF.
Se la pagina dice «Ancora nessuna registrazione», non è ancora arrivato niente dal generatore.
Parole: elenco saturazione, registrazioni, notti, SpO2, ossimetria, rapporto PDF, lista

## Come leggo il dettaglio di una registrazione di saturazione?
In alto: «Saturazione media», «Saturazione minima», «Tempo sotto il 90%», «Cadute all'ora (ODI 4%)», «Frequenza cardiaca media».
Sotto: la tabella «Notte per notte» (con la riga «Tutte»), per ogni notte la curva della saturazione (il 90% tratteggiato, le cadute di almeno 4 punti come triangoli) e quella della frequenza cardiaca, e il grafico «Quanto tempo a ogni livello di saturazione» (in rosso sotto il 90%). Poi nota e valutazione del medico, se inviate, e «Altre registrazioni di …».
In alto a destra «Apri il rapporto»; il nome del paziente apre la sua cartella; «← Saturazione notturna» torna all'elenco.
Parole: dettaglio saturazione, curva, desaturazioni, istogramma, notte per notte, frequenza cardiaca, grafico

## Che cosa vogliono dire ODI e i livelli (norma, lieve, moderato, marcato)?
ODI = cadute della saturazione all'ora. Una caduta è un abbassamento di almeno 3 o 4 punti rispetto ai 2 minuti precedenti, per almeno 10 secondi.
Livelli dell'ODI 4%, indicativi come nel rapporto: meno di 5 all'ora «nella norma», 5–15 «lieve», 15–30 «moderato», oltre 30 «marcato».
I numeri sono quelli del rapporto confermato nel generatore: la piattaforma non li ricalcola. L'anello è uno strumento di screening: la valutazione è del medico.
Parole: ODI, indice di desaturazione, cadute, apnee, livelli, lieve moderato, screening

## Come assegno un invio di saturazione «da assegnare»?
In cima alla pagina «Saturazione notturna», riquadro «Arrivati dal generatore, da assegnare»:
1. Leggi la riga (nome e nascita letti, notti, valori) e il motivo. «apri il rapporto» per controllare.
2. Nel campo «Di chi è? Scrivi il cognome» scrivi almeno due lettere e clicca il paziente giusto, poi «Metti nella sua cartella».
3. Se non ha la cartella: «Non ha ancora la cartella: creala», controlla cognome, nome, data (31.12.1950) e premi «Crea la cartella» (niente doppioni).
4. «Scarta» per un invio sbagliato: nel generatore il rapporto resta e si può rimandare.
Parole: da assegnare, saturazione non agganciata, assegnare notti, creare cartella, scartare invio, O2Ring

## L'invio O2Ring dal generatore non arriva o dà errore
Leggi il messaggio sotto «Conferma e invia»:
- «Prima imposta il «Collegamento ReferralFlow»»: manca la chiave su quel computer.
- «ReferralFlow non accetta la chiave»: chiave sbagliata o revocata, l'amministrazione ne genera una nuova.
- «Arrivato, da assegnare»: è arrivato, va assegnato nella pagina «Saturazione notturna».
- «Già inviato…»: c'è già, niente doppioni.
- «Questo ReferralFlow non riceve ancora la saturazione notturna»: la piattaforma va aggiornata, avvisa il tecnico.
- «ReferralFlow ha rifiutato l'invio: …»: il motivo è scritto (al massimo 14 notti; rapporto fino a 8 MB).
Il tasto resta grigio finché non spunti la conferma.
Parole: errore invio, non arriva, saturazione mancante, chiave, già inviato, rifiutato, O2Ring problema

## Chi può fare che cosa in Pressione e Saturazione?
- Vedere profili e registrazioni: segreteria, aiuto medico, medico, amministrazione. Il tecnico no.
- Caricare un profilo, assegnare, creare la cartella da un arrivo, scartare: segreteria, aiuto medico, medico, amministrazione.
- Terapia, sveglia e notte, eliminare un profilo: medico e aiuto medico.
- Soglie, conferma della tabella dei farmaci, proposte di orario: solo il medico.
- Chiave del generatore: solo l'amministrazione.
Se non vedi «Saturazione notturna» nel menu, l'amministrazione può averla nascosta in Studio → «Dati» → «Voci del menu che questo studio non usa».
Parole: permessi, ruoli, chi può, segreteria, medico, aiuto medico, non posso, accesso
