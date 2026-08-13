-- Dati demo per l'anteprima locale di ReferralFlow.
-- Va eseguito DOPO aver creato lo studio demo e l'utente admin:
--   npm run create-studio -- "Centro Cardiologico Ticino (demo)" studio-demo ...
--   npm run create-user   -- admin@demo.ch demo1234 admin studio-demo
-- È idempotente: se lo studio demo ha già dei consulti, non fa nulla.
-- I nomi dei pazienti sono inventati: servono solo a riempire le schermate.
do $$
declare
  sid       uuid;
  admin_id  uuid;
  doc_rossi uuid;
  doc_bianchi uuid;
  prov      uuid;
  pat_ricci uuid;
  pat_galli uuid;
  ref_ricci uuid;
  ref_galli uuid;
begin
  select id into sid from studios where slug = 'studio-demo';
  if sid is null then
    raise notice 'Studio demo (slug studio-demo) non trovato: crealo prima con create-studio.';
    return;
  end if;
  if exists (select 1 from consulti where studio_id = sid) then
    raise notice 'Dati demo già presenti: non ricreo nulla.';
    return;
  end if;
  select id into admin_id from users where studio_id = sid order by created_at limit 1;

  -- Medici invianti
  insert into referring_doctors (studio_id, nome, studio, email, telefono)
    values (sid, 'Dr. Rossi', 'Studio Medico Viganello', 'rossi@demo.ch', '+41 91 111 11 11')
    returning id into doc_rossi;
  insert into referring_doctors (studio_id, nome, studio, email, telefono)
    values (sid, 'Dr.ssa Bianchi', 'Ambulatorio Paradiso', 'bianchi@demo.ch', '+41 91 222 22 22')
    returning id into doc_bianchi;

  -- Medico che visita (per il Programma del giorno)
  insert into providers (studio_id, nome) values (sid, 'Dr. Ferrari') returning id into prov;

  -- Finestre di disponibilità (slot proposto)
  insert into slot_finestre (studio_id, giorno, ora_inizio, ora_fine, durata_min) values
    (sid, 1, '09:00', '12:00', 30),
    (sid, 3, '14:00', '17:00', 30),
    (sid, 5, '09:00', '11:00', 20);

  -- Consulti rapidi: uno aperto, uno già risposto
  insert into consulti (studio_id, referring_doctor_id, domanda, stato, created_at)
    values (sid, doc_rossi,
      'Paziente 72 anni in terapia con bisoprololo, riferisce cardiopalmo saltuario. L''ECG allegato mostra alcune extrasistoli. Serve una visita cardiologica o posso gestire in ambulatorio con un Holter?',
      'aperto', now() - interval '3 hours');
  insert into consulti (studio_id, referring_doctor_id, domanda, risposta, stato, answered_by, answered_at, created_at)
    values (sid, doc_bianchi,
      'Donna 58 anni, ipertensione ben controllata. Posso proseguire con la terapia attuale o è indicata una rivalutazione?',
      'Terapia adeguata: prosegua pure. Consiglio un controllo pressorio delle 24 ore tra 6 mesi; se i valori restano stabili non serve la visita. Resto a disposizione.',
      'risposto', admin_id, now() - interval '1 day', now() - interval '2 days');

  -- Referral urgente con questionario pre-visita e slot proposto
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Ricci', 'Franco', '1957-04-12', '+41 79 333 33 33') returning id into pat_ricci;
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale,
                         slot_proposto, questionario, questionario_at, created_at)
    values (sid, pat_ricci, doc_rossi, 'Valutazione dispnea da sforzo, sospetta angina.', 'urgente',
      'ricevuta', 'form',
      (date_trunc('week', now()) + interval '7 days 14 hours'),
      '{"motivo":"Affanno sotto sforzo da circa un mese, soprattutto salendo le scale.","farmaci":"Ramipril 5 mg al mattino, atorvastatina 20 mg la sera.","allergie":"Mezzo di contrasto iodato","note":"Porto con me gli esami del sangue fatti la settimana scorsa."}'::jsonb,
      now() - interval '2 hours', now() - interval '5 hours')
    returning id into ref_ricci;
  insert into referral_status_history (referral_id, to_status, nota)
    values (ref_ricci, 'ricevuta', 'Inviata dal medico di base');

  -- Referral prenotato con appuntamento oggi (scheda pre-visita nel Programma)
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Galli', 'Marta', '1962-09-03', '+41 79 444 44 44') returning id into pat_galli;
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale,
                         appuntamento_at, questionario, questionario_at, created_at)
    values (sid, pat_galli, doc_bianchi, 'Holter delle 24 ore.', 'normale', 'prenotata', 'form',
      (current_date + interval '14 hours'),
      '{"motivo":"Palpitazioni serali occasionali.","farmaci":"Nessuno","allergie":"Nessuna nota","note":""}'::jsonb,
      now() - interval '1 day', now() - interval '3 days')
    returning id into ref_galli;
  insert into appointments (studio_id, provider_id, starts_at, ends_at, paziente_nome, motivo, external_uid, referral_id)
    values (sid, prov, (current_date + interval '14 hours'), (current_date + interval '14 hours 30 minutes'),
      'Galli Marta', 'Holter 24h', 'demo-uid-1', ref_galli);

  raise notice 'Dati demo creati.';
end $$;

