---
tipo: glossario
aggiornata: 2026-09-11
---
# Glossario

- **A / B**: le due trascrizioni dello stesso dettato, whisper (A) e Voxtral (B). La B è il testimone; diventa base se la A collassa.
- **Arbitro**: il modello che sceglie tra A e B nei punti di divergenza ([[Catena/Arbitro]]).
- **Avvocato del diavolo**: controllo che cerca nella bozza frasi non sostenute dal dettato grezzo (`frasi_non_supportate`). Le omissioni sono il contrario.
- **Banco**: prova ripetibile con dati sintetici e risposte attese ([[Misure/Banchi]]).
- **Bozza**: la riga di `referti_bozze` con il payload della catena; le correzioni umane vanno in `testo_finale`/`campi_confermati`.
- **Catena**: la pipeline dettato → bozza (`pipeline.py`).
- **Catena compatta**: la chiamata unica al modello esterno che svolge riparazioni, note segreteria, fuori tema e senza senso.
- **Contesto del medico**: blocco di dati nei prompt ([[Catena/Contesto per medico]]).
- **Divergenza**: punto in cui A e B non concordano; **pesante** se contiene qualificatore, negazione, lateralità o numero da una parte sola.
- **Fiducia (punteggio)**: 0-100 spiegato, calcolato dal codice dal registro dei fatti e dal manifesto; dice quanta attenzione serve ([[Catena/Registro dei fatti e fiducia]]).
- **Fusione**: la lettera precedente del paziente aggiornata col nuovo dettato (modalità aggiornamento).
- **Ledger (registro dei fatti)**: i fatti atomici della bozza con fonti, confidenza e stato.
- **Manifesto**: `payload.manifesto`, livello di verifica pieno/ridotto/minimo con testimoni e trasporti.
- **Ombra**: bozza alternativa prodotta da una variante della catena per il confronto cieco.
- **Pseudonimizzato**: testo con nomi, date e contatti sostituiti da segnaposto, mappa in RAM sul Mac. Non «anonimo».
- **Segretaria (fase)**: le frasi rivolte a chi prepara la lettera, spostate in `note_segreteria`.
- **Suite catastrofica**: `prove-catastrofiche.py`, i casi peggiori congelati come test permanenti; `distribuisci.sh` la esegue prima di copiare.
- **Testimone promosso**: quando la B diventa base ([[Catena/Sentinelle e recuperi]]).
- **Trasporto**: dove è girata una tappa: `locale`, `esterno`, `manuale`.
- **Verifier / verificatori**: avvocato, omissioni, coerenza, verificatore selettivo; girano su un'altra famiglia di modelli rispetto al correttore.
- **Versione della catena**: impronta di codice, prompt (+ contesto medico), dizionario, vocabolario, profilo, modelli (`versione_catena()`).
- **Zero-touch**: referto confermato senza correzioni (REVIEWED_NO_CHANGES).
