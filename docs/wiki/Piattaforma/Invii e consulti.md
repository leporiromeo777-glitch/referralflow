---
tipo: piattaforma
aggiornata: 2026-09-16
---
# Invii e consulti

Le due direzioni in cui un paziente attraversa il confine dello studio, in una pagina sola dell'interfaccia nuova (16.9.2026). Prima erano due pagine lontane della piattaforma vecchia (`/consulti` e `/affida`); stanno bene insieme perché chi fa una cosa fa anche l'altra.

## Consulti — le domande che entrano

Un medico inviante scrive una domanda clinica dal modulo pubblico; lo specialista risponde, **e spesso la visita non serve più**. Nella pagina: la domanda, gli allegati, chi l'ha mandata, e due tasti — *Rispondi* e *Serve una visita*.

- **Rispondi**: il testo va all'inviante e il consulto passa a «risposto». L'avviso parte **solo alla prima risposta**: una correzione non è una notizia nuova.
- **Serve una visita**: il consulto diventa una **referral vera**. La domanda diventa il quesito, gli allegati la seguono senza copiare i file, il consulto resta segnato come «diventato referral» con il collegamento. Serve il nome del paziente, che nel consulto non c'è (l'inviante scrive del caso, non dell'anagrafica).

## Affidare a un altro studio — i pazienti che escono

Due elenchi: gli **studi della piattaforma** (in cima quelli con cui si lavora di più, segnati a mano) e la **rubrica** degli studi che sulla piattaforma non ci sono (`external_studios`), con nome, specialità e recapiti. Da ogni riga «Affida un paziente» apre il modulo d'invio con lo studio già scelto.

Oggi sulla piattaforma c'è un solo studio, quindi il primo elenco è quasi vuoto: la rubrica invece serve da subito.

## Dove sta il codice

`GET/POST /api/prototipo/affidamenti` — le stesse tabelle della piattaforma vecchia (`consulti`, `consulto_attachments`, `studio_partners`, `external_studios`, `referrals`), nessuna migrazione nuova. La pagina è `PAGES.consulti` nel ponte.
