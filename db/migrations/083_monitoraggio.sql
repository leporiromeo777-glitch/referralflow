-- Monitoraggio remoto multiparametrico (6.10.2026) — modulo DIMOSTRATIVO.
-- Ogni tabella porta `ambiente` ('demo' | 'reale') e le chiavi esterne lo
-- comprendono: una riga demo può legarsi solo a righe demo. Un paziente demo
-- NON ha una cartella (patient_id nullo, nome fittizio suo); uno reale ha
-- solo la cartella. Così un dato sintetico non può finire in una cartella vera.
create table if not exists mon_config (
  studio_id uuid not null references studios(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  attivo boolean not null default true,
  conservazione_misure_ore integer not null default 24,
  conservazione_tracce_min integer not null default 60,
  stato_simulatore jsonb not null default '{}'::jsonb,
  ultimo_giro timestamptz,
  ultimo_errore text,
  primary key (studio_id, ambiente)
);

create table if not exists mon_pazienti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  patient_id uuid references patients(id) on delete cascade,
  codice text not null,
  nome text,
  medico text,
  medico_id uuid references users(id) on delete set null,
  programma text not null default 'attivo' check (programma in ('attivo', 'in_pausa', 'terminato')),
  iniziato_il timestamptz not null default now(),
  terminato_il timestamptz,
  profilo jsonb not null default '{}'::jsonb,
  -- l'ultima misura acquisita e l'ultima ricevuta: le tiene aggiornate l'archiviazione
  ultimo_dato timestamptz,
  ultima_ricezione timestamptz,
  unique (id, ambiente),
  unique (studio_id, ambiente, codice),
  check ((ambiente = 'demo' and patient_id is null and nome is not null) or (ambiente = 'reale' and patient_id is not null and nome is null))
);

create table if not exists mon_dispositivi (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  adattatore text not null,
  tipo text not null,
  modello text not null,
  seriale text not null,
  capacita jsonb not null default '[]'::jsonb,
  connesso boolean not null default false,
  ultimo_contatto timestamptz,
  batteria smallint,
  sensore_applicato boolean,
  errore text,
  unique (id, ambiente),
  unique (studio_id, ambiente, adattatore, seriale)
);

-- Lo storico degli abbinamenti: un dispositivo riassegnato non porta con sé i dati di prima.
create table if not exists mon_abbinamenti (
  id uuid primary key default gen_random_uuid(),
  ambiente text not null check (ambiente in ('demo', 'reale')),
  paziente_id uuid not null,
  dispositivo_id uuid not null,
  dal timestamptz not null default now(),
  al timestamptz,
  abbinato_da uuid references users(id) on delete set null,
  verificato boolean not null default false,
  nota text,
  foreign key (paziente_id, ambiente) references mon_pazienti (id, ambiente) on delete cascade,
  foreign key (dispositivo_id, ambiente) references mon_dispositivi (id, ambiente) on delete cascade,
  check (al is null or al >= dal)
);
create unique index if not exists mon_abbinamenti_aperto on mon_abbinamenti (dispositivo_id) where al is null;
create index if not exists mon_abbinamenti_paziente on mon_abbinamenti (paziente_id);

-- Valori numerici e categorie, periodici. `acquisita_il` è l'orario della
-- misura sul dispositivo, `ricevuta_il` quello d'arrivo qui: non sono la stessa cosa.
create table if not exists mon_misure (
  id bigserial primary key,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  paziente_id uuid not null,
  dispositivo_id uuid not null,
  parametro text not null,
  valore double precision,
  valore_testo text,
  unita text not null default '',
  acquisita_il timestamptz not null,
  ricevuta_il timestamptz not null default now(),
  qualita smallint,
  provenienza text not null check (provenienza in ('misurato', 'elaborato', 'simulato')),
  fonte text,
  contesto jsonb,
  recuperata boolean not null default false,
  foreign key (paziente_id, ambiente) references mon_pazienti (id, ambiente) on delete cascade,
  foreign key (dispositivo_id, ambiente) references mon_dispositivi (id, ambiente) on delete cascade,
  unique (dispositivo_id, parametro, acquisita_il),
  check (ambiente <> 'demo' or provenienza = 'simulato')
);
create index if not exists mon_misure_paziente on mon_misure (paziente_id, parametro, acquisita_il desc);
create index if not exists mon_misure_tempo on mon_misure (ambiente, acquisita_il);

