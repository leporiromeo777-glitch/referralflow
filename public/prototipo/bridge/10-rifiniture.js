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


/* ---------- Aggiornamento automatico dell'app (5.10.2026) ----------
   1. Service worker /sw.js: se il sito non risponde (la piattaforma si sta
      ricompilando) mostra una pagina che lo dice e riprova, invece della
      schermata bianca. Non mette niente in cache.
   2. Versione nuova: l'app confronta la propria versione (il ?v= di app.js)
      con quella di index.html sul server — quando torna in primo piano, a
      ogni cambio di pagina e ogni 5 minuti — e si ricarica da sola. Mai
      mentre si lavora: in revisione, al dittafono, con una finestra aperta o
      mentre si scrive in un campo si avvisa soltanto, e si ricarica dopo. */
(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const mia = (() => { const s = [...document.scripts].map(x => x.src).find(x => /\/app\.js\?v=\d+/.test(x)); return s ? Number(/v=(\d+)/.exec(s)[1]) : 0; })();
  if (!mia) return;
  let ultimo = 0, avvisato = false;
  const occupato = () => {
    if (typeof state !== 'undefined' && (state.route === 'review' || state.route === 'dittafono' || state.route === 'visit')) return true;
    if (document.querySelector('#modal-overlay.show, #sheet.show')) return true;
    const a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
  };
  async function controlla() {
    if (Date.now() - ultimo < 60000) return;
    ultimo = Date.now();
    try {
      const r = await fetch('/prototipo/index.html', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return;
      const m = /app\.js\?v=(\d+)/.exec(await r.text());
      const nuova = m ? Number(m[1]) : 0;
      if (!nuova || nuova <= mia) return;
      if (occupato()) {
        if (!avvisato && typeof toast === 'function') { avvisato = true; toast('C’è una versione nuova di ReferralFlow: si aggiorna da sola appena finisci qui'); }
        ultimo = 0;   // si riprova al prossimo cambio di pagina
        return;
      }
      // Una sola ricarica per versione: se qualcosa tiene in giro l'index vecchio non si gira a vuoto.
      try { if (sessionStorage.getItem('rf-ricaricata') === String(nuova)) return; sessionStorage.setItem('rf-ricaricata', String(nuova)); } catch (e) { /* ignora */ }
      location.reload();
    } catch (e) { /* server giù: ci pensa la prossima volta */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void controlla(); });
  window.addEventListener('hashchange', () => { void controlla(); });
  setInterval(() => { void controlla(); }, 5 * 60 * 1000);
})();
