---
tipo: tappa
aggiornata: 2026-09-11
---
# Revisione guidata (wizard della bozza)

`src/app/(app)/referti/[id]/RevisioneGuidata.tsx`, pagina `/referti/[id]`.

- `spezzaInFrasi` (abbreviazioni, marcatori di paragrafo `\n`, nessuna fusione per punteggiatura); `trovaIndice` non aggancia mai una frase normalizzata < 8 caratteri; segnalazioni senza frase scartate.
- **Passi**: omissioni (con «Inserisci nel testo» che usa `pulita`, etichetta «vista dal modello»), «I due motori non concordano» (divergenze `pesanti`, riascolto, tre scelte: A / B auto-inserita / correggo io), doppioni del parlato (Rimetti / Togli), correzioni applicate (annullabili), frasi non supportate, campi estratti («non indicato» = nel dettato non c'è), gate pre-firma con presa d'atto (`override_critici`), ultimo passo «Inserisci nel referto (salva senza confermare)» (`salvaTesto`, evento `testo_salvato`).
- **Autosave** (7.9.2026, richiesta utente): stato (frasi, spente, segnalazioni chiuse, passo, campi, telemetria) a `POST /api/referti/revisione/[id]` ~1 s dopo ogni modifica e alla chiusura con keepalive → `referti_bozze.revisione_stato` (migrazione 032) + `testo_finale` + `campi_confermati`. La pagina lo ripassa al wizard SOLO se `testo_finale` è ancora il testo composto dallo stato (se impaginazione AI o fusione lo hanno riscritto, si riparte da quello). La ripresa tollera un elenco di frasi più lungo (`frasi.length >= n_frasi`: «Rimetti» ne aggiunge una). Le fotografie di «Annulla» non si salvano. Gli autosave sono working_draft: mai contati nelle metriche.
- **Audio**: `AudioDettato` con tempi parola-per-parola (`payload.parole`), clic per saltare; i tempi dopo un recupero senza VAD sono già sull'orologio pieno ([[Catena/Sentinelle e recuperi]]).
- **Card della pagina**: divergenze/segmenti dubbi nel testo (`<mark>`, `.ref-mark-*`), allarmi numerici, campi correggibili, Note per la segreteria (con cose da allegare), Richiamo proposto, Terapia per la lettera, Coerenza interna, Controllo della lettera, Lettera precedente / fusione, Storia e lineage (`/referti/[id]/storia`), registro eventi.
- Apertura della bozza = IN_REVIEW nell'audit; conferma = revisione registrata col ruolo di chi firma ([[Catena/Audit e qualità]]).
