---
tipo: tappa
aggiornata: 2026-09-12
---
# La SPEC della catena, in breve

Fonte di verità: `docs/trascrizione/SPEC.md` (770 righe). Questa pagina ne riassume i vincoli e dice dove la pratica se n'è allontanata con una decisione esplicita.

## Obiettivo
Ridurre i 20 minuti di riascolto e riscrittura a mano per referto a 3-5 minuti di sola revisione, con una bozza già strutturata e i punti dubbi evidenziati. Obiettivo reale: **mai un errore clinico invisibile**. Meglio dieci parole storpiate che un numero sbagliato ma plausibile. Il sistema produce bozze, non referti; ogni uscita passa da una persona.

## Vincoli invalicabili (§2)
1. **Nessun dato esce dalla macchina**, salvo la POST verso l'endpoint bozze di ReferralFlow (Svizzera). Niente accesso diretto al PostgreSQL. *Deroga approvata dopo (§6.1h, 5.9.2026): il percorso esterno verso fornitori in lista con testo pseudonimizzato e controprova doppia, vedi [[Catena/Panoramica]].*
2. **Nessun dato clinico nei log**: solo id file, timestamp, fase, esito, durata; vale per errori e traceback (si logga il tipo, mai `str(e)`). Niente `print()`.
3. **L'audio si cancella solo dopo** la conferma di salvataggio della bozza; FileVault obbligatorio (verificato all'avvio). Dal 23.8.2026 con `REFERTI_CONSERVA_AUDIO=1` l'audio consegnato va in `~/referti-dataset/audio/` (chmod 700) per il futuro addestramento di whisper, invece di essere cancellato.
4. **Nessun numero viene mai corretto automaticamente**: si segnala, non si cambia. Vale per l'AI, il codice, il dizionario.
5. **Nessun campo salvato senza conferma umana**: tutto arriva come bozza.

## Prompt (§6): validati su referti reali, non si riscrivono
Correzione (6.1) e la variante «a lista di riparazioni» (6.1b, prima scelta dal 21.8.2026), correzione esterna pseudonimizzata (6.1h), aggancio fonetico al glossario (6.1d), frasi fantasma (6.1c), avvocato del diavolo (6.1f), arbitro (6.1e), ispezione (6.2), estrazione campi (6.3), segretaria (6.4). I prompt nati dopo (omissioni, terapia, coerenza, lettera, verifica lettera, contesto del medico) hanno pagine proprie e si misurano coi banchi.

### Aggancio fonetico al glossario (6.1d), regole di codice
`riparazioni_glossario`: una parola minuscola di ≥ 7 lettere che non è nel glossario (valori dei dizionari + righe dei vocabolari) ma ne è la storpiatura evidente (stessa chiave fonetica, o distanza ≤ 1, ≤ 2 da 9 lettere) viene riparata, solo se il candidato è uno, mai cifre, mai flessioni («pressoria»/«pressorio»), mai ribaltamenti clinici né prefissi privativi (caso 35). Dal 12.9.2026 (terzo referto vero: «massimale», sentito bene da ENTRAMBI i motori, «riparato» in «assiale» del vocabolario base): il vocabolario e il dizionario del medico della corsa contano come parole giuste e non si toccano, e nel ramo per distanza il candidato deve cominciare con la stessa lettera della parola, perché una storpiatura d'ascolto conserva il suono iniziale. Caso 38.

## Errori (§7)
Un file che fallisce non blocca mai la coda: `errori/` + log accanto (solo fase, tipo, tentativi, timestamp). Ollama giù → 3 tentativi con backoff; JSON non parsabile → 1 ritentativo; ReferralFlow irraggiungibile → il JSON resta in `output/` e l'audio NON si cancella; disco pieno → fermo e segnalazione. Timeout Ollama 300 s.

## Cosa NON fare (§10)
Revisione clinica solo in ReferralFlow (il pannello locale è d'esercizio, solo 127.0.0.1); niente database locale (lo stato sta nelle cartelle); niente autenticazione, code, Docker, microservizi; niente retry infiniti; niente test con referti reali (testi finti). *«Non implementare un voto tra le due trascrizioni»: superato dall'arbitro del piano precisione (6.1e), che sceglie tra due ipotesi e lascia i numeri alla persona.*

## Regola di chiusura (§11)
«Se ti trovi a pensare "qui posso dedurre cosa intendeva", la risposta corretta è: non dedurre, segnala.»
