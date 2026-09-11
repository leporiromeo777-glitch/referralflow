---
tipo: tappa
aggiornata: 2026-09-11
---
# Strumenti e pagine della catena (5-6.9.2026)

- `/referti/qualita` cruscotto della dettatura (parole modificate, tempo di revisione, segnalazioni chiuse senza riascolto, classi di correzione da `src/lib/referti-tassonomia.ts`); `/referti/qualita/pipeline` è il cruscotto dell'audit ([[Catena/Audit e qualità]]).
- `/referti/confronto` confronto cieco tra bozza di produzione e bozza «ombra» (`python3 pipeline.py --ombra file`, migrazione 028 `referti_confronti`; `REFERTI_OMBRA_ETICHETTA` per più varianti, etichetta rivelata solo a scelta fatta).
- `/sicurezza-dati` pagina pubblica «come proteggiamo i dati».
- Payload: `rischio_frasi`, `numeri`, `frasi_omesse`, `storia`, `versioni`, `ombra`; `payload.revisione` con tempo, flag e tassonomia; `payload.fusione` con provenienza, riepilogo e `variazioni` delle misure.
- Registro eventi append-only `referti_eventi` (migrazione 030, `src/lib/referti-eventi.ts`, mai testo clinico).
- Documenti legali in `docs/legale/` (destinazione d'uso, DSFA bozza, conservazione audio, ciclo di vita dei dati, fornitori cloud, registro trattamenti, incidenti, diritti degli interessati, sorveglianza normativa, classificazione dataset).
- Barriere anti-guasto silenzioso (Ricerca 18): manifesto, gate pre-firma, guardia d'identità, lucchetto delle relazioni, suite `prove-catastrofiche.py`, `distribuisci.sh`.
- Visite registrate (ambient scribe, 2026-08-24): file `visita-`, stesso binario ma NOTA DI VISITA al posto della lettera (`riassunto_visita`); se il riassunto non supera le guardie si consegna la trascrizione integrale con avviso.
- Verificatore selettivo (`PROMPT_VERIFICATORE`, `verificatore=1`): una chiamata che legge solo le correzioni applicate e le frasi a rischio con il passaggio del grezzo (`_passaggio_grezzo`).
- Dataset e banchi in `~/referti-dataset/` (banco d'oro sintetico, correttori, locali, trascrizioni, anonimizzatore): vedi [[Misure/Banchi]].
