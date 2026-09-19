# Piano di verifica e validazione — Righello ReferralFlow

Versione 1.0 · 19.9.2026.

## 1. Verifica tecnica (automatica, a ogni modifica)

| Prova | Che cosa dimostra | Come si lancia | Esito 19.9.2026 |
|---|---|---|---|
| `imaging/prova-calibrazione.py` | il lettore legge la calibrazione esatta da file sintetici: PixelSpacing riga/colonna, RM enhanced, regioni eco in cm (M-mode scartata), delta negativo, ImagerPixelSpacing distinto, assenza, spacing nullo; il comando e il campo in `meta` | `~/.referralflow-imaging/bin/python imaging/prova-calibrazione.py` | 9/9 |
| `src/lib/prove-imaging-misura.test.ts` | il calcolo sul file reale `misura.js`: isotropo, anisotropo (Pitagora sui mm), simmetria, regioni eco, fuori regione, regioni diverse, bordi inclusi, senza calibrazione, rivelatore, punti non validi, scala schermo→nativo, formato, motivi | `npm run test:app` | 13/13 |
| Prova end-to-end sul server di prova (DB demo) | importazione con calibrazione in tabella; 100 px → 20,0 mm (eco 0,2 mm/px) e → 50,0 mm (TAC 0,5 mm/px) **calcolati dal server**; 200 px verticali → 40,0 mm; rifiuti (fuori regione, punti uguali, fotogramma inesistente, non calibrata); registro «misurato»; annullamento tracciato e non ripetibile; CSV; segreteria → 403 | script nella cartella di lavoro della sessione (da portare in `scripts/`) | 18/18 + 403 |

## 2. Verifica del software (a ogni distribuzione)

- `npx tsc --noEmit` senza errori; `npm run test:app` verde (oggi 212 prove).
- Il file `misura.js` distribuito è identico a quello provato (stesso commit).
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

- Cambio di `RFMisura.VERSIONE` (qualunque modifica a `misura.js`).
- Cambio a `calibrazione_di` in `leggi-dicom.py` o alle versioni di pydicom.
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
