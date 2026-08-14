-- Post-it di squadra sulla pagina Oggi: le note volanti della segreteria
-- («il Dr. M. esce alle 15», «richiamare la farmacia») che prima vivevano
-- su foglietti accanto al monitor. Si aggiungono e si strappano: niente
-- stati, una nota fatta si elimina.
create table if not exists note_squadra (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id),
  testo      text not null,
  autore     text,
  created_at timestamptz not null default now()
);
create index if not exists note_squadra_studio_idx on note_squadra (studio_id, created_at desc);
