---
tipo: piattaforma
aggiornata: 2026-09-16
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

Nel frattempo il menu è quasi lo stesso per tutti: nell'interfaccia nuova le voci vengono decise a runtime (`rfCaricaDati`) e differiscono solo per «Da fatturare». Dare a ogni ruolo il suo menu è una riga di codice e una decisione dello studio: chi deve vedere che cosa.
