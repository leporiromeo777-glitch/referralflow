-- Allegati scelti a mano nella revisione (27.9.2026, richiesta dello studio):
-- il tasto «Allegati» mostra che cosa parte con la mail all'inviante (e
-- che cosa elenca il Word) e permette di aggiungere o togliere.
--   cartella → un documento della cartella del paziente (anche uno appena
--              caricato dalla revisione, che entra così nella cartella)
--   caricato → un file caricato per questo referto quando il paziente non è
--              in cartella: vive solo qui
--   tolto    → un allegato trovato in automatico che chi rivede ha tolto
--              (per etichetta)
create table if not exists referti_allegati (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  bozza_id     uuid not null references referti_bozze(id) on delete cascade,
  tipo         text not null check (tipo in ('cartella', 'caricato', 'tolto')),
  documento_id uuid references patient_documents(id) on delete cascade,
  storage_key  text,
  filename     text,
  content_type text,
  etichetta    text not null,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((tipo = 'cartella') = (documento_id is not null)),
  check ((tipo = 'caricato') = (storage_key is not null))
);
create index if not exists referti_allegati_bozza on referti_allegati (bozza_id);
