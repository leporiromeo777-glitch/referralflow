---
tipo: tappa
aggiornata: 2026-09-12
---
# Schema della catena (per spiegarla a chi non la conosce)

Una pagina da copiare e incollare a chi deve capire com'è fatta la catena oggi, anche un'altra AI. Nessun dato clinico. Il dettaglio di ogni tappa sta nelle pagine linkate; i numeri in [[Misure/Banchi]].

## Principi
- **Due motori di trascrizione** (whisper large-v3 e Voxtral mini) e un **arbitro**: nessun testo è «vero» finché i due non concordano o una persona non decide.
- **L'AI propone, il codice decide.** Ogni proposta di un modello passa da guardie deterministiche (numeri, unità, negazioni, lateralità, farmaci, ribaltamenti clinici). Se una guardia dice no, la proposta non entra.
- **Verificatori di un'altra famiglia** rispetto al modello che corregge, così gli errori non sono correlati.
- **Fiducia calcolata da segnali reali** (accordo dei motori, riascolto dei numeri, esiti dei verificatori), mai chiesta al modello.
- **Ogni fatto sa da dove viene**: fonti, secondo dell'audio, confidenza; in pagina un clic sulla parola fa sentire l'audio.
- **Niente apprendimento automatico**: le correzioni umane producono proposte, una persona le conferma.
- **nLPD**: i modelli locali vedono il testo; verso il cloud parte solo testo PSEUDONIMIZZATO, verso fornitori autorizzati (Infomaniak, Svizzera).

## Il flusso

```mermaid
flowchart TD
  subgraph A[1 · Audio]
    A1[Dittafono DS2 → WAV] --> A2[Integrità: durata, silenzio, coda parlata]
    A2 --> A3[Preprocessing: passa-alto, denoise, atempo 0.8]
  end
  subgraph B[2 · Doppia trascrizione]
    A3 --> B1[whisper large-v3 con VAD]
    A3 --> B2[Voxtral mini]
    B1 --> B3[Passata doppia: whisper senza VAD, vince la più concorde con Voxtral]
    B1 & B2 --> B4[Anti-loop, dizionario del medico, glossario fonetico, punteggiatura dettata]
  end
  subgraph C[3 · Riconciliazione]
    B4 --> C1[Confronto: divergenze A/B, parole pesanti, numeri]
    C1 --> C2[Arbitro esterno, pseudonimizzato: a / b / incerto — numeri esclusi]
    C2 --> C3[Codice applica solo le scelte ammesse]
  end
  subgraph D[4 · Correzione e ispezione]
    C3 --> D1[Correttore esterno gemma-4-31B: lista da→a, note segreteria, fuori tema, senza senso]
    D1 --> D2[Guardie: plausibilità fonetica, ribaltamento clinico, prefisso privativo, numeri intoccabili]
    D2 --> D3[Regia iniziale staccata dal codice; segni ricuciti]
    D3 --> D4[Verificatore Qwen 3.5-397B, altra famiglia: rivede ogni riparazione, frasi non supportate]
    D4 --> D5[Bella copia locale Qwen 3.8 27B, per frase, con lucchetti]
    D5 --> D6[Doppioni: codice + AI locale, guardia oggetti protetti]
  end
  subgraph E[5 · Specialisti]
    D6 --> E1[Terapia: righe strutturate, nomi dall'elenco del medico, sospesi]
    D6 --> E2[Estrazione campi: paziente, nascita, destinatario]
    D6 --> E3[Controllo cifre: riascolto dell'audio, numeri non confermati]
    D6 --> E4[Tempi parola per parola, copertura audio]
    D6 --> E5[Omissioni: codice sulla frase pulita + modello]
    D6 --> E6[Coerenza interna: contraddizioni, modello]
  end
  subgraph F[6 · Certificato]
    E1 & E2 & E3 & E4 & E5 & E6 --> F1[Manifesto: livello, critici, mancanti]
    F1 --> F2[Registro dei fatti: fonte, secondo, confidenza per numero, terapia, omissione]
    F2 --> F3[Punteggio di fiducia 0-100, detrazioni spiegate]
  end
  subgraph G[7 · Piattaforma]
    F3 --> G1[Invio alla piattaforma, idempotente per impronta del file]
    G1 --> G2[Revisione guidata: prima le parole, poi le frasi; gate pre-firma]
    G2 --> G3[Impagina come lettera: modello locale + lettera tipo + regole di forma + esempi pseudonimizzati; guardie su numeri, unità, relazioni]
    G3 --> G4[Terapia fusa con la lettera precedente: bozza confermata o documento in cartella]
    G4 --> G5[Word: intestazione dalla rubrica, data del dettato, blocco Allegato dai documenti citati]
  end
  subgraph H[8 · Apprendimento con una persona nel mezzo]
    G2 --> H1[Audit immutabile: un artefatto per tappa, ogni modifica umana]
    H1 --> H2[Attribuzione: quale tappa avvicina o allontana dalla versione finale]
    H2 --> H3[Consolidatore notturno → Proposte nella wiki]
    H3 --> H4[Dizionario confermato a mano nel cruscotto → torna nella catena]
  end
  subgraph K[Conoscenza]
    K1[Wiki Agenti: come detta il medico, frasi fisse, farmaci, lettera tipo, regole; attenzioni ed esempi per ogni agente] --> K2[Compilata in medici.json e conoscenza-agenti.json]
    K2 -.-> C2
    K2 -.-> D1
    K2 -.-> E1
    K2 -.-> E5
    K2 -.-> E6
    K2 -.-> G3
  end
```

