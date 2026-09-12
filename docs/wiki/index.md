---
tipo: indice
aggiornata: 2026-09-11
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
- [[Piattaforma/Automazioni]] — cron, SMS, watchdog, report
- [[Piattaforma/Robot agenda MediOnline]]
- [[Piattaforma/Funzioni fatte]] — tutto ciò che esiste già, in ordine inverso
- [[Piattaforma/Documenti legali]] — che cosa c'è in docs/legale e a che punto è
- [[Piattaforma/Prossimi lavori]] e [[Piattaforma/Visione]]
- [[Piattaforma/Convenzioni UI]] — palette, layout delle pagine, regole di stile

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
- [[Medici/Moccetti]]
- [[Medici/Moschovitis]]

## Decisioni chiuse (con il perché)
- [[Decisioni/Registro]]

## Proposte del consolidatore notturno (da approvare a mano)
- [[Proposte/Ultime]] — andamento, tappe da guardare, dizionario, frasi fisse; una pagina per data nella stessa cartella

## Misure
- [[Misure/Banchi]] — ogni banco con numeri e data
- [[Misure/Dataset]] — la cartella dei dati sul Mac: veri e sintetici

## Altro
- [[Glossario]]
- [[Wiki/Come si usa]] — SilverBullet, convenzioni delle pagine
