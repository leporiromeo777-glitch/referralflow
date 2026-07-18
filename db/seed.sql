insert into referring_doctors (nome, studio, email) values
  ('Dott. Rossi', 'Studio medico Lugano', 'rossi@example.ch'),
  ('Dott.ssa Conti', 'Poliambulatorio Bellinzona', 'conti@example.ch'),
  ('Dott. Greco', 'Studio Greco, Chiasso', 'greco@example.ch');

insert into patients (cognome, nome, data_nascita, telefono) values
  ('Bianchi', 'Marco', '1957-03-11', '+41 79 000 00 01'),
  ('Ferrari', 'Anna', '1951-07-22', '+41 79 000 00 02'),
  ('Moretti', 'Luigi', '1964-01-09', '+41 79 000 00 03');

insert into referrals (patient_id, referring_doctor_id, quesito, urgenza, status, canale)
select p.id, d.id, 'Sospetta angina instabile', 'urgente', 'ricevuta', 'hin'
from patients p, referring_doctors d where p.cognome='Bianchi' and d.nome='Dott. Rossi';

insert into referrals (patient_id, referring_doctor_id, quesito, urgenza, status, canale)
select p.id, d.id, 'Eco di controllo scompenso', 'normale', 'da_prenotare', 'fax'
from patients p, referring_doctors d where p.cognome='Ferrari' and d.nome='Dott.ssa Conti';

insert into referrals (patient_id, referring_doctor_id, quesito, urgenza, status, canale, appuntamento_at)
select p.id, d.id, 'Valutazione aritmia (Holter)', 'normale', 'prenotata', 'form', now() + interval '4 days'
from patients p, referring_doctors d where p.cognome='Moretti' and d.nome='Dott. Greco';

-- Medici interni (fornitori di prestazioni) con alias per il calendario unico.
insert into providers (nome, aliases) values
  ('Dr.ssa Verdi', array['Verdi']),
  ('Dr. Neri',     array['Neri']);

-- Feed iCal demo: in sviluppo punta alla rotta locale di esempio.
insert into agenda_feeds (nome, url, match_field) values
  ('Agenda Cassa dei Medici (demo)', 'http://localhost:3000/api/agenda-demo', 'summary');
