-- Fase 12: attivazione self-service dello studio (funnel dagli affidi esterni).
-- Lo studio che riceve un affido può creare la propria pagina da solo:
-- modulo → codice di verifica via email → studio + primo admin, tutto in 2 minuti.

begin;

-- Richieste di attivazione: i dati del modulo restano qui finché il codice
-- email non viene verificato (prova che l'indirizzo è davvero suo).
create table studio_activations (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text not null,
  specialita text,
  telefono   text,
  code       text not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index on studio_activations (lower(email));

-- Interruttore del titolare della piattaforma: uno studio disattivato non può
-- più accedere né ricevere affidi (controllo anti-abuso sul self-service).
alter table studios add column attivo boolean not null default true;
-- Da dove è nato lo studio: 'self-service' oppure null (script/onboarding manuale).
alter table studios add column created_via text;

-- Quando lo studio destinatario si attiva, i suoi affidi esterni pendenti
-- diventano referral vere nella sua coda: qui il collegamento.
alter table external_referrals add column converted_referral_id uuid references referrals(id);

commit;
