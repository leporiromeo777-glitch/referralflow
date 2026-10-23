# Cartella comune

Le lettere della **cartella comune dello studio** (server Windows `192.168.0.107`, condivisione `comune`, sul Mac
`/Volumes/comune`) vanno da sole nei documenti del paziente (22.10.2026, dallo studio: «sincronizzare la cartella comune
con ReferralFlow, le lettere vanno nei pazienti, con un controllo giornaliero di cosa è stato aggiunto»). Pagina
**Cartella comune** nel menu Clinico (sezione `comune` in `src/lib/permessi.ts`, chi cura). Codice in `src/lib/comune/`
(`regole.ts` puro, `scopri.ts`, `testo.ts`, `archivio.ts`), rotta `GET/POST /api/prototipo/comune`, pagina
`public/prototipo/bridge/22-comune.js`, migrazione 098.

## Che cosa si legge
- **Radice**: `CentroCardio/Pazienti` (variabile `COMUNE_LETTERE`). **Tutte le cartelle «Rapporti_…»** (anche «Rappporti …»): il 22.10.2026 solo «Rapporti_Moccetti», dal 23.10.2026 tutte (dallo studio: «sincronizza anche i rapporti degli altri medici, una cartella sola del paziente dove convergono i rapporti di tutti») — le lettere dei vari medici finiscono nella stessa scheda, in «01_Rapporti», ognuna con la nota del suo medico. `COMUNE_MEDICI` (nomi separati da virgola) sceglie a mano, vuota = tutte le cartelle. Le cartelle del Prof. Moccetti si chiamano «Cognome_Nome_12nov2023_ECO_12_03_1950»: il nome sono le parole prima del primo pezzo con delle cifre, la data coi trattini bassi vale come coi punti, le date coi trattini bassi **non sono la nascita** (23.10.2026: in 71 cartelle su 95 erano decenni lontane dalla nascita del paziente col nome identico: è il giorno dell'esame) — servono solo a riconoscere, mai a dire «un'altra nascita» né a creare un paziente; la nascita della cartella è l'ultima data scritta coi punti, le barre o i trattini; per creare un paziente dev'essere di almeno dieci anni fa. Sotto, una cartella per medico («Rapporti_Moccetti»,
  «Rapporti_Paiocchi», «Esami_II livello»…). Le cartelle «Rapporti_…» danno documenti **lettera**, «Convocazioni_lettere» **altro** (il dittafono non le riprende), le altre («Esami_II livello», «Device (PM + DEFI)») **referto**.
- **Cartelle dei pazienti a qualunque livello** (`cartellaDiPaziente`): lo è una cartella che porta il nome di un paziente
  conosciuto, o una data («Cognome Nome (12.03.1950)», «Cognome 12.03.1950»), o una cartella senza sottocartelle con
  almeno cognome e nome. Le altre («Esami 2015», un anno, un giorno) sono contenitori: si guarda dentro.
- **Lettere**: `.docx`, `.doc`, `.pdf`, anche in sottocartelle della cartella del paziente. Fuori i file di blocco di
  Word (`~$…`), i modelli (`.dot`, `.dotm`), tutto il resto. Il Word vecchio (`.doc`) diventa `.docx` con `textutil` di
  macOS (dittafono e aggiornamento della lettera leggono solo quello).
- **Archivi**: una cartella con più di 250 lettere che non porta il nome di un paziente conosciuto non è di un paziente
  (lettere nominate con un codice, dal 2002): resta fuori, elencata in fondo alla pagina.
- **Lettere sciolte** (23.10.2026, dallo studio: «nella cartella Rapporti Moccetti c'era un file non in una cartella di paziente, e nei documenti non c'è»): un file direttamente nella cartella del medico o in un contenitore (per giorno, per anno) è un'**unità a sé**, col nome dal nome del file (`nomeDaFileSciolto`: «24 05 12 Rossi Mario ecocardio.docx» → «Rossi Mario ecocardio»). Si riconosce con nome e data di nascita nel testo, o col nome quasi uguale (le parole in più) e la stessa nascita; **mai un paziente creato** da un nome di file. Un file nominato con un codice («L1234.doc») resta fuori. In Rapporti_Moccetti il 23.10.2026: 2629 sciolte, 639 col codice, 1354 riconosciute, 353 col nome quasi uguale, 283 da assegnare.

## Di chi è una cartella
**Nome e cognome identici bastano** (23.10.2026, decisione dello studio: «quelli che carico a mano hanno nome e cognome identici alle cartelle di ReferralFlow, solo invertiti; se c'è solo un nome non caricarlo»): se le parole del nome — in qualunque ordine, almeno due — sono identiche a quelle di **una persona sola** (o della stessa persona scritta due volte con la stessa nascita), la cartella è sua anche senza la data di nascita; non se il nome della cartella porta un'altra data, mai col solo cognome. Le cartelle che aspettavano si ricontrollano a ogni giro. **Un nome solo** (solo il cognome o solo il nome: «103479_Alessi.pdf») che non si abbina viene **scartato** (motivo `un_nome_solo`), non resta da assegnare (23.10.2026, dallo studio: «quelli con un solo nome o un solo cognome li voglio scartati»); i file restano sulla cartella comune, e le righe nel database: se un giorno arrivano i numeri di MediOnline si possono riaprire.

Prima di questa decisione valeva la regola severa: **nome della cartella E data di nascita, una persona sola** (`abbinaCartella`), che resta per il resto. La data viene
dal nome della cartella o dal **testo delle lettere** (le lettere dello studio la scrivono accanto al nome); le date del
nome della cartella valgono come quelle del testo, perché a volte sono il giorno dell'esame. Solo cognome e data intera
nel nome («Rossi 12.03.1950») bastano; solo il cognome no. Le date lette restano nella cartella (`date_lette`): quando
nasce un paziente (a mano, da un'importazione) la cartella si riabbina al giro dopo senza rileggere i file.
**Il nome che in ReferralFlow non c'è** (22.10.2026, dallo studio: «quelli che non ci sono su ReferralFlow creali»):
- se UN paziente ha il **nome quasi uguale** (un secondo nome in più o in meno) e la sua data di nascita è nelle lettere,
  è la stessa persona: la cartella va nella sua scheda (`quasiStesso`), niente doppione;
- se no il **paziente si crea** da solo, con cognome e nome dal nome della cartella (`dividiNome`: la prima parola è il
  cognome, con le particelle «De», «Dal», «Van der»…) e la data di nascita **sicura** (`nascitaSicura`): nel nome della
  cartella, accanto a «nato/a il», «geb.», «data di nascita», o da sola subito dopo il nome sulla stessa riga
  («Paziente: Rossi Mario – 12.03.1950»), e almeno un anno prima della lettera. Una data qualunque vicino al nome
  («Rossi Mario, coronarografia del …») non basta. `COMUNE_CREA_PAZIENTI=0` lo spegne.
- La pagina conta i pazienti creati e le cartelle col nome quasi uguale.

**La stessa persona due volte nell'anagrafica** (23.10.2026, dallo studio: «ogni tanto nome e cognome vengono invertiti»): nell'anagrafica importata da MediOnline alcune persone ci sono due volte, una con cognome e nome scambiati, con la stessa data di nascita (il 23.10.2026: 6 coppie così). Non sono omonimi (`unaPersona`): si usa la scheda più viva (numero di MediOnline, documenti, appuntamenti). I doppioni restano da unire a mano.

Se no la cartella **aspetta** («da assegnare») col perché: nessun paziente con quel nome, la data non si trova, un'altra
data, omonimi. Dalla pagina: scegli il paziente (proposti quelli col cognome nel nome della cartella), **crealo** (con la
data di nascita trovata accanto a «nato/a» o al nome, da controllare), o **non caricare**. Assegnata, le sue lettere
entrano subito, e quelle che arriveranno ci vanno da sole.

## Come entrano
- Documento del paziente nella sottocartella **«01_Rapporti»** (le lettere; le scansioni intere in «Cartella cartacea scansionata») e, nella scheda, col **nome del file** (23.10.2026, dallo studio: «non vedo i file nei documenti» — stavano tutti in «Altri documenti» e si chiamavano tutti «dalla cartella comune (…)»: la nota ora è di servizio, `NOTA_DI_SERVIZIO`). Il documento ha il **nome del file originale**, la nota «dalla cartella comune (Rapporti Moccetti)», e come
  data quella della lettera: dal nome del file («24 05 12 …» = 12.5.2024), se no l'ora di modifica del file. Così
  l'elenco dei documenti e le «lettere del paziente» del dittafono stanno in ordine di data.
- **Doppioni**: lo stesso file (impronta) nella stessa cartella una volta sola; il **PDF della stessa lettera** di un Word
  (stesso nome, o quasi tutte le parole uguali) si salta. Un PDF scansionato va all'OCR come ogni documento.
- **Lettera cambiata** sulla cartella comune (stesso percorso, altra dimensione o ora): si sostituisce il file dello stesso
  documento (registro: «modifica»), niente doppione.
- La cartella comune si **legge e basta**: niente si sposta, rinomina o cancella. Un file salvato nell'ultimo minuto si
  lascia al giro dopo.

## Le cartelle cartacee scansionate (DocuWare)
Dal 22.10.2026 (dallo studio: le cartelle vecchie dei pazienti A–F scansionate fino al 2024 — «metti anche quelle»):
`/Volumes/comune/Lavori archivio DocuWare` (variabile `COMUNE_SCANSIONI`), 1541 PDF in qualche sottocartella, uno per
paziente, «123456_Cognome_Nome.pdf» (a volte solo il cognome). **Il numero è il N° del paziente di MediOnline**: lo stesso
che l'agenda scrive nei titoli («… / N° 123456)»). Ogni PDF è un'unità come una cartella:
- **di chi è** (`abbinaScansione`): prima il **numero E il nome** — il numero è di un paziente solo e le parole del nome
  del file stanno nel suo nome; poi la regola delle cartelle (nome e data di nascita nel testo; col solo cognome, cognome e
  data di nascita intera). Il testo è lo strato del PDF o, se manca, le **prime tre pagine lette da Tesseract**. Pazienti
  nuovi e nome quasi uguale come sopra (col solo cognome non si crea nessuno);
- **il numero** sta in `patients.numero` (migrazione 099): lo scrive `riabbinaPazienti` dai titoli degli appuntamenti del
  paziente (tutti lo stesso numero, non già di un altro; il 22.10.2026 970 pazienti) e l'**importazione dei pazienti**
  se l'esportazione ha una colonna «N° paziente» / «N°» / «Nr.» / «ID» (anche per chi c'era già; mai sopra un numero
  scritto). Non fa parte dell'anagrafica che si modifica;
- **entra** fra i documenti del paziente come «Documento», nota «cartella cartacea scansionata (DocuWare)», con l'ora
  del caricamento (la coda dell'OCR va in quell'ordine); l'OCR completo lo fa poi la coda dei documenti, a catena ferma.
  Il dittafono trova le lettere dentro per data; «Dividi cartella» la separa quando serve (non parte da sola);
- **quando**: si **leggono** al massimo 6 per giro e solo se la coda dell'OCR ha meno di 3 documenti; dal controllo automatico solo la
  sera (dalle 20), la notte (fino alle 6) e nel fine settimana; «Controlla adesso» anche di giorno. **Decidere** di chi è una scansione già letta (riabbinare, scartare un nome solo) si fa a ogni giro, anche di giorno.
- Campione di 41 file (22.10.2026, solo conteggi): 24 col testo, 17 senza; col numero dall'agenda 9 riconosciuti da soli,
  1 col nome quasi uguale, 23 col nome ma senza la data nelle prime pagine (li sblocca il numero, se l'esportazione di
  MediOnline lo porta), 8 sconosciuti.

## Quando
Un controllo **ogni notte alle 2** (`tocca`), e **a lotti di 150 lettere ogni due minuti** finché resta lavoro: la prima
volta sono migliaia. «Controlla adesso» fa un lotto subito. Acceso solo sul server vero (`next start`); i server di prova
(`next dev`) non toccano mai la cartella vera: senza `COMUNE_LETTERE` per loro la cartella «non c'è». `COMUNE_LETTERE_GIRO=spento`
lo spegne, `=acceso` lo accende fuori produzione. Se il Mac non vede la cartella comune la pagina dice «Non collegata»
(aprirla dal Finder: Vai → Connessione al server); il registro lo dice una volta all'ora. Nei log solo conteggi.

## La simulazione del 22.10.2026
`scripts/comune-simula.ts` (solo conteggi) sulla cartella vera, con i 5933 pazienti importati da MediOnline:
3867 cartelle (14 680 lettere) riconosciute da sole; 2609 cartelle (9097 lettere) con un nome che in ReferralFlow non
c'è; 137 senza la data nelle lettere, 21 con un'altra data, 5 omonimi; 44 archivi (47 155 file) fuori; 6093 lettere
sciolte fuori da una cartella di paziente.
