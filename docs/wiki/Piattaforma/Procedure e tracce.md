---
tipo: piattaforma
aggiornata: 2026-09-13
---
# Procedure, tracce e grafo dei fatti

L'assistente della piattaforma non risponde «a prompt libero»: per le domande che contano segue una **procedura scritta in codice**, con passi e condizioni, e lascia una **traccia** verificabile di ogni risposta. Il modello locale ragiona solo sull'ultimo passo (la sintesi), non decide i passi. È il disegno a quattro memorie proposto dall'utente il 13.9.2026 (conoscenza, procedure, memoria degli eventi, ragionamento), realizzato con quello che c'era già:

| memoria | dove vive oggi |
|---|---|
| conoscenza | la wiki (`docs/wiki/Agenti`, `Medici`) compilata nei prompt; i dati dello studio in Postgres |
| grafo delle informazioni | Postgres: le relazioni tra pazienti, referral, documenti, appuntamenti, referti, più la tabella `pazienti_fatti` (sotto) |
| procedure | funzioni TypeScript in `src/lib/` (una per procedura), passi deterministici, condizioni esplicite |
| memoria degli eventi | `audit.*` (artefatti, modifiche umane), `document_access_log`, `assistente_tracce` |
| ragionamento | la traccia del CODICE di ogni risposta (obiettivo → passi → fonti → verifiche → mancanze), mai il «pensiero» del modello |

Decisione ([[Decisioni/Registro]]): **niente motore a grafo separato** né orchestratore generico di workflow. Il grafo è nel database che c'è già (chiavi esterne + tabella dei fatti); una procedura è una funzione con una lista di passi e una traccia in uscita. Se un giorno servissero attraversamenti profondi, Postgres ha le query ricorsive e l'estensione AGE, e i dati sono già nella forma giusta.

## Tabelle (migrazione `035_fatti_e_tracce.sql`)
- **`pazienti_fatti`**: un arco «paziente → relazione → oggetto» con fonte (`fonte_tipo` documento/referto/appuntamento/referral/procedura, `fonte_id`), data del fatto, confidenza, nome della procedura che l'ha scritto. Relazioni oggi: `ha_documento`, `ultimo_referto`, `terapia_riga`, `referral_aperta`, `prossimo_appuntamento`, `ultima_visita`, `esame_mancante`, `richiamo_scaduto`, `bozza_da_rivedere`. Ogni corsa di una procedura riscrive i suoi fatti per quel paziente (niente stratificazioni vecchie).
- **`assistente_tracce`**: per ogni risposta dell'assistente: `procedura` (`briefing_previsita`, `documento`, `domanda_libera`), obiettivo (la domanda, max 500 caratteri), `passi` (`[{passo, esito ok|mancante|vuoto, fonti, nota}]`), `fonti` lette, `mancanti`, modello, durata, caratteri della risposta. Stessa protezione della cartella: dentro c'è la domanda dell'utente, quindi mai nei log e mai verso il cloud.

