---
tipo: indice
aggiornata: 2026-09-16
---
# Wiki di ReferralFlow

Che cos'è vero **oggi** del progetto, per argomento. La storia sta in git; qui sta lo stato.
Chi modifica il codice aggiorna la pagina dell'argomento (non appende in coda).
Niente dati clinici, mai: solo regole, forme, misure e decisioni.

## Regole che non si negoziano
- [[Regole/nLPD e sessione]] — dati sanitari, che cosa non leggere mai, come si distribuisce, chi paga
- [[Regole/NON rompere]] — vincoli tecnici che fanno fallire il build o l'app

## Piattaforma (Next.js)
- [[Piattaforma/Stack e comandi]]
- [[Piattaforma/Architettura]] — cartelle, recinto multi-studio, middleware, ciclo di vita referral
- [[Piattaforma/Server Mac mini]] — servizi launchd, aggiornamento, backup
- [[Piattaforma/Demo pubblica]] — la piattaforma vera con dati inventati, raggiungibile da fuori con un link
- [[Piattaforma/Automazioni]] — cron, SMS, watchdog, report
- [[Piattaforma/Robot agenda MediOnline]]
- [[Piattaforma/Funzioni fatte]] — tutto ciò che esiste già, in ordine inverso
- [[Piattaforma/Documenti legali]] — che cosa c'è in docs/legale e a che punto è
- [[Piattaforma/Prossimi lavori]] e [[Piattaforma/Visione]]
- [[Piattaforma/Prototipo stack]] — l'interfaccia nuova, oggi operativa su cct.referralflow.ch/prototipo (dati veri, bot locale, procedure con traccia); la copia con dati finti resta su :8765
- [[Piattaforma/Convenzioni UI]] — palette, layout delle pagine, regole di stile
- [[Piattaforma/Procedure e tracce]] — procedure in codice con traccia «Da dove viene», registro delle procedure come dati, interprete delle domande scritte, grafo dei fatti in Postgres
- [[Piattaforma/Moduli]] — i moduli dello studio in versione digitale (letti a runtime: compilazione, dossier, stampa)
- [[Piattaforma/Organizzazione dello studio]] — ruoli, responsabilità, servizi: il grafo organizzativo letto dalla piattaforma (solo ruoli, mai nomi)
- [[Piattaforma/AI locale dell'app]] — l'assistente dentro la piattaforma: modello, configurazione, perché a volte non risponde
- [[Piattaforma/Orchestrazione sale]] — il gemello digitale: la stanza al paziente, il medico mobile, solver CP-SAT, orizzonte mobile, ritardi, due modelli, fasi — costruito il 16.9, da misurare

## Per chi usa la piattaforma
- [[Procedure/Segretaria]] — dal dettato alla lettera, passo per passo

## Catena dei referti (dettato → bozza)
- [[Catena/SPEC in breve]] — i vincoli della SPEC e dove la pratica se n'è allontanata
- [[Catena/Panoramica]] — le tappe in ordine, i file, i modelli, dove sta ogni cosa
- [[Catena/Schema]] — il flusso in un diagramma, da copiare a chi deve capire la catena (anche un'altra AI)
- [[Catena/Pannello locale]] — lo strumento d'esercizio sul Mac
- [[Catena/Profili per medico]] — medici.json, modalità, formati, dizionari
- [[Catena/Sentinelle e recuperi]] — collasso A/B, corsa senza VAD, promozione del testimone, tempi
- [[Catena/Arbitro]] — scelta tra i due motori
- [[Catena/Contesto per medico]] — il blocco di dati nei prompt
- [[Catena/Omissioni]] — codice + modello, guardie
- [[Catena/Terapia]] — terapia strutturata e secondo tempo
- [[Catena/Coerenza interna]]
- [[Catena/Doppioni e segreteria]] — doppioni del parlato, note per la segreteria, schede senza testo
- [[Catena/Formato lettera e Word]] — forma della segretaria, stampo Word, impaginazione AI, controllo della lettera
- [[Catena/Revisione guidata]] — wizard, autosave, passi
- [[Catena/Dittafono DSS]]
- [[Catena/Modelli locali]] — Qwen 3.8, gemma, whisper, Voxtral
- [[Catena/Registro dei fatti e fiducia]] — evidence ledger, punteggio 0-100, verifier di un'altra famiglia, consolidatore notturno
- [[Catena/Audit e qualità]] — schema audit, lineage, cruscotto, dizionario dalle correzioni, attribuzione per tappa, frasi ripetute
- [[Catena/Strumenti e pagine]] — confronto cieco, ombre, manifesto, eventi

## Conoscenza per gli agenti della catena (compilata nei prompt)
- [[Agenti/Come funziona]] — le pagine qui sotto diventano `medici.json` e `conoscenza-agenti.json` al deploy
- [[Agenti/Moccetti]], [[Agenti/Moschovitis]] — come detta, frasi fisse, farmaci → contesto del medico
- [[Agenti/Correttore]], [[Agenti/Arbitro]], [[Agenti/Omissioni]], [[Agenti/Terapia]], [[Agenti/Coerenza]] — attenzioni ed esempi finti con la risposta giusta

## Medici
- [[Medici/Prestazioni e sale]] — per ogni prestazione: durata, preparazione, in quali stanze, con quali apparecchi, chi è abilitato (letta a runtime dall'orchestrazione)
- [[Medici/Moccetti]]
- [[Medici/Moschovitis]]
- [[Medici/Percorsi]] — sequenze standard per indicazione, lette dalla piattaforma (voce «Percorsi» dell'interfaccia nuova); stato «proposta» finché il medico non valida
- [[Medici/Sale]] — di chi è quale stanza, e quando (regole lette a runtime)

## Decisioni chiuse (con il perché)
- [[Decisioni/Registro]]

## Proposte del consolidatore notturno (da approvare a mano)
- [[Proposte/CardioOS confronto per funzione]] — la demo concorrente (14.9.2026): come ha strutturato ogni funzione, cosa abbiamo, cosa portare e cosa no, piano in 8 punti
- [[Proposte/Ultime]] — andamento, tappe da guardare, dizionario, frasi fisse; una pagina per data nella stessa cartella

## Misure
- [[Misure/Banchi]] — ogni banco con numeri e data
- [[Misure/Dataset]] — la cartella dei dati sul Mac: veri e sintetici

## Altro
- [[Glossario]]
- [[Wiki/Come si usa]] — SilverBullet, convenzioni delle pagine
