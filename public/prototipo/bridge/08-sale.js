/* ---------- Sale e medici (15.9.2026) ---------- */
// La domanda a cui risponde questo riquadro è una sola: «chi è dove, adesso».
// Non è un calendario: è la situazione di questo momento più il primo cambio
// che arriva. Il piano lo fanno le regole della pagina wiki «Medici/Sale» e il
// cron che lo prepara; qui si disegna, si apre una sala per vedere la sua
// giornata e si corregge la singola fascia (POST /api/prototipo/piano-sale,
// vale per oggi soltanto: la regola resta nella pagina).
//
// Una riga per sala, colore appena accennato: il pallino dice lo stato, il
// testo lo dice comunque a parole. La timeline della giornata — la stessa
// nella Home e nella pagina «Sale» — si apre sotto la riga che si tocca.
(function () { const st = document.createElement('style'); st.textContent = `
.rf-sale-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.rf-sale-sint { font-size:12.5px; color:var(--text-2); margin:4px 0 10px; }
.rf-seg { display:inline-flex; padding:2px; gap:2px; border-radius:999px; background:var(--surface-3); border:1px solid var(--border); flex:none; }
.rf-seg button { border:0; background:transparent; font:inherit; font-size:11px; color:var(--text-2); padding:4px 9px; border-radius:999px; cursor:pointer; transition:.18s var(--ease); }
.rf-seg button:hover { color:var(--text); }
.rf-seg button.on { background:var(--surface); color:var(--text); box-shadow:var(--shadow-1); font-weight:650; }

.rf-sale-el { display:flex; flex-direction:column; }
.rf-sala-r { display:grid; grid-template-columns:8px 74px minmax(0,1fr) auto; gap:9px; align-items:center;
  width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer; border:0; background:transparent;
  border-top:1px solid var(--border); padding:9px 8px; border-radius:10px; transition:background .16s var(--ease); }
.rf-sala-r:first-child { border-top:0; }
.rf-sala-r:hover { background:var(--surface-2); }
.rf-sala-r.sel { background:var(--surface-2); box-shadow:inset 3px 0 0 var(--accent); }
.rf-sala-r .p { width:8px; height:8px; border-radius:50%; background:var(--text-3); }
.rf-sala-r .sn { font-size:12.5px; font-weight:600; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rf-sala-r .chi { display:flex; align-items:center; gap:7px; min-width:0; font-size:12.5px; }
.rf-sala-r .chi span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rf-sala-r .chi.vuota { color:var(--text-2); font-style:italic; white-space:nowrap; }
.rf-sala-r .chi .di { font-style:normal; color:var(--text-3); font-size:11px; overflow:hidden; text-overflow:ellipsis; }
.rf-sala-r .dx { font-size:11px; color:var(--text-3); white-space:nowrap; }
.rf-sala-r .dx b { font-weight:600; color:var(--text-2); }
.rf-sala-r.st-occupata .p { background:var(--accent); }
.rf-sala-r.st-libera .p { background:transparent; border:1.5px solid var(--success); }
.rf-sala-r.st-attesa .p { background:transparent; border:1.5px solid var(--accent); }
.rf-sala-r.st-cambio .p, .rf-sala-r.st-aperta .p { background:var(--warning); }
.rf-sala-r.st-spenta { opacity:.6; }

.rf-av { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; flex:none;
  font-size:9.5px; font-weight:700; letter-spacing:.02em; background:hsl(var(--h) 62% 50% / .2); color:hsl(var(--h) 55% 32%); }
.rf-av.g { width:26px; height:26px; font-size:11px; }
:root[data-theme="dark"] .rf-av { color:hsl(var(--h) 65% 76%); }

.rf-cambi { margin-top:12px; padding-top:10px; border-top:1px solid var(--border); }
.rf-cambi .tit { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-3); font-weight:650; margin-bottom:6px; }
.rf-cambio { display:flex; align-items:center; gap:8px; padding:3px 2px; font-size:12.5px; }
.rf-cambio .ora { width:44px; flex:none; color:var(--text-2); font-variant-numeric:tabular-nums; }
.rf-cambio .dove { color:var(--text-2); margin-left:auto; font-size:11.5px; }

/* La timeline della giornata di una sala: la stessa nella Home e nella pagina. */
.rf-tl { margin:8px 0 2px; }
.rf-tl-barra { position:relative; display:flex; height:30px; border-radius:9px; overflow:hidden; background:var(--surface-3); }
.rf-tl-barra > span { display:flex; align-items:center; padding:0 8px; font-size:11px; font-weight:600; overflow:hidden; white-space:nowrap;
  color:hsl(var(--h) 55% 30%); background:hsl(var(--h) 60% 50% / .18); box-shadow:inset -1px 0 0 var(--surface); }
.rf-tl-barra > span.vuoto { background:transparent; color:var(--text-3); font-weight:400; font-style:italic; }
:root[data-theme="dark"] .rf-tl-barra > span { color:hsl(var(--h) 65% 78%); }
.rf-tl-ore { position:relative; height:14px; margin-top:3px; }
.rf-tl-ore span { position:absolute; transform:translateX(-50%); font-size:10px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-tl-ore span:first-child { transform:none; }
.rf-tl-ore span:last-child { transform:translateX(-100%); }
.rf-tl-adesso { position:absolute; top:0; bottom:0; width:2px; background:var(--danger); border-radius:2px; }
.rf-tl-adesso::after { content:''; position:absolute; top:-3px; left:-2px; width:6px; height:6px; border-radius:50%; background:var(--danger); }
.rf-tl-fasce { margin-top:8px; }
.rf-tl-fascia { display:grid; grid-template-columns:86px minmax(0,1fr); gap:8px; align-items:center; padding:4px 0; font-size:12.5px; }
.rf-tl-fascia .q { color:var(--text-2); font-variant-numeric:tabular-nums; font-size:11.5px; }
.rf-tl-fascia .k { display:flex; align-items:center; gap:7px; min-width:0; }
.rf-tl-fascia .k .pe { color:var(--text-3); font-size:11px; }
.rf-tl-fascia.ora { font-weight:600; }

.rf-sala-pan { margin:2px 0 8px; border:1px solid var(--border); border-radius:14px; padding:12px 13px;
  background:var(--surface); box-shadow:var(--shadow-1); }
.rf-sala-pan .ph { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.rf-sala-pan .ph .nome { font-size:14px; font-weight:650; letter-spacing:-.01em; }
.rf-sala-pan .ph .sf { font-size:11px; color:var(--text-3); }
.rf-sala-pan .x { border:0; background:transparent; color:var(--text-3); font-size:15px; line-height:1; cursor:pointer; padding:3px 5px; border-radius:6px; }
.rf-sala-pan .x:hover { background:var(--surface-3); color:var(--text); }
.rf-sala-pan .nota { font-size:11.5px; color:var(--text-2); line-height:1.5; margin-top:8px; font-style:italic; }
.rf-sala-azioni { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
.rf-sala-azioni select { min-width:148px; }

/* Il calendario della giornata delle sale: una colonna per stanza. */
.rf-cs-scorre { overflow-x:auto; }
.rf-cs-teste { display:flex; gap:4px; padding-bottom:6px; }
.rf-cs-vuoto { width:52px; flex:none; }
.rf-cs-testa { flex:1 1 0; min-width:96px; border:0; background:transparent; font:inherit; color:inherit; cursor:pointer;
  display:flex; flex-direction:column; gap:1px; padding:5px 6px; border-radius:9px; text-align:left; transition:background .16s var(--ease); }
.rf-cs-testa:hover { background:var(--surface-2); }
.rf-cs-testa.sel { background:var(--surface-2); box-shadow:inset 0 -2px 0 var(--accent); }
.rf-cs-testa .sn { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:650; white-space:nowrap; }
.rf-cs-testa .sn .p { width:7px; height:7px; border-radius:50%; background:var(--text-3); flex:none; }
.rf-cs-testa.st-occupata .p { background:var(--accent); }
.rf-cs-testa.st-libera .p { background:transparent; border:1.5px solid var(--success); }
.rf-cs-testa.st-attesa .p { background:transparent; border:1.5px solid var(--accent); }
.rf-cs-testa.st-cambio .p, .rf-cs-testa.st-aperta .p { background:var(--warning); }
.rf-cs-testa .sf { font-size:10px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rf-cs { position:relative; display:flex; gap:4px; border-top:1px solid var(--border); }
.rf-cs-ore { width:52px; flex:none; position:relative; }
.rf-cs-ore span { position:absolute; right:7px; transform:translateY(-50%); font-size:10.5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-cs-col { flex:1 1 0; min-width:96px; position:relative; border-left:1px solid var(--border);
  background-image:linear-gradient(to bottom, var(--border) 1px, transparent 1px); background-size:100% var(--riga,57px); }
.rf-cs-col.sel { background-color:var(--surface-2); }
.rf-cs-b { position:absolute; left:3px; right:3px; border:0; cursor:pointer; font:inherit; text-align:left; overflow:hidden;
  display:flex; flex-direction:column; gap:2px; padding:5px 6px; border-radius:8px;
  background:hsl(var(--h) 60% 50% / .16); color:hsl(var(--h) 55% 28%); box-shadow:inset 3px 0 0 hsl(var(--h) 55% 55% / .55); transition:filter .16s var(--ease); }
.rf-cs-b:hover { filter:brightness(.97); }
.rf-cs-b .o { font-size:10px; opacity:.75; font-variant-numeric:tabular-nums; }
.rf-cs-b .n { font-size:11.5px; font-weight:600; line-height:1.25; word-break:break-word; }
.rf-cs-b .am { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; opacity:.8; }
.rf-cs-b.vuota { background:var(--surface-3); color:var(--text-3); box-shadow:inset 3px 0 0 var(--border-2); }
.rf-cs-b.fuori { background:hsl(var(--h) 60% 50% / .06); box-shadow:inset 3px 0 0 hsl(var(--h) 55% 55% / .25); }
.rf-cs-b.fuori .n { font-weight:600; }
.rf-cs-b.fuori .q { font-size:10px; opacity:.7; }
.rf-cs-b.vuota .n { font-weight:500; }
.rf-cs-b.aperta { background:var(--warning-soft); color:var(--warning); box-shadow:inset 3px 0 0 var(--warning); font-style:italic; }
:root[data-theme="dark"] .rf-cs-b { color:hsl(var(--h) 65% 80%); }
/* Quando la sala ha le visite: micro-barra nell'elenco della Home. */
.rf-mini { position:relative; display:inline-block; width:64px; height:13px; border-radius:4px; background:var(--surface-3); overflow:hidden; vertical-align:middle; }
.rf-mini i { position:absolute; top:2px; bottom:2px; }
.rf-mini .v { min-width:2px; background:var(--accent); opacity:.65; border-radius:1px; }
.rf-mini .v.s { background:var(--danger); opacity:.8; }
.rf-mini .c { width:2px; top:0; bottom:0; background:var(--warning); }
.rf-mini .a { width:1px; top:0; bottom:0; background:var(--text-2); opacity:.55; }
.rf-sala-r .dx b { font-variant-numeric:tabular-nums; margin-right:5px; }
/* Tacche delle visite dentro la barra della timeline. */
.rf-tl-v { position:absolute; bottom:0; height:7px; min-width:2px; background:var(--text); opacity:.3; border-radius:1px 1px 0 0; }
.rf-tl-v.s { background:var(--danger); opacity:.75; }
/* Le visite dentro la colonna del calendario. */
.rf-cs-vv { position:absolute; top:0; bottom:0; left:16px; right:4px; z-index:2; }
.rf-cs-v { position:absolute; z-index:2; border:0; cursor:pointer; font:inherit; text-align:left; overflow:hidden;
  display:flex; flex-direction:column; align-items:stretch; gap:0;
  padding:2px 6px; border-radius:6px; background:var(--surface); color:var(--text-2); box-shadow:0 0 0 1px var(--border), inset 2px 0 0 var(--accent);
  font-size:10.5px; line-height:1.25; }
.rf-cs-v .nm { font-size:10.5px; font-weight:650; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rf-cs-v .pr { font-size:9.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rf-cs-v:hover { color:var(--text); box-shadow:0 0 0 1px var(--border-2), inset 2px 0 0 var(--accent); }
.rf-cs-v.sovra { box-shadow:0 0 0 1px var(--danger-soft), inset 2px 0 0 var(--danger); }
.rf-cs-v.divisa { box-shadow:0 0 0 1px var(--border), inset 3px 0 0 hsl(var(--h) 55% 50%); }
.rf-cs-v.divisa.sovra { box-shadow:0 0 0 1px var(--danger-soft), inset 3px 0 0 hsl(var(--h) 55% 50%); }
.rf-cs-v .md { display:inline-block; margin-right:4px; padding:0 3px; border-radius:3px; font-style:normal;
  font-size:9px; font-weight:700; letter-spacing:.02em; vertical-align:1px;
  background:hsl(var(--h) 55% 50% / .18); color:hsl(var(--h) 55% 30%); }
:root[data-theme="dark"] .rf-cs-v .md { color:hsl(var(--h) 65% 80%); }
/* «Prepara con l'AI»: la barra dice a che punto è. La percentuale è una stima
   sul tempo che ci ha messo l'ultima volta — nessuno sa quanto scriverà — e si
   ferma al 97 % finché non ha finito davvero. */
.rf-avanza { height:6px; border-radius:999px; background:var(--surface-3); overflow:hidden; }
.rf-avanza i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg, var(--ai-1), var(--ai-2)); transition:width .4s var(--ease); }
.rf-lavoro-t { display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; }
.rf-lavoro-t svg { width:14px; height:14px; }
.rf-sug { position:fixed; z-index:9999; max-width:270px; padding:9px 11px; border-radius:11px; pointer-events:none;
  background:var(--surface); border:1px solid var(--border); box-shadow:var(--shadow-2); font-size:12px; line-height:1.45; color:var(--text); }
.rf-sug .t { font-weight:650; font-size:13px; letter-spacing:-.01em; }
.rf-sug .r { color:var(--text-2); margin-top:2px; }
.rf-sug .r b { color:var(--text); font-weight:600; }
.rf-sug .c { color:var(--text-3); font-size:11px; margin-top:6px; padding-top:6px; border-top:1px solid var(--border); }
.rf-cs-adesso { position:absolute; z-index:3; left:52px; right:0; height:2px; background:var(--danger); border-radius:2px; pointer-events:none; }
.rf-cs-adesso b { position:absolute; left:-44px; top:-8px; font-size:10px; font-weight:700; color:var(--danger); font-variant-numeric:tabular-nums; }
`; document.head.appendChild(st); })();

