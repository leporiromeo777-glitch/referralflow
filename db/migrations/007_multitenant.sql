-- Fase 7: piattaforma multi-studio.
-- Ogni studio ha i suoi utenti, medici invianti, pazienti, referral e agenda.
-- I dati esistenti vengono assegnati allo studio pilota (Centro Cardiologico Ticino).

begin;

create table studios (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  slug         text unique not null,
  notify_email text,
  telefono     text,
  created_at   timestamptz not null default now()
);

insert into studios (nome, slug)
values ('Centro Cardiologico Ticino', 'centro-cardiologico-ticino');

-- studio_id su tutte le anagrafiche: prima nullable, backfill, poi not null.
alter table users             add column studio_id uuid references studios(id);
alter table referring_doctors add column studio_id uuid references studios(id);
alter table patients          add column studio_id uuid references studios(id);
alter table referrals         add column studio_id uuid references studios(id);
alter table providers         add column studio_id uuid references studios(id);
alter table agenda_feeds      add column studio_id uuid references studios(id);
alter table appointments      add column studio_id uuid references studios(id);

update users             set studio_id = s.id from studios s where s.slug = 'centro-cardiologico-ticino';
update referring_doctors set studio_id = s.id from studios s where s.slug = 'centro-cardiologico-ticino';
update patients          set studio_id = s.id from studios s where s.slug = 'centro-cardiologico-ticino';
update referrals         set studio_id = s.id from studios s where s.slug = 'centro-cardiologico-ticino';
update providers         set studio_id = s.id from studios s where s.slug = 'centro-cardiologico-ticino';
update agenda_feeds      set studio_id = s.id from studios s where s.slug = 'centro-cardiologico-ticino';
update appointments a    set studio_id = f.studio_id from agenda_feeds f where a.feed_id = f.id;
update appointments      set studio_id = s.id from studios s
  where s.slug = 'centro-cardiologico-ticino' and appointments.studio_id is null;

alter table users             alter column studio_id set not null;
alter table referring_doctors alter column studio_id set not null;
alter table patients          alter column studio_id set not null;
alter table referrals         alter column studio_id set not null;
alter table providers         alter column studio_id set not null;
alter table agenda_feeds      alter column studio_id set not null;
alter table appointments      alter column studio_id set not null;

-- Referral affidate da un altro studio della piattaforma (monitoraggio «Inviati»).
alter table referrals add column origin_studio_id uuid references studios(id);

-- Gli utenti si disattivano, non si eliminano (restano nell'audit della cronologia).
alter table users add column attivo boolean not null default true;

create index on referrals (studio_id, status);
create index on referrals (origin_studio_id) where origin_studio_id is not null;
create index on appointments (studio_id, starts_at);
create index on referring_doctors (studio_id);

commit;
