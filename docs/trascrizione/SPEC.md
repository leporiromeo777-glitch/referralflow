# SPEC.md — Pipeline locale di trascrizione referti cardiologici

> **Revisione 2026-07-23.** Rispetto alla prima stesura: risolta la contraddizione tra
> §2.1 e il passo [11] (si sceglie la POST HTTPS a un endpoint dedicato, niente accesso
> diretto al database); corretta la cancellazione «sicura» (§2.3: su APFS/SSD la
> sovrascrittura non è una garanzia — il prerequisito è FileVault); le divergenze si
> conservano come frammenti testuali, non come posizioni numeriche (§3, §8); aggiunto
> il congelamento delle versioni (§4.1); esteso il vincolo sui log ai `.log` di
> `errori/` (§7.4); specificata la pulizia di `output/` e `archivio_temp/` (§5);
> aggiunta la sezione sul lato ReferralFlow da costruire (§8.1). I prompt di §6 sono
> invariati.

## 0. Come usare questo documento

Sei Claude Code. Questo file è la fonte di verità del progetto.

**Regole di lavoro:**
1. Implementa **una fase alla volta**, nell'ordine indicato in §9. Non anticipare fasi successive.
2. Al termine di ogni fase, fermati e chiedi conferma prima di procedere.
3. I prompt in §6 sono stati **validati manualmente su referti reali**. Non riscriverli, non "migliorarli", non parafrasarli. Copiali carattere per carattere.
4. Se una scelta tecnica contrasta con §2 (vincoli invalicabili), fermati e segnala invece di procedere.
5. Prima di scrivere codice per una fase, esponi in 5 righe cosa stai per fare e attendi l'ok.

---

## 1. Contesto e obiettivo

Un centro cardiologico in Ticino (Svizzera) riceve referti dettati a voce dal medico.
Oggi una persona riascolta l'audio e riscrive tutto a mano: circa 20 minuti per referto.

**Obiettivo:** ridurre quel lavoro a 3-5 minuti di sola revisione, producendo una bozza
di lettera già strutturata con i punti dubbi evidenziati.

**Obiettivo NON dichiarato ma reale:** il sistema non deve mai produrre un errore
clinico invisibile. Meglio dieci parole storpiate che un numero sbagliato ma plausibile.

Il sistema si integra con **ReferralFlow** (Next.js 14 + PostgreSQL), già esistente.
La parte descritta qui gira sul Mac mini dello studio; la parte di ricezione e revisione
delle bozze vive nel repo ReferralFlow (vedi §8.1) ed è un lavoro separato.

---

## 2. Vincoli invalicabili

Questi vincoli non sono negoziabili. Se una soluzione li viola, va scartata anche se
più semplice o più performante.

### 2.1 Nessun dato esce dalla macchina, con una sola eccezione
- Nessuna chiamata a API esterne: no OpenAI, no Anthropic, no Google, no servizi cloud
  di trascrizione, no servizi di traduzione, no telemetria.
- Tutto gira in locale su un Mac mini M4, 24 GB RAM, macOS.
- **L'unica connessione di rete ammessa è la POST HTTPS verso l'endpoint bozze di
  ReferralFlow** (§8.1), autenticata con token dedicato. ReferralFlow è ospitato in
  Svizzera: la trasmissione è conforme nLPD. Nessun'altra destinazione.
- **Niente accesso diretto al PostgreSQL di ReferralFlow.** Il recinto multi-studio,
  l'audit e la validazione stanno nel codice applicativo di ReferralFlow: una seconda
  applicazione che scrive nel database li aggirerebbe.
- Se serve una libreria che effettua chiamate di rete all'avvio, va disabilitata esplicitamente.

### 2.2 Nessun dato clinico nei log
- I log contengono solo: ID del file, timestamp, fase, esito (ok/errore), durata.
- **Mai** testo del referto, mai nomi, mai numeri clinici, mai porzioni di trascrizione.
- Questo vale anche per i messaggi di errore e per il debug: se serve loggare il contenuto
  di una variabile, logga la sua lunghezza, non il suo valore.
- **Vale anche per i traceback:** un'eccezione Python può portarsi dietro pezzi di
  trascrizione nel messaggio. Si logga il tipo dell'eccezione e la fase, mai
  `str(e)` grezzo.
- Nessun `print()` di comodo lasciato nel codice.

### 2.3 L'audio si cancella, ma solo al momento giusto
- L'audio va cancellato **solo dopo** che ReferralFlow ha confermato il salvataggio
  della bozza. Mai prima. Se una fase intermedia fallisce, l'audio resta.
- **Prerequisito: FileVault attivo sul Mac mini.** Su APFS con SSD la sovrascrittura
  del file non garantisce nulla (filesystem copy-on-write, wear leveling del
  controller): la protezione reale dei dati a riposo è la cifratura del disco.
  La pipeline verifica all'avvio che FileVault sia attivo (`fdesetup status`) e si
  rifiuta di partire altrimenti.
- La cancellazione è quindi un unlink normale. La sovrascrittura preventiva è ammessa
  come best effort, ma non va presentata né trattata come garanzia.
- Alla conferma del salvataggio si eliminano anche il JSON in `output/` e la copia in
  `archivio_temp/`: a regime, sul Mac mini non resta nulla del referto.
- **Eccezione dal 2026-08-23 (conserva per l'addestramento, approvata dall'utente —
  piano precisione, punto 8):** con `REFERTI_CONSERVA_AUDIO=1` (default) l'audio, a
  consegna confermata, NON viene cancellato ma spostato in `~/referti-dataset/audio/`
  (chmod 700, protetta da FileVault, mai sincronizzata fuori dal Mac). Serve a
  costruire le coppie audio + `testo_finale` (stesso `file_id` nel DB) per il futuro
  fine-tuning di whisper sulla voce del medico. `REFERTI_CONSERVA_AUDIO=0` ripristina
  la cancellazione. Il resto del paragrafo resta valido per tutti gli altri file.

