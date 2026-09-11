---
tipo: wiki
aggiornata: 2026-09-11
---
# Come si usa questa wiki

## Che cos'è
File Markdown in `docs/wiki/` del repo, una pagina per argomento, con un'intestazione (`tipo`, `medico`, `aggiornata`). Si leggono e si modificano come testo; git ne tiene la storia. Il CLAUDE.md del repo contiene solo le regole e l'indice: il resto sta qui.

## Chi la scrive
- Il modello (Claude Code), a ogni modifica del codice: aggiorna la pagina dell'argomento con lo stato nuovo, sposta i numeri in [[Misure/Banchi]] e le scelte in [[Decisioni/Registro]]. Non appende paragrafi in coda: riscrive ciò che non è più vero.
- Le persone dello studio, dal browser con SilverBullet o con qualunque editor. Una decisione scritta a parole in [[Decisioni/Registro]] vale come istruzione per il modello.

## Le pagine che la catena usa davvero
`Agenti/` è l'unica cartella che finisce nei prompt: compilata al deploy in `medici.json` e `conoscenza-agenti.json` ([[Agenti/Come funziona]]). Chi cambia una di quelle pagine cambia il comportamento della catena dal deploy successivo, e la versione del prompt nel cruscotto. Tutte le altre pagine sono per le persone e per le sessioni di sviluppo.

## Regole delle pagine
- Dice che cos'è vero oggi; la storia sta in git.
- Niente dati clinici, niente esempi presi da referti veri, niente credenziali.
- Link tra pagine con le doppie parentesi quadre: `[[Catena/Arbitro]]`.
- Una misura senza data e senza comando per ripeterla non vale.

## SilverBullet (la finestra nel browser)
- Binario `silverbullet` in `~/silverbullet/`, versione 2.10.0, spazio = `~/referralflow/docs/wiki`, servizio launchd `ch.referralflow.silverbullet`, ascolta SOLO su `127.0.0.1:3400`.
- SilverBullet richiede HTTPS o `localhost` (service worker e crypto del browser): sul Mac che lo ospita si apre `http://localhost:3400`; dagli altri PC dello studio si passa da Caddy in HTTPS: `https://192.168.1.146:3443` (servizio launchd `ch.referralflow.caddy`, `~/silverbullet/caddy/Caddyfile`, certificati della CA interna di Caddy, log `~/referti/log/caddy.log`).
- Ogni PC che usa l'indirizzo HTTPS deve fidarsi UNA volta della CA interna: il file è `~/silverbullet/caddy-root.crt` (valido fino al 2036); su Mac: doppio clic → Accesso Portachiavi → «Fidati sempre» (chiede la password del Mac); su Windows: importare tra le «Autorità di certificazione radice attendibili». Senza, il browser avvisa e SilverBullet non parte.
- Al primo accesso chiede utente e password; lasciare spenta «Enable client encryption».
- Utente e password stanno in `~/.referralflow-silverbullet.conf` (chmod 600, variabile `SB_USER=utente:password`), generati all'installazione; per cambiarli: modificare il file e `launchctl unload/load` del plist in `~/Library/LaunchAgents/`.
- I file di servizio di SilverBullet dentro `docs/wiki/` (indice, `_plug/`, `SETTINGS.md`, `CONFIG.md`, `Library/`) sono nel `.gitignore`: nel repo entrano solo le pagine.
- Se una pagina viene modificata da fuori (dal modello o da git), SilverBullet la rilegge alla riapertura; in caso di dubbio il comando «Space: Reindex».
- Mai esporlo fuori dalla LAN: è il diario tecnico dello studio.
- Log: `~/referti/log/silverbullet.log`.
