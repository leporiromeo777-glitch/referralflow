-- 091 — Il foglio del dittafono (12.10.2026): chi detta con un programma di dettatura vede la lettera prendere
-- forma su un foglio con la carta intestata dello studio. Le parti del foglio attorno al corpo (destinatario, data,
-- titolo, paziente, saluto, chiusura e firma, copia) viaggiano col dettato; il corpo sta in `dettato_testo`.
-- Quando la catena consegna la bozza di quell'audio, la lettera del foglio diventa il testo da rivedere.
alter table referti_audio add column if not exists dettato_foglio jsonb;
