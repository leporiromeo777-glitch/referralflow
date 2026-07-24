-- Questionario pre-visita: il paziente, dal promemoria dell'appuntamento
-- (/appuntamento/[token]), compila una breve anamnesi (motivo/sintomi, farmaci
-- in corso, allergie, note). Serve al medico per arrivare preparato alla visita
-- e si vede nella scheda pre-visita del Programma e nel dettaglio referral.
-- I dati stanno sulla referral come jsonb: nessun contenuto in URL o log.

alter table referrals add column if not exists questionario jsonb;
alter table referrals add column if not exists questionario_at timestamptz;
