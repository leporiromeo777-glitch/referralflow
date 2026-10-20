/* LA BARRA DI FORMATTAZIONE della revisione (20.10.2026, richiesta dello studio: «nelle correzioni dei referti una
   barra per mettere in grassetto, corsivo… quello che ho evidenziato»). Vale nella revisione completa e in quella
   semplice. Si seleziona il testo e si preme G, C o S (o ⌘/Ctrl + B, I, U); «Togli» toglie la formattazione dalla
   selezione. Si vede subito nel foglio e il Word esce uguale.

   Il testo della lettera resta testo semplice: la formattazione sta a parte (`payload.formattazione`, rotta
   /api/prototipo/referti/<id>/formattazione), come elenco di pezzi — il testo e QUALE delle sue comparse è — così
   resiste alle correzioni del testo. La logica dei pezzi è la stessa del server (src/lib/formattazione.ts): le due
   vanno tenute uguali. Nella pagina i pezzi si vedono come <span class="rf-fmt …"> dentro il testo: si mettono dopo
   ogni disegno e quando si preme la barra, mai mentre si scrive; scrivendo dentro un pezzo, il pezzo cresce. */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-fmt-b { font-weight: 700; }
.rf-fmt-i { font-style: italic; }
.rf-fmt-u { text-decoration: underline; text-underline-offset: 2px; }
.rf-fmt-barra { position: sticky; top: 64px; z-index: 6; display: inline-flex; gap: 2px; align-items: center; padding: 3px; margin: 0 0 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); box-shadow: 0 2px 10px rgba(20,30,70,.08); }
.rf-fmt-barra button { min-width: 32px; height: 30px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: var(--text); font: 600 14px/1 Georgia, 'Times New Roman', serif; cursor: pointer; }
.rf-fmt-barra button:hover { background: var(--surface-3, rgba(0,0,0,.06)); }
.rf-fmt-barra button.acceso { background: var(--accent-soft, rgba(79,110,247,.15)); color: var(--accent); }
.rf-fmt-barra button.togli { font-family: inherit; font-weight: 500; font-size: 12.5px; color: var(--text-2); }
.rf-fmt-barra .sep { width: 1px; height: 18px; background: var(--border); margin: 0 3px; }
.rf-fmt-barra .aiuto { font-size: 11.5px; color: var(--text-3); padding: 0 6px; white-space: nowrap; }
@media (max-width: 700px) { .rf-fmt-barra .aiuto { display: none; } }
#sm-testo { white-space: pre-wrap; overflow-wrap: break-word; cursor: text; }
#sm-testo:empty::before { content: 'Il testo della lettera'; color: #9aa0ad; }
`; document.head.appendChild(st); })();

const RF_FMT_B = 1, RF_FMT_I = 2, RF_FMT_U = 4;
RF.fmt = RF.fmt || { id: null, voci: [], timer: null };

/* ── i pezzi: la stessa logica di src/lib/formattazione.ts ── */
function rfFmtModello(testo) {
  const p = String(testo || '').split(/\s+/).filter(Boolean);
  return p.length ? new RegExp(p.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g') : null;
}
function rfFmtTrova(testo, v) {
  const rx = rfFmtModello(v.testo); if (!rx) return null;
  let m, k = 0;
  while ((m = rx.exec(testo))) { if (!m[0].length) { rx.lastIndex++; continue; } if (k++ === v.n) return [m.index, m.index + m[0].length]; }
  return null;
}
function rfFmtSegni(testo, voci) {
  const s = new Uint8Array(testo.length);
  for (const v of voci || []) { const r = rfFmtTrova(testo, v); if (!r) continue; const f = (v.b ? RF_FMT_B : 0) | (v.i ? RF_FMT_I : 0) | (v.u ? RF_FMT_U : 0); for (let k = r[0]; k < r[1]; k++) s[k] |= f; }
  return s;
}
function rfFmtVoci(testo, segni) {
  const out = []; let k = 0;
  while (k < testo.length) {
    const f = segni[k] || 0; if (!f) { k++; continue; }
    let j = k; while (j < testo.length && (segni[j] || 0) === f) j++;
    let da = k, a = j; while (da < a && /\s/.test(testo[da])) da++; while (a > da && /\s/.test(testo[a - 1])) a--;
    if (a > da) {
      const pezzo = testo.slice(da, a), rx = rfFmtModello(pezzo); let n = 0, m;
      while ((m = rx.exec(testo)) && m.index < da) { if (!m[0].length) { rx.lastIndex++; continue; } n++; }
      out.push(Object.assign({ testo: pezzo.replace(/\s+/g, ' '), n }, f & RF_FMT_B ? { b: true } : {}, f & RF_FMT_I ? { i: true } : {}, f & RF_FMT_U ? { u: true } : {}));
    }
    k = j;
  }
  return out;
}

/* ── il foglio nella pagina ── */
// Quale foglio c'è adesso: la revisione semplice (#sm-testo) o la completa (i paragrafi di .rv-doc). Modificabile solo da bozza.
function rfFmtFoglio() {
  if (state.route !== 'review' || !RF.loaded) return null;
  const sm = document.getElementById('sm-testo');
  const bozza = !RF.meta || RF.meta.stato === 'bozza';
  if (sm) return { root: sm, parti: [sm], modifica: bozza && sm.isContentEditable };
  const doc = document.querySelector('#rv-main .rv-doc'); if (!doc) return null;
  return { root: doc, parti: [...doc.querySelectorAll('[data-sec-body]')], modifica: bozza && typeof RV !== 'undefined' && RV.mode !== 'read' };
}
// Il testo del foglio e dove sta ogni suo pezzo di testo. Fuori le parole tolte (barrate) e il segnaposto «—».
function rfFmtLeggi(f) {
  const nodi = []; let testo = '';
  f.parti.forEach((el, k) => {
    if (k && testo && !testo.endsWith('\n')) testo += '\n';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 1) { if (n.nodeName === 'BR' || ((n.nodeName === 'DIV' || n.nodeName === 'P') && testo && !testo.endsWith('\n'))) testo += '\n'; continue; }
      const pe = n.parentElement; if (pe && (pe.closest('.rf-tolta') || pe.closest('.caption'))) continue;
      nodi.push({ n, da: testo.length }); testo += n.nodeValue;
    }
  });
  return { testo, nodi };
}
function rfFmtSegniDom(f, st) {
  const s = new Uint8Array(st.testo.length);
  for (const q of st.nodi) {
    const pe = q.n.parentElement; if (!pe) continue;
    let v = 0;
    if (pe.closest('.rf-fmt-b, b, strong')) v |= RF_FMT_B;
    if (pe.closest('.rf-fmt-i, i, em')) v |= RF_FMT_I;
    if (pe.closest('.rf-fmt-u, u')) v |= RF_FMT_U;
    if (v) s.fill(v, q.da, q.da + q.n.nodeValue.length);
  }
  return s;
}
// Selezione ↔ posizioni nel testo del foglio.
function rfFmtPos(st, node, off) {
  if (node.nodeType === 3) { const q = st.nodi.find(x => x.n === node); if (q) return q.da + Math.min(off, node.nodeValue.length); }
  const r = document.createRange(); r.setStart(node, off); r.collapse(true);
  for (const q of st.nodi) if (r.comparePoint(q.n, 0) >= 0) return q.da;
  return st.testo.length;
}
function rfFmtSelezione(f, st) {
  const s = window.getSelection(); if (!s || !s.rangeCount) return null;
  const r = s.getRangeAt(0); if (!f.root.contains(r.startContainer) || !f.root.contains(r.endContainer)) return null;
  const da = rfFmtPos(st, r.startContainer, r.startOffset), a = rfFmtPos(st, r.endContainer, r.endOffset);
  return [Math.min(da, a), Math.max(da, a)];
}
function rfFmtPunto(st, pos, fine) {
  for (let i = st.nodi.length - 1; i >= 0; i--) { const q = st.nodi[i], l = q.n.nodeValue.length; if (pos > q.da || (pos === q.da && !fine)) return pos - q.da <= l ? [q.n, pos - q.da] : [q.n, l]; }
  return st.nodi.length ? [st.nodi[0].n, 0] : null;
}
function rfFmtSeleziona(f, da, a) {
  const st = rfFmtLeggi(f), x = rfFmtPunto(st, da, false), y = rfFmtPunto(st, a, a > da);
  if (!x || !y) return null;
  try { const r = document.createRange(); r.setStart(x[0], x[1]); r.setEnd(y[0], y[1]); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return r; } catch (_) { return null; }
}
// Mette i pezzi nel foglio: toglie quelli di prima e rifà gli span. La selezione resta dov'era.
function rfFmtDipingi(f, voci) {
  if (!f) return;
  let sel = null; try { const st0 = rfFmtLeggi(f); sel = document.activeElement && f.root.contains(document.activeElement) || f.root === document.activeElement ? rfFmtSelezione(f, st0) : null; } catch (_) { sel = null; }
  f.root.querySelectorAll('span.rf-fmt').forEach(sp => { const p = sp.parentNode; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); p.removeChild(sp); });
  f.parti.forEach(el => el.normalize());
  const st = rfFmtLeggi(f), segni = rfFmtSegni(st.testo, voci);
  for (const q of st.nodi) {
    const t = q.n.nodeValue, pezzi = []; let k = 0;
    while (k < t.length) { const v = segni[q.da + k]; let j = k; while (j < t.length && segni[q.da + j] === v) j++; pezzi.push([k, j, v]); k = j; }
    if (!pezzi.some(p => p[2])) continue;
    let nodo = q.n;
    for (let i = pezzi.length - 1; i >= 0; i--) {
      const [da, , v] = pezzi[i];
      const pezzo = da > 0 ? nodo.splitText(da) : nodo;
      if (v) { const sp = document.createElement('span'); sp.className = `rf-fmt${v & RF_FMT_B ? ' rf-fmt-b' : ''}${v & RF_FMT_I ? ' rf-fmt-i' : ''}${v & RF_FMT_U ? ' rf-fmt-u' : ''}`; pezzo.parentNode.insertBefore(sp, pezzo); sp.appendChild(pezzo); }
      if (da === 0) break;
    }
  }
  if (sel) rfFmtSeleziona(f, sel[0], sel[1]);
}

/* ── la barra ── */
function rfFmtBarraHtml() {
  const b = (k, testo, titolo, stile) => `<button type="button" data-fmt="${k}" title="${titolo}" onmousedown="event.preventDefault()" onclick="rfFmtApplica('${k}')" ${stile ? `style="${stile}"` : ''}>${testo}</button>`;
  return `<div class="rf-fmt-barra" role="toolbar" aria-label="Formattazione">${b('b', 'G', 'Grassetto (⌘/Ctrl + B)', 'font-weight:800')}${b('i', 'C', 'Corsivo (⌘/Ctrl + I)', 'font-style:italic')}${b('u', 'S', 'Sottolineato (⌘/Ctrl + U)', 'text-decoration:underline')}<span class="sep"></span>${b('togli', 'Togli', 'Togli grassetto, corsivo e sottolineato dal testo selezionato')}<span class="aiuto">seleziona il testo, poi scegli</span></div>`;
}
function rfFmtApplica(k) {
  const f = rfFmtFoglio();
  if (!f || !f.modifica) { toast(RF.meta && RF.meta.stato !== 'bozza' ? 'La lettera è confermata: non si cambia più' : 'Qui il testo non si modifica'); return; }
  const st = rfFmtLeggi(f), sel = rfFmtSelezione(f, st);
  if (!sel || sel[0] === sel[1]) { toast('Seleziona prima il testo da formattare'); return; }
  const segni = rfFmtSegniDom(f, st), bit = { b: RF_FMT_B, i: RF_FMT_I, u: RF_FMT_U }[k];
  const pieni = [];
  for (let x = sel[0]; x < sel[1]; x++) if (!/\s/.test(st.testo[x])) pieni.push(x);
  if (k === 'togli') { for (let x = sel[0]; x < sel[1]; x++) segni[x] = 0; }
  else {
    const tutto = pieni.length && pieni.every(x => segni[x] & bit);
    for (let x = sel[0]; x < sel[1]; x++) segni[x] = tutto ? segni[x] & ~bit : segni[x] | bit;
  }
  RF.fmt.voci = rfFmtVoci(st.testo, segni);
  rfFmtDipingi(f, RF.fmt.voci);
  rfFmtSeleziona(f, sel[0], sel[1]);
  rfFmtStatoBarra();
  rfFmtProgramma();
}
// I tasti della barra si accendono se la selezione è già tutta così.
function rfFmtStatoBarra() {
  const barra = document.querySelector('.rf-fmt-barra'); if (!barra) return;
  const f = rfFmtFoglio(); let segni = null, sel = null, st = null;
  if (f) { st = rfFmtLeggi(f); sel = rfFmtSelezione(f, st); if (sel) segni = rfFmtSegniDom(f, st); }
  for (const [k, bit] of [['b', RF_FMT_B], ['i', RF_FMT_I], ['u', RF_FMT_U]]) {
    const el = barra.querySelector(`[data-fmt="${k}"]`); if (!el) continue;
    let on = false;
    if (segni && sel) { const a = Math.max(sel[1], sel[0] + 1); on = true; let visto = false; for (let x = sel[0]; x < a && x < st.testo.length; x++) { if (/\s/.test(st.testo[x])) continue; visto = true; if (!(segni[x] & bit)) { on = false; break; } } on = on && visto; }
    el.classList.toggle('acceso', on);
  }
}
document.addEventListener('selectionchange', () => { if (state.route === 'review' && document.querySelector('.rf-fmt-barra')) rfFmtStatoBarra(); });

/* ── salvare ── */
function rfFmtProgramma() { clearTimeout(RF.fmt.timer); RF.fmt.timer = setTimeout(() => void rfFmtSalva(), 800); }
async function rfFmtSalva() {
  const id = RF.fmt.id; if (!id || !RF.meta || RF.meta.stato !== 'bozza') return true;
  clearTimeout(RF.fmt.timer);
  try {
    const r = await fetch(`/api/prototipo/referti/${id}/formattazione`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ voci: RF.fmt.voci }) });
    if (!r.ok) throw new Error(String(r.status));
    if (RF.meta && RF.loaded === id) RF.meta.formattazione = RF.fmt.voci;
    return true;
  } catch (_) { RF.fmt.timer = setTimeout(() => void rfFmtSalva(), 5000); return false; }
}
// Scrivendo, i pezzi si rileggono dal foglio (un pezzo in cui si scrive cresce; uno cancellato sparisce).
function rfFmtDopoScritto() {
  clearTimeout(rfFmtDopoScritto.t);
  rfFmtDopoScritto.t = setTimeout(() => {
    const f = rfFmtFoglio(); if (!f || !f.modifica || RF.fmt.id !== RF.loaded) return;
    const st = rfFmtLeggi(f), voci = rfFmtVoci(st.testo, rfFmtSegniDom(f, st));
    if (JSON.stringify(voci) !== JSON.stringify(RF.fmt.voci)) { RF.fmt.voci = voci; rfFmtProgramma(); }
  }, 700);
}
document.addEventListener('input', (e) => { const t = e.target; if (t && t.closest && (t.closest('#sm-testo') || t.closest('#rv-main .rv-doc'))) rfFmtDopoScritto(); });
// ⌘/Ctrl + B, I, U nel foglio: la barra, non il grassetto del browser (metterebbe dei <b> che il resto non conosce).
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || state.route !== 'review') return;
  const k = { b: 'b', i: 'i', u: 'u' }[String(e.key).toLowerCase()]; if (!k) return;
  const t = e.target; if (!(t && t.closest && (t.closest('#sm-testo') || t.closest('#rv-main .rv-doc')))) return;
  e.preventDefault(); e.stopPropagation(); rfFmtApplica(k);
}, true);

// La formattazione della bozza aperta, e dopo ogni disegno del foglio i suoi pezzi.
function rfFmtCarica() {
  if (RF.fmt.id === RF.loaded) return;
  RF.fmt = { id: RF.loaded, voci: Array.isArray(RF.meta && RF.meta.formattazione) ? RF.meta.formattazione : [], timer: null };
}
function rfFmtDopoDisegno() {
  if (!RF.live || !RF.loaded || !RF.meta) return;
  rfFmtCarica();
  const f = rfFmtFoglio(); if (!f) return;
  if (RF.fmt.voci.length) rfFmtDipingi(f, RF.fmt.voci);
  // la barra: nella completa sopra il foglio (non in lettura), nella semplice dentro la carta
  const c = document.querySelector('#rv-main');
  if (c && !document.getElementById('sm-testo') && f.modifica && !c.querySelector('.rf-fmt-barra')) c.insertAdjacentHTML('afterbegin', rfFmtBarraHtml());
}
if (typeof rvRenderReport === 'function') {
  const rfFmtPrima = rvRenderReport;
  rvRenderReport = function () { const r = rfFmtPrima.apply(this, arguments); try { rfFmtDopoDisegno(); } catch (_) { /* la formattazione non deve fermare la revisione */ } return r; };
}
window.addEventListener('pagehide', () => { if (RF.fmt && RF.fmt.timer) void rfFmtSalva(); });
