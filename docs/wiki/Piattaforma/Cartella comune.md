# Cartella comune

Le lettere della **cartella comune dello studio** (server Windows `192.168.0.107`, condivisione `comune`, sul Mac
`/Volumes/comune`) vanno da sole nei documenti del paziente (22.10.2026, dallo studio: «sincronizzare la cartella comune
con ReferralFlow, le lettere vanno nei pazienti, con un controllo giornaliero di cosa è stato aggiunto»). Pagina
**Cartella comune** nel menu Clinico (sezione `comune` in `src/lib/permessi.ts`, chi cura). Codice in `src/lib/comune/`
(`regole.ts` puro, `scopri.ts`, `testo.ts`, `archivio.ts`), rotta `GET/POST /api/prototipo/comune`, pagina
`public/prototipo/bridge/22-comune.js`, migrazione 098.

## Che cosa si legge
- **Radice**: `CentroCardio/Pazienti` (variabile `COMUNE_LETTERE`). **Solo la cartella «Rapporti_Moccetti»** (22.10.2026, dallo studio: «fai il tutto solo dei rapporti di Marco Moccetti»; non «Rapporti_PROF_MOCCETTI»): variabile `COMUNE_MEDICI`, nomi separati da virgola, vuota = tutte. Sotto, una cartella per medico («Rapporti_Moccetti»,
  «Rapporti_Paiocchi», «Esami_II livello»…). Le cartelle «Rapporti_…» danno documenti **lettera**, «Convocazioni_lettere» **altro** (il dittafono non le riprende), le altre («Esami_II livello», «Device (PM + DEFI)») **referto**.
- **Cartelle dei pazienti a qualunque livello** (`cartellaDiPaziente`): lo è una cartella che porta il nome di un paziente
  conosciuto, o una data («Cognome Nome (12.03.1950)», «Cognome 12.03.1950»), o una cartella senza sottocartelle con
  almeno cognome e nome. Le altre («Esami 2015», un anno, un giorno) sono contenitori: si guarda dentro.
- **Lettere**: `.docx`, `.doc`, `.pdf`, anche in sottocartelle della cartella del paziente. Fuori i file di blocco di
  Word (`~$…`), i modelli (`.dot`, `.dotm`), tutto il resto. Il Word vecchio (`.doc`) diventa `.docx` con `textutil` di
  macOS (dittafono e aggiornamento della lettera leggono solo quello).
- **Archivi**: una cartella con più di 250 lettere che non porta il nome di un paziente conosciuto non è di un paziente
  (lettere nominate con un codice, dal 2002): resta fuori, elencata in fondo alla pagina.
- **Lettere sciolte** in un contenitore (cartelle per giorno o per anno): per ora non si caricano, la pagina dice quante.

## Di chi è una cartella
Regola severa di sempre: **nome della cartella E data di nascita, una persona sola** (`abbinaCartella`). La data viene
dal nome della cartella o dal **testo delle lettere** (le lettere dello studio la scrivono accanto al nome); le date del
nome della cartella valgono come quelle del testo, perché a volte sono il giorno dell'esame. Solo cognome e data intera
nel nome («Rossi 12.03.1950») bastano; solo il cognome no. Le date lette restano nella cartella (`date_lette`): quando
nasce un paziente (a mano, da un'importazione) la cartella si riabbina al giro dopo senza rileggere i file.
Se no la cartella **aspetta** («da assegnare») col perché: nessun paziente con quel nome, la data non si trova, un'altra
data, omonimi. Dalla pagina: scegli il paziente (proposti quelli col cognome nel nome della cartella), **crealo** (con la
data di nascita trovata accanto a «nato/a» o al nome, da controllare), o **non caricare**. Assegnata, le sue lettere
entrano subito, e quelle che arriveranno ci vanno da sole.

## Come entrano
- Documento del paziente con il **nome del file originale**, la nota «dalla cartella comune (Rapporti Moccetti)», e come
  data quella della lettera: dal nome del file («24 05 12 …» = 12.5.2024), se no l'ora di modifica del file. Così
  l'elenco dei documenti e le «lettere del paziente» del dittafono stanno in ordine di data.
- **Doppioni**: lo stesso file (impronta) nella stessa cartella una volta sola; il **PDF della stessa lettera** di un Word
  (stesso nome, o quasi tutte le parole uguali) si salta. Un PDF scansionato va all'OCR come ogni documento.
- **Lettera cambiata** sulla cartella comune (stesso percorso, altra dimensione o ora): si sostituisce il file dello stesso
  documento (registro: «modifica»), niente doppione.
- La cartella comune si **legge e basta**: niente si sposta, rinomina o cancella. Un file salvato nell'ultimo minuto si
  lascia al giro dopo.

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
