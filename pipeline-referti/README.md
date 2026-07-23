# Pipeline locale di trascrizione referti

Codice che gira sul **Mac mini dello studio** (non sul server ReferralFlow).
La fonte di verità è `docs/trascrizione/SPEC.md`: vincoli, prompt e ordine
delle fasi stanno lì. Questa cartella vive nel repo solo per versionare il
codice — si copia sul Mac mini per l'uso.

## Stato delle fasi (SPEC §9)

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Preprocessing ffmpeg → WAV 16 kHz mono | **fatta — da testare su un dettato reale** |
| 2 | Trascrizione whisper.cpp | da fare |
| 3 | Doppia trascrizione + divergenze | da fare |
| 4 | Dizionario `correzioni.json` | da fare |
| 5 | Correzione + ispezione LLM | da fare |
| 6 | Estrazione campi + controlli numerici | da fare |
| 7 | Watcher + gestione errori | da fare |
| 8 | Invio a ReferralFlow + cancellazione audio | da fare (endpoint già pronto) |
| 9 | plist launchd | da fare |

## Requisiti sul Mac mini

- macOS con **FileVault attivo** (SPEC §2.3)
- Python 3.11+ (`python3 --version`)
- ffmpeg: `brew install ffmpeg`
- (dalle fasi 2 e 5: whisper.cpp con `ggml-large-v3`, Ollama con `gemma3:12b`)

## Fase 1 — prova su un dettato reale

```bash
python3 pipeline.py /percorso/del/dettato.m4a
```

Il WAV pulito compare accanto al file d'ingresso, chiamato `<file_id>.wav`
(l'ID deriva dal contenuto: nei log non passa mai il nome del file, che
potrebbe contenere il nome del paziente). Verifica ascoltandolo che la voce
sia integra e il volume uniforme, poi dai l'ok per la Fase 2.

Nessuna dipendenza Python da installare: solo libreria standard.
