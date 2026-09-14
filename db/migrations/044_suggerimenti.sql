-- «Suggerisci una modifica» (14.9.2026, punto 7 del piano CardioOS): chi usa
-- l'interfaccia nuova lascia una richiesta con la pagina da cui la scrive; lo
-- sviluppatore riceve un avviso SENZA il testo (che resta nella piattaforma) e
-- l'amministratore vede lo stato. Niente nomi di pazienti né dati clinici.
create table if not exists suggerimenti (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  user_id    uuid references users(id),
  pagina     text,
  testo      text not null,
  stato      text not null default 'aperto' check (stato in ('aperto', 'fatto', 'no')),
  risposta   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suggerimenti_studio on suggerimenti (studio_id, stato, created_at desc);
