# Registro delle attività di trattamento (art. 12 LPD) — catena referti

Non obbligatorio sotto i 250 collaboratori, ma economico e utile (Ricerca 17 §17.5). Bozza del 6.9.2026.

| Attività | Finalità | Categorie di dati | Interessati | Destinatari | Conservazione | Base | Misure |
|---|---|---|---|---|---|---|---|
| Dettatura e redazione assistita del referto | produzione e verifica del referto per la cura | audio della voce del medico (con dati clinici e identificativi pronunciati), testo, campi estratti, misure | pazienti, medico dettante, medico inviante | fornitore LLM svizzero (solo testo pseudonimizzato) | audio: fino alla bozza; referto: ≥10 anni | contratto di cura, art. 31 cpv. 2 lett. b LPD; art. 321 CP | vedi ciclo-vita-dati.md, DSFA |
| Misura della qualità della revisione | miglioramento del servizio | tempi, conteggi, classi di correzione, origine degli errori (nessun testo) | medici dello studio | nessuno | con il referto | interesse preponderante (qualità/sicurezza) | pseudonimo interno |
| Conservazione audio per addestramento | miglioramento del riconoscimento vocale | audio | pazienti, medico | nessuno (locale) | 24 mesi, opt-in | consenso del medico + informativa pazienti; classificazione QA/ricerca da chiarire | volume cifrato |
| Confronto cieco tra versioni | controllo qualità | due bozze dello stesso dettato, preferenza | medici | nessuno | con le bozze | interesse preponderante | pseudonimizzazione locale |
| Richiami dal referto | continuità della cura | data di follow-up | pazienti | nessuno | con la referral | contratto di cura | recinto per studio |
