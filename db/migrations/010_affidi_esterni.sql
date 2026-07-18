-- Fase 10: affidi a studi esterni (non ancora sulla piattaforma).
-- Rubrica per studio + invio con link sicuro: lo studio esterno riceve una
-- email neutra, apre il link (token con scadenza) e risponde senza registrarsi.

begin;

-- Rubrica: i contatti esterni di ogni studio della piattaforma.
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

-- Affido a uno studio esterno. Il paziente vive qui (non nella coda di nessuno
-- studio della piattaforma); lo stato è deciso dallo studio esterno via link.
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
  created_at         timestamptz not null default now()
);

create index on external_referrals (studio_id, created_at);

-- Allegati dell'affido esterno (ECG, lettera): scaricabili solo via token.
create table external_attachments (
  id                   uuid primary key default gen_random_uuid(),
  external_referral_id uuid not null references external_referrals(id) on delete cascade,
  filename             text not null,
  storage_key          text not null,
  uploaded_at          timestamptz not null default now()
);

create index on external_attachments (external_referral_id);

commit;
