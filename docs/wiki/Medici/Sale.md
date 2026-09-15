---
tipo: medici
aggiornata: 2026-09-15
---
# Sale: di chi è quale stanza

Questa pagina è **letta dalla piattaforma** (`src/lib/sale.ts`, cache di 5 minuti): si cambia la pagina, non il codice. Una sezione `##` per stanza; i campi in elenco puntato con la chiave in testa.

- `Di:` chi ne è titolare. `condivisa` se non ha un titolare fisso.
- `Dalle HH:MM:` chi la prende da quell'ora in poi (si possono mettere più righe).
- `Chi:` i nomi che se la dividono, quando è condivisa.
- `Giorni:` i giorni in cui la regola vale (lun mar mer gio ven); assente = tutti.
- `Funzione:` a che serve la stanza (ecografia, laboratorio, riabilitazione…); si vede nella Home sotto il nome della sala. Vuoto se nessuno l'ha ancora detto.
- `Nota:` una riga per chi legge, ignorata dal codice.
- `Stato:` `proposta` finché lo studio non la conferma, poi `validato`.

Due righe, qui sopra le stanze, dicono **che cosa non entra nel piano**: persone che lavorano in studio ma le cui sedute non occupano una sala dei medici, e prestazioni che si fanno altrove (una risonanza, un intervento in ospedale). Non vengono contate fra le «visite senza sala», perché non è un problema da risolvere. La prestazione di un appuntamento si riconosce dal colore dell'agenda: una voce elencata qui ha effetto solo se nel catalogo dello studio ha un colore.

- Fuori dal piano: Andrea Bronz
- Prestazioni fuori dal piano: Intervento, Risonanza magnetica, TAC

Le regole qui sotto vengono dalla conversazione del 15.9.2026 e dalle misure sull'agenda vera (chi lavora quando, quanti pazienti in parallelo). **Sono una proposta**: chi le vive le corregge.

## Sala 1
- Di: Vera Lucia Paiocchi
- Nota: è sempre la sua, non cambia mai — detto dallo studio il 15.9.2026. Prima la pagina la dava a Marco Moccetti.
- Stato: validato

## Sala 2
- Di: Daniela Cassani
- Funzione: Ecografia
- Nota: ecografista, una decina di esami al giorno. La stanza era intestata a Marco Moccetti e non la usava: il 15.9.2026 lo studio ha applicato questa assegnazione dalla proposta del giorno. Se la sua stanza vera è un'altra, si cambia qui.
- Stato: proposta

## Sala 3
- Di: Marco Moccetti
- Dalle 13:00: Tiziano Moccetti
- Giorni: lun mar mer gio
- Nota: Tiziano non è mai in studio prima delle 13 e mai il venerdì; il venerdì la sala resta di Marco tutto il giorno.
- Stato: proposta

## Sala 4
- Di: François Rego
- Stato: proposta

## Sala 5
- Di: condivisa
- Chi: Davide Girola, Georgios Moschovitis, Miko Pedrotti, Sebastiano Franscella
- Nota: Girola tiene la stanza tutto il giorno lun, mar e ven; gli altri si innestano sopra e allora serve anche Sport 3.
- Stato: proposta

## Sport 1
- Di: Bruno Capelli
- Nota: medicina dello sport.
- Funzione: Sport
- Stato: proposta

## Sport 2
- Di: Bruno Capelli
- Nota: medicina dello sport. Capelli non supera mai due pazienti in parallelo: due stanze gli bastano.
- Funzione: Sport
- Stato: proposta

## Sport 3
- Di: condivisa
- Chi: Bruno Capelli, Georgios Moschovitis, Miko Pedrotti, Sebastiano Franscella
- Nota: Capelli la usa solo mercoledì e giovedì dalle 13:15; il resto del tempo va a chi non ha stanza. Tutte e tre le sale Sport sono libere ogni mattina.
- Funzione: Sport
- Stato: proposta
