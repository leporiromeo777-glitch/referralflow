---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Robot agenda MediOnline (operativo dal 2026-08-14)

La Cassa dei Medici (MediOnline, ASP.NET WebForms con sessione nell'URL, login solo utente+password) non dà un link iCal per tutti i medici → robot Playwright locale in `mac/agenda-robot/` che si logga, legge l'agenda e scrive un `.ics` in `agenda-locale/` (gitignored, dati pazienti); `syncFeed` accetta URL `locale:<nome>.ics` (avviso nello stato del feed se il file è fermo > 2 h).

**VINCOLO UTENTE esplicito: robot in SOLA LETTURA** — compila solo il login, clic solo di navigazione hardcoded, mai salvataggi, dialog rifiutati (`modalitaSolaLettura`); il riparatore AI trova elementi, non decide azioni.

Componenti: `installa.sh` (credenziali in `~/.referralflow-agenda.conf` chmod 600), `comune.mjs` (login generico + radiografia con celle-pazienti redatte), `radiografia.mjs` (browser visibile, l'utente naviga → `~/agenda-radiografia.txt`), `riparatore.mjs` (selettori base → se rotti, gemma locale propone da struttura+screenshot, il codice VERIFICA e salva in `~/.referralflow-agenda-selettori.json`), `leggi-agenda.mjs` (login → Agenda→Appuntamenti → vista Multi + oggi → per ogni giorno, `AGENDA_GIORNI` default 10, legge la griglia DayPilot con geometria a runtime → `agenda-locale/medionline.ics`; filtri `AGENDA_COLORI_IGNORA` e `AGENDA_TESTI_IGNORA`; LOCATION=sigla, `match_field=location`, alias medici ASM/M.M./T.M./…; sveglia `/api/cron/agenda`). Servizio `ch.referralflow.agenda-robot` ai minuti 1,16,31,46.

Collaudato E2E su finta MediOnline e poi dal vivo: 97 appuntamenti veri su 10 giorni, 133 riquadri scartati dai filtri.

Catalogo colori dello studio: tenere verde #2ecc40 (visite), verde acceso #01ff70 (colloqui tel.), blu #0074d9 (risonanze), azzurro #7fdbff (ICCT emodinamica/CVE), bordeaux #85144b (interventi), rosso solo urgenze; ignorare #ffffff #ffdc00 #000000 #dddddd #111111 #b10dc9 + testi stop/no coro/non occupare/guardia/picchetto.

Da verificare col tempo: qualità dell'estrazione del nome paziente dai riquadri e aggancio alle referral.
