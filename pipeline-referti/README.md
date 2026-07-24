# Pipeline locale di trascrizione referti

Codice che gira sul **Mac mini dello studio** (non sul server ReferralFlow).
La fonte di verità è `docs/trascrizione/SPEC.md`: vincoli, prompt e ordine
delle fasi stanno lì. Questa cartella vive nel repo solo per versionare il
codice — si copia sul Mac mini per l'uso.

## Stato delle fasi (SPEC §9)

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Preprocessing ffmpeg → WAV 16 kHz mono | **fatta — testata; rallentamento 0.8 + denoise di serie (23 div. contro 65)** |
| 2 | Trascrizione whisper.cpp | **fatta — testata su dettato reale** |
| 3 | Doppia trascrizione + divergenze | **fatta — testata su dettato reale** |
| 4 | Dizionario `correzioni.json` | **fatta — testata su dettato reale** |
| 5 | Correzione + ispezione LLM | **fatta — da testare su un dettato reale** |
| 6 | Estrazione campi + controlli numerici | **fatta — da testare su un dettato reale** |
| 7 | Watcher + gestione errori | **fatta — da testare su un dettato reale** |
| 8 | Invio a ReferralFlow + cancellazione audio | **fatta — attende deploy endpoint in produzione + token** |
| 9 | plist launchd | da fare |

## Requisiti sul Mac mini

- macOS con **FileVault attivo** (SPEC §2.3)
- Python 3.11+ (`python3 --version`)
- ffmpeg: `brew install ffmpeg`
- (dalle fasi 2 e 5: whisper.cpp con `ggml-large-v3`, Ollama con `gemma3:12b`)

## Installazione (fasi 1–2)

```bash
brew install ffmpeg python whisper-cpp
mkdir -p ~/referti-pipeline/modelli
curl -L -o ~/referti-pipeline/modelli/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
```

Il modello pesa ~3,1 GB (download una volta sola). Binario e percorso del
modello sono sovrascrivibili con le variabili `REFERTI_WHISPER` e
`REFERTI_MODELLO`.

Per la fase 5 serve anche Ollama (app macOS) col modello per la correzione:

```bash
ollama pull gemma3:12b
```

(~8 GB, una volta sola; l'app deve essere in esecuzione — icona nella barra
menu. URL e modello sovrascrivibili con `REFERTI_OLLAMA` e `REFERTI_LLM`.)

## Prova su un dettato reale

```bash
python3 pipeline.py /percorso/del/dettato.m4a
```

Accanto al file d'ingresso compaiono `<file_id>.wav` (audio pulito) e
`<file_id>.txt` (trascrizione). L'ID deriva dal contenuto: nei log non passa
mai il nome del file, che potrebbe contenere il nome del paziente.

Nessuna dipendenza Python da installare: solo libreria standard.

## Pannello locale

```bash
python3.14 ~/referti-pipeline/pannello.py
```

Apre http://127.0.0.1:8737 nel browser (solo su questo Mac, mai in rete):
stato della coda e registro del servizio, bozze in attesa di invio con
audio riascoltabile e punti evidenziati, errori con «Riprova», dizionario
con aggiunta di correzioni dello studio (`correzioni-locali.json`, mai
sovrascritto dagli aggiornamenti; il servizio le ricarica a ogni giro).
La conferma clinica dei referti resta in ReferralFlow.
