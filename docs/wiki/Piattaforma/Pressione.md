---
tipo: piattaforma
aggiornata: 2026-10-08
---
# Pressione

Il profilo pressorio delle 24 ore di un paziente con **sopra** la terapia che prendeva: per ogni antipertensivo, quando è stato preso e quando «sta lavorando». Nessun programma dei misuratori lo fa, perché non conosce la terapia; la piattaforma sì. Voce «Pressione» del menu, dal 7.10.2026.

## Che cos'è, e che cosa non è

Due parti, e la legge le tratta in modo diverso — come per le immagini.

- **La pagina che mostra** (in uso): profilo, medie, calo notturno, fasce fuori dai valori, finestre d'azione dei farmaci, punteggio, prima e dopo. Non propone niente.
- **Le proposte di orario** (**ACCESE dall'8.10.2026, per decisione dello studio, prima che validazione, rilettura regolatoria e notifica fossero fatte** — vedi Decisioni/Registro): il software propone a che ora prendere un farmaco già prescritto. Una proposta nasce solo per i farmaci la cui riga è confermata dal medico nella tabella (quel giorno: 0 su 45) e la decide sempre il medico. È un **dispositivo medico fabbricato e usato dentro lo studio** (ODmed art. 9 e 18), come il righello: fascicolo in `docs/legale/dispositivo-in-house-pressione/`. Si accendono solo con `PRESSIONE_PROPOSTE=1` nel `.env` del server (`src/lib/pressione/accese.ts`); per spegnerle si toglie la riga e si riavvia. Tabella confermata, validazione, rilettura regolatoria e notifica restano **da fare**.

Il confine che il codice fa rispettare: **solo l'orario** di farmaci che il medico ha già scelto. Mai farmaci, dosi, aggiunte, sospensioni. Se nessuno spostamento basta, la frase fissa «Con qualunque orario dei farmaci attuali la pressione resta sopra la soglia in queste fasce … Valutazione del medico» — descrive i dati, non giudica la terapia.

**Il limite da non dimenticare**: che spostare l'orario migliori gli esiti non è dimostrato (lo studio più grande non ha trovato differenze fra mattino e sera; le linee guida europee dicono l'orario che il paziente rispetta). Il punteggio serve a confrontare due profili dello stesso paziente, non a promettere un beneficio.

## Come si usa

1. **Nuovo profilo**: si sceglie il paziente e il file esportato dal programma dell'apparecchio (CSV o testo; da Excel «Salva con nome → CSV»), oppure si incollano le righe. Con la riga d'intestazione le colonne si riconoscono dal nome in qualunque ordine (data, ora, sistolica, diastolica, frequenza — anche in tedesco e inglese; le colonne in più si ignorano). Senza intestazione valgono solo tre colonne nell'ordine atteso: di più non si indovina. Se nel file manca la data si indica il giorno d'inizio.
2. **Terapia**: nome come lo scrive lo studio, dose, orari delle prese (`08:00, 20:00`). Al secondo profilo dello stesso paziente la terapia si riprende dal precedente: è un punto di partenza da controllare.
3. **Si guarda**: i numeri in alto, il grafico, le fasce.

## La cartella condivisa (8.10.2026)

Oltre a caricarlo dalla pagina, il file delle misure si può **mettere in una cartella** e la piattaforma lo legge da sola entro pochi secondi (`src/lib/pressione/cartella-server.ts`, giro ogni 10 secondi avviato da `src/instrumentation.ts`; si spegne con `PRESSIONE_CARTELLA_GIRO=spento`).

