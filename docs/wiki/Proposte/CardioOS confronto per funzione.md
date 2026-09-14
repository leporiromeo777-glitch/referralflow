---
tipo: proposta
aggiornata: 2026-09-14
---
# CardioOS: confronto funzione per funzione e come riportare ciò che vale

Ricognizione del 14.9.2026 sulla demo `cardioos.buenger-engineering.ch` (Bünger Engineering AG, sviluppatore Nicholas Bünger), fatta con la sessione dell'utente. Per ogni funzione: **come l'ha strutturata** (il modello dati letto dal browser: chiavi e tipi, mai valori), **come funziona**, **cosa ha ReferralFlow**, **verdetto** e, dove vale, **come si porta**. Nessun dato clinico: i pazienti della demo sono inventati e qui non compaiono.

## Come è fatto, in una riga
Un solo bundle Vite/React (857 KB) dietro HTTP Basic; **niente server applicativo**: tutte le entità sono in `localStorage` (`cardioos_patients`, `cardioos_prestazioni`, `cardioos_invoices`, `cardio_turni_v1`, …), il personale, i medici invianti e il magazzino sono semi dentro il bundle. L'unico servizio esterno è un **Cloudflare Worker personale** (`cardioos-claude-proxy.nicholas-buenger.workers.dev`) con tre vie: `/api/customizations` (colori, marchio, moduli nascosti), `/api/claude/health`, `/api/claude/chat`. Quindi Otto e la lettura della tessera passano da **Claude nel cloud**, con i dati del paziente in chiaro (una tessera è nome + AVS + numero assicurato): senza pseudonimizzazione e senza contratto di trattamento — l'esatto contrario della regola nLPD di ReferralFlow. Le impostazioni parlano di «Mistral on-prem via Cloudflare Tunnel», ma nel codice non c'è.

L'entità centrale è la **prestazione** (`cardioos_prestazioni`, 362 righe): `pazienteId, prestazioneId (pr_visita…), protocolloId (pdt_ischemica…), tipo (visita|esame|procedura), data, oraInizio, oraFine, durataMin, sala, operatori[], stato (programmata|in corso|completata|annullata), numeroSeduta, sedutaSu, note`. Calendario, agenda sale, cruscotto, scheda paziente, fatture e conteggi derivano tutti da lì. È la scelta giusta, e in ReferralFlow l'equivalente è `appointments` (dal robot MediOnline) — con la differenza che da noi l'agenda è in sola lettura e la fonte di verità resta la Cassa dei Medici.

## Le funzioni

### 1. Cruscotto
- **Sua struttura**: cinque tessere (prestazioni oggi, pazienti attesi, esami da refertare, fatture aperte, in servizio), programma del giorno con sala e stato, monitor «prestazioni per sala» (n · ore, prima alle), personale in servizio, quadri urgenti. Tutto calcolato dalle prestazioni del giorno.
- **ReferralFlow**: FATTO il 14.9.2026 con sei tessere (in più: visti senza referto, lettere in ritardo), sale con occupazione e posti, medici in agenda, urgenti, bozze della catena.
- **Verdetto**: pari o meglio. Niente da portare.

### 2. Calendario (agenda dei pazienti)
- **Sua struttura**: vista settimana/giorno, filtro Tutto/Esami/Visite, form «Aggiungi esame» (prestazione dal catalogo, paziente, data, ora, durata, sala), chip con ora e cognome, «Gruppo · 1/12» per la palestra.
- **ReferralFlow**: agenda del giorno per medico e per sala, dal robot MediOnline (sola lettura), colori originali, posti.
- **Verdetto**: manca la **vista settimana** e il **filtro per tipo**. Si portano (solo lettura: ~1 giorno, tutto nel ponte, i dati ±30 giorni ci sono già). L'inserimento di appuntamenti NO: decisione «agenda in sola lettura» ([[Decisioni/Registro]]).

