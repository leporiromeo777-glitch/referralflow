-- Reset password self-service: token casuale inviato via email, salvato solo
-- come hash (sha256), a scadenza breve e usa-e-getta. Nessun dato in chiaro.
create table if not exists password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null default (now() + interval '1 hour'),
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_resets_token_idx on password_resets (token_hash);
create index if not exists password_resets_user_idx on password_resets (user_id);
