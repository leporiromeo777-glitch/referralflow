---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Server Mac mini dello studio

Livello 1 (fatto 2026-08-13): il Mac mini dello studio è il server interno. `bash mac/installa-server.sh` una volta → servizio launchd `ch.referralflow.app` (`server-avvio.sh`: attende Postgres, git pull, migrazioni, rebuild quando `.build-stamp` ≠ HEAD, `npm start`) + backup notturno 02:30 `ch.referralflow.backup` (pg_dump 14 gg + rsync uploads in `~/ReferralFlow-backup`) + pmset no-sleep/autorestart. `APP_BASE_URL` = `http://<nome-mac>.local:3000` (LAN, cookie non-secure ok). Il repo `~/referralflow` È il checkout del server: le sessioni di sviluppo lavorano lì.

Aggiornamento: `bash mac/aggiorna-server.sh` (pull + kickstart). Livello 2 (dominio, HTTPS, hardening) rimandato ad app assestata + parte legale.

## Caddy: una sola configurazione, e una sentinella (14.9.2026)
Alle 01:10-01:13 del 14.9.2026 il file `~/silverbullet/caddy/Caddyfile` (quello SENZA il blocco del dominio) è stato modificato tre volte (aggiunti 192.168.1.152, l'indirizzo Tailscale 100.99.102.44 e il nome `…ts.net`) e caricato in Caddy tramite l'API di amministrazione: il blocco `cct.referralflow.ch` è sparito dalla configurazione viva, la stretta di mano TLS falliva («tlsv1 alert internal error») e la piattaforma è stata irraggiungibile per circa un'ora, con l'app e il certificato su disco perfettamente sani. Non è stata questa sessione di Claude; chi ha fatto la modifica non risulta.
Rimedi messi:
- `Caddyfile` ora contiene solo `import Caddyfile.dominio`: chiunque ricarichi «il Caddyfile» ottiene la configurazione col dominio. Il vecchio file senza dominio è `Caddyfile.senza-dominio`, usato da `avvia-caddy.sh` solo se manca il modulo DNS Infomaniak.
- In `Caddyfile.dominio` sono entrati anche 192.168.1.152 (Wi-Fi) e 100.99.102.44 (Tailscale) con la CA interna; il nome `…ts.net` NO: Let's Encrypt non lo risolve e Caddy ci riprova all'infinito.
- **Sentinella** `mac/sentinella-caddy.sh` (launchd `ch.referralflow.sentinella-caddy`, ogni 5 minuti, eseguita dal checkout: le modifiche valgono al giro dopo): prova `https://cct.referralflow.ch/login` sul Mac; dopo due fallimenti di fila riavvia Caddy e lo scrive in `~/referti/log/sentinella-caddy.log`. **Dal 14.9.2026 sera controlla anche il record A**: confronta l'indirizzo LAN del Mac (scheda attiva) con la risposta di `nsany1.infomaniak.com`; se differiscono lancia `attiva-dominio.sh <ip>` una volta sola per indirizzo (`sentinella-caddy.ip` ricorda l'ultimo inviato, perché Infomaniak pubblica con ~25 minuti di ritardo). Così il dominio segue il Mac anche senza cavo Ethernet; resta il quarto d'ora abbondante di propagazione a ogni cambio, che solo una prenotazione DHCP sul router (MAC Wi-Fi del Mac: `d0:11:e5:92:3f:38`) o un indirizzo manuale nelle impostazioni di rete del Mac eliminano del tutto.
Regola: per riavviare Caddy si usa `launchctl kickstart -k gui/$(id -u)/ch.referralflow.caddy`, mai `caddy reload` con un file a mano.

## Se «non si raggiunge la piattaforma» (14.9.2026)
Prima cosa da guardare: **l'indirizzo LAN del Mac**. Il dominio `cct.referralflow.ch` punta a un indirizzo privato della rete dello studio; se il Mac cambia indirizzo, il dominio punta nel vuoto e nessuno entra (né dal telefono né dal PC), mentre sul Mac tutto risponde su `localhost`. Il 14.9.2026 alle 00:40 il cavo Ethernet (`en0`) è risultato staccato: il Mac è passato al Wi-Fi (`en1`) con 192.168.1.152 al posto di 192.168.1.146, e nello stesso momento era caduto anche un push verso GitHub. Rimedio: `bash ~/silverbullet/caddy/attiva-dominio.sh` (copia in `mac/attiva-dominio.sh`) ora rileva da solo l'indirizzo della scheda attiva (o lo prende come argomento) e aggiorna il record A via API Infomaniak (TTL 300 s: qualche minuto di propagazione, di più sui telefoni che tengono la cache). Meglio ancora: ricollegare il cavo Ethernet, che ha l'indirizzo riservato .146, e rilanciare lo script. Da fare: chiedere al router una prenotazione DHCP anche per il Wi-Fi del Mac, così l'indirizzo non cambia più. **È successo di nuovo la sera del 14.9.2026**: cavo ancora staccato, il Wi-Fi ha ricevuto 192.168.1.159 al posto di .152 e il dominio puntava nel vuoto («non mi apre ReferralFlow»); risolto con `bash mac/attiva-dominio.sh` (record A → .159). Finché il cavo resta staccato può ricapitare a ogni rinnovo DHCP: la prenotazione sul router non è più rimandabile.

