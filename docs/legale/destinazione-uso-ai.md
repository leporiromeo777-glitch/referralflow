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
  (svizzero) viaggia solo testo anonimizzato dal codice con controprova.

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
  whisper locale → anonimizzazione locale → LLM svizzero → ricomposizione
  locale → revisione umana.
- Trasparenza: i referti prodotti con assistenza AI e rivisti da una persona;
  una riga nell'informativa dello studio basta per l'uso amministrativo
  (rapporto Zurigo/UZH), a costo zero e copre.
