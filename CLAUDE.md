# ReferralFlow — contesto per Claude Code

Piattaforma multi-studio per la gestione delle referral tra studi medici svizzeri.
Ogni studio ha i suoi utenti, medici invianti, pazienti, referral e agenda: il login apre
la pagina del proprio studio (tabella `studios`, `studio_id` su tutte le anagrafiche,
recinto in ogni query tramite `session.studioId`). Gli studi possono affidarsi pazienti
a vicenda (pagina «Inviati», `origin_studio_id`, canale `piattaforma`).
Sta *sopra* gli strumenti già in uso (Cassa dei Medici per agenda/fatturazione, HIN per la
comunicazione sicura): non li sostituisce. Cliente pilota reale: Centro Cardiologico Ticino
(slug `centro-cardiologico-ticino`). Obiettivo: rivendere ad altri studi specialistici del Ticino.

## Stack
- Next.js 14 (App Router) + TypeScript, server actions
- PostgreSQL via `pg`
- Auth: cookie httpOnly firmato con `jose`, password argon2id con `@node-rs/argon2`
- Allegati: `@aws-sdk/client-s3` (object storage svizzero) con fallback su `./uploads` in dev

## Comandi
- `npm run dev` — sviluppo su http://localhost:3000
- `npm run build` — build di produzione
- `npm run create-studio -- "<Nome>" <slug> [email-notifiche]` — crea uno studio della piattaforma
- `npm run create-user -- <email> <password> [ruolo] [slug-studio]` — crea/aggiorna un utente
  (ruoli: segretaria, medico, admin; l'admin gestisce gli accessi da `/impostazioni/utenti`)
- Schema: `psql "$DATABASE_URL" -f db/schema.sql` (+ `db/seed-demo.sql` per dati demo
  multi-studio: crea prima lo studio slug `studio-demo` e un admin; il vecchio
  `db/seed.sql` è pre-migrazione 007 e non funziona più)
- DB esistente da versione precedente: applicare in ordine le `db/migrations/0XX_*.sql`
  mancanti (ultima: `030_referti_eventi.sql`)
- Anteprima locale sul Mac mini dello studio: `bash mac/avvia-anteprima.sh`
  (installa Node+Postgres, prepara DB e dati demo, avvia su http://localhost:3000;
  vedi `mac/LEGGIMI.md` — obiettivo: Mac mini come server dello studio)
- Server interno dello studio (livello 1, FATTO 2026-08-13): `bash mac/installa-server.sh`
  una volta → servizio launchd `ch.referralflow.app` (server-avvio.sh: attende
  Postgres, git pull, migrazioni, rebuild su .build-stamp, `npm start`) +
  backup notturno 02:30 `ch.referralflow.backup` (pg_dump 14gg + rsync uploads
  in ~/ReferralFlow-backup) + pmset no-sleep/autorestart; APP_BASE_URL riscritto
  a `http://<nome-mac>.local:3000` (LAN, cookie non-secure ok). Aggiornamento:
  `bash mac/aggiorna-server.sh` (pull + kickstart). avvia-anteprima.sh si
  accorge del servizio e rimanda a quello. Livello 2 (esposizione pubblica:
  dominio, HTTPS, hardening) rimandato ad app assestata + parte legale.
- Pubblicazione: checklist completa in `DEPLOY.md`

## NON rompere
- Non toccare `experimental.serverComponentsExternalPackages: ['@node-rs/argon2', 'pg']`
  in `next.config.mjs`: senza, il build fallisce sui binari nativi.
- Serve Node 20+ (per `--env-file` e i binari argon2).
- Le pagine che leggono dal DB hanno `export const dynamic = 'force-dynamic'`: mantienilo,
  evita che Next provi a prerenderarle al build.
- `src/lib/auth.ts` e `src/lib/storage.ts` sono lato server (`import 'server-only'`): non importarli
  in componenti client. Il middleware verifica il JWT da solo (non importa `auth.ts`, che è nativo).

## Vincoli di dominio (nLPD)
- Dati sanitari sensibili: hosting di app, DB e allegati in Svizzera.
- Mai dati clinici in mail in chiaro: usare HIN o avviso neutro con link al portale.
- Link pubblici `/invia/[token]` e `/portale/[token]`: token casuale lungo con scadenza
  (180 giorni) e rotazione dalla pagina Medici. Eventuale auth vera per i medici in futuro.
- Non mettere dati paziente in URL, log o notifiche in chiaro. Le mail di notifica
  (`src/lib/notify.ts`) sono avvisi neutri: mai nomi di pazienti o dati clinici.
- L'URL del feed iCal dell'agenda è una credenziale: non mostrarlo per intero né loggarlo.

## Architettura
- `src/lib/` — db, auth, storage, status (macchina degli stati), format (utility date/età),
  notify (avviso neutro via SMTP), ical (parser iCal senza dipendenze), agenda-sync (sync feed)
- `src/app/(app)/` — area interna dietro login (dashboard, referral, medici, statistiche,
  programma del giorno + configurazione feed agenda, `/inviati` monitoraggio dei pazienti
  affidati ad altri studi, `/impostazioni/utenti` gestione accessi — solo admin)
- **Recinto multi-studio**: la sessione (`SessionUser`) porta `studioId`/`studioNome`;
  ogni query dell'area interna filtra per `studio_id`. Sessioni senza `studioId`
  (pre-migrazione 007) invalidate da middleware e `getSession`.
- `src/app/invia|portale/[token]/` — pagine pubbliche per il medico inviante (lo studio si
  ricava dal token). Modulo generico per il sito web dello studio: `/invia?s=<slug-studio>`
- Supporto 24/7 (menu profilo + pagina login) da env `SUPPORT_PHONE`/`SUPPORT_EMAIL`
- Pannello del titolare `/piattaforma` (env `PLATFORM_OWNER_EMAIL` = email dell'account
  che lo vede): studi, invianti registrati, attivazioni incompiute, attiva/disattiva studio
- `src/app/api/attachments/[id]/` — download allegati autenticato
- `src/app/api/agenda-demo/` — feed iCal di esempio (404 in produzione)
- Il middleware protegge tutto tranne `/login`, `/invia/*`, `/portale/*`, `/api/*`
  (le API verificano la sessione da sole): le pagine interne nuove sono protette di default
- Ogni cambio di stato è registrato in `referral_status_history` (audit nLPD + statistiche)

## Ciclo di vita referral
ricevuta → triage → da_prenotare → prenotata → vista → referto_inviato → chiusa
(definito in `src/lib/status.ts`: STATUS, NEXT_STATUS, NEXT_ACTION, URGENZA)

## Prossimi lavori (in ordine di valore)
0. Referti Word in carta intestata (bottone nel dettaglio referto, stampo
   `modelli/referto-carta-intestata.docx`, lib `src/lib/referto-docx.ts`):
   l'intestazione è FISSA (Dr. Med. Giorgio Moschovitis) — richiesta utente
   2026-08-17: in futuro deve seguire IL MEDICO CHE FIRMA il referto
   (più medici per studio → intestazioni per medico). Nella stessa pagina
   il bottone «Riorganizza nel formato standard (AI)»: gemma3:27b LOCALE
   (`src/lib/referto-struttura.ts`, NON il 12b: duplicava le sezioni)
   rimappa il dettato nel rapporto-tipo del medico (Diagnosi principali
   numerate con «- attuale:», Diagnosi secondarie, Comorbidità, Anamnesi,
   Terapia domiciliare, Esami con date, Valutazione, Procedere); veto del
   codice se cambia anche un solo numero (la numerazione d'elenco a inizio
   riga è esclusa dal confronto), proposta salvata in testo_finale solo su
   stato bozza, sempre rivista da una persona.
1. Stripe su «Attiva il tuo studio» (le BASI ci sono già — migrazioni 012+013:
   attivazione self-service intestata al medico titolare, `studios.abbonamento`
   pilota|prova|attivo|sospeso, `trial_until` 60gg, `stripe_customer_id` vuoto,
   banner prova in scadenza SENZA blocco, gestione manuale del piano da
   /piattaforma. Stripe aggiunge solo il checkout sopra questi campi.
   PREREQUISITI lato utente: ditta/Sagl + AGB + contratto trattamento dati
   validati da un legale — non accendere i pagamenti prima).
2. Fase 2 cartella digitale — 2FA e cifratura at-rest: FATTE (2026-07-18, vedi sotto).
   Restano: contratto di trattamento dati standard con gli studi (stesso passaggio legale
   di Stripe — modelli FMH e bozza precompilata in `docs/legale/`), pagina pubblica
   «Sicurezza». Fase 3 (quando gli studi la chiedono): note di visita strutturate
   (= cartella primaria ex art. 67 LSan), integrazione HIN, export PDF/A.
3. Richiami automatici al paziente (SMS alla scadenza del follow-up — dopo attivazione eCall).
3. Smistamento suggerito per parole chiave (quesito → servizio/medico).
4. Chat AI su «Affida paziente» (fase 2 — serve chiave API Anthropic).
5. Referto strutturato: modelli + dettatura vocale + invio HIN (grande valore per i medici,
   dipende da account HIN e da un servizio di trascrizione svizzero/UE per la nLPD).
6. Migrazione a Next 16 (advisory residue di `npm audit`; riguardano feature non usate).

SMS: ATTIVI via eCall REST v2 (Basic auth, `SMS_API_TOKEN=utente:password`, driver
`src/lib/sms.ts` con normalizzazione numeri). Account eCall in testing fino al 15.08.2026
(poi comprare punti); mittente = numero verificato (l'alfanumerico va autorizzato da eCall).

## Robot agenda MediOnline (OPERATIVO e INTEGRATO dal 2026-08-14)
La Cassa dei Medici (MediOnline, ASP.NET WebForms con sessione nell'URL,
login solo utente+password) non dà all'utente un link iCal per tutti i
medici → robot Playwright locale in `mac/agenda-robot/` che si logga, legge
l'agenda e scrive un .ics in `agenda-locale/` (gitignored, dati pazienti);
`syncFeed` accetta URL `locale:<nome>.ics` da quella cartella (avviso nello
stato del feed se il file è fermo >2h). Fatti: installa.sh (credenziali in
~/.referralflow-agenda.conf chmod 600), comune.mjs (login generico +
radiografia con celle-pazienti redatte, etichette UI e nomi medici visibili),
radiografia.mjs (browser visibile, l'utente naviga alla vista agenda →
~/agenda-radiografia.txt da incollare in chat), riparatore.mjs
(auto-riparazione: selettori base → se rotti, l'AI locale gemma propone da
struttura+screenshot, il codice VERIFICA la proposta e la salva in
~/.referralflow-agenda-selettori.json — testato: corsa 1 ripara, corsa 2 va
senza AI). VINCOLO UTENTE esplicito: robot in SOLA LETTURA — compila solo il
login, clic solo di navigazione hardcoded, mai salvataggi, dialog rifiutati
(`modalitaSolaLettura`); il riparatore AI trova elementi, non decide azioni.
FATTO leggi-agenda.mjs (2026-08-14, costruito sulla radiografia vera):
login → menu Agenda→Appuntamenti (li#b2) → vista Multi + oggi → per ogni
giorno (AGENDA_GIORNI, default 10) legge la griglia DayPilot con geometria
a runtime (rowheader HH:MM → scala px/minuto, colheader → sigla agenda,
fallback indice td → sigle spuntate), data da dd.mm.yyyy nell'UPHeader →
scrive agenda-locale/medionline.ics — filtri AGENDA_COLORI_IGNORA (colore riquadro, dal catalogo tipi dello studio) e AGENDA_TESTI_IGNORA (parole per i colori misti, es. rosso=urgenze MA anche Stop) — (LOCATION=sigla, match_field=location,
alias medici = sigle ASM/M.M./T.M./…) e sveglia /api/cron/agenda con
REMINDER_SECRET dal .env. attiva-servizio.sh = launchd
ch.referralflow.agenda-robot ai minuti 1,16,31,46. Collaudato E2E in
container su finta MediOnline fedele e POI DAL VIVO sul Mac dello studio:
97 appuntamenti veri su 10 giorni (weekend a 0), 133 riquadri scartati dai
filtri. Catalogo colori dello studio: tenere verde #2ecc40 (visite), verde
acceso #01ff70 (colloqui tel.), blu #0074d9 (risonanze), azzurro #7fdbff
(ICCT emodinamica/CVE), bordeaux #85144b (interventi), rosso solo urgenze;
ignorare #ffffff #ffdc00 #000000 #dddddd #111111 #b10dc9 + testi
stop/no coro/non occupare/guardia/picchetto. INTEGRATO dallo studio
(feed locale:medionline.ics campo location, sigle negli alias, servizio
attivo). Da verificare col tempo: qualità dell'estrazione del nome
paziente dal testo dei riquadri e aggancio alle referral.

## Automazioni attive
Sul Mac server dello studio: launchd `ch.referralflow.automazioni` ogni 15 min
(`mac/automazioni.sh`: agenda a ogni giro, promemoria SMS al giro «in punto»,
watchdog alle 07, report il 1° alle 08; chiave `REMINDER_SECRET` generata da
installa-server.sh nel .env). Sulla vecchia VM (cron /etc/cron.d/referralflow
via cron-hit.sh):
- Sync agenda ogni 15 min → `/api/cron/agenda` (tutti i feed attivi, tutti gli studi)
- Promemoria SMS ogni ora → `/api/reminders/run`
- Watchdog referral ferme ogni mattina → `/api/cron/watchdog` (soglie in `src/lib/watchdog.ts`:
  ricevuta/triage 3g, da_prenotare 14g, misurate da `updated_at`; email neutra per studio +
  badge «⏰ ferma» in coda)
- Report mensile il 1° del mese → `/api/cron/report` (aggregati del mese precedente per studio)
- Tutti protetti da `?key=REMINDER_SECRET`; backup notturno DB locale (14g) + off-site su
  Exoscale SOS `referralflow-backups` (60g); allegati di produzione su SOS `referralflow-uploads`

Fatti di recente: pagina «Anonimizza documenti» `/anonimizza` (2026-08-17, menu Studio):
incolla testo o carica .txt/PDF → il modello AI LOCALE (Ollama `ANONIMIZZA_LLM`,
default gemma3:12b — apposta non il 27b: non si contende la GPU con whisper) individua
i dati identificativi e il CODICE li sostituisce con segnaposto («Persona N», [data di
nascita], …) — l'AI non riscrive mai il testo (`src/lib/anonimizza.ts`); rete di
sicurezza regex (AVS/email/telefoni CH), niente persistenza, il documento non esce mai
dal Mac (nLPD ok senza validazioni legali). PDF via `pdf-parse` (v2, in
serverComponentsExternalPackages). Prima ancora: quattro strumenti ispirati alla ricerca di mercato (2026-07-24):
(1) Consulto rapido tra medici / eConsult (migrazione 020: `consulti` +
`consulto_attachments`): domanda clinica scritta dell'inviante dal portale token,
risposta dello specialista da `/consulti` (badge in nav, notifiche neutre), con
conversione in referral (la domanda → quesito, allegati al seguito). (2) Cattura AI
dell'impegnativa sul modulo `/invia/[token]`: `src/lib/impegnativa.ts` legge foto/PDF
con `@anthropic-ai/sdk` (claude-opus-5, blocco documento/immagine + json_schema via
zod) e precompila i campi; API `/api/invia/[token]/cattura` autorizzata dal token,
rate-limit per token, file letto in memoria e scartato (nessuna persistenza, mai dati
paziente in URL o log). SPENTA se manca `ANTHROPIC_API_KEY` — accenderla richiede la
stessa validazione legale di Stripe (DPA col subfornitore + informativa). (3) Questionario
pre-visita (migrazione 021: `referrals.questionario` jsonb + `questionario_at`): il
paziente compila una breve anamnesi dal promemoria `/appuntamento/[token]`, visibile
nella scheda pre-visita del Programma e nel dettaglio referral. (4) Slot proposto
all'invio (migrazione 022: `slot_finestre` + `referrals.slot_proposto`): finestre di
disponibilità per studio in `/impostazioni/studio`, `src/lib/slot.ts` calcola i primi
slot liberi in SQL con fuso Europe/Zurich (finestre meno l'agenda), selettore sui moduli
`/invia`, slot precompilato nella prenotazione — indicativo, NESSUNA scrittura sull'agenda
Cassa dei Medici. Prima ancora: ricezione bozze di referto dalla pipeline di trascrizione locale
(2026-07-23, migrazione 019: `referti_bozze` + `studios.referti_token_hash`; la SPEC
della pipeline che gira sul Mac mini dello studio è `docs/trascrizione/SPEC.md` — fonte
di verità, prompt in §6 da NON toccare. Endpoint `POST /api/referti/bozza` con Bearer
token per studio, solo hash sha256 in tabella, token generato/revocato dall'admin in
/impostazioni/studio e mostrato UNA volta via cookie flash; 201 = scritta, 200 =
`file_id` duplicato (retry idempotenti), entrambi autorizzano la pipeline a cancellare
l'audio. Pagina `/referti` (voce in nav solo se token attivo o bozze presenti, badge
conteggio) + dettaglio con divergenze/segmenti dubbi evidenziati nel testo (`<mark>`,
classi `.ref-mark-*`), allarmi numerici, campi estratti correggibili; conferma/scarto
con `confermaBozza`/`scartaBozza` — il payload della pipeline resta intatto, le
correzioni umane vanno in `testo_finale`/`campi_confermati`. Mai contenuti clinici nei
log dell'endpoint), 2FA + cifratura at-rest — Fase 2 sicurezza (2026-07-18, migrazione 016:
`users.totp_secret`/`totp_enabled_at` + `user_recovery_codes` con hash monouso; `src/lib/totp.ts`
TOTP RFC 6238 con crypto nativo, verificato coi vettori ufficiali; pagina `/sicurezza` per TUTTI
i ruoli — eccezioni nel middleware per medico/inviante, link nel menu profilo — con attivazione
in 3 tempi: QR generato in locale (libreria `qrcode`, il segreto non esce mai) → primo codice
→ codici di recupero mostrati UNA volta e 2FA accesa solo dopo «Ho salvato i codici»
(`finishSetup` — NON accendere prima: il refresh post-action farebbe sparire i codici, bug
trovato e corretto); login a due passaggi via cookie `rf_2fa` firmato 5 min (`createPending2fa`)
→ `/login/verifica` (esclusa dal middleware perché inizia per «login») che accetta TOTP o
codice di recupero, con rate-limit dedicato chiave `2fa:<email>`; disattivazione solo con
codice valido. Cifratura at-rest: `S3_SSE=AES256` nel .env attiva l'header SSE su `putFile`
(gated via env: accenderla in produzione solo dopo verifica che SOS la accetti); bozza DPA
aggiornata (2FA e SSE ora reali nell'Allegato 1)), cartella documenti del paziente — Fase 1 cartella digitale (migrazione 014:
`patient_documents` con categoria/nota, `document_access_log` — ogni caricamento/lettura/invio
tracciato, conservazione ≥1 anno ex art. 4 OPDa, il log sopravvive al documento —,
`consenso_trasmissione` su referrals/external_referrals; lib `src/lib/cartella.ts` con
`isUuid` guardia sui parametri UUID da URL/form; sezione «Cartella del paziente» nel
dettaglio referral con upload categorizzato e download via `/api/documents/[id]` che
logga la lettura; bottone «Affida questo paziente» → `/affida?paz=` propagato a tutti i
percorsi d'invio; form piattaforma ed esterno con prefill paziente + checkbox documenti
della cartella + spunta consenso OBBLIGATORIA se si allegano documenti — art. 321 CP /
art. 20 LSan TI, respinta server-side senza consenso; i documenti viaggiano senza copia,
stesso storage_key. BASE LEGALE verificata con ricerca approfondita 2026-07-16: la
cartella elettronica è espressamente ammessa dall'art. 64 cpv. 2 LSan TI su «sistema
informatico sicuro»; conservazione ≥10 anni art. 67 LSan, FMH raccomanda 20; niente
certificazione DEP necessaria — binario separato, obbligo studi ~2030; per posizionarla
come cartella primaria servono ancora: DPA con gli studi + 2FA + cifratura at-rest
dichiarata — vedi Prossimi lavori), basi abbonamento senza pagamenti (migrazione 013: `studios.titolare`
— l'attivazione chiede il MEDICO TITOLARE, la sua email diventa l'admin: sarà lui
l'intestatario dell'abbonamento —, `abbonamento` pilota|prova|attivo|sospeso,
`trial_until`: self-service = prova 60gg, banner per l'admin negli ultimi 14 giorni
e a prova scaduta — mai blocchi automatici —, colonna Piano con form «cambia» in
/piattaforma per fattura manuale/proroghe, `stripe_customer_id` predisposto; menu
dell'inviante ripulito dalle voci di studio), funnel di attivazione self-service (migrazione 012: `studio_activations`,
`studios.attivo` + `created_via`, `external_referrals.converted_referral_id`; /attiva crea
lo studio da solo — dati → codice 6 cifre via email → studio + admin + login immediato,
prefill da `?da=<token-affido>`; alla creazione gli affidi esterni pendenti o presi in
carico indirizzati a quell'email diventano referral vere nella nuova coda, allegati
compresi, con avviso ai mittenti — il paziente è già lì al primo accesso; card di
benvenuto «primi passi» sulla coda con `?benvenuto=1`; /affido/[token] con box «che
cos'è questo link» e CTA post-risposta; affidi convertiti → il vecchio link mostra
«è nella vostra coda» e spariscono dai doppioni negli Inviati; /piattaforma per il
titolare — gate su env `PLATFORM_OWNER_EMAIL` — con studi, invianti, attivazioni
incompiute da richiamare e interruttore attiva/disattiva per studio; studio disattivato:
login bloccato, escluso da /affida, selettori e moduli pubblici; badge «ora su
ReferralFlow ✓» in /affida quando l'email di uno studio esterno corrisponde a uno
studio attivo — l'affido passa alla piattaforma; /impostazioni/studio per l'admin
— nome, specialità, telefono, email notifiche —; notifica email al supporto per ogni
nuovo studio e ogni nuovo inviante registrato — `notifySupporto` in notify.ts), login per i medici invianti (migrazione 011: ruolo `inviante` senza
studio — `users.studio_id` nullable con check —, `inviante_profiles` per l'annuario,
`login_verifications`; registrazione self-service dal portale token: codice 6 cifre via
email all'indirizzo in anagrafica → account + profilo; area `/invii` trasversale agli
studi con match per email del medico, profilo modificabile con visibilità annuario;
sezione «Annuario» su /affida con `affidaDaAnnuario` che crea la voce di rubrica dal
profilo; pagina pubblica `/registrazione` per richieste senza token → email al supporto,
verifica manuale MedReg; recinto middleware inviante → solo /invii; informativa privacy
`/privacy` linkata da tutte le pagine pubbliche), affidi a studi esterni (migrazione 010: `external_studios` rubrica per
studio, `external_referrals` con token 60gg + stato inviato/preso_in_carico/rifiutato,
`external_attachments`; sezione rubrica su `/affida`, form `/affida/esterno`, email neutra
con link sicuro `notifyAffidoEsterno` — senza SMTP l'invio viene annullato —, pagina pubblica
`/affido/[token]` con risposta e allegati via `/api/affido/[token]/[att]`, avviso al mittente
`notifyRispostaAffido`, sezione «Affidati a studi esterni» negli Inviati, pitch ReferralFlow
in fondo alla pagina pubblica come canale di acquisizione; `/affido/` escluso nel middleware),
«Affida paziente» fase 1 (migrazione 009: `studio_partners` +
`studios.specialita`; pagina `/affida` con studi amici in cima — stella `togglePartner` —,
ricerca per nome/specialità, storico invii per studio, bottone → `/inviati/nuova?studio=<id>`
preselezionato, blocco «Invita uno studio» via mailto; fase 2 = chat AI sopra questa pagina,
serve chiave API Anthropic), disdetta con conferma della segreteria (il paziente NON disdice più con un
tasto: «Devo disdire — chiama lo studio» apre la telefonata via `tel:` e registra
`appt_response='disdetta_da_confermare'` + email alla segreteria; la segreteria conferma o
annulla dal dettaglio referral; solo alla conferma lo slot si libera nella Lista d'attesa;
telefono dello studio da `studios.telefono`), collaborazione tra funzioni (promemoria SMS
segnala la preparazione se assegnata e salta gli appuntamenti disdetti/da confermare;
avanzamento di una referral affidata → email allo studio mittente, `notifyOriginStudio`;
scheda pre-visita mostra stato preparazione), lista d'attesa intelligente (`/lista-attesa`: slot liberati da disdette +
coda da_prenotare ordinata per urgenza/attesa con telefono), scheda paziente pre-visita nel
Programma e storico paziente (`src/lib/patient-history.ts`, abbinamento query-time per
cognome/nome/data_nascita, «visite precedenti» nel dettaglio referral), preparazioni alla visita
(migrazione 008: tabella `preparazioni` + `referrals.preparazione_id`; libreria in
`/impostazioni/preparazioni` solo admin, assegnazione dal dettaglio referral, invio SMS al
paziente, testo mostrato su `/appuntamento/[token]`); piattaforma multi-studio (migrazione 007: tabella `studios`, recinto
per studio ovunque, gestione utenti per l'admin, referral tra studi con monitoraggio
«Inviati», supporto 24/7, moduli pubblici per-studio), follow-up alla chiusura (obbligatorio: no / 6 / 12 / N mesi, scadenza
dall'ultima visita; pagina `/richiami` con «Segna gestito» e badge in nav; migrazione 004),
azione rapida nella coda + vincoli server su transizioni/appuntamento/referto,
scheda per medico inviante (`/medici/[id]`, metriche + storico), login per i
cardiologi interni (ruolo `medico` → solo il proprio `/programma`, recinto nel middleware, account
creati/collegati da `/programma/feed`), menu profilo e campanella nuove richieste nel topbar
(`AutoRefresh` ogni 60s), avviso email alla segreteria per le richieste dal form pubblico
(`notifyStudio`, env `STUDIO_NOTIFY_EMAIL`), notifiche reali all'inviante, scadenza + rotazione
token pubblici, programma del giorno da feed iCal Cassa dei Medici.

## Catena referti: pagine e strumenti aggiunti il 5-6.9.2026
- `/referti/qualita` cruscotto (parole modificate, tempo di revisione, segnalazioni
  chiuse senza riascolto, classi di correzione da `src/lib/referti-tassonomia.ts`);
  `/referti/confronto` confronto cieco tra bozza di produzione e bozza «ombra»
  (`python3 pipeline.py --ombra file`, migrazione 028 `referti_confronti`);
  `/sicurezza-dati` pagina pubblica «come proteggiamo i dati».
- Payload bozza: `rischio_frasi`, `numeri`, `frasi_omesse`, `storia`, `versioni`,
  `ombra`; `payload.revisione` con tempo, flag e tassonomia; `payload.fusione`
  con provenienza, riepilogo e `variazioni` delle misure.
- Dettagli in `pipeline-referti/README.md`; documenti legali in `docs/legale/`
  (destinazione d'uso con checklist per funzione, DSFA bozza, email Infomaniak,
  conservazione audio, ciclo di vita dei dati, fornitori cloud, registro
  trattamenti, incidenti, diritti degli interessati, sorveglianza normativa,
  classificazione dataset). Registro eventi referti append-only:
  `referti_eventi` (migrazione 030, `src/lib/referti-eventi.ts`, mai testo
  clinico). La catena chiama solo fornitori nella lista autorizzata
  (`FORNITORI_AUTORIZZATI`). Il testo verso il cloud è PSEUDONIMIZZATO
  (mappa in RAM sul Mac), non anonimo: usare questa parola.
- Barriere anti-guasto silenzioso (Ricerca 18, 6.9.2026): `payload.manifesto`
  (livello di verifica pieno/ridotto/minimo, testimoni, trasporti, conteggi),
  gate pre-firma nel wizard con presa d'atto registrata (`override_critici`),
  guardia d'identità e gate temporale sulla fusione, lucchetto delle relazioni
  (`src/lib/referti-misure-cliniche.ts`), suite `pipeline-referti/prove-
  catastrofiche.py` e `distribuisci.sh` (distribuisce SOLO se la suite passa e
  nessun referto è in lavorazione: usare quello, non cp+kickstart a mano).

## Visione di lungo periodo
Quando più studi useranno ReferralFlow: pagina «Esplora» per i medici invianti (cerca la
prestazione → studi che la offrono, ordinati per trasparenza sui tempi: primo slot libero,
presa in carico mediana). I registri ufficiali (MedReg, Refdata/GLN, elenco HIN) servono per
i contatti; i dati di servizio nascono solo dall'uso della piattaforma. Predisporre `gln`
sulle anagrafiche quando si toccherà quello schema.

## Convenzioni
- UI e testi in italiano, sentence case, tono asciutto.
- Palette e stili in `src/app/globals.css` — design «premium minimale» (2026-07-17):
  bianco caldo #f4f3ef, verde profondo `--cta` #0d5c48 per azioni e blocchi di pregio
  (NIENTE nero: l'utente vuole il verde), bottoni a pillola (radius 999px), card 20px,
  h1 29px. I colori semantici urgenze restano. `.prog-dark` = pannello verde del
  Programma (stile mockup). `.attiva-hero` = hero verde della pagina di vendita.
  Grafici: SVG server-side in `statistiche/page.tsx` (componente BarChart, no dipendenze).
  Ogni pagina tiene la riga di spiegazione sotto il titolo (piace all'utente).
- Medici invianti (2026-07-17, stile mockup «Search»): pagina a schede con `.msearch`
  (barra di ricerca), `.mchips` (filtri per specialità, solo se presenti), `.mcount`
  e `.mcard` con avatar. Logica avatar (`MediciList.tsx`, client): se l'email del
  `referring_doctor` combacia con un utente `role='inviante'` (ha l'app) e ha caricato
  una foto → `.mavatar-img` da `/api/inviante-avatar/[userId]`; se ha l'app senza foto
  → `.mavatar-app` con iniziali (verde); se non è registrato → `.mavatar-empty` icona
  omino grigia. La foto la carica l'inviante dalla sua area `/invii` (campo `foto` in
  `aggiornaProfilo`, `inviante_profiles.avatar_key`, migrazione 015). Badge «✓ su
  ReferralFlow» vs «solo contatto». La specialità mostrata viene dal profilo inviante.
- Intestazioni di pagina per zona (`src/app/(app)/PageHero.tsx`, classi `.page-hero`
  + `.hero-{green|amber|blue|slate}` in globals.css): ogni area ha il suo accento
  — così le pagine non si somigliano tutte, restando in palette. Verde=operativo
  (Coda, Programma), ambra=attesa/priorità (Lista d'attesa), blu=controlli futuri
  (Follow-up), ardesia=monitoraggio/annuario (Inviati, Medici). Statistiche usa
  `.hero-solid` (hero verde pieno con i 4 KPI dentro). L'eyebrow è l'etichetta di
  zona in alto; il titolo e la spiegazione restano dentro l'hero. Usare PageHero per
  le nuove pagine dell'area interna, scegliendo la zona per significato (non a caso).
- Le «caselle» metriche (`.metrics`/`.metric`) restano SOLO dove i numeri sono il
  fulcro: Coda e Follow-up. Su Inviati il riepilogo è la barra compatta `StatStrip`
  (`.statbar`, numeri in linea con divisori, tono `alert`/`warn` colora solo la cifra).
- Disdette = scheda della Coda (2026-07-18): la vecchia pagina «Lista d'attesa» è
  stata unita alla Coda come secondo tab. La Coda (`(app)/page.tsx`) ha `?vista=coda`
  (default) | `?vista=disdette`; tab `.coda-tabs`/`.coda-tab` dentro il pannello verde,
  badge sul tab Disdette (conteggio `disdetto`+`disdetta_da_confermare`). Il tab Disdette
  mostra slot liberati (con pairing «chi chiamare») + disdette da confermare; tolto il
  doppione «prossimi da chiamare» (era già il filtro «Da prenotare» della Coda). `/lista-attesa`
  ora fa `redirect('/?vista=disdette')`; voce di menu rimossa dal layout; il badge disdette
  non è più nella nav. La nota «foglio» qui sotto è STORICA (la vecchia pagina a sé).
- Lista d'attesa (2026-07-17, STORICO — ora è la scheda Disdette della Coda): layout «foglio» stile mockup — intestazione colorata
  in cima (`.sheet-top.sheet-green`, VERDE come Coda/Programma — non ambra: l'utente
  l'ha corretto, il verde resta il colore delle pagine operative — testo bianco, hero
  inline + `.sheet-stats` coi 3 numeri) e sotto un pannello bianco `.sheet` (angoli
  arrotondati 28px, `margin-top:-22px` per «salire» sopra la parte colorata) che
  contiene le liste. Contenuto nel `.content` (non full-bleed). `.sheet-amber` resta
  disponibile in CSS per altre pagine; per cambiare l'accento basta la classe
  `.sheet-{colore}` sul `.sheet-top`. Le tre sezioni (slot liberati, disdette da
  confermare, prossimi da chiamare) restano tutte e tre — decisione dell'utente dopo
  discussione sulla sovrapposizione con la Coda: «lasciamola così». Ogni slot liberato
  è abbinato al prossimo paziente da chiamare in ordine di priorità (`suggerimenti`,
  pairing per indice tra `slots` e `attesa`) con un avviso `.suggest-box` sotto la riga:
  «Appuntamento disdetto il [data]: chiama [nome] per riempire il posto» + tasto ☎
  diretto + link alla sua referral.
- Follow-up (2026-07-17): stesso layout «pannello verde + schede bianche fluttuanti»
  di Coda, riusando le classi `.coda-top`/`.coda-hero`/`.coda-eyebrow`/`.coda-lede`
  (ormai condivise, non solo di Coda) + una riga di numeri con divisori dentro il
  pannello verde (`.rc-stats`/`.rc-stat`, stile «Tasks Pending/In Progress/Completed»)
  per Da richiamare/Programmati/Totale. Sotto, `.stat-grid.stat-grid-2` (2 colonne)
  con due schede-stat NUOVE: «Ricontattati questo mese» (conta `follow_up_done_at`
  su referral+appuntamenti negli ultimi 30 giorni) e «Tempo medio di richiamo»
  (giorni medi tra scadenza `follow_up_due` e gestione effettiva, ultimi 90 giorni,
  clampato a 0 se gestito in anticipo) — un dato di efficienza, non solo di volume.
  La versione «questa settimana» è stata tolta su richiesta dell'utente e sostituita
  col tempo medio.
- Programma (2026-07-17, layout stile mockup «Today»): striscia settimanale
  (`.cal`/`.cal-strip`, `align-items:center`) con NUMERO sopra e giorno sotto; il
  giorno scelto è una pillola verticale verde più alta che sporge (padding maggiore
  su `.cal-day.sel`), oggi = numero verde, puntino sotto i giorni con appuntamenti;
  frecce = settimana ±7. Sotto `.day-sub` (data estesa + sincronizza). Gli
  appuntamenti sono una TIMELINE verticale unica in ordine d'orario (`.tl`/`.tl-item`
  con `.tl-node`, linea = `.tl::before`): il «prossimo» (primo non completato,
  `featuredId`) è la card verde in evidenza (`.tl-card`, testo bianco, «Completa»
  bianco), gli altri voci semplici; completati = nodo grigio + barrato. Il medico
  che vede il paziente è mostrato in `.tl-sub` (niente più raggruppamento per medico
  né `.prog-dark`). «Da assegnare» resta una sezione separata sotto.
- Coda (dashboard `/`): layout ispirato a una dashboard app (2026-07-17). `.coda-top`
  = PANNELLO VERDE arrotondato e CONTENUTO (border-radius 24px desktop / 18px mobile,
  NON full-bleed — l'utente lo vuole come una scheda col cream attorno) dietro
  hero+schede+filtri; sotto resta il cream della pagina per la lista. Hero inline in bianco (`.coda-hero`,
  niente PageHero). Le metriche sono `.stat-grid`/`.stat-card` — TUTTE bianche (l'utente
  le vuole bianche sul verde), badge-icona SVG inline, «Urgenti» in `.alert` quando >0.
  Filtri `.qf-row`/`.qf-btn` (pulsanti quadrati stile «Scenes», scroll orizzontale su
  mobile) al posto dei vecchi select; ogni chip è un Link con querystring
  `?stato=`/`?urgenza=`; l'attivo resta bianco con badge verde pieno + anello
  (`box-shadow 0 0 0 2px var(--cta)`), non riempito. Sezione lista con `.coda-list-head`.
  La `margin-top` negativa di `.coda-top` va tenuta uguale al padding-top di `.content`
  (36px desktop, 20px ≤640) per far arrivare il verde sotto la topbar senza buchi.
- Preferire server components + server actions; client components solo dove serve interattività.
- Mobile: sotto gli 860px la navigazione diventa hamburger (checkbox CSS-only `#navtoggle`
  nel layout; `NavLink` chiude il menu al tocco); campanella e profilo restano in barra.