/* Un cartellino al passaggio del mouse. Non è il `title` del browser perché
   quello arriva dopo un secondo e mezzo, non va a capo e non si può leggere
   in fretta: qui serve capire in un attimo chi è e che cosa è. Il contenuto
   sta in `data-sug` (già passato da rfEsc), l'ascolto è delegato al documento
   perché la pagina si ridisegna intera a ogni clic. */
(function () {
  let cart = null;
  const chiudi = () => { if (cart) { cart.remove(); cart = null; } };
  const dentro = (e) => (e.target && e.target.closest) ? e.target.closest('[data-sug]') : null;
  let su = null;
  document.addEventListener('mouseover', (e) => {
    const t = dentro(e);
    if (!t || t === su) return;   // passare da un figlio all'altro non lo fa sfarfallare
    chiudi();
    su = t;
    cart = document.createElement('div');
    cart.className = 'rf-sug';
    cart.innerHTML = t.getAttribute('data-sug') || '';
    document.body.appendChild(cart);
    const r = t.getBoundingClientRect(), c = cart.getBoundingClientRect();
    let x = r.right + 8, y = r.top - 2;
    if (x + c.width > window.innerWidth - 8) x = Math.max(8, r.left - c.width - 8);
    if (y + c.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - c.height - 8);
    cart.style.left = `${x}px`; cart.style.top = `${y}px`;
  });
  document.addEventListener('mouseout', (e) => {
    const t = dentro(e);
    if (!t) return;
    const verso = e.relatedTarget;
    if (verso && verso.closest && verso.closest('[data-sug]') === t) return;
    su = null; chiudi();
  });
  document.addEventListener('click', () => { su = null; chiudi(); });
  document.addEventListener('scroll', () => { su = null; chiudi(); }, true);
  window.addEventListener('hashchange', () => { su = null; chiudi(); });
})();

RF.saleQuando = 'ora';   // 'ora' | 'mattina' | 'pomeriggio'
RF.salaAperta = '';      // la sala con la timeline aperta
RF.saleErrore = '';

const RF_APERTURA = '07:00', RF_CHIUSURA = '19:30';

function rfOraOra() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function rfOraRif() {
  if (RF.saleQuando === 'mattina') return '09:00';
  if (RF.saleQuando === 'pomeriggio') return '15:00';
  const o = rfOraOra();
  return o < RF_APERTURA ? RF_APERTURA : o >= RF_CHIUSURA ? '19:00' : o;
}
function rfMinuti(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; }
/* Il nome senza titoli: «Prof. Dr. med. Tiziano Moccetti» → «Tiziano Moccetti». */
function rfNomeNudo(n) { return String(n || '').replace(/\b(prof|dr|dott|med|ssa)\b\.?/gi, '').replace(/\s+/g, ' ').trim(); }
/* «T. Moccetti»: di Moccetti in studio ce ne sono due, il cognome da solo non basta. */
function rfNomeCorto(n) { const p = rfNomeNudo(n).split(' ').filter(Boolean); return p.length > 1 ? `${p[0][0]}. ${p[p.length - 1]}` : (p[0] || ''); }
function rfIniziali(n) { const p = rfNomeNudo(n).split(' ').filter(Boolean); return ((p[0] || '')[0] || '') + (p.length > 1 ? (p[p.length - 1][0] || '') : '') || '?'; }
/* Una tinta stabile per persona: serve a riconoscerla al volo, non a dire altro. */
function rfTinta(n) { const s = rfNomeNudo(n).toLowerCase(); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function rfAvatar(nome, grande) { return `<span class="rf-av${grande ? ' g' : ''}" style="--h:${rfTinta(nome)}" title="${rfEsc(nome)}">${rfEsc(rfIniziali(nome).toUpperCase())}</span>`; }

/* Cosa scrivere in una fascia senza nessuno: «libera» o «da decidere». */
function rfTestoVuoto(seg) {
  const p = seg.perche || '';
  return /^condivisa fra/.test(p) ? 'da decidere' : p === 'libera' ? 'libera' : '';
}
/* Le visite assegnate a una sala: le calcola il server (assegnaVisite), qui
   si disegnano soltanto. MediOnline non scrive la stanza: una visita sta in
   una delle stanze che il suo medico ha in quel momento. */
function rfVisiteSala(stanza) {
  const v = RF.data && RF.data.pianoSale && RF.data.pianoSale.visite;
  return (v && Array.isArray(v[stanza])) ? v[stanza] : [];
}
/* Che cosa dice il cartellino di una visita: chi è, che cosa è, di chi è
   l'agenda, a che punto è — e che la sala è dedotta, perché MediOnline non la
   scrive. Il testo è già passato da rfEsc: finisce dentro un attributo. */
/* Il nome del paziente come lo scrive il resto dell'app: prima la cartella,
   poi quel che c'è scritto nel riquadro dell'agenda. Così nel calendario delle
   sale e nell'agenda si legge lo stesso nome. */
function rfVisitaNome(v) {
  const a = (typeof APPTS !== 'undefined' ? APPTS : []).find(x => x.id === v.id);
  if (a && a.p && typeof P !== 'undefined' && P[a.p] && typeof fullName === 'function') {
    const n = fullName(P[a.p]);
    if (n) return n;
  }
  return (a && (a.nomeBreve || a.nome)) || v.paziente || 'Paziente';
}
function rfSugVisita(v, stanza) {
  const et = v.motivo || v.etichetta || (v.tipo ? v.tipo : '');
  const righe = [
    `<div class="t">${rfEsc(rfVisitaNome(v))}</div>`,
    `<div class="r"><b>${rfEsc(v.inizio)}–${rfEsc(v.fine)}</b>${et ? ` · ${rfEsc(et)}` : ' · appuntamento senza motivo scritto'}</div>`,
  ];
  if (v.medico) righe.push(`<div class="r">${rfEsc(rfNomeNudo(v.medico))}${v.medicoDedotto ? ' <span class="pe" style="font-size:10.5px">(medico dedotto)</span>' : ''} · ${rfEsc(stanza)}</div>`);
  if (v.stato && typeof rfStatoPill === 'function') righe.push(`<div class="r">${rfStatoPill(v.stato)}</div>`);
  if (v.medicoDedotto) righe.push(`<div class="c">In agenda questo appuntamento non ha un medico — è in una colonna di apparecchi. Il nome viene da chi vede questo paziente oggi.</div>`);
  righe.push(`<div class="c">${v.sovra
    ? 'Sala dedotta: in questo momento il medico ha già tutte le sue stanze occupate. Una fetta in agenda non è sempre una persona dentro una stanza.'
    : 'Sala dedotta da chi ha la stanza in questa fascia: MediOnline non scrive dove avviene la visita.'}</div>`);
  return righe.join('');
}
/* Quanto una stanza è presa davvero in questa fascia: dalla prima all'ultima
   visita. Lo calcola la piattaforma (`prese` in src/lib/sale), così il
   calendario e quel che legge l'AI dicono la stessa cosa. */
function rfPresaFascia(stanza, seg) {
  const p = (RF.data && RF.data.pianoSale && RF.data.pianoSale.prese) || {};
  return (p[stanza] || []).find(x => x.dalle >= seg.dalle && x.dalle < seg.alle) || null;
}
/* I medici che hanno visite in questa stanza oggi. Quando sono più d'uno il
   nome scritto sulla fascia non basta: due persone che si dividono la stessa
   stanza vanno distinte visita per visita, o i pazienti sembrano tutti dello
   stesso (detto guardando la Sala 4 il 16.9.2026: Rego e Tiziano mischiati). */
function rfMediciSala(stanza) {
  const fuori = [];
  for (const v of rfVisiteSala(stanza)) {
    const m = (v.medico || '').trim();
    if (m && !fuori.some(x => x === m)) fuori.push(m);
  }
  return fuori;
}
function rfVisiteFascia(stanza, seg) {
  return rfVisiteSala(stanza).filter(v => v.inizio >= seg.dalle && v.inizio < seg.alle);
}
function rfSegAllOra(riga, ora) {
  const segs = riga.segmenti || [];
  return segs.find(s => ora >= s.dalle && ora < s.alle) || segs[segs.length - 1] || null;
}
/* Il primo cambio di persona dopo questa fascia, se c'è. */
function rfProssimoCambio(riga, seg) {
  const segs = riga.segmenti || [];
  const i = segs.indexOf(seg);
  for (let k = i + 1; k < segs.length; k++) if (segs[k].chi !== seg.chi) return segs[k];
  return null;
}
// Lo stato di una sala non è «di chi è», è «chi c'è dentro». Una stanza
// intestata a Marco in cui oggi non entra nessuno è LIBERA, e dirlo occupata
// sarebbe una bugia comoda: le visite si stringono nelle stanze che servono
// davvero (assegnaVisite riempie la prima libera), e quel che resta si può
// dare a chi una stanza non ce l'ha.
function rfStatoStanza(riga, ora) {
  const seg = rfSegAllOra(riga, ora);
  if (!seg) return { classe: 'st-spenta', testo: 'Nessuna fascia', visite: [], vuotaOggi: true };
  const dopo = rfProssimoCambio(riga, seg);
  const vicino = !!dopo && rfMinuti(dopo.dalle) - rfMinuti(ora) <= 60 && rfMinuti(dopo.dalle) >= rfMinuti(ora);
  const aperta = !seg.chi && /^condivisa fra/.test(seg.perche || '');
  const visite = rfVisiteSala(riga.stanza);
  const inCorso = visite.filter(v => v.inizio <= ora && ora < v.fine);
  const prossima = visite.find(v => v.inizio > ora) || null;
  const vuotaOggi = visite.length === 0;
  let classe, testo;
  if (inCorso.length) { classe = 'st-occupata'; testo = inCorso.length > 1 ? `${inCorso.length} pazienti` : 'Occupata'; }
  else if (vuotaOggi) { classe = aperta ? 'st-aperta' : 'st-libera'; testo = aperta ? 'Da decidere' : 'Libera oggi'; }
  else if (prossima) { classe = vicino ? 'st-cambio' : 'st-attesa'; testo = `Libera fino alle ${prossima.inizio}`; }
  else { classe = 'st-attesa'; testo = 'Finita per oggi'; }
  return { classe, testo, seg, dopo, vicino, aperta, visite, inCorso, prossima, vuotaOggi };
}

/* Tutti i cambi di persona da adesso in poi, in ordine. */
function rfCambiDelGiorno(righe, ora) {
  const fuori = [];
  for (const r of righe) {
    const segs = r.segmenti || [];
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].chi === segs[i - 1].chi) continue;
      if (segs[i].dalle <= ora) continue;
      fuori.push({ ora: segs[i].dalle, stanza: r.stanza, chi: segs[i].chi, prima: segs[i - 1].chi });
    }
  }
  return fuori.sort((a, b) => a.ora.localeCompare(b.ora) || a.stanza.localeCompare(b.stanza));
}

function rfSaleQuando(q) { RF.saleQuando = q; render(); }
function rfSalaApri(nome) { RF.salaAperta = RF.salaAperta === nome ? '' : nome; RF.saleErrore = ''; render(); }
function rfSalaChiudi() { RF.salaAperta = ''; render(); }

RF.pianoLavoro = null;
RF.pianoOrologio = null;
RF.saleEsito = null;
RF.senzaSalaAperto = '';
function rfSenzaSala(chi) { RF.senzaSalaAperto = RF.senzaSalaAperto === chi ? '' : chi; render(); }

/* Il pulsante: fa partire lo stesso lavoro che il cron fa di notte, e poi
   guarda a che punto è. Il modello locale ci mette minuti, quindi la risposta
   torna subito e l'avanzamento si chiede ogni secondo e mezzo. */
