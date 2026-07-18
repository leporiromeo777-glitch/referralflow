-- Fase 14: cartella documenti del paziente (Fase 1 della cartella digitale).
-- Il dossier accumula i documenti del paziente (referti, ECG, imaging, lettere)
-- oltre i confini della singola referral; ogni lettura/invio è tracciato nel
-- registro accessi (art. 4 OPDa: conservazione ≥ 1 anno); la trasmissione con
-- un affido richiede il consenso del paziente, documentato con data e ora.

begin;

create table patient_documents (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id),
  patient_id  uuid not null references patients(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  -- referto | ecg | imaging | lettera | consenso | altro
  categoria   text not null default 'altro',
  nota        text,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);

create index on patient_documents (patient_id);
create index on patient_documents (studio_id);

-- Registro degli accessi ai documenti della cartella: chi, cosa, quando.
-- Nessuna cancellazione a cascata: il registro sopravvive al documento.
create table document_access_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  studio_id   uuid,
  user_id     uuid,
  azione      text not null, -- caricamento | lettura | invio | cancellazione
  dettaglio   text,
  at          timestamptz not null default now()
);

create index on document_access_log (document_id);
create index on document_access_log (at);

-- Consenso del paziente alla trasmissione di documenti insieme all'invio
-- (art. 321 CP / art. 20 LSan TI): registrato con data e ora.
alter table referrals add column consenso_trasmissione timestamptz;
alter table external_referrals add column consenso_trasmissione timestamptz;

commit;
