-- 096 — La sigla di chi scrive la lettera (22.10.2026, richiesta dello studio: «quando corregge l'account Valentina, le
-- lettere accanto alla data siano pc, non va»). Dopo «Lugano, gg.mm.aaaa/» va la sigla di chi ha confermato (o scarica):
-- finora presa dal nome dell'accesso; ora, se scritta qui, vale questa. Si cambia in Studio → Personale.
alter table users add column if not exists sigla text;
