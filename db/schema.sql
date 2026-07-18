create extension if not exists pgcrypto;

create type referral_status as enum
  ('ricevuta','triage','da_prenotare','prenotata','vista','referto_inviato','chiusa');
create type urgenza as enum ('urgente','normale','programmabile');
create type user_role as enum ('segretaria','medico','admin','inviante');

-- Piattaforma multi-studio: ogni studio ha i suoi utenti, medici invianti,
-- pazienti, referral e agenda. Tutte le query dell'app sono recintate per studio.
create table studios (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  slug         text unique not null,
  notify_email text,
  telefono     text,
  -- Prestazioni offerte, testo libero: usato dalla ricerca di «Affida paziente».
  specialita   text,
  -- Interruttore del titolare della piattaforma (anti-abuso sul self-service).
  attivo       boolean not null default true,
  -- 'self-service' oppure null (script/onboarding manuale).
  created_via  text,
  -- Il medico titolare dello studio (chi decide, chi pagherà l'abbonamento).
  titolare     text,
  -- Piano: pilota | prova (vedi trial_until) | attivo | sospeso.
  -- Nessun blocco automatico: gestione manuale da /piattaforma finché non c'è Stripe.
  abbonamento  text not null default 'pilota',
  trial_until  date,
  stripe_customer_id text,
  created_at   timestamptz not null default now()
);

-- Richieste di attivazione self-service: i dati del modulo restano qui finché
-- il codice email non viene verificato (prova che l'indirizzo è davvero suo).
create table studio_activations (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text not null,
  titolare   text,
  specialita text,
  telefono   text,
  code       text not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index on studio_activations (lower(email));

-- Studi amici: i preferiti di ogni studio, in cima alla pagina «Affida paziente».
create table studio_partners (
  studio_id         uuid not null references studios(id),
  partner_studio_id uuid not null references studios(id),
  created_at        timestamptz not null default now(),
  primary key (studio_id, partner_studio_id),
  check (studio_id <> partner_studio_id)
);

-- Rubrica di studi esterni (non sulla piattaforma) e affidi con link sicuro:
-- lo studio esterno riceve una email neutra e risponde dal link, senza account.
create table external_studios (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id),
  nome       text not null,
  specialita text,
  email      text not null,
  telefono   text,
  attivo     boolean not null default true,
  created_at timestamptz not null default now()
);

create index on external_studios (studio_id);

create table external_referrals (
  id                 uuid primary key default gen_random_uuid(),
  studio_id          uuid not null references studios(id),
  external_studio_id uuid not null references external_studios(id),
  cognome            text not null,
  nome               text not null,
  data_nascita       date,
  telefono           text,
  quesito            text,
  urgenza            urgenza not null default 'normale',
  token              text unique not null default encode(gen_random_bytes(18), 'hex'),
  token_expires_at   timestamptz not null default (now() + interval '60 days'),
  stato              text not null default 'inviato', -- inviato | preso_in_carico | rifiutato
  risposta_nota      text,
  appuntamento_at    timestamptz,
  responded_at       timestamptz,
  -- Impostato quando lo studio destinatario si attiva sulla piattaforma:
  -- l'affido pendente diventa una referral vera nella sua coda
  -- (vincolo aggiunto più sotto, dopo la creazione di referrals).
  converted_referral_id uuid,
  -- Consenso del paziente alla trasmissione di documenti con l'affido (Fase 14).
  consenso_trasmissione timestamptz,
  created_at         timestamptz not null default now()
);

create index on external_referrals (studio_id, created_at);

create table external_attachments (
  id                   uuid primary key default gen_random_uuid(),
  external_referral_id uuid not null references external_referrals(id) on delete cascade,
  filename             text not null,
  storage_key          text not null,
  uploaded_at          timestamptz not null default now()
);

create index on external_attachments (external_referral_id);

create table users (
  id            uuid primary key default gen_random_uuid(),
  -- Gli invianti registrati non appartengono a nessuno studio.
  studio_id     uuid references studios(id),
  email         text unique not null,
  password_hash text not null,
  role          user_role not null default 'segretaria',
  attivo        boolean not null default true,
  -- 2FA (TOTP) facoltativa: attiva quando totp_enabled_at è valorizzato.
  totp_secret   text,
  totp_enabled_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint users_studio_per_ruolo check (studio_id is not null or role = 'inviante')
);

-- Codici di recupero 2FA: monouso, salvati con hash.
create table user_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index on user_recovery_codes (user_id);

-- Profilo pubblico del medico inviante registrato (annuario della piattaforma).
create table inviante_profiles (
  user_id    uuid primary key references users(id) on delete cascade,
  nome       text not null,
  studio     text,
  specialita text,
  telefono   text,
  avatar_key text,
  visibile   boolean not null default true,
  created_at timestamptz not null default now()
);

-- Codici di verifica per la registrazione self-service dal portale invianti.
create table login_verifications (
  id                  uuid primary key default gen_random_uuid(),
  referring_doctor_id uuid not null references referring_doctors(id) on delete cascade,
  email               text not null,
  code                text not null,
  expires_at          timestamptz not null default (now() + interval '15 minutes'),
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index on login_verifications (referring_doctor_id);

-- Reset password self-service: token via email, salvato solo come hash,
-- a scadenza breve e usa-e-getta.
create table password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null default (now() + interval '1 hour'),
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on password_resets (token_hash);
create index on password_resets (user_id);

-- Registro delle accettazioni dei testi legali (condizioni + trattamento dati):
-- la "prova della firma" — chi, quando, quale versione, da quale IP.
create table terms_acceptances (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid references studios(id) on delete set null,
  user_id       uuid references users(id) on delete set null,
  email         text not null,
  terms_version text not null,
  ip            text,
  accepted_at   timestamptz not null default now()
);
create index on terms_acceptances (studio_id);
create index on terms_acceptances (email);

create table referring_doctors (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id),
  nome        text not null,
  studio      text,
  email       text,
  hin_address text,
  telefono    text,
  token       text unique not null default encode(gen_random_bytes(18), 'hex'),
  token_expires_at timestamptz not null default (now() + interval '180 days'),
  created_at  timestamptz not null default now()
);

create table patients (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id),
  cognome       text not null,
  nome          text not null,
  data_nascita  date,
  telefono      text,
  assicurazione text,
  created_at    timestamptz not null default now()
);

-- Cartella documenti del paziente (Fase 14): il dossier accumula i documenti
-- oltre i confini della singola referral; ogni accesso è tracciato.
create table patient_documents (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id),
  patient_id  uuid not null references patients(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  -- referto | ecg | imaging | lettera | consenso | altro
  categoria   text not null default 'altro',
  nota        text,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);

create index on patient_documents (patient_id);
create index on patient_documents (studio_id);

-- Registro degli accessi ai documenti (art. 4 OPDa, conservazione ≥ 1 anno).
-- Nessuna cancellazione a cascata: il registro sopravvive al documento.
create table document_access_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  studio_id   uuid,
  user_id     uuid,
  azione      text not null, -- caricamento | lettura | invio | cancellazione
  dettaglio   text,
  at          timestamptz not null default now()
);

