---
tipo: piattaforma
aggiornata: 2026-10-22
---
# Saturazione notturna

Che cosa è vero oggi (22.10.2026). Una pagina sua, **«Saturazione notturna»** (menu «Clinico», sotto Pressione), per le notti registrate con l'**anello Wellue O2Ring**. Richiesta dello studio: «una sezione per la saturazione notturna»; scelta una pagina dedicata, non una funzione dentro Pressione (che ruota attorno alla pressione e agli orari dei farmaci) né dentro Monitoraggio (sensori in continuo, ancora dimostrativo).

## Da dove arrivano le notti

Dal **generatore dei referti dello studio** (lo stesso file HTML dei referti Aktiia, `Desktop/Aktiia - Report generator/Generatore 2.0`), scheda **«Sonno · O2Ring»**: si caricano i CSV delle notti esportati dall'app ViHealth, il programma li legge e li calcola (`sorgente/o2ring.js`) e fa il «Rapporto del sonno». Dopo la conferma del medico il generatore manda qui, con la **stessa chiave** del «Collegamento ReferralFlow» della pressione:

`POST /api/saturazione/invio` (Authorization: Bearer <chiave dello studio>; risponde a qualunque origine perché il generatore si apre da file://)
```
{ paziente: { cognome, nome, data_nascita: "AAAA-MM-GG" o "GG.MM.AAAA" },
  apparecchio?: "O2Ring",
  notti: [ <l'oggetto «analisi» di o2ring.js per ogni notte, così com'è> ],
  nota?, valutazione?,
  referto?: { nome_file, pdf_base64 | docx_base64 } }
```
→ **201** nella cartella del paziente (e il rapporto fra i suoi documenti, categoria «referto») · **202** da assegnare (col motivo) · **200** già arrivato (stesso paziente e stesse notti, comunque sia scritto il nome) · **400** il perché (in italiano) · **401** chiave non valida. `GET` con la chiave = «Prova collegamento».

**Il generatore non manda ancora**: la scheda O2Ring stampa il rapporto (finestra di stampa → PDF) ma non ha il passo «Conferma e invia» che ha la pressione. Va aggiunto lì, sul modello di `send()` in `sorgente/app.js`.

## Che cosa fa la piattaforma

- **Controlla** ciò che arriva (`src/lib/saturazione/regole.ts`, puro): forma e limiti di ogni notte (al massimo 14 notti, 20 ore l'una, una curva di al massimo 2400 punti, saturazione 50–100, frequenza 20–250, cadute ≥4% non più di quelle ≥3%, istogramma 50–100); referto PDF (o Word) fino a 8 MB.
- **Non ricalcola**: i numeri delle notti sono quelli del generatore, quindi del rapporto confermato. I **totali di tutte le notti** si fanno come `unisci` del generatore (medie pesate sulle misure valide, ODI = cadute / ore valide, la stessa notte una volta sola). Provato sulle notti di prova del generatore: 95,2% di media, 82% di minima, 13 minuti sotto il 90%, ODI 4% 5,4/h (122 cadute), ODI 3% 7,2/h — gli stessi del rapporto di prova.
- **Riconosce il paziente** con la regola severa di sempre (`abbinaPaziente`): nome e data di nascita, una persona sola. Se no l'invio aspetta **«da assegnare»** in cima alla pagina, col suo rapporto da aprire: si sceglie il paziente, oppure «Non ha ancora la cartella: creala» (mai un doppione), oppure si scarta.
- Tabella `sat_registrazioni` (migrazione 097): una riga per invio con le notti (curve ridotte a un punto ogni 30 s, cadute, istogramma) e i totali.

## La pagina

- **Elenco**: paziente, notti, saturazione media e minima, tempo sotto il 90%, ODI 4% con il livello, il rapporto.
- **Dettaglio**: in alto saturazione media e minima, tempo sotto il 90% (e la parte del sonno), cadute all'ora (ODI 4% con il livello, e ODI 3%), frequenza cardiaca; la tabella **notte per notte** con la riga «Tutte»; per ogni notte la **curva della saturazione** (70–100%, il 90% tratteggiato, le cadute ≥4% come triangoli) e della **frequenza cardiaca**; l'**istogramma** del tempo a ogni livello di saturazione (sotto il 90% in rosso); nota e valutazione del medico se arrivate; le altre registrazioni dello stesso paziente; «Apri il rapporto».
- **Livelli dell'ODI 4%**, come scrive il rapporto (indicativi): meno di 5 all'ora nella norma, 5–15 lieve, 15–30 moderato, oltre 30 marcato. L'anello è uno strumento di screening: la valutazione è del medico.

## Chi fa che cosa (`PUO_SAT`, applicato dal server)

Vedere e assegnare: medico, aiuto medico, segreteria, amministrazione. Il tecnico no (non vede dati clinici). Sezione `saturazione` in `permessi.ts`.

## Prove

`src/lib/prove-saturazione.test.ts` (4, notti inventate: notte valida e fuori scala col perché; totali come il generatore; livelli dell'ODI; l'invio con nascita gg.mm.aaaa, referto PDF, impronta e ora). `scripts/e2e/prova-saturazione.ts` (7, sul demo con pazienti e notti inventati: chiave da file://; riconosciuto → nella cartella col rapporto; totali e ora del paziente; doppione col nome in un altro ordine; elenco e dettaglio con le curve, tecnico no; da assegnare → rapporto apribile → crea la cartella; scartare e i limiti).
