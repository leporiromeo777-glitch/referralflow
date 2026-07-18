-- Follow-up: alla chiusura si indica se il paziente è da rivedere e tra quanti mesi.
-- La scadenza si calcola dall'ultima visita registrata.
alter table referrals
  add column if not exists follow_up_months int,
  add column if not exists follow_up_due date,
  add column if not exists follow_up_done_at timestamptz;

create index if not exists referrals_follow_up_due_idx
  on referrals (follow_up_due) where follow_up_done_at is null;
