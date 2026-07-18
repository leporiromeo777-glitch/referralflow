-- Fase 3: ponte con l'agenda della Cassa dei Medici via feed iCal.
-- Programma del giorno per medico interno (fornitore di prestazioni).

-- Medici interni / fornitori di prestazioni dello studio.
create table if not exists providers (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  aliases    text[] not null default '{}',   -- pattern che identificano il medico nel calendario unico
  attivo     boolean not null default true,
  user_id    uuid references users(id),        -- per il futuro login del ruolo 'medico'
  created_at timestamptz not null default now()
);

-- Feed iCal configurati (URL di sottoscrizione dell'agenda).
create table if not exists agenda_feeds (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  url            text not null,                 -- segreto: URL tokenizzato dell'agenda
  match_field    text not null default 'summary', -- summary | description | location | organizer
  attivo         boolean not null default true,
  last_synced_at timestamptz,
  last_status    text,
  created_at     timestamptz not null default now()
);

-- Appuntamenti importati dal feed.
create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  feed_id       uuid references agenda_feeds(id) on delete cascade,
  provider_id   uuid references providers(id),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  titolo        text,                            -- SUMMARY grezzo
  paziente_nome text,                            -- best-effort dal titolo
  motivo        text,
  luogo         text,
  external_uid  text not null,                   -- UID dell'evento iCal
  referral_id   uuid references referrals(id),
  imported_at   timestamptz not null default now(),
  unique (feed_id, external_uid)
);

create index if not exists appointments_starts_at_idx on appointments (starts_at);
create index if not exists appointments_provider_starts_idx on appointments (provider_id, starts_at);
