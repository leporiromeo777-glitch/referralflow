-- ECG a riposo (9.10.2026, docs/wiki/Piattaforma/Prova da sforzo.md): il programma dell'ECG
-- (Cardioline touchECG) scrive nella cartella «Ciclo da leggere/ecg» del Mac, per ogni esame,
-- un file GDT coi dati del paziente e il tracciato in PDF. Stessa strada dei referti della
-- ciclo, stessa tabella: qui si dice solo di che tipo è l'arrivo.
alter table ciclo_arrivi add column if not exists tipo text not null default 'ciclo';
alter table ciclo_arrivi drop constraint if exists ciclo_arrivi_tipo_check;
alter table ciclo_arrivi add constraint ciclo_arrivi_tipo_check check (tipo in ('ciclo', 'ecg'));
