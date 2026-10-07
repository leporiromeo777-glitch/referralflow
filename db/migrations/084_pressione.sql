-- Pressione (7.10.2026, docs/wiki/Piattaforma/Pressione.md): il profilo
-- pressorio delle 24 ore di un paziente, la terapia che prendeva in quel
-- momento con gli orari, e la tabella dei farmaci (quattro numeri per principio
-- attivo, validi solo dopo la conferma di un medico). Gli orari delle misure
-- sono quelli dell'OROLOGIO DEL PAZIENTE: `timestamp` senza fuso, apposta.
create table if not exists pa_farmaci (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  principio text not null,
  classe text not null,
  inizio_h numeric not null,
  picco_h numeric not null,
  durata_h numeric not null,
  emivita_h numeric not null,
  orario_rilevante boolean not null default true,
  nota text,
  fonte text,
  confermato_da uuid references users(id) on delete set null,
  confermato_il timestamptz,
  aggiornato_il timestamptz not null default now(),
  unique (studio_id, principio)
);

create table if not exists pa_profili (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  inizio timestamp not null,
  fine timestamp not null,
  apparecchio text,
  origine text not null default 'file' check (origine in ('file', 'manuale')),
  sveglia text not null default '07:00',
  sonno text not null default '22:00',
  soglie jsonb,
  nota text,
  caricato_da uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (studio_id, patient_id, inizio)
);
create index if not exists pa_profili_paziente on pa_profili (studio_id, patient_id, inizio desc);

create table if not exists pa_misure (
  profilo_id uuid not null references pa_profili(id) on delete cascade,
  quando timestamp not null,
  sistolica smallint not null,
  diastolica smallint not null,
  frequenza smallint,
  valida boolean not null default true,
  primary key (profilo_id, quando)
);

-- La terapia COM'ERA al momento del profilo: nome come lo scrive lo studio,
-- orari delle prese, principi attivi riconosciuti.
create table if not exists pa_terapie (
  id uuid primary key default gen_random_uuid(),
  profilo_id uuid not null references pa_profili(id) on delete cascade,
  nome text not null,
  dose text,
  orari text[] not null default '{}',
  principi text[] not null default '{}',
  ordine integer not null default 0
);
create index if not exists pa_terapie_profilo on pa_terapie (profilo_id, ordine);

-- Le proposte di orario (spente finché il dispositivo interno non è validato:
-- PRESSIONE_PROPOSTE=1). Si conserva la proposta com'era quando è stata
-- mostrata, con la versione delle regole, e che cosa ne ha fatto il medico.
create table if not exists pa_proposte (
  id uuid primary key default gen_random_uuid(),
  profilo_id uuid not null references pa_profili(id) on delete cascade,
  versione text not null,
  contenuto jsonb not null,
  stato text not null default 'aperta' check (stato in ('aperta', 'accettata', 'modificata', 'scartata')),
  orario_scelto text,
  nota text,
  creata_il timestamptz not null default now(),
  decisa_da uuid references users(id) on delete set null,
  decisa_il timestamptz
);
create index if not exists pa_proposte_profilo on pa_proposte (profilo_id, creata_il desc);

-- Chi ha fatto che cosa: mai valori di pressione né nomi, solo l'azione.
create table if not exists pa_registro (
  id bigserial primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  profilo_id uuid,
  user_id uuid,
  azione text not null,
  dettaglio jsonb not null default '{}'::jsonb,
  quando timestamptz not null default now()
);
create index if not exists pa_registro_studio on pa_registro (studio_id, quando desc);
