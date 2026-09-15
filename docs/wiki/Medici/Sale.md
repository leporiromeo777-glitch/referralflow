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
- `Nota:` una riga per chi legge, ignorata dal codice.
- `Stato:` `proposta` finché lo studio non la conferma, poi `validato`.

Le regole qui sotto vengono dalla conversazione del 15.9.2026 e dalle misure sull'agenda vera (chi lavora quando, quanti pazienti in parallelo). **Sono una proposta**: chi le vive le corregge.

## Sala 1
- Di: Marco Moccetti
- Stato: proposta

## Sala 2
- Di: Marco Moccetti
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
- Stato: proposta

## Sport 2
- Di: Bruno Capelli
- Nota: medicina dello sport. Capelli non supera mai due pazienti in parallelo: due stanze gli bastano.
- Stato: proposta

## Sport 3
- Di: condivisa
- Chi: Bruno Capelli, Georgios Moschovitis, Miko Pedrotti, Sebastiano Franscella
- Nota: Capelli la usa solo mercoledì e giovedì dalle 13:15; il resto del tempo va a chi non ha stanza. Tutte e tre le sale Sport sono libere ogni mattina.
- Stato: proposta

## Appar
- Di: Vera Paiocchi
- Nota: sala con apparecchi particolari; è la sua stanza, non un deposito.
- Stato: proposta

## Labor
- Di: aiuto medici
- Nota: laboratorio. Gli appuntamenti qui non hanno un medico in agenda, ed è giusto così.
- Stato: proposta

## RIA
- Di: Andrea Bronz
- Nota: riabilitazione, con Andrea Bronz fisioterapista. Sedute ripetute, slegate dalle visite: 53 appuntamenti su 12 persone in nove giorni.
- Stato: proposta
