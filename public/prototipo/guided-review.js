/* ReferralFlow — Guided Report Review
   Tre pannelli: percorso di verifica, referto, fonte (audio + trascrizione).
   Principio: l'AI trova i punti dubbi, la persona verifica, il sistema registra.
   L'audio è simulato da un orologio di riproduzione: stessa semantica di un file
   reale (posizione, finestra di evidenza, velocità), nessun file da caricare. */

const RV_KEY = 'rf-review-r1';
const RV = {
  report: 'r1', cur: 0, issues: [], text: {}, edited: {}, moved: {}, removed: {}, added: [],
  t: 0, playing: false, speed: 1, stopAt: null, follow: true, detached: false,
  autoplay: false, autonext: true, panel: 'source', mode: 'guided', filter: 'all',
  metrics: { plays: 0, corrections: 0, escalations: 0, started: Date.now(), seconds: 0 },
  log: [], saved: true, undo: [],
};

function rvInit(fresh) {
  RV.issues = RV_ISSUES.map(i => ({ ...i, status: 'open', resolution: null }));
  RV.text = {}; RV_REPORT.forEach(s => s.parts.forEach(p => { RV.text[p.id] = p.t; }));
  RV.edited = {}; RV.moved = {}; RV.removed = {}; RV.added = []; RV.cur = 0; RV.t = 0;
  RV.metrics = { plays: 0, corrections: 0, escalations: 0, started: Date.now(), seconds: 0 };
  RV.log = []; RV.undo = []; RV.mode = 'guided'; RV.saved = true;
  if (fresh) { localStorage.removeItem(RV_KEY); return false; }
  try {
    const raw = localStorage.getItem(RV_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    Object.assign(RV.text, d.text || {});
    Object.assign(RV.edited, d.edited || {});
    Object.assign(RV.moved, d.moved || {});
    Object.assign(RV.removed, d.removed || {});
    RV.added = d.added || [];
    RV.cur = d.cur || 0; RV.t = d.t || 0;
    RV.metrics = Object.assign(RV.metrics, d.metrics || {});
    RV.log = d.log || [];
    (d.issues || []).forEach(x => { const i = RV.issues.find(y => y.id === x.id); if (i) { i.status = x.status; i.resolution = x.resolution; } });
    return true;
  } catch (e) { return false; }
}
function rvSave() {
  RV.saved = false; rvSetSaveState('saving');
  clearTimeout(rvSave._t);
  rvSave._t = setTimeout(() => {
    try {
      localStorage.setItem(RV_KEY, JSON.stringify({
        text: RV.text, edited: RV.edited, moved: RV.moved, removed: RV.removed, added: RV.added,
        cur: RV.cur, t: RV.t, metrics: RV.metrics, log: RV.log,
        issues: RV.issues.map(i => ({ id: i.id, status: i.status, resolution: i.resolution })),
      }));
    } catch (e) { /* quota: la revisione continua comunque */ }
    RV.saved = true; rvSetSaveState('saved');
  }, 600);
}
function rvSetSaveState(s) { const el = document.getElementById('rv-save'); if (el) el.innerHTML = s === 'saving' ? '<span class="caption">Salvataggio…</span>' : `<span class="caption">${ICONS.check} Salvato</span>`; }
function rvLog(kind, detail) { RV.log.push({ kind, detail, at: new Date().toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }); }

/* ---------- selezioni ---------- */
const rvPath = () => RV.issues.filter(i => RV.filter === 'all' || (RV.filter === 'open' ? i.status === 'open' : i.status !== 'open'));
const rvOpen = () => RV.issues.filter(i => i.status === 'open');
const rvBlocking = () => RV.issues.filter(i => i.status === 'open' && (i.sev === 'critical' || i.cat === 'NO_SOURCE'));
const rvIssue = () => RV.issues[RV.cur] || null;
const rvDone = () => RV.issues.filter(i => i.status !== 'open').length;
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); const r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); };
const rvSeg = t => RV_TRANSCRIPT.find(s => t >= s.s && t <= s.e) || null;

/* ---------- motore audio simulato ---------- */
function rvPlay(from, to) {
  if (typeof from === 'number') RV.t = Math.max(0, from);
  RV.stopAt = typeof to === 'number' ? to : null;
  RV.playing = true; RV.metrics.plays++;
  RV.detached = false;
  rvLog('AUDIO_PLAYED', fmt(RV.t) + (RV.stopAt ? ' → ' + fmt(RV.stopAt) : ''));
  clearInterval(rvPlay._iv);
  rvPlay._iv = setInterval(() => {
    RV.t += 0.1 * RV.speed; RV.metrics.seconds += 0.1;
    if (RV.t >= RV_AUDIO.dur || (RV.stopAt && RV.t >= RV.stopAt)) rvPause();
    rvTick();
  }, 100);
  rvTick();
}
function rvPause() { RV.playing = false; clearInterval(rvPlay._iv); rvTick(); }
function rvToggle() { RV.playing ? rvPause() : rvPlay(); }
function rvSeek(t, play) { RV.t = Math.min(RV_AUDIO.dur, Math.max(0, t)); RV.detached = false; if (play) rvPlay(RV.t, null); else rvTick(); }
function rvNudge(d) { rvSeek(RV.t + d, RV.playing); }
/* Pre-roll: si parte prima del punto, per sentire il contesto e non la parola isolata */
function rvListen(issue) {
  const i = issue || rvIssue();
  if (!i || !i.ev) { toast('Nessuna fonte audio per questa verifica'); return; }
  const pre = i.preroll != null ? i.preroll : 1.5;
  rvPlay(i.ev.s - pre, i.ev.e + 2);
}

