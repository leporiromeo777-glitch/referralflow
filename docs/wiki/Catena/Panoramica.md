---
tipo: tappa
aggiornata: 2026-09-23
---
# Catena dei referti: panoramica

Dettato (dittafono o drag & drop dalla pagina Referti) → `pipeline-referti/pipeline.py` sul Mac mini (servizio `ch.referralflow.referti-servizio`, copia viva in `~/referti-pipeline/`) → bozza in `referti_bozze` via `POST /api/referti/bozza` → revisione nella pagina `/referti/[id]` → conferma → Word in carta intestata. Fonte di verità della catena: `docs/trascrizione/SPEC.md` (prompt §6 intoccabili). Dettagli tecnici in `pipeline-referti/README.md`.

## Le tappe in ordine (dettato classico)
| tappa | chi | pagina |
|---|---|---|
| decodifica dittafono | codice | [[Catena/Dittafono DSS]] |
| preprocessing audio (passa-alto, denoise, atempo dal profilo) | codice | [[Decisioni/Registro]] |
| trascrizione A: whisper.cpp large-v3, DUE passate (con VAD e senza), vince quella che concorda di più con la B | motore 1 | [[Catena/Sentinelle e recuperi]] |
| trascrizione B: Voxtral-mini | motore 2 | [[Catena/Modelli locali]] |
| anti-loop, ricucitura punteggiatura orfana, punteggiatura dettata, dizionario | codice | [[Catena/Doppioni e segreteria]] |
| confronto A/B → divergenze con `pesanti` e `contesto_prima/dopo` | codice | [[Catena/Arbitro]] |
| arbitro | modello (esterno) | [[Catena/Arbitro]] |
| correzione (compatta esterna o lista locale) col contesto del medico | modello | [[Catena/Contesto per medico]] |
| segreteria (note), pertinenza, senso, stile, doppioni | modello + codice | [[Catena/Doppioni e segreteria]] |
| terapia strutturata (profili con `terapia_strutturata`) | modello esterno + codice | [[Catena/Terapia]] |
| struttura standard (formato rapporto) | modello locale | [[Catena/Formato lettera e Word]] |
| estrazione campi (sul testo integrale, note comprese) | modello | SPEC §6.3 |
| controlli: cifre (Parakeet), farmaci Swissmedic, avvocato/verificatore, rischio frasi | codice + modello | [[Catena/Strumenti e pagine]] |
| omissioni (codice + modello) | | [[Catena/Omissioni]] |
| coerenza interna | modello esterno (verifier) | [[Catena/Coerenza interna]] |
| registro dei fatti e punteggio di fiducia | codice | [[Catena/Registro dei fatti e fiducia]] |
| manifesto, storia, versioni, versione_catena | codice | [[Catena/Audit e qualità]] |

## Percorso esterno
`~/.referralflow-esterno.conf` (`attivo=1`, url Infomaniak, modello `google/gemma-4-31B-it`, `modello_verifica=Qwen/Qwen3.5-397B-A17B-FP8` per i verificatori, interruttori per fase: `arbitro=1`, `estrazione`, `omissioni`, `coerenza`, `verificatore`…). Il testo esce SOLO pseudonimizzato (`_anonimizza_per_esterno`: gemma3:12b locale trova i dati, il codice sostituisce con segnaposto, controprova in due tempi; nei log solo conteggi). Su qualunque intoppo si resta in locale. Modalità manuale con `~/referti/scambio-esterno/ATTIVO`.

## Payload della bozza (chiavi principali)
`testo_corretto`, `note_segreteria`, `campi_estratti`, `parole` (tempi), `divergenze`, `segmenti_dubbi`, `allarmi_numerici`, `avvisi`, `divagazioni`, `frasi_da_chiarire`, `doppioni_tolti/dubbi`, `frasi_non_supportate`, `riparazioni_applicate`, `numeri`, `rischio_frasi`, `frasi_omesse`, `terapia`, `incoerenze`, `ledger`, `fiducia`, `storia`, `versioni`, `versione_catena`, `manifesto`, `medico`, `dettato_il`, `ombra`, `richiede_revisione` (sempre true). L'endpoint accetta SOLO le chiavi in lista (`src/app/api/referti/bozza/route.ts`): una tappa nuova va aggiunta lì o non arriva in tabella (successo nel 2026-09-11 con `terapia`).

## Servizio
Loop: dizionario ricaricato a ogni giro, dettati in `~/referti/ingresso`, cartella condivisa dei dettati (sotto), `invia_bozze`, `pubblica_medici`, `sincronizza_dizionario` (10 min), `scarica_coda`, `lavora_fusioni`, scadenza dataset audio, pulizia. Log `~/referti/log/servizio.log` (mai contenuti clinici). Corse fallite: `<file_id>.fallita.json` spedito come `{esito:'fallita'}`.

## Cartella condivisa dei dettati (23.9.2026)
Si trascinano quanti audio si vuole in **«Audio da trascrivere»** (Scrivania del Mac, percorso in `REFERTI_CARTELLA_DA_TRASCRIVERE`), direttamente o nella sottocartella del medico («Moccetti», «Moschovitis»: il servizio le crea dai profili; fuori dalle sottocartelle il dettato entra senza medico). Il servizio (`preleva_da_cartella`) ne prende **uno alla volta**, solo a catena libera (ingresso e lavorazione vuote, così i dettati dalla piattaforma non aspettano dietro la cartella) e solo a copia finita (dimensione e data ferme per due giri, ultimo cambiamento da più di 10 s: le copie dalla rete sono lente). Mentre lavora l'originale sta in «In lavorazione»; a fine catena va in **«Audio trascritti»** (`REFERTI_CARTELLA_TRASCRITTI`), oppure in «Audio trascritti/Non riusciti» se la catena l'ha messo in `errori/`. In `ingresso/` entra una copia col nome `medico-<id>--cartella-<token>.<ext>`: il nome originale, che può contenere il nome del paziente, non entra nella catena né nel log (solo estensione, medico e quanti ne restano). Stato in `~/referti/cartella-condivisa.json`; all'avvio un prelievo rimasto a metà torna nella sua cartella (`ripara_cartella`). Formati: `.ds2 .dss .wav .mp3 .m4a .aac .ogg .opus .flac .wma .amr .3gp .mp4 .webm .caf .aif(f)`; gli altri file restano dove sono. Caso 41 nella suite.

Condivisione con gli altri computer (anche Windows): condivisione file SMB del Mac, solo nella rete dello studio, mai cartelle sincronizzate su cloud (OneDrive, Dropbox, iCloud). Gli audio in «Audio trascritti» sono dati sanitari e restano finché qualcuno non li toglie.

