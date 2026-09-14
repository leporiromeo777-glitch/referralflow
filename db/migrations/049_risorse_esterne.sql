-- Una colonna dell'agenda può essere un posto che NON è vostro (15.9.2026).
--
-- `ASM` è la radiologia esterna che collabora con lo studio: i pazienti ci
-- vanno, gli appuntamenti stanno nella vostra agenda, ma non è una vostra
-- stanza. Contarla fra le sale falsa l'occupazione (non è capacità vostra) e
-- lascia credere che quelle prestazioni siano da fatturare da voi.
alter table studio_risorse drop constraint if exists studio_risorse_tipo_check;
alter table studio_risorse add constraint studio_risorse_tipo_check
  check (tipo in ('sala', 'apparecchio', 'esterno'));
