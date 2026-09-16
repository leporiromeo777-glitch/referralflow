---
tipo: piattaforma
aggiornata: 2026-09-16
---
# Richiami e buchi in agenda

Due cose che servivano insieme e stavano in due mondi diversi: **i richiami** (chi va rivisto fra sei mesi) esistevano solo nelle pagine vecchie, e **i buchi in agenda** non esistevano affatto. Un richiamo scaduto senza un posto dove metterlo è una lista che cresce; un buco senza un nome accanto è tempo perso. Dal 16.9.2026 stanno nella stessa pagina, e la proposta è una riga sola: **questo paziente, in questo buco, perché**.

L'agenda della Cassa dei Medici resta in **sola lettura**: qui non si prenota niente. Si dice a chi prenota che cosa varrebbe la pena prenotare.

## Che cosa c'era già, e che cosa è nuovo

| pezzo | dov'era |
|---|---|
| campi `follow_up_months / due / done_at` su `referrals` e `appointments` | c'erano |
| il richiamo riconosciuto nel dettato («controllo fra sei mesi») e creato con un tasto | c'era (`src/lib/referti-richiami.ts`) |
| la pagina `/richiami` della piattaforma vecchia | c'era |
| **i buchi in agenda** | **nuovo** (`src/lib/agenda-buchi.ts`) |
| **l'abbinamento buco ↔ paziente, con il motivo scritto** | **nuovo** |
| **la pagina «Richiami» nell'interfaccia nuova**, con i due lati che si parlano | **nuova** |
| **il registro delle telefonate** (`richiami_telefonate`, migrazione 062) | **nuovo** |

## Che cos'è un buco

Il vuoto **fra due visite dello stesso medico nello stesso giorno**, fra 20 e 180 minuti. Non lo è la fine della giornata (chi finisce alle 16 non ha un buco fino a sera: ha finito), non lo è un vuoto di otto ore (vuol dire che al pomeriggio non c'è), e **non lo è la pausa pranzo**: un vuoto sopra i 90 minuti a cavallo di mezzogiorno è la mattina che finisce, non un posto da riempire. Un vuoto corto dentro l'ora di pranzo si mostra, ma segnato e in fondo.

## Come nasce una proposta

Il conto lo fa il **codice**, in una funzione che si può leggere e contestare (`valuta`):

- **chi non ci sta dentro non è una proposta**: se la prestazione dura più del buco, viene scartata;
- **il medico dev'essere abilitato** a quella prestazione (dalla pagina wiki [[Medici/Prestazioni e sale]]);
- **+60** se è un paziente di quel medico, **−15** se di solito lo segue un altro;
- **+ mezzo punto per ogni giorno di ritardo** del richiamo (fino a sei mesi);
- **+20** se è in attesa di un appuntamento, **+25** se aveva disdetto;
- **meglio il buco che avanza meno**: riempire 30 minuti con una visita da 30 vale più che sprecarne 20;
- **−25** se è l'ora di pranzo.

Poi l'abbinamento è **avido e lo sa**: prende la coppia che vale di più, poi la successiva fra quelle rimaste, un paziente per buco e un buco per paziente. Non cerca l'ottimo globale; cerca qualcosa che una persona possa guardare e approvare in dieci secondi.

## Dove entra il modello locale

In un punto solo: **la frase da dire al telefono**. I fatti (chi, quando, con chi, perché) li ha già scelti il codice; al modello — gemma3 su questo Mac, niente cloud — si chiede di metterli in tre frasi che una persona possa leggere mentre compone il numero. Se il modello non risponde, resta la frase scritta dal codice e la pagina lo dice.

Questa è la stessa regola del resto della piattaforma: **l'AI propone le parole, il codice decide i fatti, una persona decide e basta** ([[Piattaforma/Orchestrazione sale]] §16).

## I due lati che si parlano

- Da una **proposta**: «Chiama» (la frase, poi *ha detto di sì / non risponde / non gli va bene*) e «Chi altro?» — gli altri pazienti che entrerebbero in quel buco.
- Da un **paziente in attesa**: «Dove?» — i buchi dei prossimi giorni in cui entrerebbe, in ordine.
- Da un **buco senza nessuno**: «Chi?» — la stessa domanda dall'altro lato.
- **Nuovo richiamo**: paziente dalla cartella + fra quanti mesi. Nasce come *appuntamento da fissare* e ricompare qui quando è il momento — ed è esattamente il «crea un richiamo a tre mesi e mettilo in un buco» che serviva.

«Ha detto di sì» chiude il richiamo e scrive la telefonata nel registro; le altre risposte scrivono soltanto la telefonata, così chi riprende in mano la lista sa che quel numero è già stato fatto.

## Misure

`npm run test:app`: 12 prove su `agenda-buchi` (che cos'è un buco, chi non ci sta, il medico che non fa quella prestazione, l'ordine delle proposte, i due lati che danno la stessa risposta, la pausa pranzo). Prima prova sui dati veri della demo (16.9.2026): 77 appuntamenti in 7 giorni → **8 buchi**, un candidato → una proposta con la frase giusta.
