---
tipo: regola
aggiornata: 2026-09-11
---
# nLPD e regole di sessione

Vincoli che valgono sempre, per chiunque lavori sul progetto (persona o modello).

## Dati sanitari (nLPD)
- Hosting di app, DB e allegati in Svizzera.
- Mai dati clinici in mail in chiaro: HIN o avviso neutro con link al portale.
- Link pubblici `/invia/[token]` e `/portale/[token]`: token casuale lungo con scadenza (180 giorni) e rotazione dalla pagina Medici.
- Mai dati paziente in URL, log o notifiche in chiaro. Le mail di notifica (`src/lib/notify.ts`) sono avvisi neutri.
- L'URL del feed iCal dell'agenda è una credenziale: non mostrarlo per intero né loggarlo.
- Il testo verso il cloud è **pseudonimizzato** (mappa in RAM sul Mac), non anonimo: usare questa parola. La catena chiama solo fornitori nella lista autorizzata (`FORNITORI_AUTORIZZATI`).
- Nella wiki e nel CLAUDE.md: mai contenuti clinici, mai esempi presi da referti veri.

## Che cosa il modello non legge mai sul Mac dello studio
Audio, trascrizioni, `*.dubbi.json`, `*.divergenze.json`, qualsiasi file in `~/referti/`, testi clinici delle bozze. Si leggono solo log (progettati per non contenere contenuti clinici), numeri, booleani, codice, configurazione. Se serve un'informazione da quei file, la guarda l'utente e riferisce a parole. Dettagli in `pipeline-referti/CLAUDE.md`.

## Soldi
Avvisare prima di spendere: avviso, stima in CHF e ok dell'utente prima di ogni azione a pagamento (chiamate al modello esterno per banchi comprese). Ordine di grandezza dei banchi fatti finora: centesimi.

## Credenziali
Mai inserire password o credenziali; il robot MediOnline è in SOLA LETTURA (vedi [[Piattaforma/Robot agenda MediOnline]]).

## Come si consegna
- Commit con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; i fix della catena si committano E si pushano (branch `claude/ai-chain-collaboration-prompt-heacx2`).
- Catena: `bash pipeline-referti/distribuisci.sh` (esegue la suite `prove-catastrofiche.py`, si ferma se un referto è in lavorazione, copia in `~/referti-pipeline/`, riavvia il servizio). Mai cp+kickstart a mano. Copia i `correzioni-<medico>.json` solo se assenti: il dizionario vivo si modifica in `~/referti-pipeline/`.
- App: `bash mac/aggiorna-server.sh` (pull + kickstart; la ricompilazione parte quando `.build-stamp` non coincide con HEAD, 1-2 minuti).
- Variabili del servizio: `~/referti-pipeline/invio.conf` viene copiato nel plist all'installazione → per cambiare un modello vanno modificati ENTRAMBI, poi `launchctl unload/load`.
- Ogni modifica di comportamento va misurata (banco o suite) e documentata nella pagina dell'argomento di questa wiki.

## Regola sulle correzioni umane
Le correzioni della segretaria non addestrano nulla in automatico. L'unico apprendimento è il [[Catena/Audit e qualità|dizionario dalle correzioni]], confermato a mano.

## Whisper
`whisper turbo` è stato rifiutato dall'utente: la trascrizione resta large-v3. Non riproporlo.
