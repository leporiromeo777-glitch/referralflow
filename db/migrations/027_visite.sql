-- Visite registrate (ambient scribe locale, base 2026-08-24): stesso binario
-- dei referti dettati, ma il tipo distingue i due flussi — la pipeline produce
-- una NOTA DI VISITA strutturata invece della lettera, e la pagina dedicata
-- /visite mostra solo queste. Il consenso esplicito del paziente alla
-- registrazione (art. 179ter CP) è responsabilità dello studio: la pagina
-- lo ricorda a ogni caricamento.

alter table referti_audio
  add column if not exists tipo text not null default 'referto'
    check (tipo in ('referto', 'visita'));

alter table referti_bozze
  add column if not exists tipo text not null default 'referto'
    check (tipo in ('referto', 'visita'));

create index if not exists referti_bozze_tipo_idx on referti_bozze (studio_id, tipo, stato);
