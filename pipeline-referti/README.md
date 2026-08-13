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
| 9 | plist launchd | **fatta — installa-avvio.sh (servizio + pannello all’accensione)** |

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

## Vocabolario di dominio (affidabilità)

whisper riceve un **prompt di dominio** con i termini cardiologici e i farmaci
ricorrenti (`vocabolario.txt` + il file locale `vocabolario-locali.txt` + i
termini «giusti» del dizionario): così sbaglia meno proprio sulle parole
difficili. È separato dai prompt LLM di SPEC §6 (che non si toccano): qui
condiziona solo la trascrizione. Per aggiungere termini dello studio, una parola
per riga in `vocabolario-locali.txt` (non viene sovrascritto dagli
aggiornamenti). Sovrascrivibile con `REFERTI_VOCABOLARIO` /
`REFERTI_VOCABOLARIO_LOCALI`. Come ogni modifica alla trascrizione, va
**misurata** confrontando le divergenze sullo stesso dettato prima/dopo.

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

**Impara dalle conferme**: se in `invio.conf` sono configurati
`REFERTI_FLOW_URL`/`REFERTI_FLOW_TOKEN`, il pannello mostra le correzioni
ricorrenti fatte in ReferralFlow (parola sbagliata → giusta) con un tasto
«Aggiungi al dizionario»: un clic le mette in `correzioni-locali.json` e la
trascrizione smette di sbagliarle. La persona decide sempre; nulla si aggiunge
da solo.

## Due modi per consegnare un dettato

1. **Cartella condivisa dello studio** — la cartella sorvegliata è
   `~/referti/ingresso` sul Mac mini. Per usarla da tutti i dispositivi dello
   studio: Impostazioni di macOS → Generali → Condivisione → Condivisione file,
   aggiungere la cartella `referti/ingresso` e dare accesso agli utenti dello
   studio. Chi salva lì un audio (dal Mac della segreteria, dall'iPhone via
   Files, ecc.) lo vede sparire quando la pipeline lo prende in carico.
2. **Drag & drop nella pagina «Referti» di ReferralFlow** — con l'invio
   configurato (`invio.conf`), il servizio controlla a ogni giro anche la coda
   della piattaforma: scarica i dettati caricati dal browser, li trascrive e
   la bozza torna collegata al suo audio (riascoltabile nel dettaglio, con
   scarico del referto in PDF).

## Avvio automatico (Fase 9)

```bash
bash ~/referti-pipeline/installa-avvio.sh
```

Installa due LaunchAgent (servizio e pannello): partono al login e si
riavviano da soli; se Ollama non è ancora pronto, il servizio riprova ogni
minuto. Lo script scrive anche `VERSIONI.md` (SPEC §4.1). Per attivare
l'invio a ReferralFlow: crea `~/referti-pipeline/invio.conf` con
`REFERTI_FLOW_URL=…` e `REFERTI_FLOW_TOKEN=…` e rilancia lo script.
Per fermare tutto: `launchctl unload ~/Library/LaunchAgents/ch.referralflow.*.plist`
