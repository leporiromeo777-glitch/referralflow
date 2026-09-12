---
tipo: agente
agente: correttore
aggiornata: 2026-09-12
---
# Agente: correttore della trascrizione

Compilato in `conoscenza-agenti.json` → entra nei prompt di correzione (catena compatta esterna e lista di riparazioni locale) dopo il contesto del medico. Come si lavora: [[Agenti/Come funziona]]. Il prompt di base è quello della SPEC §6.1/6.1b e non si tocca.

## Che cosa riceve (per le persone)
La trascrizione già passata da due motori e dal dizionario, pseudonimizzata, con il contesto del medico (sigle, farmaci, frasi fisse, errori d'ascolto già visti). Risponde con una lista di riparazioni «da → a», mai con il testo riscritto.

## Che cosa deve fare (per le persone)
Correggere solo termini medici storpiati, nomi di farmaci e refusi nati dalla trascrizione. Mai numeri, mai segnaposto, mai il senso.

## A cosa fare attenzione
- Una parola strana in un contesto cardiologico è quasi sempre un termine medico sentito male: cerca il termine più vicino per suono che abbia senso nella frase (sensuale → sinusale, paradossistica → parossistica).
- I nomi commerciali svizzeri dei farmaci vanno scritti come nell'elenco del medico; un nome che somiglia a un farmaco ma non esiste è un errore d'ascolto.
- Le frasi fisse del medico vanno riconosciute anche se storpiate: la forma giusta è quella nel contesto (un test da sforzo è «massimale» o «submassimale», mai «assiale»).
- Una lettera sola incastrata prima di un segno («previsto i:») è di solito la desinenza staccata della parola prima: se dopo il segno vengono elencate più cose, è il plurale («previsti:», e allora anche «dell'esame strumentale» era «degli esami strumentali»); se il resto è al singolare, la lettera è rumore e si toglie.
- Non toccare: numeri e unità, segnaposto come «Persona 1», istruzioni alla segretaria, autocorrezioni a voce (le gestisce un'altra fase).

## Esempi
### Termine medico per suono
Dato: «episodi di fibrillazione atriale paradossistica documentati all'Holter»
Risposta giusta: da «paradossistica» a «parossistica»

### Farmaco che non esiste
Dato: «prosegue con Concorde 5 mg al mattino»
Risposta giusta: da «Concorde» a «Concor»

### Frase fissa storpiata
Dato: «non ritorno sulle note del paziente in quanto già presente nei miei incarti»
Risposta giusta: da «sulle note» a «sull'anamnesi»

### Esame sentito male
Dato: «la carriota mostra, malgrado numerosi artefatti a movimento, una malattia critica dell'IVA»
Risposta giusta: da «carriota» a «CardioTAC»; da «artefatti a movimento» a «artefatti da movimento»

### Desinenza staccata prima di un segno
Dato: «i risultati dell'esame strumentale a suo tempo previsto i: il duplex carotideo del 29 luglio non mostra stenosi, l'ecocardiogramma da sforzo risulta negativo»
Risposta giusta: da «dell'esame strumentale a suo tempo previsto i:» a «degli esami strumentali a suo tempo previsti:» (seguono due esami)

### Che cosa NON correggere
Dato: «Persona 1 presenta una FE del 55 per cento, pressione 135 su 85»
Risposta giusta: nessuna riparazione (segnaposto e numeri restano come sono)
