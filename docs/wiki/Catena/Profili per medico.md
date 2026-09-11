---
tipo: tappa
aggiornata: 2026-09-11
---
# Profili per medico (dal 7.9.2026)

Più medici dettano con la stessa catena: chi carica il dettato SCEGLIE chi ha dettato (pannello locale e pagina Referti, obbligatorio quando i profili ci sono). Profili in `pipeline-referti/medici.json`; marcatore `medico-<id>--` nel nome del file (come `visita-`); `payload.medico` nella bozza; il servizio pubblica l'elenco su `POST /api/referti/medici` → `studios.referti_medici` (migrazione 031, + colonna `medico` su `referti_audio`/`referti_bozze`).

## Campi del profilo
`id`, `nome`, `breve`, `modalita` (lettera | aggiornamento), `formato` (rapporto | lettera), `intestazione` (con `{telefono}`/`{email}` dallo studio), `titolo_rapporto` (con `{data_visita}`), `chiusura`, `firma`, `copia`, `atempo` (+ `atempo_prova`), `vocabolario` (`vocabolario-<id>.txt`), `correzioni` (`correzioni-<id>.json`), `note`, `frasi_fisse`, `farmaci_frequenti`, `contesto`, `terapia_strutturata`. Il loader tiene i campi nuovi (caso 27 della suite).

- **Modalità `aggiornamento`** (Moschovitis): la bozza in arrivo chiede DA SOLA la fusione con l'ultima lettera confermata dello stesso paziente (`fusioneAutomatica` in `api/referti/bozza`, sempre e solo proposta).
- **Modalità `lettera`** (Moccetti): scheda «Lettera precedente» ripiegata.
- **Formato**: `rapporto` (sezioni) o `lettera` («Caro <medico>,» / corpo / saluto): `PROMPT_LETTERA` in `src/lib/referto-struttura.ts`, scelto da `formatoPerBozza()` (profilo pubblicato → payload.medico.formato → rapporto). Bottone «Impagina come lettera (AI)».
- `REFERTI_ATEMPO` a mano vince sul profilo (esperimenti). Prova atempo: `bash pipeline-referti/prova-atempo.sh <audio> moccetti` (0.7, 0.6, 0.5 come bozze ombra nel confronto cieco). Esito in [[Decisioni/Registro]].

## Dizionari, tre strati
`correzioni.json` (studio) ← `correzioni-locali.json` ← `correzioni-<id>-piattaforma.json` (voci confermate nel cruscotto, riscritto dal servizio: NON a mano) ← `correzioni-<id>.json` (il medico). Sezioni `termini_clinici` e `linguaggio_comune`; regola invariabile: mai cifre. Le chiavi più lunghe si applicano prima; maiuscola iniziale conservata. `distribuisci.sh` copia i `correzioni-<id>.json` solo se assenti: la copia viva sta in `~/referti-pipeline/`.

Pagine dei medici: [[Medici/Moccetti]], [[Medici/Moschovitis]].
