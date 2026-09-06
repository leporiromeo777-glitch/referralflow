# Ciclo di vita dei dati della catena referti (Ricerca 17 §17.6)

Bozza del 6 settembre 2026. «Cancellare l'audio» non basta: ogni artefatto
ha la sua conservazione. Il principio: la conservazione clinica del referto
firmato non implica la conservazione degli artefatti tecnici.

| Oggetto | Dove | Finalità | Conservazione | Backup | Addestramento | Cifratura | Cancellazione | Responsabile |
|---|---|---|---|---|---|---|---|---|
| Referto firmato (`testo_finale`) | DB dello studio (Mac, LAN) | documentazione clinica | ≥ 10 anni (art. 67 LSan TI), FMH 20 | sì (pg_dump) | no | FileVault + backup cifrato | mai, salvo obbligo | titolare |
| Bozza e payload (versioni intermedie, rischio, cronologia) | DB | revisione, audit, qualità | con il referto; le versioni intermedie possono essere potate dopo 24 mesi | sì | no | idem | script di potatura (da scrivere) | titolare |
| Audio grezzo del dettato | `~/referti/ingresso` → `lavorazione` | trascrizione | fino alla consegna della bozza (201/200), poi cancellato dal servizio | no | no | FileVault | `unlink` a fine corsa | servizio |
| Audio preprocessato, wav Voxtral, json whisper, txt intermedi | `~/referti/lavorazione` | catena | fine corsa; orfani > 7 giorni cancellati (`pulizia_residui`) | no | no | FileVault | automatica | servizio |
| Copia audio per l'addestramento | `~/referti-dataset/audio` | miglioramento ASR (finalità separata) | opt-in, 24 mesi (`REFERTI_CONSERVA_GIORNI`), default DA SPEGNERE (decisione titolare) | no | sì, solo locale | volume cifrato dedicato (`mac/crea-volume-cifrato.sh`) | crittografica | titolare |
| Set d'oro / dataset QA | `~/referti-dataset/oro`, `suite-cattiva` | controllo qualità interno (classe QA) | finché serve al QA; revisione annuale | no | no (QA ≠ training) | volume cifrato | crittografica | titolare |
| Cache dei modelli locali (Ollama, HF) | `~/.ollama`, `~/.cache/huggingface` | inferenza | pesi pubblici, nessun dato paziente | no | — | — | — | servizio |
| Prompt e risposte al fornitore cloud | Infomaniak | correzione/struttura su testo pseudonimizzato | secondo contratto (da confermare per iscritto) | fornitore | NO (da confermare) | TLS + loro | fornitore | fornitore |
| Log del servizio (`servizio.log`) | `~/referti/log` | diagnostica | rotazione > 20 MB, 3 generazioni | no | — | FileVault | rotazione | servizio |
| Log dell'app (`server.log`) | `~/Library/Logs/ReferralFlow` | diagnostica | idem (newsyslog consigliato) | no | — | FileVault | rotazione | servizio |
| Registro eventi referti (`referti_eventi`) | DB | audit | con il referto | sì | no | idem | mai | titolare |
| Backup DB | `~/ReferralFlow-backup` (14 gg) + Exoscale SOS (60 gg) | continuità | 14 / 60 giorni | è il backup | no | cifrato at-rest (SSE se attivo) | rotazione | titolare |
| Telemetria di revisione (tempi, flag) | DB (`payload.revisione`) | qualità | con il referto | sì | no | idem | con il referto | titolare |

Note:
- I backup del DB CONTENGONO testo clinico (bozze e referti): la loro
  conservazione e cifratura fanno parte della DSFA.
- Nessuna copia va su PC personali o GPU a noleggio.
- Le versioni intermedie sono utili all'audit ma non sono documentazione
  clinica: potatura dopo 24 mesi da valutare col legale.
