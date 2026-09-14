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
