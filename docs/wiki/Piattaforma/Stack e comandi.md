---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Stack e comandi

ReferralFlow è una piattaforma multi-studio per la gestione delle referral tra studi medici svizzeri. Ogni studio ha i suoi utenti, medici invianti, pazienti, referral e agenda (tabella `studios`, `studio_id` su tutte le anagrafiche, recinto in ogni query tramite `session.studioId`). Sta *sopra* gli strumenti già in uso (Cassa dei Medici per agenda/fatturazione, HIN per la comunicazione sicura). Cliente pilota reale: Centro Cardiologico Ticino (slug `centro-cardiologico-ticino`). Obiettivo: rivendere ad altri studi specialistici del Ticino.

## Stack
- Next.js 14 (App Router) + TypeScript, server actions
- PostgreSQL via `pg`
- Auth: cookie httpOnly firmato con `jose`, password argon2id con `@node-rs/argon2`
- Allegati: `@aws-sdk/client-s3` (object storage svizzero) con fallback su `./uploads` in dev

## Comandi
- `npm run dev` — sviluppo su http://localhost:3000
- `npm run build` — build di produzione
- `npm run create-studio -- "<Nome>" <slug> [email-notifiche]`
- `npm run create-user -- <email> <password> [ruolo] [slug-studio]` (ruoli: segretaria, medico, admin; l'admin gestisce gli accessi da `/impostazioni/utenti`)
- Schema: `psql "$DATABASE_URL" -f db/schema.sql` (+ `db/seed-demo.sql`; il vecchio `db/seed.sql` è pre-migrazione 007 e non funziona più)
- DB esistente: applicare in ordine le `db/migrations/0XX_*.sql` mancanti (ultima: `034_referti_dizionario.sql`)
- Test: `npm run test:audit` (diff, metriche, dizionario dalle correzioni), `npm run test:app` (anche verifica lettera e fusione terapia; gira con `--conditions=react-server`, dipendenza `server-only` installata apposta), `npm run audit-backfill`
- Catena: `python3.14 pipeline-referti/prove-catastrofiche.py` (suite, 32 casi), banchi in [[Misure/Banchi]]
- Anteprima locale sul Mac: `bash mac/avvia-anteprima.sh` (si accorge del servizio e rimanda a quello)
- Pubblicazione: checklist in `DEPLOY.md`

## Ciclo di vita referral
ricevuta → triage → da_prenotare → prenotata → vista → referto_inviato → chiusa
(`src/lib/status.ts`: STATUS, NEXT_STATUS, NEXT_ACTION, URGENZA). Ogni cambio di stato è registrato in `referral_status_history`.
