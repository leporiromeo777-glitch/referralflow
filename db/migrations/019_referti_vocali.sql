-- Bozze dei referti vocali prodotte dalla pipeline locale di trascrizione
-- (Mac mini dello studio, cartella pipeline-referti/). La pipeline scrive
-- SOLO qui: sempre bozze da confermare, mai record definitivi. Il payload
-- contiene testo corretto, campi estratti, divergenze tra le due
-- trascrizioni, segmenti dubbi e allarmi numerici.

begin;

create table referti_vocali_bozze (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id),
  -- Identificativo generato dalla pipeline (mai il nome del file originale).
  file_id        text not null,
  payload        jsonb not null,
  -- Sempre true: nessun referto è pronto senza passare da un umano.
  richiede_revisione boolean not null default true,
  -- da_revisionare | confermata | scartata
  stato          text not null default 'da_revisionare',
  ricevuta_il    timestamptz not null default now(),
  revisionata_da uuid references users(id),
  revisionata_il timestamptz,
  -- Idempotenza del ciclo di riprova della pipeline: niente doppioni.
  unique (studio_id, file_id)
);

create index on referti_vocali_bozze (studio_id, stato);

commit;
