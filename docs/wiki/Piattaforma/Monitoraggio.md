---
tipo: piattaforma
aggiornata: 2026-10-06
---
# Monitoraggio remoto (modulo dimostrativo)

Monitoraggio multiparametrico dei pazienti con dispositivi indossabili (cerotti, braccialetti, sensori). Dal 6.10.2026 è una voce del menu, **in modalità dimostrativa**: lo studio non ha ancora scelto né comprato i dispositivi, e tutto ciò che si vede è prodotto da un simulatore. Ogni schermata porta la fascia «DEMO — dati simulati, non utilizzabili per decisioni cliniche».

**Non è** un dispositivo medico certificato né un sistema di emergenza. Un valore oltre soglia non è una diagnosi e non è un'emergenza confermata.

## Che cosa funziona davvero

- **Panoramica** (`public/prototipo/bridge/14-monitoraggio.js`), disposta come un cruscotto (6.10.2026, richiesta dello studio da un'immagine di riferimento, solo per questa pagina): in alto quattro numeri con l'icona (monitorati, alta priorità, attenzione, dati insufficienti con dispositivi scollegati e problemi tecnici); poi **Pazienti** — **tutti** i pazienti, un riquadro ciascuno, con nome, codice e medico, stato, parametri con unità e andamento (FC, SpO₂, FR, temperatura, pressione; «non misurato» dove il dispositivo non lo misura), avviso prioritario e numero di avvisi aperti, connessione e latenza, segnale, batteria, ora dell'ultima misura — e accanto lo **stato dei pazienti**; poi **avvisi sui parametri** e **copertura dei dati** (quanti pazienti hanno trasmesso, minuto per minuto, nell'ultima mezz'ora); poi **attività recente** e **problemi tecnici**. I riquadri stanno in ordine di priorità e **non si spostano da soli**: se la priorità è cambiata lo si dice, con «Riordina». L'elenco a parte con ricerca e filtri è stato **tolto** (decisione dello studio: i monitorati saranno circa quattro al mese), e con lui la ciambella della distribuzione.
- **Tre stati che non si confondono** (`statoPaziente`): «nessun avviso rilevato» (dati freschi, nessuna regola scattata), «dati insufficienti» (non si sa: senza dati un paziente non è stabile), «monitoraggio interrotto» (in pausa o terminato).
- **Dettaglio del paziente**: parametri attuali con orario, fonte, qualità e modo (continuo o a intervalli); ECG quando c'è; grafici storici con lo stesso asse dei tempi e un cursore solo (15 min, 1 h, 6 h, 24 h, periodo a scelta); soglie configurate; avvisi con il registro delle azioni; assistente; dispositivi con capacità e storico degli abbinamenti. Nei grafici i buchi restano buchi (fascia grigia, la linea si interrompe), le misure a intervalli sono punti e non una linea, i dati arrivati dopo una riconnessione sono cerchi vuoti.
- **ECG**: tracciato a pezzi da 5 s con derivazione, frequenza di campionamento e scala. La pausa ferma la **vista**, non l'acquisizione, e lo si scrive. Nessuna misura né riconoscimento: è un visualizzatore.
- **Avvisi**: di parametro (livello 1 attenzione, livello 2 alta priorità) e tecnici (scollegato, assenza di dati, ritardo, batteria, segnale, sensore, integrazione). Aperto → preso in carico → chiuso, con autore, orario e motivazione. Il **rientro** del parametro non chiude l'avviso: lo segna. Silenziare un paziente tace il richiamo, non l'acquisizione né la registrazione.
- **Regole a versioni**, soglie del singolo paziente, registro delle modifiche.
- **Dispositivi**: che cosa misura ciascuno e come; staccare e abbinare, con la riscrittura del codice del paziente come verifica.
- **Permessi sul server**, quattro distinti (`PUO_MON` in `monitoraggio/catalogo.ts`): consultare (medico, aiuto medico, segreteria, amministrazione), prendere in carico (medico, aiuto medico), modificare le regole (medico, amministrazione), gestire i dispositivi (amministrazione, tecnico). Il tecnico ha la **vista tecnica**: stato dei dispositivi e avvisi tecnici, non valori, grafici, tracciato né riassunti.

## Che cosa è simulato

Tutto il contenuto. La demo che si vede ha **quattro pazienti** inventati (decisione dello studio: tanti saranno i monitorati veri in un mese): uno senza avvisi con due dispositivi, uno con l'avviso di attenzione, uno con l'alta priorità, uno col dispositivo scollegato. Il catalogo completo (`PAZIENTI_DEMO` in `simulatore.ts`, 13 situazioni: anche segnale scarso, batteria bassa, misure a intervalli, tre dispositivi, temperatura alta, ritmo irregolare con dati recuperati, terminato, in pausa) si semina solo con `MONITORAGGIO_DEMO=completa`, come fanno le prove; quelle situazioni si riproducono sui quattro col simulatore. Simulati anche i modelli dei dispositivi (che **non** corrispondono a prodotti in commercio), i medici, le regole (**illustrative**: non sono soglie cliniche). I valori sono funzioni ripetibili di paziente, parametro e orario: attività, frequenza, respiro e tracciato si muovono insieme, e uno scenario li cambia gradualmente. Le notifiche esterne non partono: si registra «non inviata (demo)».

## Come è fatto (sette pezzi separati)

1. **Acquisizione** — adattatori col contratto `Adattatore` (`catalogo.ts`): `leggi({ dispositivi, da, a })` restituisce ciò che è arrivato nell'intervallo, anche dati vecchi consegnati adesso. Ogni dispositivo dichiara le sue `Capacita`: parametro, continuo o a intervalli, campionamento, frequenza d'invio, se tiene i dati quando è scollegato, metodo.
2. **Normalizzazione e validazione** — `normalizza`: parametro non dichiarato, valore assente o non plausibile, orario futuro → la misura **si scarta, non si corregge**. `recuperata` = arrivata molto dopo essere stata presa.
3. **Archiviazione** — migrazione 083: `mon_misure` (valori periodici, con orario di acquisizione e di ricezione, qualità, provenienza, fonte) e `mon_tracce` (segnali ad alta frequenza, a pezzi). I doppioni li ferma un vincolo (`dispositivo, parametro, orario`). Conservazione configurabile in `mon_config` (di serie 24 ore le misure, 60 minuti i tracciati).
4. **Regole** — `regole.ts`, puro e deterministico: soglia, verso, durata minima, numero di misure valide, qualità minima, freschezza, sospensione durante l'attività, soglia di rientro (isteresi), intervallo fra notifiche, silenzio dopo la chiusura, profilo del paziente. Un solo avviso non chiuso per paziente e regola (vincolo nel database); con l'alta priorità aperta non si apre l'attenzione sullo stesso parametro. Ogni avviso tiene chiave e versione della regola e una spiegazione leggibile.
5. **Notifiche** — `mon_notifiche`: interna registrata, esterna predisposta e non inviata.
6. **API e interfaccia** — `api/prototipo/monitoraggio` e `…/[id]`; la pagina si aggiorna ogni 5 secondi cambiando i pezzi, non ricaricandosi.
7. **Assistente** — `assistente.ts`: i fatti li calcola il codice; il testo lo scrive il modello locale (Ollama, niente esce dal Mac); se cita un numero che nei fatti non c'è o usa parole da diagnosi o terapia, si scarta. Senza modello risponde un modello fisso, e lo si dichiara. Non legge il tracciato, non apre e non chiude niente.

Il **motore** (`motore.ts`) gira dentro il server ogni 5 secondi (`src/instrumentation.ts`), anche con tutte le pagine chiuse e con l'AI spenta; `POST /api/cron/monitoraggio` fa un giro a richiesta. Se il server resta fermo più di dieci minuti il periodo resta un buco: non lo si inventa. Si spegne con `MONITORAGGIO_MOTORE=spento`; l'assistente con `MONITORAGGIO_AI=spenta`.

**Demo e reale separati nel database.** Ogni tabella ha `ambiente` e le chiavi esterne lo comprendono; un paziente demo non può avere `patient_id` e in demo entra solo ciò che è `simulato`. Oggi esiste solo l'ambiente demo. La demo nasce quando qualcuno apre la pagina la prima volta.

## Come provare gli scenari

Scheda **Simulatore** (o il riquadro in fondo al dettaglio di un paziente): frequenza alta a riposo, molto alta, bassa, saturazione in discesa, temperatura in salita, pressione alta, ritmo irregolare, torna alla norma; interrompi la connessione e riconnetti (i dati tenuti in memoria arrivano coi loro orari), degrada il segnale, batteria bassa, stacca il sensore, ritarda i dati di 5 minuti. L'avviso scatta quando la regola è soddisfatta (1–3 minuti), non al clic. «Ripristina lo stato iniziale» cancella i dati simulati e riparte; «Spegni il simulatore» ferma i giri.

## Aggiungere un adattatore reale

1. Scrivere un modulo che implementa `Adattatore` e parla col canale del produttore (gateway, applicazione sul telefono, la sua piattaforma). Le credenziali stanno in un file di configurazione sul server, mai nel browser né nel repo.
2. Registrare i dispositivi in `mon_dispositivi` con le capacità **vere** dichiarate dal produttore.
3. Aggiungerlo al giro in `motore.ts`, per l'ambiente `reale`.

Che cosa serve dal produttore, e non si può inventare: API o SDK documentati e un contratto che ne consenta l'uso; parametri, unità, frequenze, se i dati arrivano quasi subito o a lotti; come dichiara qualità, batteria, sensore staccato; come si identifica il paziente (e chi fa l'abbinamento); dove tratta i dati e con quali garanzie (nLPD); se ha un suo algoritmo di classificazione del ritmo, con versione e marcatura. **Nessuna compatibilità è promessa** con prodotti specifici.

