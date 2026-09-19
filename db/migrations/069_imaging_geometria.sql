-- Geometria completa dell'immagine (Measurement Safety Engine, fase 1, 19.9.2026).
--
-- La colonna `calibrazione` (068) è la vista compatta che il righello v1 usa;
-- `geometria` è tutto ciò che il file dice della dimensione fisica dei pixel
-- e del piano dell'immagine: spaziatura con la sua fonte e il suo tipo di
-- calibrazione, TUTTE le regioni ecografiche con unità e flag, aspect ratio,
-- rescale, orientamento e posizione nel paziente, tipo d'immagine, avvisi di
-- lettura. Da qui in avanti `calibrazione` si deriva da `geometria`
-- (imaging/geometria.py, calibrazione_da): una fonte sola.
--
-- `sha256`: l'impronta del file DICOM archiviato. I file non si riscrivono
-- mai; l'impronta lo dimostra, e una misura salvata può dire su quali byte
-- esatti è stata presa.

alter table imaging_immagini add column if not exists geometria jsonb;
alter table imaging_immagini add column if not exists sha256 text;
