# Destinazione d'uso — Proposte di orario (pagina Pressione)

Versione 1.0 · 7 ottobre 2026 · bozza per il titolare dello studio.

## Nome e identificazione
- **Nome**: Proposte di orario ReferralFlow (funzione della pagina Pressione).
- **Versione delle regole**: `VERSIONE_REGOLE` in `src/lib/pressione/calcolo.ts` (oggi `pa-orari-1`),
  più l'hash del commit con cui è distribuito. Ogni proposta salvata registra la versione.
- **Tipo**: software, funzione di un sistema più ampio, usato dal browser sui computer dello studio.
- **Fabbricante**: lo studio medico (Centro Cardiologico Ticino), art. 9 ODmed / art. 5 par. 5 MDR.

## In una frase
> Dato il profilo pressorio delle 24 ore di un paziente adulto e gli antipertensivi che il
> medico gli ha già prescritto, il software propone al medico **l'orario di assunzione** di
> uno di quei farmaci che, in una stima dichiarata, aumenta le ore del profilo dentro i
> valori bersaglio. La proposta è un supporto: la accetta, la modifica o la scarta il medico.

## Che cosa fa
- Propone **solo l'orario** di un farmaco già in terapia, preso una volta al giorno, la cui
  riga nella tabella dei farmaci è stata confermata da un medico dello studio.
- Mostra, per ogni proposta, i numeri da cui nasce: le fasce sopra soglia, il livello del
  farmaco in quelle fasce, la stima col nuovo orario, l'ipotesi usata.
- Quando nessuno spostamento porta la pressione sotto soglia, **lo dice e si ferma**:
  «Con qualunque orario dei farmaci attuali la pressione resta sopra la soglia in queste
  fasce … Valutazione del medico.»

## Che cosa NON fa (e il codice lo impedisce)
- Non propone farmaci, dosi, aggiunte, sostituzioni o sospensioni.
- Non conclude niente sull'efficacia della terapia né sulle cause dei valori.
- Non propone se la registrazione non è affidabile (meno del 70% di misure valide, meno di
  20 di giorno o di 7 di notte).
- Non propone un diuretico dopo le 14, né uno spostamento che nella stima porta un'ora
  sotto il valore «troppo basso» o il calo notturno oltre il 20%.
- Non parla col paziente: nessun messaggio, nessuna stampa per il paziente.
- Non usa modelli linguistici: le proposte le calcola codice ripetibile.

## Uso previsto
| Voce | Contenuto |
|---|---|
| Chi lo usa | Solo i medici dello studio (ruolo «medico»). Gli altri ruoli vedono la proposta e la decisione, non le chiedono e non le decidono. |
| Su chi | Adulti in terapia antipertensiva seguiti dallo studio, con un monitoraggio delle 24 ore affidabile. |
| Dove | Dentro lo studio, sui suoi computer. |
| Controindicazioni d'uso | Gravidanza, età pediatrica, ipotensione ortostatica nota, lavoro a turni o sonno diurno non impostato nel profilo, registrazione non affidabile: il medico non chiede la proposta, o la scarta. |
| Beneficio atteso | Risparmio di tempo nel leggere profilo e terapia insieme, e un criterio uguale per tutti i pazienti. **Non** è dichiarato un beneficio sugli esiti cardiovascolari. |

## Classe
Regola 11 MDR: software che fornisce informazioni usate per decisioni terapeutiche —
classe IIa, salvo valutazione diversa del consulente. Non sceglie farmaco né dose, e ogni
proposta passa da un medico.
