-- Registro della ricerca clinica esterna protetta — passo 8 (16.9.2026).
--
-- Qui, al contrario del registro delle anonimizzazioni, il testo ENTRA: lo
-- chiede il disegno della funzione, e la ragione è diversa. Le anonimizzazioni
-- servono a non far uscire un documento, quindi conservarlo sarebbe un
-- controsenso; questa è una consulenza su un paziente, e di una consulenza si
-- deve poter dire mesi dopo che cosa era stato chiesto, che cosa era uscito,
-- che cosa era tornato e che cosa ne ha fatto il medico. Il database sta sul
-- Mac dello studio, in Svizzera, e contiene già i referti.
--
-- Una riga per ricerca. Nasce «preparata» — anche quando non parte niente, ed
-- è giusto che resti scritto che una domanda è stata preparata e mai mandata —
-- e avanza: inviata → risposta → confermata o scartata.
create table if not exists ricerche_cliniche (
  id                 uuid primary key default gen_random_uuid(),
  studio_id          uuid not null references studios(id) on delete cascade,
  user_id            uuid references users(id),
  patient_id         uuid not null references patients(id) on delete cascade,
  stato              text not null default 'preparata',

  -- passo 1-4: che cosa è stato chiesto e che cosa è stato scelto per l'esterno
  domanda            text not null,          -- come l'ha scritta il medico, col paziente dentro
  cartella_caratteri integer not null default 0,
  contesto           text not null default '',   -- il pacchetto pseudonimizzato
  domanda_generale   text not null default '',
  controllo          jsonb not null default '{}'::jsonb,
  modificato_a_mano  boolean not null default false,

  -- passo 5: dov'è andato e che cosa è tornato
  fornitore          text,
  modello_locale     text,
  modello_esterno    text,
  risposta_esterna   text,

  -- passo 6-7: la risposta rimessa insieme qui
  risposta_finale    text,
  fonti              jsonb not null default '[]'::jsonb,
  da_verificare      jsonb not null default '[]'::jsonb,
  certezza           text,

  ms_locale          integer,
  ms_esterno         integer,
  ms_finale          integer,

  -- passo 8: che cosa ne ha fatto il medico
  conferma           text,
  nota_medico        text,

  inviato_at         timestamptz,
  confermato_at      timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists ricerche_cliniche_studio_idx on ricerche_cliniche (studio_id, created_at desc);
create index if not exists ricerche_cliniche_paziente_idx on ricerche_cliniche (patient_id, created_at desc);
