# Dividi cartella

Che cosa è vero oggi (9.10.2026). Una cartella completa arriva spesso come **un PDF solo** — la cartella cartacea scansionata, l'esportazione di un altro programma — con dentro lettere, referti, laboratori, ECG. La pagina **Dividi cartella** (menu «Clinico», sotto Documenti) la separa nei suoi documenti, **ognuno un PDF a sé nella cartella del paziente**. L'originale resta com'è.

## Come si usa

1. **Il PDF e di chi è, in qualunque ordine.** Si può **trascinare subito il PDF**, anche di un paziente che in ReferralFlow **non c'è ancora**: il file aspetta nel browser, dalle prime dodici pagine si leggono nome e data di nascita (`leggiPaziente`: righe «Concerne: Signora …, nata il …», «Paziente: …», «Data di nascita: …»; vince il nome scritto più volte) e
   - se combaciano con **una persona sola** già in piattaforma, la pagina la propone («È …: usa la sua cartella»);
   - se no mostra cognome, nome e data di nascita **già scritti, da controllare** (cognome e nome possono essere scambiati) e «Crea la cartella e continua»; se il PDF non ha testo, i tre campi si scrivono a mano;
   - oppure si cerca a mano qualcuno che c'è già.
   Finché non si conferma di chi è, sul server non arriva né il file né un paziente nuovo; il testo delle pagine serve solo a quella proposta e non resta da nessuna parte. Se la persona esiste già con gli stessi tre dati si usa la sua cartella: mai un doppione.
   In alternativa si parte dal paziente (cercato per cognome) e gli si carica il PDF o se ne prende uno già nella sua cartella.
2. **Il file** (fino a 50 MB) entra nella cartella come documento «cartella completa, da dividere»; se è una scansione senza testo va in coda per l'OCR come ogni altro documento.
3. **La proposta**: i documenti trovati, **raggruppati per sezione** (una sottocartella per ogni foglio separatore), ognuno con le miniature delle sue pagine, il tipo, la data e il nome proposti. Arriva in due tempi: subito quella delle sole regole, poi — quando il Mac ha finito di ragionare (vedi sotto) — quella definitiva; la pagina aspetta e si aggiorna da sola, e dice quante pagine ha già letto.
4. **Si corregge**: ✂ fra due pagine taglia; «Unisci al precedente» incolla; «Lascia fuori» esclude le pagine bianche o doppie; tipo, data e nome si riscrivono (finché il nome è quello proposto segue tipo e data); il nome di una sottocartella si riscrive in testa alla sezione e vale per tutti i suoi documenti. Una pagina si apre in grande con un clic, e da lì si scorre con le frecce e si taglia o si unisce.
5. **«Crea N documenti»**: nascono nella cartella del paziente, col tipo scelto, **nella loro sottocartella**, e la nota «dalla cartella completa, pagine a–b». Si aprono, si scaricano uno per uno o **tutti in uno .zip, con le stesse sottocartelle**.

## Sezioni, nomi, ordine (9.10.2026)

- **I fogli col codice a barre sono separatori.** La cartella cartacea dello studio ha, fra un gruppo di documenti e l'altro, un foglio con un codice a barre (Code 39): sei cifre, e **le ultime due dicono la sezione, contando da 00** (00 → `01_Rapporti`, 01 → `02_Rapporti esterni - ricoveri`, 02 → `03_Appunti`, 03 → `04_ECG - tracciato PM-ICD`, 04 → `05_Apparecchi`, 05 → `06_Ciclo - Ergospiro`, 06 → `07_TAC - MRI - RX`, 07 → `08_Intervento cardiologico`, 08 → `09_Laboratorio e analisi`, 09 → `10_Vari`, 10 → `11_Documenti amministrativi`, 11 → `12_Ricette`; una sezione oltre la dodicesima compare come `13_Sezione 13` e si rinomina a mano). **Il numero delle Ricette (12) è una supposizione**: lo studio ha chiesto la sottocartella senza dirne il numero. Il primo foglio, con un codice di lettere e cifre, è la **copertina** col numero del paziente. Separatori, copertina e il loro retro bianco **restano fuori**; un codice che non ha quella forma non è un separatore. I nomi delle sezioni stanno in `SEZIONI` (`src/lib/dividi/sezioni.ts`).
- **Il codice lo legge il Mac** (`imaging/separatori.py`: ghostscript rende le pagine, Pillow e numpy cercano le fasce a barre e le decodificano): della pagina si legge solo il codice.
- **Ogni sezione è una sottocartella** della cartella del paziente (`patient_documents.cartella`, migrazione 089). Nella scheda «Documenti» del paziente le sottocartelle compaiono in ordine di numero, e dentro i documenti **in ordine di tempo, i più recenti in testa** (quelli senza data in fondo); i documenti senza sottocartella stanno in «Altri documenti».
- **Il nome**: `AAAA.MM.GG Cognome Nome Che cos'è` (per esempio `2023.10.18 Rossi Maria Holter`): data, paziente, tipo di documento. La data davanti in quell'ordine fa sì che l'ordine alfabetico sia quello del tempo anche fuori dalla piattaforma. Se la data non si trova il nome parte dal paziente, e il pezzo porta l'avviso «senza data».