-- ── Dati demo del dott. Marco Bonomo ────────────────────────────────────────
-- Blocco separato e idempotente: gira anche sui database d'anteprima già
-- creati (guardia sul provider). Pazienti e casi sono inventati.
do $$
declare
  sid uuid;
  prov uuid;
  doc_rossi uuid;
  doc_bianchi uuid;
  paz_fontana uuid;
  paz_sala uuid;
  paz_colombo uuid;
  paz_ferrari uuid;
  paz_vanoni uuid;
  ref_fontana uuid;
  ref_disdetta uuid;
begin
  select id into sid from studios where slug = 'studio-demo';
  if sid is null then return; end if;
  if exists (select 1 from providers where studio_id = sid and nome = 'Dr. Bonomo') then
    raise notice 'Dati demo del dr. Bonomo già presenti.';
    return;
  end if;

  insert into providers (studio_id, nome, aliases)
    values (sid, 'Dr. Bonomo', array['Bonomo', 'Marco Bonomo'])
    returning id into prov;

  select id into doc_rossi from referring_doctors where studio_id = sid and nome = 'Dr. Rossi' limit 1;
  select id into doc_bianchi from referring_doctors where studio_id = sid and nome = 'Dr.ssa Bianchi' limit 1;

  -- Pazienti del dr. Bonomo
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Fontana', 'Elio', '1949-02-17', '+41 79 555 55 51') returning id into paz_fontana;
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Sala', 'Pietro', '1958-11-02', '+41 79 555 55 52') returning id into paz_sala;
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Colombo', 'Anna', '1972-06-30', '+41 79 555 55 53') returning id into paz_colombo;
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Ferrari', 'Luca', '1946-09-08', '+41 79 555 55 54') returning id into paz_ferrari;
  insert into patients (studio_id, cognome, nome, data_nascita, telefono)
    values (sid, 'Vanoni', 'Marta', '1980-03-25', '+41 79 555 55 55') returning id into paz_vanoni;

  -- Visita di oggi alle 10:30 con questionario pre-visita compilato
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale,
                         appuntamento_at, questionario, questionario_at)
    values (sid, paz_fontana, doc_rossi, 'Visita cardiologica ed eco di controllo.', 'normale',
            'prenotata', 'form', (current_date + interval '10 hours 30 minutes'),
            '{"motivo":"Un po'' di fiato corto salendo le scale, da un paio di settimane.","farmaci":"Bisoprololo 2,5 mg, ramipril 5 mg.","allergie":"Nessuna nota","note":"Porto gli esami del sangue recenti."}'::jsonb,
            now() - interval '1 day')
    returning id into ref_fontana;
  insert into referral_status_history (referral_id, to_status, nota)
    values (ref_fontana, 'ricevuta', 'Inviata dal medico di base');

  -- La sua giornata di oggi in agenda
  insert into appointments (studio_id, provider_id, starts_at, ends_at, paziente_nome, motivo, external_uid, referral_id) values
    (sid, prov, current_date + interval '9 hours',  current_date + interval '9 hours 45 minutes',  'Sala Pietro',  'Eco da sforzo',      'demo-bonomo-1', null),
    (sid, prov, current_date + interval '10 hours 30 minutes', current_date + interval '11 hours 15 minutes', 'Fontana Elio', 'Visita + eco', 'demo-bonomo-2', ref_fontana),
    (sid, prov, current_date + interval '15 hours', current_date + interval '15 hours 30 minutes', 'Colombo Anna', 'Holter 24h',        'demo-bonomo-3', null);

  -- Coda: un urgente da smistare e una richiesta nuova
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale)
    values (sid, paz_ferrari, doc_rossi, 'Angina da sforzo in peggioramento, chiedo valutazione in tempi brevi.', 'urgente', 'da_prenotare', 'hin');
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale)
    values (sid, paz_vanoni, doc_bianchi, 'Palpitazioni ricorrenti a riposo.', 'normale', 'ricevuta', 'form');

  -- Un follow-up scaduto (controllo a 6 mesi non ancora richiamato)
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale,
                         follow_up_months, follow_up_due)
    values (sid, paz_sala, doc_rossi, 'Controllo post scompenso.', 'normale', 'chiusa', 'telefono',
            6, current_date - 3);

  -- Una disdetta da confermare (per la scheda Disdette e la lista d''attesa)
  insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale,
                         appuntamento_at, appt_response)
    values (sid, paz_colombo, doc_bianchi, 'Eco di controllo annuale.', 'programmabile', 'prenotata', 'form',
            current_date + interval '1 day 14 hours', 'disdetta_da_confermare')
    returning id into ref_disdetta;

  -- Cartella di Fontana Elio: documenti che la segretaria AI può agganciare
  insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota) values
    (sid, paz_fontana, 'ECG gennaio 2026.pdf',               'demo/bonomo-ecg-gennaio.pdf',  'ecg',     'Tracciato di gennaio'),
    (sid, paz_fontana, 'Email dottor Rossi - eco marzo.pdf', 'demo/bonomo-email-rossi.pdf', 'lettera', 'Vecchia email del dottor Rossi con l''eco');

  -- Un consulto rapido in attesa di risposta
  insert into consulti (studio_id, referring_doctor_id, domanda, stato, created_at)
    values (sid, doc_rossi,
            'Uomo 77enne, il tracciato mostra extrasistoli sopraventricolari frequenti in terapia con bisoprololo: aumento il dosaggio o serve una visita dal dr. Bonomo?',
            'aperto', now() - interval '2 hours');

  raise notice 'Dati demo del dr. Bonomo creati.';
end $$;
