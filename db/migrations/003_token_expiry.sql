-- Irrobustimento per la produzione: scadenza dei token dei link pubblici
-- (/invia/[token] e /portale/[token]). La rotazione si fa dalla pagina Medici.
alter table referring_doctors
  add column if not exists token_expires_at timestamptz not null
  default (now() + interval '180 days');
