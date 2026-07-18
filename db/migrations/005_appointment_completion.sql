-- Completamento degli appuntamenti dal programma del giorno: il medico segna
-- la visita come fatta e decide il follow-up (no / 6 / 12 / N mesi).
alter table appointments
  add column if not exists completed_at timestamptz,
  add column if not exists follow_up_months int,
  add column if not exists follow_up_due date,
  add column if not exists follow_up_done_at timestamptz;

create index if not exists appointments_follow_up_due_idx
  on appointments (follow_up_due) where follow_up_done_at is null;