/* ---------- rendering ---------- */
PAGES.review = () => {
  const p = P.p1;
  if (!RV.issues.length) rvInit();
  setTimeout(rvAfterRender, 0);
  return `
  <div class="rv ${RV.mode === 'read' ? 'read' : ''}">
    <div class="rv-top">
      <button class="btn ghost sm" data-go="#/reports">${ICONS.arrowL}</button>
      <div class="rv-pat">${ICONS.shield}<b>${fullName(p)}</b><span>12.03.1959</span><span class="sep">·</span><span>Controllo cardiologico</span><span class="sep">·</span><span>Dr.ssa Bianchi</span><span class="sep">·</span><span>09.09.2026 · 14:30</span></div>
      <div class="rv-top-r">
        <span id="rv-save"><span class="caption">${ICONS.check} Salvato</span></span>
        <span class="caption" id="rv-left">${rvOpen().length} verifiche restanti</span>
        <button class="btn sm ghost" onclick="rvCheat()" title="Scorciatoie (?)">${ICONS.help || ICONS.why} Tasti</button>
        <button class="btn sm ${RV.mode === 'read' ? 'primary' : ''}" onclick="rvMode('${RV.mode === 'read' ? 'guided' : 'read'}')">${RV.mode === 'read' ? 'Torna alle verifiche' : 'Lettura pulita'}</button>
        <button class="btn primary sm" onclick="rvFinish()">Termina revisione</button>
      </div>
    </div>
    <div class="rv-grid ${RV.panel === 'off' ? 'no-src' : ''}">
      <aside class="rv-nav" id="rv-nav"></aside>
      <main class="rv-main" id="rv-main"></main>
      <aside class="rv-src" id="rv-src"></aside>
    </div>
  </div>`;
};

function rvAfterRender() { rvRenderNav(); rvRenderReport(); rvRenderSource(); rvTick(); }

function rvRenderNav() {
  const el = document.getElementById('rv-nav'); if (!el) return;
  const done = rvDone(), tot = RV.issues.length;
  const groups = [
    ['critical', 'Critici'], ['verify', 'Dati clinici'], ['uncertain', 'Termini'], ['suggestion', 'Struttura'], ['language', 'Lingua e stile'],
  ];
  const openIssues = RV.issues.filter(i => i.status === 'open');
  const closed = RV.issues.filter(i => i.status !== 'open');
  const card = (i) => {
    const idx = RV.issues.indexOf(i);
    const sev = RV_SEV[i.sev];
    return `<button class="rv-issue ${i.sev} ${idx === RV.cur ? 'active' : ''} ${i.status !== 'open' ? 'closed' : ''}" onclick="rvGo(${idx})">
      <span class="d"></span>
      <span class="b"><span class="t">${esc(i.title)}</span>
      <span class="s">${esc(RV_CAT[i.cat][0])}${i.ev ? ' · ' + fmt(i.ev.focus) : ' · nessuna fonte'}</span></span>
      ${i.status !== 'open' ? `<span class="badge ${i.status === 'escalated' ? 'warning' : 'success'}">${i.status === 'escalated' ? '↗' : '✓'}</span>` : `<span class="badge ${sev[1]}">${sev[0]}</span>`}
    </button>`;
  };
  el.innerHTML = `
    <div class="rv-nav-head">
      <div class="row between"><b style="font-size:13px">Revisione</b><span class="caption">${done} / ${tot} controllati</span></div>
      <div class="rv-prog"><i style="width:${Math.round(done / tot * 100)}%"></i></div>
      ${rvBlocking().length ? `<div class="rv-block">${ICONS.alert || ''} ${rvBlocking().length} verifica${rvBlocking().length > 1 ? 'e' : ''} obbligatoria${rvBlocking().length > 1 ? 'e' : ''}</div>` : '<div class="rv-ok">Controlli obbligatori completati</div>'}
    </div>
    <div class="rv-nav-body">
      ${openIssues.length ? `<div class="rv-group">Da verificare</div>${groups.map(([g]) => openIssues.filter(i => i.sev === g).map(card).join('')).join('')}` : ''}
      ${closed.length ? `<div class="rv-group">Controllati</div>${closed.map(card).join('')}` : ''}
    </div>
    <div class="rv-nav-foot">
      <button class="btn sm ghost grow" onclick="rvStep(-1)" title="⌘K">${ICONS.chevL || ''} Prec.</button>
      <button class="btn sm grow" onclick="rvStep(1)" title="⌘J">Succ. ${ICONS.chevR}</button>
    </div>`;
}