-- Segnali ad alta frequenza (ECG), a pezzi: interi a 16 bit, little endian.
create table if not exists mon_tracce (
  id bigserial primary key,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  paziente_id uuid not null,
  dispositivo_id uuid not null,
  derivazione text not null,
  hz integer not null,
  mv_per_unita real not null,
  inizio timestamptz not null,
  n integer not null,
  campioni bytea not null,
  qualita smallint,
  provenienza text not null check (provenienza in ('misurato', 'elaborato', 'simulato')),
  foreign key (paziente_id, ambiente) references mon_pazienti (id, ambiente) on delete cascade,
  foreign key (dispositivo_id, ambiente) references mon_dispositivi (id, ambiente) on delete cascade,
  unique (dispositivo_id, derivazione, inizio)
);
create index if not exists mon_tracce_paziente on mon_tracce (paziente_id, inizio desc);

-- Le regole, a versioni: una modifica è una versione nuova, la vecchia resta.
create table if not exists mon_regole (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  chiave text not null,
  versione integer not null,
  definizione jsonb not null,
  attiva boolean not null default true,
  illustrativa boolean not null default false,
  approvata_da uuid references users(id) on delete set null,
  approvata_il timestamptz,
  creata_da uuid references users(id) on delete set null,
  creata_il timestamptz not null default now(),
  unique (studio_id, ambiente, chiave, versione),
  -- Una regola per dati reali vale solo se approvata; una illustrativa solo in demo.
  check (ambiente = 'demo' or (not illustrativa and (not attiva or approvata_da is not null)))
);

create table if not exists mon_avvisi (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  paziente_id uuid not null,
  categoria text not null check (categoria in ('parametro', 'tecnico')),
  livello smallint check (livello in (1, 2)),
  codice text not null,
  regola_id uuid not null references mon_regole(id),
  regola_chiave text not null,
  regola_versione integer not null,
  spiegazione text not null,
  valori jsonb not null default '{}'::jsonb,
  segmento_da timestamptz,
  segmento_a timestamptz,
  misurato_il timestamptz,
  ricevuto_il timestamptz,
  generato_il timestamptz not null default now(),
  stato text not null default 'aperto' check (stato in ('aperto', 'in_carico', 'chiuso')),
  responsabile uuid references users(id) on delete set null,
  rientrato_il timestamptz,
  chiuso_il timestamptz,
  ultima_notifica timestamptz,
  episodi integer not null default 1,
  foreign key (paziente_id, ambiente) references mon_pazienti (id, ambiente) on delete cascade,
  check ((categoria = 'parametro') = (livello is not null))
);
-- Un solo avviso non chiuso per paziente e regola: è la deduplicazione.
create unique index if not exists mon_avvisi_uno on mon_avvisi (paziente_id, regola_chiave) where stato <> 'chiuso';
create index if not exists mon_avvisi_studio on mon_avvisi (studio_id, ambiente, generato_il desc);

create table if not exists mon_azioni (
  id bigserial primary key,
  avviso_id uuid not null references mon_avvisi(id) on delete cascade,
  autore uuid references users(id) on delete set null,
  quando timestamptz not null default now(),
  azione text not null,
  motivazione text
);
create index if not exists mon_azioni_avviso on mon_azioni (avviso_id, quando);

create table if not exists mon_notifiche (
  id bigserial primary key,
  avviso_id uuid not null references mon_avvisi(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  canale text not null check (canale in ('interna', 'esterna')),
  stato text not null check (stato in ('consegnata', 'non_consegnata', 'non_inviata_demo')),
  motivo text,
  quando timestamptz not null default now(),
  letta_il timestamptz
);
create index if not exists mon_notifiche_avviso on mon_notifiche (avviso_id);

create table if not exists mon_silenzi (
  id uuid primary key default gen_random_uuid(),
  ambiente text not null check (ambiente in ('demo', 'reale')),
  paziente_id uuid not null,
  fino_a timestamptz not null,
  autore uuid references users(id) on delete set null,
  creato_il timestamptz not null default now(),
  foreign key (paziente_id, ambiente) references mon_pazienti (id, ambiente) on delete cascade
);

-- Registro: soglie cambiate, dispositivi abbinati e staccati, simulatore.
create table if not exists mon_registro (
  id bigserial primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  ambiente text not null check (ambiente in ('demo', 'reale')),
  quando timestamptz not null default now(),
  autore uuid references users(id) on delete set null,
  azione text not null,
  oggetto text,
  dettaglio jsonb not null default '{}'::jsonb
);
create index if not exists mon_registro_studio on mon_registro (studio_id, ambiente, quando desc);
