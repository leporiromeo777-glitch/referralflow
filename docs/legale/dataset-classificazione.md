# Classificazione dei dataset (Ricerca 17 §17.3)

Bozza del 6.9.2026. Prima di usare dati reali per migliorare la catena, ogni dataset va classificato; QA interno e ricerca/sviluppo generalizzabile hanno regole diverse (per la ricerca può applicarsi la Legge sulla ricerca umana: consenso o eccezione, parere etico).

| Dataset | Classe | Contenuto | Uso ammesso | Accesso | Note |
|---|---|---|---|---|---|
| `~/referti-dataset/oro` | **QA** | audio + testo firmato dei referti confermati dello studio | test di regressione e misura della qualità della catena dello studio | account di servizio del Mac | non usato per addestrare pesi |
| `~/referti-dataset/suite-cattiva` | QA (sintetico) | voci sintetiche, nessun dato reale | libero | — | — |
| `~/referti-dataset/banco-sintetico`, `banco-anonimizzatore` | QA (sintetico) | sintetico | libero | — | — |
| `~/referti-dataset/audio` | **ADDESTRAMENTO — in attesa di governance** | copie audio dei dettati | nessuno finché il titolare non approva la regola (conservazione-audio.md) e il legale non chiarisce QA vs ricerca | account di servizio | default da spegnere |
| Correzioni del medico (`payload.revisione.modifiche`) | QA | coppie prima/dopo con classe e origine | dizionario, memoria di stile, cruscotto | app (medico/admin) | pochi esempi anonimizzati ammessi come few-shot |

Regola: nessun dataset passa da QA ad addestramento senza una riga in questo file con data, base giuridica e decisione del titolare.

Quarantena del feedback (Ricerca 18 §14): un referto firmato non diventa verità di addestramento per il solo fatto di essere firmato — un errore non notato dal medico diventerebbe precedente, dizionario o memoria e si ripresenterebbe più spesso. Perciò `esporta-oro.sh` scrive `MANIFEST.txt` con `idoneo_addestramento: no`; le regole di stile e di dizionario entrano solo con conferma manuale dal pannello; la promozione all'addestramento passa da un'analisi delle cause e da una riga in questo file. La suite catastrofica (`prove-catastrofiche.py`) verifica che il marcatore ci sia.
