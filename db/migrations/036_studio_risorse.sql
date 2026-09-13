-- Risorse dello studio (14.9.2026): sale e apparecchi, gestite dalla pagina
-- «Studio» dell'interfaccia nuova. Una tabella sola con il tipo, così un
-- domani entrano anche servizi o altro senza migrazione. Mai eliminate: si
-- disattivano (restano nell'audit e nell'agenda passata).
create table if not exists studio_risorse (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  -- sala | apparecchio
  tipo        text not null check (tipo in ('sala', 'apparecchio')),
  nome        text not null,
  descrizione text,
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_risorse_studio on studio_risorse (studio_id, tipo, attivo);
