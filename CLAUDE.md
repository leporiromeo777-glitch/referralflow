# ReferralFlow — contesto per Claude Code

Piattaforma multi-studio per la gestione delle referral tra studi medici svizzeri
(Next.js 14 + PostgreSQL) più la catena locale di trascrizione dei referti
(`pipeline-referti/`, Python 3.14, whisper + Voxtral + modelli Ollama, modello
esterno con testo pseudonimizzato). Cliente pilota: Centro Cardiologico Ticino.
Il Mac mini dello studio è il server e questo repo è il suo checkout.

## La documentazione è la wiki: `docs/wiki/`
Che cos'è vero **oggi**, una pagina per argomento, indice in `docs/wiki/index.md`.
Regole d'uso in `docs/wiki/Wiki/Come si usa.md` (SilverBullet su :3400 in LAN la mostra nel browser).
- **Prima di toccare una parte, leggi la sua pagina** (`Catena/…`, `Piattaforma/…`, `Medici/…`).
- **Dopo ogni modifica di comportamento, aggiorna la pagina** dell'argomento
  (riscrivi ciò che non è più vero; non appendere in coda), i numeri in
  `Misure/Banchi.md`, le scelte in `Decisioni/Registro.md`.
- Le decisioni scritte in `Decisioni/Registro.md` valgono come istruzioni: non rilitigarle senza un dato nuovo.
- Niente dati clinici nella wiki, mai esempi presi da referti veri.

## Regole che non si negoziano (dettaglio in `docs/wiki/Regole/`)
- **nLPD**: dati sanitari in Svizzera; mai dati clinici in mail, URL, log, notifiche; il testo
  verso il cloud è PSEUDONIMIZZATO (non «anonimo») e va solo ai fornitori in `FORNITORI_AUTORIZZATI`.
- **Sul Mac dello studio non leggere mai** audio, trascrizioni, `*.dubbi.json`, `*.divergenze.json`,
  nulla in `~/referti/`, testi clinici delle bozze: solo log, numeri, booleani, codice, configurazione
  (vedi `pipeline-referti/CLAUDE.md`).
- **Avvisare prima di spendere**: stima in CHF e ok dell'utente prima di ogni chiamata a pagamento.
- Mai inserire credenziali. Robot MediOnline in SOLA LETTURA. Whisper turbo rifiutato: resta large-v3.
- Le correzioni umane non addestrano nulla in automatico: l'unico apprendimento è il dizionario
  confermato a mano nel cruscotto Qualità AI.
- Ogni cambiamento va misurato (suite `prove-catastrofiche.py`, banchi, `npm run test:app`).

## NON rompere (dettaglio in `docs/wiki/Regole/NON rompere.md`)
- `experimental.serverComponentsExternalPackages: ['@node-rs/argon2', 'pg']` in `next.config.mjs`.
- Node 20+; `python3.14` di Homebrew per la catena; `timeout` non esiste su macOS.
- Pagine che leggono dal DB: `export const dynamic = 'force-dynamic'`.
- `src/lib/auth.ts` e `src/lib/storage.ts` sono `server-only`.
- I prompt di `docs/trascrizione/SPEC.md` §6 non si riscrivono; `{testo}` con `str.replace`, mai `format`.
- Migrazioni solo in avanti in `db/migrations/` (ultima: `034_referti_dizionario.sql`), appese anche a `db/schema.sql`.
- `audit.artifacts` e `audit.human_edits` sono immutabili.
- Una tappa nuova della catena va aggiunta alla lista dell'endpoint `api/referti/bozza` o non arriva in tabella.

## Comandi essenziali
- `npm run dev` · `npm run build` · `npm run test:audit` · `npm run test:app` · `npm run audit-backfill`
- `python3.14 pipeline-referti/prove-catastrofiche.py` (32 casi; `distribuisci.sh` la esegue prima di copiare)
- Distribuire la catena: `bash pipeline-referti/distribuisci.sh` (mai cp+kickstart a mano; il dizionario vivo
  si modifica in `~/referti-pipeline/`; le variabili del servizio stanno in `invio.conf` E nel plist).
- Aggiornare l'app sul server: `bash mac/aggiorna-server.sh` (rebuild quando `.build-stamp` ≠ HEAD).
- Commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; i fix si committano E pushano
  (branch `claude/ai-chain-collaboration-prompt-heacx2`).

## Convenzioni
UI e testi in italiano, sentence case, tono asciutto; palette verde `--cta` #0d5c48 su bianco caldo, niente nero;
server components + server actions dove possibile. Dettaglio in `docs/wiki/Piattaforma/Convenzioni UI.md`.
