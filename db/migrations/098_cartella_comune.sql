-- 098 — Le lettere della cartella comune (22.10.2026, richiesta dello studio: «sincronizzare la cartella comune con
-- ReferralFlow, le lettere vanno nei pazienti, con un controllo giornaliero di cosa è stato aggiunto»). Sulla cartella
-- comune ogni medico ha la sua cartella di rapporti e dentro una cartella per paziente. Si abbina la CARTELLA (nome
-- della cartella e data di nascita trovata nelle lettere, una persona sola); abbinata, ogni sua lettera, anche quelle
-- che arriveranno, va fra i documenti del paziente. La cartella comune si legge e basta: mai spostare, rinominare,
-- cancellare. `date_lette`: le date scritte nelle lettere, per riabbinare senza rileggere quando nasce un paziente.
create table if not exists comune_cartelle (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id) on delete cascade,
  percorso        text not null,
  medico          text not null,
  nome_letto      text not null,
  stato           text not null default 'in_attesa' check (stato in ('in_attesa', 'abbinata', 'scartata', 'non_paziente')),
  motivo          text,
  patient_id      uuid references patients(id) on delete set null,
  date_lette      text[] not null default '{}',
  nascita_proposta date,
  lettere         int not null default 0,
  vista_il        timestamptz not null default now(),
  deciso_da       uuid references users(id) on delete set null,
  deciso_il       timestamptz,
  unique (studio_id, percorso)
);
create index if not exists comune_cartelle_stato on comune_cartelle (studio_id, stato);
-- Un file per riga: com'era quando è stato letto (dimensione e ora di modifica) e che fine ha fatto.
create table if not exists comune_file (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  cartella_id   uuid not null references comune_cartelle(id) on delete cascade,
  percorso      text not null,
  dimensione    bigint not null,
  modificato    timestamptz not null,
  sha256        text,
  stato         text not null check (stato in ('caricato', 'doppione', 'non_letto', 'in_attesa')),
  motivo        text,
  documento_id  uuid references patient_documents(id) on delete set null,
  data_lettera  date,
  quando        timestamptz not null default now(),
  unique (studio_id, percorso)
);
create index if not exists comune_file_cartella on comune_file (cartella_id);
create index if not exists comune_file_quando on comune_file (studio_id, quando desc);
-- I giri: quando, quanto, e se è rimasto lavoro (la prima volta sono migliaia di lettere, a lotti).
create table if not exists comune_giri (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  iniziato    timestamptz not null default now(),
  finito      timestamptz,
  cartelle    int not null default 0,
  nuovi       int not null default 0,
  caricati    int not null default 0,
  doppioni    int not null default 0,
  in_attesa   int not null default 0,
  non_letti   int not null default 0,
  abbinate    int not null default 0,
  sciolte     int not null default 0,   -- lettere fuori da una cartella di paziente (per giorno, per anno): non caricate
  restano     boolean not null default false,
  errore      text
);
create index if not exists comune_giri_quando on comune_giri (studio_id, iniziato desc);
