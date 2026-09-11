---
tipo: tappa
aggiornata: 2026-09-11
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

## In pagina
Le divergenze con `pesanti` stanno in cima e in un passo tutto loro della [[Catena/Revisione guidata]] («I due motori non concordano»): «Ha ragione A», «Ha ragione B» (la B entra da sola nella frase, con `contesto_prima`/`contesto_dopo` se la A è vuota), «Nessuno dei due: correggo io».
