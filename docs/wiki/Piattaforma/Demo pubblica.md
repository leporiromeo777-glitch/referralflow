---
tipo: piattaforma
aggiornata: 2026-09-16
---
# Demo pubblica

La piattaforma **vera**, raggiungibile da fuori con un link, con un database suo e **dati tutti inventati**. Serve a farla vedere senza portarsi dietro il Mac (16.9.2026, prima della riunione del 17 su [[Proposte/CardioOS confronto per funzione]]).

Il punto non è avere qualcosa da mostrare: è mostrare **la cosa vera**. Login, ruoli, dettatura del referto (whisper gira su questo Mac), Cleo che risponde davvero, e due dispositivi che vedono lo stesso dato nello stesso momento — le tre cose che una demo senza server non può fare.

## Com'è fatta

| pezzo | dove |
|---|---|
| codice | `~/referralflow-demo` — un *git worktree* dello stesso repo, staccato (`git worktree add --detach`), con `node_modules` in link simbolico a quello principale |
| configurazione | `~/referralflow-demo/.env` (fuori da git): `DATABASE_URL` sul database demo, `SESSION_SECRET` suo, `PORT=3100`; i modelli locali sono gli stessi dello studio, così Cleo e la dettatura funzionano |
| database | `referralflow_demo` (Postgres locale) — **separato**: dal link pubblico il database dello studio non è raggiungibile |
| servizio | `ch.referralflow.demo` (launchd, `mac/demo-avvio.sh`) sulla porta **3100** |
| link | `cloudflared` apre una galleria dall'esterno **solo** verso la porta 3100 (`mac/demo-link.sh`) |
| allegati | `~/referralflow-demo/uploads/` — i PDF inventati di `dati-prova` |

Nel `next.config.mjs` della copia demo c'è una riga in più: `serverActions.allowedOrigins` con `*.trycloudflare.com`. Senza, Next rifiuta le server action (cioè il login) perché l'origine non è localhost. **È una modifica locale non committata**: se si sposta il worktree su un commit nuovo, va rimessa.

## I dati (tutti inventati)

- **12 medici**: questi sì sono quelli veri dello studio — le regole delle sale ([[Medici/Sale]]) parlano di loro, e con nomi di fantasia il piano delle stanze non mostrerebbe niente. Nomi di medici non sono dati sanitari.
- **6 pazienti in cartella** con referral, documenti e PDF (`npm run dati-prova`), più una ventina di persone inventate che stanno **solo in agenda** — che è la situazione più comune anche nello studio vero.
- **~40 appuntamenti di oggi** distribuiti sui medici (`scripts/demo-agenda.ts`), con le prestazioni del catalogo vero.
- **Due accessi**: uno `admin` (vede tutto) e uno `medico` collegato a un provider — serve per la pagina [[Piattaforma/Orchestrazione sale]] §14E, che mostra «i **tuoi** pazienti in sala d'attesa» solo se l'utente è collegato a un medico.

Nessun dato di persona vera esiste in quel database. Se un giorno ne finisse dentro uno, la demo va spenta.

## Comandi

```
bash mac/demo-link.sh          # il link di adesso (lo riapre se è caduto)
launchctl kickstart -k gui/$(id -u)/ch.referralflow.demo    # riavvia la demo
cd ~/referralflow-demo && NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/demo-agenda.ts           # rifà la giornata di oggi
cd ~/referralflow-demo && NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/demo-agenda.ts domani    # e quella di domani (o una data: 2026-09-17)
git -C ~/referralflow-demo checkout <commit> && launchctl kickstart -k gui/$(id -u)/ch.referralflow.demo          # porta la demo a una versione nuova
```

La giornata **va rifatta ogni giorno**: gli appuntamenti portano una data, e il giorno dopo l'agenda di «oggi» è vuota. Il 16.9 sono state preparate due giornate, il 16 e il 17.

## I limiti, detti prima

- **Il Mac deve essere acceso e in rete.** La demo gira qui: se il Mac dorme o la linea dello studio cade, il link non risponde.
- **Il link cambia a ogni riavvio del tunnel.** È un tunnel gratuito e senza account (`trycloudflare.com`): ogni volta che riparte l'indirizzo è nuovo. `mac/demo-link.sh` dice sempre qual è quello buono, ed è scritto anche in `~/Library/Logs/ReferralFlow/link-demo.txt`.
- **È un indirizzo pubblico**: chi ha il link vede la pagina di accesso. Dentro non entra senza le credenziali della demo, ma le credenziali della demo sono fatte per essere date in giro. Per questo nel database demo non c'è nulla di vero.

La via definitiva, quando servirà una demo sempre accesa e con un indirizzo stabile (`demo.referralflow.ch`), è un piccolo server pubblico da Infomaniak: stesso codice, stesso database vuoto, ~CHF 10-20 al mese. Non è stata fatta perché costa e perché per la riunione del 17 non serviva.
