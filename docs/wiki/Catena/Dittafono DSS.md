---
tipo: tappa
aggiornata: 2026-09-11
---
# Dittafono Philips DPM (.dss / .ds2)

`.dss`/`.ds2` ammessi su pannello e pagina Referti (MIME `audio/x-dss`). Collaudato su un DS2 vero il 7.9.2026: ffmpeg NON decodifica i .ds2 (il suo dss_sp è un altro codec: con `-f dss` forzato esce rumore «parlante», whisper collassa a 36 caratteri) → decoder open source vendorizzato in `pipeline-referti/strumenti/dss-codec/` (hirparak/dss-codec, MIT, Python + numpy), chiamato da `decodifica_dittafono()` all'inizio di `elabora` (il WAV `<file_id>.dittafono.wav` sostituisce l'ingresso; .ds2 non decodificabile = errore, mai ripiego su ffmpeg). Stesso decoder nel pannello, nella rotta audio dell'app (env `DS2_DECODER`/`DS2_DECODER_PYTHON`) e in esporta-oro. I .dss classici: ffmpeg con `-f dss` (`_formato_ingresso()`). File cifrati: password non gestita.

La data di registrazione (`payload.dettato_il`) si legge dall'header DSS all'offset 0x26 ed è la data della lettera.
