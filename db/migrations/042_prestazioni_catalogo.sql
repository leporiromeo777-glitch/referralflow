-- Catalogo delle prestazioni dello studio (14.9.2026, punto 2 del piano
-- CardioOS): nome, tipo (visita | esame | procedura), durata standard, sala
-- predefinita, parole chiave con cui si riconosce nel motivo dell'agenda
-- MediOnline. Aggancia i percorsi (le prestazioni dei percorsi sono voci del
-- catalogo), l'agenda per sala e l'esportazione. Mai eliminate: si disattivano.
create table if not exists prestazioni_catalogo (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  nome          text not null,
  tipo          text not null default 'esame' check (tipo in ('visita', 'esame', 'procedura')),
  durata_min    int not null default 30 check (durata_min between 5 and 480),
  sala          text,
  parole_chiave text[] not null default '{}',
  attivo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists prestazioni_catalogo_studio on prestazioni_catalogo (studio_id, attivo, nome);
