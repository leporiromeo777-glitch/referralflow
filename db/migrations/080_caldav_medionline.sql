-- CalDAV di MediOnline (23.9.2026; migrazione scritta il 23.9 e applicata il
-- 29.9.2026, rinumerata da 075)
--
-- La Cassa dei Medici pubblica le agende anche via CalDAV: un calendario per
-- agenda, in lettura e in scrittura. Il robot resta la fonte dell'agenda
-- (porta colore, stato di fatturazione e id, che il CalDAV non ha); il CalDAV
-- serve a:
--   - recuperare il passato che il robot non vede più (appuntamenti con
--     feed_id di un feed apposito, spento, mai sincronizzato dal cron);
--   - controllare che il robot non salti appuntamenti (conteggi per giorno);
--   - fissare un appuntamento in MediOnline da ReferralFlow, su gesto di una
--     persona, con conferma, e annullarlo. La SCRITTURA resta spenta finché
--     lo studio non ha un utente MediOnline dedicato e un'agenda di prova
--     (CALDAV_SCRITTURA=attiva nel file delle credenziali, a mano).
--
-- caldav_calendari: i calendari visti sul server e il medico a cui
-- corrispondono (abbinamento severo per nome, o a mano).
create table if not exists caldav_calendari (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id),
  href        text not null,
  nome        text not null,
  provider_id uuid references providers(id) on delete set null,
  scrivibile  boolean not null default false,
  visto_at    timestamptz not null default now(),
  unique (studio_id, href)
);

-- caldav_scritture: ogni appuntamento che ReferralFlow ha scritto in
-- MediOnline, chi l'ha fatto e se è stato annullato. L'UID lo sceglie
-- ReferralFlow («referralflow-…@referralflow.ch»): solo questi eventi si
-- possono cancellare da qui. Il titolo contiene l'identità del paziente
-- come in appointments: resta nel DB, mai nei log.
create table if not exists caldav_scritture (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id),
  calendario_id uuid not null references caldav_calendari(id),
  uid           text not null unique,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  titolo        text not null,
  note          text,
  patient_id    uuid references patients(id) on delete set null,
  creato_da     uuid references users(id),
  creato_at     timestamptz not null default now(),
  annullato_da  uuid references users(id),
  annullato_at  timestamptz
);
create index if not exists caldav_scritture_studio on caldav_scritture (studio_id, starts_at desc);
