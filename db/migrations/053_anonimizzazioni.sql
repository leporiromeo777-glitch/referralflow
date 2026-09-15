-- Registro delle anonimizzazioni (15.9.2026).
--
-- Qui NON entra il testo, e nemmeno il nome del file: sarebbero dati clinici e
-- personali a riposo, e la pagina esiste proprio per non farli uscire. Entra
-- quel che serve a sapere che cosa è stato fatto e da chi — origine, quanto
-- lungo era, quanti segnaposto per tipo, quale modello, quanto ci ha messo.
-- È una traccia di attività, non una copia dei documenti.
create table if not exists anonimizzazioni (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  user_id       uuid references users(id),
  origine       text not null,             -- 'testo' | 'pdf' | 'docx' | 'file'
  caratteri     integer not null,
  sostituzioni  integer not null,
  per_tipo      jsonb not null default '{}'::jsonb,
  modello       text,
  ms            integer,
  created_at    timestamptz not null default now()
);

create index if not exists anonimizzazioni_studio_idx on anonimizzazioni (studio_id, created_at desc);
