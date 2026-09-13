---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Server Mac mini dello studio

Livello 1 (fatto 2026-08-13): il Mac mini dello studio è il server interno. `bash mac/installa-server.sh` una volta → servizio launchd `ch.referralflow.app` (`server-avvio.sh`: attende Postgres, git pull, migrazioni, rebuild quando `.build-stamp` ≠ HEAD, `npm start`) + backup notturno 02:30 `ch.referralflow.backup` (pg_dump 14 gg + rsync uploads in `~/ReferralFlow-backup`) + pmset no-sleep/autorestart. `APP_BASE_URL` = `http://<nome-mac>.local:3000` (LAN, cookie non-secure ok). Il repo `~/referralflow` È il checkout del server: le sessioni di sviluppo lavorano lì.

Aggiornamento: `bash mac/aggiorna-server.sh` (pull + kickstart). Livello 2 (dominio, HTTPS, hardening) rimandato ad app assestata + parte legale.

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
