-- Immagini dall'archivio dello studio (6.10.2026): l'archivio resta al
-- software Philips, la piattaforma cerca gli esami lì (C-FIND) e se li fa
-- mandare quando qualcuno li apre (C-MOVE). La copia qui è TEMPORANEA:
-- `scade_il` dice fino a quando; ogni apertura la allunga.
alter table imaging_esami drop constraint if exists imaging_esami_origine_check;
alter table imaging_esami add constraint imaging_esami_origine_check check (origine in ('import', 'rete', 'portale', 'archivio'));
alter table imaging_esami add column if not exists scade_il timestamptz;
create index if not exists imaging_esami_scade on imaging_esami (scade_il) where scade_il is not null;

-- Chi ha chiesto quale esame all'archivio, e com'è finita. `abbina`: l'esame
-- è stato chiesto dalla cartella di un paziente e nome e data di nascita
-- dell'archivio corrispondono (verificato dal server): all'arrivo si aggancia.
create table if not exists imaging_richieste (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  study_uid text not null,
  patient_id uuid references patients(id) on delete set null,
  abbina boolean not null default false,
  chiesto_da uuid references users(id),
  chiesto_il timestamptz not null default now(),
  stato text not null default 'in_corso' check (stato in ('in_corso', 'arrivato', 'fallito')),
  motivo text,
  esame_id uuid references imaging_esami(id) on delete set null,
  finito_il timestamptz
);
create index if not exists imaging_richieste_studio on imaging_richieste (studio_id, study_uid, chiesto_il desc);
