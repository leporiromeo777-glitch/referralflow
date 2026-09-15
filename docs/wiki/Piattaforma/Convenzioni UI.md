---
tipo: piattaforma
aggiornata: 2026-09-11
---
# Convenzioni UI

- UI e testi in italiano, sentence case, tono asciutto. Ogni pagina tiene la riga di spiegazione sotto il titolo.
- Palette e stili in `src/app/globals.css`, design «premium minimale» (2026-07-17): bianco caldo #f4f3ef, verde profondo `--cta` #0d5c48 per azioni e blocchi di pregio (NIENTE nero: l'utente vuole il verde), bottoni a pillola (radius 999px), card 20px, h1 29px. I colori semantici delle urgenze restano. Grafici: SVG server-side, nessuna dipendenza.
- Preferire server components + server actions; client components solo dove serve interattività.
- Mobile: sotto gli 860px navigazione a hamburger (checkbox CSS-only `#navtoggle`; `NavLink` chiude il menu al tocco).

## Intestazioni per zona
`src/app/(app)/PageHero.tsx`, classi `.page-hero` + `.hero-{green|amber|blue|slate}`: verde = operativo (Coda, Programma), ambra = attesa/priorità, blu = controlli futuri (Follow-up), ardesia = monitoraggio/annuario (Inviati, Medici). Statistiche usa `.hero-solid`. Le caselle metriche `.metrics`/`.metric` solo dove i numeri sono il fulcro (Coda, Follow-up); su Inviati la barra `StatStrip` (`.statbar`).

## Pagine con layout proprio
- **Coda** (`(app)/page.tsx`): pannello verde arrotondato e CONTENUTO (`.coda-top`, radius 24/18px, non full-bleed), hero inline bianco, `.stat-grid`/`.stat-card` tutte bianche, filtri `.qf-row`/`.qf-btn` come Link con querystring; tab `?vista=coda|disdette` (`.coda-tabs`). La `margin-top` negativa di `.coda-top` = padding-top di `.content` (36px desktop, 20px ≤ 640).
- **Follow-up**: stesso pannello verde + `.rc-stats`; schede «Ricontattati questo mese» e «Tempo medio di richiamo».
- **Programma**: striscia settimanale `.cal-strip` (numero sopra, giorno sotto, giorno scelto = pillola verde più alta), timeline verticale `.tl` con il prossimo appuntamento in card verde; «Da assegnare» sezione separata.
- **Medici invianti**: `.msearch`, `.mchips`, `.mcard` con avatar (`MediciList.tsx`: foto da `/api/inviante-avatar/[userId]` se l'inviante l'ha caricata, iniziali verdi se ha l'app, omino grigio se solo contatto). Badge «✓ su ReferralFlow» vs «solo contatto».
- **Lista d'attesa** (STORICO, ora scheda Disdette): layout «foglio» `.sheet-top.sheet-green` + `.sheet`; le classi restano in CSS.
- **Qualità AI** (`/referti/qualita/pipeline`): struttura per domande, classi `.aq-*`.

## Interfaccia nuova (prototipo): tema «minimale» (14.9.2026)
Lo strato `public/prototipo/minimal.css` (caricato dopo `styles.css`, si toglie con una riga in `index.html`) porta l'interfaccia nuova a un aspetto piatto e tipografico, richiesto dall'utente dopo il confronto con CardioOS: **IBM Plex Sans/Mono ospitati sul Mac** (`public/prototipo/fonts/`, nessuna richiesta a Google dai browser dello studio), niente sfumature né vetro né ombre sulle carte (ombra solo per finestre e menu), bordi sottili, angoli 6-10 px, **barra laterale scura** (`--side-bg` #14231E) a sezioni con etichetta maiuscola (Operatività, Clinico, AI, Amministrazione: `RF_NAV_GRUPPI` nel ponte), etichette maiuscole piccole sopra i numeri delle tessere, riga «eyebrow» sopra il titolo della Home. Accento = **verde dello studio** `--accent` #0D5C48 (lo stesso `--cta` della piattaforma), mai nero puro (testo #1E2622). I bottoni AI non hanno più il gradiente viola-blu: bianco con bordo verde. Il tema scuro ridefinisce gli stessi token in fondo al file. Regola: i componenti nuovi usano SOLO i token; non si scrivono colori nel ponte.

## Vetro smerigliato: sì sulla cornice, no su quel che compare e sparisce (15.9.2026)
`backdrop-filter` crea un livello composto dalla GPU. Crearlo e distruggerlo di continuo — un cartellino al passaggio del mouse, un foglio che si apre, un avviso che passa — lascia sullo schermo **aree che nessuno ridisegna**: su macOS si vedono come **rettangoli magenta**, e restano lì finché non si scorre. È successo il 15.9.2026 nella pagina Sale e nel dittafono, con lo stesso disegno sotto.

Regola: il vetro resta sulla **cornice fissa** (barra in alto, colonna laterale, barra di stato), che esiste per tutta la sessione. Tutto ciò che appare e scompare — pannelli, fogli, palette, avvisi, cartellini — usa uno sfondo pieno (`--surface`) con bordo e ombra. Si perde la sfocatura, si guadagna una schermata che non si sporca.

