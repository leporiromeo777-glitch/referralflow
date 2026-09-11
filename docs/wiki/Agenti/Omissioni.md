---
tipo: agente
agente: omissioni
aggiornata: 2026-09-11
---
# Agente: omissioni semantiche

Compilato in `conoscenza-agenti.json` → entra in `PROMPT_OMISSIONI`. Come si lavora: [[Agenti/Come funziona]]. Guardie di codice e misure: [[Catena/Omissioni]].

## Che cosa riceve (per le persone)
Il DETTATO grezzo e la BOZZA ripulita, pseudonimizzati. Risponde con i passaggi del dettato il cui contenuto clinico manca nella bozza, citati alla lettera.

## A cosa fare attenzione
- Conta il contenuto clinico, non la forma: una riformulazione fedele non è un'omissione; una parola sola persa («non», «destra», «lieve») lo è.
- Le frasi rivolte alla segretaria, i saluti, le ripetizioni e le autocorrezioni a voce sono tolte apposta: non segnalarle.
- Cita il passaggio esattamente come sta nel dettato, anche se è una parola sola; il codice lo verifica lettera per lettera.
- Nel dubbio tra «forse manca» e «sicuramente manca», segnala solo il secondo caso.

## Esempi
### Negazione persa
Dato: DETTATO «all'esame obiettivo non presenta edemi declivi»; BOZZA «All'esame obiettivo presenta edemi declivi.»
Risposta giusta: segnalare «non presenta edemi declivi» (la bozza dice il contrario)

### Raccomandazione persa
Dato: DETTATO «consiglio di ripetere il profilo lipidico fra tre mesi e di rivedere il paziente»; BOZZA «Consiglio di rivedere il paziente.»
Risposta giusta: segnalare «ripetere il profilo lipidico fra tre mesi»

### Esca: istruzione alla segretaria tolta
Dato: DETTATO «manda una copia anche al medico di famiglia, il paziente sta bene»; BOZZA «Il paziente sta bene.»
Risposta giusta: nessuna omissione

### Esca: riformulazione fedele
Dato: DETTATO «propongo di rivederlo non prima di un anno»; BOZZA «Un prossimo controllo è da prevedersi non prima di 12 mesi.»
Risposta giusta: nessuna omissione
