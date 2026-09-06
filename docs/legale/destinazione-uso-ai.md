# Destinazione d'uso delle funzioni AI di ReferralFlow (Zweckbestimmung)

Stato: bozza di lavoro, 5 settembre 2026. Da far validare nello stesso incarico
legale di Stripe/AGB/DPA. Serve a tre cose: (1) descrivere in una pagina cosa
fa e cosa NON fa ogni funzione assistita dall'AI; (2) tenere il prodotto fuori
dal perimetro «dispositivo medico» (OoDmed/MepV, MDR): la guida MHRA del
29.07.2026 qualifica come NON dispositivo trascrivere, riassumere, strutturare
e redigere bozze di documentazione riviste da un clinico, e suggerire codici
di fatturazione da rivedere; (3) essere la prima cosa che un consulente
regolatorio chiederà.

## Principio comune a tutte le funzioni

- L'AI **propone**; il **codice applica** con guardie deterministiche; **una
  persona decide**. Nessun output dell'AI diventa referto senza conferma umana.
- Guardie fisse: i numeri (valori, dosaggi, date) non possono cambiare
  (firma numerica, oggi anche con l'unità); mai ribaltamenti clinici
  (iper/ipo, presenza/assenza, con/senza); il testo della lettera precedente
  entra solo verbatim; ogni riga della lettera fusa porta la sua provenienza.
- Il sistema **non fornisce diagnosi, non propone terapie, non calcola
  valori clinici, non prende decisioni sul paziente**.
- Audio e dati identificativi restano sul Mac dello studio; verso il cloud
  (svizzero) viaggia solo testo PSEUDONIMIZZATO dal codice con controprova (la mappa dei segnaposto resta in memoria sul Mac: non è anonimizzazione in senso LPD).

## Funzione per funzione

| Funzione | Cosa fa | Cosa NON fa | Qualifica attesa |
|---|---|---|---|
| Trascrizione del dettato (whisper locale, doppia passata) | converte la voce del medico in testo | non interpreta, non riassume | mezzo amministrativo, equiparato alla trascrizione umana |
| Correzioni automatiche (lista AI + dizionario) | ripara parole storpiate dalla trascrizione, una per una, con guardie e registro visibile | non tocca numeri, non cambia il senso clinico | supporto alla scrittura |
| Segretaria / pertinenza / senso / avvocato del diavolo | segnala frasi da verificare, divagazioni, note per la segreteria | non cancella nulla da sola (tranne le note esplicitamente rivolte alla segreteria, riversate a parte) | supporto alla revisione |
| Bella copia | punteggiatura e maiuscole | impronta lettere+cifre identica al carattere: nessuna parola cambia | supporto alla scrittura |
| Formato standard (mappa) | assegna le frasi dettate alle sezioni del rapporto-tipo dello studio | ricompone con le frasi originali intatte; non genera contenuto | impaginazione |
| Lettera incrementale (fusione) | innesta gli aggiornamenti dettati nella lettera precedente | la lettera precedente resta verbatim salvo dove il medico ha dettato; i paragrafi degli esami aggiornati passano da una guardia numerica; provenienza per riga | impaginazione + supporto alla revisione (caso «borderline» del rapporto Zurigo/UZH: nessuna alterazione di contenuti medici, documentata dalle guardie) |
| Controllo cifre (secondo orecchio) | avvisa se un numero pronunciato manca nel referto | non corregge | allarme, decide la persona |
| Riorganizza (AI) locale | come «formato standard», su richiesta e dopo le modifiche a mano | firma numerica con unità | impaginazione |
| Anonimizza documenti | sostituisce dati identificativi con segnaposto, in locale | non riscrive il testo | amministrativo |
| Memoria della visita (spenta) | propone parole udite in visita per frasi dubbie del dettato | mai inventa; sempre proposta | supporto alla revisione — da rivalutare prima di riaccenderla |

## Nota del 5 settembre 2026 (deepsearch): il confine della regola 11

MDCG 2019-11 rev. 1 (giugno 2025) e il rapporto della Sandbox del Canton
Zurigo (dicembre 2025) collocano nel perimetro «dispositivo» anche gli avvisi
che forniscono «informazioni per una decisione diagnostica o terapeutica»
(regola 11, classe IIa). Due nostre funzioni sono sul confine e vanno
formulate come controlli di FEDELTÀ DELLA TRASCRIZIONE, mai di plausibilità
clinica:
- allarmi numerici: oggi il testo dice «di solito questo valore sta tra X e
  Y» → va riformulato in «questo numero non si ritrova / è insolito per
  una trascrizione: riascolta»; niente intervalli clinici mostrati;
- controllo farmaci (Swissmedic): parla di CONFEZIONI esistenti («nessuna
  confezione da 25 mg: probabile errore d'ascolto»), mai di dose corretta
  per il paziente; nessuna interazione, nessun aggiustamento.
Alternativa strategica: registrazione volontaria in classe I (come 44ai e
Tandem), che nei bandi ospedalieri è ormai un filtro d'ingresso. Da
decidere col legale. I codici TARDOC suggeriti dalla lettera approvata sono
fatturazione (scopo non medico): ammessi.

## Cosa NON aggiungere senza una Regulatory Opinion

Diagnosi differenziali, triage clinico automatico dal contenuto, richiami
dedotti dal referto (non da intervalli fissi), calcolo di score clinici:
tutte funzioni che il rapporto Zurigo/UZH classifica come dispositivo medico
(classe IIa o superiore, organismo notificato UE). Se un giorno servissero,
vanno in un modulo separato e isolabile (raccomandazione 3 del rapporto).

## Da ricordare

- L'eccezione «uso interno» (art. 9 MepV) vale finché il software è
  fabbricato e usato nella stessa struttura: decade alla prima vendita.
- Valutazione d'impatto (art. 22 LPD): probabilmente dovuta (nuova
  tecnologia + dati sanitari). Bozza da preparare con i flussi: audio →
  whisper locale → pseudonimizzazione locale → LLM svizzero → ricomposizione
  locale → revisione umana.
- Trasparenza: i referti prodotti con assistenza AI e rivisti da una persona;
  una riga nell'informativa dello studio basta per l'uso amministrativo
  (rapporto Zurigo/UZH), a costo zero e copre.


## Checklist per ogni nuova funzione (Ricerca 17 §17.11-17.12)

Prima di mettere in produzione una funzione che tocca il contenuto clinico,
rispondere e annotare qui sotto:

1. La funzione **trascrive, corregge, impagina o confronta** testo dettato? → documentale, via libera.
2. **Interpreta** un dato clinico (dice cosa significa un valore, propone una diagnosi, una terapia, una priorità clinica)? → fermarsi: revisione del confine dispositivo medico (MDCG 2019-11 rev. 1, regola 11) prima di procedere.
3. Il **testo mostrato al medico** parla di trascrizione («numero insolito per questo campo, riascolta») o di clinica («valore fuori norma»)? Solo la prima formulazione è ammessa.
4. La funzione **cambia la destinazione d'uso** dichiarata in questo documento? Se sì, aggiornare qui e nella DSFA.
5. **Materiale di vendita**: la funzione viene presentata come aiuto alla scrittura, mai come strumento diagnostico.

### Registro delle decisioni

| Data | Funzione | Documentale? | Decisione |
|---|---|---|---|
| 2026-09-05 | Allarmi numerici riformulati come controlli di trascrizione | sì | ammessa |
| 2026-09-05 | Controllo farmaci (confezioni Swissmedic esistenti) | sì (fedeltà della trascrizione) | ammessa; mai «dose corretta» |
| 2026-09-06 | Variazioni tra visite marcate «grandi» | sì (verifica del cambiamento dettato) | ammessa; il testo dice «o è vero o è una cifra sentita male», nessun giudizio clinico |
| 2026-09-06 | Richiami proposti dal referto («controllo tra 6 mesi») | sì (trascrizione di un'indicazione del medico) | ammessa; creato solo al clic |
| 2026-09-06 | Rischio per frase con gravità | sì (probabilità di errore di trascrizione) | ammessa; la parola «gravità» si riferisce all'errore di trascrizione, non alla clinica |
