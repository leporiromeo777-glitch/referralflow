-- Immagini lette dal NAS dello studio (8.10.2026, docs/wiki/Piattaforma/Immagini.md).
-- Gli ecocardiogrammi che il software Philips ha già archiviato sul NAS si
-- CATALOGANO dove sono: la piattaforma si segna esami, serie e immagini, e
-- `storage_key` comincia con «nas:» seguito dal percorso dentro la cartella
-- condivisa. Non si copia niente e sul NAS non si scrive né si cancella mai.
alter table imaging_esami drop constraint if exists imaging_esami_origine_check;
alter table imaging_esami add constraint imaging_esami_origine_check
  check (origine in ('import', 'rete', 'portale', 'archivio', 'nas'));

-- Una riga per cartella d'esame del NAS: serve a riprendere il lavoro dove si
-- era fermato (sono migliaia di cartelle, ore di lettura) e a dire che cosa non
-- si è riuscito a leggere. Mai nomi né dati dell'esame: solo conteggi.
create table if not exists imaging_catalogo (
  id bigserial primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  cartella text not null,
  stato text not null check (stato in ('fatto', 'vuota', 'errore')),
  esami integer not null default 0,
  immagini integer not null default 0,
  byte bigint not null default 0,
  errore text,
  quando timestamptz not null default now(),
  unique (studio_id, cartella)
);
