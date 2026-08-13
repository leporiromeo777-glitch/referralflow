-- Audio dei referti caricati dalla piattaforma (drag & drop nella pagina
-- Referti): entrano in una coda che la pipeline del Mac dello studio preleva
-- (GET autenticato col token referti), trascrive e restituisce come bozza.
-- L'audio resta collegato alla bozza: nel dettaglio si può riascoltare.

create table if not exists referti_audio (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  filename    text not null,
  storage_key text not null,
  content_type text,
  -- in_coda -> elaborazione (prelevato dal Mac) -> fatto | errore
  stato       text not null default 'in_coda'
                check (stato in ('in_coda', 'elaborazione', 'fatto', 'errore')),
  bozza_id    uuid references referti_bozze(id) on delete set null,
  uploaded_by uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists referti_audio_studio_idx on referti_audio (studio_id, stato, created_at);
