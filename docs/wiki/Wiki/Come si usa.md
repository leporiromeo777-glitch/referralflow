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

## Regole delle pagine
- Dice che cos'è vero oggi; la storia sta in git.
- Niente dati clinici, niente esempi presi da referti veri, niente credenziali.
- Link tra pagine con le doppie parentesi quadre: `[[Catena/Arbitro]]`.
- Una misura senza data e senza comando per ripeterla non vale.

## SilverBullet (la finestra nel browser)
- Binario `silverbullet` in `~/silverbullet/`, versione 2.10.0, spazio = `~/referralflow/docs/wiki`, servizio launchd `ch.referralflow.silverbullet`, porta **3400** su tutta la LAN: `http://192.168.1.146:3400` (o `http://Mac-mini-di-Centro.local:3400` dai PC che risolvono il nome). Al primo accesso chiede utente e password.
- Utente e password stanno in `~/.referralflow-silverbullet.conf` (chmod 600, variabile `SB_USER=utente:password`), generati all'installazione; per cambiarli: modificare il file e `launchctl unload/load` del plist in `~/Library/LaunchAgents/`.
- I file di servizio di SilverBullet dentro `docs/wiki/` (indice, `_plug/`, `SETTINGS.md`, `CONFIG.md`, `Library/`) sono nel `.gitignore`: nel repo entrano solo le pagine.
- Se una pagina viene modificata da fuori (dal modello o da git), SilverBullet la rilegge alla riapertura; in caso di dubbio il comando «Space: Reindex».
- Mai esporlo fuori dalla LAN: è il diario tecnico dello studio.
- Log: `~/referti/log/silverbullet.log`.
