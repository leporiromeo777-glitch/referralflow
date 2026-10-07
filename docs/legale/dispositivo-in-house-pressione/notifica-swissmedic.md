# Notifica a Swissmedic — promemoria, bozza

Art. 18 ODmed: i dispositivi fabbricati e utilizzati in un'istituzione sanitaria si
notificano prima della messa in servizio. Da preparare col consulente; qui i dati che
serviranno.

## 1. Dati
- Istituzione: Centro Cardiologico Ticino — [indirizzo, numero d'identificazione].
- Nome del dispositivo: Proposte di orario ReferralFlow. Versione: regole `pa-orari-1`.
- Destinazione d'uso: vedi [destinazione-uso.md](destinazione-uso.md).
- Classe: IIa (regola 11), salvo diversa valutazione.
- Non ceduto ad altri: il software gira sul solo server dello studio; non esiste alcuna
  funzione per usarlo da altri studi.
- Persona responsabile: [da nominare].

## 2. Prima di inviare
- [ ] Fascicolo riletto dal consulente regolatorio
- [ ] Ricerca degli equivalenti documentata
- [ ] Tabella dei farmaci confermata
- [ ] Validazione chiusa, coi criteri raggiunti
- [ ] Dichiarazione pubblicata
- [ ] `PRESSIONE_PROPOSTE=1` messo nel `.env` solo DOPO i punti sopra, con la data nel Registro
