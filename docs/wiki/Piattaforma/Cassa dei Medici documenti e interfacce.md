---
tipo: piattaforma
aggiornata: 2026-09-23
---
# Cassa dei Medici: documenti e interfacce (ricerca del 23.9.2026)

Che cosa la Cassa dei Medici pubblica sul proprio sito, e che cosa se ne ricava per la
sincronizzazione con ReferralFlow. Complemento di [[Piattaforma/Robot agenda MediOnline]]
(come leggiamo l'agenda oggi) e del punto 7 di [[Piattaforma/Prossimi lavori]].

## Dove stanno i documenti
- **Manuali** (i soli documenti tecnici pubblici): `cassa-dei-medici.ch/support/documentazioni/`
  — «Cockpit dello studio» (147 pagine, MediWin CB), «Agenda» (30 p.), «Cartella clinica
  elettronica» (18 p.), «Caricamento manuale di file XML5.0 in ISI/Lot Management» (2 p.),
  istruzioni tariffe/aggiornamenti.
- **Opuscoli commerciali**: `cassa-dei-medici.ch/it/download.html` — MediOnline (2), XML,
  prenotazione online degli appuntamenti, servizi.
- **Elenco interfacce**: `cassa-dei-medici.ch/it/interfacce.html`.
- **Varianti di fatturazione**: Rockethealth, Variante I, **HIP** (nuovo, piccoli studi di
  psicoterapia), XML, modulo delle prestazioni.
- **Agenzia Ticino** (il contatto dello studio): Via della Posta 21, 6934 Bioggio,
  091 611 91 21, `ticino@cassa-dei-medici.ch`.

## Che cosa dicono, per noi
- **Nessuna interfaccia pubblica in lettura**: non esiste API, iCal, né uno schema pubblicato.
  L'unica interfaccia documentata verso la Cassa è la **Variante XML**, ed è in scrittura, per i
  soli dati di fattura (decisione del 14.9.2026 in [[Decisioni/Registro]]: non la usiamo).
- **XML 5.0 si può caricare a mano** su `isi.cdm.ch` (login SSO → Pacchetti di fatturazione):
  conferma che lo standard in uso è la versione 5.0 del Forum Datenaustausch.
- **«Sincronizzazione iAgenda»** esiste come voce di menu in CB, ma il manuale dell'Agenda
  scrive: «questo modulo al momento non ha alcuna funzione!». Nome promettente, da chiedere.
- **Sincronizzazione con Outlook**: in CB c'è ed è nei due sensi. **Inutilizzabile per noi**:
  manderebbe identità di pazienti nei server Microsoft ([[Regole/nLPD e sessione]]). Si potrebbe
  chiedere se la destinazione può essere un calendario proprio (CalDAV/ICS) invece di Outlook.
- **Statistiche con «Esportare Excel»**: in CB ogni finestra delle statistiche (paziente, cifra
  d'affari, reparti) ha Anteprima, Stampa, **Esportare Excel**, Copiare. È la via realistica per
  ottenere l'elenco pazienti e le prestazioni senza interfacce. MediOnline, da opuscolo, ha
  statistiche analoghe (elenco trattamenti, elenco giornaliero delle prestazioni, cifra d'affari
  per medico) — da verificare se esportano.
- **Stato/«posizione» del paziente**: CB permette di definire stati con colore (sala d'attesa,
  sala apparecchi…), assegnarli all'appuntamento e vederli nella Gestione attività. È il dato
  che oggi ci manca ([[Piattaforma/Orchestrazione sale]]: l'inizio visita si registra a mano).
  Da chiedere se arriva anche in MediOnline e se è leggibile da fuori.
- **AEK-COM** è presentato come «interfaccia universale», ma nel manuale è lo scambio di
  **referti di laboratorio** via MedTransfer (openmedical AG): il referto arriva firmato e
  finisce come PDF nella gestione documenti del paziente. Se quel canale accettasse anche i
  nostri referti confermati, sarebbe la via pulita per consegnarli nella cartella di CB.
- **Doppioni da conoscere**: la Cassa offre già **promemoria SMS** degli appuntamenti (gratis
  con MediOnline) e la **prenotazione online** degli appuntamenti sul sito dello studio, con
  sincronizzazione automatica sull'agenda MediOnline (per utenti Variante I). Prima di
  costruire i richiami SMS ([[Piattaforma/Prossimi lavori]] punto 3) si guarda se lo studio li ha.
- **docbox** (strumento di collaborazione e coordinamento appuntamenti, docbox.ch) è spinto
  dalla Cassa ed è un concorrente diretto della parte referral di ReferralFlow.

## Domande aperte per la Cassa (e per lo studio)
1. Lo studio ha **MediWin CB installato** o usa solo MediOnline dal browser? Se c'è CB, i dati
   stanno in un database nello studio e la via pulita è leggere di lì.
2. Esportazione dell'**elenco pazienti** (anagrafica) in Excel/CSV: da quale funzione, e
   ripetibile?
3. **iAgenda**: che cos'è, è stato attivato?
4. **Stati/posizione del paziente**: arrivano in MediOnline? sono leggibili da fuori?
5. Sincronizzazione agenda verso un **calendario proprio** (ICS/CalDAV) invece di Outlook?
6. **AEK-COM/MedTransfer**: può ricevere un referto PDF prodotto da un software dello studio?
7. Costi, contratto, referente tecnico.

## CalDAV di MediOnline: esiste, autentica, ma non pubblica nulla (23.9.2026)
Le guide «Config_IOS_I» e «Config_Android_I» (versione maggio 2023, date dalla Cassa allo studio)
documentano un **server CalDAV ufficiale**: `https://www.medionline.ch/caldav`, Basic auth con
utente e password di MediOnline, una agenda alla volta, con modo **sola lettura** esplicito e
**solo gli ultimi 14 giorni** di passato. Le guide avvisano che «serve la vecchia password»: falso
oggi, la convalida passa dall'SSO attuale.

Provato dal Mac dello studio con le credenziali del robot, in sola lettura, senza mai leggere il
contenuto degli appuntamenti:

| prova | risposta |
| --- | --- |
| utente finto | `401` in 0.1 s |
| utente vero, password sbagliata | `500` in 2.3 s |
| utente vero, password vera | **`207 Multi-Status`** |
| `PROPFIND /caldav/` | principal `/caldav/acl/users/<utente>`, home `/caldav/calendars/` |
| `PROPFIND /caldav/calendars/` Depth 1 | **una sola collezione, vuota: nessun calendario** |
| `/caldav/calendars/<utente>/` | `404` |

Quindi: il canale c'è e le credenziali vanno; **manca l'attivazione della sincronizzazione sulle
agende dentro MediOnline**, che è un'opzione del gestionale, non nostra. Finché non è attiva, né
l'iPhone né il server vedono alcunché — l'errore «impossibile verificare» sul telefono e il
`TaskCanceledException in SsoClient.TryGetToken` nel browser sono inciampi passeggeri del loro
SSO, non la causa.

Resta da misurare, appena una agenda è pubblicata: se l'evento CalDAV porta anche **colore**,
**stato di fatturazione** e **id MediOnline**. Se sì il robot diventa quasi superfluo; se no si
tiene il robot per quei tre campi e il CalDAV per l'ossatura.
