-- Chi tiene un'agenda in MediOnline non è sempre un medico (15.9.2026).
--
-- La colonna DC dell'agenda — 222 appuntamenti in nove giorni, più di
-- qualunque medico, quasi sempre 34 minuti PRIMA della visita — è l'agenda di
-- un'ECOGRAFISTA. Senza registrarla, quegli appuntamenti restavano «senza
-- medico»; registrandola fra i medici sarebbe finita nella colonna «Medico»
-- del CSV di fatturazione, dove una prestazione eseguita da un collaboratore
-- va fatturata sotto il medico che la supervisiona, non sotto di lei.
--
-- Quindi: chi tiene un'agenda entra in `providers`, ma con un RUOLO. Il ruolo
-- decide dove il nome può comparire.
alter table providers add column if not exists ruolo text not null default 'medico';

alter table providers drop constraint if exists providers_ruolo_check;
alter table providers add constraint providers_ruolo_check
  check (ruolo in ('medico', 'collaboratore'));