### 2.4 Nessun numero viene mai corretto automaticamente
- Il sistema può **segnalare** un numero sospetto. Non può **cambiarlo**.
- Vale per l'AI, vale per il codice, vale per il dizionario.

### 2.5 Nessun campo viene salvato senza conferma umana
- Tutti i dati estratti arrivano in ReferralFlow come **bozza da confermare**.
- Nessuna scrittura diretta su record definitivi.

---

## 3. Architettura della pipeline

```
[1] cartella_ingresso/           file audio nuovo rilevato
         │
[2] preprocessing audio          rallenta (0.8) + passa-alto + denoise + normalizza → WAV 16kHz mono
         │
[3] trascrizione A               whisper.cpp large-v3, lingua it
         │
[4] trascrizione B               stessa cosa, parametri leggermente diversi
         │
[4b] anti-loop                   ripetizioni consecutive ridotte a una (deterministico), su A e B
         │
[5] dizionario                   sostituzioni deterministiche (correzioni.json), su A e B
         │
[5b] punteggiatura dettata       «virgola», «aperta parentesi», «punto»… → segni veri (deterministico), su A e B
         │
[6] confronto A/B                individua i punti dove divergono → lista DIVERGENZE
         │
[7] correzione LLM               gemma3:12b via Ollama, prompt §6.1
         │
[7b] pertinenza (evidenziatore)  LLM — frasi FUORI TEMA segnalate, mai rimosse: in pagina spente, decide la persona
         │
[7c] senso delle frasi           LLM — frasi storpiate segnalate, proposta di ricostruzione dal glossario (mai applicata da sola)
         │
[8] ispezione LLM                gemma3:12b, prompt §6.2 — SOLO ispezione, non modifica
         │
[9] estrazione campi             gemma3:12b, prompt §6.3 → JSON
         │
[10] controlli numerici          intervalli da correzioni.json → lista ALLARMI
         │
[11] salvataggio                 POST HTTPS all'endpoint bozze di ReferralFlow (§8.1)
         │
[12] cancellazione audio         solo se [11] ha avuto successo
```

**Nota sul passaggio 2:** rallentamento (atempo 0.8×, stessa voce — il medico
detta molto veloce) e riduzione del rumore (afftdn) validati il 2026-07-24 con
un confronto a quattro celle sul dettato di prova, usando il numero di
divergenze A/B come termometro: 65 senza nulla, 52 solo denoise, 70 solo
rallentamento, **23 con entrambi** — la combinazione è il default. Entrambi
configurabili (`REFERTI_ATEMPO`, 1.0 = spento; `REFERTI_DENOISE`, 0 = spento).
Ogni ritocco futuro al preprocessing va misurato allo stesso modo, mai a
orecchio. Il conteggio è riproducibile a parità di catena audio, ma piccole
perturbazioni del segnale lo spostano: confrontare solo corse sulla stessa
identica catena.

**VAD (aggiunto 2026-08, DA VALIDARE sul prossimo dettato col conteggio
divergenze):** rilevatore di voce Silero v5.1.2 incorporato in whisper.cpp
(`--vad`), attivo su ENTRAMBE le passate (così il confronto A/B resta
coerente) appena `modelli/ggml-silero-v5.1.2.bin` è presente (lo scarica
aggiorna.sh; spegnibile con `REFERTI_VAD=0`). Padding 120 ms
(`REFERTI_VAD_PAD_MS`) per non tagliare i bordi di parola. Scopo: dove c'è
silenzio whisper non trascrive — è l'antidoto principale alle frasi
allucinate nelle pause di riflessione del dettato.

**Nota sul passaggio 4b (anti-loop, aggiunto 2026-08-16):** whisper ogni tanto
«si incanta» e ripete la stessa frase o lo stesso gruppo di parole decine di
volte di fila (successo su un referto reale, anche con VAD attivo). È un
difetto meccanico e la cura è meccanica, NON un'AI che giudica cosa eliminare:
si riducono a una sola le ripetizioni consecutive IDENTICHE — frase intera da
3 ripetizioni in su; gruppo di 2-8 parole da 4 in su; parola singola da 6 in
su, e i gruppi di parole con cifre non si toccano mai (§2.4: «3 3» resta suo).
Gira su A e B prima del dizionario, così confronto e correzione lavorano sul
testo bonificato; i `.txt` grezzi restano su disco. Ogni intervento è
segnalato: nel log solo i conteggi (`fase=deloop rimosse_a/b`), in bozza la
frase tenuta entra in testa ai segmenti dubbi, così il revisore vede DOVE la
ripetizione è stata ridotta e può controllare l'audio in quel punto.

