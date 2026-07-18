-- Migrazione per installazioni esistenti: token per i medici invianti.
alter table referring_doctors
  add column if not exists token text unique not null
  default encode(gen_random_bytes(18), 'hex');
