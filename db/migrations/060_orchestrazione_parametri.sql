-- I pesi e le soglie dell'orchestrazione (16.9.2026, §6 e §8).
-- Una riga per chiave; i default stanno nel codice (`parametri.ts`) e qui
-- entra solo quel che lo studio cambia dalla pagina Studio.
create table if not exists orchestrazione_parametri (
  studio_id  uuid not null references studios(id) on delete cascade,
  chiave     text not null,
  valore     jsonb not null,
  user_id    uuid,
  at         timestamptz not null default now(),
  primary key (studio_id, chiave)
);
