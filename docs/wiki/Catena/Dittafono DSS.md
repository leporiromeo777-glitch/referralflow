---
tipo: tappa
aggiornata: 2026-09-13
---
# Dittafono Philips DPM (.dss / .ds2)

`.dss`/`.ds2` ammessi su pannello e pagina Referti (MIME `audio/x-dss`). Collaudato su un DS2 vero il 7.9.2026: ffmpeg NON decodifica i .ds2 (il suo dss_sp è un altro codec: con `-f dss` forzato esce rumore «parlante», whisper collassa a 36 caratteri) → decoder open source vendorizzato in `pipeline-referti/strumenti/dss-codec/` (hirparak/dss-codec, MIT, Python + numpy), chiamato da `decodifica_dittafono()` all'inizio di `elabora` (il WAV `<file_id>.dittafono.wav` sostituisce l'ingresso; .ds2 non decodificabile = errore, mai ripiego su ffmpeg). Stesso decoder nel pannello, nella rotta audio dell'app (env `DS2_DECODER`/`DS2_DECODER_PYTHON`) e in esporta-oro. I .dss classici: ffmpeg con `-f dss` (`_formato_ingresso()`). File cifrati: password non gestita.

La data di registrazione (`payload.dettato_il`) si legge dall'header DSS all'offset 0x26 ed è la data della lettera.

## Dittafono dal telefono (13.9.2026, dal prototipo)
La PWA «Dittafono clinico» del pacchetto [[Piattaforma/Prototipo stack]] è servita dalla piattaforma in `public/dittafono/` (build di `~/referralflow-stack/dittafono-clinico`, base `./`), link «Detta dal telefono» nella pagina Referti. Registra in locale sul telefono (pausa, inserimento nel mezzo, marker, undo) e, quando è aperta DENTRO la piattaforma, ha in più «Invia a ReferralFlow» nella scheda Esporta: lo stesso WAV dell'esportazione (16 kHz mono, silenzi ridotti, livello normalizzato) va a `POST /api/referti/upload` con la sessione del browser, con `medico` e `tipo` scelti nelle impostazioni dell'app (elenco dei medici da `GET /api/referti/upload`). Da lì la coda e la catena sono le stesse del DS2. Codice: `src/sync/referralflowTarget.ts`, impostazioni `referralflowMedico`/`referralflowTipo`, `doSend` in `DetailScreen.tsx`.
**HTTPS obbligatorio**: il microfono nel browser esiste solo su origini sicure, quindi dal telefono la piattaforma va aperta su **https://192.168.1.146:3444** (Caddy, `ch.referralflow.caddy`, certificato della CA interna: sul telefono va installato e reso attendibile `~/silverbullet/caddy-root.crt`, una volta). Su http://…:3000 il dittafono si apre ma non registra. Ricostruire dopo una modifica: `npm run build` nella cartella del dittafono e copia di `dist/` in `public/dittafono/`.
Intestazioni di sicurezza (`next.config.mjs`): `Permissions-Policy` con `microphone=(self)` e CSP con `media-src 'self' blob:` e `worker-src 'self' blob:`, altrimenti la piattaforma stessa spegne il microfono e la riproduzione dei segmenti registrati.