**Nota sul passaggio 3 (recupero anti-troncamento, aggiunto 2026-08-17):**
quando whisper «si incanta» in un loop, spesso la coda del dettato non viene
mai trascritta (caso reale: 35 s persi su 338). Dopo la trascrizione A si
confronta la durata del WAV con il tempo dell'ultima parola (dal JSON `-ojf`):
se manca una coda importante (soglie `REFERTI_TRONC_*`: audio ≥ 60 s, buco
≥ 20 s e ≥ 6%), si rifà UNA volta la passata con `-mc 0` — senza riporto di
contesto tra le finestre, il carburante dei loop; il prompt di vocabolario
con `-mc 0` non agisce, compensano dizionario e correzione — e si tiene la
corsa che copre più audio. Mai bloccante. ATTENZIONE: il flag «-nc» NON
esiste in whisper-cli 1.9.1 (stampa l'aiuto ed esce con codice 0).

**Nota sul passaggio 5b (punteggiatura dettata, aggiunto 2026-08-17, richiesto
dal medico):** i segni dettati a voce che whisper lascia scritti a parole
(«virgola», «aperta/chiusa parentesi», «due punti», «punto e virgola»,
«punto», «a capo», «trattino») diventano segni veri. Deterministico, NIENTE
AI — su un testo clinico una riscrittura libera può alterare il contenuto,
una sostituzione letterale no (stessa filosofia del passo 4b). «punto» da
solo è ambiguo e ha guardie su articoli e complementi («dal punto di vista»,
«a questo punto», «punto di repere» restano intatti). Gira su A e B dopo il
dizionario così il confronto lavora su testi coerenti; sistemazione degli
spazi e maiuscola dopo il punto solo dove la fase è intervenuta. Funzione
`punteggiatura_dettata` in `pipeline.py`, nel log solo il conteggio
(`fase=punteggiatura segni=N`).

**Nota sui passaggi 7b-7c (evidenziatore e senso, richiesti dal medico
2026-08-17):** i medici dettando a volte DIVAGANO — la fase «pertinenza»
segnala le frasi fuori tema (citazioni esatte; nel dubbio non segnala; se
volesse spegnere >35% del testo si ignora tutto) e la pagina di revisione le
mostra SPENTE: entra nel referto solo l'evidenziato, e la persona
accende/spegne ogni frase con un clic — l'AI non toglie MAI nulla da sola.
La fase «senso» controlla frase per frase l'italiano: le frasi storpiate
vengono segnalate con una proposta di ricostruzione basata sul GLOSSARIO
dello studio (lo stesso vocabolario dato a whisper); la proposta decade se
cambia anche un solo numero (§2.4) e non viene mai applicata da sola. Le
frasi già fuori tema non compaiono anche tra quelle da chiarire. Payload §8:
`divagazioni` (lista di citazioni) e `frasi_da_chiarire`
([{frase, proposta}]). Modelli per fase: `REFERTI_LLM_PERTINENZA` /
`REFERTI_LLM_SENSO` (default: REFERTI_LLM).

**Nota sui passaggi 3-4:** la doppia trascrizione serve a individuare i punti incerti.
Dove le due versioni divergono, quasi sempre c'è un problema audio. È un rilevatore di
dubbi, non un meccanismo di voto: **il sistema non sceglie mai quale versione è giusta**,
mostra entrambe all'utente.

**Nota sull'ordine [5]-[6]** (invertito rispetto alla prima stesura, 2026-07-24):
il dizionario si applica a ENTRAMBE le trascrizioni prima del confronto. Due ragioni,
scoperte in fase di collaudo: (a) le àncore delle divergenze vengono ritagliate dal
testo su cui si lavora da lì in poi — se il dizionario girasse dopo, un'àncora che
taglia a metà una frase del dizionario non combacerebbe più col testo corretto;
(b) un errore ricorrente corretto in modo identico in A e in B non è un dubbio da
mostrare al revisore, è rumore. I numeri non ne risentono: il dizionario non li
tocca mai (§2.4), quindi ogni divergenza numerica sopravvive intatta.

**Nota sulle divergenze:** il testo viene modificato dalla correzione LLM [7] dopo
il confronto: qualsiasi posizione numerica (offset, numero di riga) calcolata al
passo [6] non punta più al punto giusto nel testo finale. Le divergenze si
conservano quindi come **frammenti testuali con qualche parola di contesto attorno**
(`contesto`, `versione_a`, `versione_b`), mai come offset.
L'interfaccia di revisione le ritrova nel testo corretto cercando il frammento;
se un'àncora non si ritrova più (perché la correzione l'ha toccata), la divergenza
si mostra comunque in lista, senza evidenziazione nel testo. Non si scarta mai.

---

## 4. Stack tecnico

| Componente | Scelta | Note |
|---|---|---|
| Linguaggio | Python 3.11+ | |
| Trascrizione | `whisper.cpp` con modello `ggml-large-v3` | binario locale, no pip whisper (troppo lento su Metal) |
| LLM | Ollama, modello `gemma3:12b` | API locale su `http://localhost:11434` |
| Audio | `ffmpeg` via subprocess | per normalizzazione e conversione |
| Watcher | scansione periodica (stdlib) | ogni 15 s; scelta rivista, vedi nota |
| Avvio automatico | `launchd` (plist) | **non** nohup, **non** screen |
| Config | `correzioni.json` | non hardcodare le sostituzioni; **il file va fornito prima della Fase 4** — senza, le fasi 4 e 10 non sono implementabili |

**Nota sul watcher** (scelta rivista in Fase 7, 2026-07-24): al posto della
libreria `watchdog` si usa un ciclo di scansione in puro Python: zero dipendenze
da installare, gestione naturale dei file ancora in copia (si elabora solo
quando la dimensione è stabile tra due giri), e la latenza di qualche secondo è
irrilevante per un processo notturno. Un file che fallisce va in `errori/` col
suo `.log` accanto e la coda prosegue; sotto i 500 MB liberi il servizio si
ferma e segnala (§7.2).

**Non usare:** LangChain, LlamaIndex, o qualsiasi framework di orchestrazione.
Il flusso è lineare e va scritto esplicitamente. Un framework qui aggiunge solo
superficie d'attacco e dipendenze di rete.

### 4.1 Versioni congelate

Il comportamento dei prompt di §6 è stato validato su versioni precise dei modelli.
Un aggiornamento silenzioso del modello invalida la validazione.

- Al momento dell'installazione si annotano in un file `VERSIONI.md` accanto al codice:
  commit/tag di whisper.cpp, checksum del file `ggml-large-v3`, versione di Ollama,
  digest esatto del modello `gemma3:12b` (`ollama show`), versione di ffmpeg e di Python.
- La pipeline all'avvio verifica che il digest del modello Ollama corrisponda a quello
  annotato; se non corrisponde, si ferma e segnala.
- Aggiornare un componente è permesso **solo** ripetendo prima i test manuali dei
  prompt (§6) sulla nuova versione e aggiornando `VERSIONI.md`.

---

## 5. Struttura delle cartelle

```
~/referti/
  ingresso/          audio in attesa (il medico deposita qui)
  lavorazione/       file in corso di elaborazione (spostato qui all'inizio)
  errori/            file la cui elaborazione è fallita, con .log accanto
  archivio_temp/     audio processati in attesa di conferma salvataggio
  output/            JSON prodotti, in attesa di invio a ReferralFlow
```

