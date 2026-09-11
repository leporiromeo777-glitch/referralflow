-- Voci di dizionario proposte dalle correzioni umane (11.9.2026): le coppie
-- «sbagliato → giusto» che la segretaria corregge più volte sullo stesso
-- medico vengono PROPOSTE nel cruscotto Qualità AI; l'admin le conferma o le
-- scarta a mano. Le confermate le legge il servizio sul Mac dello studio
-- (GET /api/referti/dizionario) e le scrive in correzioni-<medico>-piattaforma.json.
-- Mai automatico: le correzioni non addestrano nulla da sole.
create table if not exists referti_dizionario (
  id          bigserial primary key,
  studio_id   uuid not null references studios(id) on delete cascade,
  medico      text not null,
  da          text not null,
  a           text not null,
  stato       text not null check (stato in ('confermata', 'rifiutata')),
  occorrenze  int not null default 0,
  deciso_da   uuid references users(id) on delete set null,
  deciso_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create unique index if not exists referti_dizionario_chiave on referti_dizionario (studio_id, medico, lower(da));
