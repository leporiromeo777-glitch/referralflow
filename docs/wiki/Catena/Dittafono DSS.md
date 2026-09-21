---
tipo: tappa
aggiornata: 2026-09-19
---
# Dittafono Philips DPM (.dss / .ds2)

`.dss`/`.ds2` ammessi su pannello e pagina Referti (MIME `audio/x-dss`). Collaudato su un DS2 vero il 7.9.2026: ffmpeg NON decodifica i .ds2 (il suo dss_sp è un altro codec: con `-f dss` forzato esce rumore «parlante», whisper collassa a 36 caratteri) → decoder open source vendorizzato in `pipeline-referti/strumenti/dss-codec/` (hirparak/dss-codec, MIT, Python + numpy), chiamato da `decodifica_dittafono()` all'inizio di `elabora` (il WAV `<file_id>.dittafono.wav` sostituisce l'ingresso; .ds2 non decodificabile = errore, mai ripiego su ffmpeg). Stesso decoder nel pannello, nella rotta audio dell'app (env `DS2_DECODER`/`DS2_DECODER_PYTHON`) e in esporta-oro. I .dss classici: ffmpeg con `-f dss` (`_formato_ingresso()`). File cifrati: password non gestita.

La data di registrazione (`payload.dettato_il`) si legge dall'header DSS all'offset 0x26 ed è la data della lettera.

## Dittafono dal telefono
Dal 23.9.2026 è una pagina della piattaforma, non più l'applicazione «Dittafono clinico» in `public/dittafono/`: vedi [[Piattaforma/Dittafono]]. Resta vero che il microfono nel browser esiste solo su origini sicure (https o localhost) e che servono `Permissions-Policy: microphone=(self)` e `media-src 'self' blob:`.

## Converti audio (19.9.2026)
Voce del menu «Converti audio», nel gruppo Clinico: un file del dittafono (o qualunque audio comune) entra e torna un **MP3** — mono, 44,1 kHz, 96 kbit/s, voce non musica — che si apre ovunque. Serve a chi deve riascoltare o passare un dettato fuori dalla catena senza il software Philips. Stesso decoder dei `.ds2` (`convertiInWav` in `src/lib/dittafono.ts`), poi ffmpeg con libmp3lame; rotta `POST /api/prototipo/converti-audio`, ruoli clinici, 200 MB per file, un file alla volta dal browser perché due decodifiche `.ds2` insieme si rubano la memoria. **Niente si salva**: cartella temporanea per conversione, cancellata in `finally`; nei log solo estensione, byte e secondi. Il download è un blob nel browser di chi lo chiede — e la pagina glielo dice: da lì in poi il dettato è sul suo dispositivo. Un `.ds2` cifrato con password non si apre (il decoder non gestisce la password), e la pagina lo dice invece di un errore generico.
