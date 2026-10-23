-- 101 — Le note degli aiuti medici (23.10.2026, dallo studio: «nella home dell'aiuto medico una sezione note che vedono
-- tutte tra di loro»). Una bacheca per studio: chi scrive, quando, se è fatta. Le vede ogni aiuto medico dello studio
-- (e il tecnico, che vede tutto). Il testo resta qui: mai nei log né nelle notifiche.
create table if not exists note_bacheca (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  autore_id  uuid references users(id) on delete set null,
  testo      text not null check (length(testo) between 1 and 2000),
  creata_il  timestamptz not null default now(),
  fatta_il   timestamptz,
  fatta_da   uuid references users(id) on delete set null
);
create index if not exists note_bacheca_studio on note_bacheca (studio_id, creata_il desc);
