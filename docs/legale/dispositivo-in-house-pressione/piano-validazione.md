# Piano di validazione — Proposte di orario

Versione 1.0 · 7 ottobre 2026 · bozza. La validazione **non è cominciata**.

## 1. Che cosa si vuole sapere
1. Il software calcola ciò che è scritto nella descrizione tecnica (verifica).
2. Le sue proposte sono quelle che un medico dello studio riterrebbe ragionevoli (validazione).
3. Dopo uno spostamento accettato, il profilo successivo è migliorato o no (esperienza clinica).

## 2. Verifica (automatica, a ogni modifica)
`prove-pressione.test.ts` e `prova-pressione.ts`, con profili inventati: stessi dati,
stessa proposta; limiti rispettati; permessi; conferma dei farmaci.

## 3. Validazione retrospettiva, prima dell'accensione
- **Materiale**: almeno 30 profili delle 24 ore già refertati dallo studio, di almeno 20
  pazienti, con la terapia e gli orari di allora. Caricati in piattaforma come profili normali.
- **Chi**: un medico dello studio, che per ogni profilo scrive PRIMA di vedere la proposta
  se sposterebbe un orario, quale e verso quando.
- **Confronto**: per ogni profilo si registra: nessuna proposta / proposta uguale alla
  scelta del medico (stesso farmaco, stessa fascia della giornata) / diversa / il medico
  non avrebbe spostato niente.
- **Criteri di accettazione** (da confermare col consulente):
  - nessuna proposta che il medico giudica **pericolosa** (zero su tutti i profili);
  - almeno l'80% delle proposte giudicate «ragionevoli» (accetterei o modificherei di poco);
  - nei profili in cui il medico non sposterebbe niente, il software non propone in almeno l'80%.
- Se un criterio non è raggiunto: si cambiano le regole, si cambia `VERSIONE_REGOLE`, si ripete.

## 4. Tabella dei farmaci
Prima della validazione, ogni principio attivo presente nei profili usati è confermato da
un medico sul testo ufficiale del prodotto. Si annota la fonte nella riga.

## 5. Dopo l'accensione: riesame dell'esperienza
- Ogni tre mesi: quante proposte, quante accettate, modificate, scartate; per quelle
  accettate o modificate con un monitoraggio successivo, la differenza di punteggio, di ore
  in bersaglio e di ore troppo basse.
- **Si spegne e si riesamina** se: una proposta accettata è seguita da ore troppo basse nel
  profilo successivo in più di un caso; oppure più della metà delle proposte viene scartata.
- Gli incidenti gravi si segnalano secondo le regole della vigilanza sui dispositivi.

## 6. Dove stanno i risultati
Nel fascicolo, in un file `validazione-AAAA-MM.md` con i conteggi — **mai** nomi o valori
dei pazienti: solo numeri aggregati.
