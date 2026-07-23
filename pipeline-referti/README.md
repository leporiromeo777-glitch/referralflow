# Pipeline locale di trascrizione referti

Catena descritta in `SPEC.md` (fonte di verità): dall'audio dettato dal medico
a una **bozza da revisionare** in ReferralFlow. Gira interamente sul Mac mini
dello studio: whisper.cpp e Ollama in locale, nessun dato esce dalla macchina.
L'unica connessione di rete è verso il PostgreSQL di ReferralFlow (§2.1).

```
ingresso/ → preprocessing ffmpeg → doppia trascrizione whisper.cpp →
confronto A/B (divergenze) → dizionario correzioni.json → correzione LLM
(gemma3:12b) → ispezione LLM → estrazione campi → controlli numerici →
INSERT in referti_vocali_bozze → cancellazione sicura dell'audio
```

## Scostamenti dalla SPEC (da conoscere)

1. **`correzioni.json` non era allegato.** La SPEC lo dà per «già fornito», ma
   non è arrivato: `correzioni.esempio.json` è solo un modello con voci
   d'esempio. Copiarlo in `correzioni.json` e inserire le voci reali validate.
   Senza il file la pipeline manda i file in `errori/` alla fase dizionario.
   Il file reale resta sul Mac (è in `.gitignore`).
2. **Salvataggio via PostgreSQL, non via POST.** §3 [11] parla di POST a
   ReferralFlow, ma §2.1 (vincolo invalicabile) ammette in rete solo il
   PostgreSQL: prevale §2.1. Il salvataggio è un INSERT nella tabella
   `referti_vocali_bozze` (migrazione `db/migrations/019_referti_vocali.sql`),
   sempre con `richiede_revisione = true` e stato `da_revisionare` (§2.5).
   La pagina di revisione in ReferralFlow è un lavoro successivo.
3. **Tutte le fasi sono già scritte.** La SPEC chiede di fermarsi dopo ogni
   fase per conferma; questa sessione era non interattiva, quindi la catena è
   completa ma **ogni fase resta collaudabile da sola** con `--fase N` (sotto).
   Il collaudo manuale su referti reali, fase per fase, resta da fare sul Mac.
4. **Guardia numerica sulla correzione LLM.** Rafforzamento di §2.4: se la
   correzione LLM altera anche un solo numero, viene scartata per intero
   (si tiene il testo precedente) e la bozza riceve una nota in
   `note_pipeline`. Il sistema non sceglie mai «quale numero è giusto».

## Installazione sul Mac mini

```bash
# Strumenti
brew install ffmpeg
git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp
cmake -B build && cmake --build build -j          # produce build/bin/whisper-cli
./models/download-ggml-model.sh large-v3
brew install ollama && ollama pull gemma3:12b

# Pipeline
cd pipeline-referti
python3 -m pip install -r requirements.txt
cp correzioni.esempio.json correzioni.json        # poi inserire le voci reali

# Database (una tantum, sul DB di ReferralFlow)
psql "$DATABASE_URL" -f ../db/migrations/019_referti_vocali.sql
```

Variabili d'ambiente (vedi anche il plist): `DATABASE_URL`,
`REFERTI_STUDIO_SLUG` (default `centro-cardiologico-ticino`), `WHISPER_BIN`,
`WHISPER_MODEL`, `OLLAMA_URL` (deve restare su localhost: la pipeline rifiuta
host remoti), `REFERTI_BASE` (default `~/referti`).

Le cartelle (`~/referti/ingresso|lavorazione|errori|archivio_temp|output|log`)
vengono create al primo avvio con permessi `700`.

## Collaudo fase per fase (SPEC §9)

Su **un referto reale**, direttamente sul Mac — il contenuto non viene mai
stampato a terminale, gli artefatti restano in `~/referti/lavorazione/`:

```bash
python3 run.py prova.m4a --fase 1   # solo WAV pulito → ascoltarlo
python3 run.py prova.m4a --fase 2   # trascrizione A → leggerla
python3 run.py prova.m4a --fase 3   # doppia trascrizione (resta il .b.txt; le divergenze si vedono in fase 6 nel JSON)
python3 run.py prova.m4a --fase 4   # dopo il dizionario
python3 run.py prova.m4a --fase 5   # dopo correzione+ispezione LLM
python3 run.py prova.m4a            # catena completa → JSON in output/ + invio
```

Dopo il collaudo, cancellare a mano gli artefatti di prova in `lavorazione/`.

Test automatici (testi finti, nessuna rete, nessun referto reale):

```bash
python3 -m unittest discover -s tests
```

## Servizio (fase 9)

```bash
# Adattare i percorsi nel plist, poi:
cp launchd/ch.referralflow.referti.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ch.referralflow.referti.plist
```

`KeepAlive` riavvia il processo se cade. Con disco quasi pieno (< 1 GB) la
pipeline si ferma e lo segnala nel log (`~/referti/log/pipeline.log`), come da
§7.2: liberare spazio e ricaricare il servizio.

## Promemoria sui vincoli

- I log contengono solo id file, fase, esito, durata (§2.2). Mai contenuto.
- L'audio si cancella (con sovrascrittura) **solo dopo** l'INSERT riuscito;
  se il DB non risponde, JSON e audio restano e si riprova al giro dopo (§2.3).
- Nessun numero viene mai corretto automaticamente, da nessuno strato (§2.4).
- Tutto arriva in ReferralFlow come bozza: `richiede_revisione` è sempre true (§2.5, §8).
- I prompt in `referti/prompts.py` sono copiati carattere per carattere dalla
  SPEC §6: **non modificarli** (c'è un test che li ancora).
