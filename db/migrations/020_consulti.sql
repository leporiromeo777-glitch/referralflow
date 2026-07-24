-- Consulto rapido tra medici (eConsult): il medico inviante fa una domanda
-- clinica breve dal suo portale token, lo specialista risponde per iscritto.
-- Spesso evita una visita; quando invece la visita serve, il consulto si
-- converte in referral con un clic (la domanda diventa il quesito).

create table if not exists consulti (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           uuid not null references studios(id) on delete cascade,
  referring_doctor_id uuid not null references referring_doctors(id) on delete cascade,
  domanda             text not null,
  risposta            text,
  -- aperto -> risposto | convertito (in referral). Cambia stato solo lo studio.
  stato               text not null default 'aperto'
                        check (stato in ('aperto', 'risposto', 'convertito')),
  answered_by         uuid references users(id) on delete set null,
  answered_at         timestamptz,
  converted_referral_id uuid references referrals(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists consulti_studio_stato_idx on consulti (studio_id, stato, created_at);
create index if not exists consulti_doctor_idx on consulti (referring_doctor_id, created_at);

-- Allegati del consulto (ECG, esami): stesso storage degli altri allegati.
create table if not exists consulto_attachments (
  id          uuid primary key default gen_random_uuid(),
  consulto_id uuid not null references consulti(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists consulto_attachments_consulto_idx on consulto_attachments (consulto_id);
