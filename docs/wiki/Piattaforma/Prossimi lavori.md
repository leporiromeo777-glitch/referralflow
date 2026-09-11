---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Prossimi lavori (in ordine di valore)

1. **Stripe su «Attiva il tuo studio»** — le basi ci sono (migrazioni 012+013). PREREQUISITI lato utente: ditta/Sagl + AGB + contratto trattamento dati validati da un legale. Non accendere i pagamenti prima.
2. **Cartella digitale, fase 2** — 2FA e cifratura at-rest FATTE. Restano: contratto di trattamento dati standard con gli studi (modelli FMH e bozza in `docs/legale/`), pagina pubblica «Sicurezza». Fase 3 quando gli studi la chiedono: note di visita strutturate (cartella primaria ex art. 67 LSan), integrazione HIN, export PDF/A.
3. **Richiami automatici al paziente** (SMS alla scadenza del follow-up).
4. **Smistamento suggerito per parole chiave** (quesito → servizio/medico).
5. **Chat AI su «Affida paziente»** (serve chiave API Anthropic e la stessa validazione legale della cattura impegnativa).
6. **Referto strutturato: invio HIN** (dipende da account HIN).
7. **Migrazione a Next 16** (advisory residue di `npm audit`, feature non usate).

## Catena dei referti
- Passata doppia di whisper FATTA (11.9.2026, vedi [[Catena/Sentinelle e recuperi]]): verificare sui prossimi dettati veri quante volte vince la corsa senza VAD (log `recuperato_senza_vad`) e se i tempi restano accettabili.
- Terapia: ripulire il tag `qwen3.8:27b` inutilizzabile (17 GB) da Ollama; telefono dello studio in Impostazioni per la riga Tel della carta intestata.
- Guardare ogni settimana nel cruscotto: proposte di dizionario, frasi che il medico ripete, quale tappa aiuta davvero ([[Catena/Audit e qualità]]).
- Whisper addestrato sulla voce del medico (audio conservato + testi confermati): solo con un oro verificato; per ora si accumulano dati.
