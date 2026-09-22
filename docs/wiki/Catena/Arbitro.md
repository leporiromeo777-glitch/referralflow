---
tipo: tappa
aggiornata: 2026-09-23
---
# Arbitro (scelta tra i due motori)

Dove le trascrizioni A e B divergono, il modello vede entrambe le versioni e sceglie («a», «b», «incerto»); il codice applica solo le scelte «b». Sul percorso esterno con `arbitro=1` (testo pseudonimizzato), altrimenti in locale con `MODELLO_CORREZIONE`. Le divergenze restano comunque in bozza.

## Che cosa vede (dall'11.9.2026)
`PROMPT_ARBITRO` con `{contesto_medico}` davanti (stesso blocco della correzione, [[Catena/Contesto per medico]]), due regole in più: i motori PERDONO parole più di quanto ne inventino → la versione con negazione/qualificatore/lateralità in più vince se coerente col contesto, altrimenti l'altra; le sigle del contesto sono la forma giusta. Ogni punto elenca le «parole presenti da una parte sola» (`pesanti` da `parole_pesanti()`: `_RX_QUALIFICATORE`, `_RX_NEGAZIONE`, `_RX_LATERALITA`, numeri).

## Candidati e applicazione
- Mai punti con numeri diversi (restano alla persona), mai segmenti > 80 caratteri, mai B vuota (togliere parole non spetta all'arbitro).
- A VUOTA (parola sentita dal solo secondo motore, il caso vero «profili pressori DIMINUITI») prima era scartata in blocco: ora è giudicata e la scelta «b» inserisce la parola dopo `contesto_prima` (solo se unico nel testo; la parola seguente perde la maiuscola se l'inserimento è a inizio frase).
- A piena: sostituzione solo se il segmento è unico nel testo.

Caso 30 nella suite. Misure in [[Misure/Banchi]] (banco-arbitro: 13/15 → 14/15; con il codice vecchio i primi 4 casi non arrivavano all'arbitro).

## Decisioni tarate, in ombra (23.9.2026)
Dopo l'arbitro, `decisioni_tarate()` rivede gli stessi punti (`_candidati_arbitro`, stessi paletti, al massimo 30) sul modello locale `MODELLO_CORREZIONE` e, invece di una scelta scritta, legge da Ollama la **probabilità** di ciascuna risposta ammessa (A, B, C = incerto): è l'idea dei modelli «System One» tipo Jev, fatta in casa, niente esce dal Mac. Il prompt è quello dell'arbitro con la sola parte della risposta cambiata («numero: lettera» per punto, `_prompt_decisioni`); 15 punti per chiamata, perché Ollama rilegge l'intero prompt a ogni chiamata. Scrive su ogni punto `p_b` (probabilità che abbia ragione la B, fra A e B) e `p_incerto`; l'arbitro scrive `scelta_arbitro`. Arrivano in bozza con `divergenze`.

**In ombra**: non cambia il testo né la revisione. Il consolidatore confronta ogni notte le probabilità con la versione tenuta dalla segreteria (`src/lib/audit/taratura-arbitro.ts`, sezione «Decisioni tarate dell'arbitro» in [[Proposte/Ultime]]). Regola già decisa per quando si userà: la probabilità può **confermare una correzione verso la B**, mai **nascondere una segnalazione** perché «la A è sicura»: al banco, a gruppi, il modello era sicuro di tenere la A anche su amiodarone/dronedarone, sospeso/ripreso e destra/sinistra. `REFERTI_DECISIONI_TARATE=0` la spegne; su qualunque intoppo i punti restano senza probabilità. Caso 40 nella suite; banco `banco-decisioni.py` ([[Misure/Banchi]]).

## In pagina
Le divergenze con `pesanti` stanno in cima e in un passo tutto loro della [[Catena/Revisione guidata]] («I due motori non concordano»): «Ha ragione A», «Ha ragione B» (la B entra da sola nella frase, con `contesto_prima`/`contesto_dopo` se la A è vuota), «Nessuno dei due: correggo io».
