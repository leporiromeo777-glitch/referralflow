-- Che mestiere fa chi tiene un'agenda senza essere medico (15.9.2026).
--
-- `ruolo` dice se il nome può finire nella colonna «Medico» di una fattura;
-- serve anche dire COSA fa, perché «collaboratore» in agenda non aiuta
-- nessuno: l'ecografista e la dietista sono due cose diverse, e chi guarda la
-- colonna vuole sapere quale.
alter table providers add column if not exists professione text;
