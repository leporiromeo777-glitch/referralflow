-- OCR dei documenti della cartella (28.9.2026, richiesta dello studio): un
-- PDF caricato senza testo (scansione senza OCR, esportazioni DocuWare) viene
-- passato da ocrmypdf sul Mac, a catena ferma, e sostituito dalla versione
-- con il testo. Le pagine scritte a mano restano immagini.
--   null      → non serve (non è un PDF, o ha già il testo)
--   da_fare   → in coda
--   fatto     → testo aggiunto (ocr_pagine_testo = pagine che ora ne hanno)
--   fallito   → ocrmypdf non ce l'ha fatta: il documento resta com'era
alter table patient_documents add column if not exists ocr_stato text
  check (ocr_stato is null or ocr_stato in ('da_fare', 'fatto', 'fallito'));
alter table patient_documents add column if not exists ocr_at timestamptz;
alter table patient_documents add column if not exists ocr_pagine_testo integer;
create index if not exists patient_documents_ocr on patient_documents (ocr_stato) where ocr_stato = 'da_fare';
