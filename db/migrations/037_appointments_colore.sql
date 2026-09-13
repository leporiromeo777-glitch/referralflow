-- Colore dell'appuntamento nell'agenda MediOnline (14.9.2026): il robot lo
-- legge dal riquadro e lo manda nell'ICS (X-RF-COLORE); la piattaforma lo
-- conserva così com'è (#rrggbb) e l'interfaccia nuova lo mostra sul bordo
-- dell'appuntamento, con la legenda dei colori visti nel giorno.
alter table appointments add column if not exists colore text;
