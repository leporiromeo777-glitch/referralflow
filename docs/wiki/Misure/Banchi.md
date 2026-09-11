---
tipo: misure
aggiornata: 2026-09-12
---
# Banchi e misure

Ogni banco usa SOLO dati sintetici. Le chiamate al modello esterno costano centesimi e vanno annunciate prima ([[Regole/nLPD e sessione]]).

| data | banco | comando | risultato |
|---|---|---|---|
| 2026-07-24 | denoise/atempo su dettato di prova | quattro celle | divergenze 65 / 52 / 70 / 23 (insieme) |
| 2026-08-23 | set d'oro sintetico senza denoise | `~/referti-dataset` | WER 26.5% → 23.6%, ma audio vero in loop → denoise resta |
| 2026-09-05 | pagella pesata senza denoise | set sintetico | 19.3 → 18.6; audio vero 12.5k → 10.3k caratteri → resta acceso |
| 2026-09-07 | atempo Moccetti | `prova-atempo.sh` su DS2 65 s | divergenze 11 (0.8) / 12 (0.7) / 14 (0.6) / 15 (0.5) |
| 2026-09-09 | correttori locali e cloud | `~/referti-dataset/banco-locali.py`, `banco-correttori.py` | Qwen 3.8 IQ4_XS 11/17 (225 s), Qwen 3.5-397B e deepseek 11/17, gemma-4-31B 10/17, gemma3:27b 4/17, medgemma 0/17 (877 s) |
| 2026-09-09 | contesto per medico (8 errori d'ascolto) | una prova per condizione | esterno 2/8 → 6/8 (2 s → 21 s); gemma3:27b 4/8 → 3/8; Qwen locale 4/8 → 6/8 (27-42 s → 61-75 s) |
| 2026-09-09 | omissioni | `pipeline-referti/banco-omissioni.py [--modello]` | codice 1/9 (0 falsi); modello 8/9, 0 falsi allarmi (~CHF 0.01) |
| 2026-09-09 | terapia (5 casi) | `banco-terapia.py [--modello]` | codice 5/5, modello 5/5 (~CHF 0.002) |
| 2026-09-11 | arbitro (15 divergenze) | `banco-arbitro.py [--locale] [--solo-nuovo]` | prompt vecchio 13/15, nuovo 14/15 (15/15 al netto delle maiuscole), col contesto 14/15; col codice vecchio 10/15 di fatto |
| 2026-09-11 | terapia (8 casi, con modifiche) | `banco-terapia.py --modello` | codice 8/8, modello 7/8 (nota clinica nella riga → guardia aggiunta) |
| 2026-09-11 | coerenza interna (10 referti) | `banco-coerenza.py` | richiamo 5/5, falsi allarmi 0, 48 s |
| 2026-09-11 | dizionario dalle correzioni (dati reali, solo conteggi) | script una tantum | 5 revisioni, 56 REPLACE, 20 candidate → 19 proposte, 1 ricorrente, 12 «altro» |
| 2026-09-11 | conoscenza dalla wiki nei prompt (attenzioni + esempi finti, [[Agenti/Come funziona]]) | i quattro banchi sopra, `REFERTI_CONOSCENZA=0` per il confronto | arbitro 14/15 → **15/15**; terapia modello 7/8 → **8/8**; omissioni 8/9 → 8/9 (lateralità sola ancora persa); coerenza 5/5, 0 falsi → uguale. Nessuna regressione, tenuta |
| 2026-09-11 | omissioni, lateralità sola nel codice | `banco-omissioni.py` | codice 1/9 → 2/9, 0 falsi allarmi |
| 2026-09-11 | VAD contro senza VAD sull'audio vero conservato (6 dettati, accordo col testimone B) | `banco-vad.py [N]` dalla copia viva `~/referti-pipeline/` (servono i modelli; solo numeri) | 3 a 3; accordo totale VAD 735, senza VAD 712; senza VAD un dettato lungo in loop (108 righe tolte, accordo 152 vs 201); col VAD un altro perde 400 caratteri e 2 numeri (accordo 93 vs 117) senza sentinella → passata DOPPIA sempre |
| 2026-09-11 | verificatori su un'altra famiglia (`modello_verifica=Qwen/Qwen3.5-397B-A17B-FP8`) | `banco-coerenza.py`, `banco-omissioni.py --modello` | coerenza 5/5, 0 falsi (uguale a gemma); omissioni modello 7/9 contro 8/9 di gemma (perde «T difasica» nella frase lunga; la lateralità la prende il codice) → tenuto per l'indipendenza dal correttore, da rivedere sui dati veri con «Quale tappa aiuta davvero» |
| 2026-09-12 | forma dell'impaginazione: lettera tipo + regole dalla wiki (da 12 lettere anonimizzate di Moccetti), modello locale Qwen 3.8 | `npm run banco-forma` (dettato finto, 12 tratti della forma della segretaria) | senza 7/12 → con **12/12**, ~60 s per corsa. Prima del risultato due guardie scartavano la lettera giusta: il lucchetto delle relazioni (misura riconosciuta solo nella lettera) e la firma numero+unità («chili» vs «Kg») → corretti nel codice con test |
| 2026-09-12 | PRIMO REFERTO VERO con la catena nuova (Moccetti, DS2 di 94 s, solo numeri dal log) | `~/referti/log/servizio.log` | 4½ min in tutto; passata doppia: vince senza VAD (accordo 82 → 94); 10 divergenze, arbitro 9 punti / 3 scelte B; correzione 6 riparazioni (4 scartate), verificatore Qwen 9 correzioni riviste / 2 rifiutate; terapia 2 righe + 1 dubbio; omissioni 0 (1 proposta scartata); coerenza 1; fiducia 61/100, 10 fatti, 7 sotto 0.5. Dal Word puro anonimizzato: forma giusta al 90%; due difetti corretti (nome del farmaco su Aspirin-C, Zenon non trovato → elenco del medico; data futura non segnalata → fatto «data»). Correzioni della persona sul testo: 5 (anno di una data, «all'atto» → «alla TAC» → dizionario, «sintomatica» → «asintomatica» già segnalata dalla coerenza, un «ti» mancante, una frase tolta); il blocco Terapia non è stato corretto. Contro la LETTERA DELLA SEGRETARIA (anonimizzata): contenuto uguale salvo tre difetti della catena, tutti ricondotti a una tappa con l'audit (solo booleani): (a) «asintomatica» sentita da ENTRAMBI i motori e trasformata in «sintomatico» dal glossario fonetico → guardia sul prefisso privativo (caso 35); (b) «all'attacco» (entrambi i motori) → il CORRETTORE l'ha fatto diventare «all'atto» → voci di dizionario a monte; (c) «con maggiore frequenza» inventata dall'IMPAGINAZIONE (parola aggiunta passata perché ≤ 6) → «maggior/minor/frequen/eventualment» tra le parole pesanti. Terapia: la segretaria ha 6 righe con dosi (4 dalla lettera precedente, che la piattaforma non aveva). Data della lettera: la segretaria usa il giorno del dettato → adottato |

Suite permanente: `python3.14 pipeline-referti/prove-catastrofiche.py` → 35/35 (12.9.2026). Test app: `npm run test:app` → 29 casi.

Dati reali osservati (solo numeri): destinatario estratto = confermato in 9 bozze su 11 (11.9.2026); collassi di whisper: 3 in 3 giorni sullo stesso medico (7-9.9.2026).
