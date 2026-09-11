---
tipo: tappa
medico: moccetti
aggiornata: 2026-09-12
---
# Terapia strutturata dal dettato

Solo per i profili con `terapia_strutturata: true` (oggi [[Medici/Moccetti]]). La segretaria mette in ogni lettera il blocco «Terapia:» con una riga per farmaco: NOME dose posologia (mattino-mezzogiorno-sera-notte).

## Primo tempo (9.9.2026): il dettato
`PROMPT_TERAPIA` estrae sul modello esterno (testo pseudonimizzato) nome, dose, posologia come detta, stato (in corso / nuovo / modificato / sospeso), nota. Il CODICE fa il resto: `posologia_schema()` («una al mattino e mezza la sera» → «1-0-1/2-0», «1-0-0» → «1-0-0-0», «al bisogno» e le cadenze restano parole, altrimenti resta com'è dettato; frazioni prima degli interi nella regex), `_nome_farmaco_canonico()` prima sull'elenco «farmaci frequenti» del medico (dalla wiki: nome intero, principio attivo o prima parola a distanza ≤ 2 → il nome commerciale come lo scrive la segretaria: «aspirina» → Aspirina Cardio, «Xenone» → Zenon, «bisoprololo» → Concor; dal 12.9.2026, primo referto vero: «aspirina» finiva su Aspirin-C), poi sull'elenco Swissmedic in Title Case («aspirina cardio» → Aspirin Cardio; «ezetimibe» → Ezetimib), `righe_terapia()` con le guardie: ogni numero della riga deve stare nel dettato, sospesi fuori, nome non trovato o dose non in commercio → dubbio, max 15 righe; la nota entra nella riga solo se porta un numero o un tempo («per un mese, poi 150 mg»), mai una motivazione clinica. `sospesi_terapia()` → nomi canonici sospesi.

Tappa «terapia» dopo i doppioni → `payload.terapia` {righe, voci, sospesi, dubbi, fonte:"dettato"}. L'endpoint la accetta da `terapiaPulita` (fino all'11.9.2026 mancava dalla lista e non arrivava mai in tabella).

## Secondo tempo (11.9.2026): le modifiche sulla lettera precedente
`src/lib/referti-terapia.ts` (puro, `fondiTerapia`): blocco «Terapia:» dell'ultima lettera confermata del paziente + voci dettate → righe con PROVENIENZA (precedente / dettata / modificata / nuova), sospese tolte, avvisi (sospeso non in lettera; terapia ridettata per intero con farmaci della precedente non nominati). Modo «dettato» quando tutte le voci sono «in corso» e il testo non dice «invariata»; senza dettato sulla terapia vale la regola di prima (`terapiaInvariata` o `!dettatoConTerapia` → precedente). Chiavi dei farmaci a prime 6 lettere (ASPIRIN/ASPIRINA). Entra in `opzioniRiorganizzazione` (quindi in «Impagina come lettera», con `terapia` in `payload.riorganizzazione`) e nella card «Terapia per la lettera» della bozza.

Caso 29 nella suite; test `src/lib/prove-terapia.test.ts` (6 casi). Banco `banco-terapia.py` 8 casi: codice 8/8, modello 7/8 ([[Misure/Banchi]]).
