# ReferralFlow sul Mac mini dello studio

Questa cartella serve a far girare **l'app ReferralFlow direttamente sul Mac
mini dello studio**, così i dati restano in casa (come già succede per i
referti). Due tappe:

1. **Anteprima locale** — la fai partire e la provi nel browser del Mac, con
   dati demo. È il passo di adesso.
2. **Server dello studio** — la stessa app, ma raggiungibile dal vostro
   dominio così i medici invianti e i pazienti possono aprire i link da fuori.
   È il passo dopo, lo prepariamo insieme (vedi in fondo).

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

## 2. Server dello studio (passo successivo)

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
