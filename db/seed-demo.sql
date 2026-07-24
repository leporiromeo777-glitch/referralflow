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
