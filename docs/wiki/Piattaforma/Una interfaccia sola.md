---
tipo: piattaforma
aggiornata: 2026-09-16
---
# Una interfaccia sola

**Decisione del 16.9.2026**: l'interfaccia della piattaforma è quella nuova (`public/prototipo/`). La vecchia — le pagine rese dal server sotto `src/app/(app)/` — non è più la porta d'ingresso.

Il motivo è pratico, non estetico: due interfacce per lo stesso prodotto fanno una domanda sola, *«ma quale delle due è il programma?»*, e quella domanda in una riunione costa più di qualunque funzione mancante. Ci si è inciampati la sera stessa: il link della demo portava alla piattaforma vecchia, e chi lo apriva vedeva «il programma della giornata» invece del prodotto.

## Che cosa è cambiato

| prima | adesso |
|---|---|
| `/` = cruscotto vecchio | `/` → `/prototipo/index.html` (redirect in `next.config.mjs`) |
| dopo l'accesso: `medico` → `/programma`, gli altri → `/` | dopo l'accesso tutti → `/prototipo/index.html` (l'**inviante** resta su `/invii`: è un'altra persona e un'altra area) |
| il medico che apriva una pagina non sua finiva su `/programma` | finisce sull'interfaccia nuova |

L'inviante registrato non c'entra: la sua area (`/invii`, più `sicurezza` e `profilo`) è fatta per un medico di un altro studio e non ha niente a che vedere con l'interfaccia interna.

Restano dove sono, e devono restare: **accesso** (`/login`, verifica a due fattori, password dimenticata, registrazione, attivazione), **le pagine pubbliche con token** (`/invia`, `/affido/…`, `/appuntamento/…`, `/portale/…`), i **testi legali**, il **dittafono** (`/dittafono/`) e tutte le **API**, che sono ciò su cui l'interfaccia nuova gira.

## Le pagine vecchie non sono ancora state cancellate

Sono ancora raggiungibili scrivendo l'indirizzo, e nessun collegamento ci porta più. Non si cancellano alla cieca perché **alcune cose esistono solo lì**:

- **Qualità AI** (`/referti/qualita`, `+ /pipeline`) — il cruscotto dove si conferma a mano il dizionario. È l'**unico** apprendimento della catena (vedi `CLAUDE.md`, «Regole che non si negoziano»): finché non c'è un equivalente, non si tocca.
- **Statistiche** (`/statistiche`), **Richiami** (`/richiami`), **Lista d'attesa** (`/lista-attesa`), **Consulti** (`/consulti`), **Affidamento a un altro studio** (`/affida`, `/affida/esterno`).
- **Impostazioni**: studio, utenti, preparazioni (`/impostazioni/…`), **Sicurezza** (`/sicurezza`), **Profilo** (`/profilo`).
- **Referral** singola (`/referral/[id]`, `/referral/nuova`), **confronto referti** (`/referti/confronto`), **feed dell'agenda** (`/programma/feed`), amministrazione multi-studio (`/piattaforma`).

Il lavoro che resta è per ognuna: *serve ancora?* Se sì, va rifatta nell'interfaccia nuova; se no, si cancella. Finché quella lista non è vuota, cancellare il codice vecchio vorrebbe dire togliere funzioni senza accorgersene.
