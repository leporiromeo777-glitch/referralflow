---
tipo: tappa
aggiornata: 2026-09-11
---
# Sentinelle e recuperi della trascrizione

## Collasso della A (whisper) misurato contro la B (Voxtral)
Guasto vero del 7.9.2026: su 289 s di dettato whisper ha reso 600 caratteri e Voxtral 3'084, nessun avviso. La sentinella anti-nano misurava la densità PRIMA del deloop e le frasi ripetute tenevano su il conto. Ora il metro è l'altro testimone, DOPO la pulizia: `collasso_a_vs_b` (B ≥ 1.6 × A e ≥ 300 caratteri in più).

Secondo caso (9.9.2026): lunghezze simili ma whisper incantato per 21 righe, 8 numeri su 15 sentiti solo da Voxtral → `motivo_buco_in_a()` guarda tre segnali: lunghezza; NUMERI presenti solo nella B (≥ 2 e ≥ 25%); righe tolte dall'anti-loop ≥ max(6, 30%).

## Corsa di recupero senza VAD
Causa vera: il VAD buttava via il parlato. Al sospetto parte `trascrivi(..., "trascrizione_a_nc", con_tempi=True, usa_vad=False)` (`-mc 0`); vince se `accordo_con_b()` (numeri in comune ×3 + parole significative) è maggiore, non se è solo più lunga. Sul caso reale: 3'055 caratteri contro 600, copertura 288 s su 288. Se la A resta corta: avviso in evidenza, omissioni cercate contro la B, manifesto a «minimo».

I tempi della corsa recuperata sono già sull'orologio pieno (`_TEMPI_SENZA_VAD`): niente decompattazione né ritaratura ad ancore, si toglie solo l'atempo. Senza questo il clic su una parola portava PIÙ AVANTI nell'audio (ultima parola a 385 s su 289 s, visto dal vivo).

## Promozione del testimone
Se la A resta incompleta ANCHE dopo il recupero (caso vero: 1411 caratteri ma ancora numeri solo in B): il testo di base diventa quello di Voxtral, whisper fa da testimone (`_TESTIMONE_PROMOSSO`, tappa `promozione_testimone`, manifesto «primo motore completo (base: secondo motore)» → livello ridotto). I tempi restano quelli di whisper: `allinea_parole` aggancia le parole in comune e interpola.

Casi 20, 21, 25, 26 nella suite. Tre casi in tre giorni sullo stesso medico: valutare la corsa senza VAD come passata principale ([[Piattaforma/Prossimi lavori]]).

## Altre barriere
`payload.manifesto` (livello pieno/ridotto/minimo, testimoni, trasporti, conteggi), gate pre-firma nel wizard con presa d'atto registrata (`override_critici`), guardia d'identità e gate temporale sulla fusione, lucchetto delle relazioni (`src/lib/referti-misure-cliniche.ts`). La rilavorazione di una bozza scartata azzera anche `revisione_stato`.
