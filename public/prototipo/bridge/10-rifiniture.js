/* ---------- le barre che scorrono di lato non devono seguire il dito in su
   (16.9.2026). Le schede dello Studio, i segmenti, il calendario e le
   tabelle larghe si scorrono in orizzontale; sul telefono bastava un filo
   di movimento verticale del dito e partiva anche la pagina, così la barra
   «scappava» mentre la si trascinava. `touch-action: pan-x` dice al browser
   che lì dentro il dito serve solo per andare a destra e a sinistra: il
   resto del movimento viene ignorato, e la pagina resta ferma.
   `overscroll-behavior-x: contain` impedisce che arrivando in fondo alla
   barra lo scorrimento passi alla pagina dietro. ---------- */
(function () { const st = document.createElement('style'); st.textContent = `
/* Solo le barre BASSE: una tabella o un calendario sono alti, e bloccare lì
   dentro il movimento verticale vorrebbe dire non poter più scorrere la
   pagina col dito appoggiato sopra. */
.tabs, .seg, .rf-vc-chips, .rf-v-spunti, .rf-or-scelta {
  touch-action: pan-x;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}
.rf-cal-scorre, .table-wrap { overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
/* La barra delle schede resta una riga sola: se va a capo, «scorrere» non
   vuol più dire niente. */
.tabs { flex-wrap: nowrap; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs > * { flex: none; }
/* Il contenuto dentro quelle barre non deve stirarle in verticale. */
@media (max-width: 640px) { .tabs { margin-bottom: 14px; } }
`; document.head.appendChild(st); })();

