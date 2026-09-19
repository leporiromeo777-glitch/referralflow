---
tipo: misure
aggiornata: 2026-09-18
---
# Banchi e misure

Ogni banco usa SOLO dati sintetici. Le chiamate al modello esterno costano centesimi e vanno annunciate prima ([[Regole/nLPD e sessione]]).

| data | banco | comando | risultato |
|---|---|---|---|
| 2026-07-24 | denoise/atempo su dettato di prova | quattro celle | divergenze 65 / 52 / 70 / 23 (insieme) |
| 2026-08-23 | set d'oro sintetico senza denoise | `~/referti-dataset` | WER 26.5% → 23.6%, ma audio vero in loop → denoise resta |
| 2026-09-05 | pagella pesata senza denoise | set sintetico | 19.3 → 18.6; audio vero 12.5k → 10.3k caratteri → resta acceso |
| 2026-09-07 | atempo Moccetti | `prova-atempo.sh` su DS2 65 s | divergenze 11 (0.8) / 12 (0.7) / 14 (0.6) / 15 (0.5) |
| 2026-09-09 | correttori locali e cloud | `~/referti-dataset/banco-locali.py`, `banco-correttori.py` | Qwen 3.8 IQ4_XS 11/17 (225 s), Qwen 3.5-397B e deepseek 11/17, gemma-4-31B 10/17, gemma3:27b 4/17, medgemma 0/17 (877 s) |
| 2026-09-09 | contesto per medico (8 errori d'ascolto) | una prova per condizione | esterno 2/8 → 6/8 (2 s → 21 s); gemma3:27b 4/8 → 3/8; Qwen locale 4/8 → 6/8 (27-42 s → 61-75 s) |
| 2026-09-09 | omissioni | `pipeline-referti/banco-omissioni.py [--modello]` | codice 1/9 (0 falsi); modello 8/9, 0 falsi allarmi (~CHF 0.01) |
| 2026-09-09 | terapia (5 casi) | `banco-terapia.py [--modello]` | codice 5/5, modello 5/5 (~CHF 0.002) |
| 2026-09-11 | arbitro (15 divergenze) | `banco-arbitro.py [--locale] [--solo-nuovo]` | prompt vecchio 13/15, nuovo 14/15 (15/15 al netto delle maiuscole), col contesto 14/15; col codice vecchio 10/15 di fatto |
| 2026-09-11 | terapia (8 casi, con modifiche) | `banco-terapia.py --modello` | codice 8/8, modello 7/8 (nota clinica nella riga → guardia aggiunta) |
| 2026-09-11 | coerenza interna (10 referti) | `banco-coerenza.py` | richiamo 5/5, falsi allarmi 0, 48 s |
| 2026-09-11 | dizionario dalle correzioni (dati reali, solo conteggi) | script una tantum | 5 revisioni, 56 REPLACE, 20 candidate → 19 proposte, 1 ricorrente, 12 «altro» |
| 2026-09-11 | conoscenza dalla wiki nei prompt (attenzioni + esempi finti, [[Agenti/Come funziona]]) | i quattro banchi sopra, `REFERTI_CONOSCENZA=0` per il confronto | arbitro 14/15 → **15/15**; terapia modello 7/8 → **8/8**; omissioni 8/9 → 8/9 (lateralità sola ancora persa); coerenza 5/5, 0 falsi → uguale. Nessuna regressione, tenuta |
| 2026-09-11 | omissioni, lateralità sola nel codice | `banco-omissioni.py` | codice 1/9 → 2/9, 0 falsi allarmi |
| 2026-09-11 | VAD contro senza VAD sull'audio vero conservato (6 dettati, accordo col testimone B) | `banco-vad.py [N]` dalla copia viva `~/referti-pipeline/` (servono i modelli; solo numeri) | 3 a 3; accordo totale VAD 735, senza VAD 712; senza VAD un dettato lungo in loop (108 righe tolte, accordo 152 vs 201); col VAD un altro perde 400 caratteri e 2 numeri (accordo 93 vs 117) senza sentinella → passata DOPPIA sempre |
| 2026-09-11 | verificatori su un'altra famiglia (`modello_verifica=Qwen/Qwen3.5-397B-A17B-FP8`) | `banco-coerenza.py`, `banco-omissioni.py --modello` | coerenza 5/5, 0 falsi (uguale a gemma); omissioni modello 7/9 contro 8/9 di gemma (perde «T difasica» nella frase lunga; la lateralità la prende il codice) → tenuto per l'indipendenza dal correttore, da rivedere sui dati veri con «Quale tappa aiuta davvero» |
| 2026-09-12 | forma dell'impaginazione: lettera tipo + regole dalla wiki (da 12 lettere anonimizzate di Moccetti), modello locale Qwen 3.8 | `npm run banco-forma` (dettato finto, 12 tratti della forma della segretaria) | senza 7/12 → con **12/12**, ~60 s per corsa. Prima del risultato due guardie scartavano la lettera giusta: il lucchetto delle relazioni (misura riconosciuta solo nella lettera) e la firma numero+unità («chili» vs «Kg») → corretti nel codice con test |
| 2026-09-12 | PRIMO REFERTO VERO con la catena nuova (Moccetti, DS2 di 94 s, solo numeri dal log) | `~/referti/log/servizio.log` | 4½ min in tutto; passata doppia: vince senza VAD (accordo 82 → 94); 10 divergenze, arbitro 9 punti / 3 scelte B; correzione 6 riparazioni (4 scartate), verificatore Qwen 9 correzioni riviste / 2 rifiutate; terapia 2 righe + 1 dubbio; omissioni 0 (1 proposta scartata); coerenza 1; fiducia 61/100, 10 fatti, 7 sotto 0.5. Dal Word puro anonimizzato: forma giusta al 90%; due difetti corretti (nome del farmaco su Aspirin-C, Zenon non trovato → elenco del medico; data futura non segnalata → fatto «data»). Correzioni della persona sul testo: 5 (anno di una data, «all'atto» → «alla TAC» → dizionario, «sintomatica» → «asintomatica» già segnalata dalla coerenza, un «ti» mancante, una frase tolta); il blocco Terapia non è stato corretto. Contro la LETTERA DELLA SEGRETARIA (anonimizzata): contenuto uguale salvo tre difetti della catena, tutti ricondotti a una tappa con l'audit (solo booleani): (a) «asintomatica» sentita da ENTRAMBI i motori e trasformata in «sintomatico» dal glossario fonetico → guardia sul prefisso privativo (caso 35); (b) «all'attacco» (entrambi i motori) → il CORRETTORE l'ha fatto diventare «all'atto» → voci di dizionario a monte; (c) «con maggiore frequenza» inventata dall'IMPAGINAZIONE (parola aggiunta passata perché ≤ 6) → «maggior/minor/frequen/eventualment» tra le parole pesanti. Terapia: la segretaria ha 6 righe con dosi (4 dalla lettera precedente, che la piattaforma non aveva). Data della lettera: la segretaria usa il giorno del dettato → adottato |

| 2026-09-12 | SECONDO REFERTO VERO (Moccetti, DS2, Word puro NON impaginato; corrisponde alla lettera 05 delle dodici) | log + booleani sull'audit | passata doppia: resta la VAD; 20 divergenze, arbitro 18 punti / 6 scelte B (una sbagliata: «Corriere di saluti» presa da Voxtral); segreteria 0 note → la regia iniziale «Detto la lettera… e scrive» è rimasta nel referto → regola di codice `stacca_apertura_dettatura` (caso 36); errori d'ascolto in nessuno dei due motori: «carriota» (CardioTAC), «disnea», «MT pro BMT» (NT-proBNP), «tra tanto», «artefatti a movimento» → dizionario; «1.0.0» → `_posologie_puntate`; terapia 3 righe 0 dubbi; fiducia 32/100 bassa (21 fatti, 9 sotto 0.5): giusta, era un dettato difficile. Versione corretta dalla persona: 3 correzioni (cardio TAC, potenzio, Cordiali saluti) e DUE «omissioni» rimesse in doppio (erano la stessa frase con parole storpiate: «affronte», «antipro bnt») → sovrapposizione sulla frase pulita + parole simili + «simile» nel wizard; e l'endpoint scartava `pulita` (rimesse grezze). Lettera della segretaria: contenuto identico al dettato corretto, terapia 8 righe dalla lettera precedente |

| 2026-09-12 | TERZO REFERTO VERO (Moccetti, DS2 di 70 s, 110 parole, Word puro NON impaginato) | log + Word anonimizzato | 3 min 50 s; passata doppia: resta la VAD (seconda passata non migliore); 15 divergenze, arbitro 9 punti / 2 scelte B; correzione 1 riparazione, 3 note per la segreteria, 1 frase senza senso; verificatore Qwen 2 riviste / 1 rifiutata, 6 «non supportate» su 5 frasi (da guardare: sospetti falsi allarmi su un testo corto); bella copia 1 accettata / 3 scartate; doppioni AI 0; terapia nessun farmaco; cifre 4 sentite / 5 presenti / 0 mancanti; omissioni codice 0, modello 1 tenuta; coerenza 0; fiducia 75/100 media (12 fatti, 7 sotto 0.5). Dal Word: (a) la regia era «Lettera al dottor Y, caro Y» senza «e scrive» → tolta dal modello, ma restava «, caro Persona 1», «previsti:, Il», «poi ,», «negativo, . Pertanto» → `ricuci_segni` (caso 37); (b) «l'ecocardiogramma da sforzo» detto due volte di fila nella stessa frase, l'AI dei doppioni non lo vede → `_ripetizioni_immediate` (caso 37); (c) «anamnese» → dizionario; (d) «previsto i:» (desinenza staccata da «previsti») → attenzione ed esempio nella pagina del correttore, non misurabile con `banco-correttori.py` (non usa la conoscenza compilata). Versione corretta dalla persona: 7 correzioni, 5 già coperte dal codice/dizionario nuovi, «(assiale)» era «massimale»: dall'audit (solo booleani) ENTRAMBI i motori l'avevano sentito giusto e il GLOSSARIO FONETICO l'ha trasformato in «assiale» (distanza 2, «deviazione assiale» nel vocabolario base, parole del medico non conosciute dal glossario) → protezione delle parole del medico + stessa lettera iniziale (caso 38), oltre a frase fissa + vocabolario, il resto (date in cifre, «A Te», «In conclusione», chiusura) sono regole di forma dell'impaginazione non usata. Lettera della SEGRETARIA: contenuto identico salvo «degli esami strumentali a suo tempo previsti» (plurale: la «i» staccata era la desinenza, attenzione del correttore riscritta così), «Ecocardiogramma da sforzo (massimale)» (le parentesi erano dettate), «Duplex carotideo del 29.07.2026: non mostra stenosi» (forma a etichetta); terapia 8 righe dalla lettera precedente che la piattaforma non ha (terza volta su tre); blocco «Allegato:» con i due esami e la data dell'eco presa dalla cartella (non dal dettato): la piattaforma mostra le note «da allegare» in pagina ma non scrive il blocco nel Word; intestazione con FMH e indirizzo dalla rubrica (in piattaforma arriva se il destinatario è in rubrica), sigla «/pv» = chi scrive (in piattaforma è la sigla di chi conferma) |

| 2026-09-12 | NEMOTRON in locale (richiesta utente): Nemotron 3 Nano 30B-A3B (IQ4_XS, 18 GB) e 4B (q8) sul Mac mini M4 24 GB | `~/referti-dataset/banco-locali.py`, `banco-arbitro.py --locale` con `REFERTI_LLM_CORREZIONE` | correzione: 30B a temperatura 0 va in LOOP (stessa riga 65 volte, JSON mai chiuso, 4000 gettoni, 143-156 s) anche col pensiero spento; con `repeat_penalty` 1.15 risponde in 3 s ma propone 2 riparazioni → **1/17** (Qwen 3.8 27B: 11/17); 4B: 0/17 in 13 s. Arbitro (15 divergenze, contesto Moccetti): 30B **13/15** in 32 s (Qwen 3.8: 15/15), sbaglia le due esche in cui B aggiunge una parola che contraddice il contesto. Nel codice restano `think=False` e `repeat_penalty` 1.15 per i modelli Nemotron. Verdetto: non sostituisce Qwen 3.8 in nessuna tappa |

| 2026-09-13 | flag di whisper sui 13 dettati conservati: di serie contro `-nf` (niente risalita di temperatura) e `-et 2.0` (soglia di entropia) | `banco-whisper-flag.py nf=-nf et=-et,2.0` dalla copia viva | pari in 12 dettati su 13; accordo totale col testimone B: serie 1835, `-nf` 1799 (peggio su un dettato lungo: 42 righe in loop e −37 di accordo), `-et 2.0` 1835 (identico); numeri solo in B 38/39/38; tempi 548/588/539 s. Verdetto: la configurazione di serie resta |
| 2026-09-14 | forma della lettera dopo la richiesta del medico: corpo in UN paragrafo, chiusura «Cordiali saluti,» e firma «Marco» | `npm run banco-forma` (12 tratti, dettato finto) | senza lettera tipo 9/12 · con lettera tipo e regole **12/12**, 70 s, 1 parola aggiunta |

## Orchestrazione delle sale (16.9.2026)
Prima giornata vera passata dal gemello (mercoledì 16.9, 68 appuntamenti di cui 56 nel piano): baseline del mattino con **CP-SAT ottimo in 1,45 s**, 0 visite senza sala, 8 medici, 8 stanze, 5 appuntamenti con colore non abbinato a una prestazione. Ripianificazioni in giornata (evento → solver sull'orizzonte di 90 min): 10-25 ms. Prova sintetica del solver (2 medici, 4 visite, 3 stanze, un assistente): ottimo in 8 ms, i due medici mai nella stessa stanza, le preparazioni serializzate sull'assistente. `npm run banco-durate`: «troppo poche osservazioni» — il predittivo resta spento.

Suite permanente: `python3.14 pipeline-referti/prove-catastrofiche.py` → 38/38 (12.9.2026). Test app: `npm run test:app` → **190** (18.9.2026, [[Piattaforma/Revisione del 18.9.2026]]: +2 le prese di una stanza sono intervalli distinti e due visite lontane non la tengono tutto il giorno, +2 un sì/no non riconosciuto non diventa «sì» e un elenco numerato a colonna 0 vale, +1 percorsi non indentati, +1 date impossibili, +1 il taglio CONTESTO/DOMANDA solo a inizio riga; e tre test riscritti perché provavano un'altra cosa rispetto a quella che dichiaravano) · già 171 (16.9.2026: +1 l'arrivo segnato da una persona porta dritto in sala d'attesa, +1 la pagina Visite; già 169: +15 orchestrazione — pagina delle prestazioni, stanze possibili con esclusive e vincoli, macchina a stati e rigidità, previsione a tre livelli, riparatore con medico mobile e mai due medici insieme, orizzonte e soglie, spiegazioni, lettura in forma fissa dei due modelli) · già 154 (16.9.2026: +1 due medici diversi mai nella stessa stanza alla stessa ora) · già 153 (16.9.2026: +1 nessuno finisce con due stanze, ma lo scambio passa) · già 152 (16.9.2026: +1 la stanza sua viene prima fra quelle ammesse, +1 una proposta confermata non si chiama «a mano») · già 150 (16.9.2026: +1 correzione a mano che viola una regola) · già 149 (16.9.2026: +1 agende fuori dal piano, +1 buco sotto la mezz'ora, e le prove delle fasce libere riscritte sulla presa) · già 147 (16.9.2026: +2 vincolo «Solo in» — più stanze ammesse per persona, separate con «o», e i vincoli scritti nel testo che va al modello) · già 145 (16.9.2026: +6 ricerca clinica esterna — le sette sezioni della risposta lette su righe multiple, le sezioni mancanti dichiarate invece che ricucite, fonti una per riga, link/DOI/PubMed segnalati come non verificabili, il testo che rientra tagliato prima di entrare in un altro prompt, porta chiusa se manca il controllo) · già 139 (16.9.2026: +6 contesto clinico, +9 sale) · già 88 (14.9.2026 notte: +10 domanda medica — riformulazione generale, nomi propri anche a inizio frase, eponimi clinici, avvisi che non bloccano) · già 78 (14.9.2026 notte: +3 controllo della fatturazione — sospese oltre 7 giorni, stati non fatturabili esclusi, stato nel CSV) · già 75 (14.9.2026 notte: +3 anagrafica e CSV pazienti, +3 catalogo prestazioni) · già 69 (14.9.2026 sera: +3 percorsi, +3 moduli, +3 fatturazione — parser delle pagine wiki, validazione, CSV) · già 60 (14.9.2026: +3 forma della lettera, un paragrafo solo e chiusura dal profilo) ·  già 57 (14.9.2026: +4 briefing, +7 procedure, +4 registro e organizzazione, +6 interprete, +1 divagazioni, +1 lucchetto delle relazioni su frase riformulata) casi. Diagnosi del 14.9.2026 sul referto vero che non si impaginava: firma numerica identica, lucchetto scattato su «Frequenza cardiaca: 50, 99 → 99»; con la regola corretta la stessa lettera passa in 117 s con 5 parole aggiunte leggere.

**Anonimizzazione dall'interfaccia nuova** (14.9.2026, testo inventato con nome, nascita, indirizzo, AVS, telefono, e-mail): 8 sostituzioni, nessun nome o luogo rimasto, misure cliniche intatte, 16 s con gemma3:12b.

**Banco dell'interprete delle domande scritte** (13.9.2026, 7 frasi con refusi e parafrasi, pazienti di prova): 4 risolte dal codice in ~1 ms con sicurezza alta («ciusura mensile», «ci sono lettere ferme?»), 2 casi grigi confermati dal modello locale in 2,6-4,1 s, 1 lasciata libera perché davvero ambigua («il referto di Bernasconi si può mandare?»). Prima del banco il modello sceglieva tra candidati e su «controlli in scadenza» preferiva il controllo pre-firma ai richiami: ora conferma o nega solo il candidato del codice ([[Piattaforma/Procedure e tracce]]).

Dati reali osservati (solo numeri): destinatario estratto = confermato in 9 bozze su 11 (11.9.2026); collassi di whisper: 3 in 3 giorni sullo stesso medico (7-9.9.2026).

Banco della riformulazione (14.9.2026, gemma3:12b, 6 domande **inventate**): 6/6 riscritte in forma generale senza nomi, date, telefoni né luoghi, con la sostanza clinica intatta; 3,5-6,3 s ciascuna. Due difetti trovati e corretti al primo giro: «Holter» bloccato come se fosse un cognome (lista degli eponimi) e l'avviso «un paziente» che scattava su ogni riformulazione buona (ora avvisa solo il determinativo e il possessivo).

## Banco della domanda medica (14.9.2026)
`npm run banco-domanda-medica` — 10 domande di medicina generale (già nella forma riscritta: **senza dati di nessuno**) su 5 modelli dell'account Infomaniak più il modello locale. Le risposte finiscono mescolate e anonime in `~/banco-domanda-medica.md`; il voto del medico è da raccogliere.

| modello | tempo medio | token in | token out | ragionamento (car.) | risposte mancate |
| --- | --- | --- | --- | --- | --- |
| Qwen 3.5 397B | **24,0 s** | 1 065 | **22 019** | 70 449 | **2/10** |
| Kimi K2.6 | 15,2 s | 1 439 | **22 243** | 61 954 | **2/10** |
| Mistral Small 4 119B | **2,4 s** | 1 197 | 5 006 | — | 0 |
| Apertus 70B (svizzero) | 4,4 s | 1 667 | 3 042 | — | 0 |
| gemma 4 31B (quello della catena) | 4,4 s | 1 128 | 3 311 | — | 0 |
| modello locale sul Mac | 20,5 s | 1 098 | 2 636 | — | 0 (gratis) |

Conclusione **prima** del giudizio clinico: i due modelli di ragionamento sono della forma sbagliata per una chat. Consumano **sette volte** i token in uscita, impiegano 6-10 volte il tempo, e **due volte su dieci il ragionamento esaurisce il tetto e non arriva alla risposta** — con i token pagati lo stesso. Al primo giro (tetto 900) sbagliavano 10 volte su 10 e restituivano il vuoto: senza banco si sarebbe concluso «non funzionano».

Lezione per la catena: se un giorno si alza il modello di generazione su un modello di ragionamento, **il tetto dei token va alzato** e il codice deve leggere `message.reasoning` / `<think>`, altrimenti la catena torna a mani vuote pagando.

**Controllo dei fatti su due domande a risposta secca** (il voto clinico resta di Moccetti; qui solo ciò che è verificabile):

| | apixaban in insufficienza renale moderata | soglia domiciliare dell'ipertensione |
| --- | --- | --- |
| gemma 4 31B | **corretta** (≥2 criteri fra età ≥80, peso ≤60 kg, creatinina ≥1,5; la sola IR non riduce) | **corretta** (135/85 vs 140/90) |
| Kimi K2.6 | assente | **corretta**, la più precisa delle sei |
| Qwen 3.5 397B | assente | corretta |
| Apertus 70B | vaga, e confonde clearance 15-29 con eGFR 30-50 | corretta |
| Mistral Small 4 119B | quasi giusta, ma «controindicato sotto 30» è **falso** (EMA: 2,5 mg × 2 fino a CrCl 15) | **sbagliata**: dà 130/80, la soglia americana, come se fosse l'unica |
| modello locale sul Mac (12B) | **sbagliata e pericolosa**: «2,5 mg × 2 se ≥60 kg, 2,5 mg × 1 se <60 kg» — posologia inesistente | numero giusto, ma **inverte** camice bianco e ipertensione mascherata |

Conseguenza sul codice, il 14.9.2026: la «domanda medica» **non risponde più col modello locale**. Senza un modello misurato collegato restituisce la domanda riscritta e dice che non parte. Una risposta plausibile e sbagliata su un dosaggio è peggio di nessuna risposta.

### Giro completo con Claude (15.9.2026, 8 modelli, 80 risposte)

| modello | tempo medio | token out | mancate |
| --- | --- | --- | --- |
| gemma 4 31B | **3,7 s** | 2 990 | 0 |
| Claude Haiku 4.5 | 4,5 s | 3 679 | 0 |
| Apertus 70B | 4,8 s | 3 384 | 0 |
| Mistral Small 4 119B | 5,3 s | 5 779 | 0 |
| **Claude Sonnet 5** | 11,0 s | 8 158 | 0 |
| Kimi K2.6 | 16,9 s | 22 084 | 2 |
| Qwen 3.5 397B | 17,9 s | 19 854 | 1 |
| modello locale sul Mac | 22,1 s | 2 636 | 0 (gratis) |

Controllo dei fatti sulle stesse due domande: **Claude Sonnet 5 corretto su entrambe e il più preciso degli otto** — è l'unico che nomina esplicitamente la confusione su cui inciampano gli altri («la sola insufficienza renale moderata NON impone la riduzione, a differenza di dabigatran ed edoxaban») e l'unico che dà la tabella completa delle soglie pressorie (ambulatorio, domiciliare, ABPM 24 h/diurno/notturno). **Claude Haiku 4.5 sbaglia un criterio di dosaggio**: scrive «età ≥60 anni» dove sono ≥80, e dà l'apixaban per controindicato sotto 30 mL/min. Resta confermato **gemma 4 31B**: corretto su entrambe, il più veloce di tutti, zero risposte mancate.

Nota di metodo: la chiave Anthropic del primo tentativo è stata invalidata fra la verifica e il banco (401 su dieci chiamate su dieci) — una chiave scritta in un canale scansionato viene disattivata da sola. Da lì `--solo`, che rigira un concorrente e fonde con l'archivio invece di ripagare tutti.

**Effetto del contesto svizzero nel prompt** (15.9.2026, misurato rigirando il solo gemma 4 31B con `--solo`): le unità passano da americane a SI — prima «Creatinina sierica ≥ 1,5 mg/dL (133 µmol/L)», dopo «≥ 133 µmol/L (1.5 mg/dL)» — e compare il riferimento a Compendium ed ESC. Sulla pressione distingue ora esplicitamente ipertensione mascherata e da camice bianco, che il modello locale invertiva. Costo del prompt: da ~110 a ~405 token in entrata per domanda, cioè niente. Test app: **94**.

**Prova end-to-end della domanda medica** (15.9.2026, paziente inventato). Scritta dal medico: nome, data di nascita, telefono, «creatinina 118, peso 54 kg», apixaban 5 mg × 2. Primo esito: la riformulazione toglieva nome, data e telefono — ma buttava via anche **«peso 54 kg»**, che è uno dei tre criteri che decidono la risposta: la risposta restava corretta in generale e inutile nel caso. Corretto il prompt («non eliminare i dati che DETERMINANO la risposta: trasformali in categorie»), la riscritta diventa «paziente con fibrillazione atriale permanente, insufficienza renale lieve, peso inferiore a 60 kg, in apixaban 5 mg × 2 da due anni» — criteri salvi, identità sparita. Risposta da Infomaniak in 3,4 s, con i criteri in µmol/L e il riferimento a Swissmedic.

## Quale modello per il piano delle sale (15.9.2026)
Stesso testo della catena, dati veri di **mercoledì 16.9** — una giornata con due caselle aperte (Sala 5 e Sport 3 condivise fra Pedrotti e Franscella), quattro stanze vuote e 21 visite senza sala. Provato prima su martedì: **inutile**, perché le regole avevano già sistemato tutto e restavano solo appuntamenti senza titolare d'agenda, che nessun modello può assegnare. Un banco su una giornata senza problema misura solo la fantasia del modello.

| modello | tempo | assegnazioni leggibili | scartate | affermazioni false | visite sistemate |
| --- | --- | --- | --- | --- | --- |
| **gemma3:12b** | **19,7 s** | 3 | 1 | 0 | **18 / 21** |
| deepseek-r1:14b | 106,1 s | 3 | 1 | 0 | si contraddice |
| nemotron-3-nano:4b | 46,0 s | 1 | 0 | 0 | 5 / 21 |
| qwen3:14b | — | **timeout a 600 s, due volte su due** | | | |
| Qwen3.8-27B IQ4_XS (15,2 GB) | 520 s | 4 | 13 | 0 | 19 / 21 |
| qwen3.8:27b (17,7 GB) | — | **timeout a 600 s anche con 17 GB liberi**; risposta vuota tre volte su tre durante il lavoro | | | |

**Scelto gemma3:12b**, lo stesso modello della catena. Ha assegnato Sala 5 a Franscella (spiegando: ha più visite di Pedrotti), Sport 1 a Pedrotti, Sport 2 a Paveri, e ha detto che la visita singola di Moccetti non merita una stanza in più.

Tre cose imparate, che valgono oltre questo banco:
- **deepseek-r1 ha dato la stessa stanza a due persone** e la stessa persona a due stanze. Il punteggio grezzo lo premiava («21 visite sistemate»): il difetto era nel banco. Ora `leggiProposta` rifiuta le righe che si contraddicono, con un test che usa la risposta vera di deepseek.
- **qwen3:14b sembrava il migliore** perché era stato giudicato su un'unica risposta fortunata. Ripetuto, si impianta: dieci minuti senza arrivare alla risposta.
- **La Qwen 3.8 in quantizzazione stretta (15,2 GB) risponde**, ed è la migliore per contenuto — 19 visite su 21 — ma ci mette **otto minuti e mezzo** e scrive pagine di ragionamento ad alta voce in inglese prima delle righe buone: 13 righe scartate dal lettore su 17. Come qualità vale un posto; come strumento costa 26 volte gemma per una visita in più.
- **La Qwen 3.8 piena (17,7 GB) non risponde nemmeno a macchina libera**: timeout a dieci minuti con 17 GB disponibili. Non era solo memoria — su questo Mac è troppo lenta e basta. L'unica risposta riuscita, 72 s alle 04:00 del 15.9, va considerata un caso fortunato e non una misura.
- **Il 27B non è utilizzabile su questa macchina durante il lavoro**: 18 GB su 24, e quando è caricato restano 90 MB liberi — risponde vuoto perché non ha spazio per il proprio contesto. Con tutto il resto spento il Mac usa meno di 7 GB: non è la macchina a essere piccola, è quel modello a non entrarci.

## Contesto clinico da mandare fuori (16.9.2026)
Due **cartelle inventate** (scompenso + rene, fibrillazione + endoscopia) con dentro identificatori piantati apposta: nome, data di nascita, AVS, telefono, e-mail, indirizzo, numero paziente, medico curante, ospedale. Si misura chi se li porta fuori, chi perde i fatti che determinano la risposta, chi lascia la domanda puntata su una persona e chi scrive l'età esatta.

| modello | tempo | caratteri | fughe | fatti tenuti | domande non generali | età esatta |
| --- | --- | --- | --- | --- | --- | --- |
| **gemma3:12b** | 19,6 s | 593 | **0** | **10/10** | **0/2** | **0/2** |
| medgemma 1.5 4B | 8,0 s | 467 | 0 | 10/10 | **1/2** | **1/2** |
| nemotron-3-nano 4B | 9,4 s | 459 | 0 | 9/10 | 0/2 | 0/2 |

**Scelto gemma3:12b.** Scrive «uomo sui settant'anni», «eGFR intorno a 30», e riscrive davvero la domanda in forma generale.

Da ricordare più del risultato: **il primo punteggio assolveva tutti e tre**, perché guardava solo identificatori e fatti. Leggendo le risposte, medgemma ricopiava la domanda del medico parola per parola («in questo paziente») e scriveva «donna di 78 anni», e nemotron aveva perso la fibrillazione atriale — cioè il motivo per cui la paziente prende l'anticoagulante. I due controlli mancanti sono stati aggiunti al banco e poi al prodotto.


## Righello (immagini) — 19.9.2026

| Banco | Che cosa | Esito |
|---|---|---|
| `imaging/prova-calibrazione.py` | lettore di calibrazione su DICOM sintetici: PixelSpacing riga/colonna, RM enhanced, regioni eco (M-mode scartata), delta negativo, ImagerPixelSpacing distinto, assenza, spacing nullo, comando e campo in `meta` | 9/9 |
| `src/lib/prove-imaging-misura.test.ts` | il calcolo sul file `misura.js` vero: isotropo, anisotropo, simmetria, regioni, bordi, rifiuti, scala schermo→nativo, formato, motivi | 13/13 |
| end-to-end sul DB demo (server di prova, due esami sintetici) | importazione con calibrazione; 100 px → 20,0 mm (eco) e 50,0 mm (TAC) dal server; 200 px verticali → 40,0 mm; rifiuti; registro «misurato»; annullamento tracciato; CSV; segreteria 403 | 18/18 + 403 |
| browser (server di prova) | tasto Misura, trascinamento 200 px sulla barra verticale → «Misura: 40,0 mm», salvataggio, disegno sul fotogramma, elenco con annullata barrata | ok |
| `npm run test:app` | tutta l'app | 212/212 |
