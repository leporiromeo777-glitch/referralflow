-- Imparare dalle conferme: quando la segreteria corregge una bozza di referto,
-- confrontiamo il testo dell'AI con quello confermato ed estraiamo le
-- sostituzioni ricorrenti (parola sbagliata → parola giusta). Quelle che si
-- ripetono diventano suggerimenti da insegnare al dizionario della trascrizione
-- sul Mac. I dati restano dentro lo studio: la pipeline li riprende via l'endpoint
-- autenticato col token dei referti (lo stesso già in uso).

create table if not exists referti_suggerimenti (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  da         text not null,   -- come l'ha scritto la trascrizione (minuscolo)
  a          text not null,   -- come l'ha corretto la persona
  conteggio  int not null default 1,
  ignorato   boolean not null default false,
  applicato  boolean not null default false,  -- già aggiunto al dizionario del Mac
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (studio_id, da, a)
);

create index if not exists referti_suggerimenti_studio_idx
  on referti_suggerimenti (studio_id, ignorato, conteggio desc);
