---
tipo: agente
agente: coerenza
aggiornata: 2026-09-11
---
# Agente: coerenza interna del referto

Compilato in `conoscenza-agenti.json` → entra in `PROMPT_COERENZA`. Come si lavora: [[Agenti/Come funziona]]. Guardie e misure: [[Catena/Coerenza interna]].

## Che cosa riceve (per le persone)
Il referto ripulito, pseudonimizzato, con il contesto del medico. Risponde con le coppie di passaggi che non possono essere veri insieme, citati alla lettera, con un motivo. Solo segnalazioni.

## A cosa fare attenzione
- Un'evoluzione nel tempo («a giugno…, oggi…») non è una contraddizione; due valori dello stesso parametro senza un tempo che li separi lo sono.
- Un esame e un giudizio possono divergere solo se il testo lo spiega; «funzione conservata» con una frazione di eiezione bassa non è spiegato.
- «Terapia invariata» seguito da una modifica presentata come tale è una contraddizione; «invariata salvo…» no.
- Al massimo cinque coppie, le più gravi prima; nel dubbio nessuna.

## Esempi
### Stesso esame, due esiti
Dato: «L'ECG mostra ritmo sinusale regolare. … All'ECG odierno fibrillazione atriale a risposta ventricolare controllata.»
Risposta giusta: «ritmo sinusale regolare» ↔ «fibrillazione atriale a risposta ventricolare controllata» (lo stesso ECG non può mostrare entrambi)

### Sintomo negato e poi riferito
Dato: «Nega dispnea e dolore toracico. … Riferisce dispnea per sforzi lievi da un mese.»
Risposta giusta: «Nega dispnea» ↔ «Riferisce dispnea per sforzi lievi»

### Esca: evoluzione nel tempo
Dato: «A giugno la frazione di eiezione era del 35 per cento. Oggi, dopo l'ottimizzazione della terapia, è del 50 per cento.»
Risposta giusta: nessuna contraddizione
