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
| Classi di dati ammesse | solo testo pseudonimizzato; mai audio, mai identificativi, mai documento intero quando bastano gli span |
| Chiavi | `~/.referralflow-esterno.conf` (chmod 600), scadenza da annotare |
| Data di revisione | da fissare: alla risposta di Infomaniak, poi annuale |
| Alternativa | Safe Swiss Cloud (Zurigo, ISO 27001/17/18: Apertus 70B, DeepSeek, Qwen3, Gemma) |

## Scaleway (Francia) — SOLO banchi su dati sintetici
Non autorizzato per dati di pazienti. Chiavi in scadenza il 9.9.2026; da non rinnovare senza motivo.

## Exoscale SOS (Svizzera) — backup off-site del DB
Contiene testo clinico cifrato: la scheda va completata nella DSFA (DPA Exoscale, regione, cifratura).
