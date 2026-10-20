-- Pressione: l'invio dal generatore dei referti Aktiia (20.10.2026,
-- docs/wiki/Piattaforma/Pressione.md). Il generatore (un file HTML sui
-- computer dello studio) manda, DOPO la conferma del medico, le misure e il
-- referto Word a /api/pressione/invio con una chiave dello studio.
-- La chiave è una credenziale: in tabella solo l'hash sha256, come per la
-- chiave delle bozze di referto.
alter table studios add column if not exists pressione_token_hash text;
alter table studios add column if not exists pressione_token_set_at timestamptz;

-- Un invio che non si aggancia da solo a una persona aspetta fra gli arrivi
-- «da assegnare» con quello che serve per finire il lavoro quando la si sceglie:
-- giorno e notte del paziente e il referto Word (nello storage, finché non ha
-- una cartella; poi diventa un documento del paziente).
alter table pa_arrivi add column if not exists impostazioni jsonb;
alter table pa_arrivi add column if not exists referto_key text;
alter table pa_arrivi add column if not exists referto_nome text;
