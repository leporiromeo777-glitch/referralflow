---
tipo: medico
medico: moccetti
aggiornata: 2026-09-11
---
# Dr. med. Marco Moccetti

Profilo in `pipeline-referti/medici.json` (id `moccetti`): modalità **lettera**, formato **lettera** («Caro <medico>,» / corpo / saluto), `terapia_strutturata: true`, intestazione con Via Pretorio + Tel (senza e-mail: la segretaria mette solo Tel), `atempo` 0.8, `frasi_fisse`, `contesto` (come detta e com'è fatta la sua lettera), `farmaci_frequenti` (63 cardiologici svizzeri curati), vocabolario e dizionario propri.

## Come detta
Molto veloce. Lettere ai colleghi (curante o specialista inviante), spesso con istruzioni parlate alla segreteria, autocorrezioni a voce, punteggiatura dettata. Detta la terapia spesso solo per modifiche ([[Catena/Terapia]]). Sui suoi dettati sono capitati i tre collassi di whisper in tre giorni ([[Catena/Sentinelle e recuperi]]).

## Forma della sua segretaria (dai confronti)
Destinatario su più righe, «Gentile Signora» per le donne, date in cifre «02.09.2026», titolo «RAPPORTO AMBULATORIALE del <data visita>», corpo in minuscolo dopo il saluto, chiusura fissa, firma su tre righe, blocco «Terapia:» in ogni lettera anche se non ridettato, niente riga «Copia» ([[Catena/Formato lettera e Word]]).

## Dizionario (copia viva in `~/referti-pipeline/correzioni-moccetti.json`)
Voci note: tucarografico → elettrocardiografico, prioricamente → periodicamente, sintomatologia scrivibile → ascrivibile, confermatata, cardioriabilitazione, CoroTAC, «e gli giunge» → «egli giunge», «salto all'episodio» → «saltuari episodi», «all'attacco del» → «alla TAC del», rivisata → rivista, «non ritorno sulle note» → «sull'anamnesi», «normoassi cardiaca» → «normocardico», ezetimiba → Ezetimibe, «inibitore pcsk9» → «inibitore del PCSK9», «beta blocco» → «betablocco», «quando è già presente» → «in quanto già presente», RIVA, RCx. Le voci nuove confermate nel cruscotto finiscono in `correzioni-moccetti-piattaforma.json`.

## Decisioni su di lui
Atempo: provati 0.7/0.6/0.5 sul primo dettato vero (DS2, 65 s): divergenze 11 a 0.8 contro 12/14/15 → RESTA 0.8 (7.9.2026, ombre scartate). Vedi [[Decisioni/Registro]].
