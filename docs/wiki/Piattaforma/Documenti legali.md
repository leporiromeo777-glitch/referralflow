---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Documenti legali (`docs/legale/`)

Cartella creata il 16.7.2026. **Nessun documento va firmato o pubblicato senza revisione legale.** Il pacchetto da portare al legale in un unico incarico: bozza del contratto di trattamento dati + AGB/condizioni d'uso + costituzione della ditta (lo stesso che serve per Stripe, vedi [[Piattaforma/Prossimi lavori]]).

| documento | che cos'è | stato |
|---|---|---|
| `FMH-accordo-trattamento-dati-su-incarico.docx`, `FMH-accordo-riservatezza.docx`, `FMH-guida-uso-accordi.pdf` | modelli UFFICIALI FMH (v. 03/2023), gli stessi distribuiti dall'OMCT | riferimento |
| `BOZZA-contratto-trattamento-dati-ReferralFlow.md` | modello FMH precompilato con i dati veri di ReferralFlow (subfornitori, misure tecniche, hosting CH) + «note per il legale» con 8 punti aperti; aggiornata con 2FA e SSE nell'Allegato 1 | da validare da un avvocato |
| `FIRMA-contratto-trattamento-dati-CentroCardiologico` (.md/.html) | contratto compilato Centro Cardiologico Ticino ↔ Romeo Lepori; da riempire a mano solo indirizzi, rappresentante, luogo e data | pronto da firmare (pilota), previa revisione |
| `FIRMA-accordo-riservatezza-CentroCardiologico` | accordo di riservatezza, da firmare INSIEME al contratto (pena convenzionale CHF 25'000) | pronto da firmare (pilota) |
| `destinazione-uso-ai.md` | destinazione d'uso delle funzioni AI (Zweckbestimmung) con checklist per funzione | bozza |
| `dsfa-referti-bozza.md` | valutazione d'impatto (DSFA, art. 22 LPD) sulla catena referti | bozza |
| `registro-trattamenti.md` | registro delle attività di trattamento (art. 12 LPD), catena referti | bozza |
| `fornitori-cloud.md` | registro dei fornitori cloud (Infomaniak per il modello esterno, Exoscale per backup e allegati, eCall per gli SMS) | da tenere aggiornato |
| `email-infomaniak.md` | due email da inviare a Infomaniak dal titolare dello studio (DPA e sede dei dati) | da inviare |
| `conservazione-audio.md` | regola sulla conservazione dell'audio dei dettati per l'addestramento | bozza da approvare |
| `ciclo-vita-dati.md`, `dataset-classificazione.md`, `diritti-interessati.md`, `procedura-incidenti.md`, `sorveglianza-normativa.md` | ciclo di vita dei dati, classificazione dei dataset, diritti degli interessati, procedura incidenti, checklist trimestrale di sorveglianza normativa (Ricerca 17) | bozze operative |

## Basi già verificate
- Cartella elettronica ammessa dall'art. 64 cpv. 2 LSan TI su «sistema informatico sicuro»; conservazione ≥ 10 anni (art. 67 LSan; FMH raccomanda 20); nessuna certificazione DEP necessaria (binario separato, obbligo studi ~2030).
- Trasmissione di documenti a terzi solo con consenso spuntato (art. 321 CP / art. 20 LSan TI), respinta server-side senza.
- Le funzioni che mandano dati a un fornitore AI esterno (cattura impegnativa con Anthropic, chat AI) restano SPENTE finché manca il DPA col subfornitore e l'informativa; il percorso esterno della catena usa testo pseudonimizzato verso Infomaniak (CH).

Pagina pubblica «come proteggiamo i dati»: `/sicurezza-dati`; informativa: `/privacy`.
