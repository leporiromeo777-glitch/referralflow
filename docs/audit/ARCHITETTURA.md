# Audit trail, lineage, versioni e qualità della catena — proposta (9.9.2026)

> Stato: IMPLEMENTATA il 9.9.2026 (migrazione 033, `src/lib/audit/`, pagine
> `/referti/qualita/pipeline` e `/referti/[id]/storia`, test `npm run test:audit`,
> riempimento `npm run audit-backfill`).

## 1. Architettura attuale (com'è)

- **Backend**: Next.js 14 App Router, server actions, PostgreSQL via `pg`. Un solo DB
  (`referralflow`), tabelle operative per studio.
- **Catena AI**: `pipeline-referti/pipeline.py` sul Mac dello studio (servizio launchd).
  Ogni tappa scrive i propri intermedi SU DISCO (`lavorazione/<file_id>.*.txt|json`)
  prima di passare alla tappa dopo, e a fine corsa consegna UN payload JSON a
  `POST /api/referti/bozza` con: `storia[]` (una voce per tappa: attore, secondi,
  conteggi), `versioni{}` (testi intermedi: grezzo_b, dopo_dizionario, dopo_arbitro,
  dopo_correzione, dopo_bella_copia…), `testo_grezzo`, `testo_corretto`,
  `versione_catena{}` (commit della pipeline, modelli, impronta del prompt, dizionario,
  vocabolario, guardie), `manifesto{}` (livello di verifica, testimoni, trasporti).
- **Referti**: `referti_bozze` (payload della catena INTATTO, `testo_finale` e
  `campi_confermati` della persona, `reviewed_by/at`, `revisione_stato` = autosave del
  wizard). Conferma = `confermaBozza` (server action) che misura la revisione
  (`payload.revisione`: parole modificate, tempo, tassonomia, lineage per errore).
- **Eventi**: `referti_eventi` append-only (`registraEvento`, mai testo clinico).
- **AI lato app**: «Impagina come lettera / Riorganizza» (`referto-struttura.ts`, Ollama
  gemma3:27b, prompt nel codice), fusione automatica con la lettera precedente.
- **Utenti**: `users.role` ∈ segretaria | medico | admin (| inviante). Sessione JWT.
- **Coda**: nessuna coda esterna. La catena è un processo con scansione ogni 15 s;
  il POST della bozza è idempotente su `(studio_id, file_id)`.
- **Frontend**: server components + qualche client component; grafici SVG lato
  server (nessuna dipendenza); cruscotto `/referti/qualita` già esistente.

**Problemi rispetto ai requisiti**: le versioni intermedie vivono dentro un JSONB
(non sono entità immutabili con hash e genitori); non esiste il concetto di corsa /
tappa / artefatto; nessun registro dei prompt; le corse FALLITE della catena non
arrivano mai al DB; la misura della revisione conta parole modificate senza
distinguere INSERT/DELETE/REPLACE né chi ha corretto (segretaria o medico); non si
distingue «non revisionato» da «revisionato senza modifiche»; nessuna vista di
lineage per referto; nessuna dashboard a punti con media mobile e marcatori di
rilascio.

## 2. Architettura proposta

Principio: **non si tocca ciò che funziona**. Il payload della catena resta com'è
(è già la «duplicazione» di ogni output: disco → payload → DB). Si aggiunge uno
schema separato `audit` che viene POPOLATO da ciò che già arriva, più tre agganci
nuovi (corse fallite, tappe AI dell'app, revisione umana).

```
catena (Mac) ──payload──▶ POST /api/referti/bozza ──▶ referti_bozze (operativo)
                                   │
                                   └──▶ audit.pipeline_runs / steps / artifacts (analitico)
app «Impagina» ──────────────────────▶ audit step (AI) + artifact
apertura revisione ──────────────────▶ audit.report_reviews (IN_REVIEW)
conferma ─────────────────────────────▶ artifact umano + audit.human_edits (diff)
corsa fallita (catena) ──────────────▶ audit.pipeline_runs status=FAILED
```

### Entità (schema `audit`, migrazione 033)

| tabella | ruolo |
|---|---|
| `pipeline_runs` | una corsa della catena per un audio: `bozza_id`, `file_id`, `attempt`, `pipeline_version`, `status` (RUNNING/SUCCESS/FAILED), `config` (modelli, prompt, dizionario…), tempi |
| `pipeline_steps` | una tappa: ordine, tipo, `producer_type` (AI/SYSTEM/SECRETARY/DOCTOR), modello (provider/nome/versione), `prompt_version_id`, tempi, `status`, errore, `retry_count`, `input_artifact_id`/`output_artifact_id`, `metadata` |
| `artifacts` | l'output di una tappa: `kind` (audio/text/json), `content_text` o `storage_ref`, `content_hash` sha256, `version_no` progressivo nel referto; **mai aggiornata** (trigger che vieta UPDATE/DELETE) |
| `artifact_parents` | DAG di provenienza (più genitori: es. l'arbitro deriva da A e da B) |
| `prompt_versions` | registro prompt: nome, versione, hash, testo |
| `deployments` | rilasci: `pipeline_version` / `app_version`, `released_at`, nota (linee verticali nel grafico) |
| `report_reviews` | stato della revisione per referto e RUOLO: NOT_REVIEWED → IN_REVIEW → REVIEWED_NO_CHANGES / REVIEWED_WITH_CHANGES, con inizio e fine |
| `human_edits` | una riga per revisione umana confermata: ruolo, da artefatto → a artefatto, conteggi (edit, insert, delete, replace, caratteri, parole, parole totali, edit/100 parole), `diff` jsonb (operazioni con categoria e severità) |
| eventi | resta `referti_eventi` (append-only), con azioni standard (`AUDIT_*`) |

### Regole

- **Immutabilità**: trigger su `audit.artifacts` e `audit.human_edits` che rifiuta
  UPDATE e DELETE. Una nuova versione è una nuova riga.
- **Metrica principale = solo la segretaria**: `human_edits.editor_role='SECRETARY'`.
  Le trasformazioni AI→AI sono artefatti e tappe, mai conteggiate. Le modifiche del
  medico sono `editor_role='DOCTOR'`, tenute separate.
- **Chi è «segretaria»**: ruoli `segretaria` e `admin` (env `AUDIT_RUOLI_SEGRETARIA`);
  `medico` = DOCTOR. Oggi l'admin dello studio fa da segretaria: è documentato.
- **Ultimo output AI** per il diff: l'artefatto AI più recente del referto (il testo
  della catena, oppure la lettera di «Impagina» se è stata usata).
- **Zero-touch** solo per REVIEWED_NO_CHANGES; NOT_REVIEWED è escluso dalla statistica.
- **Autosave** (`revisione_stato`) = working_draft: conservato, mai conteggiato.
- **Diff**: normalizzazione (spazi, a-capo, apostrofi tipografici, maiuscole di
  formattazione) → diff a parole (LCS) → operazioni INSERT/DELETE/REPLACE →
  «2.5 mg → 5 mg» aggancia l'unità → categoria (punctuation, formatting, spelling,
  drug, dose, measurement, date, patient_information, medical_terminology,
  clinical_meaning, grammar, other) → severità (LOW/MEDIUM/HIGH/CRITICAL).
