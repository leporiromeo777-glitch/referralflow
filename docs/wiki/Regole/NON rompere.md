---
tipo: regola
aggiornata: 2026-09-29
---
# NON rompere

- Non toccare `serverExternalPackages: ['@node-rs/argon2', 'pg', 'pdf-parse']` in `next.config.mjs` (chiave in cima, non dentro `experimental`: fino a Next 14 era `experimental.serverComponentsExternalPackages`): senza, il build fallisce sui binari nativi e `pdf-parse` v2 non trova i suoi file.
- Serve Node 20.9+ (Next 16; `--env-file` e i binari argon2). Sul Mac dello studio c'è Node 26.
- Next 16: `params`, `searchParams`, `cookies()` e `headers()` sono asincroni — sempre `await`, niente accesso sincrono (non esiste più). `next-env.d.ts` non si traccia (lo riscrive ogni build/dev).
- Le pagine che leggono dal DB hanno `export const dynamic = 'force-dynamic'`: mantienilo, evita che Next provi a prerenderarle al build.
- `src/lib/auth.ts` e `src/lib/storage.ts` sono lato server (`import 'server-only'`): non importarli in componenti client. Il proxy (`src/proxy.ts`, fino a Next 14 `middleware.ts`) verifica il JWT da solo.
- I prompt di `docs/trascrizione/SPEC.md` §6 (`PROMPT_CORREZIONE`, `PROMPT_ESTRAZIONE`, …) sono validati su referti reali e copiati carattere per carattere: non riscriverli. I prompt nuovi (arbitro, omissioni, terapia, coerenza, lettera) hanno le loro pagine in [[Catena/Panoramica]].
- Il segnaposto `{testo}` nei prompt si riempie con `str.replace`, mai con `format` (il testo può contenere graffe).
- Le migrazioni sono solo in avanti (`db/migrations/0XX_*.sql`, ultima `067_referti_audio_aggiunge_a.sql`) e vanno appese anche a `db/schema.sql`. **Non è una formalità**: il 18.9.2026 si è scoperto che 025, 028, 029 e 030 non erano mai state appese, e un database nuovo nasceva senza `referti_eventi` — cioè con ogni conferma di referto che esplode. La prova era il database della demo, nato da quel file.
- Il pannello e la catena girano con `python3.14` di Homebrew, non con il `python3` di sistema. `timeout` non esiste su macOS.
- La forma della lettera vecchia (grassetto, a capo) si legge con `gs` e `tesseract` di Homebrew (`/opt/homebrew/bin`, gli stessi di `ocrmypdf`; `GS_BIN`, `TESSERACT_BIN` per cambiarli). Se mancano non si rompe niente: resta il testo dell'OCR, senza grassetto.
- Le tabelle `audit.artifacts` e `audit.human_edits` sono immutabili (trigger): mai UPDATE/DELETE.
- Il tipo TypeScript `Filtri` delle pagine con querystring va aggiornato quando si aggiunge un parametro: il build del server è bloccato da `tsc`.
- Caddy: la configurazione viva è `~/silverbullet/caddy/Caddyfile.dominio` (il `Caddyfile` la importa); non ricaricare Caddy con un file diverso e non aggiungere il nome Tailscale `…ts.net` ai blocchi con ACME ([[Piattaforma/Server Mac mini]]).
- **`PRESSIONE_PROPOSTE` è acceso sul server dall'8.10.2026** per decisione esplicita dello studio, presa sapendo che tabella dei farmaci (0 su 45), validazione, rilettura regolatoria e notifica erano aperte (`docs/legale/dispositivo-in-house-pressione/`, Decisioni/Registro). Non riaccenderlo né spegnerlo senza che lo chieda lo studio. Una modifica a `proponi`, `effetto`, `punteggio` o ai loro numeri cambia `VERSIONE_REGOLE` e riapre la validazione. La tabella dei farmaci **non si conferma da codice**: la conferma un medico, riga per riga. ([[Piattaforma/Pressione]])
- **Sul NAS dello studio non si scrive mai** (8.10.2026): la cartella `Archivio-Dati-Philips` è l'archivio di Philips, la piattaforma la legge soltanto. Le immagini catalogate hanno `storage_key` che comincia con `nas:` — nessun codice deve cancellarle, spostarle o riscriverle, e nessuna password del NAS va in un file (sta nel portachiavi del Mac). ([[Piattaforma/Immagini]])
