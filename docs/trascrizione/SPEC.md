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
[2] preprocessing audio          rallenta (atempo 0.8) + normalizza + passa-alto → WAV 16kHz mono
         │
[3] trascrizione A               whisper.cpp large-v3, lingua it
         │
[4] trascrizione B               stessa cosa, parametri leggermente diversi
         │
[5] confronto A/B                individua i punti dove divergono → lista DIVERGENZE
         │
[6] dizionario                   sostituzioni deterministiche (correzioni.json)
         │
[7] correzione LLM               gemma3:12b via Ollama, prompt §6.1
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

**Nota sul passaggio 2:** il rallentamento (tempo 0.8×, stessa voce) è stato
validato empiricamente il 2026-07-24 sul dettato di prova: il medico detta molto
veloce e riportare il parlato verso una velocità normale ha ridotto le divergenze
A/B da 65 a 42. Configurabile (`REFERTI_ATEMPO`, 1.0 = spento); se il numero di
divergenze è il termometro, ogni ritocco futuro va misurato allo stesso modo.

**Nota sui passaggi 3-4:** la doppia trascrizione serve a individuare i punti incerti.
Dove le due versioni divergono, quasi sempre c'è un problema audio. È un rilevatore di
dubbi, non un meccanismo di voto: **il sistema non sceglie mai quale versione è giusta**,
mostra entrambe all'utente.

**Nota sulle divergenze:** il confronto avviene al passo [5], ma il testo viene poi
modificato dal dizionario [6] e dalla correzione LLM [7]: qualsiasi posizione numerica
(offset, numero di riga) calcolata al passo [5] non punta più al punto giusto nel testo
finale. Le divergenze si conservano quindi come **frammenti testuali con qualche parola
di contesto attorno** (`contesto`, `versione_a`, `versione_b`), mai come offset.
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
| Watcher | `watchdog` | sorveglia la cartella |
| Avvio automatico | `launchd` (plist) | **non** nohup, **non** screen |
| Config | `correzioni.json` | non hardcodare le sostituzioni; **il file va fornito prima della Fase 4** — senza, le fasi 4 e 10 non sono implementabili |

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

---

## 7. Gestione errori

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
  "richiede_revisione": true
}
```

`contesto` è il frammento testuale con qualche parola attorno al punto di divergenza
(vedi la nota in §3), non una posizione numerica.

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

- Non aggiungere una web UI. L'interfaccia è ReferralFlow, esiste già.
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
