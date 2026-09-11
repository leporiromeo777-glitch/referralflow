---
tipo: tappa
aggiornata: 2026-09-11
---
# Omissioni (passaggi del dettato che mancano nella bozza)

Due controlli che si fondono in `payload.frasi_omesse`:

1. **Codice** (`rileva_omissioni`, sovrapposizione di parole contro il grezzo — la B o la base nuova se la A è collassata): porta `secondo` di audio, `cifre`, `farmaco`, `copertura`, e `pulita` (punteggiatura dettata convertita + dizionario) perché il bottone «Inserisci nel testo» del wizard rimetta la frase pulita, non grezza («due punti», «chiusa parentesi»). «barra» dettata → «/». Dal 12.9.2026 (secondo referto vero: due «omissioni» erano la stessa frase con parole storpiate, «affronte», «antipro bnt», e sono state rimesse in doppio): la sovrapposizione si misura sulla frase PULITA, le parole di regia («tra parentesi», «virgola») non contano, una parola lunga conta come coperta anche a distanza ≤ 2, e ogni omissione porta `simile` = la frase del referto più vicina, che il wizard mostra («Forse è già nel referto: …»). Difetto vero trovato nello stesso giro: l'endpoint `api/referti/bozza` scartava `pulita`, `motivo` e `fonte` delle omissioni, quindi il wizard rimetteva sempre la frase GREZZA. Ora passano, con `simile`.
2. **Modello esterno** (`PROMPT_OMISSIONI`, `omissioni_esterno`, dal 9.9.2026): omissioni SEMANTICHE, il contrario dell'avvocato; stessa pseudonimizzazione; attivo col percorso esterno salvo `omissioni=0`. Guardie `_filtra_omissioni`: citazione esatta nel dettato; scartata se già nella bozza; max 15. Due lezioni: (a) il modello cita spesso la parola sola («diminuiti») → basta che manchi ALMENO una parola significativa, e sotto le 3 parole devono mancare tutte o una pesante; (b) negazioni, lateralità, qualificatori e numeri contano come significativi anche se corti («non»). La lateralità sola («carotide interna destra» → «carotide interna», frase coperta al 90%) la trova il CODICE dall'11.9.2026: per ogni frase grezza con una lateralità si prende la frase di destinazione più simile e, se lì manca, si segnala la finestra di parole attorno (`motivo: lateralità…`); banco del codice 1/9 → 2/9, 0 falsi. Le voci del modello portano `fonte: "modello"`, `motivo`, `pulita`; il wizard le etichetta «vista dal modello».

Le omissioni gravi (cifre o farmaco) aggiungono un avviso in bozza. Caso 28 nella suite. Banco `banco-omissioni.py`: codice 1/9, modello 8/9 con 0 falsi allarmi ([[Misure/Banchi]]).

Le stesse guardie valgono per il controllo della lettera lato app ([[Catena/Formato lettera e Word]]).