function rvPartHtml(p, secCode) {
  if (RV.removed[p.id]) return '';
  const i = RV.issues.find(x => x.span === p.id);
  const cur = i && RV.issues.indexOf(i) === RV.cur;
  const cls = [];
  if (i && i.status === 'open' && RV.mode === 'guided') cls.push('mark', i.sev);
  if (i && i.status !== 'open') cls.push('done');
  if (cur && RV.mode === 'guided') cls.push('cur');
  if (RV.edited[p.id]) cls.push('edited');
  const conf = RV.text[p.id] !== p.t ? 'human' : p.conf;
  return `<span class="rv-span ${cls.join(' ')}" data-span="${p.id}" data-src="${p.src || ''}" data-conf="${conf}">${esc(RV.text[p.id])}</span>`;
}
function rvRenderReport() {
  const el = document.getElementById('rv-main'); if (!el) return;
  const secs = RV_REPORT.map(s => {
    const parts = s.parts.filter(p => (RV.moved[p.id] || s.code) === s.code);
    const moved = RV_REPORT.flatMap(x => x.parts).filter(p => RV.moved[p.id] === s.code && !s.parts.includes(p));
    const added = RV.added.filter(a => a.section === s.code);
    const body = [...parts, ...moved].map(p => rvPartHtml(p, s.code)).join(' ') +
      added.map(a => ` <span class="rv-span edited" data-span="${a.id}" data-conf="human">${esc(a.text)}</span>`).join('');
    return `<section class="rv-sec" data-sec="${s.code}"><h4>${s.label}</h4><p contenteditable="${RV.mode !== 'read'}" spellcheck="false" data-sec-body="${s.code}">${body || '<span class="caption">—</span>'}</p></section>`;
  }).join('');
  el.innerHTML = `
    ${RV.mode === 'read' ? '<div class="rv-readbar">Lettura pulita · nessun indicatore. Rileggi il referto come apparirà una volta inviato.</div>' : ''}
    <div class="rv-doc ${RV.mode === 'guided' && rvIssue() ? 'focus' : ''}">${secs}</div>
    ${RV.mode !== 'read' ? `<div class="rv-legend caption"><span>Legenda:</span><span class="lg critical">Critico</span><span class="lg verify">Da verificare</span><span class="lg uncertain">Incerto</span><span class="lg language">Forma</span><span class="lg human">Modificato da te</span></div>` : ''}`;
  el.querySelectorAll('.rv-span').forEach(sp => {
    sp.onclick = () => rvSpanClick(sp.dataset.span);
    sp.onmouseenter = e => rvHover(sp);
  });
  el.querySelectorAll('[data-sec-body]').forEach(p => {
    p.oninput = () => { rvHumanEdit(p); };
    p.onfocus = () => { RV.editing = true; };
    p.onblur = () => { RV.editing = false; };
  });
}
function rvHover(sp) {
  document.querySelectorAll('.rv-mini').forEach(x => x.remove());
  const src = sp.dataset.src;
  const r = sp.getBoundingClientRect();
  const seg = src ? RV_TRANSCRIPT.find(s => s.id === src) : null;
  const bar = document.createElement('div');
  bar.className = 'rv-mini';
  bar.style.left = Math.round(r.left) + 'px';
  bar.style.top = Math.round(r.top - 34) + 'px';
  bar.innerHTML = seg
    ? `<button class="mb">${ICONS.play} Fonte</button><span class="tm">${fmt(seg.s)}</span><button class="mb ai">${ICONS.ai} AI</button>`
    : `<span class="tm none">Fonte non individuata</span>`;
  document.body.appendChild(bar);
  bar.querySelector('.mb') && (bar.querySelector('.mb').onclick = (e) => { e.stopPropagation(); rvSeek(seg.s - 1.5, true); });
  bar.querySelector('.ai') && (bar.querySelector('.ai').onclick = (e) => { e.stopPropagation(); RV.panel = 'ai'; rvRenderSource(); });
  clearTimeout(rvHover._t);
  rvHover._t = setTimeout(() => bar.remove(), 4000);
  sp.onmouseleave = () => { clearTimeout(rvHover._t); rvHover._t = setTimeout(() => bar.remove(), 900); };
}
function rvSpanClick(id) {
  const idx = RV.issues.findIndex(i => i.span === id);
  if (idx >= 0) { rvGo(idx); return; }
  const p = RV_REPORT.flatMap(s => s.parts).find(x => x.id === id);
  if (p && p.src) { const seg = RV_TRANSCRIPT.find(s => s.id === p.src); RV.panel = 'source'; rvRenderSource(); rvSeek(seg.s - 1.5, false); rvScrollTranscript(true); }
  else toast('Questa frase non ha una fonte individuata');
}
function rvHumanEdit(pEl) {
  pEl.querySelectorAll('.rv-span').forEach(sp => {
    const id = sp.dataset.span;
    const txt = sp.innerText;
    if (RV.text[id] !== undefined && RV.text[id] !== txt) {
      RV.text[id] = txt; RV.edited[id] = true; sp.dataset.conf = 'human'; sp.classList.add('edited');
      const i = RV.issues.find(x => x.span === id);
      if (i && i.status === 'open') { i.status = 'corrected'; i.resolution = 'modifica manuale'; RV.metrics.corrections++; rvLog('CORRECTION', id + ' (manuale)'); rvRenderNav(); rvCount(); }
    }
  });
  rvSave();
}

