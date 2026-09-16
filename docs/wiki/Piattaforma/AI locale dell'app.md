---
tipo: piattaforma
aggiornata: 2026-09-13
---
# AI locale dell'app

L'AI che risponde **dentro la piattaforma** (non la catena dei referti: quella sta in [[Catena/Panoramica]]).
Gira su Ollama sul Mac dello studio, nessun cloud, nessun dato fuori dal computer.

## Chi la usa

| dove | route | cosa fa |
|---|---|---|
| riquadro «Chiedi ai tuoi dati» in Statistiche | `POST /api/statistiche/chiedi` | una domanda sugli aggregati dello studio; mai dati di singoli pazienti, mai SQL generato dal modello |
| sidebar AI del prototipo (⌘/) | `POST /api/prototipo/assistente` | risponde solo sui dati già in pagina, filtrati per il ruolo |
| briefing pre-visita nel prototipo | `POST /api/prototipo/briefing` | il codice decide i passi, il modello (`PROTOTIPO_LLM`, default gemma3:12b) scrive solo la sintesi; traccia salvata ([[Piattaforma/Procedure e tracce]]) |
| le altre sei procedure del prototipo | `POST /api/prototipo/procedura` | solo codice, nessun modello: confronti e conteggi con traccia |
| anonimizzazione nell'interfaccia nuova | `POST /api/prototipo/anonimizza` | stessa libreria di `/anonimizza`: modello `ANONIMIZZA_LLM`, il codice sostituisce; niente persistenza |
| interprete delle domande scritte | `POST /api/prototipo/interpreta` | il codice interpreta; il modello (`PROTOTIPO_LLM`) solo nei casi grigi, sì/no sul candidato del codice, con traccia `interpretazione` |
| riassunto pre-visita, confronto referti, cattura impegnativa | server action | generazione secca, su richiesta |

Tutte passano da `src/lib/ollama.ts`. Non c'è un assistente globale su tutte le pagine: non è mai stato costruito.

## Configurazione (`.env` dell'app)

| variabile | default | nota |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | l'app parla il dialetto **Ollama** (`/api/generate`), non quello OpenAI: un server LM Studio su `:1234` non va bene così com'è |
| `OLLAMA_MODEL` | `gemma3:12b` | nel `.env` vero è `gemma3:27b`. **Non** si allinea a Qwen 3.8 delle tappe locali: troppo lento per una chat ([[Decisioni/Registro]]) |
| `OLLAMA_PING_MS` | 6000 | timeout del ping `/api/tags` |
| `OLLAMA_TIMEOUT_MS` | 240000 | timeout di una generazione |

`REFERTO_STRUTTURA_LLM` è un'altra cosa: è il modello di «Impagina come lettera», e quello **sì** è Qwen 3.8.

## Quando «l'assistente non risponde»

Cinque guasti diversi, che fino al 13.9.2026 erano indistinguibili perché il client faceva `return null`.
Ora ognuno ha una causa (`spento`, `ping_lento`, `modello_assente`, `timeout`, `http`, `risposta_vuota`),
che finisce nel messaggio all'utente e nel log del server con il prefisso `[ai-locale]`.

Per capire quale, in ordine di costo:

1. **`bash mac/diagnosi-ai.sh`** dal Terminale del Mac — è la via più veloce e non richiede il rebuild dell'app.
2. **`/api/ai/diagnostica`** da browser loggato: stessa cosa dall'interno dell'app. Con `?prova=1` fa anche una generazione vera.
3. Il log del server (`[ai-locale]`).

Le trappole note, in ordine di frequenza attesa:

- **`OLLAMA_MODEL` non corrisponde a un modello scaricato.** Ollama risponde 404 e prima la cosa era invisibile. `ollama list` per l'elenco vero.
- **Modello freddo.** La catena sfratta i modelli (`keep_alive: 0`) prima di whisper, quindi la prima domanda dopo un dettato carica il 27b da disco: 1-3 minuti. Il vecchio timeout di 90 s non bastava.
- **Contesa con la catena.** Mentre la catena macina, il ping può tardare. Stava a 1,5 s, ora 6.
- **Sessione scaduta.** Entrambe le route vogliono `session.studioId`: senza, 401. Nel prototipo questo fa restare `RF.live` falso e la sidebar torna alle **risposte finte** dei dati demo — che sembrano un assistente che allucina.
- **Fuori dal percorso `/prototipo/`** (porta 8765) il ponte è inerte per costruzione: dati e bot restano finti.

## Cosa NON fa

Non scrive nei log il prompt, la risposta o qualsiasi contenuto clinico: solo nomi di modello, stati HTTP e millisecondi.

## Nome (14.9.2026)
L'assistente dell'interfaccia nuova si chiama **Cleo**: il prompt di `api/prototipo/assistente` e del briefing glielo dice («Ti chiami Cleo…»), e a «come ti chiami?» / «chi sei?» risponde il codice del ponte (`rfRispostaNome`) senza chiamare il modello.

## Ricerca clinica esterna protetta (16.9.2026)

Il medico fa una domanda **con davanti la cartella intera**; un modello locale ricava il **contesto minimo** che serve a rispondere; esce solo quello; la risposta rientra e viene riletta **qui**, dove la cartella c'è. Il principio, nelle parole di chi l'ha disegnata: *il cloud conosce il problema clinico necessario alla ricerca, ma non conosce il paziente. Solo il sistema locale conosce entrambi.*

