-- 099 — Il numero del paziente di MediOnline (22.10.2026). Le cartelle cartacee scansionate (DocuWare) si chiamano
-- «123456_Cognome_Nome.pdf»: il numero è quello di MediOnline, che l'agenda scrive nei titoli («Cognome Nome
-- (gg.mm.aaaa / N° 123456)») e che l'esportazione dei pazienti può portare. Numero E nome riconoscono la scansione anche
-- quando la data di nascita nelle prime pagine non si legge. Si scrive solo dove manca; mai sopra un numero già scritto.
alter table patients add column if not exists numero text;
create index if not exists patients_numero on patients (studio_id, numero) where numero is not null;
