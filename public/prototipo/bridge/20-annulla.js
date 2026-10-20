/* ANNULLA E RIPETI nella revisione (20.10.2026, richiesta dello studio: «le freccine torna indietro e avanti come su
   Word, se sbaglio qualcosa»). Valgono nella revisione completa e in quella semplice: ↶ torna al passo prima, ↷ rifà
   quello annullato; anche ⌘/Ctrl + Z e ⇧⌘/Ctrl + Z (o Ctrl + Y).

   Un passo è ciò che cambia la lettera: una pausa nello scrivere, una formattazione, una correzione accettata, «Metti
   …». La storia è di questa pagina e di questa bozza (ricaricando riparte da capo, come in Word riaprendo il file): si
   tengono gli ultimi 100 passi. Annullare rimette il testo, la formattazione e — nella revisione completa — le frasi
   tolte, spostate, aggiunte e le segnalazioni chiuse con quella correzione; poi si salva come ogni modifica. */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-storia { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: 0 1px 4px rgba(20,30,70,.06); }
.rf-storia button { width: 30px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 7px; background: transparent; color: var(--text); cursor: pointer; padding: 0; }
.rf-storia button:hover:not(:disabled) { background: var(--surface-3, rgba(0,0,0,.06)); }
.rf-storia button:disabled { color: var(--text-3, #aab); cursor: default; }
.rf-storia svg { width: 17px; height: 17px; }
.rf-storia-rv { position: sticky; top: 60px; z-index: 5; display: flex; justify-content: flex-end; height: 0; overflow: visible; }
.rf-storia-rv .rf-storia { margin-top: -2px; }
.sm-carta { position: relative; }
.sm-carta > .rf-storia { position: absolute; top: 12px; right: 14px; }
.sm-carta > .rf-storia ~ .sm-a { padding-right: 84px; }
`; document.head.appendChild(st); })();

RF.storia = RF.storia || { id: null, ultimo: null, indietro: [], avanti: [], ripristino: false, timer: null };
const RF_STORIA_MAX = 100;
const rfStoriaCopia = (x) => JSON.parse(JSON.stringify(x));

// Che cosa c'è adesso: per la completa lo stato delle frasi, per la semplice il testo; più la formattazione letta dal foglio.
function rfStoriaAdesso() {
  if (!RF.loaded || typeof rfFmtFoglio !== 'function') return null;
  const f = rfFmtFoglio(); if (!f || !f.modifica) return null;
  let voci = RF.fmt && RF.fmt.id === RF.loaded ? RF.fmt.voci : [];
  try { const st = rfFmtLeggi(f); voci = rfFmtVoci(st.testo, rfFmtSegniDom(f, st)); } catch (_) { /* resta quella salvata */ }
  if (f.root.id === 'sm-testo') {
    if (!RF.sm || RF.sm.id !== RF.loaded) return null;
    return { tipo: 'semplice', testo: RF.sm.testo, fatti: rfStoriaCopia(RF.sm.fatti || {}), voci };
  }
  return { tipo: 'completa', text: rfStoriaCopia(RV.text), edited: rfStoriaCopia(RV.edited), moved: rfStoriaCopia(RV.moved), removed: rfStoriaCopia(RV.removed), added: rfStoriaCopia(RV.added),
    issues: RV.issues.map(i => [i.id, i.status, i.resolution]), voci };
}
// Un passo: se la lettera è cambiata dall'ultima volta, quello di prima va nella storia.
function rfStoriaPunto() {
  const s = RF.storia; if (s.ripristino) return;
  const ora = rfStoriaAdesso(); if (!ora) return;
  const chiave = `${RF.loaded}|${ora.tipo}`;
  if (s.id !== chiave) { Object.assign(s, { id: chiave, ultimo: ora, indietro: [], avanti: [] }); rfStoriaTasti(); return; }
  if (JSON.stringify(ora) === JSON.stringify(s.ultimo)) return;
  s.indietro.push(s.ultimo); if (s.indietro.length > RF_STORIA_MAX) s.indietro.shift();
  s.ultimo = ora; s.avanti = [];
  rfStoriaTasti();
}
function rfStoriaPresto() { clearTimeout(RF.storia.timer); RF.storia.timer = setTimeout(rfStoriaPunto, 600); }

function rfStoriaVai(verso) {
  const s = RF.storia;
  clearTimeout(s.timer); rfStoriaPunto();      // ciò che si è appena scritto è un passo anche se non c'è stata la pausa
  const da = verso < 0 ? s.indietro : s.avanti, a = verso < 0 ? s.avanti : s.indietro;
  if (!da.length || !s.ultimo) { toast(verso < 0 ? 'Niente da annullare' : 'Niente da ripetere'); return; }
  const meta = da.pop(); a.push(s.ultimo);
  const prima = s.ultimo; s.ultimo = meta;
  rfStoriaMetti(meta, prima);
  rfStoriaTasti();
}
// Dove mettere il cursore: dove i due testi cominciano a essere diversi.
function rfStoriaDove(a, b) { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; }
function rfStoriaMetti(st, prima) {
  const s = RF.storia; s.ripristino = true;
  try {
    RF.fmt.voci = rfStoriaCopia(st.voci || []);
    if (st.tipo === 'semplice') {
      const el = document.getElementById('sm-testo'); if (!el || !RF.sm) return;
      RF.sm.testo = st.testo; RF.sm.fatti = rfStoriaCopia(st.fatti);
      el.textContent = st.testo;
      const f = rfFmtFoglio(); if (f) rfFmtDipingi(f, RF.fmt.voci);
      el.focus({ preventScroll: true }); const k = rfStoriaDove(st.testo, prima.testo || ''); rfSmSeleziona(el, k, k);
      rfSmProgramma(); rfSmRidisegna();
    } else {
      Object.assign(RV, { text: rfStoriaCopia(st.text), edited: rfStoriaCopia(st.edited), moved: rfStoriaCopia(st.moved), removed: rfStoriaCopia(st.removed), added: rfStoriaCopia(st.added) });
      const stati = new Map(st.issues.map(x => [x[0], x])); RV.issues.forEach(i => { const x = stati.get(i.id); if (x) { i.status = x[1]; i.resolution = x[2]; } });
      rvRenderReport();
      if (typeof rvRenderNav === 'function') rvRenderNav();
      if (typeof rvCount === 'function') rvCount();
      rvSave();
    }
    rfFmtProgramma();
  } finally { s.ripristino = false; }
}

/* ── i tasti ── */
const RF_STORIA_SVG = {
  indietro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  avanti: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
};
function rfStoriaHtml() {
  const s = RF.storia, mio = s.id && s.id.startsWith(`${RF.loaded}|`);
  return `<div class="rf-storia" role="toolbar" aria-label="Annulla e ripeti"><button type="button" data-storia="-1" onmousedown="event.preventDefault()" onclick="rfStoriaVai(-1)" title="Annulla (⌘/Ctrl + Z)" aria-label="Annulla" ${mio && s.indietro.length ? '' : 'disabled'}>${RF_STORIA_SVG.indietro}</button><button type="button" data-storia="1" onmousedown="event.preventDefault()" onclick="rfStoriaVai(1)" title="Ripeti (⇧⌘/Ctrl + Z)" aria-label="Ripeti" ${mio && s.avanti.length ? '' : 'disabled'}>${RF_STORIA_SVG.avanti}</button></div>`;
}
function rfStoriaTasti() {
  const s = RF.storia, mio = s.id && s.id.startsWith(`${RF.loaded}|`);
  document.querySelectorAll('.rf-storia [data-storia="-1"]').forEach(b => { b.disabled = !(mio && s.indietro.length); });
  document.querySelectorAll('.rf-storia [data-storia="1"]').forEach(b => { b.disabled = !(mio && s.avanti.length); });
}
// Dopo ogni disegno del foglio (chiamata da rfFmtDopoDisegno): i tasti al loro posto e, la prima volta, il punto di partenza.
function rfStoriaDopoDisegno(f) {
  if (!f || !f.modifica) return;
  if (f.root.id === 'sm-testo') { const carta = f.root.closest('.sm-carta'); if (carta && !carta.querySelector(':scope > .rf-storia')) carta.insertAdjacentHTML('afterbegin', rfStoriaHtml()); }
  else { const c = document.getElementById('rv-main'); if (c && !c.querySelector('.rf-storia-rv')) c.insertAdjacentHTML('afterbegin', `<div class="rf-storia-rv">${rfStoriaHtml()}</div>`); }
  rfStoriaPunto();
}

// Scrivendo: un passo a ogni pausa.
document.addEventListener('input', (e) => { const t = e.target; if (t && t.closest && (t.closest('#sm-testo') || t.closest('#rv-main .rv-doc'))) rfStoriaPresto(); });
// ⌘Z e ⇧⌘Z: la storia di questa pagina (prima della scorciatoia della revisione completa, che annullava solo le correzioni delle frasi).
document.addEventListener('keydown', (e) => {
  if (state.route !== 'review' || !(e.metaKey || e.ctrlKey) || e.altKey) return;
  const k = String(e.key).toLowerCase();
  const verso = k === 'z' ? (e.shiftKey ? 1 : -1) : k === 'y' && e.ctrlKey ? 1 : 0;
  if (!verso) return;
  const t = document.activeElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.closest('#sm-testo')) return;      // nei campi (paziente, destinatario) resta quello del browser
  if (!RF.storia.id || !RF.storia.id.startsWith(`${RF.loaded}|`)) return;
  e.preventDefault(); e.stopPropagation(); rfStoriaVai(verso);
}, true);
// Dopo una formattazione o «Metti …», subito un passo.
(function () {
  if (typeof rfFmtApplica === 'function') { const p = rfFmtApplica; rfFmtApplica = function () { const r = p.apply(this, arguments); rfStoriaPunto(); return r; }; }
  if (typeof rfSmMetti === 'function') { const p = rfSmMetti; rfSmMetti = function () { clearTimeout(RF.storia.timer); rfStoriaPunto(); const r = p.apply(this, arguments); rfStoriaPunto(); return r; }; }
  if (typeof rfSmFatto === 'function') { const p = rfSmFatto; rfSmFatto = function () { const r = p.apply(this, arguments); rfStoriaPunto(); return r; }; }
})();
