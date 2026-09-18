---
tipo: piattaforma
aggiornata: 2026-09-18
---
# La passata di revisione del 18.9.2026

Cinque revisioni in parallelo su cinque parti diverse — rotte e permessi, interfaccia del prototipo, schema e migrazioni, librerie di logica, catena e script di sistema — in sola lettura, con l'obbligo di **dimostrare** ogni difetto prima di riferirlo. Quello che ne è uscito è quasi tutto della stessa famiglia: non codice scritto male, ma **codice scritto prima** — un controllo che c'era quando i ruoli erano tre, una chiave unica scritta prima che arrivasse la colonna `tipo`, un file dello schema che ha smesso di essere aggiornato mentre le migrazioni andavano avanti.

Quattro meritano di essere ricordati per la **forma** del guasto, perché quella forma tornerà.

## 1. Il controllo scritto al contrario

La fatturazione diceva «tutti tranne il medico». Il 16.9 sono nati `assistente` e `tecnico`, e sono passati in mezzo senza che nessuno toccasse quella riga: il CSV porta AVS, assicurazione e numero d'assicurato di ogni paziente visto nel mese. Una **lista nera invita i ruoli nuovi a entrare**; una lista bianca li lascia fuori finché qualcuno non decide. Tutte le liste di ruoli della piattaforma sono ora bianche.

Stessa famiglia: `referti/[id]/testo` non aveva il cancello che i suoi due fratelli — conferma e richiamo — hanno sempre avuto.

## 2. La cosa che vale solo in avanti

Gli alias dei codici d'agenda valevano solo per gli appuntamenti importati dopo (vedi [[Piattaforma/Robot agenda MediOnline]]). Le migrazioni valevano solo per il database che c'era già, non per quello nuovo. La rotazione del registro valeva solo per il primo giro. Ogni volta, la domanda che non era stata fatta è la stessa: **e quello che c'era prima?**

## 3. Il fallimento che ha la faccia del successo

Un update che non tocca nessuna riga e risponde «salvato». Un `catch` vuoto attorno al registro nLPD. Un `curl` che stampa 500 con la stessa faccia con cui stampa 200. Una decodifica audio fallita che lascia passare `set -e` perché l'ultimo comando del gruppo era `rm -f`. Un `_processa_uno` che cattura solo il suo errore atteso e lascia l'audio in `lavorazione/`, dove nessuno lo riscansiona e dopo sette giorni la pulizia lo cancella.

## 4. Il dato che il codice non doveva vedere

Il foglio di stampa dei moduli restava pieno dopo la stampa: il Cmd-P successivo, di chiunque, rifaceva uscire il modulo di quel paziente. L'aligner lasciava in `$TMPDIR` il testo del referto parola per parola. La radiografia del robot d'agenda prometteva che il contenuto delle celle non esce mai, e copiava `title`, `alt` e il testo dei link. La GET dei dati consegnava l'anagrafica clinica di 500 pazienti a chiunque avesse una sessione, **tecnico compreso** — mentre a quello stesso tecnico la rotta «procedura» nega il briefing di un paziente solo.

## Che cosa resta da fare

- **Un account per persona**, non per funzione ([[Piattaforma/Accessi e ruoli]]): finché i cardiologi entrano tutti da `medico@`, i cancelli sui ruoli sono l'unica difesa e il registro non sa chi ha fatto cosa.
- Le liste di ruolo sono sei, scritte in sei posti: varrebbe la pena tenerle in uno.
- L'indice doppio su `referti_bozze` (stesse colonne, due nomi) è innocuo con 19 righe: si toglierà quando si toccherà quella tabella.

## Le prove

`prove-catastrofiche.py` 38/38; `npm run test:app` da **183 a 190**. I sette nuovi non sono decorazione: tre test esistenti *dichiaravano* di provare una cosa e ne provavano un'altra — «un buco fra due visite» aveva una visita sola, «normalizza sì/no» provava solo un valore già valido, «non sceglie se ambiguo» non aveva nessuna ambiguità. È così che il buco di mezza giornata in [[Medici/Sale]] è rimasto invisibile per giorni: il test che avrebbe dovuto vederlo guardava da un'altra parte.
