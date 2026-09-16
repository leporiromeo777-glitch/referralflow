---
tipo: medici
aggiornata: 2026-09-16
---
# Prestazioni e sale: che cosa si fa dove, e che cosa serve

Questa pagina è **letta dalla piattaforma** (`src/lib/orchestrazione/grafo.ts`, cache di 5 minuti): si cambia la pagina, non il codice. Una sezione `##` per prestazione, con il nome **uguale a quello del catalogo** (`prestazioni_catalogo`, quello che si riconosce dal colore dell'agenda). I campi:

- `Durata:` minuti attesi del medico con il paziente. È il punto di partenza: appena ci sono misure vere, vince la mediana misurata ([[Piattaforma/Orchestrazione sale]] §9).
- `Breve:` la durata quando la segreteria dice «visita breve» (§11). Assente = la metà.
- `Preparazione:` `che cosa, N minuti, chi` — quel che un assistente fa nella stanza prima che arrivi il medico. `nessuna` se non serve.
- `Ripristino:` minuti per rimettere a posto la stanza dopo (letto, ergometro). Assente = 0.
- `Sale:` `tutte`, oppure l'elenco separato da virgole. Un'eccezione per persona si scrive `Sala 1 (Vera Lucia Paiocchi)`.
- `Apparecchi:` gli strumenti senza cui non si fa; `nessuno` se non servono. Il nome è quello in `studio_risorse`.
- `Medici:` chi è abilitato; assente = tutti i medici. `Medico: non serve` è una prestazione fatta da un assistente senza medico (la posa di un Holter).
- `Nota:` per chi legge.
- `Stato:` `proposta` finché lo studio non conferma, poi `validato`.

Le regole su **chi sta in quali stanze** restano in [[Medici/Sale]]: il motore le incrocia con queste (le stanze possibili di un appuntamento sono quelle ammesse per il medico *e* per la prestazione).

Tutto quello che segue è una **proposta** del 16.9.2026, scritta dal catalogo e dal buon senso: lo studio la corregge.

## Visita cardiologica
- Durata: 20
- Breve: 10
- Preparazione: pressione e peso, 3 minuti, assistente
- Sale: tutte
- Apparecchi: nessuno
- Stato: proposta

## Ecocardiogramma
- Durata: 30
- Preparazione: spogliato, gel, elettrodi, 5 minuti, assistente
- Ripristino: 3
- Sale: Sala 5
- Apparecchi: ecografo
- Medici: Daniela Cassani, Georgios Moschovitis, Marco Moccetti, Tiziano Moccetti
- Nota: l'ecografo sta in Sala 5, dove lavora Cassani. Se ce n'è un secondo, va scritto in Studio → Risorse e qui si aggiunge la sala.
- Stato: proposta

## Ergometria
- Durata: 30
- Preparazione: elettrodi e pressione, 10 minuti, assistente
- Ripristino: 5
- Sale: Sport 1, Sport 2, Sport 3
- Apparecchi: cicloergometro
- Stato: proposta

## ECG a riposo
- Durata: 5
- Preparazione: elettrodi, 3 minuti, assistente
- Sale: tutte
- Apparecchi: elettrocardiografo
- Nota: l'elettrocardiografo è mobile: gira fra le stanze.
- Stato: proposta

## Holter ECG 24h
- Durata: 15
- Preparazione: nessuna
- Sale: tutte
- Apparecchi: nessuno
- Medico: non serve
- Nota: la posa la fa un assistente; il medico non entra.
- Stato: proposta

## Holter pressorio 24h
- Durata: 15
- Preparazione: nessuna
- Sale: tutte
- Apparecchi: nessuno
- Medico: non serve
- Stato: proposta

## Duplex carotideo
- Durata: 25
- Preparazione: spogliato, gel, 3 minuti, assistente
- Sale: Sala 5
- Apparecchi: ecografo
- Stato: proposta

## Urgenza
- Durata: 30
- Preparazione: nessuna
- Sale: tutte
- Apparecchi: nessuno
- Nota: un'urgenza entra con priorità alta: può spostare anche un appuntamento già sistemato, ma solo con la conferma di una persona.
- Stato: proposta

## Risonanza magnetica
- Durata: 45
- Preparazione: nessuna
- Sale: Sala 1 (Vera Lucia Paiocchi)
- Apparecchi: nessuno
- Nota: fuori dal piano per tutti (si fa altrove) tranne che per Paiocchi, che le segue nella sua sala — come già scritto in Medici/Sale.
- Stato: proposta

## TAC
- Durata: 30
- Preparazione: nessuna
- Sale: Sala 1 (Vera Lucia Paiocchi)
- Apparecchi: nessuno
- Stato: proposta