- **Corse ripetute**: `attempt` cresce per lo stesso `file_id`; un tentativo fallito
  resta (status FAILED, `error_type`, `error_message` senza testo clinico).
- **Idempotenza**: chiave `(bozza_id, file_id, attempt)` unica; il POST della bozza è
  già idempotente; la registrazione della corsa è `on conflict do nothing`.
- **Prompt**: hash sha256 del testo del prompt → `prompt_versions` (nome + hash);
  i prompt della catena arrivano già come impronta in `versione_catena.prompt`;
  quelli dell'app (`PROMPT_LETTERA`, `PROMPT_STRUTTURA`) vengono registrati con il
  loro testo.
- **Rilasci**: la prima volta che compare una `pipeline_version` nuova nasce un
  `deployment` automatico; dalla dashboard si aggiunge la nota («nuovo whisper»…).
- **Privacy**: la dashboard lavora su id, date, conteggi, versioni; i testi si
  vedono solo nella pagina del singolo referto, agli utenti dello studio; le
  metriche tecniche (latenze, gettoni, hardware) solo ad admin.
- **Prestazioni**: la registrazione avviene alla ricezione del payload (una
  transazione, ~20 righe) e alla conferma; niente lavoro sincrono dentro la catena.
  La catena persiste già ogni intermedio su disco prima della tappa successiva.

### Nuovi servizi (lib)

`src/lib/audit/diff.ts` (motore di confronto, puro, testato), `lineage.ts`
(corsa/tappe/artefatti dal payload), `revisione.ts` (stati e diff umano),
`metriche.ts` (aggregati, media mobile, percentili, outlier, confronti per
versione), `prompt.ts` (registro prompt).

### Nuove API / pagine

- `POST /api/referti/bozza` (esistente): dopo l'insert registra la corsa; accetta
  anche `{esito:'fallita'}` dalla catena.
- `/referti/qualita/pipeline`: dashboard «AI Pipeline → Quality» (overview, grafico
  a punti + media mobile configurabile + rilasci, esploratore referti, confronto
  per versione di catena / prompt / modello, errori, latenze, vista avanzata).
- `/referti/[id]/storia`: timeline del referto, lineage con ogni tappa espandibile
  (modello, versione, prompt, input, output, durata, stato), modifiche della
  segretaria e del medico con diff affiancato e in linea.

### Migrazione e riempimento

- `db/migrations/033_audit.sql`: solo aggiunte (schema nuovo). Nessun dato
  esistente toccato.
- `scripts/audit-backfill.ts`: ricostruisce corse, tappe, artefatti e revisioni
  dai payload delle bozze già in archivio (idempotente, rieseguibile).

### Test

`src/lib/audit/prove.test.ts` (node:test via tsx): output AI salvato E passato
avanti; una versione nuova non sovrascrive; solo la segretaria conta; il medico è
registrato ma escluso; le trasformazioni AI non aumentano il conteggio; zero-touch
solo se revisionato; non revisionato non è zero-touch; il retry conserva entrambi i
tentativi; il caso «2.5 mg → 5 mg» produce 1 REPLACE con `changed_from`/`changed_to`.

### Cosa NON si fa (per scelta)

- Nessun uso automatico delle correzioni per addestrare: i dati restano un
  dataset (`human_edits.diff` + artefatti) per una funzione futura e separata.
- Nessuna riscrittura della catena: si arricchisce solo il payload (già fatto in
  gran parte) e si aggiunge l'invio delle corse fallite.
