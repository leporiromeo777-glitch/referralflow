-- Posizione tariffaria della prestazione (14.9.2026): lo studio fattura con la
-- Cassa dei Medici (MediOnline); nel catalogo ogni prestazione può portare la
-- posizione TARDOC (o il forfait) che la segreteria registra là, così il CSV
-- di controllo la propone accanto alla prestazione. Testo libero: la
-- piattaforma non ha il catalogo TARDOC e non fattura.
alter table prestazioni_catalogo add column if not exists codice_tariffa text;
