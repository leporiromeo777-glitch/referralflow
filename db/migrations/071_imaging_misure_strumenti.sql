-- Gli strumenti della fase 3 (20.9.2026): polilinea, angolo, rettangolo,
-- ellisse, poligono, perimetro, punto, oltre alla distanza.
--
-- Stessa tabella, stesse regole: punti in pixel nativi, valore pieno nell'unità
-- dell'algoritmo (mm, mm², gradi), valore mostrato a parte, calibrazione e
-- geometria copiate, Gate, doppio controllo, eventi. Il punto non ha un
-- «valore»: ha due coordinate, che stanno in `extra` — per questo `valore`
-- diventa nullo. `extra` porta ciò che l'algoritmo calcola oltre al valore
-- principale (perimetro di un poligono, semiassi di un'ellisse, bracci di un
-- angolo), sempre in millimetri.

alter table imaging_misure_manuali drop constraint if exists imaging_misure_manuali_tipo_check;
alter table imaging_misure_manuali add constraint imaging_misure_manuali_tipo_check
  check (tipo in ('distanza', 'polilinea', 'angolo', 'rettangolo', 'ellisse', 'poligono', 'perimetro', 'punto'));
alter table imaging_misure_manuali alter column valore drop not null;
alter table imaging_misure_manuali add column if not exists extra jsonb;
