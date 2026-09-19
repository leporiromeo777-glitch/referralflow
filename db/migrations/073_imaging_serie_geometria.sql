-- Geometria di serie, distanza 3D, volume, piani MPR (MSE fase 9, 20.9.2026).
--
-- `imaging_serie.geometria`: che cosa la serie è come volume — normale,
-- verso, ordine delle fette lungo la normale, distanza REALE fra le fette
-- (dalle posizioni, mai da Slice Thickness), uniformità, se MPR e volume
-- sono possibili. Si calcola dalle geometrie delle immagini (mse/serie.js).
-- `imaging_misure_manuali.piano`: per una misura presa su una ricostruzione
-- MPR, il piano e l'indice (e la calibrazione virtuale con cui è stata
-- fatta); nullo per le misure sulle immagini native.
-- Due strumenti in più: distanza_3d (due punti su fette diverse, nello
-- spazio paziente) e volume (somma delle aree dei poligoni per la distanza
-- fra le fette, in mm³, mostrato in mL).

alter table imaging_serie add column if not exists geometria jsonb;
alter table imaging_misure_manuali add column if not exists piano jsonb;
alter table imaging_misure_manuali drop constraint if exists imaging_misure_manuali_tipo_check;
alter table imaging_misure_manuali add constraint imaging_misure_manuali_tipo_check
  check (tipo in ('distanza', 'polilinea', 'angolo', 'rettangolo', 'ellisse', 'poligono', 'perimetro', 'punto', 'distanza_3d', 'volume'));
