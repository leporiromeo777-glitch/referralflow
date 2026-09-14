-- Anagrafica completa del paziente (14.9.2026): sesso, indirizzo, e-mail, AVS,
-- numero assicurato, indicazione clinica e percorso (id della pagina wiki
-- Medici/Percorsi). Servono alla scheda e al CSV di fatturazione: senza AVS e
-- numero assicurato il gestionale non fattura. `assicurazione` resta la cassa.
alter table patients
  add column if not exists sesso        text,
  add column if not exists via          text,
  add column if not exists npa          text,
  add column if not exists localita     text,
  add column if not exists email        text,
  add column if not exists avs          text,
  add column if not exists n_assicurato text,
  add column if not exists indicazione  text,
  add column if not exists percorso_id  text;
-- Indirizzo dello studio (carta intestata, CSV) e moduli nascosti per studio
-- (voci della barra dell'interfaccia nuova che questo studio non usa).
alter table studios add column if not exists indirizzo text;
alter table studios add column if not exists moduli_nascosti text[] not null default '{}';
