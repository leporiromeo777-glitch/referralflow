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

## Formati del dittafono Philips DPM (2026-09-07)

I file `.dss` (DSS classico) e `.ds2` (DSS Pro) del DPM 7200 si caricano
come gli altri, dal pannello e dalla pagina Referti: la catena li decodifica
con ffmpeg (demuxer `dss`, decoder `dss_sp` per la modalità SP e `g723_1`
per la LP — verificati sul Mac dello studio). Il file originale resta
com'è (conserva audio compresa); per il riascolto in pagina si converte al
volo in WAV, perché i browser non suonano i DSS. Due limiti da sapere:
la modalità **QP** dei DSS Pro usa un codec che ffmpeg potrebbe non
decodificare (in tal caso il dettato finisce in errori/ alla prima fase e
conviene impostare il dittafono su SP), e i file **cifrati** dal DPM non si
aprono. Non avendo un file di prova, il primo dettato vero è il collaudo.

## Profili per medico (2026-09-07)

Più medici dettano con la stessa catena e ognuno ha abitudini diverse. Chi
carica il dettato sceglie **chi ha dettato** — nel pannello locale (menu
sopra la zona di trascinamento) o nella pagina Referti di ReferralFlow — e
la catena si adegua a lui. I profili stanno in `medici.json` accanto allo
script (solo nomi di medici e impostazioni: mai pazienti):

| Voce | Effetto |
|---|---|
| `atempo` | rallentamento dell'audio per QUEL medico (chi parla veloce può averne uno più forte); `REFERTI_ATEMPO` impostata a mano vince su tutti (esperimenti) |
| `modalita` | `lettera` = detta una lettera nuova (scheda «Lettera precedente» ripiegata); `aggiornamento` = detta gli aggiornamenti alla lettera precedente: la piattaforma **chiede da sola la fusione** con l'ultima lettera confermata dello stesso paziente, se c'è (resta una proposta: si applica con un clic, con le stesse guardie) |
| `vocabolario` | `vocabolario-<id>.txt`: termini suoi, in testa al prompt di whisper |
| `correzioni` | `correzioni-<id>.json`: dizionario e stile suoi (stesse sezioni di correzioni-locali.json), vincono a parità di chiave |
| `atempo_prova` | rallentamenti da provare con `prova-atempo.sh` (numero o lista, es. `[0.7, 0.6, 0.5]`) |

Il medico viaggia nel **nome del file** come marcatore `medico-<id>--` (come
`visita-`): sopravvive a ingresso → lavorazione → errori → riprova. Il
servizio pubblica l'elenco alla piattaforma (`POST /api/referti/medici`)
appena cambia, così i due ingressi mostrano gli stessi nomi; la bozza porta
`payload.medico` (id, nome, modalità, atempo usato) e la carta intestata
Word prende il nome del medico che ha dettato. Un id sconosciuto (profilo
tolto dopo il caricamento) = catena di serie, con avviso nel log.

Profili di partenza: `moccetti` (lettera nuova, parla molto veloce) e
`moschovitis` (aggiornamento). I file per-medico sono dello studio:
`distribuisci.sh` non li tocca.

### Prova di rallentamento per un medico

```bash
bash prova-atempo.sh ~/referti-dataset/audio/<file_id>.m4a moccetti          # 0.7, 0.6 e 0.5 dal profilo
bash prova-atempo.sh ~/referti-dataset/audio/<file_id>.m4a moccetti 0.6 0.5  # valori a scelta
```

