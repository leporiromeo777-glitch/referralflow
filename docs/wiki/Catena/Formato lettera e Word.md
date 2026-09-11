---
tipo: tappa
aggiornata: 2026-09-11
---
# Formato lettera, Word in carta intestata, impaginazione AI

## Word (`src/lib/referto-docx.ts`, stampo `modelli/referto-carta-intestata.docx`)
Segnaposto anche in intestazione (`{{int_nome}}`, `{{intestazione}}`) e per `{{via}}`, `{{titolo}}`, `{{copia}}`: la carta segue il medico che ha dettato (profilo: `intestazione`, `titolo_rapporto`, `chiusura`, `firma`, `copia`). Formato lettera: destinatario su più righe («Egregio Signor» / «Gentile Signora», nome con titolo, FMH dalla rubrica invianti, «Via e-mail: …»), data della DETTATURA (`payload.dettato_il`, header DSS) + sigla di chi conferma, titolo «RAPPORTO AMBULATORIALE del <data visita>». Destinatario: dai campi se affidabile (`destinatarioAffidabile`: non chi ha solo ESEGUITO un esame con saluto generico), altrimenti dal saluto della lettera (`destinatarioDalSaluto`, col genere). `ricomponiParagrafi` (abbreviazioni), `staccaSaluto`, righe vuote, `limitaVuotiPrimaDi`, `spaziDestinatario: 2`. Intestazione di Moccetti senza e-mail (serve il telefono in Impostazioni studio).

## Impagina come lettera / Riorganizza (`src/lib/referto-struttura.ts`)
Modello locale `REFERTO_STRUTTURA_LLM` (Qwen 3.8 leggero, `think:false`; `PROMPT_LETTERA` / `PROMPT` rapporto, `promptPer`). Prima del modello, dal CODICE (`src/lib/referti-lettera.ts`): date «2 settembre 2026» → «02.09.2026» (`normalizzaDate`), quantità di tempo a parole → cifre (`numeriDiTempoInCifre`, anche intervalli «fra due o 3 settimane» → «fra 2-3 settimane»). Dopo il modello (`rifinisciLettera`): corpo in MINUSCOLO dopo il saluto (elenco chiuso di aperture), chiusura fissa dal profilo (inserita se manca), firma dal codice (dedupe con `iChiusuraVera`), blocco «Terapia:» da [[Catena/Terapia]] (`opzioniRiorganizzazione` in `referti-formato.ts`).

Guardie: veto se cambia un numero (numerazione d'elenco esclusa); guardia sulle PAROLE aggiunte (`paroleAggiunte`): le parole di contenuto non nel dettato vengono elencate e, se pesano sul senso (diminuito/aumentato, negazioni, lateralità, urgente…) o sono più di sei, la proposta si scarta (`motivo: 'parole_aggiunte'`; caso vero «con valori di partenza di 135 su 105 mmHg»). Proposta salvata in `testo_finale` solo su stato bozza. `avviaRiorganizzazione(..., alTermine)`.

## Controllo della lettera (9.9.2026)
`src/lib/referto-verifica.ts`: `PROMPT_VERIFICA_LETTERA` in due direzioni (frasi della lettera non sostenute dal testo di partenza; passaggi spariti), sul modello esterno dall'APP (`src/lib/esterno.ts`, stessa conf `~/.referralflow-esterno.conf`, solo fornitori autorizzati) con testo pseudonimizzato dal piano di `anonimizza.ts`; guardie pure `filtraSegnalazioni` (le stesse lezioni delle [[Catena/Omissioni]]). Esito in `payload.riorganizzazione.verifica`, card «Controllo della lettera», tappa audit `verifica_lettera`. Solo segnalazioni. Test `npm run test:app`.

## Forma della segretaria (dai cinque confronti catena vs segretaria, 7-8.9.2026)
Contenuto clinico identico nei confronti; le differenze erano di forma: firma su tre righe, saluto a parte, spazio in più, «Gentile Signora», date in cifre, corpo in minuscolo, «in quanto già presente». Il blocco dell'ecocardiogramma e la terapia della segretaria NON erano nel dettato (referti strumentali). Un Word scaricato prima di «Impagina come lettera» è il testo della revisione, non una lettera.
