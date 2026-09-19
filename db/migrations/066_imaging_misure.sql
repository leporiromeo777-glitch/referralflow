-- Le misure che l'apparecchio ha già fatto (19.9.2026).
--
-- ReferralFlow non misura: una misura presa dopo, su un fotogramma esportato e
-- su uno schermo non tarato, è peggiore di quella che l'ecografista prende con
-- la sonda in mano sulla console — e produrre un numero clinico farebbe della
-- piattaforma un dispositivo medico di classe IIa
-- (docs/legale/destinazione-uso-immagini.md).
--
-- Ma quelle misure ESISTONO: viaggiano dentro il referto strutturato (SR) che
-- l'ecografo spedisce insieme alle immagini, e finora le buttavamo via.
-- Mostrarle è presentare, non produrre.
create table if not exists imaging_misure (
  id uuid primary key default gen_random_uuid(),
  esame_id uuid not null references imaging_esami(id) on delete cascade,
  immagine_id uuid references imaging_immagini(id) on delete set null,
  gruppo text,                 -- «Ventricolo sinistro»: senza, «Diametro» non dice niente
  nome text not null,
  valore double precision not null,
  unita text,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists imaging_misure_esame on imaging_misure (esame_id, ordine);
