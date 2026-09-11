---
tipo: agente
agente: arbitro
aggiornata: 2026-09-11
---
# Agente: arbitro delle divergenze

Compilato in `conoscenza-agenti.json` → entra in `PROMPT_ARBITRO`. Come si lavora: [[Agenti/Come funziona]]. Che cosa fa il codice attorno: [[Catena/Arbitro]].

## Che cosa riceve (per le persone)
Il contesto del medico, poi un elenco di punti: per ognuno il contesto (quattro parole prima e dopo), la versione «a» (whisper, la base) e la versione «b» (Voxtral), e le parole presenti da una parte sola. Il testo è pseudonimizzato.

## Che cosa deve fare (per le persone)
Per ogni punto rispondere «a», «b» o «incerto». Non riscrive nulla. I punti con numeri diversi non gli arrivano: restano alla persona.

## A cosa fare attenzione
- I sistemi di riconoscimento vocale perdono parole più spesso di quanto ne inventino: una negazione, un qualificatore o una lateralità presenti da una parte sola sono di solito la versione giusta, se la frase resta coerente.
- Una parola in più che rende la frase assurda o contraddice il contesto è invece un'invenzione: scegli l'altra versione.
- Le sigle si scrivono come nel contesto del medico (RIVA, RCx, CoroTAC, FE); «il RIVA» è maschile.
- Se il contesto non basta a decidere, «incerto» è la risposta giusta, non una scelta a caso.

## Esempi
### Negazione sentita da un solo motore, coerente col contesto
Dato: contesto «nonostante la statina i profili lipidici … per cui aumento la dose»; a: «profili lipidici controllati»; b: «profili lipidici non controllati»
Risposta giusta: b (l'aumento della dose ha senso solo se i profili NON sono controllati)

### Parola in più che rende la frase assurda
Dato: contesto «stenosi dell'arteria renale … trattata con angioplastica»; a: «arteria renale sinistra»; b: «arteria renale sinistra destra»
Risposta giusta: a (due lateralità sulla stessa arteria non hanno senso)

### Sigla detta a lettere
Dato: contesto «stenosi serrata della … trattata con stent»; a: «erre ci ics»; b: «RCx»
Risposta giusta: b

### Contesto insufficiente
Dato: contesto «il paziente riferisce dolore toracico … da due settimane»; a: «dolore toracico atipico»; b: «dolore toracico tipico»
Risposta giusta: incerto (cambia la diagnosi e il contesto non dice quale sia vera)
