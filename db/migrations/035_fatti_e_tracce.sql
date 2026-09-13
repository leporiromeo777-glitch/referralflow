-- Grafo delle informazioni e tracce delle procedure (13.9.2026).
-- Decisione: il grafo vive in Postgres, non in un motore separato
-- (Decisioni/Registro). Un FATTO è un arco «paziente → relazione → oggetto»
-- con la sua fonte (documento, referto, appuntamento, referral), la data e
-- la confidenza: le procedure lo scrivono, il bot lo attraversa. Una TRACCIA
-- è il percorso deterministico di una risposta dell'assistente: obiettivo,
-- passi con esito, fonti lette, cose mancanti, modello e tempo. Si salva la
-- traccia del codice, mai il «pensiero» del modello. Niente testo clinico nei
-- log: i dati stanno qui, sotto le stesse regole della cartella.
create table if not exists pazienti_fatti (
  id          bigserial primary key,
  studio_id   uuid not null references studios(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  -- ha_documento | ultimo_referto | terapia_riga | referral_aperta | prossimo_appuntamento |
  -- ultima_visita | esame_mancante | richiamo_scaduto | bozza_da_rivedere
  relazione   text not null,
  oggetto     text not null,
  dettaglio   jsonb not null default '{}'::jsonb,
  -- documento | referto | appuntamento | referral | procedura
  fonte_tipo  text not null,
  fonte_id    text,
  data_fatto  date,
  confidenza  numeric(4,3) not null default 1,
  procedura   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists pazienti_fatti_paziente on pazienti_fatti (studio_id, patient_id, relazione);

create table if not exists assistente_tracce (
  id                 bigserial primary key,
  studio_id          uuid not null references studios(id) on delete cascade,
  user_id            uuid references users(id) on delete set null,
  patient_id         uuid references patients(id) on delete set null,
  -- briefing_previsita | documento | domanda_libera
  procedura          text not null,
  obiettivo          text not null,
  passi              jsonb not null default '[]'::jsonb,
  fonti              jsonb not null default '[]'::jsonb,
  mancanti           jsonb not null default '[]'::jsonb,
  modello            text,
  durata_ms          int,
  risposta_caratteri int,
  created_at         timestamptz not null default now()
);
create index if not exists assistente_tracce_studio on assistente_tracce (studio_id, created_at desc);
