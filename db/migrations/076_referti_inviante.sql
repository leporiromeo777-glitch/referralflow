-- Referto ↔ medico inviante (26.9.2026)
--
-- Richiesta dello studio: il referto si collega da solo al medico inviante
-- della rubrica, e se l'inviante è nuovo lo si segnala. Il nome viene dai
-- campi (inviante, poi destinatario se il testo lo sostiene, poi il saluto
-- della lettera) e si cerca in rubrica senza indovinare gli omonimi
-- (src/lib/referti-inviante.ts).
--   inviante_stato: 'collegato' (uno solo in rubrica) | 'nuovo' (nessuno) |
--                   'ambiguo' (più di uno) | null (nessun nome nel referto)
--   inviante_nome:  il nome come lo dice il referto, per la segnalazione.
-- Chi rivede può collegarlo a mano: allora vince la persona (manuale).
alter table referti_bozze add column if not exists referring_doctor_id uuid references referring_doctors(id) on delete set null;
alter table referti_bozze add column if not exists inviante_stato text;
alter table referti_bozze add column if not exists inviante_nome text;
alter table referti_bozze add column if not exists inviante_manuale boolean not null default false;
create index if not exists referti_bozze_inviante on referti_bozze (referring_doctor_id) where referring_doctor_id is not null;
