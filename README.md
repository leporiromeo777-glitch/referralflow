# ReferralFlow

Gestione delle referral in entrata per uno studio specialistico (MVP — Centro Cardiologico Ticino).
Sta *sopra* gli strumenti esistenti (Cassa dei Medici, HIN): non li sostituisce, gestisce il flusso
delle referral che oggi vive su carta.

## Stack
- Next.js 14 (App Router) + TypeScript
- PostgreSQL (`pg`) — da ospitare su cloud svizzero (Infomaniak / Exoscale) per la nLPD
- Sessioni con cookie httpOnly firmato (`jose`), password con argon2id (`@node-rs/argon2`)
- Allegati su object storage S3-compatibile svizzero (`@aws-sdk/client-s3`), con fallback su disco locale

## Requisiti
- Node.js 20+ (serve per `--env-file`)
- Un database PostgreSQL

## Avvio
```bash
npm install
cp .env.example .env          # compila DATABASE_URL e SESSION_SECRET
# genera un segreto: openssl rand -base64 32

psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql            # dati demo (facoltativo)

npm run create-user -- segreteria@studio.ch unaPasswordForte
npm run dev                                    # http://localhost:3000
```
Per un database già esistente creato con una versione precedente:
```bash
psql "$DATABASE_URL" -f db/migrations/001_phase2.sql
```

## Schermate

### Interne (dietro login)
- `/` — coda delle referral (dashboard)
- `/referral/nuova` — registra una referral in entrata
- `/referral/[id]` — dettaglio, cronologia stati, avanzamento, allegati
- `/medici` — anagrafica invianti con i link da condividere
- `/statistiche` — tempo medio → appuntamento, conversione, volumi

### Pubbliche (per il medico inviante, via link tokenizzato)
- `/invia/[token]` — modulo con cui il medico di base invia una referral
- `/portale/[token]` — stato in tempo reale delle sue referral

## Ciclo di vita
ricevuta → triage → da_prenotare → prenotata → vista → referto_inviato → chiusa

Ogni cambio di stato è tracciato in `referral_status_history` (audit nLPD + statistiche).

## Allegati
Se `S3_ENDPOINT` e `S3_BUCKET` sono impostati, i file vanno su object storage svizzero
(Exoscale SOS / Infomaniak). Altrimenti finiscono in `./uploads` (solo sviluppo).
Il download passa da `/api/attachments/[id]`, che verifica la sessione.

## Note di conformità (nLPD)
- Ospita app, DB e allegati in Svizzera.
- Non inviare dati clinici via mail in chiaro: usa HIN o un avviso neutro con link al portale.
- I link `/invia` e `/portale` usano un token casuale lungo. In produzione: aggiungi scadenza
  e rotazione del token, e valuta un'autenticazione vera per i medici.
- Contratto di committenza (ADV) tra studio (titolare) e Weblinkx (responsabile).
- Cifratura a riposo su DB e storage, backup cifrati in CH.

## Stato dei moduli
1. Auth + dashboard + nuova referral — fatto
2. Dettaglio + avanzamento stato + cronologia — fatto
3. Notifiche all'inviante (registrate in `notifications`; invio HIN/portale da collegare) — fatto (base)
4. Allegati (object storage svizzero) — fatto
5. Fase 2: form pubblico + portale invianti + statistiche — fatto
