-- Audit trail, lineage, versioni e qualità della catena (9.9.2026).
-- Schema SEPARATO «audit» (dati analitici) accanto alle tabelle operative:
-- pronto a diventare un database a sé senza toccare l'applicazione.
-- Solo aggiunte: nessun dato esistente viene modificato.
-- Vedi docs/audit/ARCHITETTURA.md.

create schema if not exists audit;

-- Registro dei prompt: nome + versione + impronta del testo. I prompt della
-- catena arrivano come impronta; quelli dell'app con il testo intero.
create table if not exists audit.prompt_versions (
  id           bigserial primary key,
  name         text not null,
  version      text not null,
  content_hash text not null,
  content      text,
  created_at   timestamptz not null default now(),
  unique (name, content_hash)
);

-- Rilasci: linee verticali nel grafico («Pipeline v8 deployed»).
create table if not exists audit.deployments (
  id          bigserial primary key,
  studio_id   uuid references studios(id) on delete cascade,
  kind        text not null check (kind in ('pipeline', 'app', 'prompt', 'model')),
  version     text not null,
  released_at timestamptz not null default now(),
  note        text,
  unique (studio_id, kind, version)
);

-- Una corsa della catena per un audio (ripetibile: attempt 1, 2, 3…).
create table if not exists audit.pipeline_runs (
  id               bigserial primary key,
  studio_id        uuid not null references studios(id) on delete cascade,
  bozza_id         uuid references referti_bozze(id) on delete set null,
  file_id          text not null,
  attempt          int  not null default 1,
  pipeline_version text,
  status           text not null check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_ms      int,
  config           jsonb not null default '{}'::jsonb,
  error_type       text,
  error_message    text,
  failed_step      text,
  created_at       timestamptz not null default now(),
  unique (studio_id, file_id, attempt)
);
create index if not exists pipeline_runs_bozza on audit.pipeline_runs (bozza_id);
create index if not exists pipeline_runs_studio_tempo on audit.pipeline_runs (studio_id, created_at);

-- L'output di una tappa: immutabile, con impronta e numero di versione nel referto.
create table if not exists audit.artifacts (
  id            bigserial primary key,
  studio_id     uuid not null references studios(id) on delete cascade,
  run_id        bigint references audit.pipeline_runs(id) on delete cascade,
  bozza_id      uuid references referti_bozze(id) on delete set null,
  version_no    int  not null,
  kind          text not null check (kind in ('audio', 'text', 'json')),
  label         text not null,
  producer_type text not null check (producer_type in ('AI', 'SYSTEM', 'SECRETARY', 'DOCTOR')),
  content_text  text,
  storage_ref   text,
  content_hash  text not null,
  bytes         int,
  words         int,
  created_at    timestamptz not null default now()
);
create index if not exists artifacts_bozza on audit.artifacts (bozza_id, version_no);
create index if not exists artifacts_run on audit.artifacts (run_id);

-- Provenienza: un artefatto può derivare da PIÙ genitori (l'arbitro da A e da B).
create table if not exists audit.artifact_parents (
  artifact_id        bigint not null references audit.artifacts(id) on delete cascade,
  parent_artifact_id bigint not null references audit.artifacts(id) on delete cascade,
  primary key (artifact_id, parent_artifact_id)
);

-- Una tappa della corsa (AI, codice o persona), con tempi, modello, prompt, esito.
create table if not exists audit.pipeline_steps (
  id                 bigserial primary key,
  run_id             bigint references audit.pipeline_runs(id) on delete cascade,
  bozza_id           uuid references referti_bozze(id) on delete set null,
  step_order         int  not null,
  step_type          text not null,
  step_name          text not null,
  producer_type      text not null check (producer_type in ('AI', 'SYSTEM', 'SECRETARY', 'DOCTOR')),
  model_provider     text,
  model_name         text,
  model_version      text,
  model_variant      text,
  prompt_version_id  bigint references audit.prompt_versions(id),
  status             text not null default 'SUCCESS' check (status in ('SUCCESS', 'FAILED', 'SKIPPED')),
  error_type         text,
  error_message      text,
  retry_count        int  not null default 0,
  started_at         timestamptz,
  completed_at       timestamptz,
  duration_ms        int,
  input_artifact_id  bigint references audit.artifacts(id),
  output_artifact_id bigint references audit.artifacts(id),
  metadata           jsonb not null default '{}'::jsonb,
  compute_cost       numeric(10,4),
  created_at         timestamptz not null default now()
);
create index if not exists pipeline_steps_run on audit.pipeline_steps (run_id, step_order);
create index if not exists pipeline_steps_bozza on audit.pipeline_steps (bozza_id);

-- Stato della revisione umana per referto e RUOLO: distingue «mai aperto»
-- da «rivisto senza modifiche».
create table if not exists audit.report_reviews (
  id           bigserial primary key,
  studio_id    uuid not null references studios(id) on delete cascade,
  bozza_id     uuid not null references referti_bozze(id) on delete cascade,
  role         text not null check (role in ('SECRETARY', 'DOCTOR')),
  status       text not null check (status in ('NOT_REVIEWED', 'IN_REVIEW', 'REVIEWED_NO_CHANGES', 'REVIEWED_WITH_CHANGES')),
  user_id      uuid references users(id) on delete set null,
  started_at   timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (bozza_id, role)
);

-- Una revisione umana confermata: diff tra l'ultimo output AI e la versione
-- della persona. Immutabile. La metrica principale usa SOLO editor_role='SECRETARY'.
create table if not exists audit.human_edits (
  id                 bigserial primary key,
  studio_id          uuid not null references studios(id) on delete cascade,
  bozza_id           uuid not null references referti_bozze(id) on delete cascade,
  run_id             bigint references audit.pipeline_runs(id) on delete set null,
  editor_role        text not null check (editor_role in ('SECRETARY', 'DOCTOR')),
  editor_user_id     uuid references users(id) on delete set null,
  from_artifact_id   bigint references audit.artifacts(id),
  to_artifact_id     bigint references audit.artifacts(id),
  edit_count         int not null,
  insertions         int not null,
  deletions          int not null,
  replacements       int not null,
  characters_changed int not null,
  words_changed      int not null,
  words_total        int not null,
  edits_per_100_words numeric(8,3) not null,
  severity_max       text,
  categories         jsonb not null default '{}'::jsonb,
  diff               jsonb not null default '[]'::jsonb,
  review_seconds     int,
  pipeline_version   text,
  prompt_version     text,
  medico             text,
  created_at         timestamptz not null default now()
);
create index if not exists human_edits_studio_tempo on audit.human_edits (studio_id, editor_role, created_at);
create index if not exists human_edits_bozza on audit.human_edits (bozza_id);

-- Immutabilità: le versioni e le revisioni non si aggiornano né si cancellano.
create or replace function audit.vieta_modifica() returns trigger language plpgsql as $$
begin
  raise exception 'audit.%: righe immutabili (nuova versione = nuova riga)', tg_table_name;
end $$;
drop trigger if exists artifacts_immutabili on audit.artifacts;
create trigger artifacts_immutabili before update or delete on audit.artifacts
  for each row execute function audit.vieta_modifica();
drop trigger if exists human_edits_immutabili on audit.human_edits;
create trigger human_edits_immutabili before update or delete on audit.human_edits
  for each row execute function audit.vieta_modifica();
