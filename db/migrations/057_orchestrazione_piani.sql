-- I piani della giornata, versionati (16.9.2026, §2 e §4).
--
-- Una riga per versione: la 0 è la baseline del mattino e resta per sempre,
-- le altre nascono a ogni ripianificazione che cambia qualcosa. Una sola è
-- «corrente»; «comunicata_at» segna la versione contro cui si misurano le
-- modifiche (la stabilità è un termine dell'obiettivo, §6).
create table if not exists piani_giornata (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id) on delete cascade,
  giorno         date not null,
  versione       int  not null,
  motivo         text not null default '',       -- 'mattino' | 'evento:<tipo>' | 'comando' | 'proposta'
  corrente       boolean not null default true,
  comunicata_at  timestamptz,
  costo          jsonb not null default '{}'::jsonb,
  motore         text not null default 'riparatore',   -- 'cp-sat' | 'riparatore'
  ms             int,
  created_at     timestamptz not null default now(),
  unique (studio_id, giorno, versione)
);
create index if not exists piani_giornata_corrente on piani_giornata (studio_id, giorno) where corrente;

-- Una riga per appuntamento per versione del piano. Le tre ore non si
-- confondono: teorica (l'agenda, non cambia mai), ingresso (quando il
-- paziente entra in stanza), inizio (quando il medico ci arriva).
create table if not exists piano_visite (
  id                 uuid primary key default gen_random_uuid(),
  piano_id           uuid not null references piani_giornata(id) on delete cascade,
  appointment_id     uuid not null,
  medico             text not null default '',
  prestazione        text not null default '',
  durata_prevista    int not null,
  durata_stimata     int not null,
  ora_teorica        int not null,               -- minuti dalla mezzanotte, come in tutto il motore
  ingresso_previsto  int,
  inizio_stimato     int,
  fine_stimata       int,
  sala               text,
  apparecchi         text[] not null default '{}',
  assistente         text,
  preparazione_min   int not null default 0,
  ripristino_min     int not null default 0,
  priorita           smallint not null default 0,
  rigidita           smallint not null default 0,
  perche             jsonb not null default '{}'::jsonb,
  unique (piano_id, appointment_id)
);
create index if not exists piano_visite_piano on piano_visite (piano_id);