- **Dov'è**: `~/Pressione da leggere` sul Mac del server (`PRESSIONE_CARTELLA` per cambiarla). **Non sulla Scrivania**: macOS non lascia leggere Scrivania e Documenti ai servizi in sottofondo senza un permesso dato a mano.
- **Di chi è il file** (`identitaDaFile`, puro): dal **nome del file** — `Rossi Maria 12.06.1955.csv`, dove la data è quella di **nascita** — oppure dalle **prime righe** (`Paziente: …`, `Data di nascita: …`, anche in tedesco e inglese), che vincono sul nome del file. Poi la regola severa delle immagini: nome **e** data di nascita, **una persona sola**. Se combacia nasce subito il profilo; se no il file entra fra gli **«Arrivati dalla cartella, da assegnare»** in cima alla pagina (tabella `pa_arrivi`, migrazione 086) e una persona sceglie il paziente o lo scarta. Non si indovina mai. Se la persona **non ha ancora la cartella** in piattaforma, dallo stesso riquadro «Non ha ancora la cartella: creala» apre cognome, nome e data di nascita già riempiti con ciò che si è letto dal file (cognome e nome proposti da `proponiAnagrafica`: vanno guardati, l'ordine nel file non è garantito); alla conferma nascono insieme cartella e profilo (`creaCartellaEAssegna`, azione `crea_cartella`: serve poter caricare un profilo **e** il permesso sui pazienti; data di nascita obbligatoria; se una cartella con lo stesso nome e la stessa data c'è già si usa quella, mai un doppione). Da lì i file successivi di quella persona vanno a posto da soli.
- **Il rapporto in PDF** (8.10.2026): il programma del misuratore dello studio non esporta un CSV, stampa un «Rapporto misurazione pressione» in PDF — testata col paziente (nome sulla riga di «data rapporto:», data di nascita sotto «data di nascita»), poi l'«Elenco» con una riga per misura («No. Data - Ora SIS DIA FC»). `rapportoDaTesto` (puro) ricava dal **testo** del PDF le misure e il paziente; il testo lo estrae `pdf-parse`, come per i documenti della cartella. Vale nella cartella condivisa e nel caricamento dalla pagina (il PDF viaggia in base64 nel corpo). Provato sul primo rapporto vero, solo coi conteggi: 128 misure su 67 ore, nome e data di nascita trovati. Un profilo può quindi coprire **più giorni** (fino a otto): le medie orarie sono su tutte le giornate. Un PDF senza elenco (un referto stampato, una scansione) va in «Non letti».
- **Che cosa si legge**: `.pdf` (fino a 8 MB), `.csv`, `.txt`, `.tsv` (fino a 400 KB), almeno 10 misure. Un foglio Excel, un file senza misure finiscono in **«Non letti»** con accanto un file `….perche.txt` che dice che cosa fare. I file di sistema (`.DS_Store`, `Thumbs.db`, quelli in copia) non si toccano; un file modificato da meno di 8 secondi si lascia stare, perché lo stanno ancora copiando.
- **Dopo**: il file letto passa in **«Letti»**, e dopo **sette giorni** si cancella da solo (anche da «Non letti»): è un dato sanitario e ormai sta nel database. Lo stesso profilo rimesso nella cartella non si carica due volte. Assegnato o scartato, il testo del file non resta in `pa_arrivi`.
- **Condivisa**: la pagina mostra se il Mac condivide la cartella in rete (`sharing -l`) e, quando sì, dà il file `.bat` per collegarla da Windows e l'indirizzo `smb://` per il Mac — lo stesso meccanismo della cartella dei dettati, senza credenziali dentro. La condivisione si accende **dal Mac**: Impostazioni di Sistema → Generali → Condivisione → Condivisione file, e col «+» si aggiunge la cartella. Solo nella rete dello studio, mai su servizi di sincronizzazione.
- **Chi**: assegna o scarta un arrivo chi può caricare un profilo (segreteria, aiuto medico, medico).

## Che cosa calcola (tutto in `src/lib/pressione/calcolo.ts`, puro)

- **Giorno e notte** dall'orologio del paziente (sveglia e ora di andare a letto, per profilo: 07:00 e 22:00 di partenza). Gli orari delle misure sono `timestamp` **senza fuso**, apposta: convertirli serve solo a sbagliare la notte.
- **Medie** 24 ore, giorno, notte; **calo notturno** sulla sistolica (normale 10–20%, ridotto, assente, eccessivo, inverso); **picco del mattino** (due ore dopo la sveglia meno le tre ore attorno al minimo notturno); **carico** (quota di misure sopra soglia).
- **Qualità**: affidabile con almeno il 70% di misure valide, 20 di giorno e 7 di notte. Se no i numeri si mostrano con l'avviso che non reggono una conclusione. Una misura fuori dai limiti di plausibilità resta nel profilo ma non conta.
- **Soglie** di partenza 135/85 di giorno e 120/70 di notte; «troppo bassa» sotto 100 di giorno e 90 di notte (sistolica). Le cambia il medico, per profilo.
- **Fasce**: ore contigue sopra soglia o troppo basse, anche a cavallo della mezzanotte.
- **Finestra d'azione** di un farmaco: dai quattro numeri della tabella (inizio, picco, durata, emivita, in ore dalla presa). Niente prima dell'inizio, sale fino al picco, scende a un residuo alla fine della durata, si spegne in un'emivita. È un **disegno dei numeri della tabella, non una misura sul paziente**, e la pagina lo scrive.
- **Fascia scoperta**: sopra soglia, e per più di metà delle sue ore nessun farmaco è almeno a metà del suo effetto.
- **Punteggio** 0–100: ore dentro i valori bersaglio 55, calo notturno 15, picco del mattino 15, nessuna ora troppo bassa 15. «Regolare» **non** vuol dire piatto: un profilo senza calo notturno perde quei punti.
- **Prima e dopo**: differenze col profilo precedente dello stesso paziente, e la sua curva tratteggiata nel grafico.