Permessi: solo l'utente proprietario. `chmod 700` su tutte.

`output/` e `archivio_temp/` non sono archivi: contengono dati clinici (nomi, valori)
e si svuotano alla conferma del salvataggio in ReferralFlow (§2.3). Se un JSON resta
in `output/` perché ReferralFlow non è raggiungibile, resta lì solo finché il ciclo
successivo non riesce a inviarlo.

---

## 6. I prompt (NON MODIFICARE)

Questi tre prompt sono stati testati manualmente su referti cardiologici reali.
Il loro comportamento è noto e documentato. Copiali esattamente.

### 6.1 — Correzione

```
Sei un correttore di trascrizioni mediche in italiano. Il testo qui sotto è un referto cardiologico dettato a voce e trascritto automaticamente, quindi contiene errori di riconoscimento.

Correggi SOLO:
- termini medici e anatomici evidentemente storpiati
- nomi di farmaci
- refusi grammaticali che nascono dalla trascrizione

NON modificare MAI:
- numeri, dosaggi, misure, percentuali, date
- anche se un numero ti sembra implausibile, lascialo com'è
- non togliere e non aggiungere MAI un numero: ogni numero del testo deve ricomparire identico nella tua risposta, lo stesso numero di volte, anche se sembra ripetuto, fuori posto o dentro un segmento incomprensibile

Regole obbligatorie:
1. Se un segmento è incomprensibile, lascialo esattamente com'è. Non inventare cosa poteva essere.
2. Se un termine è ambiguo e potresti sbagliare, lascialo com'è.
3. Distingui sempre aorta ascendente e discendente: se il testo è incoerente su questo punto, non scegliere tu, lascia com'è.
4. Mantieni le istruzioni di dettatura ("scrivi", "fai così", "riportami...") esattamente dove sono, senza eseguirle e senza rimuoverle.
5. Non aggiungere, non riassumere, non riorganizzare. Non aggiungere frasi di cortesia o conclusioni.

Restituisci solo il testo corretto, senza commenti.

TESTO:
{testo}
```

