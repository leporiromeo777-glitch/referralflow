# Descrizione tecnica — Proposte di orario

Versione 1.0 · 7 ottobre 2026.

## 1. Dove sta il codice
- `src/lib/pressione/calcolo.ts` — **puro**: lettura del file, statistiche, fasce, finestra
  d'azione, punteggio, `proponi()`. Nessun accesso a rete, orologio o database.
- `src/lib/pressione/farmaci.ts` — la tabella in bozza e il riconoscimento dei nomi.
- `src/lib/pressione/archivio.ts` — database, permessi, registro.
- `src/lib/pressione/accese.ts` — l'interruttore (`PRESSIONE_PROPOSTE=1`).
- `public/prototipo/bridge/15-pressione.js` — la pagina: disegna, non calcola.

## 2. I dati d'ingresso
1. **Il profilo**: le misure esportate dal programma dell'apparecchio (già un dispositivo
   certificato), con l'orologio del paziente. Una misura fuori dai limiti di plausibilità
   resta nel profilo ma non entra nei conti.
2. **La terapia**: nome, dose e orari scritti dal medico o dall'aiuto medico per quel profilo.
3. **La tabella dei farmaci**: per principio attivo, inizio, picco, durata, emivita (ore).
   Una riga vale solo dopo la conferma di un medico (`confermato_da`, `confermato_il`);
   cambiare un numero toglie la conferma.
4. **Le impostazioni**: sveglia, ora di andare a letto, soglie (di partenza 135/85 di giorno,
   120/70 di notte; «troppo bassa» sotto 100 di giorno e 90 di notte, sistolica).

## 3. Il calcolo
- **Ore dell'orologio**: 24 medie orarie di sistolica e diastolica.
- **Finestra d'azione** (`effetto`): 0 prima dell'inizio; sale lineare fino al picco; scende
  lineare fino a 0,35 alla fine della durata; si spegne in un'emivita. Presa ripetuta ogni
  giorno: conta anche le prese dei tre giorni prima.
- **Punteggio** (0–100, `PESI`): ore dentro i valori bersaglio 55; calo notturno 15 (pieno
  fra 10 e 20%); picco del mattino 15 (pieno fino a 35 mmHg); nessuna ora troppo bassa 15.
- **Stima di uno spostamento**: per un farmaco preso una volta al giorno e per ciascun
  orario candidato (06, 07, 08, 12, 18, 20, 22), la pressione prevista in ogni ora è quella
  misurata meno `EFFETTO_PIENO` × (livello nuovo − livello vecchio). `EFFETTO_PIENO` =
  10/6 mmHg, **uguale per tutti i farmaci: è un'ipotesi di lavoro**, mostrata in ogni proposta.
- **Scelta**: si tiene, per farmaco, lo spostamento col punteggio stimato più alto, se il
  guadagno è di almeno 5 punti e non viola i limiti (diuretici entro le 14, nessuna ora in
  più sotto il valore basso, calo notturno non oltre il 20%). Al massimo tre proposte.
- **Avviso**: se anche col migliore spostamento restano fasce sopra soglia, la frase fissa
  di `avvisoFasce`.

## 4. Che cosa resta scritto
`pa_proposte`: la proposta com'era quando è stata mostrata (testo dei perché, stima,
ipotesi), la versione delle regole, lo stato (aperta, accettata, modificata, scartata),
l'orario scelto dal medico, chi e quando. `pa_registro`: le azioni, senza valori né nomi.
Cambiare terapia, giorno/notte o soglie cancella le proposte ancora aperte.

## 5. Qualità: come si cambia
- Ogni modifica a `calcolo.ts` che tocca `proponi`, `effetto`, `punteggio`, `PESI`,
  `EFFETTO_PIENO`, `ORARI_CANDIDATI` o i limiti **cambia `VERSIONE_REGOLE`**, si scrive in
  Decisioni/Registro, e riapre la validazione.
- Prove a ogni modifica: `src/lib/prove-pressione.test.ts` (conti e limiti, ripetibilità) e
  `scripts/e2e/prova-pressione.ts` (permessi, conferma dei farmaci, decisioni).
- Distribuzione: un solo server, `mac/aggiorna-server.sh`; la versione in uso è l'hash del commit.
