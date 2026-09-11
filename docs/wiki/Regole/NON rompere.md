---
tipo: regola
aggiornata: 2026-09-11
---
# NON rompere

- Non toccare `experimental.serverComponentsExternalPackages: ['@node-rs/argon2', 'pg']` in `next.config.mjs`: senza, il build fallisce sui binari nativi (`pdf-parse` v2 sta nella stessa lista).
- Serve Node 20+ (per `--env-file` e i binari argon2).
- Le pagine che leggono dal DB hanno `export const dynamic = 'force-dynamic'`: mantienilo, evita che Next provi a prerenderarle al build.
- `src/lib/auth.ts` e `src/lib/storage.ts` sono lato server (`import 'server-only'`): non importarli in componenti client. Il middleware verifica il JWT da solo.
- I prompt di `docs/trascrizione/SPEC.md` §6 (`PROMPT_CORREZIONE`, `PROMPT_ESTRAZIONE`, …) sono validati su referti reali e copiati carattere per carattere: non riscriverli. I prompt nuovi (arbitro, omissioni, terapia, coerenza, lettera) hanno le loro pagine in [[Catena/Panoramica]].
- Il segnaposto `{testo}` nei prompt si riempie con `str.replace`, mai con `format` (il testo può contenere graffe).
- Le migrazioni sono solo in avanti (`db/migrations/0XX_*.sql`, ultima `034_referti_dizionario.sql`) e vanno appese anche a `db/schema.sql`.
- Il pannello e la catena girano con `python3.14` di Homebrew, non con il `python3` di sistema. `timeout` non esiste su macOS.
- Le tabelle `audit.artifacts` e `audit.human_edits` sono immutabili (trigger): mai UPDATE/DELETE.
- Il tipo TypeScript `Filtri` delle pagine con querystring va aggiornato quando si aggiunge un parametro: il build del server è bloccato da `tsc`.
