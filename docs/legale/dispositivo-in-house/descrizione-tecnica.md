# Descrizione tecnica — Righello ReferralFlow

Versione 1.0 · 19.9.2026.

## 1. Che cosa fa, in cinque passi

1. L'immagine DICOM arriva dall'apparecchio (C-STORE) o da un supporto e si
   archivia **senza riscriverla** (`uploads/imaging/…`).
2. Il lettore `imaging/leggi-dicom.py` (processo separato, pydicom) legge i
   metadati e la **calibrazione** (`calibrazione_di`): regioni ecografiche in
   cm → mm/px, oppure `PixelSpacing` riga/colonna, oppure
   `ImagerPixelSpacing` (segnato come non misurabile). Si salva in
   `imaging_immagini.calibrazione`.
3. Il browser mostra un PNG del fotogramma e sopra un `canvas`. Premuto
   «Misura», l'operatore trascina fra due punti; le coordinate dello schermo
   diventano pixel nativi (`RFMisura.versoNativo`) e la distanza si calcola
   subito (`RFMisura.distanzaMm`).
4. Al rilascio, se il calcolo è possibile, il browser manda al server **i due
   punti** (non il numero), con immagine, fotogramma, etichetta e l'eventuale
   misura dell'apparecchio di riferimento.
5. Il server ricalcola con lo **stesso file** `misura.js` sulla calibrazione in
   tabella, e salva in `imaging_misure_manuali` punti, valore, calibrazione
   usata, versione del calcolo, chi e quando. Registra «misurato» negli
   accessi dell'esame.

## 2. Componenti

| Componente | File | Ruolo |
|---|---|---|
| Calcolo | `public/prototipo/misura.js` (`RFMisura`, versione 1.0) | unica fonte della matematica; nessuna dipendenza; non tocca il DOM |
| Lettura calibrazione | `imaging/leggi-dicom.py` → `calibrazione_di`, comando `calibrazione`, campo in `meta` | dal file DICOM, mai da stime |
| Caricatore lato server | `src/lib/imaging-misura.ts` | carica `misura.js` in un contesto `vm`, espone tipi e `calibrata()` |
| Rotta di misura | `src/app/api/prototipo/imaging/misure/route.ts` | POST nuova/annulla/riferimento; GET riepilogo e CSV |
| Rotta calibrazione | `src/app/api/prototipo/imaging/immagine/[id]/calibrazione/route.ts` | per le immagini archiviate prima del 19.9.2026 |
| Dettaglio esame | `src/app/api/prototipo/imaging/[id]/route.ts` | calibrazione per immagine, misure manuali, misure dell'apparecchio con id |
| Ingestione | `src/lib/imaging-ingest.ts`, `src/lib/imaging-ordina.ts` | la calibrazione entra con l'immagine |
| Interfaccia | `public/prototipo/referralflow-bridge.js` (`rfMis*`, `rfImgMisureManuali`) | gesto, disegno, scheda delle misure |
| Dati | `db/migrations/068_imaging_misure_manuali.sql` | colonna `calibrazione`, tabella `imaging_misure_manuali` |

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

Nessuna libreria di terzi partecipa al **calcolo** della distanza.

## 4. Dati e tracciabilità

`imaging_misure_manuali`: `studio_id`, `esame_id`, `immagine_id`, `frame`,
`user_id`, `tipo` (solo `distanza`), `punti` (pixel nativi), `valore` (mm),
`calibrazione` (copia di quella usata), `versione_calcolo`, `etichetta`,
`riferimento_misura_id` (la misura dell'apparecchio per la validazione),
`annullata_at`, `annullata_da`, `created_at`. Nessuna cancellazione fisica dal
software. Esportazione CSV per il fascicolo.

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
- **Prove**: `prova-calibrazione.py`, `prove-imaging-misura.test.ts`, e2e sul
  DB demo; i risultati si scrivono in `docs/wiki/Misure/Banchi.md`.
- **Documentazione**: questa cartella; la wiki `Piattaforma/Immagini` per
  l'uso; `Decisioni/Registro` per le scelte.
- **Segnalazioni**: il personale segnala al titolare; il titolare a chi
  sviluppa; se c'è rischio per il paziente, a Swissmedic.
