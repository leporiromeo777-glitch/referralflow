---
tipo: piattaforma
aggiornata: 2026-09-14
---
# Robot agenda MediOnline (operativo dal 2026-08-14)

La Cassa dei Medici (MediOnline, ASP.NET WebForms con sessione nell'URL, login solo utente+password) non dà un link iCal per tutti i medici → robot Playwright locale in `mac/agenda-robot/` che si logga, legge l'agenda e scrive un `.ics` in `agenda-locale/` (gitignored, dati pazienti); `syncFeed` accetta URL `locale:<nome>.ics` (avviso nello stato del feed se il file è fermo > 2 h).

**VINCOLO UTENTE esplicito: robot in SOLA LETTURA** — compila solo il login, clic solo di navigazione hardcoded, mai salvataggi, dialog rifiutati (`modalitaSolaLettura`); il riparatore AI trova elementi, non decide azioni.

Componenti: `installa.sh` (credenziali in `~/.referralflow-agenda.conf` chmod 600), `comune.mjs` (login generico + radiografia con celle-pazienti redatte), `radiografia.mjs` (browser visibile, l'utente naviga → `~/agenda-radiografia.txt`), `riparatore.mjs` (selettori base → se rotti, gemma locale propone da struttura+screenshot, il codice VERIFICA e salva in `~/.referralflow-agenda-selettori.json`), `leggi-agenda.mjs` (login → Agenda→Appuntamenti → vista Multi + oggi → per ogni giorno, `AGENDA_GIORNI` default 10, legge la griglia DayPilot con geometria a runtime → `agenda-locale/medionline.ics`; filtri `AGENDA_COLORI_IGNORA` e `AGENDA_TESTI_IGNORA`; LOCATION=sigla, `match_field=location`, alias medici ASM/M.M./T.M./…; sveglia `/api/cron/agenda`). Servizio `ch.referralflow.agenda-robot` ai minuti 1,16,31,46.

Collaudato E2E su finta MediOnline e poi dal vivo: 97 appuntamenti veri su 10 giorni, 133 riquadri scartati dai filtri.

Catalogo colori dello studio: tenere verde #2ecc40 (visite), verde acceso #01ff70 (colloqui tel.), blu #0074d9 (risonanze), azzurro #7fdbff (ICCT emodinamica/CVE), arancione #ff851b (ecocardiogrammi), bordeaux #85144b (interventi), rosso #ff4136 solo urgenze; ignorare #ffffff #ffdc00 #000000 #dddddd #111111 #b10dc9 + testi stop/no coro/non occupare/guardia/picchetto.

**Dal 15.9.2026 questo catalogo è anche un DATO**: `prestazioni_catalogo.colore` (migrazione 047) lega ogni colore a una prestazione, e `abbinaPrestazioneAgenda` prova prima il colore (esatto) e solo dopo le parole chiave. È l'unica via che funziona: nel riquadro MediOnline scrive solo l'identità del paziente, quindi le parole chiave non hanno nulla da agganciare — su 1398 appuntamenti in archivio ne hanno un motivo 3. Copertura al 15.9.2026: **1228 appuntamenti su ~1400**; restano 69 su otto colori minori (#ecfc03 ×26, #39cccc ×9, #f012be ×8, #aba354 ×8, #0fcff0 ×7, #bb9fd6 ×4, #9afc03 ×4, #aaaaaa ×3) che lo studio deve battezzare.

Da verificare col tempo: qualità dell'estrazione del nome paziente dai riquadri e aggancio alle referral.

Dal 14.9.2026 ogni evento dell'ICS porta anche `X-RF-COLORE:#rrggbb` (il colore del riquadro nell'agenda originale); la piattaforma lo conserva in `appointments.colore` e l'interfaccia nuova lo mostra ([[Piattaforma/Prototipo stack]]).

## Stato dell'appuntamento (dal 14.9.2026)
MediOnline segna lo stato con un'icona in alto a destra del riquadro: non è un `<img>` ma un `<i class="stN">` con l'immagine nello **sfondo CSS**. I nomi dei file sono in francese e parlanti, quindi il riconoscimento è sul nome del file (più stabile del numero della classe); tabella `STATI` in `leggi-agenda.mjs`, rimediabile senza toccare il codice con `AGENDA_STATI=ag_nuovo_16:fatturato` nel conf.

| classe | file | stato |
| --- | --- | --- |
| `st0` | `ag_RDV_masque_16` | bloccato (orologio + lucchetto) |
| `st1` | `ag_rdv_16` | fissato (orologio) |
| `st2` | `ag_arrive_16_inv` | arrivato (sedia) |
| `st3` | `ag_encours_16_inv` | in corso (stetoscopio) |
| `st4` | `ag_atraiter_16` | **da fatturare** (moneta d'oro, «à traiter») |
| `st5` | `ag_ok_16` | trattato (visto verde) |
| `st6` | `ag_excuse_16` | scusato (faccia); il riquadro ha anche la classe `_Canceled` → `annullato` |
| `st8` | `ag_ok_f_16` | **fatturato** (visto verde con la «F», «facturé») |

Esce nell'ICS come `X-RF-STATO:<parola>`; `src/lib/ical.ts` accetta solo le parole della lista `STATI_AGENDA` e `agenda-sync` lo scrive in `appointments.stato_medionline` (+ `stato_visto_at` quando cambia, migrazione 046). Se l'icona manca o non è in tabella il campo resta **vuoto**: «non lo so» non si scrive come «no».

Per leggerlo serve guardare **indietro**, non solo avanti: lo stato cambia giorni dopo la visita. `AGENDA_GIORNI_INDIETRO` (default 7) fa ripassare i giorni già passati prima di camminare in avanti; un giro completo è quindi 7 + `AGENDA_GIORNI`.

`sonda-riquadri.mjs` è lo strumento con cui si è capito tutto questo: apre l'agenda, stampa la **struttura** dei riquadri (tag, classi, sfondi) con **tutti i testi tolti**, e con `--ritagli` scarica il catalogo delle icone. Da usare ogni volta che serve riconoscere un segno grafico nell'agenda.

Misura del 14.9.2026 su 17 giorni (7 indietro + 10 avanti), 649 appuntamenti: `fissato×344`, `da_fatturare×147`, `fatturato×98`, `trattato×60`. Distribuzione coerente — i giorni futuri tutti «fissato», i giorni lavorati quasi tutti «fatturato»/«trattato», e **3 prestazioni del 7.9 e 1 del 9.9 rimaste con la moneta**: esattamente il segnale che serve.

## Lettura dalla struttura, non dai pixel (dal 15.9.2026)
DayPilot tiene gli appuntamenti in **`dpc.events.list`**, e lì c'è molto più di quello che si ricava misurando i rettangoli:

| campo | cosa è |
| --- | --- |
| `id` | identificativo dell'appuntamento in MediOnline (10 cifre), **stabile** |
| `start.value` / `end.value` | orari esatti (`2026-09-10T09:30:00`) |
| `resource` | id dell'agenda (5 cifre); la mappa id→sigla è in `dpc.columns[0].children` (15 agende: ASM, Appar, DC, P-E V, DG, bcape, frego, GMOS, M.M., miped, vpaio, Labor, T.M., RIA, SF) |
| `backColor` | il colore esatto del riquadro |
| `html` | `<i class='stN'></i>` con lo stato, poi il testo del riquadro |

`estraiGiorno` legge prima di qui e **ricade sulla geometria** solo se la struttura non c'è: niente scala oraria dedotta dalle etichette, niente colonna indovinata dal punto medio, niente arrotondamento ai 5 minuti. Nei log il giorno è marcato `[geometria]` quando si è usata la via vecchia.

Nell'ICS arrivano anche `X-RF-ID` (l'id di MediOnline) e `X-RF-RISORSA`. **L'UID resta la firma di prima**: cambiarlo ora sdoppierebbe gli appuntamenti già in archivio.

Effetto misurato sul passaggio: da 649 a 772 riquadri letti su 17 giorni — la struttura contiene anche quelli che la lettura a pixel non vedeva, fra cui **114 annullati**. Gli annullati e gli scusati escono ora con `STATUS:CANCELLED` e `agenda-sync` li scarta, come prima; i 114 già entrati sono stati cancellati a mano una volta sola.

`sonda-riquadri.mjs` ha tre modi nuovi: `--dati` cerca le strutture di appuntamenti fra le variabili globali (stampa solo i nomi dei campi), `--tag` mostra la FORMA dei valori (lettere→a, cifre→9) senza i contenuti, `--risorse` la mappa risorsa→sigla e lo scheletro dell'html.
