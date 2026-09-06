-- Tre memorie del medico (2026-09-06): i suggerimenti imparati dalle
-- conferme portano il tipo — «parola» (memoria fonetica/terminologica:
-- una parola storpiata → forma giusta) oppure «stile» (formulazione
-- preferita, applicata a fine catena, mai su numeri/negazioni/lateralità).
alter table referti_suggerimenti add column if not exists tipo text not null default 'parola'
  check (tipo in ('parola', 'stile'));
