-- Profili per medico nella catena dei referti (2026-09-07): più medici
-- dettano con la stessa catena e ognuno ha abitudini diverse. Chi carica un
-- dettato sceglie CHI detta; la catena sul Mac dello studio si adegua
-- (rallentamento, vocabolario, dizionario) e la piattaforma, per i medici
-- in modalità «aggiornamento», chiede da sola la fusione con la lettera
-- precedente. L'elenco dei medici è di proprietà del Mac (medici.json):
-- il servizio lo pubblica qui, così la pagina Referti mostra gli stessi nomi.

alter table studios
  add column if not exists referti_medici jsonb not null default '[]'::jsonb;

-- Id del profilo (slug) scelto al caricamento e riportato dalla pipeline
-- nella bozza. Solo un'etichetta: il nome completo vive nel payload.
alter table referti_audio
  add column if not exists medico text
    check (medico is null or medico ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table referti_bozze
  add column if not exists medico text
    check (medico is null or medico ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create index if not exists referti_bozze_medico_idx on referti_bozze (studio_id, medico, created_at);
