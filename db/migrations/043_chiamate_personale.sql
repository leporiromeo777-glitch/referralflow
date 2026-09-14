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
