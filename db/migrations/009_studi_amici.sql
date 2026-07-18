-- Fase 9: «Affida paziente» — studi amici (preferiti per studio) e specialità
-- degli studi per la ricerca.

begin;

-- Descrizione libera delle prestazioni offerte (es. «Cardiologia: ecocardiografia,
-- Holter, test da sforzo, aritmologia»). Usata dalla ricerca della pagina Affida.
alter table studios add column specialita text;

-- Gli studi con cui si lavora di più: compaiono in cima alla pagina Affida.
create table studio_partners (
  studio_id         uuid not null references studios(id),
  partner_studio_id uuid not null references studios(id),
  created_at        timestamptz not null default now(),
  primary key (studio_id, partner_studio_id),
  check (studio_id <> partner_studio_id)
);

commit;