Tutti e otto i passi stanno in `POST /api/prototipo/contesto-clinico`, in tre azioni:

| Azione | Che cosa fa | Esce qualcosa? |
|---|---|---|
| `prepara` | `briefingGrezzo` assembla la cartella (la stessa del briefing pre-visita), **gemma3:12b** ne ricava contesto + domanda generale, il controllo li esamina, nasce la riga di registro | no |
| `manda` | ricontrolla il testo che torna dal browser, chiama il fornitore autorizzato, poi fa rileggere il risultato al modello locale **con la cartella davanti** | sì: contesto e domanda generale, nient'altro |
| `conferma` | segna che cosa ne ha fatto il medico | no |

### In Cleo
Secondo tasto-modo accanto a «Domanda medica»: **«Con la cartella»**. Se non c'è un paziente in contesto lo si cerca scrivendo cognome o nome — la lista si aggiorna da sola senza ridisegnare la pagina, altrimenti a ogni lettera si perderebbe il cursore, e accanto a ogni nome c'è la data di nascita per gli omonimi; Invio prende il primo. Poi si scrive la domanda come viene.

Il riquadro mostra le due parti del pacchetto **in due caselle modificabili**: il medico può togliere una riga di troppo prima di mandare, e il controllo si rifà dall'altra parte (mai fidarsi di ciò che torna dal browser). Sotto, l'esito del controllo; in fondo, la riga che dice che cosa esce e dove va. I due modi si escludono a vicenda: o la domanda generale senza paziente, o la cartella.

La risposta finale arriva in sezioni fisse — sintesi, evidenze, **per questo paziente**, attenzioni, informazioni mancanti, fonti, certezza — e chiude con due bottoni: «L'ho usata» / «Non mi serve», che finiscono nel registro.

### Il controllo, che è la parte che conta
**Non è euristico**: cerca dentro il pacchetto gli identificatori **veri di quel paziente** — cognome, data di nascita nei due formati, AVS, telefono, e-mail, via, località, numero d'assicurato. Se ce n'è uno è una fuga, non un sospetto. In più due prove che hanno bocciato un modello: la **domanda deve essere generale** (niente «in questo paziente»: sarebbe la domanda di prima con i nomi tolti) e **l'età esatta non deve comparire** («donna di 78 anni» restringe di molto chi può essere).

I nomi si cercano **con la maiuscola**: «capelli neri» non è il cognome Neri. Il prezzo è che una fuga scritta tutta minuscola sfuggirebbe; nei banchi non è mai successo, ed è scritto nel codice perché si sappia.

Se il controllo non passa, `manda` rifiuta prima di aprire la connessione e la riga resta `bloccata`.

### Il modello esterno non naviga
Fuori va **gemma 4 31B su Infomaniak (Ginevra)**, lo stesso della «Domanda medica», per la stessa porta (`fornitore-esterno.ts`, guardia `FORNITORI_AUTORIZZATI`). È più **grande**, non è collegato a internet: non consulta PubMed, non apre le linee guida, risponde da quello che ha imparato. Quindi:

- il prompt gli **vieta link, DOI e PubMed** («non potendoli controllare, sarebbero inventati») e gli chiede di dire quando non è sicuro;
- `fontiDaVerificare` li segnala lo stesso se compaiono, e la pagina avvisa il medico;
- le fonti sono presentate come **«citate a memoria, da verificare»**, mai come riferimenti controllati.

Chi volesse una ricerca che cerca davvero deve collegare un fornitore con accesso alle fonti: la struttura è pronta, cambia solo chi risponde al passo 5.

### Il rientro
Il testo che torna da fuori è **materiale da valutare, non istruzioni**: è l'unico pezzo della catena che non abbiamo scritto noi e finisce dentro un altro prompt. Perciò è tagliato a 6000 caratteri e il prompt locale dice esplicitamente di ignorare eventuali richieste contenute lì dentro. Non esiste comunque un canale da cui potrebbero uscire dati: il modello locale scrive solo sullo schermo del medico.

La risposta finale **non prescrive, non cambia terapie, non fa diagnosi**: prepara la decisione, non la prende.

### Il registro (`ricerche_cliniche`, migrazione 055)
Qui, al contrario del registro delle anonimizzazioni, **il testo entra**. La ragione è diversa: le anonimizzazioni servono a non far uscire un documento, quindi conservarlo sarebbe un controsenso; questa è una consulenza su un paziente, e di una consulenza si deve poter dire mesi dopo che cosa era stato chiesto, che cosa è uscito, che cosa è tornato e che cosa ne ha fatto il medico. Una riga per ricerca: `preparata` → `inviata` → `risposta` → `confermata` o `scartata`, più `bloccata` quando il controllo ferma tutto. Nei log del server, come sempre, solo lunghezze, stati e millisecondi.

### Banchi
Banco del 16.9 su **cartelle inventate** con identificatori piantati apposta (`scripts/banco-contesto-clinico.ts`, [[Misure/Banchi]]): gemma3:12b zero fughe, 10 fatti determinanti su 10, domanda sempre generale, mai l'età esatta. medgemma 1.5 4B — modello medico — zero fughe ma **ricopiava la domanda del medico** e scriveva «donna di 78 anni»: il più bravo sul contenuto, il più ingenuo sulla protezione.