### 3. Prestazioni (elenco)
- **Sua struttura**: tabella di tutte le prestazioni con data/ora, paziente + indicazione, prestazione + percorso, sala, durata, stato; filtri per stato; ricerca; «Nuova prestazione». Dietro c'è un **catalogo delle prestazioni** (`pr_visita`, `pr_ecg`, … con tipo, durata standard, sala tipica).
- **ReferralFlow**: gli appuntamenti sono in agenda e in «Da fatturare»; non c'è un catalogo delle prestazioni (solo il testo `studios.specialita`).
- **Verdetto**: da portare il **catalogo** (migrazione `prestazioni_catalogo`: nome, tipo visita/esame, durata standard, sala predefinita, attivo) e una pagina «Prestazioni» = appuntamenti con filtri (giorno, stato, sala, medico) e abbinamento del motivo dell'agenda a una voce del catalogo (regole per parole chiave, come i codici dell'agenda per le sale). Serve ai percorsi (le prestazioni dei percorsi diventano voci del catalogo), all'agenda per sala (durata standard quando l'agenda non la dice) e all'esportazione. ~1 giorno.

### 4. Agenda sale
- **Sua struttura**: settimana per sala, chip con le iniziali degli operatori colorate per persona, legenda del personale in fondo, «Evento» e «Personale» come viste, «Palestra: 12 posti in gruppo, le altre un paziente per volta».
- **ReferralFlow**: per sala nel giorno, posti, avviso di sovraffollamento (14.9.2026).
- **Verdetto**: da portare la **settimana** (con il punto 2) e i **colori per medico** (con il punto 10).

### 5. Pazienti (anagrafica e scheda)
- **Sua struttura** (`cardioos_patients`): `cognome, nome, dataNascita, sesso, avs, indirizzo, telefono, email, indicazione, percorsoId, medicoCurante, cassaMalati, note, fattoriRischio[], terapia[], creato`; una **seconda** anagrafica più vecchia (`cardio_pazienti_v1`) con `via, npa, localita, n_assicurato, gln, cassa, veka, inviante, tipo (in carico | singola prestazione), docs[], preop` convive con la prima: due modelli di paziente nello stesso prodotto. Elenco con ricerca (cognome, nome, AVS, e-mail), filtro per indicazione, «Importa CSV». Scheda: quattro tessere (indicazione, prestazioni eseguite, fatturato, cassa malati), «Anamnesi cardiologica» (medico curante, fattori di rischio, terapia in corso, note, in carico dal, FC massimale teorica), prossimi appuntamenti, ultimi esami con una riga di esito, fatture.
- **ReferralFlow**: `patients` = cognome, nome, data_nascita, telefono, assicurazione (+ controllo AI); cartella documenti, referral, referti, visite dall'agenda, richiami, grafo dei fatti (`pazienti_fatti`, migrazione 035), terapia strutturata dentro i referti confermati.
- **Verdetto**: qui lui è più completo sull'**anagrafica amministrativa** e noi sul **contenuto clinico**. Da portare: colonne `sesso, via, npa, localita, email, avs, cassa, n_assicurato` (servono anche al CSV di fatturazione: senza AVS e numero assicurato il gestionale non fattura), `indicazione` e `percorso_id` (id della pagina wiki), scheda con le quattro tessere e **«Terapia in corso» derivata dal blocco Terapia dell'ultimo referto confermato** (non ridigitata: è il nostro vantaggio) e **«Fattori»** dal grafo dei fatti; ultimi esami con l'esito dai documenti classificati; **Importa CSV** (cognome;nome;nascita;telefono;… con anteprima e doppioni segnalati). ~2 giorni. La FC massimale teorica (220 − età) è una riga di codice, si fa.

