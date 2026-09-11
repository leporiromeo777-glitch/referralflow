---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Funzioni fatte (dalla più recente)

Elenco di ciò che esiste. Per la catena dei referti vedi [[Catena/Panoramica]].

- **Anonimizza documenti** `/anonimizza` (2026-08-17, menu Studio): incolla testo o carica .txt/PDF → il modello LOCALE (Ollama `ANONIMIZZA_LLM`, default gemma3:12b, non il 27b: non si contende la GPU con whisper) individua i dati identificativi e il CODICE li sostituisce con segnaposto; rete regex (AVS/email/telefoni CH), niente persistenza (`src/lib/anonimizza.ts`). PDF via `pdf-parse` v2.
- **Consulto rapido tra medici / eConsult** (migrazione 020: `consulti` + `consulto_attachments`): domanda clinica dal portale token, risposta da `/consulti` (badge in nav, notifiche neutre), conversione in referral.
- **Cattura AI dell'impegnativa** sul modulo `/invia/[token]`: `src/lib/impegnativa.ts` legge foto/PDF con `@anthropic-ai/sdk` (claude-opus-5, json_schema via zod); API `/api/invia/[token]/cattura` (rate-limit per token, file in memoria). SPENTA se manca `ANTHROPIC_API_KEY` (serve la validazione legale come Stripe).
- **Questionario pre-visita** (migrazione 021): il paziente compila una breve anamnesi da `/appuntamento/[token]`, visibile nel Programma e nel dettaglio referral.
- **Slot proposto all'invio** (migrazione 022: `slot_finestre` + `referrals.slot_proposto`): finestre in `/impostazioni/studio`, `src/lib/slot.ts` calcola i primi slot liberi in SQL (fuso Europe/Zurich); indicativo, NESSUNA scrittura sull'agenda Cassa dei Medici.
- **Bozze di referto dalla catena** (2026-07-23, migrazione 019: `referti_bozze` + `studios.referti_token_hash`; SPEC in `docs/trascrizione/SPEC.md`). `POST /api/referti/bozza` con Bearer token per studio (201 scritta, 200 duplicato, entrambi autorizzano la catena a cancellare l'audio). Pagina `/referti` + dettaglio; `confermaBozza`/`scartaBozza`: il payload resta intatto, le correzioni umane in `testo_finale`/`campi_confermati`.
- **2FA + cifratura at-rest** (2026-07-18, migrazione 016): TOTP RFC 6238 (`src/lib/totp.ts`), pagina `/sicurezza` per tutti i ruoli, attivazione in 3 tempi (QR locale → primo codice → codici di recupero mostrati UNA volta; 2FA accesa solo dopo «Ho salvato i codici», `finishSetup`); login a due passaggi via cookie `rf_2fa` (5 min) → `/login/verifica`; `S3_SSE=AES256` attiva SSE su `putFile` (accenderla in produzione solo dopo verifica con SOS).
- **Cartella documenti del paziente** (migrazione 014: `patient_documents`, `document_access_log` conservato ≥ 1 anno, `consenso_trasmissione`): sezione nel dettaglio referral, download via `/api/documents/[id]` che logga, «Affida questo paziente» → `/affida?paz=`, spunta consenso OBBLIGATORIA se si allegano documenti (art. 321 CP / art. 20 LSan TI), documenti senza copia (stesso storage_key). Base legale verificata 2026-07-16: art. 64 cpv. 2 LSan TI; conservazione ≥ 10 anni art. 67 LSan.
- **Abbonamento senza pagamenti** (migrazione 013: `studios.titolare`, `abbonamento` pilota|prova|attivo|sospeso, `trial_until` 60 gg, banner prova in scadenza senza blocchi, piano da `/piattaforma`, `stripe_customer_id` predisposto).
- **Attivazione self-service** (migrazione 012: `/attiva` crea lo studio con codice 6 cifre via email; affidi esterni pendenti diventano referral; `/piattaforma` per il titolare; studio disattivato = login bloccato).
- **Login per i medici invianti** (migrazione 011: ruolo `inviante` senza studio, `inviante_profiles`, `login_verifications`; area `/invii`; annuario su `/affida`; `/registrazione`; `/privacy`).
- **Affidi a studi esterni** (migrazione 010: `external_studios`, `external_referrals` con token 60 gg, `external_attachments`; `/affida/esterno`, pagina pubblica `/affido/[token]`).
- **Affida paziente fase 1** (migrazione 009: `studio_partners`, `studios.specialita`; `/affida`).
- **Disdetta con conferma della segreteria** («Devo disdire — chiama lo studio» apre `tel:` e registra `disdetta_da_confermare`; lo slot si libera solo alla conferma).
- **Lista d'attesa** = scheda Disdette della Coda (`/?vista=disdette`; `/lista-attesa` fa redirect).
- **Scheda pre-visita e storico paziente** (`src/lib/patient-history.ts`, abbinamento per cognome/nome/data_nascita).
- **Preparazioni alla visita** (migrazione 008; libreria in `/impostazioni/preparazioni`, SMS al paziente, testo su `/appuntamento/[token]`).
- **Multi-studio** (migrazione 007: `studios`, recinto ovunque, gestione utenti admin, referral tra studi con «Inviati»).
- **Follow-up alla chiusura** (no / 6 / 12 / N mesi; `/richiami`; migrazione 004).
- Azione rapida nella coda, vincoli server su transizioni; scheda per medico inviante `/medici/[id]`; login cardiologi interni (ruolo `medico`); menu profilo e campanella (`AutoRefresh` 60 s); avviso email alla segreteria dal form pubblico (`notifyStudio`); scadenza + rotazione token pubblici; programma del giorno da feed iCal.
- **Referti Word in carta intestata** (`modelli/referto-carta-intestata.docx`, `src/lib/referto-docx.ts`): l'intestazione segue il medico che ha dettato (vedi [[Catena/Formato lettera e Word]]).
- **Riorganizza / Impagina come lettera (AI)** (`src/lib/referto-struttura.ts`): modello locale (`REFERTO_STRUTTURA_LLM`, oggi Qwen 3.8 leggero; il 12b duplicava le sezioni) rimappa il dettato nel rapporto-tipo o nella lettera; veto se cambia un numero; proposta salvata in `testo_finale` solo su stato bozza.
