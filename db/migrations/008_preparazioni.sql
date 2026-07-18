-- Fase 8: preparazioni alla visita (checklist per il paziente) e appoggio alla
-- scheda pre-visita / storico paziente.

begin;

-- Istruzioni di preparazione configurabili per studio (es. «Ecocardiogramma da
-- sforzo»: venga a digiuno, sospenda i beta-bloccanti 48h prima…). Testo neutro,
-- pensato per essere inviato al paziente (SMS) e mostrato sulla pagina appuntamento.
create table preparazioni (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id),
  nome       text not null,
  testo      text not null,
  attiva     boolean not null default true,
  created_at timestamptz not null default now()
);

create index on preparazioni (studio_id);

-- Preparazione scelta per una referral (facoltativa).
alter table referrals add column preparazione_id uuid references preparazioni(id);

-- Traccia quando la preparazione è stata inviata al paziente (per non ripetere).
alter table referrals add column preparazione_sent_at timestamptz;

commit;
