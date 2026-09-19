-- Evento «statistiche» (MSE fase 4, 20.9.2026): i valori dei pixel dentro una
-- ROI (HU per la TAC) si calcolano dopo, su una misura già salvata, e ogni
-- calcolo resta scritto con prima e dopo.
alter table imaging_misure_eventi drop constraint if exists imaging_misure_eventi_evento_check;
alter table imaging_misure_eventi add constraint imaging_misure_eventi_evento_check
  check (evento in ('creata', 'etichettata', 'riferimento', 'annullata', 'sostituita', 'statistiche'));
