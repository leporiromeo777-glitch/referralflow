-- 100 — La cartella comune letta dall'AI locale (23.10.2026, dallo studio: «tutti quelli indecisi: basta aprire il file e
-- vedere nome e data di nascita, fallo fare all'AI locale»). Per una cartella che aspetta, il modello sul Mac legge
-- l'inizio della lettera e dice di chi è; il codice controlla (nome e data di nascita scritti davvero nel testo) e
-- abbina con le regole di sempre. Qui che cosa ha letto e quando: una cartella si legge una volta sola.
alter table comune_cartelle add column if not exists ai_il timestamptz;
alter table comune_cartelle add column if not exists ai_nome text;
alter table comune_cartelle add column if not exists ai_nascita date;
