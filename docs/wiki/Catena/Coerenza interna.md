---
tipo: tappa
aggiornata: 2026-09-11
---
# Coerenza interna del referto (11.9.2026)

Tappa «coerenza» dopo le omissioni: contraddizioni DENTRO lo stesso referto (pressione «diminuita» e poi «aumentata» senza evoluzione, funzione «conservata» con FE bassa, «nega sintomi» e «riferisce dispnea», «terapia invariata» e una dose cambiata, lateralità diverse per la stessa lesione, giudizio e raccomandazione che si escludono). `PROMPT_COERENZA` col contesto del medico, modello esterno, testo pseudonimizzato; spenta con `coerenza=0` nella config esterna.

Solo segnalazioni: due citazioni letterali + motivo. Guardie `_filtra_incoerenze`: entrambi i passaggi nel testo (senza maiuscole, spazi normalizzati), ≥ 2 parole e ≥ 8 caratteri, distinti, non uno dentro l'altro, niente coppie doppie, max 5 → `payload.incoerenze` (accettato dall'endpoint), card «Coerenza interna» nella bozza. Caso 31 nella suite.

Banco `banco-coerenza.py` (10 referti finti: 5 contraddizioni piantate, 5 esche con evoluzioni nel tempo, esami diversi, «invariata salvo», ripetizioni, due carotidi diverse): richiamo 5/5, falsi allarmi 0 ([[Misure/Banchi]]). Il rumore temuto non c'è stato; resta da vedere sui dettati veri.
