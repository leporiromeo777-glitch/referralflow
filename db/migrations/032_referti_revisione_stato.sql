-- Stato della revisione guidata salvato sul server (2026-09-07, richiesta
-- dell'utente: «se esco dal referto le correzioni non si devono
-- ripristinare»). Frasi corrette, frasi spente, segnalazioni chiuse, passo,
-- campi, telemetria: il wizard lo scrive da solo mentre si lavora e lo
-- riprende quando la bozza viene riaperta (da qualsiasi browser).
alter table referti_bozze add column if not exists revisione_stato jsonb;
