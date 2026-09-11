---
tipo: medico
medico: moschovitis
aggiornata: 2026-09-11
---
# Dr. med. Giorgio Moschovitis

Profilo in `pipeline-referti/medici.json` (id `moschovitis`): modalità **aggiornamento**, formato **rapporto** a sezioni (Diagnosi principali numerate con «- attuale:», Diagnosi secondarie, Comorbidità, Anamnesi, Terapia domiciliare, Esami con date, Valutazione, Procedere), `copia` («Copia: alla paziente»), `contesto`, `frasi_fisse`, `farmaci_frequenti`, vocabolario e dizionario propri.

## Come lavora la catena per lui
- La bozza in arrivo chiede DA SOLA la fusione con l'ultima lettera confermata dello stesso paziente (`fusioneAutomatica`, sempre e solo proposta; guardia d'identità e gate temporale).
- «Riorganizza nel formato standard (AI)» rimappa il dettato nel rapporto-tipo; veto del codice se cambia anche un solo numero.
- Era il medico della carta intestata fissa originale (2026-08-17): oggi la carta segue chi ha dettato.

Non ha la terapia strutturata: il blocco terapia segue il rapporto a sezioni.
