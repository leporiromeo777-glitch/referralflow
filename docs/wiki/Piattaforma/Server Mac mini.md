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

Le variabili del servizio referti stanno in `~/referti-pipeline/invio.conf` E nel plist (copiate all'installazione): cambiarle in entrambi, poi `launchctl unload/load`.

## Vecchia VM
Cron `/etc/cron.d/referralflow` via `cron-hit.sh`; backup off-site su Exoscale SOS `referralflow-backups` (60 gg); allegati di produzione su SOS `referralflow-uploads`.
