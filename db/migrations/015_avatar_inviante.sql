-- Fase 15: foto profilo del medico inviante registrato (annuario).
-- Chi «ha l'app» (utente inviante con profilo) può caricare una foto: viene
-- mostrata nella pagina «Medici invianti» dello studio. Chi non è registrato
-- resta con l'icona generica.
alter table inviante_profiles add column if not exists avatar_key text;
