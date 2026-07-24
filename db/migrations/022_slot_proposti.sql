-- Slot proposto all'invio: lo studio configura le sue finestre di visita
-- (giorno della settimana + fascia oraria + durata dello slot); dai moduli
-- d'invio il sistema propone i primi slot liberi = finestre meno gli impegni
-- già in agenda. È indicativo: non scrive nulla sull'agenda della Cassa dei
-- Medici, la segreteria conferma nella Coda.

-- Finestre di disponibilità per studio. giorno: 1=lunedì … 7=domenica (isodow).
create table if not exists slot_finestre (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  giorno      smallint not null check (giorno between 1 and 7),
  ora_inizio  time not null,
  ora_fine    time not null check (ora_fine > ora_inizio),
  durata_min  int not null default 30 check (durata_min between 5 and 240),
  created_at  timestamptz not null default now()
);

create index if not exists slot_finestre_studio_idx on slot_finestre (studio_id, giorno);

-- Slot indicativo scelto dall'inviante al momento dell'invio. La segreteria lo
-- vede sulla referral e lo usa (o no) per fissare l'appuntamento vero.
alter table referrals add column if not exists slot_proposto timestamptz;
