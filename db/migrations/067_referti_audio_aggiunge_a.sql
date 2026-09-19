-- Seconda traccia audio di un referto (19.9.2026).
--
-- Capita che il medico spezzi il dettato in due file: fine della memoria del
-- dittafono, un'interruzione, un'aggiunta detta dopo. Prima il secondo file
-- diventava un referto a sé, con il nome dello stesso paziente, e toccava
-- ricopiare a mano. Ora un audio può dichiarare a quale bozza si aggiunge: la
-- catena lo lavora come sempre, e alla consegna la piattaforma lo accoda al
-- referto invece di aprirne un altro — testo in fondo, parole con i tempi
-- spostati, e nel riascolto le due tracce sono una linea sola.
alter table referti_audio add column if not exists aggiunge_a uuid references referti_bozze(id) on delete set null;
create index if not exists referti_audio_aggiunge_a on referti_audio (aggiunge_a) where aggiunge_a is not null;