/* ---------- pannello destro ---------- */
function rvRenderSource() {
  const el = document.getElementById('rv-src'); if (!el) return;
  if (RV.panel === 'off') { el.innerHTML = ''; return; }
  const tabs = [['source', 'Fonte'], ['transcripts', 'Trascrizioni'], ['ai', 'Analisi AI']];
  el.innerHTML = `
    <div class="rv-src-head">
      <div class="seg sm">${tabs.map(([k, l]) => `<button class="${RV.panel === k ? 'active' : ''}" onclick="RV.panel='${k}';rvRenderSource();rvTick()">${l}</button>`).join('')}</div>
      <button class="icon-btn right" onclick="RV.panel='off';rvRenderSource();document.querySelector('.rv-grid').classList.add('no-src')" title="Chiudi pannello">${ICONS.x}</button>
    </div>
    <div class="rv-src-body" id="rv-src-body">${RV.panel === 'source' ? rvSourceTab() : RV.panel === 'transcripts' ? rvTranscriptsTab() : rvAiTab()}</div>`;
  if (RV.panel === 'source') rvBindAudio();
}
function rvSourceTab() {
  const i = rvIssue();
  return `
    ${rvCard()}
    <div class="rv-player">
      <div class="rv-wave" id="rv-wave">${rvWave()}</div>
      <div class="rv-times"><span class="num" id="rv-t">0:00</span><span class="num">${RV_AUDIO.label}</span></div>
      <div class="rv-ctrl">
        <button class="btn sm ghost" onclick="rvNudge(-3)" title="⌥←">−3s</button>
        <button class="btn primary" id="rv-play" onclick="rvToggle()" title="Space">${ICONS.play} Play</button>
        <button class="btn sm ghost" onclick="rvNudge(3)" title="⌥→">+3s</button>
        ${i && i.ev ? `<button class="btn sm" onclick="rvListen()" title="R">↻ Riascolta</button>` : ''}
        <select class="input sm" style="max-width:78px" onchange="RV.speed=+this.value">${[0.75, 0.9, 1, 1.1, 1.25].map(v => `<option value="${v}" ${v === RV.speed ? 'selected' : ''}>${v}×</option>`).join('')}</select>
      </div>
    </div>
    <div class="rv-find"><input class="input sm" id="rv-find" placeholder="Cerca nell'audio… (es. Holter)"><div id="rv-find-res"></div></div>
    <div class="rv-tr" id="rv-tr">${RV_TRANSCRIPT.map(s => `<div class="tr" data-seg="${s.id}" onclick="rvSeek(${s.s},true)"><span class="tm num">${fmt(s.s)}</span><span class="tx">${s.w ? s.w.map((w, k) => `<span class="wd" data-w="${w[0]}">${esc(w[1])}</span>`).join(' ') : esc(s.tx)}</span></div>`).join('')}</div>
    <div class="rv-follow" id="rv-follow" style="display:none"><button class="btn sm" onclick="RV.detached=false;rvScrollTranscript(true)">↳ Torna alla riproduzione</button></div>`;
}
function rvWave() {
  const n = 150, i = rvIssue();
  let bars = '';
  for (let k = 0; k < n; k++) {
    const t = k / n * RV_AUDIO.dur;
    const seg = rvSeg(t);
    const base = seg ? 0.45 + 0.55 * Math.abs(Math.sin(k * 1.7) * Math.cos(k * 0.6)) : 0.10 + 0.08 * Math.abs(Math.sin(k * 2.3));
    const inEv = i && i.ev && t >= i.ev.s && t <= i.ev.e;
    bars += `<i class="${inEv ? 'ev' : ''}" style="height:${Math.round(base * 100)}%"></i>`;
  }
  const marks = RV_MARKERS.map(m => `<span class="mk ${m.k}" style="left:${(m.t / RV_AUDIO.dur * 100).toFixed(2)}%" title="${RV_MARKER_LABEL[m.k]}: ${esc(m.l)}" onclick="event.stopPropagation();rvSeek(${m.t - 1.5},true)"></span>`).join('');
  return `<div class="bars">${bars}</div>${marks}<span class="ph" id="rv-ph"></span>`;
}
function rvBindAudio() {
  const w = document.getElementById('rv-wave');
  if (w) w.onclick = e => { const r = w.getBoundingClientRect(); rvSeek((e.clientX - r.left) / r.width * RV_AUDIO.dur, false); };
  const tr = document.getElementById('rv-tr');
  if (tr) tr.onscroll = () => { if (RV.playing) { RV.detached = true; const f = document.getElementById('rv-follow'); if (f) f.style.display = 'block'; } };
  const f = document.getElementById('rv-find');
  if (f) f.oninput = () => {
    const q = f.value.trim().toLowerCase();
    const box = document.getElementById('rv-find-res');
    if (q.length < 2) { box.innerHTML = ''; return; }
    const hits = RV_TRANSCRIPT.filter(s => s.tx.toLowerCase().includes(q));
    box.innerHTML = hits.length
      ? hits.map(s => `<button class="chip" onclick="rvSeek(${s.s - 1},true)">${ICONS.play} ${fmt(s.s)}</button>`).join('')
      : '<span class="caption">Nessun risultato nella trascrizione</span>';
  };
}
function rvTranscriptsTab() {
  const i = rvIssue();
  if (!i || !i.tr) return `<div class="rv-empty">${emptyState('reports', 'Nessuna divergenza su questa verifica', 'Le due trascrizioni compaiono solo quando differiscono in un punto che vale la pena controllare.')}</div>`;
  return `<div class="rv-cmp">
    <div class="c"><span class="h">Trascrizione primaria</span><p>${esc(i.tr.primary)}</p></div>
    <div class="c"><span class="h">Trascrittore clinico</span><p>${esc(i.tr.clinical)}</p></div>
    ${i.tr.primary !== i.tr.clinical ? `<div class="warn">${ICONS.alert || '⚠'} Discordanza · classe ${RV_CAT[i.cat][0].toLowerCase()} — la fusione non decide su questa classe</div>` : '<div class="ok">Le due trascrizioni coincidono: il dubbio non nasce dall\'ascolto ma dal contenuto.</div>'}
    ${i.ev ? `<button class="btn sm primary" onclick="rvListen()">${ICONS.play} Ascolta ${fmt(i.ev.focus)}</button>` : ''}
  </div>`;
}
function rvAiTab() {
  const i = rvIssue();
  return `<div class="rv-ai">
    <div class="caption">L'assistente usa solo questo referto, la sua trascrizione e i dati del paziente aperto.</div>
    ${i ? `<div class="rv-why"><b>Perché è segnalato</b><p>${esc(i.why)}</p><div class="row wrap" style="gap:6px"><span class="badge">${RV_CAT[i.cat][0]}</span><span class="badge ${RV_SEV[i.sev][1]}">${RV_SEV[i.sev][0]}</span><span class="badge ${RV_CONF[i.conf][1]}">${RV_CONF[i.conf][0]}</span></div></div>` : ''}
    <div class="rv-qs">${['Dove parla del Bisoprololo?', 'Dove parla del follow-up?', 'Confronta le due trascrizioni', 'Perché è stato scritto così?'].map(q => `<button class="chip" onclick="rvAsk('${esc(q)}')">${q}</button>`).join('')}</div>
    <div id="rv-ai-out"></div>
  </div>`;
}
function rvAsk(q) {
  const out = document.getElementById('rv-ai-out'); if (!out) return;
  const ql = q.toLowerCase();
  let html = '';
  if (/bisoprololo/.test(ql)) html = `Ho trovato due punti.<div class="row wrap mt-8" style="gap:6px"><button class="chip" onclick="rvSeek(160,true)">${ICONS.play} 2:40 — terapia in corso</button><button class="chip" onclick="rvSeek(172,true)">${ICONS.play} 2:52 — resto della terapia</button></div><div class="srcs"><span class="src">trascrizione · 2 segmenti</span></div>`;
  else if (/follow/.test(ql)) html = `Il follow-up viene nominato una volta sola.<div class="row wrap mt-8" style="gap:6px"><button class="chip" onclick="rvSeek(371,true)">${ICONS.play} 6:12 — Holter e controllo a 6 mesi</button></div>`;
  else if (/confronta/.test(ql)) { RV.panel = 'transcripts'; rvRenderSource(); return; }
  else { const i = rvIssue(); html = i ? `<b>${esc(i.title)}</b><p>${esc(i.why)}</p>` : 'Seleziona prima una verifica.'; }
  out.innerHTML = `<div class="ai-msg ai mt-8">${html}</div>`;
}

