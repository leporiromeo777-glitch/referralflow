---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Architettura

- `src/lib/` — db, auth, storage, status (macchina degli stati), format (date/età), notify (avviso neutro via SMTP), ical (parser iCal senza dipendenze), agenda-sync (sync feed), sms (eCall), totp, cartella, slot, impegnativa, anonimizza, referti-* (catena lato app), audit/ (vedi [[Catena/Audit e qualità]])
- `src/app/(app)/` — area interna dietro login: coda (dashboard), referral, medici, statistiche, programma del giorno + feed agenda, `/inviati`, `/impostazioni/utenti` (solo admin), `/referti` e sottopagine, `/consulti`, `/richiami`, `/affida`, `/anonimizza`, `/sicurezza`
- **Recinto multi-studio**: la sessione (`SessionUser`: id, email, role, studioId, studioNome) porta lo studio; ogni query dell'area interna filtra per `studio_id`. Sessioni senza `studioId` invalidate da middleware e `getSession`.
- `src/app/invia|portale/[token]/` — pagine pubbliche per il medico inviante (lo studio si ricava dal token). Modulo generico per il sito dello studio: `/invia?s=<slug-studio>`
- Supporto 24/7 (menu profilo + login) da env `SUPPORT_PHONE`/`SUPPORT_EMAIL`
- Pannello del titolare `/piattaforma` (env `PLATFORM_OWNER_EMAIL`): studi, invianti, attivazioni incompiute, attiva/disattiva studio, piano
- `src/app/api/attachments/[id]/` — download allegati autenticato; `src/app/api/agenda-demo/` — feed iCal di esempio (404 in produzione)
- Il middleware protegge tutto tranne `/login`, `/invia/*`, `/portale/*`, `/affido/*`, `/api/*` (le API verificano la sessione da sole): le pagine interne nuove sono protette di default. Ruolo `medico` → solo `/programma`; ruolo `inviante` → solo `/invii`.
- API della catena col token referti (Bearer, solo hash sha256 in `studios.referti_token_hash`): `POST /api/referti/bozza`, `POST /api/referti/medici`, `GET /api/referti/dizionario`, coda dei dettati.
- Ruoli: segretaria, medico, admin, inviante. Per l'audit la "segretaria" è `AUDIT_ROLI_SEGRETARIA` (default `segretaria,admin`).
