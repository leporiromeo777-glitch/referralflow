-- Orchestrazione di sale, medici e pazienti — il grafo dello studio (16.9.2026).
--
-- Il grafo dà contesto, non decide: chi può fare cosa, dove, con che cosa,
-- insieme a chi ([[Piattaforma/Orchestrazione sale]] §1). Le regole in
-- italiano stanno nelle pagine wiki (Medici/Sale, Medici/Prestazioni e sale)
-- e vengono lette a runtime; queste tabelle tengono quel che una pagina non
-- sa dire bene — distanze in secondi, stato operativo di una stanza — e
-- fanno da cache dell'ultima lettura per chi interroga il DB direttamente.
alter table studio_risorse add column if not exists funzione       text;
alter table studio_risorse add column if not exists mobile         boolean not null default false;
alter table studio_risorse add column if not exists ripristino_min int not null default 0;
alter table studio_risorse add column if not exists stato          text not null default 'libera';

-- Secondi di spostamento fra due stanze. Assente = default dei parametri.
create table if not exists distanze_sale (
  studio_id  uuid not null references studios(id) on delete cascade,
  da         text not null,
  a          text not null,
  secondi    int  not null check (secondi >= 0),
  primary key (studio_id, da, a)
);

-- Chi può sostituire chi, e per quali prestazioni. Vuota per default: la
-- sostituzione non esiste finché lo studio non la scrive, per coppia.
create table if not exists medici_sostituibili (
  studio_id      uuid not null references studios(id) on delete cascade,
  medico         text not null,
  sostituto      text not null,
  prestazioni    text[] not null default '{}',   -- vuoto = tutte quelle che il sostituto sa fare
  primary key (studio_id, medico, sostituto)
);
