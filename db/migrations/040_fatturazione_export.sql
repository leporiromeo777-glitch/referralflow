-- Prestazioni da fatturare (14.9.2026): la piattaforma NON fattura (decisione
-- del 14.9.2026, vedi Decisioni/Registro); esporta le prestazioni erogate del
-- mese in un CSV per il gestionale di fatturazione dello studio e segna che
-- cosa è già uscito, così la segreteria vede solo le nuove. Nel file: dati
-- amministrativi (paziente, data, medico, prestazione), mai testo clinico.
alter table appointments add column if not exists fatturazione_esportato_at timestamptz;
create index if not exists appointments_fatturazione_idx on appointments (studio_id, fatturazione_esportato_at) where fatturazione_esportato_at is null;

create table if not exists fatturazione_esportazioni (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  dal        date not null,
  al         date not null,
  righe      int not null,
  user_id    uuid references users(id),
  impronta   text,                          -- sha256 corto del file, per riconoscerlo
  created_at timestamptz not null default now()
);
create index if not exists fatturazione_esportazioni_studio on fatturazione_esportazioni (studio_id, created_at desc);
