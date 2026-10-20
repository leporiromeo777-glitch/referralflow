-- 093 — Lo storico dei documenti eliminati (20.10.2026, richiesta dello studio: «poter rintracciare chi ha eliminato
-- cosa»). Quando una persona elimina un documento dalla cartella del paziente, qui resta la sua riga com'era (`riga`,
-- tutte le colonne di patient_documents), chi e quando; il file resta nel deposito, così il documento si può rimettere.
-- Anche i documenti tolti da «Dividi di nuovo» finiscono qui (senza file: erano copie di pagine dell'originale).
create table if not exists documenti_eliminati (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references studios(id) on delete cascade,
  patient_id       uuid references patients(id) on delete set null,
  document_id      uuid not null,
  filename         text not null,
  categoria        text,
  cartella         text,
  riga             jsonb not null,
  file_tenuto      boolean not null default true,
  motivo           text,
  eliminato_da     uuid references users(id) on delete set null,
  eliminato_at     timestamptz not null default now(),
  ripristinato_da  uuid references users(id) on delete set null,
  ripristinato_at  timestamptz
);
create index if not exists documenti_eliminati_paziente on documenti_eliminati (studio_id, patient_id, eliminato_at desc);
