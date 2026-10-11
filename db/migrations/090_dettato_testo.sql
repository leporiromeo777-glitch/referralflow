-- 090 — Dettatura con un programma esterno (Dragon) accanto alla registrazione (11.10.2026).
-- Il medico detta in una casella del dittafono mentre la pagina registra: il testo scritto dal programma di
-- dettatura viaggia con l'audio e resta accanto al dettato. La catena continua a trascrivere l'audio per conto
-- suo; nella revisione i due testi si confrontano. `dettato_tempi`: [[secondi, caratteri], …], a che punto
-- dell'audio il testo era arrivato a quella lunghezza.
alter table referti_audio add column if not exists dettato_testo text;
alter table referti_audio add column if not exists dettato_tempi jsonb;
alter table referti_audio add column if not exists dettato_fonte text;