**Comportamento noto:** il modello è conservativo. Corregge poco ma corregge giusto.
Tende a ignorare le richieste di annotazione (per questo l'ispezione è separata, §6.2).
Occasionalmente rimuove un'istruzione di dettatura nonostante la regola 4 — accettabile.
Deduplica i numeri ripetuti («3 3» → «3») nonostante il divieto — tranne con
l'ultima riga del blocco «NON modificare MAI» (il rinforzo sui numeri): testata
in palestra il 2026-07-24 su gemma3:12b (nessun effetto, allora non adottata),
ri-misurata il 2026-08-16 sul confronto a tre modelli — neutra su gemma3:12b e
mistral-small3.2, ma con gemma3:27b porta i numeri intatti a 8/8, unico esito
pieno mai registrato — e quindi ADOTTATA (è innocua dove non aiuta). In
`palestra.py` la «variante» è ora il prompt storico senza rinforzo, come
controllo di regressione.
La protezione sta nel codice: la correzione con firma numerica alterata viene
scartata; il ripiego riprova con lo STESSO prompt blocco per blocco, tenendo i
blocchi coi numeri intatti e lasciando originali gli altri. Ogni futura modifica
al prompt o al modello ripassa dalla palestra prima di entrare in servizio.

### 6.1b — Correzione «a lista di riparazioni» (metodo di prima scelta dal 2026-08-21)

Idea dell'utente: il modello NON riscrive il testo — elenca solo gli scambi
«parola storpiata → forma corretta» in JSON (`{"riparazioni": [{"da": …,
"a": …}]}`, prompt `PROMPT_CORREZIONE_LISTA` in pipeline.py) e il CODICE li
applica come fa col dizionario. Motivi (referto reale del 2026-08-21):
la riscrittura integrale è lenta (produce l'intero testo) e può INTRODURRE
errori («diselettroliemia» riscritta «disidratazione», «ECG» diventato «reg»).
Guardie nel codice, ogni coppia proposta viene RIFIUTATA se: contiene cifre
(numeri intoccabili per costruzione); "da" non è citazione esatta nel testo;
"a" non SOMIGLIA a "da" per distanza di battitura (≤34% della lunghezza —
respinge «serrada → severa»; eccezione sigle corte maiuscole, «reg → ECG»);
introduce una «/» (unità di misura); allunga di oltre 2 parole. Collaudo:
su 46 proposte di medgemma:27b ne passano 3, tutte giuste, numeri 8/8.
Selettore `REFERTI_CORREZIONE_METODO` = `lista` (default) | `riscrittura`;
se la lista non è utilizzabile (JSON rotto, modello muto) si ripiega da soli
sulla riscrittura §6.1, che resta la rete di sicurezza.

### 6.1h — Correzione esterna anonimizzata (2026-08-26, SPENTA di default)

Idea dell'utente: il testo ANONIMIZZATO va a un modello di punta esterno
(API Anthropic, `REFERTI_LLM_ESTERNO`, default claude-opus-5) che rimanda
SOLO la lista di riparazioni (stesso `PROMPT_CORREZIONE_LISTA` di §6.1b);
il codice la applica al testo ORIGINALE con le STESSE guardie del percorso
locale (`_applica_lista`, condivisa). Anonimizzazione prima dell'invio
(`_anonimizza_per_esterno` + `PROMPT_DATI_PERSONALI`): l'AI LOCALE individua
i dati identificativi, il CODICE li sostituisce («Persona N», «[data N]»,
«[dato rimosso]», comprese le singole parole ≥4 lettere dei nomi composti)
più la rete regex (AVS, email, telefoni CH, date). CONTROPROVA BLOCCANTE in
due tempi: il codice verifica che nessun dato trovato sia sopravvissuto, poi
una seconda passata AI sul testo anonimizzato — un nome vero ancora presente
(verificato dal codice) annulla l'invio. Le coppie di ritorno che citano un
segnaposto cadono da sole (contengono cifre → guardia della regola d'oro):
nessuna ri-sostituzione, i nomi veri non escono mai dal Mac. Ogni intoppo
(anonimizzazione incerta, API muta, JSON rotto) → ripiego silenzioso sulla
catena locale §6.1b: il referto esce comunque. DOPPIO interruttore:
`REFERTI_CORREZIONE_ESTERNA=1` **e** `ANTHROPIC_API_KEY` nel plist del
servizio. TRASPORTO MANUALE per il collaudo (senza chiave API): se esiste
`~/referti/scambio-esterno/ATTIVO` (controllato a ogni referto, niente
riavvii), il testo anonimizzato viene scritto lì come `<file_id>.anon.txt`
e la pipeline attende `<file_id>.lista.json` (stesso formato §6.1b) fino a
`REFERTI_SCAMBIO_ATTESA` secondi (default 900); poi ripiego locale. Stessa
anonimizzazione, stessa controprova, stesse guardie del percorso API; i
file di scambio vengono sempre ripuliti. NON accendere prima della validazione legale (stessa di Stripe e
della cattura impegnativa: DPA col fornitore + informativa) — finché sul Mac
esiste il testo originale, quello inviato è pseudonimizzato, non anonimo in
senso stretto. Ripristino della catena locale pura: tag git
`catena-locale-v1` + copia `~/referti-pipeline/pipeline.py.catena-locale`
(ma basta lasciare l'interruttore spento: il percorso esterno non parte).

### 6.1d — Aggancio fonetico al glossario (2026-08-23, piano precisione punto 3)

Due meccanismi in `pipeline.py`, entrambi deterministici:
1. `riparazioni_glossario` (dopo il dizionario, prima della punteggiatura):
   una parola del dettato minuscola ≥7 lettere, assente dal glossario ma con
   la stessa **chiave fonetica italiana** di una voce del glossario (o a
   distanza di battitura ≤1/≤2), viene riparata SENZA AI. Guardie: candidato
   unico, mai parole con iniziale maiuscola (nomi propri), mai coppie che
   differiscono solo per le vocali finali (flessioni: «pressoria/pressorio»).
2. `_chiave_fonetica` come rilassatore di `_riparazione_plausibile`: una
   coppia proposta dall'AI che suona identica (b/p, d/t, g/k, v/f, doppie,
   h) è plausibile anche se per lettere è lontana.
Il vocabolario è stato arricchito (2026-08-23) con ~40 termini soggetti a
storpiatura: quelle voci alimentano sia il prompt whisper sia l'aggancio.
Preprocessing: il denoise RESTA ACCESO. Storia della decisione (2026-08-23):
il banco sintetico lo dava dannoso (WER 26.5%→23.6% senza), ma l'autopsia su
un dettato VERO del DPM 7200 ha ribaltato il verdetto — senza denoise whisper
va in loop catastrofico (416 frasi-copia su 441, testo utile 3.9k car contro
9.7k). Le voci sintetiche sono troppo pulite per decidere sul preprocessing:
ogni futura modifica va misurata su audio veri dalla cassaforte.

### 6.1g — Addestramento su misura di whisper (piano precisione punto 8: predisposto)

La cassaforte (`~/referti-dataset/`, §2.3) accumula gli audio consegnati;
`prepara-dataset.py` li accoppia con `testo_finale` delle bozze confermate e
scrive `coppie/manifest.jsonl` con le ore raccolte. Procedura quando ci sono
≥5 ore (meglio 10–20): (1) eseguire prepara-dataset.py; (2) LoRA su whisper
large-v3 con transformers+PEFT su GPU a noleggio — riferimento
github.com/Vaibhavs10/fast-whisper-finetuning — usando il manifest (i dati
NON si caricano su servizi terzi: GPU a noleggio = macchina propria affittata,
disco cifrato, cancellazione a fine corsa; in alternativa attendere un Mac
più carrozzato); (3) merge_and_unload → convert-h5-to-ggml.py di whisper.cpp;
(4) il nuovo ggml si valuta con `banco-audio.py --modello=<ggml>` sul set
d'oro sintetico E su un campione del manifest: sostituisce large-v3 solo se
vince su WER, termini critici e numeri. Nota 2026-08-23: il checkpoint
pubblico medwhisper-large-v3-ita è stato provato e BOCCIATO sul nostro banco
(WER 28.5% vs 23.6%, termini 63/108 vs 70/108, numeri 97/108 vs 105/108).

### 6.1f — Avvocato del diavolo (2026-08-23, piano precisione punto 6)

Dopo la fase «senso», un passaggio SEPARATO dal generatore (ispirato alla
claim-verification di Abridge) rilegge la bozza contro il dettato grezzo
(`avvocato_diavolo`, prompt `PROMPT_AVVOCATO`, modello di ispezione) ed
elenca le frasi non supportate col motivo. Non riscrive nulla: il codice
tiene solo le citazioni esatte presenti in bozza (max 20), scarta quelle già
segnalate come divagazioni, e ogni errore rende la fase un no-op. Nel
payload: `frasi_non_supportate` [{frase, motivo}] e `testo_grezzo` (la
trascrizione della passata A dopo fantasmi/deloop, prima del dizionario).
La pagina Referti: puntinata rossa + motivo sulla frase, riquadro riassuntivo,
e riquadro a scomparsa «Dettato originale» per il confronto a mano.
Fase notificata come `avvocato` (aggiunta con `pertinenza` e `senso` alla
whitelist dell'endpoint fase — prima quelle due venivano rifiutate in
silenzio e l'avanzamento in pagina le saltava).
Taratura 2026-08-26 (referto reale: 5 cartellini su 7 erano le riparazioni
appena applicate, risegnalate perché «non nel dettato»): la catena tiene il
registro `RIPARAZIONI_APPLICATE` (lista AI locale/esterna + dizionario
fonetico, azzerato a inizio corsa) e l'avvocato tace se la frase, riportata
alla forma pre-riparazione, esiste nel grezzo — l'unica differenza è una
correzione voluta, già passata dalle guardie. Le invenzioni vere restano
segnalate. Stessa data, pertinenza: `TERMINI_CLINICI_RE` — una frase con un
termine clinico forte (fibrillazione, dispnea, valvol-, «condizioni
generali»…) non parte mai spenta d'ufficio (log `salvate_cliniche`), come
già per le cifre: il dettato a frammenti brevi fa sembrare chiacchiere anche
il contenuto clinico.

### 6.1e — Arbitro delle divergenze (2026-08-23, piano precisione punto 5)

Dove le due passate di whisper divergono, `arbitra_divergenze` (dopo il
confronto, prima della correzione AI) mostra al modello ENTRAMBE le versioni
col contesto e gli fa scegliere («a», «b» o «incerto» — prompt
`PROMPT_ARBITRO`). Il codice applica solo le scelte «b» e solo se: le due
versioni hanno gli stessi numeri (altrimenti il punto è escluso a priori),
il segmento è ≤80 caratteri ed è unico nel testo. Le divergenze restano
comunque nella bozza: la scelta dell'arbitro è visibile e revocabile dalla
persona. Risposta JSON rotta → nessun cambio. È la versione in miniatura
della «generative error correction» su liste N-best (HyPoradise, NeurIPS
2023), con le nostre due ipotesi beam/greedy.

### 6.1c — Frasi fantasma (2026-08-23)

Whisper, sul silenzio o sul rumore, inventa frasi che un medico non detta mai
(«Sottotitoli a cura di…», «Grazie per aver guardato», riferimenti a siti web):
allucinazioni note del modello in italiano (arXiv 2501.11378). La funzione
`togli_frasi_fantasma` (lista `FRASI_FANTASMA` in pipeline.py) le rimuove su
entrambe le passate PRIMA del deloop; conteggio nei log (`fantasmi_a/b`). Le
soglie anti-allucinazione di whisper-cli (`--entropy-thold 2.40`,
`--logprob-thold -1.00`, fallback di temperatura) sono attive di default: non
passare mai `-nf`/`--no-fallback`.

Strumento di misura collegato: `banco-audio.py` (stessa cartella) — WER,
richiamo dei termini critici e numeri ritrovati su un set di coppie
`NN.wav`+`NN.txt` con testo d'oro (set sintetico in
`~/referti-dataset/banco-sintetico/`). Ogni modifica a preprocessing, flag di
whisper o modello passa da lì prima di entrare in servizio.

### 6.2 — Ispezione (compito separato, non modifica nulla)

```
Leggi il testo qui sotto ed elenca i segmenti che risultano incomprensibili o privi di senso medico.

NON correggere nulla. NON riscrivere il testo. NON proporre alternative.

Restituisci solo un elenco puntato dei segmenti problematici, citandoli testualmente.
Se non ce ne sono, scrivi esattamente: nessuno

TESTO:
{testo}
```

**Motivo della separazione:** un modello 12B non riesce a trasformare e annotare
contemporaneamente. Diviso in due compiti, li esegue entrambi correttamente.

### 6.3 — Estrazione campi

```
Leggi il referral qui sotto ed estrai i dati. Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, senza backtick.

Chiavi richieste:
- nome_paziente
- data_nascita
- medico_inviante
- medico_destinatario
- motivo_clinico (la ragione clinica, non la formula di cortesia)
- esami_richiesti
- fattori_rischio
- urgenza_testuale (le parole esatte del testo, senza interpretarle)
- valori_numerici (oggetto con i valori clinici trovati e la loro unità)

Se un dato non è presente, il valore deve essere esattamente: "non indicato"

Non dedurre, non inferire, non completare. Se non c'è, non c'è.

TESTO:
{testo}
```

**Comportamento validato:** 5 test su 5 superati, inclusi i casi con dato mancante,
due medici citati nello stesso testo, e date ambigue. Usa la modalità `format: json`
di Ollama per garantire l'output pulito.

### 6.4 — Segretaria (separa le istruzioni dal referto) — aggiunta 2026-08

Nuova fase tra correzione (6.1) e ispezione (6.2): il medico, dettando, a volte
si rivolge alla segreteria («allegami la vecchia email», «mandane copia al
curante»). Questa fase individua quelle frasi e le sposta in
`note_segreteria` nel payload (§8); il corpo del referto resta senza.

Il prompt è `PROMPT_SEGRETERIA` in `pipeline.py`: chiede SOLO citazioni
testuali, in JSON `{"per_segreteria": [...]}`, con la regola «nel dubbio non
segnalare». Le difese sono NEL CODICE, non nel prompt (`_applica_note_segreteria`):

- una frase è spostata solo se è una **citazione esatta** del testo
  (≥ 8 caratteri, prima occorrenza, senza sovrapposizioni);
- se il referto rimanente scenderebbe sotto il 40% del testo (o sotto le
  poche parole), **si tiene tutto**: un'AI che vuole togliere mezzo referto
  sta sbagliando;
- JSON non valido o citazioni non trovate → testo intatto, zero note.

Le note NON vengono mai eseguite dalla pipeline: compaiono in ReferralFlow
nel dettaglio della bozza («Note per la segreteria»), testuali, e la persona
decide. L'ispezione (6.2) lavora sul testo già ripulito. Nel log solo i
conteggi (`note=N scartate=M`). Questa sezione segue le stesse regole di
§6: il prompt non si ritocca senza rimisurare su dettati reali.

**Revisione 2 (misurata sul primo dettato reale, 2026-08-13):** la prima
versione del prompt scambiava la dettatura di una lettera per un'istruzione
alla segreteria — dopo «scrivi:» il medico dettava «caro collega…» e la
frase veniva spostata nelle note. Aggiunta al prompt la «distinzione
fondamentale»: i comandi di dettatura (scrivi/scriva/metti/riporta/vai a
capo) introducono testo che FA PARTE del referto, e le formule di lettera
(Caro collega, Cordiali saluti…) non si segnalano mai. Coerente con la
regola 4 di §6.1 (le istruzioni di dettatura si conservano). Da riverificare
sullo stesso dettato dopo l'aggiornamento.

**Revisione 3 (richiesta dal medico dal vivo, 2026-08-17):** sui dettati
reali la fase mancava molti compiti perché la revisione 2 aveva insegnato
che «scrivi» è SEMPRE dettatura. Aggiunta al prompt la controdistinzione:
gli stessi verbi («scrivi», «riprendi», …) sono un compito per la segreteria
quando l'azione è rivolta a una persona esterna o a un ALTRO documento
(«scrivi al dottor Rossi che…», «riprendi la lettera precedente»), mentre
«scrivi:» seguito dal testo dettato resta referto. Le difese nel codice
(citazione esatta, soglia 40%, nel dubbio non segnalare) sono invariate.
Da rimisurare sui prossimi dettati reali.

**Revisione 4 (stessa notte, misurata su un dettato reale anonimizzato
fornito dal medico):** la rev. 3 da sola trovava ancora 0 note su quel
dettato. Aggiunta la terza categoria: le istruzioni di CONFEZIONE del
documento — a chi va indirizzata/intestata la lettera («detto la lettera
all'indirizzo della dottoressa X, in intestazione a Y, scrivi»), dove
collocare un pezzo di testo («nell'anamnesi scrivi da qualche parte…»),
chi firma. Esito misurato: apertura → nota (il corpo parte da «Gentile
collega»); istruzione di inserimento in anamnesi → nota INSIEME al testo
da inserire (utile a chi rivede: dice cosa e dove, il testo non va perso
perché resta visibile nella nota); la firma storpiata («qui è il referto
X») ancora sfugge — nel flusso vero la segretaria lavora sul testo già
corretto, da riverificare lì.

**Correzione (secondo dettato reale, 2026-08-13):** l'estrazione campi (6.3)
e i controlli numerici leggono il testo **integrale di prima della
segretaria**, non il corpo ripulito. Motivo osservato dal vivo: il nome del
paziente spesso è dettato solo nell'apertura rivolta alla segreteria
(«Detto la lettera … in merito al signor X e scrivi»), che questa fase toglie
dal corpo — estraendo dal testo pulito il nome andava perso e la bozza
restava senza titolo. Nessun prompt è cambiato: cambia solo quale testo
vede l'estrazione. L'ispezione (6.2) continua a lavorare sul testo ripulito.

---

## 7. Gestione errori


**Revisione 5 (2026-08-23, dopo il primo referto reale):** il prompt ora è
costruito sulla «prova del destinatario» (ogni frase: è rivolta al collega o
a chi prepara la lettera?) con cinque categorie esplicite ed esempi reali:
saluti/convenevoli, domande alla segreteria, istruzioni di lavorazione,
regia della dettatura e autocorrezioni («scusami, ripeto», «aspettami»,
«faccio io il…»), commenti organizzativi. In più una regola d'oro è passata
NEL CODICE (`_applica_note_segreteria`): una frase citata che contiene cifre
non lascia mai il referto, qualunque cosa dica il modello — visto dal vivo
il modello segnalare «Scusami, ripeto, 108 su 70» (avrebbe portato via il
valore ripetuto).

### 7.1 Principio
**Un file che fallisce non deve mai bloccare la coda.** Si sposta in `errori/`, si scrive
un log accanto, si passa al successivo.

### 7.2 Casi da gestire esplicitamente
- Ollama non risponde → riprova 3 volte con backoff, poi `errori/`
- whisper.cpp esce con codice != 0 → `errori/`
- Il JSON prodotto dal modello non è parsabile → riprova 1 volta, poi `errori/`
- ReferralFlow non raggiungibile → il JSON resta in `output/`, riprova al ciclo successivo.
  **L'audio NON si cancella.**
- File audio corrotto o formato non supportato → `errori/`
- Disco pieno → ferma tutto e segnala, non tentare di procedere

### 7.3 Timeout
Ogni chiamata a Ollama ha timeout di 300 secondi. Un referto lungo su un 12B può
richiedere minuti: è accettabile, il processo gira di notte.

### 7.4 I log di `errori/` sottostanno a §2.2
Il `.log` scritto accanto a un file fallito contiene solo: fase in cui è fallito,
tipo dell'errore (es. `TimeoutError`, `returncode 1`), tentativi effettuati, timestamp.
**Mai il traceback grezzo, mai stdout/stderr di whisper.cpp o di Ollama** (possono
contenere trascrizione). Chi diagnostica riparte dal file audio, che è ancora lì.

---

## 8. Output atteso

Il JSON finale inviato a ReferralFlow contiene:

```json
{
  "file_id": "...",
  "timestamp": "...",
  "testo_corretto": "...",
  "campi_estratti": { ... },
  "divergenze": [
    { "contesto": "...", "versione_a": "...", "versione_b": "..." }
  ],
  "segmenti_dubbi": [ "..." ],
  "allarmi_numerici": [
    { "campo": "frequenza_cardiaca", "valore": 160, "intervallo": "35-180", "stato": "limite" }
  ],
  "parole": [ ["Ecocardiogramma", 0.42], ["transtoracico.", 1.31] ],
  "avvisi": [ "Possibile dettato incompleto: …" ],
  "richiede_revisione": true
}
```

`contesto` è il frammento testuale con qualche parola attorno al punto di divergenza
(vedi la nota in §3), non una posizione numerica.

`parole` (aggiunta 2026-08): il tempo d'inizio in secondi di OGNI parola di
`testo_corretto` (stesso split sugli spazi), per il testo sincronizzato con
l'audio nella pagina di revisione. Nasce dal JSON completo della passata A
(`-ojf`, stessi risultati di trascrizione: cambia solo l'output in più) e da un
allineamento deterministico con `difflib` (`allinea_parole`): le parole cambiate
da dizionario/correzione/segretaria ereditano un tempo interpolato dai vicini.
Se combacia meno di metà del testo la lista resta vuota — meglio niente che
tempi sbagliati — e la pagina mostra il testo semplice. Mai bloccante: qualsiasi
errore in questa fase produce `parole: []` e nel log solo `fase=tempi`.

`avvisi` (aggiunta 2026-08-16): frasi già pronte per chi rivede, MAI contenuti
clinici. Oggi c'è un solo mittente, la **sentinella di troncamento**: se l'audio
dura ≥2 minuti e l'ultima parola trascritta lascia scoperti ≥60 secondi E ≥15%
della durata (dal WAV e dai tempi della passata A), la bozza arriva con
«Possibile dettato incompleto…» — è il caso del loop che si mangia la coda del
dettato, visto su un referto reale il 2026-08-16. La pagina di revisione lo
mostra in un riquadro rosso in cima (`.avviso-box`). Solo segnalazione, mai
blocco; il calcolo è facoltativo e mai bloccante (log `fase=copertura`). La
coda silenziosa a fine registrazione può dare un falso allarme: va bene così,
il revisore riascolta la fine e conferma.

`richiede_revisione` è **sempre true**. Non esiste un percorso in cui un referto
venga considerato pronto senza passare da un umano.

### 8.1 Lato ReferralFlow (COSTRUITO — repo ReferralFlow, migrazione 019)

Questa parte esiste nel repo ReferralFlow. Com'è fatta, e cosa deve fare la pipeline:

- **Endpoint**: `POST /api/referti/bozza` con header `Authorization: Bearer <token>`.
  Il token si genera dall'admin dello studio in *Impostazioni → Dati dello studio →
  Trascrizione referti*: viene mostrato **una volta sola** (sul server resta solo
  l'hash sha256) e va copiato subito nella configurazione della pipeline sul Mac
  mini. Rigenerarlo invalida il precedente.
- **Risposte**: `201` = bozza scritta; `200` con `duplicato: true` = quel `file_id`
  era già stato consegnato (retry). **Entrambe autorizzano il passo [12]**; qualsiasi
  altra risposta no: il JSON resta in `output/` e l'audio non si cancella. Il corpo
  deve avere `richiede_revisione: true`, altrimenti `400`.
- **Idempotenza**: la coppia (studio, `file_id`) è univoca — reinviare non duplica.
- **Revisione**: le bozze arrivano nella pagina «Bozze di referto» (`/referti`)
  dell'area interna: testo con divergenze e segmenti dubbi evidenziati (ricerca del
  frammento `contesto`), allarmi numerici, campi estratti correggibili, conferma o
  scarto. Il payload della pipeline resta salvato intatto; le correzioni umane
  finiscono in campi separati (§2.5: nessun dato diventa definitivo da solo).

---

## 9. Ordine di implementazione

Implementa in quest'ordine, fermandoti dopo ognuna.

**Fase 1** — Script che prende un file audio da riga di comando, applica il
preprocessing ffmpeg, e salva il WAV pulito. Nient'altro.

**Fase 2** — Aggiungi la trascrizione con whisper.cpp. Input: file audio.
Output: file di testo. Verificare manualmente su un referto reale.

**Fase 3** — Aggiungi doppia trascrizione e confronto. Output: testo + lista divergenze
(come frammenti con contesto, §3).

**Fase 4** — Aggiungi il dizionario da `correzioni.json`. **Prerequisito: il file
`correzioni.json` deve essere stato fornito.**

**Fase 5** — Aggiungi la correzione LLM (§6.1) e l'ispezione (§6.2).

**Fase 6** — Aggiungi l'estrazione campi (§6.3) e i controlli numerici.

**Fase 7** — Aggiungi il watcher della cartella e la gestione errori completa.

**Fase 8** — Aggiungi l'invio all'endpoint bozze di ReferralFlow e la cancellazione
condizionata dell'audio. **Prerequisito: l'endpoint §8.1 deve esistere in produzione.**

**Fase 9** — Scrivi il plist launchd per l'avvio automatico all'accensione.

Dopo ogni fase: test manuale su un file reale prima di procedere.

---

## 10. Cosa NON fare

- La revisione CLINICA e la conferma dei referti restano in ReferralFlow —
  su questo niente eccezioni. È invece ammesso (revisione 2026-07-24, su
  richiesta dello studio) il **pannello locale** `pannello.py`: strumento
  d'esercizio per coda, errori, dizionario e anteprima delle bozze non
  ancora inviate (audio compreso). Ascolta SOLO su 127.0.0.1: non è
  raggiungibile dalla rete e nessun contenuto lascia la macchina. Le voci
  di dizionario dello studio vivono in `correzioni-locali.json` (mai
  toccato dagli aggiornamenti; a parità di chiave vince sul repo) e il
  servizio le ricarica a ogni giro.
- Non aggiungere un database locale. Lo stato sta nelle cartelle.
- Non aggiungere autenticazione, code di messaggi, Docker, o microservizi.
- Non aprire una connessione diretta al PostgreSQL di ReferralFlow.
- Non "migliorare" i prompt di §6.
- Non implementare un meccanismo di voto tra le due trascrizioni.
- Non aggiungere retry infiniti: 3 tentativi e poi `errori/`.
- Non usare `print()` per il debug. Usa il logger, che è già vincolato da §2.2.
- Non scrivere test che usano referti reali come fixture. Genera testi finti.

---

## 11. Nota finale

Questo sistema produce **bozze**, non referti. Ogni sua uscita passa da un medico
prima di esistere davvero. Progettalo di conseguenza: preferisci sempre segnalare
un dubbio in più piuttosto che risolverlo da solo.

Se in qualsiasi punto ti trovi a pensare "qui posso dedurre cosa intendeva",
la risposta corretta è: non dedurre, segnala.
