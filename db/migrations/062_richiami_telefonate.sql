-- Le telefonate per riempire i buchi in agenda (16.9.2026).
-- Il sistema propone, una persona chiama: qui resta scritto che cosa è stato
-- proposto, chi ha chiamato e com'è andata. Non prenota niente: l'agenda si
-- scrive dove si scrive, questa è la memoria della segreteria.
create table if not exists richiami_telefonate (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  patient_id    uuid references patients(id) on delete set null,
  origine       text not null,                 -- 'richiamo' | 'da_prenotare' | 'disdetta'
  origine_id    uuid,                           -- la referral o l'appuntamento da cui nasce
  buco_giorno   date,
  buco_dalle    integer,                        -- minuti dalla mezzanotte
  buco_medico   text,
  esito         text not null,                  -- 'chiamato' | 'fissato' | 'non risponde' | 'rifiutato'
  nota          text,
  user_id       uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists richiami_telefonate_studio_idx on richiami_telefonate (studio_id, created_at desc);
create index if not exists richiami_telefonate_origine_idx on richiami_telefonate (studio_id, origine, origine_id);
