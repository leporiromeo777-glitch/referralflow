# Descrizione tecnica — Righello ReferralFlow

Versione 1.1 · 19.9.2026 sera (Measurement Safety Engine, fasi 1-5-7-8; la 1.0 del mattino era il righello v1).

## 1. Che cosa fa, in sette passi

1. L'immagine DICOM arriva dall'apparecchio (C-STORE) o da un supporto e si
   archivia **senza riscriverla** (`uploads/imaging/…`); se ne calcola
   l'impronta SHA-256.
2. Il lettore `imaging/leggi-dicom.py` → `imaging/geometria.py` (processo
   separato, pydicom) legge **tutta la geometria** (`geometria_di`, versione 1):
   spaziatura con la sua fonte (`PixelSpacing`, gruppi funzionali condivisi o
   per fotogramma, `ImagerPixelSpacing`) e il tipo di calibrazione, TUTTE le
   regioni ecografiche con unità, formato, tipo di dato, flag e reference
   pixel, aspect ratio, rescale, orientamento e posizione nel paziente, tipo
   d'immagine, avvisi di lettura. Da lì deriva la **calibrazione compatta**
   (`calibrazione_da`) usata dal calcolo. Entrambe in `imaging_immagini`.
3. Il browser mostra un PNG del fotogramma e sopra un `canvas`. Il
   **Validation Gate** (`mse/validazione.js`, `statoImmagine`) giudica
   l'immagine prima di qualunque punto: VALIDATED / CAUTION / NOT_MEASURABLE,
   con motivi e avvisi; l'indicatore ✓ ⚠ ✕ e «Dettagli calibrazione» lo
   mostrano; se NOT_MEASURABLE il tasto non c'è, c'è il motivo.
4. Premuto «Misura», l'operatore trascina fra due punti; le coordinate dello
   schermo diventano pixel nativi (`mse/geometria.js`: `versoNativo`, o la
   matrice affine `versoImmagine` per un viewer con zoom/pan/rotazione) e il
   Gate (`valuta`) calcola l'anteprima con l'algoritmo `distanza` 1.0.
5. Al rilascio, se lo stato non è NOT_MEASURABLE, il browser manda al server
   **i due punti** (non il numero), con immagine, fotogramma, etichetta,
   l'eventuale misura dell'apparecchio di riferimento e l'eventuale misura
   che sta rifacendo.
6. Il server rifà il Gate con gli **stessi file** `mse/*.js` sulla
   calibrazione in tabella, poi il **doppio controllo**:
   `imaging/verifica-indipendente.py` (numpy, implementazione separata)
   ricalcola; se |A − B| supera 1e-9 relativo, non si salva (422, log di
   errore).
7. Si salva in `imaging_misure_manuali` la **provenienza completa** (punti
   immagine e fisici, valore pieno e mostrato, unità, algoritmo e versioni di
   algoritmo/gate/software, stato, avvisi, esito del doppio controllo,
   calibrazione e geometria copiate, misura sostituita) e un **evento**
   «creata» in `imaging_misure_eventi`. Ogni azione successiva (nome,
   riferimento, annullamento, sostituzione) è un altro evento con prima e
   dopo. Registra «misurato» negli accessi dell'esame.

## 2. Componenti

| Componente | File | Ruolo |
|---|---|---|
| A. DICOM data layer | `imaging/geometria.py` (`geometria_di`, `calibrazione_da`), `imaging/leggi-dicom.py` (comandi `geometria`, `calibrazione`, campo in `meta`) | dal file DICOM, mai da stime; definizioni PS3.3 2026c |
| B. Geometry engine | `public/prototipo/mse/geometria.js` (`RFMSE.geometria` 1.0) | matrici affini schermo→immagine, regioni (priorità, sovrapposizioni), mm per pixel |
| C. Measurement engine | `public/prototipo/mse/misure.js` (`RFMSE.misure`, algoritmo `distanza` 1.0, facciata `RFMisura`) | un algoritmo = nome, versione, unità, equazione, `calcola` |
| D. Validation & safety | `public/prototipo/mse/validazione.js` (`RFMSE.validazione` 1.0), `imaging/verifica-indipendente.py`, `imaging/caution-validati.json` | Gate, testi dei motivi, doppio controllo, casi CAUTION ammessi |
| Caricatore lato server | `src/lib/imaging-misura.ts` | carica i tre moduli in un contesto `vm`; `cautionValidati`, `versioneSoftware`, `verificaIndipendente`, `tolleranzaVerifica` |
| Rotte | `src/app/api/prototipo/imaging/misure/route.ts` (POST nuova/annulla/etichetta/riferimento; GET riepilogo e CSV), `…/misure/[id]/route.ts` (provenienza e storia), `…/immagine/[id]/calibrazione/route.ts` (geometria pigra), `…/[id]/route.ts` (dettaglio con geometria e contesto MSE) | |
| Ingestione | `src/lib/imaging-ingest.ts`, `src/lib/imaging-ordina.ts` | geometria, calibrazione e sha256 entrano con l'immagine |
| E. Viewer | `public/prototipo/bridge/11-immagini.js` (`rfMis*`, `rfImgMisureManuali`) | gesto, disegno, indicatore, dettagli, storia, nome, rifai; nessun calcolo proprio |
| F. Storage/audit | `db/migrations/068…`, `069_imaging_geometria.sql`, `070_imaging_misure_provenienza.sql` | `imaging_immagini.geometria/sha256`, `imaging_misure_manuali` con provenienza, `imaging_misure_eventi` |
| Statistiche (fase 4) | `imaging/statistiche.py`, comando `statistiche`, azione `statistiche` | maschera sui centri dei pixel, modality LUT, HU/a.u., doppio calcolo numpy + stdlib |
| Spazio paziente e serie (fase 9) | `public/prototipo/mse/serie.js` (`RFMSE.serie` 1.0), `src/lib/imaging-serie.ts` | pixel → paziente, geometria di serie (`imaging_serie.geometria`), griglia virtuale MPR decisa dal server |
| Ricostruzione MPR (fase 9) | `imaging/mpr.py`, `mprPng`, rotta `…/serie/[id]/mpr` | volume in cache (.npy, chiave sha256 dei file), piani sagittale/coronale, PNG isotropo + griglia virtuale dichiarata |
| Regressione | `scripts/misure-regressione.ts` (chiamato da `mac/aggiorna-server.sh`) | un aggiornamento che cambia numeri salvati non si distribuisce; le misure composte (3D, volume) si rifanno da `extra` |
| Riferimento | `scripts/tabella-riferimento.py` | tabella Test/Ground truth/Risultato/Errori/PASS-FAIL con soglie passate, mai scelte dal codice |