## La tabella dei farmaci

Una cinquantina di principi attivi (`src/lib/pressione/farmaci.ts` → tabella `pa_farmaci`, per studio). **Nasce in bozza**: i numeri vengono dalla farmacologia generale, non sono stati letti sull'informazione professionale di ogni prodotto. Una riga **vale solo dopo che un medico l'ha confermata** (scheda «Tabella dei farmaci»: controlla i quattro numeri sul testo ufficiale, swissmedicinfo.ch, li corregge se serve, conferma). Finché non è confermata, il farmaco compare in terapia ma **senza finestra d'azione**, e non entra in nessun calcolo. Cambiare un numero toglie la conferma. È lo stesso patto del dizionario della trascrizione.

Il nome scritto in terapia si riconosce dalle radici del principio attivo e dai marchi noti; le combinazioni (un marchio, più principi) danno più finestre. Ciò che non si riconosce resta «non in tabella»: non si indovina. Lo spironolattone è in tabella ma senza finestra oraria (l'effetto si costruisce in giorni).

Nessuna banca dati esterna: né Compendium né altre. Niente licenze, e nessun aggiornamento che cambi i numeri da solo.

## Le proposte (quando saranno accese)

`proponi()`: per ogni farmaco preso **una volta al giorno** con la riga confermata, prova gli orari 06, 07, 08, 12, 18, 20, 22 e stima il profilo togliendo l'effetto del vecchio orario e mettendo quello del nuovo. L'effetto pieno vale 10/6 mmHg **per tutti i farmaci: è un'ipotesi di lavoro**, scritta in ogni proposta. Tiene lo spostamento col punteggio stimato più alto se guadagna almeno 5 punti. Mai: registrazione non affidabile, diuretico dopo le 14, un'ora in più sotto il valore basso, calo notturno oltre il 20%. Al massimo tre proposte, ognuna coi numeri da cui nasce. Il medico accetta, sceglie un altro orario o scarta; resta scritto che cosa e chi, con la versione delle regole (`pa-orari-1`). Cambiare terapia, giorno/notte o soglie cancella le proposte aperte. Niente modelli linguistici: stesso profilo, stessa proposta.

La conferma di una proposta non è il software: è **il monitoraggio dopo**, e il prima e dopo.

## Chi fa che cosa (`PUO_PA`, applicato dal server)

| | segreteria | aiuto medico | medico | amministrazione | tecnico |
|---|---|---|---|---|---|
| vedere | sì | sì | sì | sì | no |
| caricare un profilo, assegnare un file arrivato, creare la cartella da lì | sì | sì | sì | sì | no |
| terapia, giorno e notte, eliminare | no | sì | sì | no | no |
| soglie, conferma dei farmaci, proposte | no | no | sì | no | no |

`pa_registro` tiene chi ha fatto che cosa: azioni e conteggi, **mai** valori di pressione né nomi. Il file del profilo viaggia nel corpo della richiesta, mai nell'indirizzo.

## Quello che ancora non c'è

- **Il formato vero dell'apparecchio dello studio**: non si sa ancora quale sia né come esporti. Il lettore è generico; al primo file vero si vede se serve un adattatore.
- **La terapia presa dalla cartella**: oggi si scrive nella pagina (in cartella non c'è una terapia strutturata per tutti i medici).
- **Il commento per il referto** scritto dall'AI dai numeri già calcolati.
- **Tabella confermata, validazione, rilettura regolatoria, notifica a Swissmedic**: ancora aperte, a proposte già accese (8.10.2026).

## Le prove

`src/lib/prove-pressione.test.ts` — 15 casi (due sulla cartella: identità dal file, che cosa si legge e perché no): lettura del file, medie e qualità, fasce a cavallo della mezzanotte, finestra d'azione, fascia scoperta, punteggio (il piatto non vince), proposta coi suoi numeri e ripetibile, limiti (qualità, diuretici, più prese, avviso che non giudica), riconoscimento dei nomi, coerenza della tabella, interruttore. `scripts/e2e/prova-pressione.ts` — 34 casi sul database demo (dall'8.10 anche la cartella: profilo da solo dal nome del file o dalle prime righe, niente doppioni, «da assegnare», assegna e scarta coi permessi, «Non letti» col perché, stato della condivisione) con profili inventati: permessi ruolo per ruolo, doppioni, conferma dei farmaci, proposte e decisioni, prima e dopo, registro senza valori, eliminazione.
