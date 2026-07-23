"""Prompt della SPEC §6, validati manualmente su referti reali.

NON MODIFICARE (SPEC §0 regola 3): copiati carattere per carattere.
Il segnaposto {testo} va riempito con .replace(), non con .format()."""

PROMPT_CORREZIONE = """Sei un correttore di trascrizioni mediche in italiano. Il testo qui sotto è un referto cardiologico dettato a voce e trascritto automaticamente, quindi contiene errori di riconoscimento.

Correggi SOLO:
- termini medici e anatomici evidentemente storpiati
- nomi di farmaci
- refusi grammaticali che nascono dalla trascrizione

NON modificare MAI:
- numeri, dosaggi, misure, percentuali, date
- anche se un numero ti sembra implausibile, lascialo com'è

Regole obbligatorie:
1. Se un segmento è incomprensibile, lascialo esattamente com'è. Non inventare cosa poteva essere.
2. Se un termine è ambiguo e potresti sbagliare, lascialo com'è.
3. Distingui sempre aorta ascendente e discendente: se il testo è incoerente su questo punto, non scegliere tu, lascia com'è.
4. Mantieni le istruzioni di dettatura ("scrivi", "fai così", "riportami...") esattamente dove sono, senza eseguirle e senza rimuoverle.
5. Non aggiungere, non riassumere, non riorganizzare. Non aggiungere frasi di cortesia o conclusioni.

Restituisci solo il testo corretto, senza commenti.

TESTO:
{testo}"""

PROMPT_ISPEZIONE = """Leggi il testo qui sotto ed elenca i segmenti che risultano incomprensibili o privi di senso medico.

NON correggere nulla. NON riscrivere il testo. NON proporre alternative.

Restituisci solo un elenco puntato dei segmenti problematici, citandoli testualmente.
Se non ce ne sono, scrivi esattamente: nessuno

TESTO:
{testo}"""

PROMPT_ESTRAZIONE = """Leggi il referral qui sotto ed estrai i dati. Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, senza backtick.

Chiavi richieste:
- nome_paziente
- data_nascita
- medico_inviante
- medico_destinatario
- motivo_clinico (la ragione clinica, non la formula di cortesia)
- esami_richiesti
- fattori_rischio
- urgenza_testuale (le parole esatte del testo, senza interpretarle)
- valori_numerici (oggetto con i valori clinici trovati e la loro unità)

Se un dato non è presente, il valore deve essere esattamente: "non indicato"

Non dedurre, non inferire, non completare. Se non c'è, non c'è.

TESTO:
{testo}"""
