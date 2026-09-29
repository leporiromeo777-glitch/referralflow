-- Misura delle correzioni anche senza «Conferma» (29.9.2026). Nello studio
-- la segretaria scarica il Word e finisce lì la lettera: in due settimane 80
-- bozze arrivate, 42 Word scaricati, 1 conferma. La misura in human_edits
-- parte solo alla conferma e quindi non vedeva quasi niente. Qui una riga
-- quando il Word si scarica (o si prepara l'e-mail) di una bozza non
-- confermata: SOLO numeri, nessun testo e nessun diff (il testo resta nella
-- bozza). Il cruscotto usa la riga confermata se c'è, se no l'ultima di queste.
create table if not exists audit.misure_lavoro (
  id                  bigserial primary key,
  studio_id           uuid not null references studios(id) on delete cascade,
  bozza_id            uuid not null references referti_bozze(id) on delete cascade,
  momento             text not null check (momento in ('word', 'email')),
  editor_role         text not null check (editor_role in ('SECRETARY', 'DOCTOR')),
  editor_user_id      uuid references users(id) on delete set null,
  from_artifact_id    bigint references audit.artifacts(id),
  testo_hash          text not null,
  edit_count          integer not null,
  insertions          integer not null default 0,
  deletions           integer not null default 0,
  replacements        integer not null default 0,
  characters_changed  integer not null default 0,
  words_changed       integer not null default 0,
  words_total         integer not null default 0,
  edits_per_100_words numeric(8,2) not null default 0,
  severity_max        text,
  categories          jsonb not null default '{}'::jsonb,
  medico              text,
  created_at          timestamptz not null default now(),
  unique (bozza_id, testo_hash, from_artifact_id)
);
create index if not exists misure_lavoro_studio on audit.misure_lavoro (studio_id, created_at desc);
