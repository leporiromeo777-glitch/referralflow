-- 097 — Saturazione notturna (22.10.2026, richiesta dello studio: «una sezione per la saturazione notturna»; le notti
-- dell'anello O2Ring arrivano dal generatore dei referti dello studio, come i referti della pressione). Una riga per
-- invio: le notti già calcolate dal generatore (curve ridotte a un punto ogni 30 s, cadute, istogramma) e i loro totali.
-- Il paziente si riconosce da nome e data di nascita (una persona sola); se no l'invio aspetta «da assegnare» col suo
-- referto. `impronta`: lo stesso paziente con le stesse notti non entra due volte.
create table if not exists sat_registrazioni (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  patient_id    uuid references patients(id) on delete set null,
  stato         text not null default 'in_attesa' check (stato in ('in_attesa', 'assegnata', 'scartata')),
  motivo        text,
  nome_letto    text,
  nascita_letta date,
  apparecchio   text not null default 'O2Ring',
  inizio        timestamp not null,
  fine          timestamp not null,
  notti         jsonb not null,
  totale        jsonb not null,
  nota          text,
  valutazione   text,
  referto_key   text,
  referto_nome  text,
  documento_id  uuid references patient_documents(id) on delete set null,
  impronta      text not null,
  arrivato_il   timestamptz not null default now(),
  deciso_da     uuid references users(id) on delete set null,
  deciso_il     timestamptz,
  unique (studio_id, impronta)
);
create index if not exists sat_registrazioni_paziente on sat_registrazioni (studio_id, patient_id, inizio desc);
