-- Fase 13: basi per l'abbonamento (Stripe arriverà dopo i prerequisiti legali).
-- L'attivazione è intestata al medico titolare (sarà lui il pagatore);
-- gli studi self-service nascono in prova, quelli creati a mano restano 'pilota'.
-- NESSUN blocco automatico alla scadenza: solo avvisi e gestione dal pannello
-- /piattaforma del titolare della piattaforma.

begin;

-- Il medico titolare dello studio (chi decide, chi pagherà).
alter table studios add column titolare text;

-- Piano: pilota (nessuna scadenza, onboarding manuale) | prova (trial_until)
--        | attivo (paga, anche via fattura manuale) | sospeso.
alter table studios add column abbonamento text not null default 'pilota';
alter table studios add column trial_until date;

-- Predisposizione Stripe: si riempirà quando il checkout sarà attivo.
alter table studios add column stripe_customer_id text;

-- Anche la richiesta di attivazione porta il nome del titolare.
alter table studio_activations add column titolare text;

commit;
