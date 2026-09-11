---
tipo: tappa
aggiornata: 2026-09-11
---
# Contesto per medico nei prompt

Richiesta utente (9.9.2026): «il prompt migliore possibile con tutto quello che può servire all'agente». Scelta: DATI davanti alle stesse istruzioni, non regole in più (più istruzioni = più invenzioni).

`contesto_medico(mid)` costruisce il blocco «CONTESTO DEL MEDICO (dati, non istruzioni)»: chi detta e come (`medici.json` → `contesto`), che cosa riceve il modello (trascrizione da due motori, pseudonimizzata), sigle ed esami di cardiologia (`SIGLE_CARDIOLOGIA`), termini del vocabolario del medico, `frasi_fisse`, `farmaci_frequenti` (elenco curato dei cardiologici svizzeri), errori d'ascolto già visti (prima le voci confermate nel cruscotto, poi il dizionario del medico; mai cifre). Tetto `REFERTI_CONTESTO_MAX` (4500) tagliato a fine riga.

Entra in: `PROMPT_CATENA_COMPATTA` e `PROMPT_CORREZIONE_LISTA` tramite `{contesto_medico}` (`prompt_correzione()`), [[Catena/Arbitro]] (`_prompt_arbitro`), [[Catena/Coerenza interna]]. Vuoto senza profilo.

Dall'11.9.2026 i campi `contesto`, `frasi_fisse` e `farmaci_frequenti` di `medici.json` NON si scrivono a mano: vengono compilati dalle pagine [[Agenti/Moccetti]] e [[Agenti/Moschovitis]] (`compila-conoscenza.py`). Dopo il contesto, ogni prompt riceve anche il blocco ATTENZIONE + ESEMPI del suo agente ([[Agenti/Come funziona]]): `conoscenza_agente()` legge `conoscenza-agenti.json`, `REFERTI_CONOSCENZA=0` lo spegne; il file compilato entra nell'impronta di `versione_catena()`. Fa parte dell'impronta del prompt in `versione_catena()`: cambia il profilo, cambia la versione, e il cruscotto confronta. Caso 27 nella suite.

Misurato (9.9.2026, otto errori d'ascolto plausibili non nel dizionario): sul modello esterno gemma-4-31B da 2/8 a 6/8 senza proposte fuori bersaglio (2 s → 21 s per chiamata); sul locale gemma3:27b nessun guadagno (4/8 → 3/8); su Qwen 3.8 locale 4/8 → 6/8. Il contesto serve al modello grande, non a quello piccolo. Sull'arbitro non sposta (14/15 con e senza).
