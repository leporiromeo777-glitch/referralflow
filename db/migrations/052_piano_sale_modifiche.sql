-- Le correzioni a mano al piano delle sale (15.9.2026).
--
-- Il piano lo calcolano le regole; ma la giornata vera cambia — uno non viene,
-- una sala serve a un altro — e chi è in studio deve poterlo dire senza
-- riscrivere la pagina wiki. Ogni voce è {stanza, dalle, chi, da, quando}:
-- `chi` vuoto vuol dire «sala libera». Vale solo per quel giorno; le regole
-- restano quelle della pagina.
alter table piano_sale add column if not exists modifiche jsonb not null default '[]'::jsonb;
