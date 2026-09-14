-- Posti di una sala (14.9.2026): quanti pazienti possono starci nello stesso
-- momento (1 per un ambulatorio, di più per una palestra o una sala Holter).
-- L'agenda per sala dell'interfaccia nuova segnala «più pazienti dei posti»
-- quando gli appuntamenti nello stesso luogo si sovrappongono oltre questo
-- numero. L'agenda resta in sola lettura dal robot MediOnline: i posti servono
-- a vedere, non a prenotare.
alter table studio_risorse add column if not exists posti int not null default 1 check (posti >= 1 and posti <= 99);
