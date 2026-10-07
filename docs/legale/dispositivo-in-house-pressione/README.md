# Proposte di orario (pagina Pressione) — dispositivo fabbricato e usato nello studio

Stato: **bozza tecnica, 7 ottobre 2026**. Scritta da chi sviluppa; **non è un parere
legale né regolatorio** e va riletta da un consulente regolatorio prima della
notifica. Non contiene dati di pazienti.

**Il dispositivo è SPENTO.** Nel software le proposte si accendono solo scrivendo
`PRESSIONE_PROPOSTE=1` nel `.env` del server (`src/lib/pressione/accese.ts`), e questo
si fa solo dopo: tabella dei farmaci confermata, validazione chiusa, fascicolo riletto,
notifica fatta.

## Di che cosa parla questo fascicolo

Della sola funzione **«Proposte di orario»** della pagina Pressione di ReferralFlow:
dato il profilo pressorio delle 24 ore di un paziente e gli antipertensivi che il medico
gli ha già prescritto, il software propone **a che ora prendere** uno di quei farmaci.

Il resto della pagina — caricare il profilo, medie di giorno e di notte, calo notturno,
fasce sopra soglia, la finestra d'azione di ogni farmaco disegnata dai numeri della
tabella, il punteggio, il confronto fra due profili — **mostra** e non propone: è in uso
senza questo fascicolo ([[Piattaforma/Pressione]] nella wiki).

## La strada scelta, e perché

Un software che fornisce un'informazione usata per una decisione terapeutica è un
dispositivo medico (MDR regola 11), anche se la decisione la conferma sempre un medico e
anche se riguarda solo l'orario: l'orario di assunzione fa parte della terapia. Lo studio
(7.10.2026, Decisioni/Registro) ha scelto la stessa strada del Righello delle immagini:
**fabbricarlo e usarlo dentro lo studio**, ODmed art. 9 (condizioni dell'art. 5 par. 5
MDR) con notifica a Swissmedic (art. 18 ODmed). Nessun marchio CE; lo studio è il
fabbricante e ne risponde.

| Condizione (MDR 5.5) | Dove |
|---|---|
| a. non è ceduto ad altri soggetti | [notifica-swissmedic.md](notifica-swissmedic.md) §1 |
| b. sistema di gestione della qualità adeguato | [descrizione-tecnica.md](descrizione-tecnica.md) §5 |
| c. nessun equivalente sul mercato copre il bisogno | [giustificazione-equivalenti.md](giustificazione-equivalenti.md) — **da valutare col consulente** |
| d. informazioni sull'uso a disposizione dell'autorità | questa cartella + [destinazione-uso.md](destinazione-uso.md) |
| e. dichiarazione pubblica | [dichiarazione-pubblica.md](dichiarazione-pubblica.md) |
| f. esperienza clinica riesaminata, azioni correttive | [piano-validazione.md](piano-validazione.md) §5 |
| rischi | [analisi-rischi.md](analisi-rischi.md) |

## Il punto debole, detto subito

**Le prove.** Che spostare l'orario di un antipertensivo migliori gli esiti non è
dimostrato: lo studio più grande disponibile non ha trovato differenze fra presa al
mattino e alla sera, e le linee guida europee correnti indicano l'orario che il paziente
riesce a rispettare. Il dispositivo non promette un beneficio sugli esiti: propone uno
spostamento che, **in una stima dichiarata**, porta più ore del profilo dentro i valori
bersaglio, e chiede di verificarlo con un nuovo monitoraggio. Questo limite sta nella
destinazione d'uso e nell'analisi dei rischi, e va discusso col consulente prima della
notifica.

## Che cosa manca prima di accendere

1. Tabella dei farmaci: ogni riga usata confermata da un medico sul testo ufficiale.
2. Validazione ([piano-validazione.md](piano-validazione.md)): non ancora cominciata.
3. Rilettura regolatoria di tutto il fascicolo.
4. Persona responsabile nominata, dichiarazione pubblicata, notifica inviata.
