---
tipo: decisioni
aggiornata: 2026-09-12
---
# Registro delle decisioni chiuse

Una riga per decisione, con la data e il perché. Non si rilitigano senza un dato nuovo.

| data | decisione | perché |
|---|---|---|
| 2026-07-17 | Palette verde, niente nero; caselle metriche solo su Coda e Follow-up; le tre sezioni della lista d'attesa restano | scelte esplicite dell'utente sul design |
| 2026-07-18 | 2FA accesa solo dopo «Ho salvato i codici» | il refresh post-action faceva sparire i codici (bug trovato) |
| 2026-07-24 | Denoise (afftdn) + atempo insieme come impostazione di serie | confronto a quattro celle: divergenze 65 liscio, 52 solo denoise, 70 solo atempo, 23 insieme |
| 2026-08-14 | Robot MediOnline in SOLA LETTURA | vincolo esplicito dell'utente |
| 2026-08-17 | Anonimizzatore su gemma3:12b, non 27b | non si contende la GPU con whisper |
| 2026-08-23 | Denoise RESTA ACCESO nonostante il set sintetico dica il contrario (riconfermato 5.9.2026) | sull'audio VERO del DPM 7200 whisper senza denoise va in loop (416 frasi-copia su 441); non rilitigare senza un dettato vero con oro verificato dal medico |
| 2026-08 | Niente whisper turbo | rifiutato dall'utente; resta large-v3 |
| 2026-09-05 | Percorso esterno a Infomaniak (gemma-4-31B) con testo pseudonimizzato, fornitori in lista | qualità della correzione; nLPD con controprova doppia |
| 2026-09-07 | Atempo di Moccetti RESTA 0.8 | prova 0.7/0.6/0.5 su DS2 vero: divergenze 11 contro 12/14/15 |
| 2026-09-07 | Ricucitura della punteggiatura orfana nella catena, non in pagina | cambierebbe gli indici delle frasi e butterebbe via le revisioni in corso |
| 2026-09-08 | Voxtral NON diventa il motore principale; whisper resta base con promozione del testimone solo quando serve | i tempi delle parole vengono da whisper; la promozione copre i collassi |
| 2026-09-08 | Niente spezzettamento dell'audio in blocchi da 30 s | il VAD era la causa dei buchi, non la lunghezza; la corsa senza VAD risolve |
| 2026-09-09 | Contesto per medico = dati, non regole in più | più istruzioni = più invenzioni; misurato 2/8 → 6/8 sull'esterno |
| 2026-09-09 | La correzione resta sul modello esterno; Qwen 3.8 leggero sostituisce gemma3:27b e medgemma nelle tappe locali e nell'impaginazione | Qwen 11/17 come i migliori cloud ma 225 s per chiamata («sostituiscilo», strada prudente) |
| 2026-09-09 | Le correzioni umane non addestrano nulla in automatico | principio del sistema di audit; l'unico apprendimento è il dizionario confermato a mano |
| 2026-09-11 | Fase «destinatario dalle note» NON fatta | sui dati reali il destinatario è già giusto 9/11 e le 2 mancanti non hanno indizi nelle note |
| 2026-09-11 | Coerenza interna accesa di serie (`coerenza=1` implicito) | banco 5/5 con 0 falsi allarmi; da rivedere sui dettati veri |
| 2026-09-11 | Documentazione in wiki per argomento (questa), CLAUDE.md ridotto alle regole | il CLAUDE.md era 800 righe di storia narrata |
| 2026-09-11 | La conoscenza degli agenti della catena vive in `Agenti/` e viene COMPILATA nei prompt (attenzioni + esempi finti), niente recupero automatico a ogni chiamata | misurato: arbitro 14→15/15, terapia 7→8/8, gli altri uguali, nessuna regressione; il RAG su pagine intere porterebbe rumore e costi per compiti stretti |
| 2026-09-11 | Whisper fa SEMPRE due passate (con VAD e senza) e vince quella che concorda di più con Voxtral (`REFERTI_PASSATA_DOPPIA`, default acceso); il VAD NON diventa spento di serie | banco VAD su 6 dettati veri: 3 a 3, accordo 735 contro 712; senza VAD un dettato lungo va in loop, col VAD un altro perde 400 caratteri e 2 numeri senza far scattare la sentinella; costo 10-100 s in più per dettato |
| 2026-09-11 | Architettura «memorie diverse + verifica + rischio»: presi il registro dei fatti, il verifier di un'altra famiglia (Qwen 3.5-397B per avvocato/omissioni/coerenza/verificatore), il punteggio di fiducia e il consolidatore notturno; NON presi il grafo del paziente, la memoria episodica sui casi clinici, l'escalation automatica di modello | i primi quattro sono codice deterministico o lavoro già a metà; il grafo e la memoria sui casi sono una cartella clinica primaria (art. 67 LSan, DSFA da chiudere); l'escalation di modello non risparmia nulla dove la revisione umana è obbligatoria e le chiamate costano centesimi |
| 2026-09-12 | Revisione guidata: prima le parole (motori discordi, correzioni automatiche), poi le frasi | richiesta utente dopo il primo referto vero: chi sistema le parole prima trova le frasi già a posto e non le tocca due volte |
| 2026-09-12 | I difetti visti sui referti veri diventano REGOLE DI CODICE con un caso nella suite quando sono meccanici (regia iniziale, segni orfani dopo le note, gruppo di parole ripetuto di seguito, posologie puntate, prefisso privativo), voci di DIZIONARIO quando sono errori d'ascolto ricorrenti, ATTENZIONI nella pagina dell'agente quando servono giudizio | tre referti veri: ogni tappa colpevole è stata individuata con i booleani dell'audit; il codice non regredisce, il prompt sì |
| 2026-09-12 | «assiale» NON va nel dizionario: è una parola vera delle TAC; il colpevole era il glossario fonetico, non l'ascolto | l'audit ha mostrato «massimale» in entrambi i grezzi e «assiale» dopo il dizionario: il glossario ora protegge le parole del medico e non cambia mai la lettera iniziale (caso 38). Lezione: prima di dare la colpa ai motori, guardare gli artefatti tappa per tappa |
| 2026-09-12 | Terapia dalla lettera precedente: NON si inventa; resta il divario più grande con la segretaria (6-8 righe in tutti e tre i confronti) finché lo studio non sceglie la fonte | due strade possibili: lettera precedente caricata in piattaforma prima del dettato, oppure robot MediOnline in sola lettura; decisione dello studio |

## Aperte
- Conservare l'audio per un LoRA futuro; togliere il denoise se arriva un oro verificato dal medico.
- Livello 2 del server (dominio, HTTPS) dopo la parte legale.
- Fonte della terapia precedente per la modalità lettera (vedi la decisione del 12.9.2026).
- Blocco «Allegato:» nel Word dai documenti agganciati alle note per la segreteria (oggi solo in pagina).
- Verificatore su Qwen: sul terzo referto vero 6 frasi «non supportate» su 5 (testo corto): da controllare con «Quale tappa aiuta davvero» se sono falsi allarmi.
