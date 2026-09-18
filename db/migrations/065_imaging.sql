-- Immagini diagnostiche dentro la piattaforma (18.9.2026).
--
-- Gli esami per immagini erano l'unica cosa della cartella che ReferralFlow
-- non sapeva tenere: arrivavano su CD, su chiavette, dentro visualizzatori
-- che si aprono solo sul PC dove sono installati. Qui diventano una parte
-- della cartella come le altre — stesso studio, stesso paziente, stessi
-- ruoli, stesso registro di chi ha guardato cosa.
--
-- Il modello è quello del DICOM, e non si semplifica: un ESAME (studio) ha
-- più SERIE, ogni serie ha più IMMAGINI, e un'immagine può avere più
-- fotogrammi (un'ecografia in movimento è un file solo). I file originali
-- restano su disco, mai riscritti: la piattaforma tiene l'indice.

create table if not exists imaging_esami (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  -- Il paziente si aggancia dopo, e può restare vuoto: un esame che arriva
  -- da fuori porta il nome scritto dall'apparecchio, non il nostro id.
  patient_id uuid references patients(id) on delete set null,
  study_uid text not null,
  accession text,
  data_esame date,
  ora_esame text,
  descrizione text,
  modalita text not null default '',
  istituto text,
  inviante text,
  paziente_dicom text,
  paziente_nascita date,
  paziente_id_dicom text,
  -- da_verificare: nessuno l'ha ancora guardato né abbinato
  stato text not null default 'da_verificare' check (stato in ('da_verificare', 'disponibile', 'nascosto')),
  n_serie int not null default 0,
  n_immagini int not null default 0,
  byte bigint not null default 0,
  origine text not null default 'import' check (origine in ('import', 'rete', 'portale')),
  caricato_da uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, study_uid)
);
create index if not exists imaging_esami_studio on imaging_esami (studio_id, data_esame desc nulls last);
create index if not exists imaging_esami_paziente on imaging_esami (patient_id) where patient_id is not null;

create table if not exists imaging_serie (
  id uuid primary key default gen_random_uuid(),
  esame_id uuid not null references imaging_esami(id) on delete cascade,
  serie_uid text not null,
  modalita text,
  descrizione text,
  numero int,
  parte_corpo text,
  n_immagini int not null default 0,
  unique (esame_id, serie_uid)
);
create index if not exists imaging_serie_esame on imaging_serie (esame_id, numero nulls last);

create table if not exists imaging_immagini (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null references imaging_serie(id) on delete cascade,
  sop_uid text not null,
  numero int,
  frame int not null default 1,
  righe int,
  colonne int,
  ww double precision,
  wl double precision,
  -- Non tutto il DICOM è un'immagine: referti strutturati, PDF incapsulati,
  -- modelli 3D. Si archiviano lo stesso, ma non si disegnano.
  immagine boolean not null default true,
  sop_class text,
  storage_key text not null,
  byte bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (serie_id, sop_uid)
);
create index if not exists imaging_immagini_serie on imaging_immagini (serie_id, numero nulls last);

-- Chi ha aperto quale esame, e quando. Le immagini sono dati sanitari: senza
-- questo registro non si può rispondere alla domanda «chi l'ha visto?».
create table if not exists imaging_accessi (
  id bigserial primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  esame_id uuid references imaging_esami(id) on delete set null,
  user_id uuid references users(id),
  azione text not null,
  created_at timestamptz not null default now()
);
create index if not exists imaging_accessi_esame on imaging_accessi (esame_id, created_at desc);
