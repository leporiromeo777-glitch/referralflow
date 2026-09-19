# Righello ReferralFlow — dispositivo fabbricato e usato nello studio

Stato: **bozza tecnica, 19 settembre 2026** (aggiornata la sera con il Measurement Safety Engine, fasi 1-5-7-8: geometria completa, Gate a tre stati, doppio controllo, provenienza ed eventi). Scritta da chi sviluppa; **non è un
parere legale né regolatorio** e va riletta da un consulente regolatorio prima
della notifica. Non contiene dati di pazienti.

## Di che cosa parla questo fascicolo

Della sola funzione **«Misura»** della pagina Immagini di ReferralFlow: le
grandezze geometriche nel piano di un'immagine DICOM (distanza, polilinea,
angolo, rettangolo, ellisse, poligono, perimetro, punto — dal 20.9.2026,
destinazione d'uso 1.1), calcolate con la calibrazione scritta nel file
dall'apparecchio. Il resto della pagina (ricezione, archivio,
consultazione, misure dell'apparecchio lette dal referto strutturato) non
produce informazione clinica e resta fuori dal perimetro, come scritto in
[destinazione-uso-immagini.md](../destinazione-uso-immagini.md).

## La strada scelta, e perché

Un software che produce una misura usata per decidere di un paziente è un
dispositivo medico (MDR regola 11, classe IIa). Le strade erano tre:

1. **Certificare** ReferralFlow con un organismo notificato: 60–300 mila
   franchi, senso solo se lo si vende.
2. **Non misurare**: le misure le fa l'ecografo, ReferralFlow le importa.
3. **Fabbricarlo e usarlo dentro lo studio**: ODmed art. 9 (che rimanda
   alle condizioni dell'art. 5 par. 5 MDR) e notifica a Swissmedic ai sensi
   dell'art. 18 ODmed. Nessun marchio CE, nessun organismo notificato, ma
   lo studio è il **fabbricante** e ne risponde.

Il 19.9.2026 lo studio ha scelto la terza (Decisioni/Registro). Le condizioni
sono queste, e ogni file di questa cartella ne copre una:

| Condizione (MDR 5.5) | Dove |
|---|---|
| a. il dispositivo non è ceduto ad altri soggetti | [notifica-swissmedic.md](notifica-swissmedic.md) §1 — e il codice: nessuna funzione di esportazione verso altri studi |
| b. sistema di gestione della qualità adeguato | [descrizione-tecnica.md](descrizione-tecnica.md) §5 (controllo delle modifiche, versioni, prove) |
| c. giustificazione che nessun equivalente sul mercato copre il bisogno | [giustificazione-equivalenti.md](giustificazione-equivalenti.md) — **il punto più debole**, da valutare col consulente |
| d. informazioni sull'uso a disposizione dell'autorità | tutta questa cartella + [destinazione-uso.md](destinazione-uso.md) |
| e. dichiarazione pubblica | [dichiarazione-pubblica.md](dichiarazione-pubblica.md) |
| f. documentazione tecnica: fabbricazione, progetto, prestazioni, destinazione | [descrizione-tecnica.md](descrizione-tecnica.md), [destinazione-uso.md](destinazione-uso.md), [piano-validazione.md](piano-validazione.md) |
| g. esperienza d'uso riesaminata, azioni correttive | [piano-validazione.md](piano-validazione.md) §5 |
| Requisiti generali di sicurezza e prestazione (MDR all. I) | [analisi-rischi.md](analisi-rischi.md) |

## Chi fa che cosa

| Ruolo | Chi | Che cosa |
|---|---|---|
| **Fabbricante e responsabile** | lo studio (Centro Cardiologico Ticino), nella persona del titolare | firma la dichiarazione, notifica a Swissmedic, decide la messa in uso, riesamina l'esperienza d'uso |
| Sviluppo e verifica tecnica | chi sviluppa ReferralFlow, per conto dello studio | codice, prove automatiche, questo fascicolo, correzioni |
| Validazione clinica | un medico dello studio | le misure di confronto del piano di validazione, il giudizio di accettazione |
| Rilettura regolatoria | consulente esterno (un'ora, da incaricare) | conferma che lo studio è «istituzione sanitaria» ai sensi dell'MDR art. 2 n. 36, rilegge la giustificazione e la notifica |

## Prima di usarlo sui pazienti — lista di controllo

- [ ] Il titolare ha letto [destinazione-uso.md](destinazione-uso.md) e accetta che il fabbricante è lo studio.
- [ ] Validazione clinica eseguita e accettata ([piano-validazione.md](piano-validazione.md) §3), CSV allegato.
- [ ] Consulente regolatorio: un'ora di rilettura, esito scritto.
- [ ] [giustificazione-equivalenti.md](giustificazione-equivalenti.md) firmata dal titolare.
- [ ] Notifica a Swissmedic inviata (modulo BW630_30_027i_FO) **prima** dell'uso — [notifica-swissmedic.md](notifica-swissmedic.md).
- [ ] Dichiarazione pubblica esposta (sito o bacheca dello studio) — [dichiarazione-pubblica.md](dichiarazione-pubblica.md).
- [ ] Il personale che misura (medici, aiuto medici) ha letto la pagina wiki [Piattaforma/Immagini](../../wiki/Piattaforma/Immagini.md).

Fino a quando la lista non è completa, il righello è **in validazione**: si
può usare per raccogliere le misure di confronto, non per decidere di un
paziente.

## Che cosa NON copre

- La vendita o la cessione a un altro studio: lì serve la certificazione piena.
- Volumi, frazione di eiezione, Doppler, contorni automatici: non esistono
  nel dispositivo e non si aggiungono senza riaprire il fascicolo.
- Radiografie (spaziatura del rivelatore) e immagini senza calibrazione: il
  righello si rifiuta di misurarle.
