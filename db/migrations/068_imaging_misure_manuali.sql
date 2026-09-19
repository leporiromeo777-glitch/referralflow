-- Il righello sull'immagine (19.9.2026).
--
-- Fino a oggi ReferralFlow mostrava le immagini e le misure fatte
-- DALL'APPARECCHIO, e non misurava: farlo lo rende un dispositivo medico. Lo
-- studio ha deciso di percorrere la strada del dispositivo «in-house» (ODmed
-- art. 9, notifica art. 18): fabbricato e usato solo dentro lo studio, senza
-- organismo notificato, con lo studio come fabbricante responsabile. Il
-- fascicolo è in docs/legale/dispositivo-in-house/.
--
-- Due cose cambiano nel dato:
-- 1. ogni immagine porta la sua CALIBRAZIONE, letta dal file dell'apparecchio
--    (mm per pixel; per le ecografie una per regione). Senza, non si misura.
-- 2. le misure fatte da una persona finiscono in una tabella loro, con chi,
--    quando, su quale immagine e fotogramma, i due punti in pixel nativi e la
--    calibrazione usata — abbastanza da rifare il calcolo fra dieci anni. Non
--    si cancellano: si ANNULLANO, e l'annullamento resta scritto. È la
--    tracciabilità che il fascicolo promette.

alter table imaging_immagini add column if not exists calibrazione jsonb;

create table if not exists imaging_misure_manuali (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  esame_id uuid not null references imaging_esami(id) on delete cascade,
  immagine_id uuid not null references imaging_immagini(id) on delete cascade,
  frame int not null default 0,
  user_id uuid references users(id),
  tipo text not null default 'distanza' check (tipo in ('distanza')),
  punti jsonb not null,                 -- [{x,y},{x,y}] in pixel nativi
  valore double precision not null,     -- millimetri
  unita text not null default 'mm',
  calibrazione jsonb not null,          -- la calibrazione usata, così com'era
  versione_calcolo text not null,       -- RFMisura.VERSIONE che ha prodotto il numero
  etichetta text,                       -- «IVSd», «Aorta ascendente»…: libera
  -- Per la validazione: la misura dell'apparecchio con cui questa si confronta.
  riferimento_misura_id uuid references imaging_misure(id) on delete set null,
  annullata_at timestamptz,
  annullata_da uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists imaging_misure_manuali_immagine on imaging_misure_manuali (immagine_id, frame, created_at);
create index if not exists imaging_misure_manuali_esame on imaging_misure_manuali (esame_id, created_at desc);
