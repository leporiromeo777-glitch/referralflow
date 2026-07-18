-- Promemoria appuntamento al paziente con link di conferma/disdetta.
alter table referrals
  add column if not exists appt_token text unique default encode(gen_random_bytes(18), 'hex'),
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists appt_response text,
  add column if not exists appt_response_at timestamptz;
