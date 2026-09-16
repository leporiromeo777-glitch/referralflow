-- La durata misurata sa da quale appuntamento viene (16.9.2026).
--
-- Serve per DISFARE: se qualcuno preme «finito» per sbaglio, la correzione
-- deve togliere anche la durata che quel tasto ha misurato — altrimenti la
-- previsione impara che una visita cardiologica dura un minuto. Senza questa
-- colonna la riga non era rintracciabile.
alter table durate_osservate add column if not exists appointment_id uuid;
create index if not exists durate_osservate_app on durate_osservate (appointment_id);
