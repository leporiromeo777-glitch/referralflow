-- 094 — La farmacocinetica di ogni farmaco della pressione (21.10.2026, richiesta dello studio: «tutti i farmaci
-- correlati con la loro farmacocinetica, perché l'algoritmo si deve basare sulla cinetica di ogni farmaco»).
-- I dati letti sulle informazioni ufficiali del prodotto (Tmax, biodisponibilità, emivita, stato stazionario,
-- inizio/picco/durata dell'effetto, calo pressorio, eliminazione, cibo, con le fonti e le frasi citate) stanno nel codice
-- (src/lib/pressione/cinetica-fonti.json). Nella riga:
-- `effetto_sis`/`effetto_dia`: il calo pressorio del farmaco alla dose abituale quando il testo lo dà rispetto al
--   placebo; vuoti = l'ipotesi uguale per tutti;
-- `cinetica`: da dove viene ciascuno dei quattro numeri (testo o bozza) e da quale lettura dei testi;
-- `cinetica_versione`: la lettura dei testi già applicata alla riga;
-- `numeri_a_mano`: una persona ha scritto numeri suoi — una nuova lettura dei testi non li tocca più.
-- Come sempre, valgono (finestra, calcoli, proposte) solo nella riga confermata da un medico.
alter table pa_farmaci add column if not exists cinetica jsonb;
alter table pa_farmaci add column if not exists effetto_sis numeric;
alter table pa_farmaci add column if not exists effetto_dia numeric;
alter table pa_farmaci add column if not exists cinetica_versione text;
alter table pa_farmaci add column if not exists numeri_a_mano boolean not null default false;