## Se un PC va in timeout: il filtro di rete del Mac (7.10.2026)
Seconda cosa da guardare, quando l'indirizzo del dominio è giusto ma da un altro computer la pagina «ha impiegato troppo tempo per rispondere»: il **filtro pf «weblinkx»** del Mac. Sta in `/etc/pf.anchors/weblinkx` (leggibile senza privilegi), è caricato da `/etc/pf.conf` e acceso a ogni avvio da `/Library/LaunchDaemons/ch.weblinkx.pf.plist` → `/usr/local/bin/weblinkx-pf.sh`.
- Le porte dell'app (80, 443, 3443, 3444) si aprono **solo dalle reti elencate nella macro `lan`**; il resto è scartato in silenzio (timeout, non rifiuto). Fino al 7.10.2026 c'era solo `192.168.1.0/24`; quel giorno lo studio ha aggiunto `192.168.20.0/24` (il Wi-Fi dell'ufficio) e poi `192.168.0.0/24` (la rete del cavo, che è anche quella dei PC fissi e degli apparecchi). **Dal 7.10.2026 il Mac sta solo sulla rete `192.168.0.`** — cavo con l'indirizzo fisso `192.168.0.188` e Wi-Fi sulla rete nascosta della stessa rete — e il dominio punta a `192.168.0.188`: i PC collegati col cavo aprono l'app senza Wi-Fi. Il router non fa passare niente tra `192.168.0.` e `192.168.20.`: chi è solo sul Wi-Fi dell'ufficio non ci arriva. La sentinella pubblica l'indirizzo del cavo perché è l'unico che resta (`NON_PUBBLICARE="192.168.0."` in `~/.referralflow-dominio.conf` vale solo quando il Mac ha anche un indirizzo su un'altra rete: se il Wi-Fi tornasse su quella dell'ufficio, il dominio si sposterebbe di nuovo lì).
- Le porte d'amministrazione (22, 88, 5900, 3000, 8765, 60738) sono chiuse sulle schede fisiche e passano solo da Tailscale: `http://<indirizzo>:3000` da un altro computer non risponde mai, non è una prova.
- Le prove fatte dal Mac verso sé stesso non passano dal filtro: dimostrano che l'app è accesa, non che da fuori si entri. La prova vera è un altro computer.
- Cambiare il filtro è un'impostazione di sicurezza e chiede l'amministratore del Mac (`adminrfea`: l'utente di lavoro `centrocardiologicoticino` non è amministratore). Dopo la modifica: `sudo pfctl -f /etc/pf.conf`.
- Il firewall delle applicazioni di macOS è un'altra cosa (`socketfilterfw --listapps`): l'app passa anche senza una riga per `caddy-infomaniak`; il Python del ricevitore DICOM invece va ammesso a mano, e la riga è legata alla versione di Python (a ogni aggiornamento torna bloccato).

## La cartella del NAS (8.10.2026)
`/Volumes/Archivio-Dati-Philips` è la cartella condivisa `smb://archivio@192.168.0.243/Archivio-Dati-Philips` del NAS dello studio (Synology, `nas-sa3600.cardioticino.local`). La tiene collegata `ch.referralflow.nas` (`mac/monta-nas.sh`, ogni due minuti; registro in `~/Library/Logs/ReferralFlow/nas.log`), con la password del portachiavi. Indirizzo e cartella stanno in `~/referti-imaging/archivio-file.conf`: mai la password. Un servizio in sottofondo legge un volume di rete solo dopo che macOS gliene ha dato il permesso (Privacy e sicurezza → File e cartelle): se nel registro compare «Operation not permitted», manca quello, non il collegamento. Dettaglio in [[Piattaforma/Immagini]].

## Servizi launchd sul Mac
| servizio | cosa fa |
|---|---|
| `ch.referralflow.app` | l'app Next.js su :3000 |
| `ch.referralflow.backup` | backup notturno |
| `ch.referralflow.automazioni` | ogni 15 min: agenda, SMS, watchdog 07, report il 1° (vedi [[Piattaforma/Automazioni]]) |
| `ch.referralflow.agenda-robot` | robot MediOnline ai minuti 1,16,31,46 |
| `ch.referralflow.referti-servizio` | la catena dei referti (`~/referti-pipeline/pipeline.py --servizio`), log in `~/referti/log/servizio.log` |
| `ch.referralflow.referti-pannello` | pannello locale di caricamento dettati |
| `ch.referralflow.silverbullet` | questa wiki, solo `localhost:3400` (vedi [[Wiki/Come si usa]]) |
| `ch.referralflow.caddy` | HTTPS davanti alla wiki per la LAN, `https://192.168.1.146:3443`, CA interna |
| `ch.referralflow.consolidatore` | alle 03:30 `npm run consolida`: proposte nella wiki (`Proposte/`), log `~/referti/log/consolidatore.log` |

Le variabili del servizio referti stanno in `~/referti-pipeline/invio.conf` E nel plist (copiate all'installazione): cambiarle in entrambi, poi `launchctl unload/load`.

## Vecchia VM
Cron `/etc/cron.d/referralflow` via `cron-hit.sh`; backup off-site su Exoscale SOS `referralflow-backups` (60 gg); allegati di produzione su SOS `referralflow-uploads`.

Dal 13.9.2026 sul Mac girano anche `ch.referralflow.prototipo` (porta 8765) e `ch.referralflow.voce` (127.0.0.1:8787): vedi [[Piattaforma/Prototipo stack]].
Caddy pubblica anche la piattaforma in HTTPS: https://192.168.1.146:3444 → 127.0.0.1:3000 (per il microfono del dittafono dal telefono).
Dal 13.9.2026 Caddy pubblica la piattaforma anche sulle porte standard: https://192.168.1.146/ (e imac-2.local, mac-mini-di-centro.local) → 127.0.0.1:3000, con http:// che rimanda a https://. I certificati sono della CA interna di Caddy (`~/silverbullet/caddy-root.crt` da installare sui dispositivi).

## Dominio dello studio: cct.referralflow.ch (13.9.2026)
Il Mac resta in rete locale, ma ha un nome pubblico con certificato ufficiale: `cct.referralflow.ch` → record A `192.168.1.146` nella zona DNS di referralflow.ch (Infomaniak). Caddy gira nel binario `~/silverbullet/caddy-infomaniak` (scaricato da caddyserver.com con il modulo `dns.providers.infomaniak`), avviato da `~/silverbullet/caddy/avvia-caddy.sh` con `~/silverbullet/caddy/Caddyfile.dominio`; il token API Infomaniak (ambito «domain») sta SOLO in `~/.referralflow-dns.conf` (`DNS_TOKEN=…`, chmod 600) e Caddy lo legge all'avvio per la verifica DNS-01 di Let's Encrypt. Senza quel file lo script avvia il Caddy di Homebrew con la CA interna, come prima. `attiva-dominio.sh` crea il record A via API e riavvia. Lezione: Infomaniak pubblica i record nuovi con circa 25 minuti di ritardo, quindi nel blocco `tls` ci sono `resolvers nsany1/nsany2.infomaniak.com`, `propagation_delay 30s`, `propagation_timeout 45m`; il primo certificato è arrivato dopo tre tentativi. Rinnovo automatico. Indirizzi: piattaforma **https://cct.referralflow.ch/**, prototipo `/prototipo/`, dittafono `/dittafono/`, wiki **https://cct.referralflow.ch:3443/**. `APP_BASE_URL` in `.env` è ora `https://cct.referralflow.ch`: i cookie di sessione sono «secure», quindi il login su http://localhost:3000 non funziona più: si usa sempre il dominio. Gli indirizzi con l'IP (:3000, :3443, :3444, 443) restano con la CA interna. Il token va rigenerato se finisce in una chat o in un log.

## Solver delle sale (16.9.2026)
`ch.referralflow.solver-sale`: OR-Tools CP-SAT come servizio locale su `127.0.0.1:8711`, in un Python isolato (`solver-sale/.venv`, non tocca la catena dei referti). Si installa con `bash solver-sale/installa.sh`; log in `~/referti/log/solver-sale.log`. Se non risponde entro 2 s la piattaforma usa il riparatore in TypeScript e lo scrive nella pagina. Progetto in [[Piattaforma/Orchestrazione sale]].
