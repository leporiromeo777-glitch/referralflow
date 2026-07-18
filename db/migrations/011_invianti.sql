-- Fase 11: login per i medici invianti esterni.
-- NOTA: questo file NON usa begin/commit — il nuovo valore dell'enum deve
-- essere committato prima di poter essere usato nel vincolo (limite PostgreSQL).

-- Nuovo ruolo: il medico inviante registrato (non appartiene a nessuno studio).
alter type user_role add value if not exists 'inviante';

-- Gli invianti non hanno studio: la colonna diventa opzionale, ma resta
-- obbligatoria per tutti gli altri ruoli.
alter table users alter column studio_id drop not null;
alter table users add constraint users_studio_per_ruolo
  check (studio_id is not null or role = 'inviante');

-- Profilo pubblico dell'inviante (annuario della piattaforma).
create table inviante_profiles (
  user_id    uuid primary key references users(id) on delete cascade,
  nome       text not null,
  studio     text,
  specialita text,
  telefono   text,
  visibile   boolean not null default true,
  created_at timestamptz not null default now()
);

-- Codici di verifica per la registrazione self-service dal portale
-- (l'email in anagrafica è la prova d'identità: il codice ci arriva solo lui).
create table login_verifications (
  id                  uuid primary key default gen_random_uuid(),
  referring_doctor_id uuid not null references referring_doctors(id) on delete cascade,
  email               text not null,
  code                text not null,
  expires_at          timestamptz not null default (now() + interval '15 minutes'),
  used_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index on login_verifications (referring_doctor_id);