/* ---------- correction card ---------- */
function rvCard() {
  const i = rvIssue();
  if (!i) return `<div class="rv-card done">${ICONS.check} Nessuna verifica selezionata. <button class="btn sm" onclick="rvGo(0)">Vai alla prima</button></div>`;
  const closed = i.status !== 'open';
  const opts = i.opts || [];
  return `<div class="rv-card ${i.sev} ${closed ? 'closed' : ''}">
    <div class="ch"><span class="badge ${RV_SEV[i.sev][1]}">${RV_SEV[i.sev][0]}</span><b>${esc(i.title)}</b><span class="caption right">${RV.cur + 1}/${RV.issues.length}</span></div>
    ${i.cat === 'OMISSION' ? `
      <div class="cl">Nell'audio (${fmt(i.ev.focus)})</div><div class="cv">${esc(i.audioTx)}</div>
      <div class="cl">Non presente nel referto</div><div class="cv add">Proposta · sezione ${esc(RV_REPORT.find(s => s.code === i.add.section).label)}<br><i>${esc(i.add.text)}</i></div>`
    : `<div class="cl">Nel referto</div><div class="cv">${esc(RV.text[i.span] || i.now || '—')}</div>
      ${i.tr && i.tr.primary !== i.tr.clinical ? `<div class="cl">Seconda trascrizione</div><div class="cv alt">${esc(i.tr.clinical)}</div>` : ''}`}
    <div class="crow">
      ${i.ev ? `<button class="btn sm" onclick="rvListen()">${ICONS.play} Ascolta fonte ${fmt(i.ev.focus)}</button><button class="btn sm ghost" onclick="rvListen()" title="R">↻</button>` : `<span class="badge danger">${RV_CONF[i.conf][0]}</span>`}
      <button class="btn sm ghost right" onclick="RV.panel='ai';rvRenderSource()">${ICONS.why} Perché?</button>
    </div>
    ${closed ? `<div class="cdone">${ICONS.check} ${esc(i.resolution || 'verificato')} · <button class="lnk" onclick="rvReopen()">riapri</button></div>` : `
    <div class="copts">${opts.map((o, k) => `<button class="btn ${k === 0 ? 'primary' : ''} sm" onclick="rvChoose(${k})"><kbd>${k + 1}</kbd> ${esc(o.l)}</button>`).join('')}
      ${i.doctorOnly ? '' : `<button class="btn sm ghost" onclick="rvWrite()">Scrivi altro</button>`}</div>
    ${opts.length && opts[0].note ? `<div class="cnote">${esc(opts[0].note)}</div>` : ''}
    <div class="cfoot">
      <button class="btn sm ghost" onclick="rvVerified()" title="⌘Enter">✓ Segna verificato</button>
      <button class="btn sm ghost" onclick="rvSkip()">Salta per ora</button>
      <button class="btn sm ${i.doctorOnly ? 'primary' : 'ghost'}" onclick="rvEscalate()">↗ Chiedi al medico</button>
      ${i.ev ? `<button class="btn sm ghost" onclick="rvWrongSource()" title="Segnala allineamento errato">Fonte sbagliata</button>` : ''}
    </div>`}
  </div>`;
}

