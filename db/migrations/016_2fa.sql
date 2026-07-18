-- Fase 16: autenticazione a due fattori (TOTP) facoltativa per gli utenti.
-- Il segreto TOTP resta sul server (mai in chiaro verso il client dopo
-- l'attivazione); i codici di recupero sono salvati con hash, monouso.
alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_enabled_at timestamptz;

create table if not exists user_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_recovery_codes_user_idx on user_recovery_codes (user_id);
