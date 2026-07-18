# BOZZA — Accordo per un trattamento di dati su incarico

> **⚠️ BOZZA PER REVISIONE LEGALE — NON FIRMARE NÉ USARE PRIMA DELLA VALIDAZIONE DI UN AVVOCATO.**
> Basata sul modello ufficiale FMH «Accordo per un trattamento di dati su incarico», versione 03/2023
> (file: `FMH-accordo-trattamento-dati-su-incarico.docx` in questa cartella), precompilata con i dati
> concreti della piattaforma ReferralFlow. Le parti tra ⟦doppie parentesi⟧ sono da completare o da
> decidere; le **Note per il legale** in fondo elencano i punti aperti.

---

**tra**

Nome dello studio medico: ⟦nome dello studio cliente⟧
Indirizzo: ⟦indirizzo⟧
NPA località: ⟦NPA e località⟧
(di seguito detto «cliente»)

**e**

⟦Ragione sociale del fornitore — ditta individuale/Sagl di Romeo Lepori, DA COSTITUIRE⟧
⟦Indirizzo della sede⟧
⟦NPA e località⟧
(di seguito detto «fornitore»)

concernente l'esecuzione di un incarico da parte del fornitore.

---

## 1. Oggetto e ambito di applicazione

Il presente accordo definisce gli obblighi delle parti in materia di protezione dei dati derivanti
dall'utilizzo della piattaforma **ReferralFlow** (https://referralflow.ch) secondo il contratto del
⟦data⟧ concernente ⟦condizioni d'uso / abbonamento ReferralFlow⟧ (di seguito «contratto principale»).

Tutti gli obblighi del presente accordo si applicano a tutte le attività in relazione al contratto
principale nell'ambito delle quali il fornitore, i suoi collaboratori ed eventuali terzi da esso
incaricati entrino o possano entrare in contatto con dati personali del cliente. In caso di
contraddizione con il contratto principale, prevale il presente accordo.

Il fornitore tratta i dati personali per conto del cliente secondo la descrizione delle prestazioni
del contratto principale. Il trattamento riguarda in particolare:

**Trattamenti di dati effettuati:**
- gestione delle richieste di visita (referral) in entrata e in uscita, con stato e cronologia;
- conservazione della cartella documenti del paziente (referti, ECG, immagini, lettere, consensi);
- trasmissione di referral e documenti ad altri studi, su istruzione del cliente e con consenso
  del paziente documentato;
- promemoria e comunicazioni ai pazienti (SMS/email con testo neutro, senza dati clinici);
- sincronizzazione del programma del giorno da feed di agenda forniti dal cliente;
- statistiche aggregate d'uso per il cliente stesso.

**Categorie di dati interessate:** dati anagrafici dei pazienti (cognome, nome, data di nascita,
telefono, assicurazione); dati anagrafici e di contatto dei medici invianti; dati degli utenti dello
studio (email, ruolo); dati di pianificazione (appuntamenti); cronologia dei trattamenti della
piattaforma.

**Dati personali degni di particolare protezione:** dati sanitari dei pazienti (quesiti clinici,
referti, documentazione medica, immagini diagnostiche, documenti caricati nella cartella).

**Categorie di persone interessate:** pazienti del cliente; medici invianti; collaboratori del cliente.

## 2. Responsabilità e garanzia

*(invariato rispetto al modello FMH 03/2023, § 2)*

Il cliente resta titolare del trattamento e responsabile verso i terzi della legittimità del
trattamento e degli obblighi di informazione. Cliente e fornitore garantiscono di avere imposto ai
propri collaboratori e ai terzi incaricati l'obbligo di riservatezza, valido anche dopo la
cessazione dell'attività.

## 3. Potere di impartire istruzioni del cliente

*(invariato rispetto al modello FMH 03/2023, § 3)*

Il fornitore tratta i dati personali solo nell'ambito di quanto concordato e secondo le istruzioni
del cliente, mai per scopi propri.

