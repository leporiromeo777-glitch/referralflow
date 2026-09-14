-- Colore dell'agenda di MediOnline su una prestazione del catalogo (15.9.2026).
--
-- Nel riquadro dell'agenda MediOnline scrive SOLO l'identità del paziente: non
-- c'è un motivo, e le parole chiave non hanno niente da agganciare. L'unico
-- segnale del tipo di appuntamento è il colore del riquadro. Legandolo alla
-- prestazione, l'agenda e «Da fatturare» sanno finalmente che cosa è stato
-- fatto — senza che nessuno debba ridigitarlo.
alter table prestazioni_catalogo add column if not exists colore text;

create unique index if not exists prestazioni_catalogo_colore_idx
  on prestazioni_catalogo (studio_id, colore) where colore is not null;
