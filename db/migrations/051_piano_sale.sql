-- Il piano delle sale del giorno, preparato in anticipo (15.9.2026).
--
-- Non è una risposta a una domanda: è una cosa che dev'essere già pronta
-- quando si apre la Home. Il CODICE lo calcola dalle regole della pagina wiki
-- «Medici/Sale»; dove le regole non bastano — una stanza condivisa con più
-- persone presenti — il modello locale PROPONE, e la proposta resta marcata
-- come tale finché una persona non la accetta.
create table if not exists piano_sale (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  giorno       date not null,
  righe        jsonb not null,          -- il piano risolto dalle regole
  da_decidere  jsonb not null default '[]'::jsonb,
  proposta     text,                    -- quello che ha scritto il modello
  proposta_da  text,                    -- quale modello, e dove gira
  proposta_ms  integer,
  accettata_at timestamptz,             -- quando una persona l'ha presa per buona
  accettata_da uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists piano_sale_giorno_idx on piano_sale (studio_id, giorno);
