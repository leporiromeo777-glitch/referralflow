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
  -- Endpoint bozze referto (pipeline di trascrizione locale): solo l'hash
  -- sha256 del token, il chiaro si vede una volta sola alla generazione.
  referti_token_hash   text unique,
  -- Medici che dettano, pubblicati dal Mac dello studio (medici.json): [{id, nome, breve, modalita}]
  referti_medici       jsonb not null default '[]'::jsonb,
  referti_token_set_at timestamptz,
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

-- Codici di verifica per la registrazione self-service dal portale invianti.
-- (Definita qui, dopo referring_doctors, perché la referenzia.)
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

create table patients (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id),
  cognome       text not null,
  nome          text not null,
  data_nascita  date,
  telefono      text,
  assicurazione text,
  -- Controllo AI nel tempo sui referti confermati (migrazione 025).
  controllo_ai    text,
  controllo_ai_at timestamptz,
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
  -- Questionario pre-visita compilato dal paziente dal promemoria (anamnesi
  -- breve: motivo/sintomi, farmaci, allergie, note).
  questionario        jsonb,
  questionario_at     timestamptz,
  -- Slot indicativo scelto dall'inviante al momento dell'invio (Fase slot).
  slot_proposto       timestamptz,
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

-- Bozze di referto dalla pipeline locale di trascrizione (docs/trascrizione/SPEC.md):
-- il Mac mini dello studio le POSTa su /api/referti/bozza, un umano le conferma
-- o le scarta da /referti. Il payload della pipeline resta intatto come riferimento.
create table referti_bozze (
  tipo text not null default 'referto' check (tipo in ('referto','visita')),
  -- Id del profilo del medico che ha dettato (medici.json sul Mac dello studio).
  medico text check (medico is null or medico ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Stato della revisione guidata (migrazione 032): ripreso alla riapertura.
  revisione_stato jsonb,
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  file_id     text not null,
  payload     jsonb not null,
  stato       text not null default 'bozza'
                check (stato in ('bozza', 'confermata', 'scartata')),
  testo_finale     text,
  campi_confermati jsonb,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (studio_id, file_id)
);

create index on referti_bozze (studio_id, stato, created_at);
create index on referti_bozze (studio_id, medico, created_at);

-- Consulto rapido tra medici (eConsult): domanda breve dal portale
-- dell'inviante, risposta scritta dello specialista da /consulti;
-- convertibile in referral quando serve la visita.
create table consulti (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           uuid not null references studios(id) on delete cascade,
  referring_doctor_id uuid not null references referring_doctors(id) on delete cascade,
  domanda             text not null,
  risposta            text,
  stato               text not null default 'aperto'
                        check (stato in ('aperto', 'risposto', 'convertito')),
  answered_by         uuid references users(id) on delete set null,
  answered_at         timestamptz,
  converted_referral_id uuid references referrals(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index on consulti (studio_id, stato, created_at);
create index on consulti (referring_doctor_id, created_at);

create table consulto_attachments (
  id          uuid primary key default gen_random_uuid(),
  consulto_id uuid not null references consulti(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);

create index on consulto_attachments (consulto_id);

-- Slot proposto all'invio: finestre di disponibilità per studio; i moduli
-- d'invio propongono i primi slot liberi (finestre meno l'agenda). Indicativo:
-- la segreteria conferma nella Coda, nessuna scrittura sull'agenda esterna.
create table slot_finestre (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  giorno      smallint not null check (giorno between 1 and 7),
  ora_inizio  time not null,
  ora_fine    time not null check (ora_fine > ora_inizio),
  durata_min  int not null default 30 check (durata_min between 5 and 240),
  created_at  timestamptz not null default now()
);

create index on slot_finestre (studio_id, giorno);

-- Imparare dalle conferme (migrazione 021): sostituzioni ricorrenti estratte dal
-- confronto tra il testo dell'AI e quello confermato dalla persona; diventano
-- suggerimenti per il dizionario della trascrizione sul Mac.
create table referti_suggerimenti (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  da         text not null,
  a          text not null,
  conteggio  int not null default 1,
  ignorato   boolean not null default false,
  applicato  boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (studio_id, da, a)
);

create index on referti_suggerimenti (studio_id, ignorato, conteggio desc);

-- Audio dei referti dal drag & drop della pagina Referti (migrazione 023):
-- coda che la pipeline del Mac preleva e trascrive; l'audio resta collegato
-- alla bozza per il riascolto.
create table referti_audio (
  tipo text not null default 'referto' check (tipo in ('referto','visita')),
  -- Medico scelto al caricamento: la pipeline lo mette nel nome del file.
  medico text check (medico is null or medico ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  content_type text,
  stato       text not null default 'in_coda'
                check (stato in ('in_coda', 'elaborazione', 'fatto', 'errore')),
  -- Fase in corso segnalata dalla pipeline (avanzamento in pagina).
  fase        text,
  fase_at     timestamptz,
  bozza_id    uuid references referti_bozze(id) on delete set null,
  uploaded_by uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index on referti_audio (studio_id, stato, created_at);

-- Post-it di squadra sulla pagina Oggi (migrazione 026): note volanti della
-- segreteria, si aggiungono e si strappano.
create table note_squadra (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id),
  testo      text not null,
  autore     text,
  created_at timestamptz not null default now()
);
create index on note_squadra (studio_id, created_at desc);

-- 027: visite registrate (ambient scribe locale) — tipo su audio e bozze
-- Audit trail, lineage, versioni e qualità della catena (9.9.2026).
-- Schema SEPARATO «audit» (dati analitici) accanto alle tabelle operative:
-- pronto a diventare un database a sé senza toccare l'applicazione.
-- Solo aggiunte: nessun dato esistente viene modificato.
-- Vedi docs/audit/ARCHITETTURA.md.

create schema if not exists audit;

-- Registro dei prompt: nome + versione + impronta del testo. I prompt della
-- catena arrivano come impronta; quelli dell'app con il testo intero.
create table if not exists audit.prompt_versions (
  id           bigserial primary key,
  name         text not null,
  version      text not null,
  content_hash text not null,
  content      text,
  created_at   timestamptz not null default now(),
  unique (name, content_hash)
);

-- Rilasci: linee verticali nel grafico («Pipeline v8 deployed»).
create table if not exists audit.deployments (
  id          bigserial primary key,
  studio_id   uuid references studios(id) on delete cascade,
  kind        text not null check (kind in ('pipeline', 'app', 'prompt', 'model')),
  version     text not null,
  released_at timestamptz not null default now(),
  note        text,
  unique (studio_id, kind, version)
);

-- Una corsa della catena per un audio (ripetibile: attempt 1, 2, 3…).
create table if not exists audit.pipeline_runs (
  id               bigserial primary key,
  studio_id        uuid not null references studios(id) on delete cascade,
  bozza_id         uuid references referti_bozze(id) on delete set null,
  file_id          text not null,
  attempt          int  not null default 1,
  pipeline_version text,
  status           text not null check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_ms      int,
  config           jsonb not null default '{}'::jsonb,
  error_type       text,
  error_message    text,
  failed_step      text,
  created_at       timestamptz not null default now(),
  unique (studio_id, file_id, attempt)
);
create index if not exists pipeline_runs_bozza on audit.pipeline_runs (bozza_id);
create index if not exists pipeline_runs_studio_tempo on audit.pipeline_runs (studio_id, created_at);

-- L'output di una tappa: immutabile, con impronta e numero di versione nel referto.
create table if not exists audit.artifacts (
  id            bigserial primary key,
  studio_id     uuid not null references studios(id) on delete cascade,
  run_id        bigint references audit.pipeline_runs(id) on delete cascade,
  bozza_id      uuid references referti_bozze(id) on delete set null,
  version_no    int  not null,
  kind          text not null check (kind in ('audio', 'text', 'json')),
  label         text not null,
  producer_type text not null check (producer_type in ('AI', 'SYSTEM', 'SECRETARY', 'DOCTOR')),
  content_text  text,
  storage_ref   text,
  content_hash  text not null,
  bytes         int,
  words         int,
  created_at    timestamptz not null default now()
);
create index if not exists artifacts_bozza on audit.artifacts (bozza_id, version_no);
create index if not exists artifacts_run on audit.artifacts (run_id);

-- Provenienza: un artefatto può derivare da PIÙ genitori (l'arbitro da A e da B).
create table if not exists audit.artifact_parents (
  artifact_id        bigint not null references audit.artifacts(id) on delete cascade,
  parent_artifact_id bigint not null references audit.artifacts(id) on delete cascade,
  primary key (artifact_id, parent_artifact_id)
);

-- Una tappa della corsa (AI, codice o persona), con tempi, modello, prompt, esito.
create table if not exists audit.pipeline_steps (
  id                 bigserial primary key,
  run_id             bigint references audit.pipeline_runs(id) on delete cascade,
  bozza_id           uuid references referti_bozze(id) on delete set null,
  step_order         int  not null,
  step_type          text not null,
  step_name          text not null,
  producer_type      text not null check (producer_type in ('AI', 'SYSTEM', 'SECRETARY', 'DOCTOR')),
  model_provider     text,
  model_name         text,
  model_version      text,
  model_variant      text,
  prompt_version_id  bigint references audit.prompt_versions(id),
  status             text not null default 'SUCCESS' check (status in ('SUCCESS', 'FAILED', 'SKIPPED')),
  error_type         text,
  error_message      text,
  retry_count        int  not null default 0,
  started_at         timestamptz,
  completed_at       timestamptz,
  duration_ms        int,
  input_artifact_id  bigint references audit.artifacts(id),
  output_artifact_id bigint references audit.artifacts(id),
  metadata           jsonb not null default '{}'::jsonb,
  compute_cost       numeric(10,4),
  created_at         timestamptz not null default now()
);
create index if not exists pipeline_steps_run on audit.pipeline_steps (run_id, step_order);
create index if not exists pipeline_steps_bozza on audit.pipeline_steps (bozza_id);

-- Stato della revisione umana per referto e RUOLO: distingue «mai aperto»
-- da «rivisto senza modifiche».
create table if not exists audit.report_reviews (
  id           bigserial primary key,
  studio_id    uuid not null references studios(id) on delete cascade,
  bozza_id     uuid not null references referti_bozze(id) on delete cascade,
  role         text not null check (role in ('SECRETARY', 'DOCTOR')),
  status       text not null check (status in ('NOT_REVIEWED', 'IN_REVIEW', 'REVIEWED_NO_CHANGES', 'REVIEWED_WITH_CHANGES')),
  user_id      uuid references users(id) on delete set null,
  started_at   timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (bozza_id, role)
);

-- Una revisione umana confermata: diff tra l'ultimo output AI e la versione
-- della persona. Immutabile. La metrica principale usa SOLO editor_role='SECRETARY'.
create table if not exists audit.human_edits (
  id                 bigserial primary key,
  studio_id          uuid not null references studios(id) on delete cascade,
  bozza_id           uuid not null references referti_bozze(id) on delete cascade,
  run_id             bigint references audit.pipeline_runs(id) on delete set null,
  editor_role        text not null check (editor_role in ('SECRETARY', 'DOCTOR')),
  editor_user_id     uuid references users(id) on delete set null,
  from_artifact_id   bigint references audit.artifacts(id),
  to_artifact_id     bigint references audit.artifacts(id),
  edit_count         int not null,
  insertions         int not null,
  deletions          int not null,
  replacements       int not null,
  characters_changed int not null,
  words_changed      int not null,
  words_total        int not null,
  edits_per_100_words numeric(8,3) not null,
  severity_max       text,
  categories         jsonb not null default '{}'::jsonb,
  diff               jsonb not null default '[]'::jsonb,
  review_seconds     int,
  pipeline_version   text,
  prompt_version     text,
  medico             text,
  created_at         timestamptz not null default now()
);
create index if not exists human_edits_studio_tempo on audit.human_edits (studio_id, editor_role, created_at);
create index if not exists human_edits_bozza on audit.human_edits (bozza_id);

-- Immutabilità: le versioni e le revisioni non si aggiornano né si cancellano.
create or replace function audit.vieta_modifica() returns trigger language plpgsql as $$
begin
  raise exception 'audit.%: righe immutabili (nuova versione = nuova riga)', tg_table_name;
end $$;
drop trigger if exists artifacts_immutabili on audit.artifacts;
create trigger artifacts_immutabili before update or delete on audit.artifacts
  for each row execute function audit.vieta_modifica();
drop trigger if exists human_edits_immutabili on audit.human_edits;
create trigger human_edits_immutabili before update or delete on audit.human_edits
  for each row execute function audit.vieta_modifica();

-- 034: voci di dizionario dalle correzioni umane (proposte, confermate a mano)
create table if not exists referti_dizionario (
  id          bigserial primary key,
  studio_id   uuid not null references studios(id) on delete cascade,
  medico      text not null,
  da          text not null,
  a           text not null,
  stato       text not null check (stato in ('confermata', 'rifiutata')),
  occorrenze  int not null default 0,
  deciso_da   uuid references users(id) on delete set null,
  deciso_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create unique index if not exists referti_dizionario_chiave on referti_dizionario (studio_id, medico, lower(da));
-- Grafo delle informazioni e tracce delle procedure (13.9.2026).
-- Decisione: il grafo vive in Postgres, non in un motore separato
-- (Decisioni/Registro). Un FATTO è un arco «paziente → relazione → oggetto»
-- con la sua fonte (documento, referto, appuntamento, referral), la data e
-- la confidenza: le procedure lo scrivono, il bot lo attraversa. Una TRACCIA
-- è il percorso deterministico di una risposta dell'assistente: obiettivo,
-- passi con esito, fonti lette, cose mancanti, modello e tempo. Si salva la
-- traccia del codice, mai il «pensiero» del modello. Niente testo clinico nei
-- log: i dati stanno qui, sotto le stesse regole della cartella.
create table if not exists pazienti_fatti (
  id          bigserial primary key,
  studio_id   uuid not null references studios(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  -- ha_documento | ultimo_referto | terapia_riga | referral_aperta | prossimo_appuntamento |
  -- ultima_visita | esame_mancante | richiamo_scaduto | bozza_da_rivedere
  relazione   text not null,
  oggetto     text not null,
  dettaglio   jsonb not null default '{}'::jsonb,
  -- documento | referto | appuntamento | referral | procedura
  fonte_tipo  text not null,
  fonte_id    text,
  data_fatto  date,
  confidenza  numeric(4,3) not null default 1,
  procedura   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists pazienti_fatti_paziente on pazienti_fatti (studio_id, patient_id, relazione);

create table if not exists assistente_tracce (
  id                 bigserial primary key,
  studio_id          uuid not null references studios(id) on delete cascade,
  user_id            uuid references users(id) on delete set null,
  patient_id         uuid references patients(id) on delete set null,
  -- briefing_previsita | documento | domanda_libera
  procedura          text not null,
  obiettivo          text not null,
  passi              jsonb not null default '[]'::jsonb,
  fonti              jsonb not null default '[]'::jsonb,
  mancanti           jsonb not null default '[]'::jsonb,
  modello            text,
  durata_ms          int,
  risposta_caratteri int,
  created_at         timestamptz not null default now()
);
create index if not exists assistente_tracce_studio on assistente_tracce (studio_id, created_at desc);
-- Risorse dello studio (14.9.2026): sale e apparecchi, gestite dalla pagina
-- «Studio» dell'interfaccia nuova. Una tabella sola con il tipo, così un
-- domani entrano anche servizi o altro senza migrazione. Mai eliminate: si
-- disattivano (restano nell'audit e nell'agenda passata).
create table if not exists studio_risorse (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  -- sala | apparecchio
  tipo        text not null check (tipo in ('sala', 'apparecchio')),
  nome        text not null,
  descrizione text,
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_risorse_studio on studio_risorse (studio_id, tipo, attivo);
-- Colore dell'appuntamento nell'agenda MediOnline (14.9.2026): il robot lo
-- legge dal riquadro e lo manda nell'ICS (X-RF-COLORE); la piattaforma lo
-- conserva così com'è (#rrggbb) e l'interfaccia nuova lo mostra sul bordo
-- dell'appuntamento, con la legenda dei colori visti nel giorno.
alter table appointments add column if not exists colore text;
-- Posti di una sala (14.9.2026): quanti pazienti possono starci nello stesso
-- momento (1 per un ambulatorio, di più per una palestra o una sala Holter).
-- L'agenda per sala dell'interfaccia nuova segnala «più pazienti dei posti»
-- quando gli appuntamenti nello stesso luogo si sovrappongono oltre questo
-- numero. L'agenda resta in sola lettura dal robot MediOnline: i posti servono
-- a vedere, non a prenotare.
alter table studio_risorse add column if not exists posti int not null default 1 check (posti >= 1 and posti <= 99);
-- Moduli dello studio in versione digitale (14.9.2026): i moduli sono definiti
-- nella pagina wiki «Piattaforma/Moduli» (letta a runtime); qui stanno le
-- COMPILAZIONI, collegate al paziente quando c'è. Le risposte (jsonb) sono
-- dati clinici: mai in log, URL o notifiche. Mai eliminate: restano nel
-- dossier. Ogni apertura e ogni salvataggio lasciano una riga nel registro.
create table if not exists moduli_compilazioni (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  modulo       text not null,                 -- id del modulo nella wiki (es. m-001-anamnesi-pre-visita)
  codice       text not null,                 -- «M 001»
  titolo       text not null,                 -- titolo del modulo al momento della compilazione
  patient_id   uuid references patients(id),
  compilato_da uuid references users(id),
  dati         jsonb not null default '{}'::jsonb,
  completo     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists moduli_compilazioni_studio on moduli_compilazioni (studio_id, created_at desc);
create index if not exists moduli_compilazioni_paziente on moduli_compilazioni (patient_id);

create table if not exists moduli_accessi (
  id              uuid primary key default gen_random_uuid(),
  compilazione_id uuid not null references moduli_compilazioni(id) on delete cascade,
  studio_id       uuid not null,
  user_id         uuid,
  azione          text not null,              -- creazione | modifica | lettura | stampa
  at              timestamptz not null default now()
);
create index if not exists moduli_accessi_compilazione on moduli_accessi (compilazione_id, at);
-- Prestazioni da fatturare (14.9.2026): la piattaforma NON fattura (decisione
-- del 14.9.2026, vedi Decisioni/Registro); esporta le prestazioni erogate del
-- mese in un CSV per il gestionale di fatturazione dello studio e segna che
-- cosa è già uscito, così la segreteria vede solo le nuove. Nel file: dati
-- amministrativi (paziente, data, medico, prestazione), mai testo clinico.
alter table appointments add column if not exists fatturazione_esportato_at timestamptz;
create index if not exists appointments_fatturazione_idx on appointments (studio_id, fatturazione_esportato_at) where fatturazione_esportato_at is null;

create table if not exists fatturazione_esportazioni (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  dal        date not null,
  al         date not null,
  righe      int not null,
  user_id    uuid references users(id),
  impronta   text,                          -- sha256 corto del file, per riconoscerlo
  created_at timestamptz not null default now()
);
create index if not exists fatturazione_esportazioni_studio on fatturazione_esportazioni (studio_id, created_at desc);
-- Anagrafica completa del paziente (14.9.2026): sesso, indirizzo, e-mail, AVS,
-- numero assicurato, indicazione clinica e percorso (id della pagina wiki
-- Medici/Percorsi). Servono alla scheda e al CSV di fatturazione: senza AVS e
-- numero assicurato il gestionale non fattura. `assicurazione` resta la cassa.
alter table patients
  add column if not exists sesso        text,
  add column if not exists via          text,
  add column if not exists npa          text,
  add column if not exists localita     text,
  add column if not exists email        text,
  add column if not exists avs          text,
  add column if not exists n_assicurato text,
  add column if not exists indicazione  text,
  add column if not exists percorso_id  text;
-- Indirizzo dello studio (carta intestata, CSV) e moduli nascosti per studio
-- (voci della barra dell'interfaccia nuova che questo studio non usa).
alter table studios add column if not exists indirizzo text;
alter table studios add column if not exists moduli_nascosti text[] not null default '{}';
-- Catalogo delle prestazioni dello studio (14.9.2026, punto 2 del piano
-- CardioOS): nome, tipo (visita | esame | procedura), durata standard, sala
-- predefinita, parole chiave con cui si riconosce nel motivo dell'agenda
-- MediOnline. Aggancia i percorsi (le prestazioni dei percorsi sono voci del
-- catalogo), l'agenda per sala e l'esportazione. Mai eliminate: si disattivano.
create table if not exists prestazioni_catalogo (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  nome          text not null,
  tipo          text not null default 'esame' check (tipo in ('visita', 'esame', 'procedura')),
  durata_min    int not null default 30 check (durata_min between 5 and 480),
  sala          text,
  parole_chiave text[] not null default '{}',
  attivo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists prestazioni_catalogo_studio on prestazioni_catalogo (studio_id, attivo, nome);
-- Punti 4 e 5 del piano CardioOS (14.9.2026).
-- Chiamate di preparazione: chi ha chiamato il paziente prima di una visita o
-- di un esame, con quale esito. La lista «Da chiamare» in Home nasce dagli
-- appuntamenti dei prossimi 7 giorni senza una chiamata registrata. La nota è
-- breve e organizzativa (mai clinica).
create table if not exists preparazione_chiamate (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  referral_id    uuid references referrals(id) on delete set null,
  patient_id     uuid references patients(id) on delete set null,
  user_id        uuid references users(id),
  esito          text not null check (esito in ('raggiunto', 'segreteria_telefonica', 'non_risponde', 'da_richiamare', 'non_serve')),
  nota           text,
  created_at     timestamptz not null default now()
);
create index if not exists preparazione_chiamate_studio on preparazione_chiamate (studio_id, created_at desc);
create index if not exists preparazione_chiamate_appuntamento on preparazione_chiamate (appointment_id);

-- Medici dell'agenda: GLN e RCC (li chiede la fattura: medico erogante) e un
-- colore per l'agenda.
alter table providers
  add column if not exists gln    text,
  add column if not exists rcc    text,
  add column if not exists colore text;

-- Personale senza accesso alla piattaforma (aiuto medico, segreteria a ore):
-- solo nome, ruolo, percentuale e colore. Niente contratti né stipendi.
create table if not exists studio_personale (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  nome        text not null,
  ruolo       text not null default 'aiuto medico',
  percentuale int check (percentuale between 0 and 100),
  colore      text,
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_personale_studio on studio_personale (studio_id, attivo, nome);
-- «Suggerisci una modifica» (14.9.2026, punto 7 del piano CardioOS): chi usa
-- l'interfaccia nuova lascia una richiesta con la pagina da cui la scrive; lo
-- sviluppatore riceve un avviso SENZA il testo (che resta nella piattaforma) e
-- l'amministratore vede lo stato. Niente nomi di pazienti né dati clinici.
create table if not exists suggerimenti (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  user_id    uuid references users(id),
  pagina     text,
  testo      text not null,
  stato      text not null default 'aperto' check (stato in ('aperto', 'fatto', 'no')),
  risposta   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suggerimenti_studio on suggerimenti (studio_id, stato, created_at desc);
-- Posizione tariffaria della prestazione (14.9.2026): lo studio fattura con la
-- Cassa dei Medici (MediOnline); nel catalogo ogni prestazione può portare la
-- posizione TARDOC (o il forfait) che la segreteria registra là, così il CSV
-- di controllo la propone accanto alla prestazione. Testo libero: la
-- piattaforma non ha il catalogo TARDOC e non fattura.
alter table prestazioni_catalogo add column if not exists codice_tariffa text;

-- Stato dell'appuntamento come lo segna MediOnline con l'icona in alto a destra
-- del riquadro (fissato, arrivato, in_corso, da_fatturare, trattato, fatturato,
-- scusato, annullato, bloccato). Lo legge il robot dell'agenda in sola lettura e
-- arriva nell'ICS come X-RF-STATO (migrazione 046).
alter table appointments add column if not exists stato_medionline text;
alter table appointments add column if not exists stato_visto_at timestamptz;
create index if not exists appointments_stato_idx
  on appointments (studio_id, stato_medionline, starts_at desc);