## Prima di un uso reale

- **Regolatorio**: un software che sorveglia parametri vitali e genera allarmi è un dispositivo medico (ODmed / MDR, regola 11: classe IIa, IIb se le variazioni possono dare pericolo immediato). Va qualificato e, se del caso, certificato; il visualizzatore ECG con lui.
- **Clinico**: regole scritte e approvate da chi cura (in `reale` una regola vale solo se approvata, e nessuna illustrativa è ammessa: lo impone il database); protocollo di chi guarda, quando, e che cosa fa a ogni livello; reperibilità fuori orario; che cosa si dice al paziente (non è un servizio di emergenza).
- **Tecnico**: prove su ritardi, perdite e doppioni coi dispositivi veri; notifiche esterne con conferma di consegna ed escalation; sorveglianza del motore (oggi la pagina avvisa se il motore è fermo, ma nessuno viene chiamato); continuità del server; analisi dei dati recuperati dopo una disconnessione (oggi entrano come storia e non generano avvisi retroattivi).
- **Dati**: valutazione d'impatto, contratti coi produttori, conservazione, accessi.

## Le prove

`src/lib/prove-monitoraggio.test.ts` (9, pure): normalizzazione, regole (durata, qualità, freschezza, contesto, isteresi, deduplicazione, ricaduta), problemi tecnici, i tre stati, simulatore (ripetibile, graduale, disconnessione e recupero, tracciato senza salti), permessi, assistente. `scripts/e2e/prova-monitoraggio.ts` (23, dentro `npm run test:e2e`): col motore guidato a mano e l'AI spenta — stati dei pazienti, isolamento demo/reale (anche i rifiuti del database), attribuzione di ogni misura al paziente abbinato, doppioni, dati recuperati, un avviso per paziente e regola, presa in carico e permessi, rientro diverso da chiusura, scenario del simulatore, connessione interrotta, regole a versioni, dispositivi riabbinati con lo storico, vista tecnica, riassunto dichiarato «senza AI», ripristino. Numeri in [[Misure/Banchi]].
