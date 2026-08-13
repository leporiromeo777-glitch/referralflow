-- Avanzamento della trascrizione in tempo reale: la pipeline del Mac segnala
-- la fase in corso (preprocessing, trascrizione, correzione…) e la pagina
-- Referti la mostra con una barra di avanzamento. Solo il nome della fase e
-- l'orario: mai contenuti.

alter table referti_audio add column if not exists fase text;
alter table referti_audio add column if not exists fase_at timestamptz;
