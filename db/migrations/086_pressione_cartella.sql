-- Pressione: la cartella condivisa (8.10.2026, docs/wiki/Piattaforma/Pressione.md).
-- Un file messo nella cartella «Pressione da leggere» viene letto da solo. Se
-- nome e data di nascita (dal nome del file o dalle sue prime righe) combaciano
-- con una persona sola, diventa subito un profilo; se no resta qui «in attesa»
-- finché qualcuno sceglie il paziente. Il contenuto del file è un dato
-- sanitario: sta nel database, mai nei log.
create table if not exists pa_arrivi (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  nome_file text not null,
  testo text not null,
  misure integer not null default 0,
  inizio timestamp,
  fine timestamp,
  nome_letto text,
  nascita_letta date,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'assegnato', 'scartato')),
  motivo text,
  profilo_id uuid references pa_profili(id) on delete set null,
  deciso_da uuid references users(id) on delete set null,
  quando timestamptz not null default now(),
  deciso_il timestamptz
);
create index if not exists pa_arrivi_attesa on pa_arrivi (studio_id, stato, quando desc);
