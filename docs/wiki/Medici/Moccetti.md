---
tipo: medico
medico: moccetti
aggiornata: 2026-09-12
---
# Dr. med. Marco Moccetti

Profilo in `pipeline-referti/medici.json` (id `moccetti`): modalità **lettera**, formato **lettera** («Caro <medico>,» / corpo / saluto), `terapia_strutturata: true`, intestazione con Via Pretorio + Tel (senza e-mail: la segretaria mette solo Tel), `atempo` 0.8, `frasi_fisse`, `contesto` (come detta e com'è fatta la sua lettera), `farmaci_frequenti` (63 cardiologici svizzeri curati), vocabolario e dizionario propri.

## Come detta
Molto veloce. Lettere ai colleghi (curante o specialista inviante), spesso con istruzioni parlate alla segreteria, autocorrezioni a voce, punteggiatura dettata. Detta la terapia spesso solo per modifiche ([[Catena/Terapia]]). Sui suoi dettati sono capitati i tre collassi di whisper in tre giorni ([[Catena/Sentinelle e recuperi]]).

## Forma della sua segretaria (dai confronti e da 12 lettere anonimizzate, 11.9.2026)
- Intestazione: a volte «Egregio Signor» / «Gentile Signora», poi «Dr. med. Nome», la specialità («FMH medicina interna generale»), indirizzo o «Via e-mail: …» (o solo «Via e-mail»).
- Data «Lugano, gg.mm.aaaa/pv» (sigla di chi scrive). Titolo «RAPPORTO AMBULATORIALE del gg.mm.aaaa» (8 su 12; anche con due date), variante «VISITA AMBULATORIALE, RAPPORTO» (3). Riga «Paziente» e poi «COGNOME Nome – data di nascita».
- Saluto «Caro Nome,» / «Cara Nome,» (nome del collega) o «Gentile Collega,»; corpo in minuscolo dopo il saluto.
- Apertura ricorrente: «non ritorno sull'anamnesi … già presente nei miei incarti precedenti» (7 su 12), oppure «rivedo in data … il paziente a margine …», «Mi limito ad inviarti…».
- Blocchi con etichetta in riga propria: FRCV, Comorbidità, Allergie e intolleranze, Elettrocardiogramma (formula fissa «ritmo sinusale regolare normocardico con PR nella norma e QRS fine. Assenza di alterazioni specifiche della ripolarizzazione»), Ecocardiogramma (blocco standard copiato dal referto strumentale), Holter (data), cicloergometria («per un carico di N watt … doppio prodotto … pressione al picco … frequenza massima»).
- Misure: «77 Kg per 169 cm, PA 118/71 mmHg, FC 80 bpm»; «FE 62%»; date sempre in cifre; «Ti/Te/Tua» maiuscoli.
- Conclusione: «In conclusione, alla luce degli elementi di cui sopra, …» (8 su 12); poi «Frattanto la terapia in atto rimane invariata», «Dal canto mio un prossimo controllo è da prevedersi…», «A Te chiedo di ricontrollare periodicamente il profilo lipidico e l'evoluzione pressoria», «rimanendo a disposizione…».
- Terapia: blocco «Terapia:» con «NOME dose ⇥ schema»; schema a 3 posti (1-0-0) in 8 lettere e a 4 posti (1-0-0-0) in 4; «IR» = in riserva, «al bisogno», «ogni 2 settimane», «½-0-0»; righe senza dose ammesse. La catena scrive a 4 posti.
- Chiusura «Cordiali e collegiali saluti.» (10 su 12), firma «Dr. med. Marco Moccetti» + «(partito dopo dettatura)»; poi eventuali «Copia: … , in sede» e «Allegato: -…».
Lettera tipo e regole compilate per il modello: [[Agenti/Moccetti]]; Word: [[Catena/Formato lettera e Word]].

## Dizionario (copia viva in `~/referti-pipeline/correzioni-moccetti.json`)
Voci note: tucarografico → elettrocardiografico, prioricamente → periodicamente, sintomatologia scrivibile → ascrivibile, confermatata, cardioriabilitazione, CoroTAC, «e gli giunge» → «egli giunge», «salto all'episodio» → «saltuari episodi», «all'attacco del» → «alla TAC del», rivisata → rivista, «non ritorno sulle note» → «sull'anamnesi», «normoassi cardiaca» → «normocardico», ezetimiba → Ezetimibe, «inibitore pcsk9» → «inibitore del PCSK9», «beta blocco» → «betablocco», «quando è già presente» → «in quanto già presente», RIVA, RCx, «all'atto precedente» → «alla TAC precedente», «all'attacco precedente» → «alla TAC precedente», «riscontrate all'attacco» → «riscontrate alla TAC» (primo referto vero, 12.9.2026: i motori sentono «attacco», il correttore lo faceva diventare «all'atto»; NON «all'atto del», che in italiano esiste). Vocabolario: «asintomatico/asintomatica» (il glossario fonetico lo trasformava in «sintomatico»). Dal secondo referto vero (12.9.2026): «carriota»/«cardio tac» → «CardioTAC», «coro tac» → «CoroTAC», «disnea» → «dispnea», «corriere di saluti» → «cordiali saluti», «tra tanto» → «frattanto», «artefatti a movimento» → «artefatti da movimento», «MT pro BMT»/«NT pro BNP»/«enti pro BNP» → «NT-proBNP». Le voci nuove confermate nel cruscotto finiscono in `correzioni-moccetti-piattaforma.json`.

## Decisioni su di lui
Atempo: provati 0.7/0.6/0.5 sul primo dettato vero (DS2, 65 s): divergenze 11 a 0.8 contro 12/14/15 → RESTA 0.8 (7.9.2026, ombre scartate). Vedi [[Decisioni/Registro]].