create index on document_access_log (document_id);
create index on document_access_log (at);

-- Istruzioni di preparazione alla visita, configurabili per studio (Fase 8).
-- Testo neutro inviabile al paziente (SMS) e mostrato sulla pagina appuntamento.
create table preparazioni (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id),
  nome       text not null,
  testo      text not null,
  attiva     boolean not null default true,
  created_at timestamptz not null default now()
);

create index on preparazioni (studio_id);

create table referrals (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           uuid not null references studios(id),
  -- Studio della piattaforma che ha affidato il paziente (monitoraggio «Inviati»).
  origin_studio_id    uuid references studios(id),
  patient_id          uuid not null references patients(id),
  referring_doctor_id uuid references referring_doctors(id),
  quesito             text,
  urgenza             urgenza not null default 'normale',
  status              referral_status not null default 'ricevuta',
  canale              text,
  appuntamento_at     timestamptz,
  follow_up_months    int,
  follow_up_due       date,
  follow_up_done_at   timestamptz,
  appt_token          text unique default encode(gen_random_bytes(18), 'hex'),
  reminder_sent_at    timestamptz,
  appt_response       text,
  appt_response_at    timestamptz,
  -- Preparazione alla visita scelta per questa referral (Fase 8).
  preparazione_id     uuid references preparazioni(id),
  preparazione_sent_at timestamptz,
  -- Consenso del paziente alla trasmissione di documenti con l'invio (Fase 14).
  consenso_trasmissione timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Vincolo rimandato: external_referrals nasce prima di referrals.
alter table external_referrals
  add constraint external_referrals_converted_fk
  foreign key (converted_referral_id) references referrals(id);

create table referral_status_history (
  id          uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  from_status referral_status,
  to_status   referral_status not null,
  changed_by  uuid references users(id),
  nota        text,
  changed_at  timestamptz not null default now()
);

create table attachments (
  id          uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  tipo        text,
  canale      text,
  sent_at     timestamptz not null default now()
);

create index on referrals (status);
create index on referrals (urgenza);
create index on referrals (studio_id, status);
create index on referrals (origin_studio_id) where origin_studio_id is not null;
create index on referrals (follow_up_due) where follow_up_done_at is null;
create index on referral_status_history (referral_id);
create index on referring_doctors (studio_id);

-- Fase 3: agenda della Cassa dei Medici via feed iCal (programma del giorno per medico).

create table providers (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id),
  nome       text not null,
  aliases    text[] not null default '{}',
  attivo     boolean not null default true,
  user_id    uuid references users(id),
  created_at timestamptz not null default now()
);

create table agenda_feeds (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id),
  nome           text not null,
  url            text not null,
  match_field    text not null default 'summary',
  attivo         boolean not null default true,
  last_synced_at timestamptz,
  last_status    text,
  created_at     timestamptz not null default now()
);

create table appointments (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id),
  feed_id       uuid references agenda_feeds(id) on delete cascade,
  provider_id   uuid references providers(id),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  titolo        text,
  paziente_nome text,
  motivo        text,
  luogo         text,
  external_uid  text not null,
  referral_id   uuid references referrals(id),
  completed_at  timestamptz,
  follow_up_months  int,
  follow_up_due     date,
  follow_up_done_at timestamptz,
  imported_at   timestamptz not null default now(),
  unique (feed_id, external_uid)
);

create index on appointments (starts_at);
create index on appointments (studio_id, starts_at);
create index on appointments (provider_id, starts_at);
create index on appointments (follow_up_due) where follow_up_done_at is null;
