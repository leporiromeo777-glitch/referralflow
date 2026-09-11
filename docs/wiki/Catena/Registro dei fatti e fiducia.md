---
tipo: tappa
aggiornata: 2026-09-11
---
# Registro dei fatti (evidence ledger) e punteggio di fiducia

Dall'11.9.2026 ogni bozza porta due cose calcolate SOLO dal codice, a fine catena (`costruisci_ledger`, `punteggio_fiducia` in pipeline.py; endpoint `ledger`, `fiducia`).

## Registro dei fatti (`payload.ledger`)
I fatti atomici della bozza in un posto solo, ognuno con valore, dove sta (indice di frase, secondo dell'audio), chi l'ha sentito, confidenza 0-1 e stato:
- **numeri** (da `numeri` del rischio): confidenza 0.5 + 0.3 se anche il motore 2 li ha sentiti + 0.2 se il secondo orecchio (Parakeet) li conferma, − 0.3 se il secondo orecchio non li conferma; stato «concorde» / «solo motore 1» / «non confermato dal secondo orecchio».
- **farmaci** (nomi dell'elenco Swissmedic trovati nel testo): 0.9 se anche nel motore 2, 0.6 altrimenti.
- **parole pesanti** sentite da un motore solo (dalle divergenze `pesanti`: negazioni, lateralità, qualificatori, numeri): 0.3, «discorde tra i motori».
- **terapia**: righe controllate 0.8; righe dubbie 0.4 con il motivo.
- **omissioni gravi** (con numeri o farmaci): 0.4; **contraddizioni** (coerenza): 0.3; **frasi non sostenute** (avvocato): 0.3.
Ordinato dal meno sicuro al più sicuro, max 200; `riepilogo` con conteggi. In pagina: dentro la card della fiducia, «Registro dei fatti», righe sotto 0.5 evidenziate.

## Punteggio di fiducia (`payload.fiducia`)
0-100, parte da 100, ogni segnale toglie punti con un tetto, e ogni detrazione è scritta: numeri non confermati −6 l'uno (max 30), parole pesanti discordi −4 (max 20), omissioni gravi −5 (max 20), contraddizioni −5 (max 15), frasi non sostenute −3 (max 15), righe di terapia dubbie −4 (max 12), verifica ridotta −10, minima −25, un solo motore −5. Livello: alta ≥ 80, media ≥ 55, bassa sotto. Mostrato nella card «Fiducia nella bozza» e come badge nella lista dei referti. **Non è un giudizio clinico**: dice quanta attenzione serve. Non decide un modello più grande e non salta la persona: la revisione umana resta obbligatoria per tutti (SPEC). Caso 34 nella suite.

## Verifier di un'altra famiglia
Correttore, arbitro, terapia, estrazione girano su `modello=` della config esterna (gemma-4-31B). I VERIFICATORI (avvocato del diavolo, omissioni semantiche, coerenza interna, verificatore selettivo) girano su `modello_verifica=` (oggi `Qwen/Qwen3.5-397B-A17B-FP8`, sempre via Infomaniak, testo pseudonimizzato): un'altra famiglia, così gli errori sistematici del correttore non vengono confermati da un gemello (`_modello_verifica`, `_chiama_esterno_verifica`; riga vuota = stesso modello). Nella versione della catena: `esterno_verifica`. Misure in [[Misure/Banchi]].

## Consolidatore notturno
`npm run consolida` (`scripts/consolida.ts`, launchd `ch.referralflow.consolidatore` alle 03:30, log `~/referti/log/consolidatore.log`) scrive `docs/wiki/Proposte/<data>.md` e `Proposte/Ultime.md`: andamento delle correzioni (30 giorni contro i 30 prima), quale tappa aiuta davvero, voci di dizionario ricorrenti non ancora decise, frasi fisse da copiare nelle pagine `Agenti/`. Solo parole, frasi generiche senza nomi, numeri. Non modifica nulla: propone.
