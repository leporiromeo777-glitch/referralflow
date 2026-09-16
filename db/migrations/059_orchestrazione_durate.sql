-- Le durate osservate e le spiegazioni (16.9.2026, §9 e §13).
--
-- Niente di clinico: prestazione, medico, ora, e due flag strutturali. Le
-- mediane si ricalcolano di notte e si vedono; `durate_fissate` è la parola
-- dello studio che vince sulla misura. Nessun addestramento automatico.
create table if not exists durate_osservate (
  id               bigserial primary key,
  studio_id        uuid not null references studios(id) on delete cascade,
  prestazione      text not null,
  medico           text not null,
  giorno           date not null,
  ora              smallint not null,
  prima_visita     boolean not null default false,
  mobilita_ridotta boolean not null default false,
  minuti           int not null check (minuti > 0 and minuti < 600)
);
create index if not exists durate_osservate_chiave on durate_osservate (studio_id, prestazione, medico);

create table if not exists durate_fissate (
  studio_id    uuid not null references studios(id) on delete cascade,
  prestazione  text not null,
  medico       text not null default '',     -- '' = per tutti i medici
  minuti       int not null check (minuti > 0),
  user_id      uuid,
  at           timestamptz not null default now(),
  primary key (studio_id, prestazione, medico)
);

create table if not exists orchestrazione_spiegazioni (
  id              bigserial primary key,
  studio_id       uuid not null references studios(id) on delete cascade,
  giorno          date not null,
  piano_id        uuid,
  appointment_id  uuid,
  livello         text not null default 'mappa',   -- 'silenzio' | 'mappa' | 'accoglienza' | 'segreteria'
  perche          jsonb not null default '{}'::jsonb,
  testo           text not null,
  scritto_da      text not null default 'codice',  -- 'codice' | modello
  at              timestamptz not null default now()
);
create index if not exists orchestrazione_spiegazioni_giorno on orchestrazione_spiegazioni (studio_id, giorno, at desc);
