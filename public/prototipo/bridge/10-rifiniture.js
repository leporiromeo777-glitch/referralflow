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


/* ---------- giro dell'interfaccia del 22.9.2026: ciò che non si vedeva o si sovrapponeva ---------- */
(function () {
  const st = document.createElement('style');
  st.textContent = `
/* Revisione, su telefono e tablet: i tasti della barra («Nascondi», «Edita», «Verifica tutto», «Lettura
   pulita», «Termina revisione») stavano su UNA riga larga 889 px: metà restava fuori dallo schermo,
   irraggiungibile. Ora vanno a capo. */
@media (max-width: 1040px) {
  .rv-top-r { flex: 1 1 100%; margin-left: 0; flex-wrap: wrap; justify-content: flex-start; gap: 6px; row-gap: 6px; }
}
/* Sul telefono la barra a capo non deve mangiarsi lo schermo: tasti più piccoli, icone via, e «Tasti»
   (le scorciatoie da tastiera) nascosto, perché lì una tastiera non c'è. */
@media (max-width: 767px) {
  .rv-top-r { gap: 4px; row-gap: 4px; }
  .rv-top-r .btn.sm { font-size: 11.5px; padding: 3px 7px; line-height: 1.5; }
  .rv-top-r .btn.sm svg { display: none; }
  .rv-top-r [onclick="rvCheat()"] { display: none; }
  .rv-top-r .badge, .rv-top-r .caption, .rv-top-r .sep { font-size: 11px; }
  /* due frecce «indietro» una accanto all'altra (quella del telefono e quella della revisione): ne basta una;
     e il nome del paziente sta sulla stessa riga della freccia, non su una riga sua */
  .rv-top > .rf-indietro + .btn.ghost.sm { display: none; }
  .rv-top > .rv-pat { flex: 1 1 0; min-width: 0; flex-wrap: wrap; row-gap: 2px; }   /* su una riga sola durata e stato («confermato») venivano tagliati */
}
/* Finestre più alte dello schermo (es. «Nuovo paziente» sul telefono: 1094 px su 812): il fondo con
   «Salva» non si raggiungeva. La finestra ora scorre dentro lo schermo e i tasti restano in vista. */
.modal-overlay.show { overflow-y: auto; }
.modal { max-height: calc(100dvh - 24px); overflow-y: auto; overscroll-behavior: contain; }
.modal .m-actions { position: sticky; bottom: -22px; margin-bottom: -22px; padding: 12px 0 22px; background: var(--surface); z-index: 1; }
/* Valori lunghi in una coppia etichetta/valore: vanno a capo invece di uscire dalla scheda. */
.kv > span, .kv > code { min-width: 0; overflow-wrap: anywhere; }
/* Pagina di Cleo sul telefono: gli ultimi suggerimenti e la casella finivano sotto il menu a pillola. */
@media (max-width: 767px) {
  .rf-gpt-scroll { padding-bottom: 96px; }
  .rf-gpt-foot { padding-bottom: 84px; }
}
/* Documento delle procedure nel pannello laterale (290 px): il titolo era schiacciato a 100 px e
   «Stampa» usciva dal bordo. Titolo e tasti vanno su due righe quando non c'è spazio. */
.rf-doc-testa { flex-wrap: wrap; }
.rf-doc-testa > div:first-child { flex: 1 1 170px; min-width: 0; }
.rf-doc-testa .az { flex: 0 1 auto; }
`;
  document.head.appendChild(st);
})();
