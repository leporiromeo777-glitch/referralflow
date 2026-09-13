---
tipo: piattaforma
aggiornata: 2026-09-14
---
# Prossimi lavori (in ordine di valore)

1. **Stripe su «Attiva il tuo studio»** — le basi ci sono (migrazioni 012+013). PREREQUISITI lato utente: ditta/Sagl + AGB + contratto trattamento dati validati da un legale. Non accendere i pagamenti prima.
2. **Cartella digitale, fase 2** — 2FA e cifratura at-rest FATTE. Restano: contratto di trattamento dati standard con gli studi (modelli FMH e bozza in `docs/legale/`), pagina pubblica «Sicurezza». Fase 3 quando gli studi la chiedono: note di visita strutturate (cartella primaria ex art. 67 LSan), integrazione HIN, export PDF/A.
3. **Richiami automatici al paziente** (SMS alla scadenza del follow-up).
4. **Smistamento suggerito per parole chiave** (quesito → servizio/medico).
5. **Chat AI su «Affida paziente»** (serve chiave API Anthropic e la stessa validazione legale della cattura impegnativa).
6. **Referto strutturato: invio HIN** (dipende da account HIN).
7. **Migrazione a Next 16** (advisory residue di `npm audit`, feature non usate).

## Interfaccia nuova ([[Piattaforma/Prototipo stack]])
- Schermata di accesso propria, pagina «Studio» e Profilo (password propria, 2FA) FATTI il 14.9.2026: l'interfaccia nuova non ha più bisogno della classica per nulla.
- «Frasi a rischio» della catena nella revisione nuova: escluse per scelta dell'utente il 14.9.2026; se cambia idea, è un passo in `costruisciRevisione` come gli altri.
- Statistiche, amministrazione, comunicazioni, visite: sezioni ancora senza dati propri nell'interfaccia nuova.
- Anonimizzazione: il .docx torna come testo; la versione classica restituisce un .docx anonimizzato con la formattazione.

## Prototipo, assistente e procedure ([[Piattaforma/Procedure e tracce]])
- Mostrare il «Perché?» delle scelte umane nel cruscotto Qualità AI accanto alle proposte di dizionario; oggi si salva soltanto.
- Una pagina «Tracce» nella piattaforma (elenco di `assistente_tracce` per procedura e giorno): oggi la traccia si vede solo sotto la risposta.
- Grafo dei fatti nel bot, registro delle procedure, organizzazione e interprete delle domande scritte FATTI (13.9.2026 notte). Restano: rivedere con lo studio le responsabilità nella pagina «Organizzazione dello studio» (oggi una proposta); ogni settimana leggere le tracce `domanda_libera` e `interpretazione` e allargare frasi e parole chiave del registro con un caso di test per ciascuna.
- Le risposte immediate del ponte (numeri della giornata, ricerca documenti) vivono ancora nel JavaScript del prototipo: portarle nell'interprete lato server, così anche loro hanno una traccia.
- Leggere ogni settimana le domande libere nelle tracce: le più frequenti diventano procedure.
- Referti confermati prima del 13.9.2026: «lettere in ritardo» non li giudica (l'evento `word_scaricato` non c'era).

## Catena dei referti
- **Lettera precedente dalla cartella** FATTA (12.9.2026, [[Catena/Formato lettera e Word]]): resta da provare sul terzo referto vero e da decidere se, più avanti, il robot MediOnline in sola lettura possa caricarla da solo.
- **Blocco «Allegato:» nel Word** FATTO (12.9.2026): da vedere sul terzo referto vero se le note della segreteria agganciano i documenti giusti.
- Usare «Impagina come lettera» PRIMA di correggere sul prossimo dettato vero, per misurare se le regole di forma tolgono davvero le correzioni di formato.
- Passata doppia di whisper FATTA (11.9.2026, vedi [[Catena/Sentinelle e recuperi]]): verificare sui prossimi dettati veri quante volte vince la corsa senza VAD (log `recuperato_senza_vad`) e se i tempi restano accettabili.
- Terapia: ripulire il tag `qwen3.8:27b` inutilizzabile (17 GB) da Ollama; telefono dello studio in Impostazioni per la riga Tel della carta intestata.
- Guardare ogni settimana nel cruscotto: proposte di dizionario, frasi che il medico ripete, quale tappa aiuta davvero ([[Catena/Audit e qualità]]).
- Whisper addestrato sulla voce del medico (audio conservato + testi confermati): solo con un oro verificato; per ora si accumulano dati.
