# Accordo sulla riservatezza

*(Basato sul modello ufficiale FMH v. 03/2023)*

**tra**

Nome dello studio medico: **Centro Cardiologico Ticino**
Indirizzo: ⟦via e numero — da completare⟧
NPA località: ⟦NPA e località — da completare⟧
*(di seguito detto «cliente»)*

**e**

**Romeo Lepori** — titolare della piattaforma ReferralFlow ⟦quale persona fisica / ditta individuale⟧
Indirizzo: ⟦via e numero — da completare⟧
NPA località: ⟦NPA e località — da completare⟧
Email: romeolepori@gmail.com
*(di seguito detto «fornitore»)*

concernente informazioni riservate.

---

## 1. Preambolo

**1.1** Il fornitore eroga al cliente i servizi (di seguito «scopo») descritti nel contratto
concernente l'utilizzo della piattaforma **ReferralFlow** (https://referralflow.ch) per la gestione
delle referral e della cartella documenti dei pazienti (di seguito «contratto principale»). In tale
contesto è possibile che il fornitore, oltre a quanto previsto dal segreto professionale ai sensi
dell'art. 321 CP, venga a conoscenza anche di informazioni riservate del cliente.

Al fine di preservare la riservatezza di tali informazioni, le parti stipulano il seguente accordo.

## 2. Informazioni riservate

Sono da considerarsi «informazioni riservate» tutte le informazioni che il fornitore può percepire in
relazione alla fornitura del servizio al cliente o di cui sia venuto in altro modo a conoscenza,
indipendentemente dalla modalità di comunicazione (orale, scritta o di altro tipo). Sono considerate
informazioni riservate anche tutte quelle rientranti nel segreto professionale ai sensi dell'art. 321
CP, le quali comprendono in particolare — ma non in modo esaustivo — qualsiasi informazione sui
pazienti (ivi inclusa la circostanza che una persona sia un/una paziente).

Non sono considerate riservate le informazioni per le quali il fornitore possa dimostrare:
- che gli erano già note al momento della comunicazione;
- che erano già palesi al momento della comunicazione o siano diventate palesi senza alcuna violazione
  del presente accordo;
- che gli siano state comunicate da terzi senza alcuna violazione di un accordo sulla riservatezza;
- di esserne venuto a conoscenza indipendentemente e senza utilizzare informazioni riservate;
- che sono state o dovevano essere rese accessibili a terzi sulla base di un obbligo di legge o di un
  ordine delle autorità o di un tribunale.

## 3. Obblighi del fornitore

Il fornitore si impegna a mantenere la massima segretezza su tutte le informazioni riservate. Gli è
consentito renderle accessibili a terzi solo previo consenso scritto del cliente, trasferendo a tali
terzi tutti gli obblighi del presente accordo mediante un accordo scritto sulla riservatezza.

Il fornitore si impegna a non utilizzare le informazioni riservate per scopi diversi da quelli citati
nel preambolo.

Il fornitore si impegna ad adottare tutte le misure preventive atte a evitare che persone non
autorizzate possano avere accesso alle informazioni riservate, in particolare le misure tecniche e
organizzative di cui all'**Allegato 1**.

Il fornitore si impegna a rendere accessibili le informazioni riservate solo ai collaboratori che ne
abbiano necessità per adempiere lo scopo e che siano vincolati al segreto da uno specifico accordo,
scritto e a tempo indeterminato, valido durante e dopo il rapporto di lavoro.

Il fornitore si impegna, a scelta del cliente e a prima richiesta, a riconsegnare integralmente o
distruggere tutti i documenti e i supporti dati contenenti informazioni riservate, comprese le copie,
confermandone per iscritto la completezza. Rinuncia a qualsiasi diritto di ritenzione.

## 4. Pena convenzionale

Qualora il fornitore violi una clausola del contratto, è tenuto a pagare al cliente una pena
convenzionale di CHF 25'000 per ogni singola violazione. Indipendentemente dal pagamento, il fornitore
è tenuto a ripristinare per quanto possibile lo stato conforme al contratto; il cliente ha inoltre
diritto a un ulteriore risarcimento danni.

## 5. Durata del contratto e disdetta

