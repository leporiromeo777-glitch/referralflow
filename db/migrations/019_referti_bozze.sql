-- Bozze di referto dalla pipeline locale di trascrizione (docs/trascrizione/SPEC.md).
-- Il Mac mini dello studio trascrive i referti dettati e li POSTa qui come bozze:
-- nessuna scrittura su record definitivi, ogni bozza passa da un umano (§2.5 della SPEC).

-- Token di autenticazione dell'endpoint, uno per studio. In tabella sta SOLO
-- l'hash sha256: il token in chiaro si vede una volta sola alla generazione
-- (stessa logica delle credenziali del feed iCal: mai mostrarle né loggarle).
alter table studios add column if not exists referti_token_hash text unique;
alter table studios add column if not exists referti_token_set_at timestamptz;

create table if not exists referti_bozze (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  -- ID del file audio assegnato dalla pipeline: rende idempotenti i retry
  -- (la pipeline reinvia finché non riceve 2xx, poi cancella l'audio).
  file_id     text not null,
  -- Il JSON della pipeline così com'è arrivato (testo, campi, divergenze,
  -- segmenti dubbi, allarmi numerici): resta intatto come riferimento.
  payload     jsonb not null,
  -- bozza -> confermata | scartata. Solo un umano cambia stato.
  stato       text not null default 'bozza'
                check (stato in ('bozza', 'confermata', 'scartata')),
  -- Alla conferma: il testo eventualmente ritoccato e i campi come validati.
  testo_finale     text,
  campi_confermati jsonb,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (studio_id, file_id)
);

create index if not exists referti_bozze_studio_stato_idx
  on referti_bozze (studio_id, stato, created_at);