## 4. Luogo del trattamento dei dati

Il fornitore tratta i dati personali **esclusivamente in Svizzera**:

- applicazione e banca dati: infrastruttura Exoscale (Akenes SA), zona **CH-DK-2 (Zurigo)**;
- documenti e allegati: object storage Exoscale SOS, zona **CH-DK-2 (Zurigo)**;
- copie di sicurezza: sul medesimo server e, cifrate in transito, su object storage Exoscale SOS
  (Zurigo).

Qualsiasi spostamento del luogo di trattamento è comunicato per iscritto al cliente; qualsiasi
trattamento al di fuori della Svizzera necessita del previo consenso scritto del cliente
*(più restrittivo del modello FMH, che ammette UE/SEE — vedi Note per il legale, punto 3)*.

## 5. Obblighi del fornitore

*(struttura del modello FMH 03/2023, § 5, con le concretizzazioni della piattaforma)*

- **Trattamento dei dati:** solo secondo le istruzioni del cliente; eventuali richieste delle
  autorità di consegna dei dati sono comunicate senza indugio al cliente.
- **Misure di sicurezza:** come da **Allegato 1** (precompilato con le misure effettive della
  piattaforma).
- **Registro dei trattamenti e regolamento:** il fornitore tiene un registro delle attività di
  trattamento e, trattando in modo automatizzato grandi quantità di dati degni di particolare
  protezione, redige un regolamento del trattamento (art. 5 OPDa) ⟦DA REDIGERE — vedi Note, punto 4⟧.
- **Obblighi di supporto:** il fornitore supporta il cliente negli obblighi di legge (sicurezza,
  notifiche di violazioni, diritti degli interessati).
- **Diritti della persona interessata:** le richieste di accesso/correzione/cancellazione pervenute
  al fornitore sono inoltrate senza indugio al cliente; la piattaforma consente al cliente di
  consultare, correggere ed esportare i dati dei propri pazienti.
- **Obbligo di cancellazione e consegna:** al termine del contratto il fornitore consegna al cliente
  tutti i dati (esportazione in formato comune: CSV per i dati strutturati, file originali per i
  documenti) oppure li distrugge in modo irreversibile secondo le istruzioni del cliente, fatti
  salvi gli obblighi legali di conservazione. ⟦Termine di consegna: 30 giorni — da confermare⟧
- **Verbalizzazione:** la piattaforma verbalizza caricamento, lettura, invio e cancellazione dei
  documenti della cartella del paziente (identità dell'utente, tipo, data e ora dell'operazione,
  studio destinatario in caso di invio); i verbali sono conservati **almeno 1 anno**, separati dai
  documenti stessi, e accessibili solo agli organi di controllo (art. 4 OPDa).
- **Insolvenza:** il fornitore informa senza indugio il cliente in caso di rischio di pignoramento,
  sequestro o insolvenza, precisando alle autorità che la titolarità dei dati spetta al cliente.
- **Obbligo di controllo:** il fornitore monitora l'adempimento dei propri obblighi e lo dimostra su
  richiesta.

## 6. Rispetto del segreto professionale

*(invariato rispetto al modello FMH 03/2023, § 6)*

Il fornitore può entrare in contatto con dati soggetti al segreto professionale ai sensi
dell'art. 321 CP. Si impegna a mantenere la riservatezza, ad acquisirne conoscenza solo nella misura
necessaria, ad avvalersi se necessario della facoltà di non deporre (art. 171 CPP) e del divieto di
sequestro (art. 264 CPP), e a vincolare per iscritto collaboratori e subfornitori.

## 7. Rapporti di subfornitura

Il fornitore si avvale dei seguenti subfornitori:

