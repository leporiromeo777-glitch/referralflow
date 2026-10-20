-- 092 — Il microfono di ogni medico (20.10.2026, richiesta dello studio: «il medico usa sempre lo stesso microfono:
-- che sia già scelto per ogni medico, senza ricollegarlo col tasto»). Per ogni profilo di chi detta (`medico`, come in
-- `referti_audio.medico`): il tasto imparato (tastiera o tasto del microfono da dettatura letto con WebHID), il nome del
-- microfono da registrare e se detta con Dragon. Prima stavano solo nel browser di quel computer. Niente dati clinici.
create table if not exists dittafono_dispositivi (
  studio_id     uuid not null references studios(id) on delete cascade,
  medico        text not null,
  tasto         jsonb,
  microfono     text,
  dettatura     boolean,
  aggiornato_at timestamptz not null default now(),
  aggiornato_da uuid references users(id) on delete set null,
  primary key (studio_id, medico)
);