Stesso audio, catena identica, solo l'atempo diverso: una corsa per valore,
ogni bozza esce come «ombra» con la sua etichetta (file_id
`…-ombra-atempo-0.6`, `REFERTI_OMBRA_ETICHETTA`) e `/referti/confronto` ne
fa una coppia contro la produzione, alla cieca; l'etichetta compare solo a
scelta fatta. Serve prima la bozza di produzione dello stesso audio (dettato
caricato normalmente col medico scelto; l'originale resta in
`~/referti-dataset/audio/` grazie alla conserva). Ogni corsa è una catena
completa (anche mezz'ora su un dettato lungo): lanciarla con `nohup` quando
il Mac è libero. Lo script stampa solo le righe di log e una tabella finale
(divergenze, dubbi, copertura, manifesto) per variante, mai testo. Il
giudizio vero è la scelta cieca del medico; a referto confermato, il banco
d'oro misura le varianti `attuale`, `atempo-0.7`, `atempo-0.6`, `atempo-0.5`
(`banco-audio.py`). Se una variante vince, si scrive nel profilo (`atempo`)
e vale da lì in poi solo per quel medico.

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

## Controlli sui farmaci (registro Swissmedic)

`farmaci-swissmedic.py` legge i dati aperti di Swissmedic (elenco dei
medicamenti omologati, licenza aperta anche per uso commerciale: nessun dato
paziente) da `~/referti-pipeline/dati/OGD.zip` e produce
`~/referti-pipeline/dati/farmaci-ch.json`: nomi commerciali senza dosaggio,
principi attivi (nome DCI latino + varianti italiane), dosaggi per
confezione, coppie di nomi che si somigliano (LASA). La catena
(`controllo_farmaci`, fase controlli) lo usa SOLO per avvisi: dosaggio
dettato che non esiste per quel farmaco (né come metà/multiplo delle
confezioni, tolleranza 2.5%) e parola sconosciuta seguita da un dosaggio che
somiglia a un farmaco noto («Elikuis 5 mg» → forse «Eliquis»). Senza il file
JSON il controllo non fa nulla. Aggiornamento (il registro cambia ogni
mese): riscaricare lo zip dal portale dati aperti di Swissmedic
(opendata.swiss, «Zugelassene Arzneimittel») e rilanciare lo script.

## Rischio per frase, verificatore selettivo, telemetria (6.9.2026)

- **Rischio per frase** (`valuta_rischio_frasi`): ogni frase della bozza
  riceve un punteggio dai segnali già in catena (numeri e unità, numeri non
  confermati dal secondo orecchio Parakeet, disaccordo tra i due motori,
  negazioni, lateralità, farmaci del registro Swissmedic, frasi non
  supportate, senso, dubbi, punti di loop) e i motivi in chiaro («perché lo
  vedo»). Nel payload: `rischio_frasi` e `numeri` (valore, unità, secondo di
  audio, conferma). La revisione guidata li mette nel primo passo.
- **Verificatore selettivo** (`verificatore=1` nella config esterna): una
  sola chiamata al cloud su correzioni applicate e frasi a rischio, ognuna
  col passaggio del dettato grezzo, al posto delle due riletture intere di
  avvocato del diavolo e ispezione; su intoppo, percorso classico.
- **Anonimizzazione una volta per referto** (`riusa=True`): i dati trovati
  restano in RAM per il referto; le fasi successive li coprono dal codice e
  la controprova AI legge solo le frasi con maiuscole scoperte. Segnaposto
  «[Medico N]» dopo Dr./dott./Prof.
- **Telemetria**: ogni chiamata esterna e locale logga durata e gettoni;
  l'anonimizzazione logga durata e caratteri.
- **Suite cattiva** (`suite-cattiva.py`): 36 frasi × 3 voci sintetiche su
  coppie pericolose (15/50, 0,5/5, non vi è/vi è, destra/sinistra, farmaci
  simili, iper/ipo). Da rilanciare a ogni cambio di motore, prompt o
  preprocessing; esito in `~/referti-dataset/suite-cattiva/`.
- **Audio conservato**: regola in `docs/legale/conservazione-audio.md`;
  scadenza automatica con `REFERTI_CONSERVA_GIORNI`.

## Barriere contro i guasti silenziosi (Ricerca 18, 6.9.2026)

Obiettivo: un errore singolo non deve attraversare in silenzio tutte le difese e diventare un referto firmato.

- **Certificato audio** (`verifica_integrita_audio` → `_analizza_integrita`, pura): errori di decodifica, picco, silenzio, secondi decodificati contro durata dichiarata dal contenitore (file troncato), coda parlata (la registrazione finisce mentre si parla), ora di creazione del file. Avvisi espliciti in bozza; tutto nella cronologia.
- **Testimone non indipendente**: se Voxtral manca, B è ancora whisper → avviso, punti di rischio in più su numeri/negazioni/lateralità/farmaci (`testimone_unico` nel profilo), `indipendenza_testimoni = bassa` nel manifesto.
- **Lucchetto delle relazioni** (`relazioni_intatte`, `_misure_tutte`): la firma numerica «multinsieme» non vede due valori scambiati tra due concetti; ogni misura del profilo deve avere gli stessi valori prima e dopo. Applicato al ripiego di riscrittura locale, al paragrafo esami della fusione (`_esame_relazioni_ok`) e nell'app al bottone «Riorganizza (AI)» (`src/lib/referti-misure-cliniche.ts`).
- **Confini delle clausole** (`_bella_copia_ammessa`): nelle frasi con negazione o lateralità la bella copia può cambiare solo maiuscole, spazi e punto finale.
- **Guardia d'identità della fusione** (`identita_compatibile`): data di nascita o cognome diversi tra lettera incollata e dettato → la fusione non parte (`errore=paziente_diverso`), l'app non applica. Unico HARD STOP.
- **Gate temporale** (`esito_temporale`): per ogni misura cambiata, la lettera fusa porta il valore di oggi, quello precedente, entrambi o nessuno; «prima» = conflitto, l'app chiede una presa d'atto per applicare.
- **Manifesto di sicurezza** (`costruisci_manifesto`, `payload.manifesto`): testimoni, indipendenza, verifica cloud, secondo orecchio, tempi, trasporti per fase (`_TRASPORTI`), fatti critici, numeri non confermati, omissioni gravi, componenti mancanti, `livello_verifica` pieno/ridotto/minimo. In pagina come striscia in cima; nel wizard alimenta il gate pre-firma: con critiche non aperte o livello non pieno la conferma chiede una spunta, registrata in `payload.revisione` (`override_critici`, `livello_verifica`, `presa_atto`) e nel registro eventi.
- **Suite catastrofica** `python3.14 prove-catastrofiche.py`: 14 casi (uno per scenario del documento) su funzioni pure con testo sintetico, in secondi. `bash distribuisci.sh` la esegue, rifiuta di copiare se un caso fallisce o se un referto è in lavorazione, poi copia in `~/referti-pipeline` e riavvia il servizio.

## Lettera incrementale (fusione col referto precedente)

Dalla pagina della bozza si può incollare (o accettare) la lettera
precedente dello stesso paziente: la catena (`lavora_fusioni`, ogni giro del
servizio) anonimizza in un colpo solo lettera + dettato, chiede al modello
un PIANO (quali frasi vanno dove, quali diagnosi/esami cambiano) e ricompone
in locale: la lettera precedente resta verbatim salvo dove il medico ha
dettato; i paragrafi degli esami «aggiornati» sono riscritti coi valori nuovi
dietro guardia numerica. Ogni riga porta la sua provenienza (dettato /
lettera precedente / aggiornato / misto), mostrata come badge nell'app;
il risultato è una proposta che entra nel referto solo con «Applica».

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
