---
tipo: agente
aggiornata: 2026-09-11
---
# Conoscenza per gli agenti della catena: come funziona

Le pagine in `Agenti/` sono la fonte unica di ciò che gli agenti della catena sanno oltre al dettato. Non le leggono a ogni chiamata: lo script `pipeline-referti/compila-conoscenza.py` le **compila** al deploy (`distribuisci.sh` lo esegue) in due file:

- `pipeline-referti/medici.json` — dalle pagine dei medici ([[Agenti/Moccetti]], [[Agenti/Moschovitis]]): «Come detta» → `contesto`, «Frasi fisse» → `frasi_fisse`, «Farmaci frequenti» → `farmaci_frequenti`. Entrano nel blocco «contesto del medico» dei prompt ([[Catena/Contesto per medico]]).
- `pipeline-referti/conoscenza-agenti.json` — dalle pagine degli agenti ([[Agenti/Correttore]], [[Agenti/Arbitro]], [[Agenti/Omissioni]], [[Agenti/Terapia]], [[Agenti/Coerenza]]): «A cosa fare attenzione» → elenco ATTENZIONE, «Esempi» → ESEMPI con la risposta giusta. Entrano nel prompt dell'agente (`conoscenza_agente()` in pipeline.py), prima della richiesta del JSON.

Il file compilato fa parte dell'impronta del prompt (`versione_catena`): cambi una pagina, cambia la versione, e il cruscotto Qualità AI confronta prima e dopo. `REFERTI_CONOSCENZA=0` spegne l'iniezione senza toccare le pagine.

## Regole per scrivere queste pagine
- **Solo esempi finti.** Mai frasi prese da referti veri, mai nomi. Un esempio è una frase plausibile inventata con la risposta giusta.
- **Corte.** Ogni riga costa gettoni a ogni chiamata e sul modello locale anche secondi. Tre o quattro esempi per agente, tre o quattro attenzioni.
- **Le sezioni compilate hanno un formato fisso** (vedi le pagine): `## A cosa fare attenzione` con elenco puntato; `## Esempi` con sottotitoli `### …`, una riga `Dato:` e una riga `Risposta giusta:`. Le altre sezioni sono per le persone e non vengono compilate.
- **Ogni cambiamento si misura** con il banco dell'agente ([[Misure/Banchi]]). Se peggiora, si toglie la riga, non si spegne il sistema.
- Le regole del prompt (che cosa può e non può fare l'agente) restano nel codice: qui stanno i dati e gli esempi.

## Da dove arrivano le proposte
Il cruscotto Qualità AI propone materiale per queste pagine, sempre da confermare a mano: «Frasi che il medico ripete» (frasi uguali in almeno tre lettere confermate → sezione «Frasi fisse» del medico) e «Che cosa insegnano le correzioni» (voci di dizionario). «Quale tappa aiuta davvero» dice, sui referti veri, se una tappa avvicina o allontana dal testo firmato: è lì che si vede se un esempio nuovo è servito.

## Perché così e non un recupero automatico (RAG)
Gli agenti della catena fanno una chiamata sola su un compito stretto. Ricevere pagine intere o pezzi recuperati per somiglianza porta rumore e costa; ricevere pochi esempi scelti e i dati del medico è ciò che, misurato, aiuta. Il recupero dinamico resta una prova possibile con un banco, non l'impostazione di serie.
