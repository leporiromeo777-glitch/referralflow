# Piano di verifica e validazione — Righello ReferralFlow

Versione 1.0 · 19.9.2026.

## 1. Verifica tecnica (automatica, a ogni modifica)

| Prova | Che cosa dimostra | Come si lancia | Esito 19.9.2026 |
|---|---|---|---|
| `imaging/prova-calibrazione.py` | il lettore legge la calibrazione esatta da file sintetici: PixelSpacing riga/colonna, RM enhanced, regioni eco in cm (M-mode scartata), delta negativo, ImagerPixelSpacing distinto, assenza, spacing nullo; il comando e il campo in `meta` | `~/.referralflow-imaging/bin/python imaging/prova-calibrazione.py` | 9/9 |
| `src/lib/prove-imaging-misura.test.ts` | il calcolo sul file reale `misura.js`: isotropo, anisotropo (Pitagora sui mm), simmetria, regioni eco, fuori regione, regioni diverse, bordi inclusi, senza calibrazione, rivelatore, punti non validi, scala schermo→nativo, formato, motivi | `npm run test:app` | 13/13 |
| `imaging/prova-geometria.py` | il lettore di geometria completo (MSE fase 1): fonti della spaziatura, tipo di calibrazione, gruppi funzionali condivisi/per fotogramma uniformi e no, tutte le regioni US con codici decodificati, flag, reference pixel, delta negativo, discordanze, aspect ratio, rescale, IOP/IPP/FoR, obliqua, derivata, sha256, comandi | `~/.referralflow-imaging/bin/python imaging/prova-geometria.py` | 36/36 |
| `prove-imaging-misura.test.ts` — Gate e invarianza (fase 7) | una prova per riga della tabella del Gate (VALIDATED, calibrazione assente, rivelatore, modalità, fotogramma, per-frame, valori nulli, CAUTION bloccata/ammessa, avvisi con testo, `valuta`); **invarianza**: 504 combinazioni di zoom × rotazione × DPR × pan e scala per asse → stessa misura alla 12ª cifra | `npm run test:app` | 39/39 |
| `imaging/prova-doppio-controllo.py` | 1000 casi casuali: calcolo A (mse/*.js in Node) e B (numpy) danno lo stesso stato e lo stesso numero entro 1e-9 relativo | `~/.referralflow-imaging/bin/python imaging/prova-doppio-controllo.py` | 441 misure + 559 rifiuti coincidenti, 0 divergenze |
| `scripts/prova-righello-e2e.py` sul server di prova (DB demo) | importazione con geometria e sha256; 100 px → 20,0 mm (eco) e 50,0 mm (TAC) **calcolati dal server**, VALIDATED con doppio controllo; CR (solo rivelatore) → NOT_MEASURABLE; TAC DERIVED → bloccata finché non nei CAUTION validati; rifiuti; provenienza completa; eventi creata/etichettata/sostituita/annullata; «rifai»; CSV con stato e versioni; segreteria → 403 | `python3 scripts/prova-righello-e2e.py <dicom> <cookie> <url>` | 22/22 + 403 |
| `scripts/misure-regressione.ts` | tutte le misure salvate ricalcolate col motore attuale | `npm run test:misure-regressione` (e in `mac/aggiorna-server.sh`) | 0 differenze |

## 2. Verifica del software (a ogni distribuzione)

- `npx tsc --noEmit` senza errori; `npm run test:app` verde (oggi 212 prove).
- I file `mse/*.js` distribuiti sono identici a quelli provati (stesso commit);
  `versione_software` di ogni misura lo dice.
- `mac/aggiorna-server.sh` ha lanciato la regressione delle misure salvate
  senza differenze (se no non riavvia).
- Prova visiva nel browser: linea e numero sopra l'immagine, a finestra
  intera e ridotta, su Mac e iPad.

## 3. Validazione clinica (una volta, prima dell'uso; poi a ogni rivalidazione)

**Scopo**: dimostrare che il Righello misura come l'apparecchio, sulle
immagini dello studio, nelle mani di chi lo userà.

**Metodo**
1. Un medico dello studio sceglie **almeno 10 esami ecocardiografici** reali
   ricevuti dall'ecografo con il loro referto strutturato (SR), di pazienti
   diversi, di almeno due operatori se possibile.
2. Per ogni esame, su fotogrammi dove la misura dell'apparecchio è
   riconoscibile (es. IVSd, LVIDd, LVPWd, aorta, atrio sinistro in
   asse lungo), ripete la misura col Righello e la **lega alla misura
   dell'apparecchio** con il menu «confronta con…». Obiettivo: **≥ 30 coppie**.
3. Scarica il CSV (`/api/prototipo/imaging/misure?formato=csv`) e lo allega a
   questo fascicolo con la data.

**Criteri di accettazione** (proposta; li conferma il medico validatore)
- scarto assoluto medio ≤ **1,0 mm**;
- il 95% delle coppie entro **±2 mm o ±5%** del valore dell'apparecchio,
  il maggiore dei due;
- nessuno scarto > 4 mm senza spiegazione documentata (punto messo altrove,
  fotogramma diverso).

Se un criterio non regge: si analizzano le coppie fuori soglia; se la causa
è del software si corregge e si rivalida; se è del gesto (fotogramma o punto
diverso) si documenta e si ripete la coppia.

**Prova su fantoccio** (facoltativa, consigliata): se l'ecografo ha un
fantoccio di calibrazione, una scansione con distanze note fornisce un
riferimento assoluto indipendente dall'operatore.

**Esito**: una pagina firmata dal medico validatore con data, numero di
coppie, scarto medio, percentuale entro soglia, giudizio (accettato / non
accettato), CSV allegato.

## 4. Quando si rivalida

- Cambio di versione dell'algoritmo (`mse/misure.js`), del Gate
  (`mse/validazione.js`) o della geometria (`mse/geometria.js`,
  `imaging/geometria.py` `VERSIONE_GEOMETRIA`), o delle versioni di pydicom/numpy.
- Aggiunta di un codice a `imaging/caution-validati.json`: quel caso va
  validato clinicamente prima, e la firma va nella `storia` del file.
- Nuovo apparecchio o nuovo tipo di immagine (RM, TAC) usato per misurare:
  validazione clinica su quel tipo.
- Un browser o un sistema operativo nuovo sui dispositivi dello studio:
  basta la verifica §2.

## 5. Esperienza d'uso (MDR 5.5 lett. g)

Ogni sei mesi il titolare, con chi sviluppa, riguarda:
- il CSV completo delle misure (quante, quante annullate, scarti delle coppie
  confrontate);
- le segnalazioni del personale (una misura «strana», un rifiuto inatteso);
- se qualcosa richiede una correzione, si apre una voce in
  `Decisioni/Registro` e si applica §4.

Un evento con danno o rischio di danno al paziente riconducibile al Righello
va segnalato a Swissmedic (materiovigilanza) dal titolare.