### 6. Cartelle e sedute
- **Sua struttura**: in testa due liste — «Da chiamare per la preparazione» (procedure nei prossimi giorni con «questionario mancante») e «Referti e lettere da completare» (esame fatto da N giorni, manca lettera); poi le schede paziente con inviante, tipo (in carico / singola prestazione), stato del questionario, documenti per tipo (questionario, ECG, eco, referto, immagini, lettera al medico inviante, altro), «Foto tessera», valutazione pre-procedurale; a destra le **sedute** per sala con «più pazienti dei posti». Registro delle chiamate di preparazione (`cardio_chiamate_prep_v1`: paziente, seduta, chi, esito, quando).
- **ReferralFlow**: preparazioni alla visita con SMS, questionario pre-visita sulla referral, documenti per categoria con consenso, lettere in ritardo (procedura + tessera in Home), sale con posti dall'agenda.
- **Verdetto**: da portare il **registro delle chiamate di preparazione** (tabella `preparazione_chiamate`: appuntamento o referral, chi, esito raggiunto/segreteria telefonica/da richiamare, quando, nota breve) e la lista **«Da chiamare»** in Home: appuntamenti dei prossimi 7 giorni con una preparazione o un questionario mancante e nessuna chiamata registrata. ~½ giornata. Le «sedute» come oggetto NO (decisione 14.9.2026: la vista per sala nasce dall'agenda).

### 7. Percorsi diagnostico-terapeutici
- **Sua struttura** (`cardioos_percorsi`, 12): `nome, indicazione, prestazioni[] (id del catalogo), sala, durata_min, sessioni_target, frequenza, note`; pagina con fonti ESC/SSC. Il percorso è **collegato al paziente** (`percorsoId`) e a ogni prestazione (`protocolloId`).
- **ReferralFlow**: FATTO il 14.9.2026 dalla pagina wiki (12 percorsi, stato proposta/validato, condizioni per prestazione, fonti, bot).
- **Verdetto**: pari sul contenuto; manca il **collegamento paziente ↔ percorso** (punto 5) e, per la riabilitazione, il conteggio «seduta 15/24» (`sessioni_target`): si aggiunge al formato della pagina wiki una riga `Sedute previste` e alla scheda paziente il conteggio delle prestazioni del percorso già fatte. Piccolo.

### 8. Medici invianti
- **Sua struttura**: 28 invianti (seme nel bundle) con specialità, indirizzo, telefono, medici, **invii negli ultimi 12 mesi**, ordinati per invii; «Nuovo inviante»; 1999 pazienti inviati in 12 mesi.
- **ReferralFlow**: `referring_doctors` con scheda `/medici/[id]` e annuario nella piattaforma classica; l'interfaccia nuova non ha la pagina.
- **Verdetto**: da portare nell'interfaccia nuova: pagina «Medici invianti» con conteggio delle referral a 12 mesi per inviante (una query), ricerca, scheda con le referral e i referti inviati. ~½ giornata.

### 9. Moduli
- **Sua struttura**: tre moduli (M 001 valutazione pre-procedurale + protocollo, M 003 richiesta di esame · stato di salute, M 004 materiale e farmaci); «Nuova compilazione»; le compilazioni (`cardio_moduli_v1`) sono vuote nella demo; il M 004 alimenta la tracciabilità del magazzino.
- **ReferralFlow**: FATTO il 14.9.2026, con più sostanza: moduli definiti nella wiki, validazione, stampa, registro degli accessi, nel dossier del paziente.
- **Verdetto**: meglio. Resta il modulo compilato dal paziente dal link dell'appuntamento ([[Piattaforma/Prossimi lavori]]).

### 10. Personale
- **Sua struttura**: 37 persone (seme) con ruolo, «Assunto / A ore», percentuale di contratto, data di assunzione, colore, data di nascita, GLN, RCC, «digits» per la fattura TARDOC, login; per i medici un badge «Fattura TARDOC: nasce GLN, RCC».
- **ReferralFlow**: `users` (accessi con ruolo e 2FA) e `providers` (medici dell'agenda con alias). Nessun colore, nessun GLN/RCC.
- **Verdetto**: da portare in piccolo: su `providers` le colonne `gln, rcc, colore` (GLN e RCC servono al CSV di fatturazione per «medico erogante»; il colore serve all'agenda) e una scheda Personale che mostri anche chi non ha login (tabella `studio_personale`: nome, ruolo, percentuale, colore, attivo). ~½ giornata. Niente contratti, niente stipendi.

### 11. Turni, disponibilità e ferie, presenze, conteggio ore, rimborsi spese
- **Sua struttura**: pianificazione delle sale a settimana (`cardio_turni_v1`: giorno, sala, attività, équipe, medico, infermiere, dalle, alle); calendario mensile per persona con stati al lavoro / vacanza / formazione / congedo / altro e contatore ferie (30 gg), «Invia alla direzione»; timbratura entrata/uscita per sede; conteggio ore del personale a ore con PDF e «Invia alla fiduciaria»; scontrini con foto, posteggio, tragitti a 0.70 CHF/km. Quasi nulla persiste (presenze e ore non hanno una chiave in `localStorage`).
- **ReferralFlow**: nulla.
- **Verdetto**: **non portare**. È gestione del personale, esistono prodotti fatti apposta, e in uno studio con due medici e una segreteria non è il dolore quotidiano. L'unico dato utile all'operatività — le assenze dei medici — è già nell'agenda MediOnline («in vacanza» compare come appuntamento: da qui il filtro dei titoli che non sono nomi, 14.9.2026).

### 12. Magazzino
- **Sua struttura**: magazzino centrale + sottomagazzini per sala, categorie materiale/farmaci, scorta minima con avviso, carico/scarico/trasferimento, scansione a codice a barre, «tracciabilità per paziente» tramite il modulo M 004; movimenti (`cardiologica_movimenti_v1`, vuoti nella demo). È un magazzino da centro interventistico (cateteri, stent, introduttori).
- **ReferralFlow**: apparecchi in `studio_risorse`.
- **Verdetto**: **non portare** ora. Se un giorno servisse per i consumabili (elettrodi, batterie Holter): due tabelle (`magazzino_articoli`, `magazzino_movimenti`) e una pagina; un giorno di lavoro, ma non è il nostro mestiere.

### 13. Otto (assistente clinico)
- **Sua struttura**: chat con quattro esempi (terapia dello scompenso con dosi, STEMI in arrivo, anticoagulazione nella FA, «genera il modello di referto ecocardiografico»); disclaimer «non sostituisce il giudizio clinico». Va a Claude via il worker; nella demo l'endpoint non è configurato.
- **ReferralFlow**: assistente sul modello locale, procedure con traccia, «Da dove viene», per regola **niente consigli clinici e niente diagnosi**; la catena dei referti fa il lavoro vero (dettato → lettera), che lui non ha.
- **Verdetto**: **non copiare** il chatbot clinico: è la cosa che ci esporrebbe di più (responsabilità e nLPD) per il beneficio minore. Il «modello di referto» da noi è il formato del medico nel profilo della catena.

### 14. Personalizza
- **Sua struttura**: chat che promette modifiche («colore, campi, spostare elementi») ma «le richieste vengono trascritte e implementate dal team»; sotto, un vero meccanismo di **personalizzazione per centro** servito dal worker: `primary_color, accent_color, brand_name, brand_address, brand_phone, hidden_modules[]`.
- **ReferralFlow**: tema a token (14.9.2026), nessun modulo nascondibile, nessun canale di richieste dentro l'app.
- **Verdetto**: da portare le due cose vere: **moduli nascosti per studio** (`studios.moduli_nascosti text[]`, letto dal ponte per la barra) e un tasto **«Suggerisci una modifica»** (tabella `suggerimenti`: pagina, testo, chi, quando; avviso e-mail allo sviluppatore senza dati clinici; elenco nella pagina Studio con stato aperto/fatto). Dà sostanza alla promessa «entro 24 ore» con una traccia. ~½ giornata.

### 15. Emissione fatture e Incassi
- **Sua struttura**: cinque regimi (TARDOC cassa malati, visita cardiologica, forfait al medico inviante, convenzione 17 %, campo libero); fattura (`cardioos_invoices`): `pazienteId, data, tariffario, valorePunto, vptProvvisionale, daVerificare, posizioni[{codice, descrizione, punti, quantita, importo}], totale, stato (bozza|inviata|pagata|scaduta|contestata), destinatario, diagnosi`; pagina Incassi con quattro tessere (pagate, aperte, contestate, bozze da inviare), elenco, «Esportazione MediData / SASIS VeKa: in produzione»; nel codice le posizioni TARDOC sono segnaposto «da sostituire con quelle vere prima del primo invio a un assicuratore».
- **ReferralFlow**: «Da fatturare» con CSV (14.9.2026); decisione: esportare, non fatturare.
- **Verdetto**: resta la decisione. Da prendere da lui solo il **destinatario per regime** come colonna del CSV (cassa malati / paziente / medico inviante / struttura) se il gestionale dello studio lo vuole: dipende dal tracciato del gestionale ([[Piattaforma/Prossimi lavori]]).

### 16. Impostazioni
- **Sua struttura** (`cardioos_settings`): `centroNome, centroIndirizzo, centroTelefono, direttore, aiEndpoint, tariffario, valorePunto, autoSync`; «Reset dati demo».
- **ReferralFlow**: pagina Studio (dati, personale, medici agenda, sale, apparecchi), `npm run dati-prova`.
- **Verdetto**: pari. Da aggiungere l'**indirizzo dello studio** ai dati (oggi nome, telefono, e-mail): serve alla carta intestata e al CSV. Piccolo.

### 17. Paziente dalla foto della tessera
- **Come funziona**: `<input type="file" accept="image/*" capture="environment">`, la foto viene ridotta a JPEG (qualità 0.7, poi 0.5 se pesa troppo) e mandata a Claude tramite il worker per leggere nome, nascita, AVS, cassa, numero assicurato.
- **ReferralFlow**: la stessa idea esiste per l'**impegnativa** (`src/lib/impegnativa.ts`, Claude con schema JSON), spenta finché manca la chiave e la validazione legale.
- **Verdetto**: quando la parte legale sarà chiusa, la lettura della tessera si aggiunge con lo stesso codice dell'impegnativa (uno schema in più). Fino ad allora no: una tessera non si pseudonimizza.

### 18. Fattura automatica dalla valutazione pre-procedurale
- **Come funziona**: prestazione completata → bozza di fattura con le posizioni del catalogo.
- **Verdetto**: non serve; da noi la prestazione completata finisce nel CSV.

## Piano di lavoro proposto (solo ciò che vale), in ordine
1. **Anagrafica paziente completa e scheda** (punto 5, 2 gg) — anche perché senza AVS e numero assicurato il CSV di fatturazione è monco.
2. **Catalogo prestazioni + pagina Prestazioni** (punto 3, 1 g) — aggancia percorsi, sale ed esportazione.
3. **Medici invianti nell'interfaccia nuova** (punto 8, ½ g).
4. **Chiamate di preparazione e «Da chiamare»** (punto 6, ½ g).
5. **Personale con GLN/RCC/colore e colori in agenda** (punto 10, ½ g).
6. **Calendario a settimana con filtri, anche per sala** (punti 2 e 4, 1 g).
7. **Moduli nascosti per studio e «Suggerisci una modifica»** (punto 14, ½ g).
8. **Importa CSV pazienti e indirizzo dello studio** (punti 5 e 16, ½ g).

Totale ≈ 6-7 giorni. **Non si portano**: turni/ferie/presenze/ore/rimborsi, magazzino, Otto clinico, fatturazione TARDOC, lettura della tessera prima dell'ok legale.

## Ciò che lui non ha e non può fare in 24 ore
Server e database; accessi per persona, ruoli, 2FA, registro degli accessi; dati che restano in Svizzera con testo pseudonimizzato verso il cloud; la catena dettato → lettera nel formato del medico con la misura degli errori; referral tra studi, affidi esterni, eConsult, richiami, questionario del paziente, anonimizzazione locale; procedure con traccia. Tre referti veri già passati.