Il presente accordo è stipulato a tempo indeterminato e sostituisce ogni accordo analogo precedente,
avendo priorità in caso di contraddizioni. Resta valido come minimo finché il fornitore dispone di
informazioni riservate del cliente. Gli obblighi dei punti 3 e 4 permangono a tempo indeterminato
anche dopo la fine del contratto, nella misura in cui il cliente vi abbia interesse.

## 6. Obblighi di informazione e diritti di audit

Il fornitore informa il cliente in modo completo su tutte le circostanze che mettano a rischio la
riservatezza. In caso di incidenti rilevanti per la sicurezza e la protezione dei dati informa
immediatamente il cliente per iscritto e lo supporta nell'elaborazione del caso fornendogli tutti i
documenti a sua disposizione. Il cliente ha facoltà di verificare il rispetto degli obblighi con
adeguato preavviso, negli orari di apertura e nel rispetto dell'operatività del fornitore.

## 7. Disposizioni finali

Il contratto e il suo allegato regolano in modo esaustivo il contenuto del contratto. Le modifiche
necessitano della forma scritta. I diritti e gli obblighi non possono essere ceduti senza il consenso
scritto della controparte. L'eventuale inefficacia di una disposizione non inficia la validità delle
restanti.

## 8. Diritto applicabile e foro competente

Si applica esclusivamente il diritto svizzero. Foro competente esclusivo: la sede del cliente.

## 9. Firme

| Per il fornitore | Per il cliente |
|---|---|
| Romeo Lepori | Centro Cardiologico Ticino |
| | rappresentato da: ⟦nome del titolare/rappresentante⟧ |
| Luogo e data: ____________________ | Luogo e data: ____________________ |
| Firma: ____________________ | Firma: ____________________ |

---

## Allegato 1 — Misure tecniche e organizzative

**Riservatezza**
- *Controllo degli accessi (informazioni):* ogni utente accede esclusivamente alle informazioni del
  proprio studio (separazione multi-tenant a ogni interrogazione della banca dati); ruoli distinti
  (segreteria, medico, amministratore); sessioni firmate con scadenza a 8 ore; password con hash
  argon2id.
- *Controllo degli accessi (locali/impianti):* data center Exoscale in Svizzera con controllo fisico
  degli accessi; accesso amministrativo al server solo tramite chiave SSH.
- *Controllo degli utenti:* autenticazione obbligatoria per ogni pagina interna; pagine pubbliche con
  token casuali a scadenza automatica e rotazione. *(2FA in corso di introduzione.)*

**Disponibilità e integrità**
- *Controllo dei supporti/della memoria:* server e storage in Svizzera; nessun dato su dispositivi
  portatili del fornitore.
- *Controllo del trasporto:* comunicazioni solo su HTTPS/TLS; email e SMS con testo neutro, senza dati
  clinici né nomi di pazienti. *(Cifratura dei documenti a riposo in corso di attivazione.)*
- *Ripristino:* backup giornalieri automatici (14 giorni sul server; 60 giorni in copia off-site su
  object storage svizzero separato).
- *Disponibilità/affidabilità/integrità:* supervisione di sistema con riavvio automatico, monitoraggio
  degli errori, vincoli di integrità nella banca dati.
- *Sicurezza del sistema:* aggiornamenti di sicurezza del sistema operativo e delle dipendenze con
  verifica degli avvisi a ogni rilascio.

**Tracciabilità**
- *Controllo degli inserimenti:* cronologia immodificabile dei cambi di stato delle referral; registro
  accessi ai documenti (caricamento, lettura, invio) conservato ≥ 1 anno, separato dai documenti.
- *Controllo della divulgazione:* trasmissione di documenti solo con consenso documentato del paziente,
  verbalizzata con indicazione dello studio destinatario.
- *Individuazione/eliminazione:* notifiche di violazioni al cliente in caso di incidente.

---

> **Nota (leggere prima di firmare).** Documento basato sul modello ufficiale FMH v. 03/2023,
> compilato per il pilota Centro Cardiologico Ticino ↔ Romeo Lepori. Si firma **insieme** al
> «contratto di trattamento dati su incarico»: quello disciplina *come* tratti i dati, questo aggiunge
> l'impegno di riservatezza con una pena convenzionale (CHF 25'000). Per il pilota può essere firmato
> così, completando i campi ⟦…⟧. Chi scrive non è un avvocato: materiale preparato con cura, non un
> parere legale.
