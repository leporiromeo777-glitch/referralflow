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
- `Ultima:` `sì` se la stanza si riempie **solo quando le altre non bastano** — le sale dello sport si aprono al bisogno, non per prime.
- `Nota:` una riga per chi legge, ignorata dal codice.
- `Stato:` `proposta` finché lo studio non la conferma, poi `validato`.

Due righe, qui sopra le stanze, dicono **che cosa non entra nel piano**: persone che lavorano in studio ma le cui sedute non occupano una sala dei medici, e prestazioni che una stanza non la occupano: quelle che si fanno altrove (una risonanza, un intervento in ospedale) e quelle che si fanno al telefono. Non vengono contate fra le «visite senza sala», perché non è un problema da risolvere. Si può fare un'eccezione per persona — `Risonanza magnetica (tranne Vera Lucia Paiocchi)` — perché la realtà non è pulita: la risonanza in sé non occupa una stanza dello studio, ma quelle che segue Paiocchi sì, nella sua sala. La prestazione di un appuntamento si riconosce dal colore dell'agenda: una voce elencata qui ha effetto solo se nel catalogo dello studio ha un colore.

- Fuori dal piano: Andrea Bronz
- Prestazioni fuori dal piano: Colloquio telefonico, Intervento, Risonanza magnetica (tranne Vera Lucia Paiocchi), TAC (tranne Vera Lucia Paiocchi)
- Sempre e solo: Vera Lucia Paiocchi in Sala 1
- Agende fuori dal piano: Labor
- Solo in: Marco Moccetti in Sala 2 o Sala 3
- Solo in: Vanja Paveri in Sport 1 o Sport 2 o Sport 3
- Solo in: Miko Pedrotti in Sport 1 o Sport 2 o Sport 3
- Solo in: Davide Girola in Sport 1 o Sport 2 o Sport 3
- Solo in: Sebastiano Franscella in Sport 1 o Sport 2 o Sport 3
- Solo in: Georgios Moschovitis in Sport 1 o Sport 2 o Sport 3

Altre righe dicono **chi non si sposta**, con due forze diverse. `Sempre e solo:` è una stanza e nient'altro. `Solo in:` è un elenco di stanze ammesse. La riga dice **due cose**: quelle stanze sono le sue fra cui scegliere — anche quando il titolare è un altro — e fuori da lì non va. Senza la prima metà la regola non servirebbe a chi nella pagina una stanza non ce l'ha: dire dove NON può stare non lo mette da nessuna parte. Non è un cambio di titolare: la stanza la usa quando è libera. La proposta dell'AI che prova a mandare qualcuno fuori dal suo elenco viene scartata, con scritto il perché.

**Le stanze si separano con «o», non con la virgola**: in questa pagina la virgola separa le voci dell'elenco, e «in Sala 2, Sala 3» si leggerebbe come due persone. La chiave si può ripetere su più righe: sei persone su una riga sola non si leggerebbero.

`Agende fuori dal piano:` toglie una **colonna** dell'agenda MediOnline. `Labor` è il prelievo: il paziente passa in studio ma non occupa una stanza dei medici — e siccome quell'appuntamento arriva senza titolare, il medico gli veniva prestato da chi vede quel paziente quel giorno, facendogli prendere una stanza che non serve (detto dallo studio il 16.9.2026).

**Una stanza si prende per il tempo che serve alle visite, non per tutto il giorno** (detto dallo studio il 16.9.2026). La fascia qui sotto dice *di chi è* la stanza; quando è *occupata* lo dicono le visite, dalla prima all'ultima. Chi ha visite solo al pomeriggio occupa solo il pomeriggio; chi non ne ha non la occupa affatto. Nel calendario la fascia della regola resta disegnata sbiadita e il blocco pieno copre solo la presa.

Le regole qui sotto vengono dalla conversazione del 15.9.2026 e dalle misure sull'agenda vera (chi lavora quando, quanti pazienti in parallelo). **Sono una proposta**: chi le vive le corregge.

## Sala 1
- Di: Vera Lucia Paiocchi
- Nota: è sempre la sua, non cambia mai — detto dallo studio il 15.9.2026. Prima la pagina la dava a Marco Moccetti. La riga «Sempre e solo» qui sopra fa sì che il suo lavoro non finisca in nessun'altra stanza, nemmeno quando una proposta lo suggerirebbe.
- Stato: validato

## Sala 2
- Di: Daniela Cassani
- Funzione: Ecografia
- Nota: ecografista, una decina di esami al giorno. La stanza era intestata a Marco Moccetti e non la usava: il 15.9.2026 lo studio ha applicato questa assegnazione dalla proposta del giorno. Se la sua stanza vera è un'altra, si cambia qui.
- Stato: proposta

## Sala 3
- Di: Georgios Moschovitis
- Dalle 13:00: Tiziano Moccetti
- Giorni: lun mar mer gio
- Nota: **da chiarire.** Il 15.9.2026 lo studio ha detto che la mattina è di Moschovitis; il 16.9.2026 ha detto che Moschovitis sta sempre nelle sale dello sport. Vince la seconda, che è più recente: le sue visite vanno nello sport e questa fascia risulta libera. Se la Sala 3 al mattino è davvero sua, si toglie Moschovitis dalla riga «Solo in» in testa. — la mattina è di Moschovitis, detto dallo studio il 15.9.2026; prima la pagina la dava a Marco Moccetti. Tiziano non è mai in studio prima delle 13 e mai il venerdì. Marco Moccetti resta così senza una stanza sua nella pagina: il 15.9 tutti i suoi appuntamenti erano colloqui telefonici, che una stanza non la occupano — ma se un giorno visita, va detto dove. Dal 16.9.2026 si sa almeno **dove non va**: la riga «Solo in» in testa lo tiene dentro Sala 2 o Sala 3.
- Stato: proposta

## Sala 4
- Di: François Rego
- Stato: proposta

## Sala 5
- Di: condivisa
- Nota: **senza assegnatario dal 16.9.2026.** La dividevano Girola, Moschovitis, Pedrotti e Franscella, ma lo studio ha detto che quei quattro stanno sempre nelle sale dello sport: lasciarli scritti qui avrebbe prodotto ogni notte una casella «da decidere» che il vincolo rifiuta comunque. Chi usa questa stanza va detto.
- Stato: proposta

## Sport 1
- Di: Bruno Capelli
- Nota: medicina dello sport.
- Funzione: Sport
- Ultima: sì
- Stato: proposta

## Sport 2
- Di: Bruno Capelli
- Nota: medicina dello sport. Capelli non supera mai due pazienti in parallelo: due stanze gli bastano.
- Funzione: Sport
- Ultima: sì
- Stato: proposta

## Sport 3
- Di: condivisa
- Chi: Bruno Capelli, Georgios Moschovitis, Miko Pedrotti, Sebastiano Franscella, Davide Girola, Vanja Paveri
- Nota: Capelli la usa solo mercoledì e giovedì dalle 13:15; il resto del tempo va a chi non ha stanza. Tutte e tre le sale Sport sono libere ogni mattina.
- Funzione: Sport
- Ultima: sì
- Stato: proposta
