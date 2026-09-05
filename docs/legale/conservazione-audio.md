# Regola sulla conservazione dell'audio dei dettati (bozza da approvare)

Stato: proposta del 6 settembre 2026, da approvare dal titolare e da
riportare nella DSFA. Nasce da un rilievo della revisione esterna della
catena: «se una copia va nel dataset, l'audio non è stato cancellato: è
stato spostato in una nuova finalità».

## Situazione oggi

- La catena consegna la bozza all'app e l'app autorizza la cancellazione
  dell'audio dalla coda di lavoro.
- Con `REFERTI_CONSERVA_AUDIO=1` (default) la catena tiene una COPIA
  dell'audio in `~/referti-dataset/audio/` per un futuro addestramento
  della trascrizione sulla voce del medico (LoRA). Oggi: 2 file.
- L'audio contiene la voce del medico e, pronunciati, i dati del
  paziente: la de-identificazione del testo non lo protegge.
- Il disco del Mac è cifrato (FileVault acceso).

## Regola proposta

1. **Finalità separata e dichiarata**: «miglioramento del riconoscimento
   vocale per il medico dettante», distinta dalla cura; una riga
   nell'informativa dello studio e nel registro dei trattamenti.
2. **Opt-in per medico**: la copia si conserva solo se il medico dettante
   ha acconsentito (è la sua voce); default spento negli studi clienti,
   acceso solo nello studio pilota dopo l'ok del titolare.
3. **Conservazione massima 24 mesi**, poi cancellazione automatica
   (`REFERTI_CONSERVA_GIORNI=730`; la catena cancella al primo giro
   utile i file più vecchi). Cancellazione anticipata su richiesta.
4. **Dove**: volume APFS cifrato dedicato (`mac/crea-volume-cifrato.sh`),
   chiave distinta da quella del disco, così la distruzione della chiave
   rende illeggibile tutto il dataset in un colpo (cancellazione
   crittografica). Nessuna copia nei backup dell'app.
5. **Accesso**: solo l'account di servizio del Mac; nessuna
   sincronizzazione cloud; niente copie su PC personali o GPU a noleggio.
6. **Uso**: solo addestramento locale sul Mac dello studio; mai
   condivisione con terzi; il test set resta congelato e separato.
7. **Registro**: il servizio registra nel log solo conteggi (file
   conservati, cancellati per scadenza), mai nomi o contenuti.

## Decisioni da prendere (titolare)

- [ ] Approvare l'opt-in e la durata (24 mesi proposti).
- [ ] Creare il volume cifrato e spostare `~/referti-dataset/audio`.
- [ ] Inserire la riga nell'informativa pazienti / DSFA.
