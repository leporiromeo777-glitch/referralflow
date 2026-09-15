-- Gli ultimi cinque documenti anonimizzati si possono riscaricare (15.9.2026).
--
-- Si conserva SOLO il testo anonimizzato — mai l'originale, mai la tabella dei
-- segnaposto: quella è la chiave che permetterebbe di tornare indietro, e
-- tenerla accanto al testo annullerebbe il senso della pagina. Oltre il quinto
-- documento il testo si cancella da solo e resta la riga di registro.
alter table anonimizzazioni add column if not exists testo text;
