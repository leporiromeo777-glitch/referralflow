---
tipo: misure
aggiornata: 2026-09-11
---
# La cartella dei dataset (`~/referti-dataset/`)

Sta sul Mac dello studio, fuori dal repo, protetta da FileVault, mai sincronizzata fuori. Contiene DUE cose diverse che non vanno confuse:

## Dati veri (mai letti dal modello, mai usati come fixture)
- `audio/` — i dettati consegnati, conservati con `REFERTI_CONSERVA_AUDIO=1` (chmod 700) per il futuro addestramento di whisper sulla voce del medico: coppie audio + `testo_finale` per `file_id` ([[Catena/SPEC in breve]] §2.3, regola in `docs/legale/conservazione-audio.md`).
- `oro/` — trascrizioni di riferimento verificate, quando ci sono (`esporta-oro`).
- `coppie/` — coppie prima/dopo per i confronti.
- `bozza-c452-*-riserva.json` — liste di riparazioni salvate da modelli cloud il 4.9.2026 (gemini, opus, qwen; compatta e lista): entrano nel consenso dei banchi dei correttori senza richiamare i modelli.

## Dati sintetici (i banchi)
- `banco-sintetico/` — dettati finti con voce sintetica: `NN.txt` + `NN.wav` e le varianti `NNr` (rumore). La pagella pesata (WER, termini critici, numeri) è in `banco-audio.py` (repo).
- `banco-trascrizioni/`, `banco-anonimizzatore/`, `suite-cattiva/` — casi per trascrizione, anonimizzatore e casi peggiori.
- Script: `banco-correttori.py` (stesso referto pseudonimizzato e stesso prompt lista per tutti i modelli, stesse guardie della catena, consenso ≥ 3 modelli sul cuore della correzione), `banco-locali.py` (solo modelli locali, gratis, con le liste cloud salvate), `banco-voxtral.py`, `banco-openasr.py <modello> [varianti]`, `banco-cohere.py`.
- Modelli whisper alternativi provati e scartati: `medwhisper-large-v3-ita-f16.bin`, `whisper-turbo-it-multi-f16.bin` (turbo rifiutato dall'utente).

I banchi del repo (`pipeline-referti/banco-*.py`) usano solo testi finti scritti nel codice: si possono leggere e committare. I risultati stanno in [[Misure/Banchi]].

Le voci sintetiche sono troppo pulite per decidere sul denoise: su quello comanda l'audio vero del dittafono ([[Decisioni/Registro]]).