## Procedura «briefing pre-visita» (`src/lib/briefing.ts`, regole pure in `briefing-regole.ts`)
Passi, tutti del codice, nell'ordine:
1. Referral aperte del paziente (quesito, medico inviante, urgenza).
2. Questionario pre-visita compilato dal paziente (motivo, farmaci, allergie, note).
3. Ultimo referto confermato della catena (nome nei due ordini + data di nascita) o, se manca, l'ultima lettera `.docx/.txt` in cartella; da lì il blocco «Terapia:» con `estraiTerapia`. Se non c'è nulla → mancanza `lettera_precedente` («chiedere la terapia al paziente»).
4. Documenti degli ultimi 24 mesi, per tipo (`tipoEsame`: ECG, eco, Holter, ergometria, duplex, laboratorio; dalla categoria e dalle parole del titolo).
5. Condizione **ECG negli ultimi 12 mesi** → altrimenti mancanza `ecg_12_mesi`.
6. Condizione **ecocardiogramma negli ultimi 24 mesi** → altrimenti `eco_24_mesi`.
7. Agenda: ultima visita passata e prossimo appuntamento (l'agenda del robot conosce il paziente per nome: cognome e nome devono comparire entrambi).
8. In sospeso: richiami scaduti, bozze della catena non ancora confermate (con il numero di critiche).
9. Fatti scritti nel grafo.
10. **Sintesi del modello locale** (`PROTOTIPO_LLM`, default gemma3:12b, 90 s): 3-4 frasi SOPRA il briefing già scritto dal codice, con divieto di aggiungere; se il modello non c'è la risposta è il testo del codice (`testoBriefing`). Il passo finisce in traccia con esito e tempo.

Uscita: sezioni con righe e fonte per riga (documento → «Apri» nel visualizzatore, bozza → revisione, referral → scheda del paziente; nessun rimando alla piattaforma classica), riquadro «Da segnalare al medico», traccia. API: `POST /api/prototipo/briefing {patient_id}`; la traccia di qualunque risposta si rilegge con `GET /api/prototipo/tracce/[id]`.

Nel prototipo: chip «Briefing pre-visita» sulla scheda del paziente, bottone nella Home sul prossimo paziente, oppure a parole («briefing di Bernasconi», «preparami la visita di …», «briefing del prossimo paziente»). Sotto ogni risposta, anche quelle libere del modello, il riquadro **«Da dove viene»** elenca i passi con ✓/✗/–, le fonti lette con il tasto per aprirle, il modello e il tempo.

Misura: `prove-briefing.test.ts` (4 casi su dati inventati: tipi di esame, condizioni sui mesi, briefing vuoto, fatti generati). Prima corsa vera sul paziente di prova Pedrazzini: 10 passi, 4 fonti, 2 mancanze, 7 fatti, sintesi fedele in 12,6 s.

## Che cosa NON fa, di proposito
- Non dà consigli clinici né diagnosi: elenca ciò che c'è in cartella e ciò che manca.
- Non legge la wiki a ogni chiamata e non lascia il modello «navigare» le memorie: ogni dato arriva al modello attraverso una procedura che decide cosa passargli.
- Non impara da solo: una mancanza segnalata a torto si corregge cambiando la regola in `briefing-regole.ts` e aggiungendo un caso al test.

## Le altre procedure (`src/lib/procedure.ts`, regole pure in `procedure-regole.ts`, test `prove-procedure.test.ts`)
Tutte senza modello: confronti e conteggi, li fa meglio il codice. API unica `POST /api/prototipo/procedura {nome, patient_id?, bozza_id?}`; ogni esito ha titolo, sintesi scritta dal codice, sezioni con fonte per riga, mancanze, azioni e traccia.

## La risposta è un documento, non un elenco (21.9.2026)

Chi chiede «preparami la giornata» o un briefing vuole un **foglio**, non una colonna di pallini. Ogni esito porta quindi anche `documento` (`src/lib/procedure-documento.ts`, puro e provato): **intestazione** (titolo e data o paziente), **numeri** che contano (per la giornata: appuntamenti, con cartella, non in cartella, da segnalare; per il briefing: farmaci in terapia, esami recenti, in sospeso, da segnalare), e **blocchi** di quattro tipi — `avviso` (le cose da segnalare, **raggruppate per paziente**, con il totale vero), `tabella` (l'agenda del giorno: ora, paziente, medico, motivo, stato della cartella; la riga porta alla scheda), `scheda` (un paziente, richiudibile, con motivo, terapia, esami e sospesi **distinti** e non più schiacciati in una lista), `gruppo` (una sezione a sé, in griglia). `sezioni`, `mancanti` e `fonti` restano come prima: la traccia e le prove vecchie ci si appoggiano.

Nei giorni pieni il foglio resta leggibile: le segnalazioni mostrano al massimo otto pazienti (gli altri sono nelle schede), i «non in cartella» stanno in una riga con il conteggio e nella colonna «Cartella» della tabella, e le schede si fanno solo per chi ha una cartella da leggere. Le schede con qualcosa da segnalare si aprono da sole.

Il visore (`rfHtmlDocumento`) disegna il documento con «In breve», traccia in fondo e due tasti nell'intestazione: **Apri in grande** (solo nel pannello laterale: porta alla pagina grande di Cleo, stessa conversazione, e mette in vista quel documento; in pagina grande il tasto non c'è) e **Stampa** (stesso foglio su carta o PDF, tutte le schede aperte, senza bottoni). Le procedure che non si costruiscono un documento ricevono quello generico da `conTraccia`.

Le **risposte libere** del modello locale seguono la stessa idea in piccolo: il prompt chiede parti con un titolo (`**Titolo**`) e poche righe «- » ciascuna, mai un elenco unico che mescola argomenti, e il visore le disegna come parti (`rfMdLeggero`).
- **`cambiamenti_ultima_visita`** («cosa è cambiato dall'ultima visita», chip sulla scheda e nella revisione): gli ultimi due referti confermati del paziente; misure riconosciute con le stesse 19 espressioni della catena (`misureCliniche`), primo valore per misura: cambiate «FE: 60 → 45», invariate, presenti in uno solo; terapia dal blocco «Terapia:» farmaco per farmaco (`stessoFarmaco`): nuove, modificate, tolte, invariate. Con meno di due referti si ferma e lo dice.
- **`richiami_mese`** («richiami del mese», chip in Home): referral e appuntamenti d'agenda con richiamo aperto entro 30 giorni, divisi in scaduti / 7 giorni / 30 giorni, con mesi, medico, quesito; conta i richiami segnati fatti nell'ultimo mese. Mancanza solo se ci sono scaduti. Azione: la pagina `/richiami`.
- **`controllo_prefirma`** («controllo prima della firma», chip nella revisione, bottone «✓ Controllo» nella coda Referti): 10 controlli sulla bozza: stato, livello di verifica della catena, fiducia, critiche chiuse nella revisione (le stesse segnalazioni di `costruisciRevisione`, chiuse = id in `revisione_stato.fatte`), numeri non confermati, terapia da verificare, campi confermati (paziente, nascita, destinatario), testo finale, terapia dettata o lettera precedente, segnalazioni chiuse. Verdetto: «pronto», «pronto con presa d'atto» (verifica ridotta, terapia assente), «non ancora pronto» (critiche aperte, campi, testo, stato). È il gate pre-firma del wizard esposto come traccia: non sostituisce la conferma nella piattaforma.

- **`preparazione_giornata`** («preparazione della giornata», bottone «Prepara la giornata» in Home, chip in Home e Agenda; `giorno` facoltativo `AAAA-MM-GG`): per ogni appuntamento del giorno abbina il paziente per cognome+nome (nei due ordini) ed esegue `briefingGrezzo` (le stesse regole del briefing singolo, senza modello; i fatti nel grafo si aggiornano). In cima «Da segnalare»: tutte le mancanze con ora e paziente, più chi non è in cartella; poi un blocco per appuntamento (motivo, terapia fino a 6 righe, 3 esami, sospesi) con le fonti. Test in `prove-procedure.test.ts`.

- **`lettere_ritardo`** («lettere in ritardo», chip in Home e Referti): referti confermati senza l'evento `word_scaricato` (registrato da `GET /api/referti/docx/[id]` dal 13.9.2026) dopo 3 giorni (solo referti confermati dal 13.9.2026 in poi: prima l'evento non c'era), bozze ferme da 7 giorni, referral in stato «vista» da 10 giorni senza referto inviato. Le soglie sono costanti in `procedure-regole.ts`.
- **`chiusura_mensile`** («chiusura mensile», «numeri del mese», anche «chiusura di agosto 2026»; chip in Home e Referti; `mese` facoltativo `AAAA-MM`): referti dettati/confermati/scartati/ancora in bozza e tempo mediano dettato → conferma; referral ricevute e chiuse, aperte da oltre 30 giorni senza appuntamento; richiami fatti e scaduti; documenti caricati e pazienti con richiamo aperto senza ECG negli ultimi 12 mesi; lettere in ritardo (stessa procedura); tracce dell'assistente per procedura e voci di dizionario confermate. Solo conteggi e id: nessun testo clinico nella traccia. Azioni: Statistiche, Richiami.

## Il registro delle procedure e il grafo organizzativo (13.9.2026, notte)
- **Registro come dati** (`src/lib/procedure-registro.ts`): per ogni procedura ruoli ammessi (l'inviante mai), input (`nessuno`, `paziente`, `bozza`), parametri (`giorno`, `mese`), dati letti, cosa produce, se usa il modello, frasi che la attivano (espressioni compatibili JS/TS), chip per pagina, testo di attesa. `GET /api/prototipo/procedure` lo restituisce filtrato per ruolo e ordinato per priorità (le più specifiche prima: «briefing di tutti» è la giornata). Il ponte instrada tramite l'interprete (sotto); le sue espressioni restano solo di riserva, i chip vengono da lì, e quando manca l'input risponde «per questo uso la procedura X: mi serve il paziente». Il server rifiuta con 403 un ruolo non ammesso. Nel prompt del modello entra l'elenco: una domanda libera che somiglia a una procedura riceve il suggerimento di chiederla per nome.
- **Grafo organizzativo** ([[Piattaforma/Organizzazione dello studio]]): tre tabelle (ruoli, responsabilità con «quando» e procedura, servizi e dati) lette a runtime dal checkout (`src/lib/organizzazione.ts`, cache 5 minuti). Solo ruoli, mai nomi. Ogni procedura del registro deve avere un responsabile: lo verifica un test. Il bot risponde a «chi si occupa di…», «quando si fa…» dal grafo, con il tasto che lancia la procedura collegata; il modello riceve lo stesso elenco per le domande libere.
- **Il bot legge il grafo dei fatti**: con un paziente aperto, `paziente_id` viaggia con la domanda e i suoi fatti (`pazienti_fatti`, con fonte) entrano nel prompt; se il grafo è vuoto lo riempie `briefingGrezzo` al volo. «Qual è la terapia in corso?» sulla scheda risponde dalle righe `terapia_riga`. La traccia registra quanti fatti sono entrati.

## Come si interpretano le domande scritte (13.9.2026, notte)
`src/lib/interprete.ts` (puro, test `prove-interprete.test.ts`), esposto da `POST /api/prototipo/interpreta {domanda, contesto}`; il ponte lo chiama per ogni domanda che non riguarda l'organizzazione e agisce sull'esito.
1. **Normalizzazione**: minuscole, accenti tolti, apostrofi e punteggiatura via, spazi compressi.
2. **Refusi tollerati**: un gettone «somiglia» a una radice del registro se inizia con essa, o se differisce di 1 lettera (parole da 5) o 2 (da 8): «ciusura» → chiusura, «brifing» → briefing, «Pedrazini» → Pedrazzini.
3. **Procedura**: ogni voce del registro ha frasi (espressioni) e parole chiave, la prima è la parola forte. Punteggio: frase 3, parola forte 2, parola 1. Sicurezza **alta** se ≥3 con frase o parola forte e distacco ≥2 dal secondo candidato, o parola forte da sola senza altri candidati («brifing di Pedrazini»); **media** se ≥2 o solo la parola forte; **nessuna** altrimenti → domanda libera (numeri, documenti, modello).
4. **Entità**: paziente dalle anagrafiche dello studio (cognome o nome ≥3 lettere con 1 refuso; cognome+nome vince; due «Galli» → ambiguo, si chiede); mese («agosto», «agosto 2026», «mese scorso», «2026-08»); giorno («domani», «ieri», «15.09»). Il contesto della pagina fornisce il paziente aperto e la bozza aperta quando la domanda non li nomina.
5. **Casi grigi (sicurezza media)**: il codice ha già scelto il candidato migliore; il modello locale dice solo, in JSON, se la domanda chiede davvero quella procedura o «nessuna». Non sceglie tra candidati: al primo banco («controlli in scadenza») preferiva il controllo pre-firma dove il codice aveva ragione con i richiami. Quel giudizio lascia una traccia `interpretazione` (candidati con punteggi, scelta del modello). Se Ollama non c'è, il caso grigio diventa domanda libera.
6. **Esito** per il ponte: `procedura` (si esegue e sopra il risultato compare «Ho capito: …»), `chiedi` (manca il paziente o la bozza, o il paziente è ambiguo: chip con le scelte), `libera` (risposte immediate del codice, poi il modello). Il server non lancia mai una procedura fuori dai ruoli ammessi.

Come si migliora: una domanda vera che finisce «libera» ma voleva una procedura si legge nelle tracce; si aggiunge la frase o la parola chiave al registro e un caso al test. Il modello non viene mai «addestrato»: cambia il registro.

## Il «perché» delle scelte umane (13.9.2026)
Nella revisione guidata della piattaforma, sotto ogni correzione automatica già decisa (annullata o confermata), un campo facoltativo «Perché?» (max 200 caratteri) salvato in `revisione_stato.motivazioni` per id di segnalazione, con l'autosalvataggio. Non entra in nessun prompt: è segnale per il consolidatore notturno e per chi legge le attribuzioni. Prossimo passo: mostrarlo nel cruscotto Qualità AI accanto alle proposte di dizionario.

## Prossime procedure candidate
Nessuna in coda: le prossime nascono dalle domande che segreteria e medico fanno davvero al bot (si leggono nelle tracce, `procedura = domanda_libera`).
