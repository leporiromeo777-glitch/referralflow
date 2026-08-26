# Regole per Claude su questo Mac (pipeline referti)

Questa cartella contiene la pipeline locale di trascrizione dei referti di un
centro cardiologico. Su questa macchina ci sono **dati sanitari reali**.

## Vincolo assoluto — nLPD

Tutto ciò che leggi in questa sessione viaggia verso il cloud. Quindi:

- **NON aprire, leggere, stampare o riassumere MAI**: file audio, i `.txt`
  prodotti dalla pipeline, `*.dubbi.json`, `*.divergenze.json`, né qualsiasi
  file dentro `~/referti/` o nelle cartelle dei dettati. Contengono nomi di
  pazienti e dati clinici. Nemmeno «solo un pezzetto», nemmeno per debug.
- Puoi leggere e mostrare: i **log della pipeline** (sono progettati per non
  contenere mai contenuti clinici: solo id file, fasi, esiti, durate),
  `pipeline.py`, `correzioni.json`, `aggiorna.sh`, `*.scarto_ai.json`
  (solo numeri nudi, senza contesto) e questo file.
- ECCEZIONE UNICA (collaudo correzione esterna, SPEC §6.1h): i file
  `~/referti/scambio-esterno/*.anon.txt` sono ANONIMIZZATI PER COSTRUZIONE
  (nomi/date/contatti già sostituiti con segnaposto e controprova doppia
  superata, altrimenti il file non viene nemmeno scritto). Si possono
  leggere SOLO quando l'utente ha chiesto la prova manuale in corso, per
  produrre la lista di riparazioni `<file_id>.lista.json` (formato §6.1b:
  `{"riparazioni": [{"da": …, "a": …}]}`, mai coppie con cifre o
  segnaposto). Tutto il resto di `~/referti/` resta vietato come sopra.
- Se un comando potrebbe stampare contenuto clinico (cat/less/head/grep sui
  file vietati, editor, anteprime), non eseguirlo. Se serve un'informazione
  da quei file, chiedi all'utente di guardarli lui e riferire a parole.

## Cosa puoi fare

- `bash ~/referti-pipeline/aggiorna.sh` — aggiorna la pipeline dal repo
- `python3.14 ~/referti-pipeline/pipeline.py <file_audio>` — elabora un
  dettato; riporta all'utente le righe di log così come sono
- diagnosi da log (esiti, durate, conteggi), gestione di Ollama/whisper/
  ffmpeg/launchd, spazio disco, permessi

## Contesto

- La fonte di verità del progetto è `docs/trascrizione/SPEC.md` nel repo
  `leporiromeo777-glitch/referralflow` (branch
  `claude/ai-chain-collaboration-prompt-heacx2`); i prompt in §6 NON si
  toccano, le decisioni di progetto passano dalla sessione principale di
  sviluppo, non da qui.
- Python: usare `python3.14` (quello di Homebrew), non il `python3` di
  sistema.
