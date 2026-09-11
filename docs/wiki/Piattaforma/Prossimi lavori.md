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
- Valutare la corsa senza VAD come passata principale (tre casi di collasso in tre giorni sullo stesso medico, vedi [[Catena/Sentinelle e recuperi]]).
- Terapia: ripulire il tag `qwen3.8:27b` inutilizzabile (17 GB) da Ollama; telefono dello studio in Impostazioni per la riga Tel della carta intestata.
- Omissioni: manca ancora la lateralità sola.
- Guardare ogni settimana le proposte di dizionario nel cruscotto ([[Catena/Audit e qualità]]).
