---
tipo: tappa
aggiornata: 2026-09-11
---
# Revisione guidata (wizard della bozza)

`src/app/(app)/referti/[id]/RevisioneGuidata.tsx`, pagina `/referti/[id]`.

- `spezzaInFrasi` (abbreviazioni, marcatori di paragrafo `\n`, nessuna fusione per punteggiatura); `trovaIndice` non aggancia mai una frase normalizzata < 8 caratteri; segnalazioni senza frase scartate.
- **Passi, in quest'ordine** (12.9.2026, richiesta utente dopo il primo referto vero: prima le PAROLE, poi le FRASI, così chi sistema le parole non ritocca le frasi due volte): 1. «I due motori non concordano» (divergenze `pesanti`, riascolto, tre scelte: A / B auto-inserita / correggo io); 2. «Correzioni automatiche» (annullabili); 3. «Da controllare subito» (critiche: numeri non confermati, omissioni gravi con «Inserisci nel testo» che usa `pulita` e, quando c'è, la riga «Forse è già nel referto: …» con la frase più simile e le parole in comune, così una frase storpiata non viene rimessa in doppio; frasi non sostenute; variazioni grandi); 4. «Frasi da chiarire»; 5. «Frasi spente dall'AI»; 6. «Doppioni del parlato» (Rimetti / Togli); 7. «Note per la segreteria»; 8. «Campi estratti» («non indicato» = nel dettato non c'è); 9. «Rileggi e conferma» con il gate pre-firma (`override_critici`) e «Inserisci nel referto (salva senza confermare)» (`salvaTesto`, evento `testo_salvato`). I passi senza contenuto non compaiono.
- **Autosave** (7.9.2026, richiesta utente): stato (frasi, spente, segnalazioni chiuse, passo, campi, telemetria) a `POST /api/referti/revisione/[id]` ~1 s dopo ogni modifica e alla chiusura con keepalive → `referti_bozze.revisione_stato` (migrazione 032) + `testo_finale` + `campi_confermati`. La pagina lo ripassa al wizard SOLO se `testo_finale` è ancora il testo composto dallo stato (se impaginazione AI o fusione lo hanno riscritto, si riparte da quello). La ripresa tollera un elenco di frasi più lungo (`frasi.length >= n_frasi`: «Rimetti» ne aggiunge una). Le fotografie di «Annulla» non si salvano. Gli autosave sono working_draft: mai contati nelle metriche.
- **Audio**: `AudioDettato` con tempi parola-per-parola (`payload.parole`), clic per saltare; i tempi dopo un recupero senza VAD sono già sull'orologio pieno ([[Catena/Sentinelle e recuperi]]).
- **Card della pagina**: divergenze/segmenti dubbi nel testo (`<mark>`, `.ref-mark-*`), allarmi numerici, campi correggibili, Note per la segreteria (con cose da allegare), Richiamo proposto, Terapia per la lettera, Coerenza interna, Controllo della lettera, Lettera precedente / fusione, Storia e lineage (`/referti/[id]/storia`), registro eventi.
- Apertura della bozza = IN_REVIEW nell'audit; conferma = revisione registrata col ruolo di chi firma ([[Catena/Audit e qualità]]).
