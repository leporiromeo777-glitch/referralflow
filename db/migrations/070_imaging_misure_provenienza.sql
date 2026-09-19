-- Provenienza completa e registro degli eventi delle misure (MSE fasi 7 e 8, 19.9.2026).
--
-- «Da dove arriva questo numero?» deve avere una risposta completa dentro la
-- riga: coordinate fisiche, valore mostrato accanto a quello pieno, algoritmo
-- e versioni (algoritmo, gate, software), stato del Validation Gate con i suoi
-- avvisi, esito del doppio controllo indipendente, la geometria copiata così
-- com'era. E ogni cosa che succede a una misura — nasce, cambia etichetta,
-- viene legata a una misura dell'apparecchio, viene annullata, viene rifatta —
-- è un EVENTO in una tabella a soli inserimenti, con prima e dopo: nessuna
-- modifica sovrascrive in silenzio ciò che c'era.

alter table imaging_misure_manuali
  add column if not exists punti_fisici jsonb,
  add column if not exists valore_mostrato text,
  add column if not exists algoritmo text,
  add column if not exists versione_gate text,
  add column if not exists versione_software text,
  add column if not exists stato_validazione text check (stato_validazione in ('VALIDATED', 'CAUTION')),
  add column if not exists avvisi jsonb,
  add column if not exists verifica_indipendente jsonb,
  add column if not exists geometria jsonb,
  add column if not exists sostituisce_id uuid references imaging_misure_manuali(id);

create table if not exists imaging_misure_eventi (
  id bigserial primary key,
  misura_id uuid not null references imaging_misure_manuali(id) on delete cascade,
  studio_id uuid not null references studios(id) on delete cascade,
  evento text not null check (evento in ('creata', 'etichettata', 'riferimento', 'annullata', 'sostituita')),
  user_id uuid references users(id),
  prima jsonb,
  dopo jsonb,
  versione_software text,
  created_at timestamptz not null default now()
);
create index if not exists imaging_misure_eventi_misura on imaging_misure_eventi (misura_id, created_at);