/* ---------- azioni ---------- */
function rvGo(idx) {
  if (idx < 0 || idx >= RV.issues.length) return;
  RV.cur = idx;
  const i = rvIssue();
  RV.panel = RV.panel === 'off' ? 'source' : RV.panel;
  document.querySelector('.rv-grid') && document.querySelector('.rv-grid').classList.remove('no-src');
  rvRenderNav(); rvRenderReport(); rvRenderSource();
  const sp = document.querySelector(`.rv-span[data-span="${i.span}"]`);
  if (sp) sp.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (i.ev) { RV.t = Math.max(0, i.ev.s - (i.preroll || 1.5)); rvScrollTranscript(true); }
  if (RV.autoplay && i.ev) rvListen(i); else rvTick();
  rvLog('ISSUE_OPENED', i.id);
  rvSave();
}
function rvStep(d) {
  let n = RV.cur;
  for (let k = 0; k < RV.issues.length; k++) {
    n = (n + d + RV.issues.length) % RV.issues.length;
    if (RV.issues[n].status === 'open') break;
  }
  rvGo(n);
}
function rvNext() {
  const open = RV.issues.findIndex((i, k) => i.status === 'open' && k > RV.cur);
  const any = RV.issues.findIndex(i => i.status === 'open');
  if (open >= 0) rvGo(open); else if (any >= 0) rvGo(any); else { rvRenderNav(); rvRenderReport(); rvRenderSource(); toast('Tutte le verifiche sono state controllate'); }
}
function rvApply(i, txt, label) {
  const prev = i.span ? RV.text[i.span] : '';
  if (i.span) { RV.undo.push({ span: i.span, prev: RV.text[i.span] }); RV.text[i.span] = txt; RV.edited[i.span] = true; }
  i.status = 'corrected'; i.resolution = label;
  RV.metrics.corrections++;
  rvLog('CORRECTION', `${i.id}: ${label}`);
  // second brain: la correzione può diventare una regola di stile (proposta candidata nella wiki)
  if (typeof kpPropose === 'function' && prev && txt && prev.trim() !== txt.trim()) setTimeout(() => kpPropose({ from: prev, to: txt, issueId: i.id, report: state.params.id }), 350);
}
function rvChoose(k) {
  const i = rvIssue(); if (!i || i.status !== 'open') return;
  const o = i.opts[k]; if (!o) return;
  if (i.cat === 'OMISSION') {
    if (o.l === 'Ignora') { i.status = 'verified'; i.resolution = 'ignorata'; rvLog('ISSUE_IGNORED', i.id); }
    else { RV.added.push({ id: 'add-' + i.id, section: i.add.section, text: i.add.text }); i.status = 'corrected'; i.resolution = 'aggiunta al referto'; RV.metrics.corrections++; rvLog('CORRECTION', i.id + ': omissione aggiunta'); }
  } else if (i.cat === 'STRUCTURE') {
    if (o.l.startsWith('Sposta')) { RV.moved[i.span] = 'followup'; i.status = 'corrected'; i.resolution = 'spostata in Follow-up'; RV.metrics.corrections++; }
    else { i.status = 'verified'; i.resolution = 'lasciata dov\'era'; }
  } else if (i.cat === 'NO_SOURCE') {
    if (o.l.startsWith('Non presente')) { RV.removed[i.span] = true; i.status = 'corrected'; i.resolution = 'frase senza fonte rimossa'; RV.metrics.corrections++; rvLog('HALLUCINATION_FLAGGED', i.id); toast('Segnalata come possibile allucinazione · registrata per la qualità'); }
    else { RV.panel = 'source'; rvRenderSource(); setTimeout(() => { const f = document.getElementById('rv-find'); if (f) { f.value = 'nicturia'; f.oninput(); f.focus(); } }, 60); return; }
  } else if (o.apply != null) {
    if (o.apply === RV.text[i.span]) { i.status = 'verified'; i.resolution = 'testo confermato'; }
    else rvApply(i, o.apply, `scelto "${o.l}"`);
  } else { i.status = 'verified'; i.resolution = o.l; }
  rvAfterResolve(i);
}
function rvWrite() {
  const i = rvIssue(); if (!i) return;
  openModal('Scrivi la correzione', `
    <div class="field"><label>Testo nel referto</label><textarea class="input" id="rv-write" rows="3">${esc(RV.text[i.span] || '')}</textarea></div>
    <p class="caption mt-8">La correzione manuale diventa la fonte autorevole: da questo momento la frase è marcata come modificata da una persona e nessun passaggio AI può riscriverla senza mostrarti prima la differenza.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rv-write-ok">Applica</button>`);
  setTimeout(() => document.getElementById('rv-write').focus(), 60);
  document.getElementById('rv-write-ok').onclick = () => {
    rvApply(i, document.getElementById('rv-write').value, 'correzione manuale');
    closeModal(); rvAfterResolve(i);
  };
}
function rvVerified() { const i = rvIssue(); if (!i || i.status !== 'open') return; i.status = 'verified'; i.resolution = 'verificato, testo già corretto'; rvLog('ISSUE_VERIFIED', i.id); rvAfterResolve(i); }
function rvSkip() { const i = rvIssue(); if (!i) return; rvLog('ISSUE_SKIPPED', i.id); toast('Verifica rimandata · resta aperta'); rvNext(); }
function rvEscalate() {
  const i = rvIssue(); if (!i) return;
  openModal('Chiedi al medico', `
    <div class="kv"><b>Verifica</b><span>${esc(i.title)}</span><b>Frase</b><span>${esc(RV.text[i.span] || i.audioTx || '—')}</span><b>Audio</b><span>${i.ev ? fmt(i.ev.focus) : 'nessuna fonte'}</span></div>
    <div class="field mt-16"><label>Nota per il medico (facoltativa)</label><input class="input" id="rv-esc-note" placeholder="Non è chiaro se abbia detto lieve o lieve-moderata"></div>
    <p class="caption mt-8">La verifica esce dalla coda della segreteria e finisce fra i punti del medico, che apre direttamente su questo segmento audio. La segreteria non deve prendere decisioni cliniche.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rv-esc-ok">↗ Invia al medico</button>`);
  document.getElementById('rv-esc-ok').onclick = () => {
    i.status = 'escalated'; i.resolution = 'inviata al medico';
    RV.metrics.escalations++; rvLog('ESCALATED_TO_DOCTOR', i.id);
    closeModal(); toast('Inviata al medico · resta visibile nel riepilogo', true); rvAfterResolve(i);
  };
}
function rvWrongSource() {
  const i = rvIssue(); if (!i) return;
  rvLog('WRONG_ALIGNMENT', i.id);
  toast('Segnalato allineamento errato · usato per valutare la sincronizzazione');
}
function rvReopen() { const i = rvIssue(); if (!i) return; i.status = 'open'; i.resolution = null; rvRenderNav(); rvRenderReport(); rvRenderSource(); rvCount(); rvSave(); }
function rvAfterResolve(i) {
  rvSave(); rvRenderNav(); rvRenderReport(); rvCount();
  if (RV.autonext) setTimeout(() => { rvNext(); }, 250); else rvRenderSource();
}
function rvCount() {
  const el = document.getElementById('rv-left');
  if (el) { const n = rvOpen().length; el.textContent = n ? `${n} verifiche restanti` : 'Tutte le verifiche controllate'; }
}
function rvMode(m) { RV.mode = m; render(); }

