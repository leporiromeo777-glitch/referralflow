---
tipo: agente
agente: terapia
aggiornata: 2026-09-11
---
# Agente: estrazione della terapia dettata

Compilato in `conoscenza-agenti.json` → entra in `PROMPT_TERAPIA`. Come si lavora: [[Agenti/Come funziona]]. Il codice che traduce posologie e controlla nomi e numeri: [[Catena/Terapia]].

## Che cosa riceve (per le persone)
Il referto ripulito, pseudonimizzato. Risponde con la lista dei farmaci citati: nome come nel testo, dose, posologia come detta, stato (in corso / nuovo / modificato / sospeso), nota. Non traduce le posologie e non corregge i nomi: lo fa il codice.

## A cosa fare attenzione
- «Sospendo», «stoppo», «sostituisco X con Y» → X è sospeso; Y è nuovo.
- «Aumento», «riduco», «porto a» → modificato, con la dose nuova.
- «Continua», «prosegue», «in atto» → in corso. «Terapia invariata» senza farmaci = lista vuota.
- La nota serve solo per precisazioni di prescrizione (durata, poi, fino a); la ragione clinica («per la tollerabilità») non è una nota.

## Esempi
### Modifica, sospensione e nuovo insieme
Dato: «Continua Beloc Zok 50 mg mezza compressa al mattino, introduco Torasemide 5 mg al mattino e sospendo l'Esidrex per la potassiemia.»
Risposta giusta: Beloc Zok, 50 mg, «mezza compressa al mattino», in corso; Torasemide, 5 mg, «al mattino», nuovo; Esidrex, dose vuota, sospeso, nota vuota

### Cadenza e durata
Dato: «Repatha 140 mg ogni due settimane, da rivalutare dopo tre mesi.»
Risposta giusta: Repatha, 140 mg, «ogni due settimane», in corso, nota «da rivalutare dopo tre mesi»

### Niente terapia
Dato: «La terapia resta invariata. Controllo fra un anno.»
Risposta giusta: lista vuota
