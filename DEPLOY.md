# ReferralFlow — checklist di pubblicazione

Guida per mettere in produzione l'app su hosting svizzero (vincolo nLPD: app, DB e
allegati devono stare in Svizzera).

## 1. Infrastruttura (da scegliere/aprire)
- [ ] Hosting applicativo in CH con Node 20+: Infomaniak (VPS/Cloud) o Exoscale (istanza).
- [ ] PostgreSQL gestito in CH (Infomaniak / Exoscale DBaaS) con **cifratura a riposo** e backup automatici cifrati in CH.
- [ ] Object storage S3-compatibile in CH per gli allegati: Exoscale SOS (`ch-dk-2`) o Infomaniak.
- [ ] Dominio + certificato TLS (HTTPS obbligatorio: i cookie di sessione sono `secure` in produzione).

## 2. Variabili d'ambiente (vedi `.env.example`)
- [ ] `DATABASE_URL` — stringa del DB di produzione (con `PGSSL=require` se il provider usa TLS).
- [ ] `SESSION_SECRET` — **nuovo** segreto forte (`openssl rand -base64 32`), mai quello di sviluppo.
- [ ] `APP_BASE_URL` — URL pubblico (es. `https://referral.studio.ch`), usato nei link delle notifiche.
- [ ] `SMTP_*` — per l'avviso neutro all'inviante. In produzione puntare al **gateway SMTP di HIN**
      così l'avviso viaggia sulla rete sanitaria sicura; in alternativa un SMTP svizzero.
      Senza `SMTP_HOST` le notifiche vengono solo registrate (nessun invio).
- [ ] `S3_*` — credenziali dell'object storage svizzero. Senza, gli allegati finiscono su disco
      locale (`./uploads`): accettabile solo se il disco è cifrato e nel backup.

## 3. Database
```bash
psql "$DATABASE_URL" -f db/schema.sql          # installazione nuova
# oppure, per un DB esistente, le migrazioni 001…007 in ordine (ultima: 007_multitenant.sql)
```
- [ ] NIENTE `db/seed.sql` in produzione (sono dati demo).
- [ ] Se le migrazioni girano come `postgres` ma l'app usa un ruolo dedicato (es. `rf_app`):
      `grant select, insert, update, delete on all tables in schema public to rf_app;`
      e, una volta sola, `alter default privileges for role postgres in schema public
      grant select, insert, update, delete on tables to rf_app;` per le tabelle future.
- [ ] Creare lo studio: `npm run create-studio -- "Nome Studio" slug [email-notifiche]`.
- [ ] Creare gli utenti reali: `npm run create-user -- email password [ruolo] [slug-studio]`
      (il primo con ruolo `admin`: da lì in poi gli accessi si gestiscono da
      `/impostazioni/utenti` nell'app).
- [ ] `SUPPORT_PHONE` / `SUPPORT_EMAIL` nel `.env` — contatti dell'assistenza 24/7
      mostrati nel menu profilo e nella pagina di login.

## 4. Applicazione
```bash
npm ci
npm run build
npm run start        # dietro reverse proxy (nginx/caddy) con HTTPS
```
- [ ] Processo gestito (systemd/PM2) con riavvio automatico.
- [ ] Reverse proxy con HTTPS, HSTS e limite dimensione upload coerente con gli allegati.

## 5. Sicurezza / nLPD — verifiche finali
- [ ] Tutte le pagine interne redirigono a `/login` senza sessione (il middleware protegge
      tutto tranne `/login`, `/invia/*`, `/portale/*`, `/api/*`).
- [ ] I token dei link pubblici scadono (180 giorni) e si rigenerano dalla pagina Medici.
- [ ] Le notifiche email non contengono dati clinici né nomi di pazienti (solo link al portale).
- [ ] `/api/agenda-demo` risponde 404 in produzione (solo sviluppo).
- [ ] Contratto di committenza (ADV) firmato tra studio (titolare) e Weblinkx (responsabile).
- [ ] Test di ripristino da backup eseguito almeno una volta.

## 6. Agenda Cassa dei Medici
- [ ] Configurare il feed iCal reale in `/programma/feed` (l'URL è una credenziale: non condividerlo).
- [ ] Verificare la mappatura dei medici (alias) sul primo sync reale.

## 7. Debito noto (non blocca il go-live, da pianificare)
- Next.js 14.2.35: le advisory residue di `npm audit` richiedono Next 16 (migrazione con
  modifiche al codice). Riguardano feature non usate dall'app (Image Optimizer, WebSocket,
  script `beforeInteractive`), ma la migrazione va messa in calendario.
- Sync automatico del feed agenda (oggi manuale con «Sincronizza ora»).
- Rate limiting sul login e sulle pagine pubbliche (mitigato da token lunghi e argon2id).
