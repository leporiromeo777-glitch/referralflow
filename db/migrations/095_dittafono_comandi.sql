-- 095 — I tasti dei comandi del dittafono (22.10.2026, richiesta dello studio: «i comandi a voce ogni tanto non li
-- capisce: usiamo i tasti dello SpeechMike, un tasto per l'anamnesi, uno per le comorbidità e così via»). Per ogni
-- profilo di chi detta: quale tasto imparato (come `tasto`) inserisce quale parte della lettera — { <parte>: <tasto> }.
-- Niente dati clinici.
alter table dittafono_dispositivi add column if not exists comandi jsonb;
