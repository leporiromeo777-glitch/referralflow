# ReferralFlow sul Mac mini dello studio

Questa cartella serve a far girare **l'app ReferralFlow direttamente sul Mac
mini dello studio**, così i dati restano in casa (come già succede per i
referti). Tre tappe:

1. **Anteprima locale** — la fai partire e la provi nel browser del Mac, con
   dati demo.
2. **Server interno dello studio** — la stessa app, sempre accesa e usabile
   da tutti i computer dello studio, dentro le mura (`installa-server.sh`).
3. **Raggiungibile da fuori** — dominio + HTTPS perché medici invianti e
   pazienti aprano i link da casa. È il passo dopo, lo prepariamo insieme
   (vedi in fondo).

---

## 1. Anteprima locale (adesso)

### Cosa serve
- Il Mac mini con **Homebrew** già installato (lo stesso che usi per i referti).
- Nient'altro: lo script installa da solo Node e PostgreSQL la prima volta.

### Come si avvia
Apri il Terminale nella cartella del progetto e lancia:

```bash
bash mac/avvia-anteprima.sh
```

La prima volta installa il necessario, prepara il database con dati finti e
compila l'app: qualche minuto. Le volte dopo parte in pochi secondi.

Quando vedi il messaggio «ReferralFlow è pronto», il browser si apre da solo su
**http://localhost:3000**. Accedi con:

- utente: **admin@demo.ch**
- password: **demo1234**

Dentro trovi già dei dati finti per cliccare ovunque: la Coda, i **Consulti
rapidi**, il **Programma** con la scheda pre-visita, un modulo d'invio con gli
**slot proposti**, il dettaglio referral con **questionario** e slot preferito.

### Per fermarla
Premi **Ctrl-C** nella finestra del Terminale. Il database resta pronto per la
prossima volta. Per ripartire, rilancia lo stesso comando.

### Note
- I nomi dei pazienti nei dati demo sono inventati.
- Gli allegati, senza object storage, finiscono nella cartella `./uploads`: va
  benissimo in locale.
- Email e SMS restano spenti finché non configuri `SMTP_HOST` / `SMS_API_TOKEN`
  nel file `.env`.
- La **cattura AI dell'impegnativa** resta spenta finché non aggiungi
  `ANTHROPIC_API_KEY` al `.env` (e prima serve il via libera legale, come per i
  pagamenti).

---

## 2. Server interno dello studio (livello 1)

Quando l'anteprima ti convince, trasformi il Mac nel **server dello studio**:
l'app resta sempre accesa (parte da sola all'accensione, riparte se cade) e
si apre **da tutti i computer dello studio**, non solo dal Mac.

Una volta sola, dalla cartella del progetto:

```bash
bash mac/installa-server.sh
```

Lo script chiede la password del Mac (per impostarlo a non andare mai in
stop), installa il servizio automatico e il **backup notturno** (database +
allegati in `~/ReferralFlow-backup`, ore 02:30, 14 giorni conservati), e alla
fine stampa l'indirizzo per gli altri computer, del tipo
`http://nome-del-mac.local:3000`.

Da fare a mano, una volta (lo script te lo ricorda):

- **Login automatico**: Impostazioni di Sistema → Utenti e gruppi → attiva il
  login automatico su questo utente. Così dopo un riavvio (anche da blackout)
  riparte tutto senza toccare nulla.
- **Firewall**: al primo avvio macOS chiede se «node» può accettare
  connessioni in entrata → **Consenti**.
- **Ollama**: nelle sue impostazioni attiva l'avvio al login, così le funzioni
  AI locali sono sempre disponibili.
- **Cavo di rete**: collega il Mac al router via cavo, non in Wi-Fi.

Da quel momento:

- **Aggiornare l'app**: `bash mac/aggiorna-server.sh` (scarica le novità e
  riavvia; se il codice è cambiato ricompila da solo, 1-2 minuti).
- `avvia-anteprima.sh` non serve più: se lo lanci, ti rimanda da solo al
  comando giusto.
- Il registro del servizio è in `~/Library/Logs/ReferralFlow/server.log`.
- Per fermare tutto: `launchctl unload ~/Library/LaunchAgents/ch.referralflow.app.plist`.

L'app resta visibile **solo dentro la rete dello studio**: da fuori nessuno
la raggiunge (per quello c'è il livello 3, sotto).

### Agenda Cassa dei Medici (MediOnline)

Se lo studio non ha un link iCal, c'è il **robot dell'agenda**
(`mac/agenda-robot/`): legge MediOnline con le credenziali dello studio
(salvate solo sul Mac) e travasa gli appuntamenti nel Programma. Prima volta:

```bash
bash mac/agenda-robot/installa.sh
node mac/agenda-robot/radiografia.mjs   # una volta, guidato
```

La radiografia produce `~/agenda-radiografia.txt` (solo struttura, niente
pazienti) da incollare in chat: serve a costruire il lettore su misura.

Quando il lettore è pronto (lo è dal 2026-08-14):

```bash
node mac/agenda-robot/leggi-agenda.mjs      # prova a mano, guarda l'esito
bash mac/agenda-robot/attiva-servizio.sh    # poi ogni quarto d'ora da solo
```

In ReferralFlow → Programma → «Agenda: feed e medici»: aggiungi un feed con
indirizzo `locale:medionline.ics` e campo del medico «location»; crea i
medici dello studio e metti le SIGLE delle agende MediOnline (ASM, M.M.,
T.M., …) tra i loro alias.

Il robot è in **sola lettura**: guarda l'agenda e basta — l'unico modulo che
compila è il login, non salva né conferma mai nulla su MediOnline, e ogni
finestra di conferma viene rifiutata in automatico. Se MediOnline cambia
grafica, il robot prova a **ripararsi da solo** con l'AI locale del Mac (la
proposta dell'AI viene verificata dal codice prima di essere adottata); se
non ci riesce, si ferma con un avviso visibile nella pagina dei feed.

---

## 3. Raggiungibile da fuori (passo successivo)

Per far sì che i medici invianti aprano `/invia/…` e i pazienti confermino
l'appuntamento da fuori, il Mac mini deve essere **raggiungibile dal vostro
dominio**, restando l'app e il database in studio. Serve, in breve:

- un **nome di dominio** dello studio che punti al Mac (IP fisso o servizio di
  DNS dinamico);
- un **reverse proxy con HTTPS** davanti all'app (certificato TLS — obbligatorio
  per dati sanitari);
- l'app avviata **come servizio** che riparte da sola all'accensione (launchd,
  come i referti);
- un minimo di **sicurezza di rete** (firewall, aggiornamenti, backup del
  database del Mac).

Sono passaggi che tocca fare con attenzione: li prepariamo insieme quando
l'anteprima ti convince. Da quel momento il Mac mini fa sia i referti sia
l'app, e nessun dato dello studio esce dalla Svizzera.