## 3. Software di terzi (SOUP) e versioni al 19.9.2026

| Componente | Versione | Uso nel dispositivo | Rischio se sbaglia |
|---|---|---|---|
| pydicom | 3.0.2 | lettura dei tag DICOM (calibrazione) | R1–R3; coperto da prova sintetica |
| numpy | 2.5.3 | pixel per il PNG (non per la misura) | nessuno sulla misura |
| Pillow | 12.3.0 | PNG per lo schermo | nessuno sulla misura |
| Python | 3.14 (venv `~/.referralflow-imaging`) | esecuzione del lettore | — |
| Node.js | 26.5 | server | — |
| Next.js | 14.2 | server HTTP | — |
| PostgreSQL | 16.14 | archivio delle misure | R15 (transazioni) |
| Browser | Safari/Chrome/Firefox correnti | canvas, eventi pointer | R7–R8 |

Nessuna libreria di terzi partecipa al **calcolo** A delle misure
geometriche; numpy partecipa al calcolo B (controllo indipendente), alle
statistiche (con il doppio calcolo in libreria standard) e alla
ricostruzione MPR (taglio del volume, senza interpolazione fra fette).

## 4. Dati e tracciabilità

`imaging_misure_manuali`: `studio_id`, `esame_id`, `immagine_id`, `frame`,
`user_id`, `tipo` (solo `distanza`), `punti` (pixel nativi), `punti_fisici`
(mm), `valore` (pieno), `valore_mostrato`, `unita`, `calibrazione` e
`geometria` (copie di quelle usate), `algoritmo`, `versione_calcolo`
(= versione dell'algoritmo), `versione_gate`, `versione_software` (hash del
commit compilato), `stato_validazione` (VALIDATED | CAUTION), `avvisi`,
`verifica_indipendente` (metodo, A, B, scarto, tolleranza, esito),
`etichetta`, `riferimento_misura_id`, `sostituisce_id`, `annullata_at`,
`annullata_da`, `created_at`. Nessuna cancellazione fisica dal software.

`imaging_misure_eventi` (soli inserimenti): `misura_id`, `evento` (creata,
etichettata, riferimento, annullata, sostituita), `user_id`, `prima`, `dopo`,
`versione_software`, `created_at`. La rotta `…/misure/[id]` restituisce
provenienza e storia insieme; la UI la mostra con «Storia».

`imaging_immagini.sha256`: l'impronta del file archiviato; l'evento «creata»
la copia, così una misura dice su quali byte è stata presa.

Nessun dato clinico in log, URL o notifiche (nLPD, regole della piattaforma).
Le immagini non lasciano il Mac; il DICOM non arriva mai al browser.

## 5. Gestione della qualità (proporzionata a uno studio)

- **Versioni**: git; ogni distribuzione ha un hash; `mac/aggiorna-server.sh`
  ricompila solo da commit pushati. `RFMisura.VERSIONE` cambia a ogni modifica
  del calcolo.
- **Controllo delle modifiche**: ogni modifica a `misura.js`,
  `calibrazione_di`, alle rotte di misura o alla migrazione passa da: prove
  automatiche verdi → voce in `Decisioni/Registro` → rivalidazione secondo
  [piano-validazione.md](piano-validazione.md) §4 → distribuzione.
- **Prove**: `prova-calibrazione.py`, `prova-geometria.py`,
  `prova-doppio-controllo.py`, `prove-imaging-misura.test.ts` (Gate,
  invarianza), `scripts/prova-righello-e2e.py` sul DB demo,
  `scripts/misure-regressione.ts`; i risultati si scrivono in
  `docs/wiki/Misure/Banchi.md`.
- **Casi CAUTION ammessi**: solo in `imaging/caution-validati.json`, con firma
  e data del validatore nella `storia`; lista vuota = ogni avviso blocca.
- **Documentazione**: questa cartella; la wiki `Piattaforma/Immagini` per
  l'uso; `Decisioni/Registro` per le scelte.
- **Segnalazioni**: il personale segnala al titolare; il titolare a chi
  sviluppa; se c'è rischio per il paziente, a Swissmedic.
