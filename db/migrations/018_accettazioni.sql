-- Registro delle accettazioni dei testi legali (condizioni di servizio +
-- contratto di trattamento dati). È la "prova della firma": chi, quando, quale
-- versione, da quale IP. Sopravvive alla cancellazione di studio/utente
-- (studio_id/user_id -> null) perché la prova d'accettazione deve restare.
create table if not exists terms_acceptances (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid references studios(id) on delete set null,
  user_id       uuid references users(id) on delete set null,
  email         text not null,
  terms_version text not null,
  ip            text,
  accepted_at   timestamptz not null default now()
);
create index if not exists terms_acceptances_studio_idx on terms_acceptances (studio_id);
create index if not exists terms_acceptances_email_idx on terms_acceptances (email);