/* ---------- tick: playhead, evidenziazione, auto-scroll ---------- */
function rvTick() {
  const ph = document.getElementById('rv-ph');
  if (ph) ph.style.left = (RV.t / RV_AUDIO.dur * 100).toFixed(2) + '%';
  const t = document.getElementById('rv-t'); if (t) t.textContent = fmt(RV.t);
  const pb = document.getElementById('rv-play');
  if (pb) pb.innerHTML = RV.playing ? `${ICONS.pause || ICONS.play} Pausa` : `${ICONS.play} Play`;
  const seg = rvSeg(RV.t);
  document.querySelectorAll('#rv-tr .tr').forEach(el => {
    const on = seg && el.dataset.seg === seg.id;
    el.classList.toggle('cur', !!on);
    if (on && seg.w) el.querySelectorAll('.wd').forEach((w, k) => {
      const start = +w.dataset.w; const next = seg.w[k + 1] ? seg.w[k + 1][0] : seg.e;
      w.classList.toggle('on', RV.t >= start && RV.t < next);
    });
  });
  if (RV.playing && !RV.detached) rvScrollTranscript(false);
}
function rvScrollTranscript(force) {
  const box = document.getElementById('rv-tr'); if (!box) return;
  const seg = rvSeg(RV.t) || RV_TRANSCRIPT.find(s => s.s >= RV.t);
  if (!seg) return;
  const el = box.querySelector(`[data-seg="${seg.id}"]`); if (!el) return;
  const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  if (force || Math.abs(box.scrollTop - target) > 24) box.scrollTo({ top: target, behavior: force ? 'smooth' : 'auto' });
  const f = document.getElementById('rv-follow'); if (f && !RV.detached) f.style.display = 'none';
}

