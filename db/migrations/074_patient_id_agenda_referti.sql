-- Il legame vero fra agenda, referti e cartelle (22.9.2026).
--
-- Finora un appuntamento e un referto «erano» di un paziente solo perché il
-- nome scritto combaciava, ricalcolato a ogni lettura e in punti diversi del
-- codice. Misurato il 21.9.2026: 2274 appuntamenti, 7 cartelle, 4 abbinati.
-- Ora il legame si SCRIVE: `patient_id` su appuntamenti e bozze, riempito da
-- un abbinamento severo (src/lib/pazienti-abbina.ts: nome letto dal titolo
-- dell'agenda, data di nascita quando c'è, un omonimo non si indovina) ogni
-- volta che nasce un paziente, arriva l'agenda o si conferma un referto.
-- Nullo = non abbinato: resta l'abbinamento per nome di prima, come ripiego.
alter table appointments add column if not exists patient_id uuid references patients(id) on delete set null;
alter table referti_bozze add column if not exists patient_id uuid references patients(id) on delete set null;
create index if not exists appointments_patient on appointments (patient_id) where patient_id is not null;
create index if not exists referti_bozze_patient on referti_bozze (patient_id) where patient_id is not null;
