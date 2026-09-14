-- Stato dell'appuntamento come lo segna MediOnline con l'icona in alto a destra
-- del riquadro (fissato, arrivato, in_corso, da_fatturare, trattato, fatturato,
-- scusato, annullato, bloccato). Lo legge il robot dell'agenda in sola lettura e
-- arriva nell'ICS come X-RF-STATO. Serve al controllo «fatto ma mai fatturato»:
-- la piattaforma non fattura, verifica.
alter table appointments add column if not exists stato_medionline text;
alter table appointments add column if not exists stato_visto_at timestamptz;

create index if not exists appointments_stato_idx
  on appointments (studio_id, stato_medionline, starts_at desc);
