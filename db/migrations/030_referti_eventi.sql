-- Registro degli eventi sui referti (2026-09-06, Ricerca 17 §17.7): append-only,
-- senza testo clinico — solo azione, attore, momento, versione e dettagli
-- numerici o impronte (hash). Le referral hanno già referral_status_history;
-- i referti dettati non avevano nulla di equivalente.
create table if not exists referti_eventi (
  id bigserial primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  bozza_id uuid,                       -- non FK: l'evento sopravvive alla cancellazione della bozza
  azione text not null,
  attore uuid references users(id),
  dettagli jsonb not null default '{}'::jsonb,
  versione text,
  created_at timestamptz not null default now()
);
create index if not exists referti_eventi_bozza on referti_eventi (bozza_id, created_at);
create index if not exists referti_eventi_studio on referti_eventi (studio_id, created_at desc);
