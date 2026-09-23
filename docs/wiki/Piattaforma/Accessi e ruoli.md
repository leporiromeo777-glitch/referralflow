---
tipo: piattaforma
aggiornata: 2026-09-23
---
# Accessi e ruoli

Fino al 16.9.2026 in studio si entrava **tutti con lo stesso account** (`admin@demo.ch`). Le conseguenze non erano teoriche: la pagina Visite doveva chiedere «chi sei» a ogni dispositivo, il registro degli accessi scriveva lo stesso nome sotto qualunque gesto — il 16.9, davanti a una modifica che nessuno riconosceva, la risposta è stata *«qualcuno con quell'account»* — e niente poteva essere «tuo».

## I ruoli

| ruolo nel database | interfaccia | chi è |
|---|---|---|
| `medico` | `doctor` | il cardiologo |
| `assistente` | `assistant` | l'aiuto medico *(nuovo, migrazione 063)* |
| `segretaria` | `secretary` | la segreteria |
| `admin` | `org_admin` | l'amministrazione dello studio |
| `tecnico` | `tech_admin` | chi tiene in piedi il sistema *(nuovo, migrazione 063)* |
| `inviante` | — | il medico di un altro studio: ha solo la sua area `/invii` |

`assistente` e `tecnico` esistevano già nell'interfaccia (avevano perfino un loro menu) ma **non nel database**: chi faceva quel lavoro doveva entrare come segretaria o come admin. Ora ci sono davvero, e le sei mappe `RUOLO` delle API li traducono.

## I cinque accessi dello studio (16.9.2026)

Uno per funzione, sullo studio vero: `medico@`, `aiuto@`, `segreteria@`, `amministrazione@`, `tecnico@` — tutti `@referralflow.ch`, che è il dominio dello studio. Le password sono state generate a caso e consegnate una volta sola: **vanno cambiate al primo accesso** (pagina Sicurezza). Il vecchio `admin@demo.ch` resta finché non si è sicuri che nessuno lo usi più.

Negli stessi ruoli esiste anche la [[Piattaforma/Demo pubblica]], con una password sola per tutti e dati inventati: serve a far vedere che ogni ruolo vede una cosa diversa. **Le password della demo non aprono nulla dello studio**: sono due database diversi.

## Quello che ancora manca

**Un account per funzione non è un account per persona.** Finché i cinque cardiologi entrano tutti da `medico@`, la pagina Visite non può dire «i *tuoi* pazienti» senza chiederlo, e il registro dice «un medico», non quale. Il passo successivo è un utente per ogni cardiologo, collegato al suo `providers.user_id`: da lì la domanda «chi sei?» sparisce da sola e ogni gesto ha un nome.

## Chi vede che cosa (23.9.2026)
Decisione dello studio: ogni ruolo vede le sezioni del suo lavoro e ha la sua home. **Il tecnico vede tutto**: è chi amministra la piattaforma (fino al 22.9 era tenuto fuori dai dati clinici; decisione cambiata dallo studio). Una tabella sola, `src/lib/permessi.ts`, usata da tre posti: il menu (le sezioni arrivano con `/api/prototipo/dati` → `sezioni`), le rotte del server (`vietato(ruolo, sezione)` → 403 in 25 rotte di `/api/prototipo/`) e il middleware per le pagine della vecchia interfaccia. Chi apre a mano l'indirizzo di una sezione non sua torna alla home.

| sezione | medico | aiuto medico | segreteria | amministrazione | tecnico |
|---|---|---|---|---|---|
| Agenda, Visite, Richiami, Sale, Pazienti, Percorsi, Documenti, Moduli, Immagini, Attività, Cleo | ✅ | ✅ | ✅ | ✅ | ✅ |
| Referti | ✅ | — | ✅ | ✅ | ✅ |
| Dittafono | ✅ | ✅ | — | — | ✅ |
| Prestazioni, Invianti, Converti audio, Anonimizzazione, Da fatturare | — | — | ✅ | ✅ | ✅ |
| Amministrazione | — | — | — | ✅ | ✅ |

Le regole più fini delle singole rotte restano: misurare sulle immagini è di medico, aiuto medico e amministrazione (il righello è un dispositivo in-house con i suoi utenti previsti: il tecnico guarda, non misura); modificare lo Studio e le impostazioni è di amministrazione e tecnico.

**Home per ruolo** (`PAGES.home` nel ponte, stessi blocchi composti diversamente): medico «La tua giornata» (prossimo paziente, visti da dettare → Dittafono, referti, richiami, cose da fare, sale); aiuto medico «Le sale e i pazienti di oggi» (sale, accoglienza, prossimo paziente); segreteria «La giornata dello studio» (tutti i numeri, cose da fare, accoglienza); amministrazione «Lo studio oggi» (numeri, Da fatturare, Amministrazione); tecnico «Tutta la piattaforma». Le caselle e i tasti verso sezioni non del ruolo non compaiono.

Prove: `src/lib/prove-permessi.test.ts` e il blocco «chi vede che cosa» di `npm run test:e2e` (menu e 403 ruolo per ruolo sul database demo).