| Nome / indirizzo | Compiti | Luogo del trattamento |
|---|---|---|
| **Exoscale — Akenes SA**, Losanna (CH) | hosting dell'applicazione, della banca dati e dell'object storage (documenti, backup) | Svizzera (Zurigo, CH-DK-2) |
| **Infomaniak Network SA**, Ginevra (CH) | invio delle email di servizio (avvisi neutri, codici di verifica — mai dati clinici né nomi di pazienti) | Svizzera |
| **eCall / F24 Schweiz AG** (CH) | invio degli SMS ai pazienti (promemoria appuntamento con testo neutro: data, ora e link riservato — mai dati clinici) | Svizzera |

L'incarico ad altri subfornitori è comunicato per iscritto al cliente; in assenza di opposizione
scritta entro 30 giorni si intende accettato.

## 8. Obblighi di informazione e diritti di audit

*(invariato rispetto al modello FMH 03/2023, § 8)*

In caso di incidenti rilevanti per la sicurezza il fornitore informa il cliente per iscritto il più
rapidamente possibile, **al più tardi entro 72 ore** dalla conoscenza sufficiente dell'incidente, e
lo supporta nell'elaborazione del caso. Il cliente ha diritto di verifica/audit con adeguato
preavviso, negli orari di apertura e nel rispetto dell'operatività del fornitore.

## 9. Responsabilità

*(invariato rispetto al modello FMH 03/2023, § 9 — vedi Note per il legale, punto 5)*

## 10. Durata ed effetti del contratto

*(invariato rispetto al modello FMH 03/2023, § 10)*

L'accordo vale finché il fornitore tratta dati personali del cliente. Il fornitore rinuncia a
qualsiasi diritto di ritenzione sui dati.

## 11. Disposizioni finali

*(invariato rispetto al modello FMH 03/2023, § 11)*

## 12. Diritto applicabile e foro competente

Diritto svizzero; foro competente esclusivo: sede del cliente.

## 13. Firme

Per il fornitore: ______________________  Per il cliente: ______________________
Luogo e data: ______________________     Luogo e data: ______________________

---

## Allegato 1 — Misure tecniche e organizzative (precompilato con le misure effettive)

**Riservatezza**
- *Controllo degli accessi (dati):* ogni utente accede esclusivamente ai dati del proprio studio
  (separazione multi-tenant applicata a livello di ogni interrogazione della banca dati); ruoli
  differenziati (segreteria, medico, amministratore) con permessi distinti; i medici vedono solo il
  proprio programma; sessioni firmate crittograficamente con scadenza a 8 ore; password conservate
  con hash **argon2id** (mai in chiaro).
- *Controllo degli accessi (locali/impianti):* data center Exoscale in Svizzera con controllo fisico
  degli accessi ⟦certificazioni del data center: da allegare su richiesta⟧; l'accesso amministrativo
  al server avviene esclusivamente tramite chiave SSH.
- *Controllo degli utenti:* autenticazione obbligatoria per ogni pagina interna (middleware);
  le pagine pubbliche per pazienti/invianti usano token casuali lunghi con scadenza automatica
  (60–180 giorni) e rotazione su richiesta; **autenticazione a due fattori (2FA, TOTP)**
  disponibile per tutti gli utenti dalla pagina «Sicurezza» (attivazione volontaria, con codici
  di recupero monouso; blocco anti-forza-bruta sui tentativi; introdotta a luglio 2026)
  ⟦valutare se renderla obbligatoria per contratto per gli utenti dello studio⟧.

**Disponibilità e integrità**
- *Controllo dei supporti/della memoria:* server e storage in Svizzera; nessun dato su dispositivi
  portatili del fornitore; documenti e allegati su object storage svizzero con **cifratura
  at-rest (SSE, AES-256)** applicata a ogni caricamento.
- *Controllo del trasporto:* tutte le comunicazioni esclusivamente su **HTTPS/TLS** (certificati
  gestiti automaticamente); le email di notifica non contengono mai dati clinici né nomi di pazienti
  (testo neutro con invito a consultare il portale riservato); SMS con testo neutro.
