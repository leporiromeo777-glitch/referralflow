-- Lo stato operativo e gli eventi (16.9.2026, §3 e §7).
--
-- `orchestrazione_stato` è lo stato di adesso di ogni appuntamento del
-- giorno: si aggiorna. `orchestrazione_eventi` è solo inserimenti, come le
-- tabelle audit: quel che è successo non si riscrive. `orchestrazione_comandi`
-- sono i vincoli che una persona ha imposto, con autore e scadenza.
create table if not exists orchestrazione_stato (
  appointment_id  uuid primary key,
  studio_id       uuid not null references studios(id) on delete cascade,
  giorno          date not null,
  stato           text not null default 'atteso',
  sala            text,
  arrivo          int,            -- minuti dalla mezzanotte
  chiamato_a      int,
  inizio_reale    int,
  fine_reale      int,
  rigidita        smallint not null default 0,
  updated_at      timestamptz not null default now()
);
create index if not exists orchestrazione_stato_giorno on orchestrazione_stato (studio_id, giorno);

create table if not exists orchestrazione_eventi (
  id              bigserial primary key,
  studio_id       uuid not null references studios(id) on delete cascade,
  giorno          date not null,
  tipo            text not null,
  appointment_id  uuid,
  sala            text,
  medico          text,
  minuti          int,
  testo           text,           -- il testo libero della segreteria, MAI un dato clinico
  fonte           text not null default 'ui',   -- 'ui' | 'tablet' | 'stanza' | 'dettato' | 'robot' | 'derivato' | 'cleo'
  user_id         uuid,
  at              timestamptz not null default now()
);
create index if not exists orchestrazione_eventi_giorno on orchestrazione_eventi (studio_id, giorno, at);

create table if not exists orchestrazione_comandi (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id) on delete cascade,
  giorno          date not null,
  comando         text not null,
  parametri       jsonb not null default '{}'::jsonb,
  user_id         uuid,
  valido_da       timestamptz not null default now(),
  valido_a        timestamptz,
  ritirato_at     timestamptz
);
create index if not exists orchestrazione_comandi_giorno on orchestrazione_comandi (studio_id, giorno);

-- Le proposte del modello grande, da confermare (§10.2): mai applicate da sole.
create table if not exists orchestrazione_proposte (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id) on delete cascade,
  giorno          date not null,
  versione_stato  int not null,
  strategia       jsonb not null,
  piano           jsonb not null,
  perche          text not null default '',
  modello         text,
  stato           text not null default 'aperta',   -- aperta | accettata | ignorata | scaduta
  decisa_da       uuid,
  decisa_at       timestamptz,
  created_at      timestamptz not null default now()
);