async function rfPianoGenera() {
  RF.saleErrore = '';
  RF.pianoLavoro = { attivo: true, fase: 'regole', percento: 0, ms: 0, caratteri: 0, pensiero: 0, dettaglio: 'preparo il lavoro' };
  render();
  try {
    const r = await fetch('/api/prototipo/piano-sale', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'rigenera' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { RF.saleErrore = j.errore || 'Non è partito.'; RF.pianoLavoro = null; render(); return; }
    if (j.lavoro) RF.pianoLavoro = j.lavoro;
    rfPianoSegui();
  } catch { RF.saleErrore = 'Il server non risponde.'; RF.pianoLavoro = null; render(); }
}
function rfPianoMmSs(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function rfPianoDettaglio(l) {
  if (!l) return '';
  if (l.fase === 'modello') {
    const quanto = l.pensiero ? `${l.pensiero} caratteri di ragionamento` : l.caratteri ? `${l.caratteri} caratteri scritti` : 'sta leggendo il piano';
    return `${rfEsc(l.dettaglio)} · ${rfPianoMmSs(l.ms)} · ${quanto}`;
  }
  return `${rfEsc(l.dettaglio)}${l.attivo ? ` · ${rfPianoMmSs(l.ms)}` : ''}`;
}
/* L'aggiornamento tocca i tre pezzi della barra invece di ridisegnare la
   pagina: se c'è un pannello aperto con una scelta a metà, non si perde. */
function rfPianoSegui() {
  clearTimeout(RF.pianoOrologio);
  RF.pianoOrologio = setTimeout(async () => {
    let l = null;
    try {
      const r = await fetch('/api/prototipo/piano-sale', { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      l = j.lavoro || null;
    } catch { RF.pianoLavoro = null; render(); return; }
    RF.pianoLavoro = l;
    if (l && l.attivo) {
      const barra = document.getElementById('rf-piano-barra');
      const pct = document.getElementById('rf-piano-pct');
      const det = document.getElementById('rf-piano-det');
      if (barra && pct && det) { barra.style.width = `${l.percento}%`; pct.textContent = `${l.percento}%`; det.innerHTML = rfPianoDettaglio(l); }
      else render();
      rfPianoSegui();
      return;
    }
    await rfCaricaDati();   // finito: il piano nuovo arriva insieme ai dati
  }, 1500);
}
function rfPianoCarta() {
  const l = RF.pianoLavoro;
  if (!l) return '';
  const finito = !l.attivo;
  return `<div class="card">
    <div class="card-head"><span class="rf-lavoro-t">${ICONS.ai} ${finito ? (l.fase === 'errore' ? 'Non è riuscito' : 'Piano pronto') : 'L\'AI sta preparando il piano'}</span><span class="badge count" id="rf-piano-pct">${l.percento}%</span></div>
    <div class="rf-avanza"><i id="rf-piano-barra" style="width:${l.percento}%"></i></div>
    <div class="caption mt-8" id="rf-piano-det">${rfPianoDettaglio(l)}</div>
    ${l.attivo ? `<div class="caption mt-8">La percentuale è una stima sul tempo che ci ha messo l'ultima volta (${rfPianoMmSs(l.attesi)}): quanto scriverà non si sa prima. Puoi lasciare la pagina, il lavoro va avanti.</div>` : ''}
  </div>`;
}

async function rfSalePost(corpo) {
  try {
    const r = await fetch('/api/prototipo/piano-sale', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { RF.saleErrore = j.errore || 'Non ha funzionato.'; render(); return; }
    RF.saleErrore = '';
    await rfCaricaDati();
  } catch { RF.saleErrore = 'Il server non risponde.'; render(); }
}
function rfSalaAssegna(stanza, dalle) {
  const sel = document.getElementById('rf-sala-chi');
  rfSalePost({ azione: 'assegna', stanza, dalle, chi: sel ? sel.value : '' });
}
function rfSalaRipristina(stanza, dalle) { rfSalePost({ azione: 'ripristina', stanza, dalle }); }
/* Confermare non mette un timbro: applica. Quel che non si è potuto applicare
   si dice, invece di sparire. */
async function rfPianoAccetta() {
  RF.saleEsito = null;
  try {
    const r = await fetch('/api/prototipo/piano-sale', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'accetta' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { RF.saleErrore = j.errore || 'Non ha funzionato.'; render(); return; }
    RF.saleErrore = '';
    RF.saleEsito = { applicate: j.applicate || [], saltate: j.saltate || [] };
    await rfCaricaDati();
  } catch { RF.saleErrore = 'Il server non risponde.'; render(); }
}

/* La giornata di una sala, dall'apertura alla chiusura: la barra con le fasce,
   le ore sotto, il segno di dov'è adesso, e l'elenco delle fasce a parole —
   il colore non deve mai essere l'unica cosa che dice chi c'è. */
function rfSalaTimeline(riga, ora) {
  const inizio = rfMinuti(RF_APERTURA), fine = rfMinuti(RF_CHIUSURA), arco = fine - inizio;
  const dove = (t) => Math.max(0, Math.min(100, (rfMinuti(t) - inizio) / arco * 100));
  const segs = riga.segmenti || [];
  const attuale = rfSegAllOra(riga, ora);
  const ore = [];
  for (let h = 7; h <= 19; h += 2) ore.push(`${String(h).padStart(2, '0')}:00`);
  const dentro = rfMinuti(ora) >= inizio && rfMinuti(ora) <= fine;
  return `<div class="rf-tl">
    <div class="rf-tl-barra">
      ${segs.map(s => `<span class="${s.chi ? '' : 'vuoto'}" style="width:${((rfMinuti(s.alle) - rfMinuti(s.dalle)) / arco * 100).toFixed(2)}%;--h:${rfTinta(s.chi || 'x')}" title="${rfEsc(s.dalle)}–${rfEsc(s.alle)} · ${rfEsc(s.chi || s.perche || '')}">${rfEsc(s.chi ? rfNomeCorto(s.chi) : rfTestoVuoto(s))}</span>`).join('')}
      ${rfVisiteSala(riga.stanza).map(v => `<i class="rf-tl-v${v.sovra ? ' s' : ''}" style="left:${dove(v.inizio).toFixed(2)}%;width:${Math.max(0.3, (rfMinuti(v.fine) - rfMinuti(v.inizio)) / arco * 100).toFixed(2)}%" title="${rfEsc(v.inizio)}–${rfEsc(v.fine)}${v.etichetta ? ` · ${rfEsc(v.etichetta)}` : ''}"></i>`).join('')}
      ${dentro ? `<i class="rf-tl-adesso" style="left:${dove(ora).toFixed(2)}%" title="${rfEsc(ora)}"></i>` : ''}
    </div>
    <div class="rf-tl-ore">${ore.map(h => `<span style="left:${dove(h).toFixed(2)}%">${h.slice(0, 2)}</span>`).join('')}</div>
    <div class="rf-tl-fasce">${segs.map(s => `<div class="rf-tl-fascia${s === attuale ? ' ora' : ''}"><span class="q">${rfEsc(s.dalle)}–${rfEsc(s.alle)}</span>
      <span class="k">${s.chi ? `${rfAvatar(s.chi)}<span>${rfEsc(rfNomeNudo(s.chi))}</span>` : `<span style="color:var(--text-2);font-style:italic">${rfEsc(rfTestoVuoto(s) || 'libera')}</span>`}<span class="pe">${rfEsc(s.perche || '')}${(() => { const n = rfVisiteFascia(riga.stanza, s).length; return n ? ` · ${n} ${n === 1 ? 'visita' : 'visite'}` : ''; })()}</span></span></div>`).join('')}</div>
  </div>`;
}

/* Il pannello di una sala: la sua giornata, la nota della regola, e le due
   cose che si possono fare. «Applica per oggi» vale per il giorno; di chi è
   la stanza si scrive nella pagina wiki, non qui. */
function rfSalaPannello(riga, ora) {
  const p = RF.data.pianoSale || {};
  const st = rfStatoStanza(riga, ora);
  const seg = st.seg;
  const presenti = Array.isArray(p.presenti) ? p.presenti : [];
  const opzioni = [...new Set([...presenti, ...(seg && seg.chi ? [seg.chi] : [])])].sort((a, b) => rfNomeCorto(a).localeCompare(rfNomeCorto(b)));
  // La proposta riguarda questa sala se la nomina: da quando il modello
  // assegna anche le stanze vuote, «da_decidere» non basta più.
  const inProposta = !!p.proposta && (p.proposta.includes(riga.stanza) || (p.da_decidere || []).some(d => d.stanza === riga.stanza));
  return `<div class="rf-sala-pan">
    <div class="ph"><div><div class="nome">${rfEsc(riga.stanza)}</div>${riga.funzione ? `<div class="sf">${rfEsc(riga.funzione)}</div>` : ''}</div>
      <button class="x" onclick="rfSalaChiudi()" title="Chiudi">✕</button></div>
    ${rfSalaTimeline(riga, ora)}
    ${riga.nota ? `<div class="nota">${rfEsc(riga.nota)}</div>` : ''}
    ${inProposta && p.proposta ? `<div class="rf-piano-prop" style="margin-top:10px"><div class="t">${ICONS.ai} Proposta per le caselle aperte</div><div class="c">${rfEsc(p.proposta).replace(/\n/g, '<br>')}</div><div class="caption mt-8">${rfEsc(p.proposta_da || '')}${p.accettata_at ? ' · accettata' : ' · da confermare, la decisione è di chi è in studio'}</div>${p.accettata_at ? '' : '<button class="btn sm mt-8" onclick="rfPianoAccetta()">Confermo e applico</button>'}</div>` : ''}
    ${seg ? `<div class="rf-sala-azioni">
      <select class="input sm" id="rf-sala-chi">${opzioni.map(n => `<option value="${rfEsc(n)}"${seg.chi === n ? ' selected' : ''}>${rfEsc(n)}</option>`).join('')}<option value=""${seg.chi ? '' : ' selected'}>Nessuno · sala libera</option></select>
      <button class="btn sm primary" onclick="rfSalaAssegna('${rfEsc(riga.stanza)}', '${rfEsc(seg.dalle)}')">Applica per oggi</button>
      ${seg.manuale ? `<button class="btn sm ghost" onclick="rfSalaRipristina('${rfEsc(riga.stanza)}', '${rfEsc(seg.dalle)}')">Torna alla regola</button>` : ''}
    </div>
    <div class="caption mt-8">Cambia la fascia ${rfEsc(seg.dalle)}–${rfEsc(seg.alle)} di oggi. Di chi è la stanza si scrive nella pagina «Medici/Sale».</div>` : ''}
    ${RF.saleErrore ? `<div class="caption mt-8" style="color:var(--danger)">${rfEsc(RF.saleErrore)}</div>` : ''}
  </div>`;
}

/* L'elenco: una sala per riga, e sotto la riga toccata la sua giornata.
   A destra l'ora del cambio, non chi arriva: chi arriva lo dicono «Prossimi
   cambi» qui sotto e la timeline della sala, e il nome del medico di adesso
   non deve essere tagliato per farci stare due volte la stessa cosa. */
function rfSaleElenco(righe, ora) {
  return `<div class="rf-sale-el">${righe.map(r => {
    const st = rfStatoStanza(r, ora);
    const seg = st.seg;
    // A destra la giornata in piccolo: una tacca per visita, il segno ambra
    // dove la sala cambia medico, il filo grigio sull'ora di riferimento.
    const visite = rfVisiteSala(r.stanza);
    const g0 = rfMinuti(RF_APERTURA), arco = rfMinuti(RF_CHIUSURA) - g0;
    const dove = (t) => Math.max(0, Math.min(100, (rfMinuti(t) - g0) / arco * 100));
    const mini = `<span class="rf-mini" title="${visite.length} ${visite.length === 1 ? 'visita' : 'visite'} in questa sala${st.dopo ? ` · cambia medico alle ${rfEsc(st.dopo.dalle)}` : ''}">
      ${visite.map(v => `<i class="v" style="left:${dove(v.inizio).toFixed(2)}%;width:${Math.max(0.4, (rfMinuti(v.fine) - rfMinuti(v.inizio)) / arco * 100).toFixed(2)}%"></i>`).join('')}
      ${st.dopo ? `<i class="c" style="left:${dove(st.dopo.dalle).toFixed(2)}%"></i>` : ''}<i class="a" style="left:${dove(ora).toFixed(2)}%"></i></span>`;
    const dx = `${visite.length ? `<b>${visite.length}</b>` : ''}${mini}`;
    const riga = `<button class="rf-sala-r ${st.classe}${RF.salaAperta === r.stanza ? ' sel' : ''}" onclick="rfSalaApri('${rfEsc(r.stanza)}')" title="${rfEsc(r.stanza)} · ${rfEsc(st.testo)}${r.funzione ? ` · ${rfEsc(r.funzione)}` : ''}">
      <i class="p"></i><span class="sn">${rfEsc(r.stanza)}</span>
      ${seg && seg.chi && !st.vuotaOggi
        ? `<span class="chi">${rfAvatar(seg.chi)}<span>${rfEsc(rfNomeNudo(seg.chi))}</span>${seg.manuale ? '<span class="pe" style="font-size:10px;color:var(--accent-text);font-weight:650">a mano</span>' : ''}</span>`
        : `<span class="chi vuota">${rfEsc(st.testo)}${seg && seg.chi ? `<span class="di">· di ${rfEsc(rfNomeCorto(seg.chi))}</span>` : ''}</span>`}
      <span class="dx">${dx}</span></button>`;
    return riga + (RF.salaAperta === r.stanza ? rfSalaPannello(r, ora) : '');
  }).join('')}</div>`;
}

/* Il riquadro della Home. `sale` e `rigaSala` servono solo al ripiego: finché
   il piano del giorno non c'è, si mostra l'occupazione letta dall'agenda. */
function rfCardSale(sale, rigaSala, nMed) {
  // Dal 16.9.2026 la card legge il gemello (api/orchestrazione/stato): chi
  // c'è dentro ogni stanza adesso e chi entra dopo. La stanza non è più «di»
  // un medico: è del paziente che ci sta.
  const o = RF.orch;
  if (!o) {
    return `<div class="card"><div class="card-head"><span class="section-title">Sale e medici</span><button class="btn sm ghost" data-go="#/sale">Sale ${ICONS.chevR}</button></div>
      <div class="caption" style="padding:8px 6px">Carico chi è dove…</div></div>`;
  }
  const presenti = (o.medici || []).filter(m => m.stato !== 'assente').length;
  const occupate = o.sale.filter(x => ['occupata_visita', 'occupata_pronto', 'in_preparazione'].includes(x.stato)).length;
  const dot = (st) => st === 'occupata_visita' ? 'st-occupata' : ['occupata_pronto', 'in_preparazione', 'riservata'].includes(st) ? 'st-cambio' : ['bloccata', 'fuori_servizio'].includes(st) ? 'st-spenta' : 'st-libera';
  const righe = o.sale.map(x => {
    const d = x.dentro[0];
    const chi = d ? `<span class="chi">${rfAvatar(d.medico || '?')}<span>${rfEsc(rfNomeCorto(d.medico || 'senza medico'))}${rfOrRitardo(d.medico)} · ${rfEsc(rfNomeCortoPaz(d.etichetta))}</span></span>` : `<span class="chi vuota">nessuno</span>`;
    const testo = d ? `${rfOrStato(d.stato)}${d.inizio != null ? ` dalle ${rfOrHm(d.inizio)}` : ''}${x.dentro.length > 1 ? ` · +${x.dentro.length - 1}` : ''}`
      : ['bloccata', 'fuori_servizio'].includes(x.stato) ? rfOrStato(x.stato)
      : x.prossimo ? `libera · ${rfEsc(rfNomeCortoPaz(x.prossimo.etichetta))} alle ${rfOrHm(x.prossimo.ingresso)}` : 'libera oggi';
    return `<button type="button" class="rf-sala-r ${dot(x.stato)}" onclick="RF.saleVista='adesso';RF.orchSala='${rfEsc(x.nome)}';go('#/sale')" title="${rfEsc(x.nome)} · ${rfEsc(rfOrStato(x.stato))}">
      <i class="p"></i><span class="sn">${rfEsc(x.nome)}</span>${chi}<span class="dx">${testo}</span></button>`;
  }).join('');
  const prossimi = o.sale.filter(x => x.prossimo).map(x => ({ ...x.prossimo, stanza: x.nome })).sort((a, b) => a.ingresso - b.ingresso).slice(0, 3);
  const ritardi = (o.medici || []).filter(m => (m.ritardo || 0) >= (o.parametri && o.parametri.soglia_avviso_min || 8));
  return `<div class="card">
    <div class="rf-sale-head"><span class="section-title">Sale e medici</span><span class="caption">${o.adessoHm}</span></div>
    <div class="rf-sale-sint">${presenti} ${presenti === 1 ? 'medico presente' : 'medici presenti'} · ${occupate}/${o.sale.length} sale occupate${ritardi.length ? ` · ${ritardi.map(m => `<b style="color:#8a4b12">${rfEsc(rfNomeCorto(m.nome))} +${m.ritardo}</b>`).join(', ')}` : ''}</div>
    <div class="rf-sale-el">${righe}</div>
    ${prossimi.length ? `<div class="rf-cambi"><div class="tit">Prossimi ingressi</div>
      ${prossimi.map(x => `<div class="rf-cambio"><span class="ora num">${rfOrHm(x.ingresso)}</span>${rfAvatar(x.medico || '?')}<span>${rfEsc(rfNomeCortoPaz(x.etichetta))} · ${rfEsc(rfNomeCorto(x.medico || ''))}${rfOrRitardo(x.medico)}</span><span class="dove">${rfEsc(x.stanza)}</span></div>`).join('')}</div>` : ''}
    ${(o.proposte || []).length ? `<div class="rf-piano-prop" style="margin-top:12px"><div class="t">${ICONS.ai} Proposta da confermare</div><div class="c">${rfEsc(o.proposte[0].perche || '')}</div><div class="caption mt-8"><a href="#/sale">Aprila in Sale</a></div></div>` : ''}
    <div class="row mt-16" style="justify-content:space-between;align-items:center;gap:8px">
      <button class="btn sm ghost" data-go="#/sale">Vedi pianificazione completa ${ICONS.chevR}</button>
      ${o.versione != null ? `<span class="caption">piano v${o.versione} · ${rfEsc(o.motore || '')}</span>` : ''}</div>
  </div>`;
}

/* La pagina «Sale»: il calendario della giornata, una colonna per sala.
   Le ore scendono a sinistra come in un'agenda; ogni fascia è un blocco, la
   riga rossa è l'ora di riferimento. Un tocco su una colonna — testa o blocco
   — apre a destra la stessa timeline della Home. */
if (typeof NAV_META !== 'undefined') NAV_META.sale = ['Sale', 'door'];
PAGES.sale = () => {
  if (!RF.live) return rfPaginaPiattaforma('Sale', 'Di chi è quale stanza, oggi');
  const p = RF.data.pianoSale;
  const c = RF.data.capienzaSale;
  if (!p || !Array.isArray(p.righe) || !p.righe.length) {
    return `<div class="page-head"><div><h2 class="page-title">Sale e medici</h2><div class="page-sub">Il calendario delle sale di oggi</div></div>
        <div class="actions"><button class="btn ai"${RF.pianoLavoro && RF.pianoLavoro.attivo ? ' disabled' : ''} onclick="rfPianoGenera()">${ICONS.ai} Prepara con l'AI</button></div></div>
      ${rfPianoCarta()}
      <div class="card"><p class="meta" style="margin:0">Il piano di oggi non è ancora pronto. Lo prepara il giro dell'agenda, oppure lo si chiede adesso con il pulsante qui sopra. Le regole stanno nella pagina wiki <code>Medici/Sale</code>.</p></div>`;
  }
  const ora = rfOraRif();
  const inizio = rfMinuti(RF_APERTURA), fine = rfMinuti(RF_CHIUSURA);
  // Il calendario si prende lo spazio che c'è, ma senza esagerare: l'altezza
  // viene dalla finestra (meno intestazione e teste delle colonne) e non
  // scende sotto i 780 px — sotto, i riquadri da quindici minuti non si
  // leggono più.
  const alto = Math.max(780, (typeof window !== 'undefined' ? window.innerHeight : 1000) - 200);
  const M = alto / (fine - inizio);
  const su = (t) => (rfMinuti(t) - inizio) * M;
  const stati = p.righe.map(r => rfStatoStanza(r, ora));
  const inUso = stati.filter(x => x.inCorso && x.inCorso.length).length;
  const libere = stati.filter(x => x.vuotaOggi && !x.aperta).length;
  const cambi = rfCambiDelGiorno(p.righe, ora);
  const aMano = (p.modifiche || []).length;
  const bottone = (k, et) => `<button class="${RF.saleQuando === k ? 'on' : ''}" onclick="rfSaleQuando('${k}')">${et}</button>`;
  const dentro = rfMinuti(ora) >= inizio && rfMinuti(ora) <= fine;
  const ore = []; for (let h = 7; h <= 19; h++) ore.push(`${String(h).padStart(2, '0')}:00`);
  const aperta = p.righe.find(r => r.stanza === RF.salaAperta);

  const testa = (r, i) => {
    const st = stati[i];
    const n = rfVisiteSala(r.stanza).length;
    return `<button class="rf-cs-testa ${st.classe}${RF.salaAperta === r.stanza ? ' sel' : ''}" onclick="rfSalaApri('${rfEsc(r.stanza)}')" title="${rfEsc(r.stanza)} · ${rfEsc(st.testo)}${r.funzione ? ` · ${rfEsc(r.funzione)}` : ''}">
      <span class="sn"><i class="p"></i>${rfEsc(r.stanza)}</span>
      <span class="sf">${n ? `${n} ${n === 1 ? 'visita' : 'visite'}${(() => { const m = rfMediciSala(r.stanza); return m.length > 1 ? ` · ${m.map(x => rfEsc(rfNomeCorto(x))).join(', ')}` : ''; })()}` : `libera${st.seg && st.seg.chi ? ` · di ${rfEsc(rfNomeCorto(st.seg.chi))}` : ''}`}${r.funzione ? ` · ${rfEsc(r.funzione)}` : ''}</span></button>`;
  };
  const colonna = (r) => `<div class="rf-cs-col${RF.salaAperta === r.stanza ? ' sel' : ''}" style="--riga:${(60 * M).toFixed(2)}px">
    ${(r.segmenti || []).flatMap(s => {
      const dentro = rfVisiteFascia(r.stanza, s);
      const vuoto = rfTestoVuoto(s);
      if (!s.chi && vuoto !== 'da decidere') return [];
      // Di chi è la stanza resta disegnato per tutta la fascia, ma sbiadito:
      // è la regola. Quanto è PRESA davvero lo dicono le visite — se uno ha
      // visite solo al pomeriggio, il blocco pieno è solo il pomeriggio.
      const presa = rfPresaFascia(r.stanza, s);
      const blocco = (dalle, alle, cls, eti, quando) => {
        const h = (rfMinuti(alle) - rfMinuti(dalle)) * M - 3;
        return `<button class="rf-cs-b${cls}" style="top:${su(dalle).toFixed(1)}px;height:${Math.max(20, h).toFixed(1)}px;--h:${rfTinta(s.chi || 'x')}"
        onclick="rfSalaApri('${rfEsc(r.stanza)}')" data-sug="${rfEsc(`<div class="t">${rfEsc(r.stanza)}${r.funzione ? ` · ${rfEsc(r.funzione)}` : ''}</div><div class="r"><b>${rfEsc(dalle)}–${rfEsc(alle)}</b> · ${rfEsc(s.chi ? rfNomeNudo(s.chi) : 'nessuno')}</div><div class="r">${rfEsc(presa ? `stanza presa dalle ${presa.dalle} alle ${presa.alle}` : (s.perche || ''))}${dentro.length ? ` · ${dentro.length} ${dentro.length === 1 ? 'visita' : 'visite'}` : ''}</div>${presa ? `<div class="c">La fascia ${rfEsc(s.dalle)}–${rfEsc(s.alle)} è sua per regola; occupata solo per il tempo delle visite.</div>` : ''}${r.nota ? `<div class="c">${rfEsc(r.nota)}</div>` : ''}`)}">
        <span class="o">${rfEsc(dalle)}–${rfEsc(alle)}</span>
        <span class="n">${rfEsc(eti)}</span>
        ${quando ? `<span class="q">${rfEsc(quando)}</span>` : ''}
        ${s.manuale ? `<span class="am">${s.fonte === 'ai' ? 'dall’AI' : 'a mano'}</span>` : ''}</button>`;
      };
      if (!s.chi) return [blocco(s.dalle, s.alle, ' aperta', 'da decidere')];
      if (!presa) return [blocco(s.dalle, s.alle, ' vuota', rfNomeCorto(s.chi))];
      // Il nome e il colore stanno sulla fascia INTERA, in chiaro: lì non ci
      // passa sopra niente. Il blocco pieno segna quando la stanza è presa
      // davvero, e non ripete il nome — sotto le visite non si leggerebbe.
      return [
        blocco(s.dalle, s.alle, ' fuori', rfNomeCorto(s.chi), `presa ${presa.dalle}–${presa.alle}`),
        blocco(presa.dalle, presa.alle, '', ''),
      ];
    }).join('')}
    <div class="rf-cs-vv">${(() => {
      const medici = rfMediciSala(r.stanza);
      const divisa = medici.length > 1;
      return rfVisiteSala(r.stanza).map(v => {
      const h = (rfMinuti(v.fine) - rfMinuti(v.inizio)) * M - 1;
      const n = Math.max(1, v.corsie || 1), c = v.corsia || 0;
      return `<button class="rf-cs-v${v.sovra ? ' sovra' : ''}${divisa ? ' divisa' : ''}" style="top:${su(v.inizio).toFixed(1)}px;height:${Math.max(7, h).toFixed(1)}px;left:${(c / n * 100).toFixed(2)}%;width:calc(${(100 / n).toFixed(2)}% - 2px);--h:${rfTinta(v.medico || 'x')}"
        onclick="event.stopPropagation(); rfApptScheda('${rfEsc(v.id)}')" data-sug="${rfEsc(rfSugVisita(v, r.stanza))}"><span class="nm">${divisa && v.medico ? `<i class="md" title="${rfEsc(rfNomeNudo(v.medico))}">${rfEsc(rfIniziali(v.medico).toUpperCase())}</i>` : ''}${rfEsc(rfVisitaNome(v))}</span>${(v.motivo || v.etichetta) ? `<span class="pr">${rfEsc(v.motivo || v.etichetta)}</span>` : ''}</button>`;
      }).join('');
    })()}</div></div>`;

  return `<div class="page-head"><div><h2 class="page-title">Sale e medici</h2>
      <div class="page-sub">Il calendario delle sale di oggi · ${p.righe.length} stanze · ${inUso} in uso adesso${libere ? ` · ${libere} ${libere === 1 ? 'libera tutto il giorno' : 'libere tutto il giorno'}` : ''}${(p.da_decidere || []).length ? ` · ${p.da_decidere.length} da decidere` : ''}</div></div>
    <div class="actions"><div class="rf-seg">${bottone('ora', 'Ora')}${bottone('mattina', 'Mattina')}${bottone('pomeriggio', 'Pomeriggio')}</div>
      <button class="btn ai"${RF.pianoLavoro && RF.pianoLavoro.attivo ? ' disabled' : ''} onclick="rfPianoGenera()">${ICONS.ai} ${p.proposta ? 'Rifai la proposta' : 'Prepara con l\'AI'}</button></div></div>
  <div class="stack">
    ${rfPianoCarta()}
    ${p.proposta ? `<div class="card"><div class="card-head"><span class="rf-lavoro-t">${ICONS.ai} Proposta per oggi</span>${p.accettata_at ? '<span class="badge success">confermata</span>' : '<span class="badge warning">da confermare</span>'}</div>
      <p class="meta" style="margin:0;line-height:1.6">${rfEsc(p.proposta).replace(/\n/g, '<br>')}</p>
      <div class="caption mt-8">${rfEsc(p.proposta_da || '')} · la decisione resta di chi è in studio. <b>Confermando</b>, le assegnazioni entrano subito nel calendario qui sotto, per oggi; le regole restano nella pagina «Medici/Sale».</div>
      ${RF.saleEsito ? `<div class="caption mt-8">${RF.saleEsito.applicate.length ? `<b>Applicate:</b> ${RF.saleEsito.applicate.map(rfEsc).join(' · ')}.` : 'Nessuna riga applicabile.'}${RF.saleEsito.saltate.length ? `<br><b>Non applicate:</b> ${RF.saleEsito.saltate.map(x => `${rfEsc(x.riga.split(':')[0])} — ${rfEsc(x.perche)}`).join(' · ')}.` : ''}</div>` : ''}
      ${p.accettata_at ? '' : '<div class="row mt-16"><button class="btn primary" onclick="rfPianoAccetta()">Confermo e applico</button></div>'}</div>` : ''}
    ${aperta ? rfSalaPannello(aperta, ora) : ''}
      <div class="card">
        <div class="rf-cs-scorre">
          <div class="rf-cs-teste" style="min-width:${52 + p.righe.length * 104}px"><span class="rf-cs-vuoto"></span>${p.righe.map(testa).join('')}</div>
          <div class="rf-cs" style="height:${alto.toFixed(0)}px;min-width:${52 + p.righe.length * 104}px">
            <div class="rf-cs-ore">${ore.map(h => `<span style="top:${su(h).toFixed(1)}px">${h}</span>`).join('')}</div>
            ${p.righe.map(colonna).join('')}
            ${dentro ? `<i class="rf-cs-adesso" style="top:${su(ora).toFixed(1)}px"><b>${rfEsc(ora)}</b></i>` : ''}
          </div>
        </div>
        <div class="caption mt-8">Le visite sono quelle del medico che ha la sala in quella fascia: <b>MediOnline non scrive mai in che stanza</b> avviene una visita, scrive di chi è l'agenda. Chi ha più stanze le riempie nell'ordine in cui i pazienti cominciano. Quando in una sala ci sono <b>più pazienti nello stesso momento</b> la colonna si divide in corsie — e le visite che non hanno trovato una stanza libera sono segnate in rosso: è la capienza, non un errore di chi ha prenotato.</div>
        <div class="caption mt-8">Tocca una sala per la sua giornata. Le regole stanno nella pagina wiki <code>Medici/Sale</code> (SilverBullet sulla rete dello studio, porta 3400): si cambia la pagina, non il codice — la piattaforma la rilegge entro 5 minuti.</div></div>
    <div class="grid grid-3">
      ${(p.senzaSala || []).length ? `<div class="card" style="border-left:3px solid var(--warning)"><div class="card-head"><span class="section-title">Visite senza sala</span><span class="badge count">${p.senzaSala.reduce((t, x) => t + x.n, 0)}</span></div>
        <div class="list">${p.senzaSala.map(x => `<div class="list-item clickable" style="cursor:pointer;align-items:flex-start" onclick="rfSenzaSala('${rfEsc(x.chi)}')"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(x.chi)} <span class="caption">${RF.senzaSalaAperto === x.chi ? '▾' : '▸'}</span></div><div class="sub">${x.n} ${x.n === 1 ? 'visita' : 'visite'}</div>
          ${RF.senzaSalaAperto === x.chi ? `<div class="mt-8">${(x.visite || []).map(v => `<div class="rf-cambio" onclick="event.stopPropagation(); rfApptScheda('${rfEsc(v.id)}')" style="cursor:pointer"><span class="ora num">${rfEsc(v.inizio)}</span><span>${rfEsc(v.paziente || 'Paziente')}</span><span class="dove">${rfEsc(v.motivo || v.sala || '')}</span></div>`).join('') || '<div class="caption">Nessun dettaglio.</div>'}${x.n > (x.visite || []).length ? `<div class="caption mt-8">…e altre ${x.n - x.visite.length}.</div>` : ''}</div>` : ''}
        </div></div>`).join('')}</div>
        <div class="caption mt-8">Oggi lavorano ma nella pagina «Medici/Sale» non hanno una stanza — o ce l'hanno condivisa e non è ancora deciso di chi è. Tocca un nome per vedere quali visite sono; tocca una visita per aprirla. Si aggiusta assegnando la sala qui sopra, o scrivendo la regola nella pagina.${(p.fuoriPiano || []).length || (p.fuoriPrestazioni || []).length ? ` Fuori dal conto: ${[...(p.fuoriPiano || []), ...(p.fuoriPrestazioni || [])].map(rfEsc).join(', ')} — così dice la pagina.` : ''}</div></div>` : ''}
      <div class="card"><div class="card-head"><span class="section-title">Prossimi cambi</span><span class="badge count">${cambi.length}</span></div>
        ${cambi.length ? cambi.map(x => `<div class="rf-cambio"><span class="ora num">${rfEsc(x.ora)}</span>${x.chi ? `${rfAvatar(x.chi)}<span>${rfEsc(rfNomeNudo(x.chi))}</span>` : '<span style="color:var(--text-2);font-style:italic">si libera</span>'}<span class="dove">${rfEsc(x.stanza)}</span></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun cambio da qui a fine giornata.</div>'}</div>
      ${c && c.picco ? `<div class="card"><div class="card-head"><span class="section-title">Capienza</span></div>
        <p class="meta" style="margin:0;line-height:1.55">Al massimo oggi <b>${c.picco} appuntamenti insieme</b> su ${c.stanze} stanze.${c.oreOltre && c.oreOltre.length ? ` Non bastano dalle <b>${rfEsc(c.oreOltre[0])}</b>${c.oreOltre.length > 1 ? ` alle <b>${rfEsc(c.oreOltre[c.oreOltre.length - 1])}</b>` : ''}.` : ''}</p>
        <div class="caption mt-8">Una fetta in agenda vuol dire «pratica aperta», non «persona dentro una stanza»: è una capienza da guardare, non un errore.</div></div>` : ''}
      ${aMano ? `<div class="card"><div class="card-head"><span class="section-title">Corretto a mano oggi</span><span class="badge count">${aMano}</span></div>
        <div class="list">${(p.modifiche || []).map(m => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(m.stanza)} dalle ${rfEsc(m.dalle)}</div><div class="sub">${m.chi ? rfEsc(m.chi) : 'sala libera'}${m.da ? ` · ${rfEsc(m.da)}` : ''}</div></div></div>`).join('')}</div>
        <div class="caption mt-8">Valgono per oggi. Domani il piano riparte dalle regole della pagina.</div></div>` : ''}
    </div>
  </div>`;
};


/* =====================================================================
   Orchestrazione di sale, medici e pazienti (16.9.2026).
   Il gemello digitale dello studio dentro la pagina «Sale»: tre viste —
   Adesso (mappa, medici, avvisi), Giornata (la timeline del piano corrente
   con i fili dei medici) e Calendario (la vista di prima) — più due pagine
   operative: Accoglienza (il tablet) e Stanza (i pulsanti).
   Progetto: docs/wiki/Piattaforma/Orchestrazione sale.md §14.
   ===================================================================== */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-or-viste { display:flex; gap:4px; }
.rf-or-msg { margin:0 0 10px; padding:8px 12px; border-radius:8px; background:var(--warning-soft); color:var(--warning); font-size:12.5px; }
.rf-or-msg.ok { background:var(--success-soft, #e6f0ec); color:var(--success, #0d5c48); }
.rf-or-mappa { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; }
@media (max-width:1100px) { .rf-or-mappa { grid-template-columns:repeat(2, minmax(0,1fr)); } }
.rf-or-sala { border:1px solid var(--border); border-radius:var(--r-card,10px); background:var(--surface); padding:12px 14px; display:flex; flex-direction:column; gap:8px; min-height:150px; cursor:pointer; text-align:left; font:inherit; color:inherit; }
.rf-or-sala:hover { border-color:var(--accent); }
.rf-or-sala.sel { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); }
.rf-or-sala .t { display:flex; align-items:baseline; gap:8px; }
.rf-or-sala .t b { font-size:14px; }
.rf-or-sala .t .f { color:var(--text-3); font-size:11.5px; }
.rf-or-sala .t .pill { margin-left:auto; }
.rf-or-pill { font-size:10.5px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; padding:2px 7px; border-radius:999px; background:var(--surface-3); color:var(--text-3); white-space:nowrap; }
.rf-or-pill.libera { background:#e6f0ec; color:#0d5c48; }
.rf-or-pill.riservata { background:#fdf0e6; color:#8a4b12; }
.rf-or-pill.in_preparazione, .rf-or-pill.occupata_pronto { background:#fdf0e6; color:#8a4b12; }
.rf-or-pill.occupata_visita { background:var(--accent-soft); color:var(--accent); }
.rf-or-pill.bloccata, .rf-or-pill.fuori_servizio { background:#f8e3df; color:#a23b2a; }
/* Gli stati del paziente hanno gli stessi colori delle stanze: verde chi è
   qui e aspetta, ambra chi è in stanza e non ha ancora il medico, il verde
   dello studio mentre la visita è in corso, grigio prima e dopo. */
.rf-or-pill.arrivato, .rf-or-pill.in_attesa { background:#e6f0ec; color:#0d5c48; }
.rf-or-pill.chiamato, .rf-or-pill.pronto { background:#fdf0e6; color:#8a4b12; }
.rf-or-pill.in_visita { background:var(--accent-soft); color:var(--accent); }
.rf-or-pill.visita_finita { background:#eef3f7; color:#3a5a72; }
.rf-or-pill.assente, .rf-or-pill.annullato { background:#f8e3df; color:#a23b2a; }
.rf-or-pill.da_ripristinare { background:var(--surface-3); color:var(--text-2); }
.rf-or-rit { display:inline-block; margin-left:5px; padding:0 5px; border-radius:999px; font-size:10px; font-weight:700;
  font-variant-numeric:tabular-nums; background:#fdf0e6; color:#8a4b12; vertical-align:1px; white-space:nowrap; }
.rf-or-rit.male { background:#f8e3df; color:#a23b2a; }
:root[data-theme="dark"] .rf-or-rit { background:#3a2a18; color:#e0a870; }
:root[data-theme="dark"] .rf-or-rit.male { background:#3a1f1a; color:#e08a70; }
.rf-or-dentro { display:flex; align-items:center; gap:8px; font-size:13px; }
.rf-or-dentro .n { font-weight:600; }
.rf-or-dentro .s { color:var(--text-3); font-size:11.5px; }
.rf-or-pross { font-size:12px; color:var(--text-2); border-top:1px dashed var(--border); padding-top:6px; margin-top:auto; }
.rf-or-pross b { color:var(--text); font-weight:600; }
.rf-or-med2 { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:11px; align-items:center;
  padding:10px 10px 10px 8px; border-bottom:1px solid var(--border); }
.rf-or-med2:last-child { border-bottom:0; }
.rf-or-med2 .c { min-width:0; }
.rf-or-med2 .r1 { display:flex; align-items:baseline; gap:8px; }
.rf-or-med2 .nome { font-size:13px; font-weight:650; }
.rf-or-med2 .rit { font-size:10.5px; font-weight:600; padding:1px 6px; border-radius:999px; background:#fdf0e6; color:#8a4b12; white-space:nowrap; }
.rf-or-med2 .rit.male { background:#f8e3df; color:#a23b2a; }
.rf-or-med2 .r2 { font-size:13.5px; line-height:1.35; margin-top:1px; color:var(--text); }
.rf-or-med2 .r2 b { font-weight:650; }
.rf-or-med2 .r3 { font-size:11.5px; color:var(--text-3); line-height:1.35; margin-top:1px; overflow:hidden; text-overflow:ellipsis; }
.rf-or-med2 .dx { text-align:right; line-height:1.1; }
.rf-or-med2 .conta { font-size:15px; font-weight:650; font-variant-numeric:tabular-nums; }
.rf-or-med2 .conta i { font-style:normal; font-weight:500; color:var(--text-3); font-size:12px; }
.rf-or-med2 .et { display:block; font-size:10px; color:var(--text-3); letter-spacing:.03em; }
/* Il bordo sinistro dice lo stato senza bisogno di una legenda. */
.rf-or-med2.occupato { box-shadow:inset 3px 0 0 var(--accent); }
.rf-or-med2.libero { box-shadow:inset 3px 0 0 #0d5c48; }
.rf-or-med2.aspetta { box-shadow:inset 3px 0 0 #8a4b12; background:#fdf0e6; }
:root[data-theme="dark"] .rf-or-med2.aspetta { background:#3a2a18; }
.rf-or-med2.atteso { box-shadow:inset 3px 0 0 var(--border-2); }
.rf-or-med2.finito { box-shadow:inset 3px 0 0 var(--border-2); opacity:.7; }
.rf-or-med { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); font-size:13px; }
.rf-or-med:last-child { border-bottom:0; }
.rf-or-med .nome { min-width:150px; font-weight:600; }
.rf-or-med .rit { font-variant-numeric:tabular-nums; font-weight:600; min-width:64px; }
.rf-or-med .rit.male { color:#a23b2a; }
.rf-or-med .rit.poco { color:#8a4b12; }
.rf-or-med .catena { display:flex; flex-wrap:wrap; gap:4px; align-items:center; color:var(--text-2); }
.rf-or-med .catena i { font-style:normal; color:var(--text-3); }
.rf-or-med .catena .ora { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:6px; background:var(--accent-soft); color:var(--accent); font-weight:600; }
.rf-or-med .catena .poi { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:6px; background:var(--surface-2); }
.rf-or-avv { display:flex; flex-direction:column; gap:6px; }
.rf-or-avv .a { display:flex; gap:10px; align-items:baseline; font-size:12.5px; padding:6px 10px; border-radius:8px; background:var(--surface-2); }
.rf-or-avv .a time { color:var(--text-3); font-size:11px; font-variant-numeric:tabular-nums; min-width:38px; }
.rf-or-avv .a.accoglienza { background:#fdf0e6; }
.rf-or-ingr { display:flex; align-items:center; gap:10px; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px; }
.rf-or-ingr:last-child { border-bottom:0; }
.rf-or-ingr .q { color:var(--text-3); font-size:11.5px; }
.rf-or-ingr .btn { margin-left:auto; }
.rf-or-prop { border:1px solid var(--accent); border-radius:10px; padding:12px 14px; background:var(--surface); margin-bottom:10px; }
.rf-or-acc { display:flex; flex-direction:column; }
.rf-or-acc .r { display:grid; grid-template-columns:52px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.4fr) auto; gap:10px; align-items:center; padding:9px 0; border-bottom:1px solid var(--border); font-size:13.5px; }
.rf-or-acc .r:last-child { border-bottom:0; }
.rf-or-acc .r .h { font-variant-numeric:tabular-nums; font-weight:600; }
.rf-or-acc .r .n { font-weight:600; }
.rf-or-acc .r .m { color:var(--text-2); font-size:12.5px; }
.rf-or-acc .r .sis { color:var(--text-2); font-size:12.5px; }
.rf-or-acc .r .sis b { color:var(--text); }
.rf-or-acc .r .az { display:flex; gap:6px; }
.rf-or-acc .r.fatto { opacity:.55; }
.rf-or-acc.scorre { flex:1 1 0; min-height:180px; overflow-y:auto; overscroll-behavior:contain; padding-right:4px; }
/* L'accoglienza finisce dove finisce «Sale e medici», cioè in fondo alla
   colonna di sinistra. Non lo può fare il CSS da solo: in una griglia la riga
   è alta quanto l'elemento più alto, e qui il più alto sarebbe proprio
   l'accoglienza — si misurerebbe da sé. Quindi l'altezza la copia da sinistra
   (rfOrAltezzaAccoglienza), e la lista dentro si accorcia fino a 180px prima
   di far crescere la pagina. */
.rf-home-acc { display:flex; flex-direction:column; min-height:0; }
.rf-home-acc > .card { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
.rf-or-acc.scorre::-webkit-scrollbar { width:8px; }
.rf-or-acc.scorre::-webkit-scrollbar-thumb { background:var(--border-2); border-radius:4px; }
.rf-or-acc .r.compatta { grid-template-columns:46px minmax(0,1.3fr) minmax(0,1.2fr) auto; font-size:13px; padding:7px 0; }
.rf-or-acc .r.compatta .m { display:none; }
.rf-or-acc .r.compatta .az { flex-wrap:wrap; justify-content:flex-end; }
.rf-or-stanza { max-width:560px; margin:0 auto; text-align:center; }
.rf-or-stanza .chi { font-size:26px; font-weight:600; margin:10px 0 4px; }
.rf-or-stanza .cosa { color:var(--text-2); margin-bottom:18px; }
.rf-or-stanza .grandi { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.rf-or-stanza .grandi .btn { padding:22px 10px; font-size:17px; border-radius:14px; }
.rf-or-stanza .grandi .btn.tutta { grid-column:1 / -1; }
.rf-or-scelta { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.rf-or-fili { position:absolute; inset:0; pointer-events:none; overflow:visible; }
.rf-or-teorica { position:absolute; left:2px; right:2px; border-top:1px dashed #8a4b12; opacity:.7; pointer-events:none; z-index:3; }
.rf-or-fili polyline { fill:none; stroke-width:2px; stroke-linejoin:round; stroke-linecap:round; opacity:.7; vector-effect:non-scaling-stroke; }
.rf-or-legenda { display:flex; flex-wrap:wrap; gap:8px 14px; font-size:11.5px; color:var(--text-2); margin-top:8px; }
.rf-or-legenda i { display:inline-block; width:14px; height:3px; border-radius:2px; vertical-align:middle; margin-right:5px; }
`; document.head.appendChild(st); })();

if (typeof NAV_META !== 'undefined') { NAV_META.accoglienza = ['Accoglienza', 'door']; NAV_META.stanza = ['Stanza', 'door']; }
RF.orch = null; RF.orchPiano = null; RF.orchMsg = null; RF.saleVista = RF.saleVista || 'adesso'; RF.orchSala = ''; RF.orchTimer = null; RF.orchTesto = null;
try { RF.stanzaScelta = localStorage.getItem('rf-stanza') || ''; } catch { RF.stanzaScelta = ''; }

const RF_OR_PAGINE = new Set(['home', 'sale', 'accoglienza', 'stanza', 'visite']);
function rfOrchSincronizza() {
  const dentro = RF.live && RF_OR_PAGINE.has(state.route);
  if (dentro && !RF.orchTimer) { RF.orchTimer = setInterval(() => rfOrchCarica(), 20000); if (!RF.orch) rfOrchCarica(); }
  if (!dentro && RF.orchTimer) { clearInterval(RF.orchTimer); RF.orchTimer = null; }
}
async function rfOrchCarica(dopo) {
  try {
    const r = await fetch('/api/orchestrazione/stato', { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (r.ok && j) { RF.orch = j; if (state.route === 'sale' && RF.saleVista !== 'adesso') await rfOrchCaricaPiano(); }
  } catch { /* la prossima volta */ }
  if (typeof dopo === 'function') dopo();
  if (RF_OR_PAGINE.has(state.route)) render();
}
async function rfOrchCaricaPiano() {
  try { const r = await fetch('/api/orchestrazione/piano', { credentials: 'include', cache: 'no-store' }); const j = await r.json().catch(() => null); if (r.ok && j) RF.orchPiano = j; } catch { /* idem */ }
}
async function rfOrchEvento(tipo, extra, fonte) {
  RF.orchMsg = null;
  try {
    const r = await fetch('/api/orchestrazione/eventi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, fonte: fonte || 'ui', ...(extra || {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) RF.orchMsg = { tipo: 'male', testo: j.errore || 'Non registrato.' };
    else if (j.avvisi && j.avvisi.length) RF.orchMsg = { tipo: 'ok', testo: j.avvisi.slice(0, 3).join(' · ') };
  } catch { RF.orchMsg = { tipo: 'male', testo: 'La piattaforma non risponde.' }; }
  await rfOrchCarica();
}
async function rfOrchComando(comando, parametri) {
  RF.orchMsg = null;
  try {
    const r = await fetch('/api/orchestrazione/comandi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comando, parametri: parametri || {} }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) RF.orchMsg = { tipo: 'male', testo: j.errore || 'Comando non applicato.' };
    else RF.orchMsg = { tipo: 'ok', testo: `Fatto.${(j.conflitti || []).length ? ' Attenzione: ' + j.conflitti.join(' · ') : ''}${(j.avvisi || []).length ? ' ' + j.avvisi.slice(0, 3).join(' · ') : ''}` };
  } catch { RF.orchMsg = { tipo: 'male', testo: 'La piattaforma non risponde.' }; }
  RF.orchSala = '';
  await rfOrchCarica();
}
async function rfOrchProposta(id, azione) {
  try { await fetch('/api/orchestrazione/proposte', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, azione }) }); } catch {}
  await rfOrchCarica();
}
async function rfOrchMattino() {
  if (RF.orchLavora) return;
  RF.orchLavora = true;
  RF.orchMsg = { tipo: 'ok', testo: 'Ridistribuisco le stanze con le regole di adesso: chi è già dentro una stanza non si muove. Con le regole strette il solver può metterci fino a un minuto.' }; render();
  try { const r = await fetch('/api/orchestrazione/mattino', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forza: true }) }); const j = await r.json().catch(() => ({})); RF.orchMsg = { tipo: j.ok ? 'ok' : 'male', testo: j.ok ? `Piano v${j.versione} (${j.motore}, ${((j.ms || 0) / 1000).toFixed(1)} s): ${j.visite} visite, ${j.senzaSala} senza sala.` : (j.errore || 'Non riuscito.') }; } catch { RF.orchMsg = { tipo: 'male', testo: 'La piattaforma non risponde.' }; }
  RF.orchLavora = false;
  await rfOrchCarica(); await rfOrchCaricaPiano(); render();
}
function rfOrchVista(v) { RF.saleVista = v; if ((v === 'calendario' || v === 'agenda') && !RF.orchPiano) rfOrchCaricaPiano().then(() => render()); render(); }
function rfOrchApriSala(nome) { RF.orchSala = RF.orchSala === nome ? '' : nome; render(); }
// Il ritardo di un medico, accanto al suo nome, ovunque compaia (16.9.2026
// sera). Una pastiglia sola per tutta l'interfaccia, così il numero è sempre
// lo stesso e si riconosce a colpo d'occhio. Sotto la soglia di
// comunicazione (5 minuti) non si mostra: sarebbe rumore.
function rfOrRitardo(nome, grande) {
  const o = RF.orch; if (!o || !nome) return '';
  const m = (o.medici || []).find(x => x.nome === nome) || (o.medici || []).find(x => rfNomeNudo(x.nome).toLowerCase() === rfNomeNudo(nome).toLowerCase());
  const r = m && m.ritardo || 0;
  const soglia = (o.parametri && o.parametri.soglia_comunicazione_min) || 5;
  if (r < soglia) return '';
  return `<span class="rf-or-rit${r >= 20 ? ' male' : ''}" title="${rfEsc(rfNomeNudo(nome))} è indietro di ${r} minuti sul previsto">+${r}${grande ? ' min' : ''}</span>`;
}
const rfOrHm = (m) => m == null ? '—' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
const RF_OR_STATO = { atteso: 'atteso', arrivato: 'arrivato', in_attesa: 'in sala d\'attesa', chiamato: 'chiamato', in_preparazione: 'in preparazione', pronto: 'pronto', in_visita: 'in visita', visita_finita: 'visita finita', dimesso: 'uscito', assente: 'assente', annullato: 'annullato',
  libera: 'libera', riservata: 'riservata', occupata_pronto: 'pronto per il medico', occupata_visita: 'in visita', da_ripristinare: 'da ripristinare', bloccata: 'bloccata', fuori_servizio: 'fuori servizio', disponibile: 'disponibile' };
const rfOrStato = (s) => RF_OR_STATO[s] || s;
function rfOrMsg() { const m = RF.orchMsg; return m ? `<div class="rf-or-msg ${m.tipo === 'ok' ? 'ok' : ''}">${rfEsc(m.testo)}</div>` : ''; }

/* ---------- la vista «Adesso»: mappa, medici, avvisi ---------- */
function rfOrMappa(o) {
  const sel = RF.orchSala;
  return `<div class="rf-or-mappa">${o.sale.map(s => {
    const d = s.dentro[0];
    return `<button type="button" class="rf-or-sala${sel === s.nome ? ' sel' : ''}" onclick="rfOrchApriSala('${rfEsc(s.nome)}')">
      <div class="t"><b>${rfEsc(s.nome)}</b>${s.funzione ? `<span class="f">${rfEsc(s.funzione)}</span>` : ''}<span class="rf-or-pill pill ${rfEsc(s.stato)}">${rfEsc(rfOrStato(s.stato))}</span></div>
      ${d ? `<div class="rf-or-dentro">${rfAvatar(d.medico || '?')}<div><div class="n">${rfEsc(d.etichetta)}</div><div class="s">${rfEsc(rfNomeCorto(d.medico || 'senza medico'))}${rfOrRitardo(d.medico)} · ${rfEsc(rfOrStato(d.stato))}${d.inizio != null ? ` dalle ${rfOrHm(d.inizio)}` : ''}</div></div></div>${s.dentro.length > 1 ? `<div class="caption">+${s.dentro.length - 1} in parallelo</div>` : ''}`
        : `<div class="caption">${s.liberaFinoA != null ? `Libera fino alle ${rfOrHm(s.liberaFinoA)}` : 'Nessuno dentro'}</div>`}
      ${s.prossimo ? `<div class="rf-or-pross">Prossimo: <b>${rfEsc(s.prossimo.etichetta)}</b> · ${rfEsc(rfNomeCorto(s.prossimo.medico || ''))}${rfOrRitardo(s.prossimo.medico)} · entra alle ${rfOrHm(s.prossimo.ingresso)}${s.prossimo.inizio != null && s.prossimo.inizio - o.adesso <= 60 ? `, medico fra ${Math.max(0, s.prossimo.inizio - o.adesso)} min` : ''}</div>` : `<div class="rf-or-pross">Nessun altro ingresso previsto</div>`}
    </button>`; }).join('')}</div>
    ${sel ? rfOrPannelloSala(o, sel) : ''}`;
}
function rfOrPannelloSala(o, nome) {
  const s = o.sale.find(x => x.nome === nome); if (!s) return '';
  const coda = o.pazienti.filter(p => p.sala === nome && !['dimesso', 'assente', 'annullato'].includes(p.stato)).sort((a, b) => (a.ingresso ?? a.teorica) - (b.ingresso ?? b.teorica));
  const bloccata = s.stato === 'bloccata' || s.stato === 'fuori_servizio';
  const cmd = (o.comandi || []).find(c => ['blocca_sala', 'sala_fuori_servizio'].includes(c.comando) && (c.parametri || {}).sala === nome);
  return `<div class="card" style="margin-top:10px"><div class="card-head"><span class="section-title">${rfEsc(nome)} · oggi</span>
      <div class="row" style="gap:6px">
        ${cmd ? `<button class="btn sm" onclick="rfOrchRitira('${rfEsc(cmd.id)}')">Riapri la stanza</button>` : `<button class="btn sm ghost" onclick="rfOrchComando('blocca_sala',{sala:'${rfEsc(nome)}'})">Blocca per oggi</button><button class="btn sm ghost" onclick="rfOrchComando('sala_fuori_servizio',{sala:'${rfEsc(nome)}'})">Fuori servizio</button>`}
        <button class="btn sm ghost" onclick="rfOrchApriSala('')">Chiudi</button></div></div>
    ${bloccata ? `<div class="caption" style="margin-bottom:8px">La stanza è ${rfOrStato(s.stato)}: nessun nuovo ingresso finché non viene riaperta.</div>` : ''}
    ${coda.length ? coda.map(p => `<div class="rf-or-ingr">${rfAvatar(p.medico || '?')}<div><b>${rfEsc(p.etichetta)}</b> <span class="q">${rfEsc(p.prestazione || '')} · ${rfEsc(rfNomeCorto(p.medico || 'senza medico'))}${rfOrRitardo(p.medico)} · teorica ${rfOrHm(p.teorica)}</span><div class="q">${rfEsc(rfOrStato(p.stato))}${p.ingresso != null ? ` · ingresso previsto ${rfOrHm(p.ingresso)}, medico alle ${rfOrHm(p.inizio)}` : ''}${p.rigidita >= 2 ? ' · <b>fermo</b>' : ''}</div></div>
        <div class="az" style="margin-left:auto;display:flex;gap:6px">${p.rigidita < 2 && ['atteso', 'arrivato', 'in_attesa'].includes(p.stato) ? `<button class="btn sm ghost" onclick="rfOrchComando('non_spostare',{appointment_id:'${rfEsc(p.id)}'})" title="La stanza resta questa">Non spostare</button>` : ''}</div></div>`).join('')
      : '<div class="caption">Nessun paziente previsto qui oggi.</div>'}</div>`;
}
// La disponibilità dei medici: la domanda vera è «chi è libero, e quando»
// (16.9.2026 sera). Prima era una catena di frecce con dentro orari, nomi e
// stanze tutti allo stesso peso, e per capirla bisognava leggerla. Adesso
// ogni riga dice una cosa sola in grande — dov'è e fino a quando — e sotto,
// più piccolo, dove va dopo e quanto è indietro. In cima chi si libera prima.
// La disponibilità dei medici: la domanda vera è «chi è libero, e quando»
// (16.9.2026 sera). Prima era una catena di frecce con dentro orari, nomi e
// stanze tutti allo stesso peso, e per capirla bisognava leggerla. Adesso
// ogni riga dice una cosa sola in grande — dov'è e fino a quando — e sotto,
// più piccolo, dove va dopo e quanto è indietro.
//
// L'ordine non è alfabetico: in cima chi ha un paziente che lo aspetta già
// preparato in una stanza (è la cosa da fare adesso), poi chi è libero, poi
// chi è dentro in ordine di quando esce, e in fondo chi deve ancora arrivare
// e chi ha finito.
function rfOrMedici(o) {
  const medici = (o.medici || []).filter(m => m.stato !== 'assente');
  if (!medici.length) return '<div class="caption">Nessun medico con appuntamenti oggi.</div>';
  const fra = (min) => min <= 0 ? 'adesso' : min === 1 ? 'fra un minuto' : min < 60 ? `fra ${min} minuti` : `alle ${rfOrHm(o.adesso + min)}`;
  const calcola = (m) => {
    const sue = o.pazienti.filter(p => p.medico === m.nome && !['assente', 'annullato'].includes(p.stato));
    const fatte = sue.filter(p => ['visita_finita', 'dimesso'].includes(p.stato)).length;
    const attende = sue.find(p => p.stato === 'pronto') || sue.find(p => ['chiamato', 'in_preparazione'].includes(p.stato));
    const manca = Math.max(0, (m.liberoDa ?? o.adesso) - o.adesso);
    const prima = sue.filter(p => p.inizio != null && p.inizio > o.adesso).sort((x, y) => x.inizio - y.inizio)[0];
    if (m.adesso) return { rango: 2, ordine: m.liberoDa ?? 0, cls: 'occupato', sue, fatte,
      titolo: `In <b>${rfEsc(m.adesso.sala)}</b> con ${rfEsc(rfNomeCortoPaz(m.adesso.etichetta))}`,
      sotto: `si libera ${fra(manca)}${manca > 0 ? ` (~${rfOrHm(m.liberoDa)})` : ''}${attende ? ` · un paziente lo aspetta in ${rfEsc(attende.sala)}` : ''}` };
    if (attende) return { rango: 0, ordine: attende.inizio ?? 0, cls: 'aspetta', sue, fatte,
      titolo: `Lo aspettano in <b>${rfEsc(attende.sala)}</b>`,
      sotto: `${rfEsc(rfNomeCortoPaz(attende.etichetta))} è ${rfOrStato(attende.stato)}` };
    if (!fatte && prima) return { rango: 3, ordine: prima.inizio, cls: 'atteso', sue, fatte, detta: prima.id,
      titolo: `Comincia alle <b>${rfOrHm(prima.inizio)}</b>`, sotto: `in ${rfEsc(prima.sala || 'una stanza da decidere')}` };
    if (prima) return { rango: 1, ordine: prima.inizio, cls: 'libero', sue, fatte, detta: prima.id,
      titolo: `<b>Libero</b>${m.inSala ? `, è uscito da ${rfEsc(m.inSala)}` : ''}`,
      sotto: `il prossimo alle ${rfOrHm(prima.inizio)} in ${rfEsc(prima.sala || 'una stanza da decidere')}` };
    return { rango: 4, ordine: 0, cls: 'finito', sue, fatte,
      titolo: `<b>Ha finito</b> per oggi`, sotto: fatte ? `${fatte} ${fatte === 1 ? 'visita fatta' : 'visite fatte'}` : 'nessun\'altra visita in agenda' };
  };
  return medici.map(m => ({ m, x: calcola(m) }))
    .sort((a, b) => (a.x.rango - b.x.rango) || (a.x.ordine - b.x.ordine) || rfNomeCorto(a.m.nome).localeCompare(rfNomeCorto(b.m.nome)))
    .map(({ m, x }) => {
      const rit = m.ritardo || 0;
      // «poi» non ripete la visita già nominata nella riga sopra.
      const poi = m.prossime.filter(p => p.id !== x.detta && p.inizio > (m.liberoDa ?? o.adesso) - 1).slice(0, 2);
      return `<div class="rf-or-med2 ${x.cls}">
      <div class="av">${rfAvatar(m.nome)}</div>
      <div class="c">
        <div class="r1"><span class="nome">${rfEsc(rfNomeCorto(m.nome))}</span>${rit > 0 ? `<span class="rit ${rit >= 20 ? 'male' : 'poco'}" title="La visita sta andando più lunga del previsto">${rit} min di ritardo</span>` : ''}</div>
        <div class="r2">${x.titolo}</div>
        <div class="r3">${x.sotto}${poi.length ? ` · poi ${poi.map(p => `${rfEsc(p.sala || '—')} alle ${rfOrHm(p.inizio)}`).join(', ')}` : ''}</div>
      </div>
      <div class="dx"><span class="conta">${x.fatte}<i>/${x.sue.length}</i></span><span class="et">visite</span></div>
    </div>`;
    }).join('');
}
function rfNomeCortoPaz(n) { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || ''); }
function rfOrAvvisi(o) {
  const av = o.avvisi || [];
  const prop = o.proposte || [];
  const an = o.anomalie || [];
  return `${prop.map(p => `<div class="rf-or-prop"><div class="rf-lavoro-t">${ICONS.ai} Proposta del modello grande</div><p class="meta" style="margin:6px 0 8px">${rfEsc(p.perche || '')}</p>
      <div class="row" style="gap:6px"><button class="btn primary sm" onclick="rfOrchProposta('${rfEsc(p.id)}','accetta')">Accetto</button><button class="btn sm" onclick="rfOrchProposta('${rfEsc(p.id)}','ignora')">Ignora</button><span class="caption">${rfEsc(p.modello || '')} · la conferma è tua: senza, non cambia niente.</span></div></div>`).join('')}
    ${an.length ? `<div class="rf-or-avv" style="margin-bottom:8px">${an.map(a => `<div class="a accoglienza"><time>${rfEsc(String(a.at).slice(11, 16))}</time><span>${ICONS.alert} Anomalia: ${rfEsc(a.testo || '')}</span></div>`).join('')}</div>` : ''}
    ${av.length ? `<div class="rf-or-avv">${av.map(a => `<div class="a ${rfEsc(a.livello)}"><time>${rfEsc(String(a.at).slice(11, 16))}</time><span>${rfEsc(a.testo)}</span></div>`).join('')}</div>` : '<div class="caption">Nessun avviso: la giornata va come previsto.</div>'}`;
}
function rfOrIngressi(o) {
  const ing = (o.ingressi || []);
  const chiama = ing.filter(i => i.azione === 'chiama');
  const resto = ing.filter(i => i.azione !== 'chiama');
  if (!ing.length) return '<div class="caption">Nessuno in sala d\'attesa.</div>';
  return `${chiama.map(i => `<div class="rf-or-ingr"><b>${rfEsc(i.etichetta)}</b><span class="q">→ ${rfEsc(i.sala)} con ${rfEsc(rfNomeCorto(i.medico || ''))}${rfOrRitardo(i.medico)} · ${rfEsc(i.perche)}</span><button class="btn primary sm" onclick="rfOrchEvento('paziente_chiamato',{appointment_id:'${rfEsc(i.id)}',sala:'${rfEsc(i.sala)}'})">Chiama in ${rfEsc(i.sala)}</button></div>`).join('')}
    ${resto.map(i => `<div class="rf-or-ingr"><span>${rfEsc(i.etichetta)}</span><span class="q">${rfEsc(i.sala)} · ${rfEsc(i.perche)}${i.azione === 'attendi' ? ' — resta in sala d\'attesa' : ''}</span></div>`).join('')}`;
}
function rfOrAdesso(o) {
  const inUso = o.sale.filter(s => ['occupata_visita', 'occupata_pronto', 'in_preparazione'].includes(s.stato)).length;
  const presenti = (o.medici || []).filter(m => m.stato !== 'assente').length;
  return `<div class="caption" style="margin:-4px 0 10px">${presenti} medici presenti · ${inUso}/${o.sale.length} sale occupate · piano ${o.versione != null ? `v${o.versione} (${rfEsc(o.motore || '')})` : 'non ancora fatto'} · ${o.adessoHm}${o.senzaPrestazione ? ` · <span title="Colore dell'agenda senza prestazione: durata dal catalogo di base">${o.senzaPrestazione} senza prestazione riconosciuta</span>` : ''} · <a href="#/stanza" title="Da aprire sullo schermo o sul telefono in una stanza: i tre tasti">schermo di stanza</a> · <a href="#/accoglienza" title="Da aprire su un tablet all'accoglienza">tablet accoglienza</a></div>
    ${rfOrMappa(o)}
    <div class="grid grid-2" style="margin-top:10px;align-items:start">
      <div class="stack">
        <div class="card"><div class="card-head"><span class="section-title">Disponibilità dei medici</span><span class="caption">chi si libera prima, in cima</span></div>${rfOrMedici(o)}</div>
        <div class="card"><div class="card-head"><span class="section-title">Da chiamare</span></div>${rfOrIngressi(o)}</div>
        ${(o.senzaSala || []).length ? `<div class="card"><div class="card-head"><span class="section-title">Senza sala</span></div>${o.senzaSala.map(s => `<div class="rf-or-ingr"><b>${rfEsc(s.etichetta)}</b><span class="q">${rfEsc(rfNomeCorto(s.medico || 'senza medico'))} · nessuna stanza libera in tempo utile: da sistemare</span></div>`).join('')}</div>` : ''}
      </div>
      <div class="card"><div class="card-head"><span class="section-title">Avvisi</span><span class="caption">solo quel che supera la soglia</span></div>${rfOrAvvisi(o)}</div>
    </div>`;
}

/* ---------- la vista «Giornata»: la timeline del piano con i fili dei medici ---------- */
function rfOrGiornata(o) {
  const pj = RF.orchPiano;
  if (!pj || !pj.piano) return `<div class="card"><p class="meta" style="margin:0">Il piano di oggi non c'è ancora. <button class="btn sm" onclick="rfOrchMattino()">Preparalo adesso</button></p></div>`;
  const M = 0.95, inizio = 7 * 60, fine = 19 * 60 + 30;
  const su = (m) => (m - inizio) * M;
  const alto = (fine - inizio) * M + 20;
  const stanze = o.sale.map(s => s.nome);
  const perSala = {}; for (const s of stanze) perSala[s] = [];
  const visite = pj.piano.visite.filter(v => v.sala && v.ingresso_previsto != null);
  for (const v of visite) (perSala[v.sala] ??= []).push(v);
  const etichettaDi = (id) => (o.pazienti.find(p => p.id === id) || {}).etichetta || '';
  const statoDi = (id) => (o.pazienti.find(p => p.id === id) || {}).stato || 'atteso';
  const ore = []; for (let h = 7; h <= 19; h++) ore.push(`${String(h).padStart(2, '0')}:00`);
  // corsie dentro la stessa stanza: chi si sovrappone va affiancato
  const conCorsie = (lista) => {
    const l = [...lista].sort((a, b) => a.ingresso_previsto - b.ingresso_previsto); const fini = [];
    for (const v of l) { let i = 0; while (fini[i] !== undefined && fini[i] > v.ingresso_previsto) i++; fini[i] = v.fine_stimata; v._c = i; }
    const n = Math.max(1, fini.length); for (const v of l) v._n = n; return l;
  };
  const colonna = (nome) => `<div class="rf-cs-col" style="--riga:${(60 * M).toFixed(2)}px"><div class="rf-cs-vv">${conCorsie(perSala[nome] || []).map(v => {
    const h = (v.fine_stimata - v.ingresso_previsto) * M - 1; const stato = statoDi(v.appointment_id);
    return `<button class="rf-cs-v divisa${['in_visita', 'pronto', 'in_preparazione'].includes(stato) ? ' sovra' : ''}" style="top:${su(v.ingresso_previsto).toFixed(1)}px;height:${Math.max(7, h).toFixed(1)}px;left:${(v._c / v._n * 100).toFixed(2)}%;width:calc(${(100 / v._n).toFixed(2)}% - 2px);--h:${rfTinta(v.medico || 'x')}" title="${rfEsc(etichettaDi(v.appointment_id))} · ${rfEsc(v.prestazione)} · entra ${rfOrHm(v.ingresso_previsto)}, medico ${rfOrHm(v.inizio_stimato)}–${rfOrHm(v.fine_stimata)} · ${rfEsc(rfOrStato(stato))}${v.rigidita >= 2 ? ' · fermo' : ''}">
      <span class="nm"><i class="md">${rfEsc(rfIniziali(v.medico || '?').toUpperCase())}</i>${rfEsc(etichettaDi(v.appointment_id))}${rfOrRitardo(v.medico)}</span><span class="pr">${rfOrHm(v.inizio_stimato)} · ${rfEsc(v.prestazione)}</span></button>`; }).join('')}</div></div>`;
  // i fili: per medico, una spezzata che unisce le sue visite in ordine
  const perMedico = {};
  for (const v of visite) { if (!v.medico) continue; (perMedico[v.medico] ??= []).push(v); }
  const n = stanze.length || 1;
  const fili = Object.entries(perMedico).map(([m, l]) => {
    const pts = l.sort((a, b) => a.inizio_stimato - b.inizio_stimato).map(v => `${((stanze.indexOf(v.sala) + 0.5) / n * 100).toFixed(2)},${su(v.inizio_stimato + 2).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" style="stroke:hsl(${rfTinta(m)} 55% 45%)"><title>${rfEsc(rfNomeNudo(m))}</title></polyline>`;
  }).join('');
  const legenda = Object.keys(perMedico).map(m => `<span><i style="background:hsl(${rfTinta(m)} 55% 45%)"></i>${rfEsc(rfNomeCorto(m))}</span>`).join('');
  const vers = (pj.versioni || []);
  return `<div class="caption" style="margin:-4px 0 8px">Piano v${pj.piano.versione} · ${rfEsc(pj.piano.motore)} in ${((pj.piano.ms || 0) / 1000).toFixed(1)} s · ${vers.length} versioni oggi${pj.piano.comunicata_at ? ' · comunicato' : ''} · ogni blocco è un paziente, i fili sono i medici che si spostano
      </div>
    <div class="card"><div class="rf-cs-scorre">
      <div class="rf-cs-teste" style="min-width:${52 + n * 104}px"><span class="rf-cs-vuoto"></span>${o.sale.map(s => `<button class="rf-cs-testa st-${['occupata_visita', 'occupata_pronto', 'in_preparazione'].includes(s.stato) ? 'occupata' : 'libera'}"><span class="sn"><i class="p"></i>${rfEsc(s.nome)}</span><span class="sf">${(perSala[s.nome] || []).length} ${(perSala[s.nome] || []).length === 1 ? 'paziente' : 'pazienti'}${s.funzione ? ` · ${rfEsc(s.funzione)}` : ''}</span></button>`).join('')}</div>
      <div class="rf-cs" style="height:${alto.toFixed(0)}px;min-width:${52 + n * 104}px;position:relative">
        <div class="rf-cs-ore">${ore.map(h => `<span style="top:${su(rfMinuti(h)).toFixed(1)}px">${h}</span>`).join('')}</div>
        ${stanze.map(colonna).join('')}
        <svg class="rf-or-fili" viewBox="0 0 100 ${alto.toFixed(0)}" preserveAspectRatio="none" style="left:52px;width:calc(100% - 52px)">${fili}</svg>
        ${o.adesso >= inizio && o.adesso <= fine ? `<i class="rf-cs-adesso" style="top:${su(o.adesso).toFixed(1)}px"><b>${o.adessoHm}</b></i>` : ''}
      </div></div>
      <div class="rf-or-legenda">${legenda}</div></div>`;
}

/* ---------- la vista «Agenda»: una colonna per medico, dal piano ---------- */
// La stessa pianificazione della «Giornata», guardata dal lato del medico:
// per ognuno la sua giornata in colonna, ogni blocco con la stanza dov'è
// previsto e l'ora in cui il medico ci arriva. Se l'ora pianificata è dopo
// quella dell'agenda, il blocco lo dice. Qui ci sono solo le visite in
// studio: le telefonate e le prestazioni fuori sede stanno nell'Agenda.
function rfOrAgenda(o) {
  const pj = RF.orchPiano;
  if (!pj || !pj.piano) return `<div class="card"><p class="meta" style="margin:0">Il piano di oggi non c'è ancora. <button class="btn sm" onclick="rfOrchMattino()">Preparalo adesso</button></p></div>`;
  const M = 0.95, inizio = 7 * 60, fine = 19 * 60 + 30;
  const su = (m) => (m - inizio) * M;
  const alto = (fine - inizio) * M + 20;
  const visite = pj.piano.visite.filter(v => v.medico && v.inizio_stimato != null);
  const medici = [...new Set(visite.map(v => v.medico))].sort((a, b) => rfNomeCorto(a).localeCompare(rfNomeCorto(b)));
  const pazDi = (id) => o.pazienti.find(p => p.id === id) || {};
  const ore = []; for (let h = 7; h <= 19; h++) ore.push(`${String(h).padStart(2, '0')}:00`);
  const n = medici.length || 1;
  const conCorsie = (lista) => {
    const l = [...lista].sort((a, b) => a.inizio_stimato - b.inizio_stimato); const fini = [];
    for (const v of l) { let i = 0; while (fini[i] !== undefined && fini[i] > v.inizio_stimato) i++; fini[i] = v.fine_stimata; v._c = i; }
    const k = Math.max(1, fini.length); for (const v of l) v._n = k; return l;
  };
  const colonna = (m) => {
    const mie = conCorsie(visite.filter(v => v.medico === m));
    return `<div class="rf-cs-col" style="--riga:${(60 * M).toFixed(2)}px"><div class="rf-cs-vv">${mie.map(v => {
      const p = pazDi(v.appointment_id); const h = (v.fine_stimata - v.inizio_stimato) * M - 1;
      const tardi = v.inizio_stimato - v.ora_teorica;
      const stato = p.stato || 'atteso';
      return `<button class="rf-cs-v${['in_visita', 'pronto', 'in_preparazione'].includes(stato) ? ' sovra' : ''}" style="top:${su(v.inizio_stimato).toFixed(1)}px;height:${Math.max(7, h).toFixed(1)}px;left:${(v._c / v._n * 100).toFixed(2)}%;width:calc(${(100 / v._n).toFixed(2)}% - 2px)"
        onclick="event.stopPropagation(); rfApptScheda('${rfEsc(v.appointment_id)}')" title="${rfEsc(p.etichetta || '')} · ${rfEsc(v.prestazione)} · agenda ${rfOrHm(v.ora_teorica)}, medico in ${rfEsc(v.sala || '—')} alle ${rfOrHm(v.inizio_stimato)} · ${rfEsc(rfOrStato(stato))}${v.rigidita >= 2 ? ' · fermo' : ''}">
        <span class="nm">${rfEsc(p.etichetta || '')}</span><span class="pr">${rfEsc(v.sala || 'senza sala')}${tardi > 4 ? ` · <span style="color:#8a4b12">+${tardi} min</span>` : ''}</span></button>`;
    }).join('')}${mie.filter(v => v.inizio_stimato - v.ora_teorica > 4).map(v => `<i class="rf-or-teorica" style="top:${su(v.ora_teorica).toFixed(1)}px" title="ora dell'agenda: ${rfOrHm(v.ora_teorica)}"></i>`).join('')}</div></div>`;
  };
  const testa = (m) => {
    const mie = visite.filter(v => v.medico === m);
    const md = (o.medici || []).find(x => x.nome === m) || {};
    const rit = md.ritardo || 0;
    return `<button class="rf-cs-testa st-${md.stato === 'in_visita' ? 'occupata' : 'libera'}" style="--h:${rfTinta(m)}"><span class="sn">${rfAvatar(m)}${rfEsc(rfNomeCorto(m))}</span><span class="sf">${mie.length} ${mie.length === 1 ? 'visita' : 'visite'}${rit > 0 ? ` · <b style="color:#8a4b12">+${rit} min</b>` : ''}${md.inSala ? ` · in ${rfEsc(md.inSala)}` : ''}</span></button>`;
  };
  return `<div class="caption" style="margin:-4px 0 8px">Piano v${pj.piano.versione} · una colonna per medico · su ogni visita la stanza prevista; la tacca tratteggiata è l'ora dell'agenda quando il piano la sposta. Le telefonate e le prestazioni fuori sede sono nell'Agenda, non qui.</div>
    <div class="card"><div class="rf-cs-scorre">
      <div class="rf-cs-teste" style="min-width:${52 + n * 124}px"><span class="rf-cs-vuoto"></span>${medici.map(testa).join('')}</div>
      <div class="rf-cs" style="height:${alto.toFixed(0)}px;min-width:${52 + n * 124}px;position:relative">
        <div class="rf-cs-ore">${ore.map(h => `<span style="top:${su(rfMinuti(h)).toFixed(1)}px">${h}</span>`).join('')}</div>
        ${medici.map(colonna).join('')}
        ${o.adesso >= inizio && o.adesso <= fine ? `<i class="rf-cs-adesso" style="top:${su(o.adesso).toFixed(1)}px"><b>${o.adessoHm}</b></i>` : ''}
      </div></div></div>`;
}

/* ---------- la pagina «Sale» con le quattro viste ---------- */
const rfSaleCalendarioOrig = PAGES.sale;
PAGES.sale = () => {
  if (!RF.live) return rfSaleCalendarioOrig();
  // Il calendario «sale a medico» di prima non c'è più (16.9.2026): con la
  // stanza assegnata al paziente avrebbe raccontato un altro modello. Il
  // calendario è quello del piano, una colonna per stanza.
  const vista = (RF.saleVista === 'giornata' || RF.saleVista === 'calendario') ? 'calendario' : (RF.saleVista || 'adesso');
  const o = RF.orch;
  const testa = `<div class="page-head"><div><h2 class="page-title">Sale e medici</h2><div class="page-sub">${vista === 'adesso' ? 'Chi è dove adesso, e chi entra dopo' : vista === 'agenda' ? 'La giornata di ogni medico, stanza per stanza' : 'Una colonna per stanza: i pazienti, e i medici che si spostano'}</div></div>
    <div class="actions"><div class="rf-seg rf-or-viste">${rfOrBottoniVista(vista)}</div>
      <button class="btn primary"${RF.orchLavora ? ' disabled' : ''} onclick="rfOrchMattino()" title="Rifà da capo la distribuzione delle stanze di oggi con le regole di adesso. Chi è già in una stanza non si muove.">${ICONS.flow || ICONS.ai} ${RF.orchLavora ? 'Ridistribuisco…' : 'Ridistribuisci le stanze'}</button></div></div>`;
  if (!o) return `${testa}<div class="card"><div class="caption">Carico lo stato dello studio…</div></div>`;
  return `${testa}${rfOrMsg()}<div class="stack">${vista === 'adesso' ? rfOrAdesso(o) : vista === 'agenda' ? rfOrAgenda(o) : rfOrGiornata(o)}</div>`;
};
function rfOrBottoniVista(v) { const b = (k, et) => `<button class="${v === k ? 'on' : ''}" onclick="rfOrchVista('${k}')">${et}</button>`; return b('adesso', 'Adesso') + b('calendario', 'Calendario') + b('agenda', 'Agenda'); }
async function rfOrchRitira(id) { try { await fetch('/api/orchestrazione/comandi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'ritira', id }) }); } catch {} RF.orchSala = ''; await rfOrchCarica(); }

