-- Prova da sforzo: i referti PDF della ciclo (9.10.2026, docs/wiki/Piattaforma/Prova da sforzo.md).
-- Il programma della ciclo (Cardioline CubeStress) crea il referto in PDF sul suo PC; una copia
-- arriva nella cartella «Ciclo da leggere/referti» del Mac e la piattaforma la legge da sola.
-- Se nome e data di nascita scritti nel referto combaciano con una persona sola, il PDF diventa
-- un documento «Ciclo» della sua cartella; se no resta qui «in attesa» finché qualcuno sceglie
-- il paziente. Il PDF sta nell'archivio dei file (storage_key), mai nei log.
create table if not exists ciclo_arrivi (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  nome_file text not null,                       -- porta ora dell'esame e ora del referto: lo stesso nome è lo stesso referto
  sha256 text not null,
  storage_key text,                              -- il PDF, finché aspetta; vuoto quando è diventato un documento (o è scartato)
  esame_il timestamp,
  referto_il timestamp,
  nome_letto text,
  nascita_letta date,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'assegnato', 'scartato', 'non_letto')),
  motivo text,
  patient_id uuid references patients(id) on delete set null,
  documento_id uuid references patient_documents(id) on delete set null,
  deciso_da uuid references users(id) on delete set null,
  quando timestamptz not null default now(),
  deciso_il timestamptz,
  unique (studio_id, nome_file)
);
create index if not exists ciclo_arrivi_attesa on ciclo_arrivi (studio_id, stato, quando desc);
