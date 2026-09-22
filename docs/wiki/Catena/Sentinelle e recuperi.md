---
tipo: tappa
aggiornata: 2026-09-22
#aggiornata-prima: 2026-09-11
---
# Sentinelle e recuperi della trascrizione

## Collasso della A (whisper) misurato contro la B (Voxtral)
Guasto vero del 7.9.2026: su 289 s di dettato whisper ha reso 600 caratteri e Voxtral 3'084, nessun avviso. La sentinella anti-nano misurava la densità PRIMA del deloop e le frasi ripetute tenevano su il conto. Ora il metro è l'altro testimone, DOPO la pulizia: `collasso_a_vs_b` (B ≥ 1.6 × A e ≥ 300 caratteri in più).

Secondo caso (9.9.2026): lunghezze simili ma whisper incantato per 21 righe, 8 numeri su 15 sentiti solo da Voxtral → `motivo_buco_in_a()` guarda tre segnali: lunghezza; NUMERI presenti solo nella B (≥ 2 e ≥ 25%); righe tolte dall'anti-loop ≥ max(6, 30%).

## Corsa di recupero senza VAD
Causa vera: il VAD buttava via il parlato. Al sospetto parte `trascrivi(..., "trascrizione_a_nc", con_tempi=True, usa_vad=False)` (`-mc 0`); vince se `accordo_con_b()` (numeri in comune ×3 + parole significative) è maggiore, non se è solo più lunga. Sul caso reale: 3'055 caratteri contro 600, copertura 288 s su 288. Se la A resta corta: avviso in evidenza, omissioni cercate contro la B, manifesto a «minimo».

I tempi della corsa recuperata sono già sull'orologio pieno (`_TEMPI_SENZA_VAD`): niente decompattazione né ritaratura ad ancore, si toglie solo l'atempo. Senza questo il clic su una parola portava PIÙ AVANTI nell'audio (ultima parola a 385 s su 289 s, visto dal vivo).

## Promozione del testimone
Se la A resta incompleta ANCHE dopo il recupero (caso vero: 1411 caratteri ma ancora numeri solo in B): il testo di base diventa quello di Voxtral, whisper fa da testimone (`_TESTIMONE_PROMOSSO`, tappa `promozione_testimone`, manifesto «primo motore completo (base: secondo motore)» → livello ridotto). I tempi restano quelli di whisper: `allinea_parole` aggancia le parole in comune e interpola.

Casi 20, 21, 25, 26 nella suite.

## Passata doppia (11.9.2026)
Dopo tre collassi in tre giorni il banco VAD su 6 dettati veri ha dato 3 a 3 (accordo totale 735 contro 712): né il VAD né la corsa senza VAD vincono sempre, e un caso col VAD perdeva 400 caratteri e 2 numeri SENZA far scattare le sentinelle. Quindi la corsa senza VAD si fa SEMPRE (`REFERTI_PASSATA_DOPPIA=1`, default; `0` torna al solo recupero su sospetto) e vince quella che concorda di più con la B (`accordo_con_b`); a parità resta la VAD, che ha l'orologio compatto. Log `esito=passata_doppia` / `recuperato_senza_vad` / `seconda_passata_non_migliore`. Costo 10-100 s di whisper in più per dettato. Le sentinelle restano per il caso in cui entrambe le passate siano corte. Decisione in [[Decisioni/Registro]], numeri in [[Misure/Banchi]].

## Integrità dell'audio (prima della trascrizione)
`verifica_integrita_audio` (ffmpeg sul WAV già decodificato) misura errori di decodifica, picco, **quota di campioni saturati**, silenzio, secondi decodificati contro la durata dichiarata e coda parlata; numeri nel log e nella cronologia, avvisi nella bozza, criterio «integrità audio» nel manifesto.

Dal 22.9.2026, dopo averlo misurato su 23 dettati veri:
- **Saturazione** = campioni al fondo scala (astats, `saturati_pct`) almeno lo 0,05% (`SOGLIA_SATURATI_PCT`), e solo se il picco è a 0,0 dB. Prima bastava il picco a 0 dB: i `.ds2` decodificati lo toccano **tutti** (23 su 23), e l'avviso «audio saturato» era su ogni referto.
- **Coda parlata** non conta più per i file del dittafono (`.ds2`/`.dss`, `integ["dittafono"]`): lì la registrazione si ferma col tasto subito dopo l'ultima parola, quindi la coda è parlato per costruzione. Era in 11 dettati su 21 e portava il manifesto a «ridotto», con presa d'atto obbligatoria, in metà dei referti. Resta nella cronologia; per registrazioni web o telefono vale come prima. Il file tagliato davvero lo dicono `troncato_s` e gli errori di decodifica, anche dal dittafono.

Caso 39 nella suite.

## Altre barriere
`payload.manifesto` (livello pieno/ridotto/minimo, testimoni, trasporti, conteggi), gate pre-firma nel wizard con presa d'atto registrata (`override_critici`), guardia d'identità e gate temporale sulla fusione, lucchetto delle relazioni (`src/lib/referti-misure-cliniche.ts`). La rilavorazione di una bozza scartata azzera anche `revisione_stato`.

**Stesso audio, medico diverso (19.9.2026).** Il `file_id` è l'impronta dell'audio: ricaricare lo stesso dettato dà lo stesso id, e prima la piattaforma rispondeva «200 duplicato» e buttava via la nuova lavorazione. Il caso vero: un dettato entrato **senza medico** (il formato di default è il *rapporto*) e ricaricato dal medico scegliendo il proprio profilo (*lettera*) — la seconda corsa, quella giusta, spariva, e il referto restava impaginato come quello di un altro. Ora, se la bozza è ancora `bozza` e **nessuno l'ha toccata** (niente `testo_finale`, niente revisione), la nuova lavorazione col medico giusto la sostituisce, con evento `bozza_rifatta` (`motivo: medico_cambiato`). Se qualcuno l'aveva già corretta a mano, si tiene la sua e si scrive nel log.