## Chi decide i tagli

**Il Mac propone in due mani, una persona conferma.**

*Prima mano, le regole* (`src/lib/dividi/tagli.ts`, puro; subito). Dal testo di ogni pagina:
- segnali di **inizio**: «pagina 1 di N» (+4), un saluto in cima («Egregio collega», «Sehr geehrter…») (+3), «Luogo, data» (+3), un titolo d'esame nelle prime tre righe (+3) o una parola come «referto» nelle prime otto (+2), un oggetto («Concerne:») (+2), la pagina scritta precedente che chiude coi saluti (+2), una data in cima (+1);
- segnali di **seguito**: «pagina 2 di N» (−6), una pagina quasi vuota — il retro del foglio — (resta col documento prima), una riga che comincia in minuscolo (−2);
- si taglia da **3 punti** in su; la **stessa testata ripetuta** (un laboratorio di tre fogli) con lo stesso tipo e la stessa data non fa un documento per foglio;
- **tipo** dal titolo in cima, **data** da «Luogo, data» o la prima in cima che non sia una data di nascita.

*Seconda mano, il modello locale* (`src/lib/dividi/analisi.ts`; in sottofondo). Le regole contano parole e sbagliano dove il contesto conta: una lettera senza saluto né «Luogo, data», due appunti di giorni diversi, un referto che continua con un titolo in maiuscolo. Per questo **ogni pagina scritta** (non i separatori, non le bianche, non le «pagina 2 di N») passa a un modello che gira su **Ollama sul Mac dello studio** (`DIVIDI_LLM`, default `gemma3:12b`; `spento` = solo regole): gli si dà la fine della pagina precedente della stessa sezione e l'inizio e la fine di questa, e risponde in JSON **se comincia un documento, che data porta, che documento è** (in 1-5 parole: «Rapporto Dr …», «EcoTT», «Holter», «Dimissione Ospedale …», «Appunti»). Niente esce dallo studio: è lo stesso Ollama della catena e dell'assistente ([[Piattaforma/AI locale dell'app]]).

*La forma della pagina* (indicazione dello studio, 9.10.2026; `Forma` in `tagli.ts`). Il modello da solo tagliava troppo, spesso una lettera in due. Lo studio ha detto come si riconosce una lettera, e sono diventati tre indizi per pagina:
- **finisce** («chiusa») se in fondo c'è il **nome del medico** («Dr. med. …», «Dr.ssa», «Prof.», «capoclinica»…) o i **saluti**; una riga con telefono, sito o indirizzo è il piè di pagina della carta intestata, non una firma;
- **comincia** con un **titolo in alto** — una riga corta che comincia con «Referto», «Rapporto», «Lettera di dimissione», il nome di un esame, «Ricetta», e non finisce col punto —
- e spesso con un **blocco di dati in alto a destra** (almeno due righe che partono oltre metà pagina nel terzo alto).
Il blocco a destra il testo da solo non lo dice: il server legge **la posizione delle righe** dal PDF (`src/lib/dividi/pagine.ts`, pdf.js). Il **grassetto non si vede** (lo strato di testo dell'OCR non lo porta): il titolo si riconosce dalla parola e dal posto. La firma a mano nemmeno: conta il nome scritto a macchina.

*Come si compongono* (`componi` in `src/lib/dividi/sezioni.ts`, puro), nell'ordine:
- dopo un separatore comincia **per forza** un documento; una pagina bianca o una «pagina 2 di N» **non apre mai**; «pagina 1 di N» apre sempre;
- **tracciati e appunti** (`03_Appunti`, `04_ECG`): **un documento per giorno** — nuovo quando cambia la data; stessa data o nessuna, continua; una pagina con più date resta col documento se fra le sue c'è la sua;
- nelle altre sezioni, **il freno**: se la pagina prima **non chiude** e questa **non ha niente di un inizio** (né titolo, né blocco a destra, né i punti delle regole; o comincia in minuscolo), **è il suo seguito, qualunque cosa dica il modello** — una lettera non si taglia in due;
- se la pagina prima **chiude** e questa **ha un inizio**, è un documento nuovo (se il modello non è d'accordo: «da guardare»);
- la **stessa testata con la stessa data** è un seguito;
- nei casi che restano (la pagina prima chiude ma questa non ha un inizio; o non chiude ma questa ce l'ha) **decide il modello**, e il pezzo è «da guardare»; senza modello decidono i punti delle regole;
- nelle sezioni d'esame (`05`, `06`, `07`, `09`), dove i referti spesso non finiscono col nome di un medico, vale come inizio anche **la data che cambia**;
- la **data** del modello si accetta solo se **è scritta in quella pagina**; se no resta quella delle regole, o niente: non si inventa;
- il **titolo** del modello si ripulisce (via il nome del paziente, le date, i segni che un nome di file non regge); se non resta niente si usa il tipo trovato dalle regole o la voce della sezione.
Al modello gli indizi si **dicono** («la pagina precedente NON finisce col nome del medico; questa pagina ha un titolo in alto…»), e le pagine che il freno dà per seguito sicuro **non gli si chiedono** (meno attesa). Le istruzioni hanno una versione (`VERSIONE` in `analisi.ts`): quando cambia, le analisi già fatte si rifanno da sole.

*Quanto ci mette, e quando.* Circa **6 secondi a pagina** sul Mac mini (M4, 24 GB): una cartella di 170 pagine è un quarto d'ora. Per questo l'analisi gira **in sottofondo**, una cartella alla volta (`dividi_analisi`, migrazione 089): parte da sola dopo l'OCR per le cartelle caricate da questa pagina, o alla prima apertura; salva ogni cinque pagine e dopo un riavvio riprende da dove era; **cede il passo alla catena dei referti** (aspetta, e scarica subito il suo modello dalla memoria: sul Mac da 24 GB non deve contendersela con whisper), e se la catena lavora per più di venti minuti si rimanda al giro dopo (`/api/cron/ocr`, ogni quarto d'ora). L'esito — dove sono i separatori e, per pagina, sì/no, data e titolo — sta nel database dello studio come i documenti; nei log solo numeri.

**Lo storico.** In fondo alla prima schermata, «Cartelle già caricate» (ultimi 90 giorni, al massimo 30): le cartelle complete caricate da questa pagina, o divise qui, con il paziente, il nome del file, il giorno e **a che punto sono** — «il Mac la sta leggendo», «da dividere», «divisa in N documenti il …» (il numero viene dal registro degli accessi). Da lì si riapre («Dividi», «Dividi di nuovo») o si va alla cartella del paziente: serve a riprendere una cartella lasciata a metà senza ricordarsi di chi era. I pezzi creati non compaiono nello storico: sono documenti normali della cartella. `GET ?recenti=1`.

Un PDF **senza testo** (scansione non ancora letta dall'OCR) è proposto come un pezzo solo, e la pagina **aspetta da sola**: dice che il Mac sta leggendo la scansione, chiede ogni 5 secondi a che punto è (`GET ?stato=<id>`: solo lo stato, il file non si apre e nel registro non si scrive) e a lettura finita rifà la proposta. Se nel frattempo la persona ha già cominciato a tagliare a mano, i suoi tagli **non si toccano**: compare «il Mac ha finito: passa ai tagli proposti», e sceglie lei. La lettura parte solo a catena ferma ([[Piattaforma/Documenti]]): se il Mac sta trascrivendo un referto l'attesa si allunga. Se dopo la lettura più di metà delle pagine resta senza testo (scritte a mano, sbiadite) la pagina lo dice, e lì i tagli li mette la persona.

**La conferma è sempre di una persona.** Una regola che taglia male divide una lettera in due o ne incolla due: per questo niente nasce prima di «Crea».

## Il lato server

- `src/lib/dividi/sezioni.ts` (puro: codice → sezione, fusione regole + modello, nomi), `src/lib/dividi/analisi.ts` (il lavoro in sottofondo: separatori e modello), `imaging/separatori.py` (lettore dei codici a barre, col Python dell'ambiente immagini).
- `src/lib/dividi/server.ts`: testo pagina per pagina con `pdf-parse`, taglio con `qpdf` (le pagine si copiano tali e quali, testo OCR compreso), zip con `/usr/bin/zip` senza compressione. Tetto di 1500 pagine per volta e 300 documenti.
- Rotta `/api/prototipo/dividi` (GET `?paziente=`, GET `?documento=`, GET `?stato=` — OCR e analisi, per la pagina che aspetta —, GET `?recenti=1`, POST `crea`, POST `zip`, POST `chi` — di chi è un PDF, dal testo che manda il browser). Sezione `dividi` in `src/lib/permessi.ts`: la vedono gli stessi ruoli che vedono i Documenti (medico, aiuto medico, segreteria, amministrazione, tecnico).
- **Registro**: ogni proposta è una lettura dell'originale; ogni pezzo un caricamento («diviso da …»); alla conferma si annota **quanti documenti, quanti proposti e quanti rimasti uguali** — solo numeri, mai titoli né testo. È la misura con cui si giudicano le regole.
- In pagina (`bridge/16-dividi.js`) il PDF si apre una volta nel browser con pdf.js per le miniature; mentre si corregge si ridisegna solo l'elenco dei pezzi, non la pagina (che tornerebbe in cima a ogni clic). Niente si salva nel browser: ricaricando la pagina si riparte dalla proposta.

## Quello che non è stato misurato

Regole, istruzioni del modello e banco sono fatti su testi **inventati**: non si leggono cartelle vere per metterli a punto (della prima cartella vera si sono guardati solo numeri: quante pagine, quali hanno un codice a barre, come sono fatti i codici). Sul banco inventato (31 pagine, coi casi difficili) regole e modello insieme arrivano a 15 documenti interi su 15 ([[Misure/Banchi]]); **su una cartella vera si sa solo quel che dicono i conteggi** (`scripts/conta-dividi.ts`: quanti documenti per sezione, mai testo) **e quel che dice lo studio guardandola**: alla prima il giudizio è stato «troppi tagli nelle lettere», e da lì viene la forma della pagina. La misura vera resta il registro («proposti / rimasti uguali») alle prime conferme. Limiti noti:
- le **pagine scritte a mano** (gli appunti) l'OCR non le legge: lì né le regole né il modello hanno testo, e data e tagli li mette la persona;
- i **tracciati** (ECG) hanno poco testo: la data si trova se è stampata e leggibile;
- il **titolo** è una proposta del modello: va riletto;
- lo schema dei separatori (sei cifre, sezione nelle ultime due) è quello visto su **una** cartella dello studio;
- la **forma** vale per le carte intestate viste finora: una lettera che finisce con la sola firma a mano, senza nome scritto, non «chiude», e la pagina dopo le resta attaccata finché non ha un inizio chiaro;
- il **grassetto** non si legge.

## Quello che ancora non c'è

- File oltre i 50 MB (vanno divisi prima).
- Riprendere una divisione lasciata a metà (le correzioni fatte a mano non si salvano: ricaricando si riparte dalla proposta).
- I nomi delle sezioni modificabili dalle impostazioni invece che nel codice.
- Leggere le pagine scritte a mano.
- Riordinare le pagine o ruotarle.
- Sostituire l'originale coi pezzi: resta in cartella, lo toglie chi vuole.

## Prove

`src/lib/prove-dividi.test.ts` (12, con la forma della pagina — il freno che non lascia tagliare una lettera in due, un documento per giorno in appunti e tracciati —: alle sette di prima si aggiungono il codice del foglio → sezione, i separatori che aprono le sezioni e restano fuori con sottocartella e nome, il modello che decide ma non scavalca i freni né inventa date, le pagine da chiedere col loro contesto e la pulizia del titolo; le sette di prima, con la lettura del paziente dal PDF: cartella di otto pagine in quattro documenti con tipi e date, segnali, testata ripetuta, niente inventato, PDF senza testo, controllo dei pezzi confermati). `scripts/banco-dividi.ts` (cartella inventata di 31 pagine in cinque sezioni, in `banco-dividi-dati.ts`, coi seguiti che ripetono intestazione, paziente e data: regole sole contro regole + modello; chiama il modello locale, non parte se la catena lavora). `scripts/banco-dividi-velocita.ts` (quale modello e quanto testo per pagina: scritto, **mai fatto girare**). `scripts/conta-dividi.ts` (i conteggi su una cartella vera). `scripts/e2e/prova-dividi.ts` (12, col modello spento: stato della lettura, storico, e una cartella coi codici a barre disegnati — copertina e separatori letti, sezioni, nomi, sottocartelle nel database e nello zip; sul demo con una cartella fatta con ghostscript): caricamento e proposta, permessi e intervalli sbagliati, creazione con una correzione, pezzi veri con le loro pagine e originale intatto, registro coi soli numeri, zip.
