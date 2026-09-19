# Giustificazione: perché non un dispositivo equivalente sul mercato

MDR art. 5 par. 5 lett. c (richiamato dall'art. 9 ODmed): l'istituzione
sanitaria deve giustificare nella documentazione che **le esigenze specifiche
del gruppo di pazienti destinatario non possono essere soddisfatte, o non
possono esserlo al livello di prestazione adeguato, da un dispositivo
equivalente disponibile sul mercato**.

**Questo è il punto più debole del fascicolo, e va detto chiaramente.** Sul
mercato esistono visualizzatori certificati che misurano (OsiriX MD, CE classe
IIa, circa 800–1000 CHF l'anno; MedDream, classe IIb; aycan; Alma). Il costo
**non è** una giustificazione ammessa. La giustificazione deve stare nel
*bisogno* e nella *prestazione*, e deve essere il titolare a sottoscriverla
perché è lui che conosce il lavoro clinico. Quella che segue è la bozza
scritta da chi sviluppa, da confermare o riscrivere col consulente.

## Il bisogno specifico dello studio

Lo studio è un ambulatorio di cardiologia in cui **la stessa persona** che
visita il paziente ha davanti, nello stesso schermo e nello stesso momento,
la cartella, l'agenda, i referti precedenti e — dal 18.9.2026 — le immagini.
Il bisogno non è «avere un righello»: è **misurare dentro il flusso della
visita**, sul dispositivo che si ha in mano, con la misura che resta legata
al paziente, all'esame, a chi l'ha fatta e a quando.

I dispositivi equivalenti disponibili sono visualizzatori **a postazione**:

| Esigenza dello studio | Visualizzatore certificato a postazione | Righello ReferralFlow |
|---|---|---|
| Misurare durante la visita, in qualunque stanza, anche su tablet | no: licenza per postazione, installazione locale, un utente alla volta | sì: browser, qualunque dispositivo dello studio |
| Misura legata al paziente della cartella, non a un archivio a parte | no: archivio proprio, paziente identificato dal nome nel file | sì: stessa cartella, abbinamento verificato |
| Tracciabilità di chi ha misurato, quando, su quale fotogramma, con quale calibrazione | parziale (annotazioni nel file o nella sua base dati, senza legame con l'utente della piattaforma) | sì, per costruzione, con annullamenti registrati |
| Confronto sistematico con le misure dell'apparecchio (referto strutturato) | no | sì: il confronto è una funzione del dispositivo |
| Le immagini non lasciano il Mac dello studio | dipende dal prodotto; molti richiedono un PACS o un servizio cloud | sì: PNG al browser, DICOM mai |
| Nessuna installazione sui singoli PC dello studio, nessun aggiornamento manuale | no | sì |

## Il livello di prestazione

La prestazione richiesta è quella di una misura lineare su immagine 2D con
la calibrazione del file: la stessa dei visualizzatori equivalenti. Il piano
di validazione ([piano-validazione.md](piano-validazione.md)) la dimostra per
confronto con le misure dell'apparecchio, che è il riferimento migliore
disponibile. **Il Righello non pretende di misurare meglio: pretende di
misurare ugualmente bene dove i pazienti dello studio vengono visti.**

## Che cosa scrivere se il consulente dice che non basta

Allora la strada è l'opzione 2 della pagina legale: le misure le fa
l'apparecchio e ReferralFlow le importa; per rimisurare a video, OsiriX MD
accanto, e ReferralFlow gli manda lo studio (tasto «Misura» esterno, non
costruito). Il codice del righello resta, spento, per una futura
certificazione.

## Firma

Letto e sottoscritto dal titolare dello studio, che conferma che il bisogno
descritto è quello reale:

Nome ______________________ Data ____________ Firma ______________________