/* ---------- fine revisione ---------- */
function rvFinish() {
  const block = rvBlocking();
  if (block.length) {
    openModal('Non puoi terminare la revisione', `
      <p>${block.length === 1 ? 'Resta una verifica obbligatoria' : `Restano ${block.length} verifiche obbligatorie`} non controllata:</p>
      <div class="list mt-8">${block.map(b => `<div class="list-item"><i class="dot danger"></i><div class="grow"><div class="name" style="font-size:13px">${esc(b.title)}</div><div class="sub">${RV_CAT[b.cat][0]}${b.ev ? ' · ' + fmt(b.ev.focus) : ''}</div></div></div>`).join('')}</div>
      <p class="caption mt-8">Puoi controllarla, oppure inviarla al medico con "Chiedi al medico": quello che non puoi fare è chiudere la revisione lasciandola invisibile.</p>`,
      `<button class="btn" data-close>Chiudi</button><button class="btn primary" id="rv-open-block">Apri la verifica</button>`);
    document.getElementById('rv-open-block').onclick = () => { closeModal(); rvGo(RV.issues.indexOf(block[0])); };
    return;
  }
  const mins = Math.max(1, Math.round((Date.now() - RV.metrics.started) / 60000));
  const esc_ = RV.issues.filter(i => i.status === 'escalated');
  const cats = {};
  RV.issues.filter(i => i.status === 'corrected').forEach(i => { const c = RV_CAT[i.cat][0]; cats[c] = (cats[c] || 0) + 1; });
  openModal('Revisione completata', `
    <div class="kv"><b>Verifiche</b><span>${rvDone()} di ${RV.issues.length} controllate</span><b>Correzioni</b><span>${RV.metrics.corrections}</span><b>Audio consultato</b><span>${RV.metrics.plays} volte</span><b>Durata</b><span>~ ${mins} min</span>${esc_.length ? `<b>Al medico</b><span>${esc_.length} punto/i</span>` : ''}</div>
    ${Object.keys(cats).length ? `<div class="mt-16"><div class="caption">Correzioni per categoria</div><div class="row wrap mt-8" style="gap:6px">${Object.entries(cats).map(([c, n]) => `<span class="badge">${c} ×${n}</span>`).join('')}</div></div>` : ''}
    <p class="caption mt-16">Il referto passa al medico come <b>v2 · segreteria</b>. Le versioni precedenti restano: la bozza AI non viene sovrascritta. ${esc_.length ? 'Il medico si apre direttamente sul punto lasciato in sospeso.' : ''}</p>`,
    `<button class="btn" data-close>Continua a rivedere</button><button class="btn primary" id="rv-finish-ok">Conferma e invia al medico</button>`);
  document.getElementById('rv-finish-ok').onclick = () => {
    rvLog('SECRETARY_REVIEW_COMPLETED', `${RV.metrics.corrections} correzioni`);
    localStorage.removeItem(RV_KEY);
    closeModal(); toast('Revisione confermata · v2 segreteria · in attesa del medico', true);
    go('#/reports');
  };
}

/* ---------- scorciatoie ---------- */
function rvCheat() {
  const M = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const A = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌥' : 'Alt';
  const rows = [
    ['Play / Pausa', 'Space'], ['Ascolta la fonte della frase', `${A} Space  ·  ${M} L`], ['Riascolta la verifica corrente', 'R'],
    ['Indietro / avanti 3 s', `${A} ←   ${A} →`], ['Indietro / avanti 10 s', `⇧${A} ←   ⇧${A} →`],
    ['Verifica successiva / precedente', `${M} J   ${M} K`], ['Conferma la verifica', `${M} Enter`],
    ['Prima / seconda / terza alternativa', '1  2  3'], ['Annulla', `${M} Z`], ['Salva', `${M} S`],
    ['Chiudi pannello o card', 'Esc'], ['Questo elenco', '?'], ['Ricerca globale (in revisione)', `${M} P`],
  ];
  openModal('Scorciatoie', `<div class="rv-keys">${rows.map(([l, k]) => `<div class="k"><span>${l}</span><kbd>${k}</kbd></div>`).join('')}</div>
    <p class="caption mt-16">In modalità revisione ${M} K passa alla verifica precedente invece di aprire la ricerca globale, che resta su ${M} P. Le combinazioni sono personalizzabili nelle preferenze: alcune (${M} L) possono essere intercettate dal browser, per questo la scorciatoia primaria per l'ascolto è ${A} Space.</p>`,
    `<button class="btn primary" data-close>Chiudi</button>`);
}
window.addEventListener('keydown', e => {
  if (state.route !== 'review') return;
  const mod = e.metaKey || e.ctrlKey;
  const typing = RV.editing || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (mod && e.key.toLowerCase() === 'j') { stop(); rvStep(1); }
  else if (mod && e.key.toLowerCase() === 'k') { stop(); rvStep(-1); }
  else if (mod && e.key === 'Enter') { stop(); rvVerified(); }
  else if (mod && e.key.toLowerCase() === 'l') { stop(); rvListen(); }
  else if (mod && e.key.toLowerCase() === 's') { stop(); rvSave(); toast('Salvato'); }
  else if (mod && e.key.toLowerCase() === 'z') { stop(); const u = RV.undo.pop(); if (u) { RV.text[u.span] = u.prev; rvRenderReport(); rvSave(); toast('Modifica annullata'); } }
  else if (e.altKey && e.code === 'Space') { stop(); rvListen(); }
  else if (e.altKey && e.key === 'ArrowLeft') { stop(); rvNudge(e.shiftKey ? -10 : -3); }
  else if (e.altKey && e.key === 'ArrowRight') { stop(); rvNudge(e.shiftKey ? 10 : 3); }
  else if (!typing && e.code === 'Space') { stop(); rvToggle(); }
  else if (!typing && e.key.toLowerCase() === 'r') { stop(); rvListen(); }
  else if (!typing && e.key === '?') { stop(); rvCheat(); }
  else if (!typing && ['1', '2', '3'].includes(e.key)) { stop(); rvChoose(+e.key - 1); }
  else if (e.key === 'Escape') { if (RV.playing) { stop(); rvPause(); } }
}, true);
