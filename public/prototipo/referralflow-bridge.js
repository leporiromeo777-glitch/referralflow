/* Ponte con la piattaforma ReferralFlow (13.9.2026).
   Quando il prototipo è servito dalla piattaforma (percorso /prototipo/),
   la coda dei referti e la Guided Review usano le BOZZE VERE della catena
   (API con la sessione del browser) e l'audio vero del dettato. Fuori dalla
   piattaforma non fa nulla: restano i dati finti. */
const RF = { live: false, queue: [], loaded: null, loading: null, meta: null, audioEl: null };
function rfDentro() { return /\/prototipo\//.test(location.pathname); }

async function rfCaricaCoda() {
  if (!rfDentro()) return;
  try {
    const r = await fetch('/api/prototipo/referti', { credentials: 'include' });
    if (!r.ok) return;
    const j = await r.json();
    RF.live = true; RF.queue = j.referti || [];
    RV_QUEUE.length = 0;
    for (const x of RF.queue) {
      const pid = 'rf-' + x.id;
      const pezzi = (x.paziente || 'Paziente non indicato').trim().split(/\s+/);
      const last = pezzi[0] || '—'; const first = pezzi.slice(1).join(' ') || '—';
      P[pid] = { id: pid, first, last, dob: x.nascita || '', num: '', age: '', sex: '', doctor: 'rf', flags: [], problems: [], meds: [], exams: [], docs: [], lastVisit: '', next: '' };
      const did = 'rf-' + (x.medico_id || 'medico');
      DOCTORS[did] = x.medico || 'Medico';
      RV_QUEUE.push({
        id: x.id, p: pid, doc: did,
        type: (x.tipo === 'visita' ? 'Visita' : x.formato === 'lettera' ? 'Lettera' : 'Rapporto') + (x.stato === 'confermata' ? ' · confermato' : ''),
        at: x.at, audio: x.audio, issues: x.issues, crit: x.crit, est: x.est, state: x.state, note: x.note, blocked: false,
      });
    }
    if (state.route === 'reports') render();
  } catch (e) { /* fuori dalla piattaforma o senza sessione: dati finti */ }
}

/* Coda: con i dati veri ogni riga apre la sua revisione (nel prototipo solo r1 era apribile). */
const rfReportsQueueOrig = reportsQueue;
reportsQueue = function () {
  if (!RF.live) return rfReportsQueueOrig();
  const sort = state.qSort || 'priority';
  const rank = { priority: 0, advised: 1, some: 2, clean: 3 };
  const list = [...RV_QUEUE].sort((a, b) => {
    if (sort === 'priority') return rank[a.state] - rank[b.state] || b.crit - a.crit;
    if (sort === 'time') return b.at.localeCompare(a.at);
    if (sort === 'doctor') return DOCTORS[a.doc].localeCompare(DOCTORS[b.doc]);
    return fullName(P[a.p]).localeCompare(fullName(P[b.p]));
  });
  const tot = RV_QUEUE.reduce((s, r) => s + r.issues, 0), crit = RV_QUEUE.reduce((s, r) => s + r.crit, 0);
  return `
    <div class="page-head"><div><h2 class="page-title">Referti da controllare</h2><div class="page-sub">${RV_QUEUE.length} referti dalla catena · ${tot} verifiche · ${crit} critiche · dati veri della piattaforma</div></div>
      <div class="actions"><div class="seg">${[['priority', 'Priorità'], ['time', 'Ora'], ['doctor', 'Medico'], ['patient', 'Paziente']].map(([k, l]) => `<button class="${sort === k ? 'active' : ''}" onclick="state.qSort='${k}';render()">${l}</button>`).join('')}</div></div></div>
    <div class="stack">
      ${list.map(r => {
        const st = RV_QSTATE[r.state];
        return `<div class="card q ${r.state}">
          <div class="row wrap" style="gap:12px">
            <div class="avatar-sm">${initials(P[r.p])}</div>
            <div class="grow" style="min-width:220px">
              <div class="row" style="gap:8px"><b>${fullName(P[r.p])}</b><span class="badge ${st[1]}">${st[0]}</span></div>
              <div class="caption">${DOCTORS[r.doc]} · ${r.type} · ${r.at}</div>
              <div class="sub" style="font-size:12.5px;color:var(--text-2);margin-top:2px">${r.note}</div>
            </div>
            <div class="qm"><span class="v num">${r.issues}</span><span class="l">verifiche</span></div>
            <div class="qm"><span class="v num ${r.crit ? 'crit' : ''}">${r.crit}</span><span class="l">critiche</span></div>
            <div class="qm"><span class="v num">${r.audio}</span><span class="l">audio</span></div>
            <div class="qm"><span class="v num">${r.est}</span><span class="l">stimati</span></div>
            <button class="btn ${r.state === 'priority' ? 'primary' : ''}" data-go="#/review/${r.id}">${r.state === 'clean' ? 'Lettura rapida' : 'Apri revisione'}</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="card mt-16"><div class="row wrap" style="gap:10px"><span class="badge ai">${ICONS.ai} AI</span><span class="caption">Ogni verifica viene dalla catena vera (motori discordi, correzioni, frasi non sostenute, numeri non confermati, omissioni, contraddizioni, doppioni). Le decisioni prese qui restano nel prototipo: quelle che contano si fanno nella piattaforma.</span></div></div>`;
};

/* Revisione: carica la bozza vera e la mette al posto dei dati finti (in place, stesse costanti). */
const rfReviewOrig = PAGES.review;
PAGES.review = () => {
  const id = state.params && state.params.id;
  if (!RF.live || !id || !/^[0-9a-f-]{36}$/.test(id)) return rfReviewOrig();
  if (RF.loaded !== id) {
    if (RF.loading !== id) { RF.loading = id; void rfCaricaRevisione(id); }
    return `<div class="page-head"><div><h2 class="page-title">Revisione guidata</h2><div class="page-sub">Carico la bozza dalla piattaforma…</div></div></div>`;
  }
  const m = RF.meta || {};
  const html = rfReviewOrig();
  const testata = `<div class="rv-pat">${ICONS.shield}<b>${m.paziente || 'Paziente non indicato'}</b><span>${m.nascita || ''}</span><span class="sep">·</span><span>${m.tipo === 'visita' ? 'Visita' : 'Referto'}</span><span class="sep">·</span><span>${m.medico || ''}</span><span class="sep">·</span><span>${RV_AUDIO.label}</span></div>`;
  return html.replace(/<div class="rv-pat">[\s\S]*?<\/div>/, testata);
};

async function rfCaricaRevisione(id) {
  try {
    const r = await fetch('/api/prototipo/referti/' + id, { credentials: 'include' });
    if (!r.ok) { RF.loading = null; toast('Bozza non disponibile'); go('#/reports'); return; }
    const j = await r.json();
    RV_AUDIO.dur = j.audio.dur; RV_AUDIO.label = j.audio.label;
    RV_TRANSCRIPT.length = 0; (j.transcript || []).forEach(s => RV_TRANSCRIPT.push(s));
    RV_MARKERS.length = 0; (j.markers || []).forEach(x => RV_MARKERS.push(x));
    RV_REPORT.length = 0; (j.report || []).forEach(s => RV_REPORT.push(s));
    RV_ISSUES.length = 0; (j.issues || []).forEach(i => RV_ISSUES.push(i));
    RF.meta = j; RF.loaded = id; RF.loading = null;
    localStorage.removeItem(RV_KEY);
    RV.issues = [];
    rfAudioSetup(j.audio.url);
    render();
  } catch (e) { RF.loading = null; toast('Bozza non disponibile'); }
}

/* Audio vero al posto dell'orologio simulato: stesse funzioni, stesso stato RV. */
function rfAudioSetup(url) {
  if (RF.audioEl) { RF.audioEl.pause(); RF.audioEl = null; }
  if (!url) return;
  const a = new Audio(url); a.preload = 'auto';
  a.addEventListener('timeupdate', () => {
    RV.t = a.currentTime;
    if (RV.stopAt != null && RV.t >= RV.stopAt) { a.pause(); RV.playing = false; RV.stopAt = null; }
    if (typeof rvTick === 'function') rvTick();
  });
  a.addEventListener('ended', () => { RV.playing = false; if (typeof rvTick === 'function') rvTick(); });
  a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration) && a.duration > 0) { RV_AUDIO.dur = a.duration; RV_AUDIO.label = fmt(a.duration); } });
  RF.audioEl = a;
}
const rfPlayOrig = rvPlay, rfPauseOrig = rvPause, rfSeekOrig = rvSeek;
rvPlay = function (from, to) {
  if (!RF.audioEl) return rfPlayOrig(from, to);
  if (typeof from === 'number') RV.t = Math.max(0, from);
  RV.stopAt = typeof to === 'number' ? to : null;
  RV.playing = true; RV.metrics.plays++; RV.detached = false;
  rvLog('AUDIO_PLAYED', fmt(RV.t) + (RV.stopAt ? ' → ' + fmt(RV.stopAt) : ''));
  RF.audioEl.playbackRate = RV.speed || 1;
  try { RF.audioEl.currentTime = RV.t; } catch (e) { /* metadati non ancora pronti */ }
  RF.audioEl.play().catch(() => { RV.playing = false; toast('Audio non riproducibile'); rvTick(); });
  rvTick();
};
rvPause = function () {
  if (!RF.audioEl) return rfPauseOrig();
  RF.audioEl.pause(); RV.playing = false; rvTick();
};
rvSeek = function (t, play) {
  if (!RF.audioEl) return rfSeekOrig(t, play);
  RV.t = Math.min(RV_AUDIO.dur, Math.max(0, t)); RV.detached = false;
  try { RF.audioEl.currentTime = RV.t; } catch (e) { /* ignora */ }
  if (play) rvPlay(RV.t, null); else rvTick();
};

window.addEventListener('load', () => { void rfCaricaCoda(); });
