-- Funzioni dell'AI locale (Ollama sul Mac dello studio, come per i referti):
-- riassunto pre-visita sulla referral e controllo nel tempo sul paziente.
-- Solo testi generati e rivisti in loco: nessun dato esce dallo studio.

alter table referrals add column if not exists riassunto_ai text;
alter table referrals add column if not exists riassunto_ai_at timestamptz;

alter table patients add column if not exists controllo_ai text;
alter table patients add column if not exists controllo_ai_at timestamptz;
