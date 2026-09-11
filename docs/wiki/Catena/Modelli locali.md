---
tipo: tappa
aggiornata: 2026-09-11
---
# Modelli: locali ed esterno

| ruolo | modello | note |
|---|---|---|
| trascrizione A | whisper.cpp large-v3 (VAD, atempo 0.8 dal profilo) | turbo rifiutato dall'utente |
| trascrizione B | Voxtral-mini 3B (`VOXTRAL_B_SWITCH`) | testimone; base se la A collassa |
| terzo orecchio sulle cifre | Parakeet (`PARAKEET_SWITCH`) | solo avvisi |
| tappe locali della catena (`REFERTI_LLM`, `REFERTI_LLM_CORREZIONE`) | `hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS` | dal 9.9.2026, al posto di gemma3:27b e medgemma |
| impaginazione nell'app (`REFERTO_STRUTTURA_LLM` nel `.env`) | lo stesso Qwen 3.8 leggero | il gemma3 12b duplicava le sezioni |
| anonimizzatore (`ANONIMIZZA_LLM`, `MODELLO_ANONIMIZZA`) | gemma3:12b | non si contende la GPU con whisper |
| correzione, arbitro, terapia, estrazione (esterno, `modello=`) | `google/gemma-4-31B-it` via Infomaniak | testo pseudonimizzato |
| verificatori: avvocato, omissioni, coerenza, verificatore selettivo (esterno, `modello_verifica=`) | `Qwen/Qwen3.5-397B-A17B-FP8` via Infomaniak | un'altra famiglia dal correttore (11.9.2026), vedi [[Catena/Registro dei fatti e fiducia]] |
| cattura impegnativa (app) | claude-opus-5 | spenta senza `ANTHROPIC_API_KEY` |

## Qwen 3.8 (misurato 9.9.2026)
`qwen3.8:27b` di Ollama (q4, 17 GB) NON gira su questo Mac da 24 GB: Metal «Insufficient Memory», risposta vuota (da rimuovere). Gira `hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS` (14,3 GB, 15 GB residenti, 100% GPU) con `REFERTI_NUM_CTX=8192` (12288 verificato in GPU). Banco dei correttori: 11/17, pari ai migliori cloud e SOPRA gemma-4-31B (10/17), ma 225 s per chiamata contro pochi secondi; gemma3:27b 4/17, medgemma 0/17 (spilla su CPU, 877 s). `think: false` mandato a Ollama per i modelli qwen3 (pipeline e app): il pensiero si mangiava la risposta. Per tornare indietro: rimettere `gemma3:27b` nei tre punti (invio.conf, plist, .env).

## Dove si cambiano
`~/referti-pipeline/invio.conf` E il plist del servizio (`launchctl unload/load`); `.env` dell'app per l'impaginazione. Crash whisper/gemma per contesa GPU: `libera_llm()`, diagnosi nei `.ips` di CrashReporter.
