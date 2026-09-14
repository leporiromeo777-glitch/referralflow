# Registro dei fornitori cloud (Ricerca 17 §17.9)

Ogni servizio esterno che riceve dati, anche pseudonimizzati, ha una scheda.
La catena rifiuta le chiamate verso indirizzi fuori dalla lista autorizzata
(`FORNITORI_AUTORIZZATI` in pipeline.py; estendibile con `REFERTI_FORNITORI`
solo dopo aver aggiornato questo registro).

## Infomaniak — AI Tools (API OpenAI-compatibile)

| Voce | Stato al 6.9.2026 |
|---|---|
| Servizio | inferenza LLM (google/gemma-4-31B-it) su testo pseudonimizzato |
| Indirizzo autorizzato | https://api.infomaniak.com/ |
| Sede dei server | Svizzera (Ginevra) secondo le pagine pubbliche — da confermare per iscritto |
| Contratto di trattamento (DPA/ADV art. 9 LPD) | DA OTTENERE (email 1 in email-infomaniak.md) |
| Misure tecniche e organizzative (TOM) | ISO 27001 dichiarata; TOM formali da richiedere |
| Sub-fornitori | da chiedere |
| Conservazione di prompt e risposte | pagine pubbliche: «non registrate»; CGU «LLM API» ambigue → DA CONFERMARE |
| Uso per addestramento | pagine pubbliche: no; una sintesi terza dice il contrario → DA CONFERMARE |
| Classi di dati ammesse | solo testo pseudonimizzato; mai audio, mai identificativi, mai documento intero quando bastano gli span. Dal 15.9.2026 anche la classe **«domanda medica generale»**: testo che NON contiene dati personali (una domanda di medicina riscritta e approvata da una persona), usata dalla funzione «Domanda medica» della piattaforma con `google/gemma-4-31B-it` |
| Chiavi | `~/.referralflow-esterno.conf` (chmod 600), scadenza da annotare |
| Data di revisione | da fissare: alla risposta di Infomaniak, poi annuale |
| Alternativa | Safe Swiss Cloud (Zurigo, ISO 27001/17/18: Apertus 70B, DeepSeek, Qwen3, Gemma) |

### Modelli disponibili sull'account (letti da `/v1/models` il 14.9.2026)
`swiss-ai/Apertus-v1.5-70B` · `Qwen/Qwen3.5-397B-A17B-FP8` · `Qwen/Qwen3.5-122B-A10B-FP8` · `moonshotai/Kimi-K2.6` · `mistralai/Mistral-Small-4-119B-2603` · `mistralai/Ministral-3-14B-Instruct-2512` · `google/gemma-4-31B-it` (quello che la catena usa oggi) · `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8` (provato e non adottato, [[Decisioni/Registro]]). Incorporamenti: `Qwen/Qwen3-Embedding-8B`, `bge_multilingual_gemma2`, `mini_lm_l12_v2`.

**DeepSeek non c'è.** Chi lo volesse deve passare dall'API cinese (dati in Cina, legge sull'intelligence del 2017, servizio bloccato dal Garante italiano nel gennaio 2025) o da Safe Swiss Cloud (Zurigo, ma minimo CHF 95/mese). Sull'account Infomaniak ci sono però **due modelli cinesi a pesi aperti serviti in Svizzera** — Qwen 3.5 397B e Kimi K2.6 — che coprono lo stesso bisogno senza uscire dal fornitore già autorizzato.

Nota per la catena (`~/.referralflow-esterno.conf`): la **generazione** usa `google/gemma-4-31B-it`, la **verifica** già `Qwen/Qwen3.5-397B-A17B-FP8`. Sullo stesso account ci sono altri modelli grandi (Kimi K2.6, Mistral Small 4 119B, Apertus 70B): se si valuta di alzare il modello di generazione, si fa con un banco, non a intuito ([[Misure/Banchi]]).

## Scaleway (Francia) — SOLO banchi su dati sintetici
Non autorizzato per dati di pazienti. Chiavi in scadenza il 9.9.2026; da non rinnovare senza motivo.

## Exoscale SOS (Svizzera) — backup off-site del DB
Contiene testo clinico cifrato: la scheda va completata nella DSFA (DPA Exoscale, regione, cifratura).
