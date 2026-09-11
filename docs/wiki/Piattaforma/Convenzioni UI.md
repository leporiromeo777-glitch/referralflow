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
