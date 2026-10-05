-- Il paziente scelto quando si carica o si detta l'audio (5.10.2026): la
-- bozza nasce già collegata alla sua cartella, senza dover riconoscere il
-- nome dal dettato. Facoltativo.
alter table referti_audio add column if not exists patient_id uuid references patients(id) on delete set null;
