-- Medici invianti: specialità, indirizzo dello studio, nota (26.9.2026)
--
-- La rubrica aveva solo nome, studio, e-mail, HIN e telefono. Lo studio ha
-- consegnato l'elenco dei suoi invianti (93 righe) e gli indirizzi mancanti
-- sono stati cercati negli elenchi cantonali e nelle rubriche pubbliche.
-- `specialita` senza il prefisso «FMH» (la lettera lo aggiunge da sé);
-- `da_verificare` segna le righe dove le fonti non concordano o manca un dato:
-- la ragione sta in `note`.
alter table referring_doctors add column if not exists specialita text;
alter table referring_doctors add column if not exists via text;
alter table referring_doctors add column if not exists npa text;
alter table referring_doctors add column if not exists localita text;
alter table referring_doctors add column if not exists note text;
alter table referring_doctors add column if not exists da_verificare boolean not null default false;
