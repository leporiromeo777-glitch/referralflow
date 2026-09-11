---
tipo: tappa
aggiornata: 2026-09-11
---
# Audit trail, lineage, versioni, qualità, dizionario dalle correzioni

Proposta e principi in `docs/audit/ARCHITETTURA.md` (da leggere PRIMA di toccare questa parte).

## Schema `audit` (migrazione 033)
`pipeline_runs` (una corsa per audio, `attempt`, SUCCESS/FAILED), `pipeline_steps` (tappa: tipo, produttore AI/SYSTEM/SECRETARY/DOCTOR, modello, `prompt_version_id`, tempi), `artifacts` (output IMMUTABILI con sha256, `version_no`; trigger che vieta UPDATE/DELETE), `artifact_parents` (DAG), `prompt_versions` (registro per hash), `deployments` (rilasci = linee verticali nel grafico), `report_reviews` (NOT_REVIEWED / IN_REVIEW / REVIEWED_NO_CHANGES / REVIEWED_WITH_CHANGES per ruolo), `human_edits` (UNA riga per revisione confermata: diff tra l'ultimo output AI e la versione della persona; `diff` è un array di operazioni `{kind, from, to, posizione, contesto, categoria, severita}`). Gli eventi restano in `referti_eventi`.

## Lib `src/lib/audit/`
`diff.ts` (puro: normalizzazione, diff a parole INSERT/DELETE/REPLACE, «2.5 mg → 5 mg» aggancia l'unità, categorie punctuation/formatting/spelling/grammar/drug/dose/measurement/date/patient_information/medical_terminology/clinical_meaning/other, severità LOW…CRITICAL), `lineage.ts` (corsa+tappe+artefatti dal payload; mappa tappa → tipo, aggiungere le tappe nuove), `revisione.ts` (stati per ruolo, diff umano; `AUDIT_RUOLI_SEGRETARIA`), `metriche.ts` (media mobile, percentili, outlier 3·MAD, punteggio 0-100), `prompt.ts`, `dizionario.ts` (proposte).

## Regole
La metrica principale conta SOLO `editor_role='SECRETARY'`; AI→AI mai contate; medico separato; zero-touch solo se REVIEWED_NO_CHANGES; gli autosave sono working_draft; MAI usare le correzioni per addestrare in automatico.

## Agganci
`POST /api/referti/bozza` registra la corsa (anche `{esito:'fallita'}`); `confermaBozza` registra la revisione col ruolo di chi firma; l'apertura della bozza segna IN_REVIEW; «Impagina come lettera» e «Controllo della lettera» sono tappe AI dell'app col prompt registrato. Limite noto: bozze precedenti al 9.9.2026 senza la tappa «Impagina».

## Pagine
`/referti/qualita/pipeline` (solo admin, menu «Qualità AI»): card, grafico a punti SVG con media mobile 10/25/50/100, rilasci, outlier, filtri, per versione di catena/prompt/medico, mese per mese, ultimi referti, errori, vista avanzata con latenze. `/referti/[id]/storia`: linea del tempo, corse e tappe espandibili, versioni con provenienza, modifiche umane con diff in linea e affiancato. Test `npm run test:audit`; `npm run audit-backfill` (idempotente).

## Quale tappa aiuta davvero (11.9.2026)
I banchi sono sintetici; questa è la misura in produzione. `src/lib/audit/attribuzione.ts` (puro, `attribuisci`, `riepilogo`): per ogni referto confermato dalla segretaria, le versioni immutabili di `audit.artifacts` (una per tappa, in ordine di `version_no`, escluse audio, `grezzo_b` che è parallela e il confermato che è il traguardo) vengono confrontate col testo confermato (`to_artifact_id` della riga in `human_edits`): «distanza» = parole cambiate (`confronta().metriche.edit_count`), «delta» = distanza della tappa prima meno la propria (positivo = avvicina). Sezione «Quale tappa aiuta davvero» nel cruscotto: per tappa, referti, avvicina/allontana/uguale, delta medio, distanza media. Test `prove-attribuzione.test.ts`. Da leggere con pochi referti come indizio, non come verdetto.

## Frasi che il medico ripete (11.9.2026)
`src/lib/audit/frasi.ts` (puro, `frasiCandidate`): dalle lettere confermate di un medico (`testo_finale`, fino a 300), le frasi ≥ 6 parole ripetute uguali in almeno 3 lettere, senza cifre, senza parole dei nomi dei pazienti di quelle lettere, non già tra le «Frasi fisse» della pagina `docs/wiki/Agenti/<Medico>.md` (letta dal repo, che è il checkout dell'app). Sezione «Frasi che il medico ripete» nel cruscotto: si copiano A MANO nella pagina della wiki, poi compila al deploy ([[Agenti/Come funziona]]). Test `prove-frasi.test.ts`.

## Dizionario dalle correzioni umane (11.9.2026)
L'unico apprendimento ammesso, e passa da una persona. `proposteDizionario`: dalle REPLACE della segretaria (180 giorni) alle coppie «sbagliato → giusto» per medico; guardie: mai cifre, ≤ 4 parole, da ≥ 3 lettere, escluse misure/dosi/date/dati del paziente/punteggiatura/forma/senso clinico e i cambi di sola desinenza; raggruppate con conteggio, referti distinti, alternative. Sezione «Che cosa insegnano le correzioni» nel cruscotto: «Metti nel dizionario» / «Non è un errore d'ascolto» / «Togli» (`decidiVoceDizionario`) → tabella `referti_dizionario` (migrazione 034). Il servizio legge le confermate ogni 10 minuti (`GET /api/referti/dizionario`, `sincronizza_dizionario`) e le scrive in `correzioni-<medico>-piattaforma.json` (riscritto, svuotato se le voci spariscono, non nel repo, non a mano); caricato dal dizionario e dal contesto del medico. Caso 32 nella suite. In vista normale solo le ricorrenti e le singole di categoria termine/ortografia/farmaco/grammatica; `?dizionario=tutte` per il resto. Vale poco finché i referti confermati sono pochi: è il posto da guardare ogni settimana. Misura in [[Misure/Banchi]].
