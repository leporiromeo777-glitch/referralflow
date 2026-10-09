-- 089 — Dividi cartella: sottocartelle e analisi in sottofondo (9.10.2026).
-- Una cartella cartacea scansionata porta fogli separatori col codice a barre: ogni separatore apre una
-- sezione (01_Rapporti, 02_Rapporti esterni…), e i documenti nati dalla divisione la portano con sé.
alter table patient_documents add column if not exists cartella text;
create index if not exists patient_documents_cartella on patient_documents (patient_id, cartella) where cartella is not null;

-- L'analisi di una cartella completa (separatori + modello locale, pagina per pagina) dura minuti: gira in
-- sottofondo, una alla volta e a catena ferma, e la pagina la aspetta. L'esito (dove sono i separatori e,
-- per pagina, «comincia un documento / data / che documento è») sta qui, nel database dello studio come i
-- documenti stessi; `storage_key` dice su quale file è stata fatta (l'OCR lo sostituisce: se cambia, si rifà).
create table if not exists dividi_analisi (
  documento_id uuid primary key references patient_documents(id) on delete cascade,
  studio_id uuid not null references studios(id) on delete cascade,
  stato text not null default 'da_fare' check (stato in ('da_fare', 'in_corso', 'fatta', 'fallita')),
  storage_key text not null,
  pagine int,
  fatte int not null default 0,
  versione int not null default 0,
  esito jsonb not null default '{}'::jsonb,
  modello text,
  ms int,
  creato_at timestamptz not null default now(),
  finito_at timestamptz
);
create index if not exists dividi_analisi_stato on dividi_analisi (stato) where stato <> 'fatta';
