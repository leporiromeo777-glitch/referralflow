-- Confronto cieco tra due versioni della catena sullo stesso dettato
-- (2026-09-06, analisi dei concorrenti: Abridge non manda in produzione una
-- versione senza test A/B cieco). La pipeline in modalità «ombra»
-- (REFERTI_OMBRA=1) consegna una seconda bozza con file_id suffisso «-ombra»;
-- la pagina /referti/confronto mostra le due bozze affiancate senza dire
-- quale sia la nuova, e registra la preferenza del medico.
create table if not exists referti_confronti (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  bozza_a uuid not null references referti_bozze(id) on delete cascade,
  bozza_b uuid not null references referti_bozze(id) on delete cascade,
  scelta text check (scelta in ('a', 'b', 'pari')),
  motivo text,
  deciso_da uuid references users(id),
  deciso_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bozza_a, bozza_b)
);
create index if not exists referti_confronti_studio on referti_confronti (studio_id, created_at desc);
