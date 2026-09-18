-- 18.9.2026 — la stessa coppia «da → a» può essere una parola o uno stile.
--
-- La chiave unica era (studio_id, da, a) e la 029 ha aggiunto `tipo` senza
-- estenderla: chi arrivava secondo non cambiava il tipo, si limitava ad
-- alzare il conteggio del primo. Così una riformulazione di stile poteva
-- restare marchiata «parola» e tornare alla catena come sostituzione da
-- dizionario, cioè applicata nel punto sbagliato.
alter table referti_suggerimenti drop constraint if exists referti_suggerimenti_studio_id_da_a_key;
create unique index if not exists referti_suggerimenti_studio_da_a_tipo
  on referti_suggerimenti (studio_id, da, a, tipo);
