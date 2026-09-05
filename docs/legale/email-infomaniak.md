# Due email a Infomaniak (da inviare dal titolare dello studio)

Bozze del 5 settembre 2026. Da inviare a: support@infomaniak.com oppure dal
manager Infomaniak → «Assistenza» → AI Tools / API, mettendo in copia il
legale. Mandarle separate: la prima è contrattuale (DPO/legale), la seconda
tecnica (team AI Tools).

## Email 1 — Contratto di trattamento e uso dei dati (DPO)

Oggetto: Richiesta DPA e conferma trattamento dati — API AI Tools (account
Centro Cardiologico Ticino)

Buongiorno,

il nostro studio medico (Centro Cardiologico Ticino, Lugano) usa le vostre
API «AI Tools» (endpoint OpenAI-compatibile, modelli tra cui
google/gemma-4-31B-it) per correggere e impaginare testi anonimizzati di
referti medici. I testi sono anonimizzati prima dell'invio (nomi, date,
identificativi sostituiti da segnaposto) e non contengono audio.

Per la nostra valutazione d'impatto (art. 22 LPD) vi chiediamo di
confermare per iscritto, o di indicarci dove sia già disciplinato:

1. La disponibilità di un contratto di trattamento dei dati (DPA / ADV) ai
   sensi dell'art. 9 LPD per il servizio AI Tools, e come sottoscriverlo.
2. Che i prompt e le risposte inviati tramite API NON vengono usati per
   addestrare o migliorare modelli, né da voi né da terzi.
3. Il periodo di conservazione dei prompt, delle risposte e dei log
   applicativi delle chiamate API (in giorni), e se è possibile chiederne
   la disattivazione o la riduzione.
4. Il luogo fisico dei server che eseguono l'inferenza (data center in
   Svizzera?) e l'eventuale ricorso a sub-responsabili fuori dalla Svizzera.
5. Il vostro referente per la protezione dei dati (DPO).

Grazie per la collaborazione.

Cordiali saluti,
Dr. med. Marco Moccetti
Centro Cardiologico Ticino

## Email 2 — Domande tecniche (team AI Tools)

Oggetto: API AI Tools — response_format json_schema, modelli e limiti

Buongiorno,

usiamo le vostre API AI Tools in modalità OpenAI-compatibile con il modello
google/gemma-4-31B-it. Tre domande tecniche:

1. Abbiamo verificato che il parametro `response_format` con
   `{"type":"json_schema","json_schema":{"strict":true,...}}` viene
   accettato e rispettato, ma non lo troviamo nella documentazione. È una
   funzione supportata ufficialmente (quindi stabile nel tempo) o
   potrebbe sparire senza preavviso?
2. È prevista la disponibilità di modelli più grandi della famiglia Qwen
   (Qwen3.5-397B o equivalenti) sull'endpoint? Nei nostri test danno
   risultati migliori sui testi medici.
3. Quali sono i limiti di richieste al minuto e di token per richiesta per
   il nostro piano, e se esistono opzioni con ritenzione zero dei prompt.

Grazie,
[nome, ruolo tecnico]
Centro Cardiologico Ticino
