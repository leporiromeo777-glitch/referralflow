---
tipo: tappa
aggiornata: 2026-09-11
---
# Doppioni del parlato, note per la segreteria, schede senza testo

## Segreteria (SPEC §6.4)
`PROMPT_SEGRETERIA` (o la catena compatta esterna) individua le frasi in cui il medico si rivolge a chi prepara la lettera; `_applica_note_segreteria` le sposta in `note_segreteria` SOLO se citazione esatta (≥ 8 caratteri, senza sovrapposizioni), mai frasi con cifre, mai narrazione clinica al passato («abbiamo anticipato…»), e solo se il referto che resta è ≥ 40% del testo. L'estrazione dei campi gira sul testo integrale (note comprese: il nome del paziente spesso è solo nell'apertura). La pagina aggancia le cose da allegare alla cartella del paziente (`agganciaRiferimenti`, «cose non trovate»). Sui dati reali il destinatario estratto coincide col confermato in 9 bozze su 11: non serve un'estrazione a parte dalle note.

### Apertura di regia (12.9.2026)
Moccetti apre spesso così: «Detto la lettera della signora X, nata il …, lettera che va al dottor Y e scrive: caro Y, …». Sul secondo referto vero il modello della segreteria non l'ha citata per intero e tutta la regia è rimasta nel referto. Ora è una regola di CODICE, prima del modello: `stacca_apertura_dettatura` prende dall'inizio del testo fino a «e scrive/scrivi:» (max 320 caratteri, resto ≥ 40) e la mette in testa alle note per la segreteria; il testo riparte con la maiuscola. Nello stesso passaggio `_posologie_puntate` trasforma «1.0.0» dettato con i punti in «1-0-0». Caso 36 nella suite.

## Doppioni (7.9.2026)
`togli_doppioni()` dopo lo stile, prima della struttura. Tre regole: frase identica o quasi (Jaccard ≥ 0.9, ≥ 3 elementi) → via la seconda; autocorrezione («anzi», «volevo dire», «correggo»…) → vince la frase col marcatore se condivide ≥ metà delle parole; contenimento proposto dall'AI locale (`PROMPT_DOPPIONI`, solo numeri di frase) accettato solo se ≥ 80% delle parole di contenuto stanno nella frase tenuta. Guardia oggetti protetti (numeri, negazioni, lateralità, farmaci Swissmedic): se la frase tolta ne ha uno che la tenuta non ha → NON si toglie, va in `doppioni_dubbi`. Passo «Doppioni del parlato» nel wizard con «Rimetti» (stessi indici) e «Togli». Caso di scuola: «lettera del 1 settembre» e «rapporto operatorio del 1 settembre» restano entrambe.

## Schede senza testo (7.9.2026)
Una riga di sola punteggiatura («,» da un «virgola» dettato a inizio segmento) diventava una «frase» del wizard, ridotta a nulla da `normalizza()` si agganciava a QUALSIASI citazione. Ora `ricuci_punteggiatura_orfana()` nella catena attacca quelle righe alla riga prima (caso 22) e `trovaIndice` non aggancia mai una frase < 8 caratteri; le segnalazioni senza frase citata sono scartate da catena e pagina. La ricucitura NON si fa lato pagina: cambierebbe gli indici delle frasi e butterebbe via le revisioni in corso.