- *Ripristino:* backup **giornalieri automatici** della banca dati (conservati 14 giorni sul server
  e 60 giorni, in copia off-site, su object storage svizzero separato); ⟦test di ripristino:
  indicare periodicità, raccomandato almeno annuale⟧.
- *Disponibilità/affidabilità/integrità:* servizio gestito con supervisione di sistema (systemd,
  riavvio automatico), monitoraggio degli errori nei log applicativi, vincoli di integrità nella
  banca dati (chiavi esterne, transazioni).
- *Sicurezza del sistema:* aggiornamenti di sicurezza del sistema operativo automatici (unattended
  upgrades) ⟦da confermare/attivare⟧; aggiornamento delle dipendenze applicative a ogni rilascio con
  verifica degli avvisi di sicurezza (`npm audit`).

**Tracciabilità**
- *Controllo degli inserimenti:* ogni cambio di stato di una referral è registrato in una cronologia
  immodificabile (chi, cosa, quando, nota); ogni caricamento, lettura e invio di documenti della
  cartella del paziente è verbalizzato (registro accessi conservato ≥ 1 anno, separato dai
  documenti, sopravvive alla cancellazione del documento).
- *Controllo della divulgazione:* la trasmissione di documenti ad altri studi avviene solo con
  consenso del paziente documentato (data e ora registrate) e viene verbalizzata con indicazione
  dello studio destinatario.
- *Individuazione/eliminazione:* notifiche di violazioni secondo § 8 (72 ore); procedura di
  incident response ⟦DA FORMALIZZARE per iscritto — vedi checklist FMH violazioni⟧.

---

## 📌 Note per il legale (punti aperti da decidere)

1. **Parte fornitrice:** il fornitore non ha ancora una forma giuridica costituita. Da decidere:
   ditta individuale o Sagl. L'accordo può essere intestato alla persona fisica nel periodo
   transitorio (pilota) e volturato alla società alla costituzione?
2. **Contratto principale:** oggi non esistono AGB/condizioni d'uso di ReferralFlow. Questo accordo
   vi fa riferimento (§ 1): vanno redatti insieme (stesso incarico). Per il periodo pilota può
   bastare una descrizione delle prestazioni in allegato?
3. **Luogo del trattamento (§ 4):** la bozza restringe a **sola Svizzera** (il modello FMH ammette
   UE/SEE). Scelta commerciale deliberata (posizionamento «dati in Svizzera», prassi IFPDT per il
   segreto medico). Confermare la formulazione.
4. **Regolamento del trattamento (art. 5 OPDa):** trattandosi di dati sensibili su larga scala va
   redatto un regolamento interno del trattamento (architettura, procedure, misure). Da preparare
   come documento separato — chiedere se il legale ha un modello o se serve prepararne uno tecnico.
5. **Responsabilità (§ 9):** il modello FMH prevede responsabilità solidale verso l'interessato con
   regresso. Valutare se introdurre un massimale di responsabilità del fornitore verso il cliente
   (tipico nei SaaS) e come si concilia con il modello FMH.
6. **Test di ripristino (Allegato 1):** la 2FA e la cifratura at-rest (SSE) sono ora reali
   (luglio 2026); resta da fissare la periodicità del test di ripristino dei backup
   (è pianificato un test trimestrale automatico — confermare la formulazione).
7. **Accordo di riservatezza:** il modello FMH separato (`FMH-accordo-riservatezza.docx`) va firmato
   in aggiunta o è assorbito dal § 6 di questo accordo? (la guida FMH `FMH-guida-uso-accordi.pdf`
   spiega quando servono entrambi).
8. **Conservazione dopo la fine del contratto:** il cliente ha l'obbligo di conservare le cartelle
   ≥ 10 anni (art. 67 cpv. 4 LSan TI; FMH raccomanda 20). Chiarire nel § 5 (cancellazione/consegna)
   che l'esportazione completa precede sempre la cancellazione e che la responsabilità della
   conservazione successiva passa al cliente.