## Chi fa che cosa

| tappa | chi | dove | proposta o decisione |
|---|---|---|---|
| trascrizione | whisper large-v3, Voxtral mini | Mac dello studio | proposta (due) |
| arbitro | gemma-4-31B | cloud CH, pseudonimizzato | proposta; numeri mai |
| correttore | gemma-4-31B | cloud CH, pseudonimizzato | proposta a lista |
| verificatore, avvocato, omissioni, coerenza | Qwen 3.5-397B (altra famiglia) | cloud CH, pseudonimizzato | proposta |
| bella copia, doppioni, impaginazione | Qwen 3.8 27B | Mac dello studio | proposta |
| pseudonimizzazione | gemma3:12b + regole | Mac dello studio | decisione |
| guardie, ledger, fiducia, manifesto, fusione terapia, Word | codice | Mac dello studio | decisione |
| conferma | persona (medico o segretaria) | piattaforma | decisione finale |

## Che cosa NON c'è, e perché
- **Nessun router** che decide quali controlli fare: girano tutti, su ogni referto (4 minuti, centesimi, nessuno aspetta). Un punto che può saltare un controllo è un rischio senza risparmio.
- **Nessun retrieval** dalla wiki a ogni chiamata: la conoscenza del medico e dell'agente è compilata nei prompt, misurata meglio del recupero a blocchi ([[Agenti/Come funziona]]).
- **Nessun apprendimento automatico**: mai una correzione umana che cambia i prompt da sola ([[Decisioni/Registro]]).
- **Nessun modello locale più grande**: provati Nemotron, gemma3:27b, medgemma, Baichuan; Qwen 3.8 27B resta il migliore sul Mac da 24 GB.

## Come si misura
Suite permanente di 38 casi «catastrofici» sul codice; banchi sintetici per arbitro (15/15), terapia (8/8), omissioni (8/9 modello, 2/9 codice, 0 falsi), coerenza (5/5, 0 falsi), forma della lettera (12/12); referti veri confrontati con la lettera della segretaria tappa per tappa con i soli booleani dell'audit. Ogni difetto vero diventa una regola di codice, una voce di dizionario o un'attenzione nella wiki, e un caso nella suite.
