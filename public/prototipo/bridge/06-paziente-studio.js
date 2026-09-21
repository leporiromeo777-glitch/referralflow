/* ---------- menu a pillola sul telefono: sparisce scorrendo in giù, torna in su ---------- */
(function () {
  const st = document.createElement('style');
  st.textContent = `
  @media (max-width: 767px) {
    .mobile-nav.rf-pill { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); border-radius: 999px; border: 1px solid var(--border-2); box-shadow: var(--shadow-2); padding: 6px 6px; justify-content: space-between; transition: transform .28s var(--ease), opacity .28s var(--ease); will-change: transform; }
    .mobile-nav.rf-pill button { padding: 4px 6px; min-width: 48px; border-radius: 999px; }
    .mobile-nav.rf-pill button.active { background: var(--accent-soft); }
    .mobile-nav.rf-pill svg { width: 20px; height: 20px; }
    .mobile-nav.rf-pill.rf-nascosta { transform: translateY(calc(100% + 28px)); opacity: 0; pointer-events: none; }
    .content { padding-bottom: 104px; overflow-x: hidden; }
    /* niente scorrimento laterale della pagina: ciò che è largo scorre dentro il suo riquadro */
    html, body, #app, .main { overflow-x: hidden; max-width: 100vw; }
    .content > .page, .content > .page > * { max-width: 100%; min-width: 0; }
    .card, .row, .grow, .stack, .list-item, .tl-item .b { min-width: 0; max-width: 100%; }
    .card.hero .row, .page-head .actions, .actions, .toolbar { flex-wrap: wrap; }
    .card.hero .num { font-size: 32px !important; }
    .grid-2, .grid-3, .grid-hero, .grid-main-side { grid-template-columns: minmax(0, 1fr); }
    .grid-4, .grid-5 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .cal, .board, .table-wrap, .tabs, .rf-brief { overflow-x: auto; max-width: 100%; }
    .cal { overflow: auto; }
    .btn.lg { white-space: normal; text-align: left; }
    .ai-msg { overflow-wrap: anywhere; }
    /* con la sezione AI aperta il menu a pillola sparisce */
    .mobile-nav.rf-pill.rf-ai { display: none; }
  }
  /* Revisione guidata su telefono e tablet stretto: il prototipo nascondeva
     la colonna delle segnalazioni (le correzioni) sotto i 1040 px. Qui la
     colonna sta SOPRA il testo, alta al massimo il 42% dello schermo e
     scorrevole; il dettaglio con l'audio resta il pannello che scorre da destra. */
  @media (max-width: 1040px) {
    .rv-grid, .rv-grid.no-src { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: auto minmax(0, 1fr); }
    .rv-nav { display: flex !important; max-height: 42vh; border-right: 0; border-bottom: 1px solid var(--border); }
    .rv-nav-body { -webkit-overflow-scrolling: touch; }
    .rv-src { position: fixed; right: 0; top: 0; bottom: 0; width: min(420px, 92vw); z-index: 40; box-shadow: var(--shadow-2); }
    .rv-top { flex-wrap: wrap; height: auto; min-height: 51px; padding: 6px 10px; gap: 6px; }
    .rv-doc { max-width: 100%; }
    .rv .content, .rv-doc-wrap { overflow-x: hidden; }
  }`;
  document.head.appendChild(st);
  let ultimo = 0, accumulato = 0;
  function aggancia() {
    const c = document.getElementById('content');
    if (!c || c.dataset.rfPillola) return;
    c.dataset.rfPillola = '1';
    c.addEventListener('scroll', () => {
      const nav = document.getElementById('mobilenav');
      if (!nav || !nav.classList.contains('rf-pill')) return;
      const y = c.scrollTop;
      const delta = y - ultimo;
      ultimo = y;
      if (y <= 8) { nav.classList.remove('rf-nascosta'); accumulato = 0; return; }
      accumulato = (delta > 0) === (accumulato > 0) ? accumulato + delta : delta;
      if (accumulato > 24) nav.classList.add('rf-nascosta');
      else if (accumulato < -12) nav.classList.remove('rf-nascosta');
    }, { passive: true });
  }
  window.addEventListener('load', aggancia);
  if (document.readyState !== 'loading') aggancia();
  // Si mostra di nuovo solo quando cambia la pagina (non a ogni ri-disegno:
  // l'orologio ridisegna spesso e azzerare la posizione invertiva il verso).
  let rottaMostrata = null;
  window.rfPillolaMostra = function () {
    if (rottaMostrata === state.route) return;
    rottaMostrata = state.route;
    const nav = document.getElementById('mobilenav'); if (nav) nav.classList.remove('rf-nascosta');
    const c = document.getElementById('content'); ultimo = c ? c.scrollTop : 0; accumulato = 0;
  };
})();
function rfMenuAltro(chiavi) {
  const voce = (k) => { const m = NAV_META[k] || [k, 'home']; return `<button class="rf-altro-voce ${state.route === k ? 'active' : ''}" data-altro="${k}">${ICONS[m[1]] || ''}<span>${rfEsc(m[0])}</span></button>`; };
  const corpo = rfNavGruppi(chiavi, voce).replace(/class="nav-group"/g, 'class="rf-altro-gruppo"') + `<div class="rf-altro-gruppo">Profilo</div>${voce('profile')}`;
  openSheet('Tutte le pagine', `<div class="rf-altro">${corpo}</div>`);
  document.querySelectorAll('#sheet [data-altro]').forEach(b => b.onclick = () => { closeSheet(); go('#/' + b.dataset.altro); });
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-altro { display: flex; flex-direction: column; gap: 2px; padding-bottom: 12px; }
.rf-altro-gruppo { font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); padding: 14px 6px 6px; }
.rf-altro-voce { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text); font-size: 15px; font-weight: 500; text-align: left; }
.rf-altro-voce svg { width: 20px; height: 20px; color: var(--text-2); }
.rf-altro-voce.active { background: var(--accent-soft); color: var(--accent-text); }
.rf-altro-voce.active svg { color: var(--accent-text); }
.mobile-nav.rf-pill button { min-width: 42px; }
`; document.head.appendChild(st); })();
const rfMobileNavOrig = renderMobileNav;
renderMobileNav = function () {
  if (!RF.live) return rfMobileNavOrig();
  const nav = document.getElementById('mobilenav');
  if (!nav) return;
  nav.classList.add('rf-pill');
  nav.classList.toggle('rf-ai', !!state.aiOpen);
  // Pillola: cinque voci fisse, l'AI e «Altro» (14.9.2026), che apre un
  // foglio con TUTTE le altre pagine del ruolo, a sezioni come la barra laterale.
  // Le voci nascoste dallo studio (Studio → moduli nascosti) sparivano dalla
  // barra laterale ma non da qui: sul telefono la pillola le mostrava lo
  // stesso. «Oggi», «Altro» e Cleo restano sempre.
  const nascosti = new Set(Array.isArray(RF.data.moduli_nascosti) ? RF.data.moduli_nascosti : []);
  const voci = [['home', 'Oggi', 'home'], ['agenda', 'Agenda', 'agenda'], ['patients', 'Pazienti', 'patients'], ['reports', 'Referti', 'reports'], ['dittafono', 'Dittafono', 'mic'], ['ai', 'Cleo', 'ai'], ['altro', 'Altro', 'moreV']]
    .filter(([k]) => k === 'home' || k === 'altro' || !nascosti.has(k));
  const fisse = new Set(voci.map(v => v[0]));
  const altre = (NAV[state.role] || []).filter(k => !fisse.has(k));
  const attiva = (k) => k === 'ai' ? (state.route === 'ai' || state.aiOpen) : k === 'altro' ? altre.includes(state.route) : (state.route === k || (k === 'patients' && ['patient', 'visit'].includes(state.route)) || (k === 'reports' && ['report', 'review'].includes(state.route)));
  nav.innerHTML = voci.map(([k, l, i]) => `<button class="${attiva(k) ? 'active' : ''}" data-mnav="${k}" aria-label="${l}">${ICONS[i] || ''}<span>${l}</span></button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.mnav;
    // Cleo porta alla SUA PAGINA, la stessa del computer: benvenuto, filo
    // della conversazione e i due modi «Domanda medica» e «Con la cartella».
    // Prima apriva il pannello laterale, che sul telefono è un foglio a tutto
    // schermo senza quei tasti: sembrava Cleo e non lo era.
    if (k === 'ai') { state.aiOpen = false; if (state.route === 'ai') { render(); } else { go('#/ai'); } return; }
    if (k === 'altro') { rfMenuAltro(altre); return; }
    go('#/' + k);
  });
  if (typeof window.rfPillolaMostra === 'function') window.rfPillolaMostra();
};


/* ---------- scheda paziente, sezione «Esami»: i file veri della cartella ---------- */
const rfPatientExamsOrig = patientExams;
patientExams = function (p) {
  if (!RF.live) return rfPatientExamsOrig(p);
  const esami = (p.exams || []);
  if (!esami.length) return `<div class="card"><div class="caption">Nessun esame in cartella. I documenti si caricano dalla scheda del paziente nella piattaforma; chiedi al bot «trova l'ECG di ${rfEsc(p.last)}» quando ci sono.</div></div>`;
  return `<div class="grid grid-3">${esami.map(e => `<div class="card"><div class="card-head"><span class="section-title">${rfEsc(e.t)}</span><span class="caption num">${e.d}</span></div><div class="row wrap" style="gap:6px;align-items:center"><span class="badge">${rfEsc(e.r)}</span><span class="caption">${rfEsc(e.filename || '')}</span></div><div class="row mt-8"><button class="btn sm" data-doc="${e.id}">Apri</button><a class="btn sm ghost" href="/api/documents/${e.id}" target="_blank" rel="noopener" title="Scarica il file">↓ Scarica</a><button class="btn sm ghost" data-ai="Riassumi ${rfEsc(e.t)} di ${rfEsc(p.last)}">✦ Chiedi all'AI</button></div></div>`).join('')}</div>`;
};


/* ---------- tasto «indietro» sul telefono (topbar e revisione a schermo pieno) ---------- */
(function () {
  const st = document.createElement('style');
  st.textContent = `
  .rf-indietro { display: none; border: 0; background: transparent; color: var(--text-2); width: 36px; height: 36px; border-radius: 50%; align-items: center; justify-content: center; flex: none; }
  .rf-indietro svg { width: 22px; height: 22px; }
  .rf-indietro:active { background: rgba(127,127,127,.12); }
  @media (max-width: 767px) { .rf-indietro { display: inline-flex; } .topbar .title { min-width: 0; } }`;
  document.head.appendChild(st);
})();
const RF_ICONA_INDIETRO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
/* Storia delle pagine viste dentro il prototipo: «indietro» torna alla
   precedente, mai fuori dall'app (login, piattaforma). */
const RF_STORIA = [];
function rfRicordaPagina() {
  const h = location.hash || '#/home';
  if (RF_STORIA[RF_STORIA.length - 1] !== h) { RF_STORIA.push(h); if (RF_STORIA.length > 50) RF_STORIA.shift(); }
}
function rfIndietro() {
  RF_STORIA.pop();
  const prec = RF_STORIA.pop();
  go(prec || '#/home');
}
function rfTastoIndietro() {
  if (state.route === 'home') return;
  const dove = document.querySelector('.rv-top') || document.querySelector('#topbar');
  if (!dove || dove.querySelector('.rf-indietro')) return;
  const b = document.createElement('button');
  b.className = 'rf-indietro'; b.title = 'Indietro'; b.setAttribute('aria-label', 'Indietro'); b.innerHTML = RF_ICONA_INDIETRO;
  b.onclick = (e) => { e.stopPropagation(); rfIndietro(); };
  dove.insertBefore(b, dove.firstChild);
}


/* ---------- scheda paziente: visite, referti, timeline e anagrafica VERI (niente demo) ---------- */
const rfVisitsOrig = patientVisits, rfReportsTabOrig = patientReports, rfTimelineOrig = patientTimeline, rfAdminOrig = patientAdmin;
function rfDataOrd(d) { const m = String(d || '').match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }
patientVisits = function (p) {
  if (!RF.live) return rfVisitsOrig(p);
  const v = [...(p.visits || [])].sort((a, b) => rfDataOrd(b.d).localeCompare(rfDataOrd(a.d)));
  if (!v.length) return `<div class="card"><div class="caption">Nessuna visita in agenda per questo paziente. L'agenda arriva dal robot MediOnline: il nome in agenda deve coincidere con cognome e nome della scheda.</div></div>`;
  return `<div class="card"><div class="tl">${v.map(x => `<div class="tl-item ${x.futura ? 'now' : 'done'}"><span class="time num">${x.d} ${x.ora}</span><div class="body"><div class="t">${rfEsc(x.motivo || 'Visita')}${x.futura ? ' <span class="badge">in programma</span>' : ''}</div><div class="s">${rfEsc(x.medico || '')}</div></div></div>`).join('')}</div></div>`;
};
patientReports = function (p) {
  if (!RF.live) return rfReportsTabOrig(p);
  const rs = REPORTS.filter(r => r.p === p.id).sort((a, b) => rfDataOrd(b.date).localeCompare(rfDataOrd(a.date)));
  return `<div class="card"><div class="card-head"><span class="section-title">Referti della catena</span></div><div class="list">${rs.map(r => `<div class="list-item clickable" data-go="#/review/${r.id}"><div class="grow"><div class="name">${rfEsc(r.type)} · ${r.date}</div><div class="sub">${rfEsc(DOCTORS[r.doc] || '')} · ${r.crit ? `${r.crit} critiche · ` : ''}${r.issues} verifiche</div></div><span class="badge ${r.status === 'APPROVED' ? 'success' : 'warning'}">${r.status === 'APPROVED' ? 'Confermato' : 'Da controllare'}</span></div>`).join('') || '<div class="caption">Nessun referto della catena per questo paziente.</div>'}</div></div>`;
};
patientTimeline = function (p) {
  if (!RF.live) return rfTimelineOrig(p);
  const ev = [];
  for (const r of (p.referrals || [])) ev.push({ d: r.at, t: `Referral: ${r.quesito || 'quesito non indicato'}`, s: `${r.medico || 'medico inviante non indicato'} · ${r.status || ''}`, go: null });
  for (const v of (p.visits || [])) ev.push({ d: v.d, t: `${v.futura ? 'Visita in programma' : 'Visita'}: ${v.motivo || ''}`, s: `${v.ora} · ${v.medico || ''}`, go: '#/agenda', k: v.futura ? 'now' : 'done' });
  for (const x of (p.docs || [])) ev.push({ d: x.d, t: `Documento: ${x.t}`, s: DOC_TYPE[x.k] || '', doc: x.id });
  for (const r of REPORTS.filter(r => r.p === p.id)) ev.push({ d: r.date, t: `Referto dettato: ${r.type}`, s: `${DOCTORS[r.doc] || ''} · ${r.status === 'APPROVED' ? 'confermato' : 'da controllare'}`, go: `#/review/${r.id}` });
  ev.sort((a, b) => rfDataOrd(b.d).localeCompare(rfDataOrd(a.d)));
  if (!ev.length) return `<div class="card"><div class="caption">Nessun evento in cartella per questo paziente.</div></div>`;
  let ultimo = '';
  return `<div class="card"><div class="tl">${ev.map(e => { const giorno = e.d !== ultimo ? `<div class="tl-day">${e.d}</div>` : ''; ultimo = e.d; return `${giorno}<div class="tl-item ${e.k || 'done'} ${e.go || e.doc ? 'clickable' : ''}" ${e.go ? `data-go="${e.go}"` : e.doc ? `data-doc="${e.doc}"` : ''}><div class="body"><div class="t">${rfEsc(e.t)}</div><div class="s">${rfEsc(e.s)}</div></div></div>`; }).join('')}</div></div>`;
};
patientAdmin = function (p) {
  if (!RF.live) return rfAdminOrig(p);
  return `<div class="grid grid-2"><div class="card"><div class="card-head"><span class="section-title">Anagrafica</span>${rfUuid(p.id) ? `<button class="btn sm ghost" onclick="rfPazienteModifica('${p.id}')">Modifica</button>` : ''}</div><div class="kv"><b>Nascita</b><span>${p.dob || '—'}${p.sex ? ` · ${p.sex}` : ''}</span><b>Telefono</b><span>${rfEsc(p.phone || '—')}</span><b>E-mail</b><span>${rfEsc(p.email || '—')}</span><b>Indirizzo</b><span>${rfEsc([p.via, [p.npa, p.localita].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—')}</span><b>AVS</b><span class="num">${rfEsc(p.avs || '—')}</span><b>Cassa malati</b><span>${rfEsc(p.assicurazione || '—')}</span><b>N. assicurato</b><span class="num">${rfEsc(p.n_assicurato || '—')}</span><b>Indicazione</b><span>${rfEsc(p.indicazione || '—')}</span><b>Medico inviante</b><span>${rfEsc(p.gp || '—')}</span></div></div><div class="card"><div class="card-head"><span class="section-title">Referral</span></div><div class="list">${(p.referrals || []).map(r => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(r.quesito || 'quesito non indicato')}</div><div class="sub">${r.at} · ${rfEsc(r.medico || '')} · ${rfEsc(r.status || '')}${r.urgenza === 'urgente' ? ' · <b>urgente</b>' : ''}</div></div></div>`).join('') || '<div class="caption">Nessuna referral.</div>'}</div></div></div>`;
};
// La pagina «visita» del prototipo è demo: dentro la piattaforma si apre la scheda del paziente.
if (typeof PAGES !== 'undefined' && PAGES.visit) {
  const rfVisitOrig = PAGES.visit;
  PAGES.visit = () => { if (!RF.live) return rfVisitOrig(); const id = state.params && state.params.id; setTimeout(() => go(id ? `#/patients/${id}` : '#/patients'), 0); return '<div class="page"><div class="caption">Apro la scheda…</div></div>'; };
}


/* ---------- anonimizzazione: stessa libreria della piattaforma, modello locale ---------- */
RF.anon = { stato: 'pronto', esito: null, errore: null, file: null, t0: 0 };
RF.anonStorico = null;

/* ---------- Anonimizzazione: si trascina, si vede, resta la traccia ---------- */
// Il documento non si conserva — né il testo né il nome del file: la pagina
// esiste proprio per non farli uscire. Quel che resta è una riga di registro
// (chi, quando, da dove, quanti segnaposto per tipo), perché sapere che cosa
// è stato fatto non richiede tenersi quello su cui è stato fatto.
(function () { const st = document.createElement('style'); st.textContent = `
.rf-drop { border:2px dashed var(--border-2); border-radius:var(--r-card,16px); background:var(--surface-2);
  padding:26px 20px; text-align:center; transition:.16s var(--ease); cursor:pointer; }
.rf-drop:hover { border-color:var(--accent); background:var(--accent-soft); }
.rf-drop.su { border-color:var(--accent); background:var(--accent-soft); transform:scale(1.005); }
.rf-drop .big { font-size:15px; font-weight:650; letter-spacing:-.01em; }
.rf-drop .sub { font-size:12.5px; color:var(--text-2); margin-top:4px; }
.rf-drop .tipi { font-size:11px; color:var(--text-3); margin-top:8px; }
.rf-drop svg { width:26px; height:26px; color:var(--text-3); margin-bottom:6px; }
.rf-file { display:flex; align-items:center; gap:9px; margin-top:12px; padding:9px 11px; border-radius:11px; background:var(--surface-3); font-size:12.5px; }
.rf-file b { font-weight:600; }
.rf-file .x { margin-left:auto; border:0; background:transparent; color:var(--text-3); cursor:pointer; font-size:15px; padding:2px 6px; border-radius:6px; }
.rf-file .x:hover { background:var(--surface); color:var(--text); }
.rf-anon-riga { display:grid; grid-template-columns:96px 84px minmax(0,1fr) auto; gap:10px; align-items:center;
  padding:8px 6px; border-top:1px solid var(--border); font-size:12.5px; }
.rf-anon-riga:first-child { border-top:0; }
.rf-anon-riga .q { color:var(--text-2); font-variant-numeric:tabular-nums; font-size:11.5px; }
.rf-anon-riga .n { font-weight:600; }
.rf-anon-riga .t { display:flex; flex-wrap:wrap; gap:4px; }
.rf-anon-riga .dx { color:var(--text-3); font-size:11px; white-space:nowrap; }
/* La classe «input» è pensata per una riga sola: un'area di testo va vestita a parte. */
#rf-anon-in, #rf-anon-out { width:100%; min-width:0; min-height:150px; padding:10px 12px; border-radius:var(--r-input);
  border:1px solid var(--border); background:var(--surface); font:inherit; font-size:13px; line-height:1.6; resize:vertical; }
#rf-anon-in:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
#rf-anon-out { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; background:var(--surface-2); }
`; document.head.appendChild(st); })();

async function rfCaricaAnon(rendi = true) {
  try {
    const r = await fetch('/api/prototipo/anonimizza', { credentials: 'include' });
    const j = r.ok ? await r.json() : {};
    RF.anonStorico = Array.isArray(j.storico) ? j.storico : [];
  } catch { RF.anonStorico = []; }
  if (rendi && state.route === 'anonymize') render();
}
function rfAnonDrop(e, el) {
  e.preventDefault();
  el.classList.remove('su');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) { RF.anon = { ...RF.anon, file: f, errore: null }; render(); return; }
  const t = e.dataTransfer && e.dataTransfer.getData('text');
  if (t) { const ta = document.getElementById('rf-anon-in'); if (ta) { ta.value = t; ta.focus(); } }
}
function rfAnonScegli() { const i = document.getElementById('rf-anon-file'); if (i) i.click(); }
function rfAnonFile(input) { const f = input.files && input.files[0]; if (f) { RF.anon = { ...RF.anon, file: f, errore: null }; render(); } }
function rfAnonTogliFile() { RF.anon = { ...RF.anon, file: null }; render(); }
/* Riscaricare uno dei cinque tenuti: è il testo anonimizzato, non l'originale. */
async function rfAnonRiscarica(id) {
  try {
    const r = await fetch(`/api/prototipo/anonimizza?id=${encodeURIComponent(id)}`, { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.testo) { toast(j.errore || 'Documento non disponibile'); void rfCaricaAnon(); return; }
    const d = new Date(j.created_at || Date.now());
    const nome = `anonimizzato-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.txt`;
    const url = URL.createObjectURL(new Blob([j.testo], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { toast('Piattaforma non raggiungibile'); }
}
function rfAnonPeso(n) { return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`; }
function rfAnonQuando(iso) {
  if (!iso) return '';
  const d = new Date(iso), o = new Date();
  const oggi = d.toDateString() === o.toDateString();
  const or = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return oggi ? `oggi ${or}` : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${or}`;
}
const RF_ANON_ORIGINE = { testo: 'incollato', pdf: 'PDF', docx: 'Word', file: 'file' };

const rfAnonOrig = PAGES.anonymize;
PAGES.anonymize = () => {
  if (!RF.live) return rfAnonOrig();
  const a = RF.anon;
  if (RF.anonStorico === null) void rfCaricaAnon(false);
  const evidenzia = (testo, sost) => {
    let out = rfEsc(testo);
    for (const s of [...sost].sort((x, y) => y.originale.length - x.originale.length)) {
      if (!s.originale) continue;
      out = out.split(rfEsc(s.originale)).join(`<mark class="rf-anon-mark" title="→ ${rfEsc(s.segnaposto)}">${rfEsc(s.originale)}</mark>`);
    }
    return out.replace(/\n/g, '<br>');
  };
  const tipi = (sost) => { const m = {}; for (const s of sost) { const k = String(s.segnaposto || '').replace(/[\[\]_\d]/g, '').trim() || 'altro'; m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((x, y) => y[1] - x[1]); };
  const storico = Array.isArray(RF.anonStorico) ? RF.anonStorico : [];
  const cartaStorico = `<div class="card"><div class="card-head"><span class="section-title">Storico</span><span class="badge count">${storico.length}</span></div>
    ${storico.length ? storico.slice(0, 25).map(x => `<div class="rf-anon-riga">
        <span class="q">${rfEsc(rfAnonQuando(x.created_at))}</span>
        <span class="n">${rfEsc(RF_ANON_ORIGINE[x.origine] || x.origine)}</span>
        <span class="t">${Object.entries(x.per_tipo || {}).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([k, n]) => `<span class="badge">${rfEsc(k)} · ${n}</span>`).join('') || '<span class="caption">nessun dato trovato</span>'}</span>
        <span class="dx">${x.caratteri} car.${x.da ? ` · ${rfEsc(x.da)}` : ''}${x.ha_testo ? `<button class="btn sm ghost" style="margin-left:8px" onclick="rfAnonRiscarica('${rfEsc(x.id)}')">Scarica</button>` : ''}</span>
      </div>`).join('') : '<div class="caption" style="padding:8px 6px">Ancora nessuna anonimizzazione.</div>'}
    <div class="caption mt-8" style="padding:0 6px">Degli <b>ultimi cinque</b> documenti si tiene il testo <b>anonimizzato</b>, così si può riscaricare senza rifare il lavoro; dal sesto in poi resta solo la riga. Non si conservano mai l'originale, il nome del file o la tabella dei segnaposto — quella è la chiave per tornare indietro.</div></div>`;

  if (a.esito) {
    return `
    <div class="page-head"><div><h2 class="page-title">Anonimizzazione documenti</h2><div class="page-sub">Toglie i dati identificativi da un testo clinico prima di mandarlo fuori</div></div>
      <div class="actions"><button class="btn" onclick="rfAnonNuovo()">Anonimizza un altro</button></div></div>
    <div class="card tight mb-16 row wrap" style="gap:10px">
      <span class="badge success">${ICONS.check || ''} ${a.esito.sostituzioni.length} sostituzioni</span>
      ${tipi(a.esito.sostituzioni).map(([k, n]) => `<span class="badge">${rfEsc(k)} · ${n}</span>`).join('')}
      ${a.esito.registro === false ? '<span class="badge warning">questa anonimizzazione non è finita nel registro</span>' : ''}
      <span class="caption">${rfEsc(a.esito.modello)} · ${(a.esito.ms / 1000).toFixed(1)} s</span>
      <span class="right row" style="gap:6px"><button class="btn sm" onclick="rfAnonCopia()">${ICONS.copy || ''} Copia</button><button class="btn sm" onclick="rfAnonScarica()">Scarica</button></span>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><span class="section-title">Originale con i rilevamenti</span></div><div class="anon-doc" style="white-space:normal;line-height:1.7">${evidenzia(a.esito.originale, a.esito.sostituzioni)}</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Anonimizzato</span><span class="caption">segnaposto</span></div><textarea class="input" id="rf-anon-out" rows="18" readonly style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.6">${rfEsc(a.esito.testo)}</textarea></div>
    </div>
    <div class="mt-16">${cartaStorico}</div>`;
  }

  return `
    <div class="page-head"><div><h2 class="page-title">Anonimizzazione documenti</h2><div class="page-sub">Toglie i dati identificativi da un testo clinico prima di mandarlo fuori. Il modello gira sul Mac dello studio: il documento non esce di qui.</div></div></div>
    <div class="grid grid-main-side">
      <div class="stack">
        <div class="card">
          <div class="rf-drop" id="rf-anon-drop" onclick="rfAnonScegli()"
            ondragover="event.preventDefault(); this.classList.add('su')"
            ondragleave="this.classList.remove('su')"
            ondrop="rfAnonDrop(event, this)">
            ${ICONS.upload || ICONS.file || ''}
            <div class="big">Trascina qui il documento</div>
            <div class="sub">oppure clicca per sceglierlo, o incolla il testo qui sotto</div>
            <div class="tipi">PDF con testo · Word .docx · .txt .md .csv .json .html — fino a 10 MB</div>
          </div>
          <input type="file" id="rf-anon-file" accept=".txt,.md,.csv,.json,.html,.htm,.pdf,.docx" style="display:none" onchange="rfAnonFile(this)">
          ${a.file ? `<div class="rf-file">${ICONS.file || ''}<b>${rfEsc(a.file.name)}</b><span class="caption">${rfAnonPeso(a.file.size)}</span><button class="x" onclick="rfAnonTogliFile()" title="Togli">✕</button></div>` : ''}
          <div class="field mt-16"><label>…oppure incolla il testo</label><textarea class="input" id="rf-anon-in" rows="10" placeholder="Incolla qui il referto, la lettera, il documento…" ${a.file ? 'disabled' : ''}></textarea></div>
          <div class="row mt-16" style="gap:10px;align-items:center">
            <button class="btn primary" id="rf-anon-via" onclick="rfAnonAvvia()" ${a.stato === 'lavora' ? 'disabled' : ''}>${ICONS.shield || ''} ${a.stato === 'lavora' ? 'Sto anonimizzando…' : 'Anonimizza'}</button>
            ${a.stato === 'lavora' ? '<span class="caption">il modello locale legge tutto il documento: su un referto lungo ci mette qualche secondo</span>' : ''}
          </div>
          ${a.stato === 'lavora' ? '<div class="rf-imp-track mt-16"><div class="rf-imp-fill" style="width:40%"></div></div>' : ''}
          ${a.errore ? `<div class="rf-manc mt-16">${rfEsc(a.errore)}</div>` : ''}
        </div>
        ${cartaStorico}
      </div>
      <div class="stack">
        <div class="card"><div class="section-title">Come funziona</div><div class="meta" style="line-height:1.7;font-size:13px;margin-top:6px">Il modello locale indica i dati identificativi, il <b>codice</b> li sostituisce con segnaposto — <code>[NOME_1]</code>, <code>[DATA_2]</code> — così il modello non può riscrivere il testo. Una rete di regole prende comunque AVS, e-mail e telefoni svizzeri anche se al modello sfuggono.</div></div>
        <div class="card"><div class="section-title">Che cosa NON fa</div><div class="meta" style="line-height:1.7;font-size:13px;margin-top:6px">Non anonimizza le scansioni: un PDF fotografato non ha testo da leggere. Non rende un documento <b>anonimo</b> a norma di legge — lo rende <b>pseudonimizzato</b>: chi ha la tabella dei segnaposto può tornare indietro, e nel dubbio vale come dato sanitario.</div></div>
        <div class="card"><div class="section-title">Dove finisce</div><div class="meta" style="line-height:1.7;font-size:13px;margin-top:6px">L'originale viene dimenticato appena finito. Del <b>testo anonimizzato</b> si tengono gli <b>ultimi cinque</b>, per poterli riscaricare dallo storico; dal sesto in poi resta solo la riga con data, origine e conteggi. Non si conservano mai il nome del file né la tabella dei segnaposto.</div></div>
      </div>
    </div>`;
};
async function rfAnonAvvia() {
  const ta = document.getElementById('rf-anon-in');
  const testo = ta ? ta.value.trim() : '';
  const file = RF.anon.file || null;            // trascinato o scelto: sta qui
  if (!testo && !file) { toast('Trascina un documento o incolla un testo'); return; }
  RF.anon = { stato: 'lavora', esito: null, errore: null, file, t0: Date.now() };
  render();
  try {
    const fd = new FormData();
    if (testo && !file) fd.append('testo', testo);
    if (file) fd.append('file', file);
    const r = await fetch('/api/prototipo/anonimizza', { method: 'POST', credentials: 'include', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      RF.anon = { stato: 'pronto', esito: null, errore: j.errore || 'Anonimizzazione non riuscita.', file };
      render();
      const t2 = document.getElementById('rf-anon-in');
      if (t2 && testo) t2.value = testo;        // quel che aveva incollato non si perde
      return;
    }
    RF.anon = { stato: 'pronto', esito: j, errore: null, file: null };
    render();
    void rfCaricaAnon();                        // lo storico ha una riga in più
  } catch {
    RF.anon = { stato: 'pronto', esito: null, errore: 'Piattaforma non raggiungibile.', file };
    render();
  }
}
function rfAnonNuovo() { RF.anon = { stato: 'pronto', esito: null, errore: null, file: null }; render(); }
function rfAnonCopia() { const t = RF.anon.esito ? RF.anon.esito.testo : ''; navigator.clipboard.writeText(t).then(() => toast('Testo anonimizzato copiato')).catch(() => toast('Copia non riuscita')); }
function rfAnonScarica() {
  const t = RF.anon.esito ? RF.anon.esito.testo : ''; if (!t) return;
  const blob = new Blob([t], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'anonimizzato.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
(function () { const st = document.createElement('style'); st.textContent = `.rf-anon-mark{background:var(--warning-soft,rgba(214,150,42,.25));border-radius:3px;padding:0 2px}`; document.head.appendChild(st); })();


/* ---------- pagina Studio: dati, personale, medici dell'agenda, sale, apparecchi ---------- */
RF.studio = { dati: null, scheda: 'personale', errore: null, ok: null };
if (typeof NAV_META !== 'undefined') NAV_META.administration = ['Studio', 'settings'];
async function rfStudioCarica(extra) {
  // «qualita» e «statistiche» costano, e si chiedono solo quando la loro
  // scheda è aperta; il resto viene sempre.
  try {
    const r = await fetch(`/api/prototipo/studio${extra ? `?extra=${extra}` : ''}`, { credentials: 'include', cache: 'no-store' });
    if (r.ok) { RF.studio.dati = Object.assign(RF.studio.dati || {}, await r.json()); RF.studio.errore = null; render(); }
    else { RF.studio.errore = `Non riesco a leggere i dati dello studio (${r.status}).`; render(); }
  } catch { RF.studio.errore = 'Piattaforma non raggiungibile.'; render(); }
}
async function rfStudioAzione(corpo) {
  RF.studio.errore = null; RF.studio.ok = null;
  try {
    const r = await fetch('/api/prototipo/studio', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.studio.errore = j.errore || 'Modifica non riuscita.'; render(); return false; }
    RF.studio.dati = Object.assign(RF.studio.dati || {}, j); RF.studio.ok = 'Salvato.'; render(); toast('Salvato'); void rfCaricaDati();
    return true;
  } catch { RF.studio.errore = 'Piattaforma non raggiungibile.'; render(); return false; }
}
function rfStudioCampo(sel) { const e = document.querySelector(sel); return e ? e.value : ''; }
const rfAdminPageOrig = PAGES.administration;
PAGES.administration = () => {
  if (!RF.live) return rfAdminPageOrig ? rfAdminPageOrig() : '';
  const d = RF.studio.dati;
  if (!d) {
    // Se la lettura fallisce si dice perché e si lascia un «Riprova»: prima
    // restava «Carico…» per sempre, con una richiesta nuova a ogni ridisegno.
    if (!RF.studio.errore) void rfStudioCarica();
    return `<div class="page-head"><div><h2 class="page-title">Studio</h2></div></div><div class="card">${RF.studio.errore
      ? `<div class="rf-manc">${rfEsc(RF.studio.errore)}</div><div class="row mt-16"><button class="btn" onclick="RF.studio.errore=null;render()">Riprova</button></div>`
      : '<div class="caption">Carico…</div>'}</div>`;
  }
  const admin = !!d.admin;
  const scheda = RF.studio.scheda;
  const tab = (k, l, n) => `<button class="tab ${scheda === k ? 'active' : ''}" onclick="RF.studio.scheda='${k}';render()">${l}${n != null ? ` <span class="badge">${n}</span>` : ''}</button>`;
  const ruoloIt = { medico: 'Medico', assistente: 'Aiuto medico', segretaria: 'Segreteria', admin: 'Amministrazione', tecnico: 'Tecnico' };
  const soloAdmin = admin ? '' : `<div class="caption mb-16">Solo l'amministratore dello studio può modificare: tu puoi consultare.</div>`;
  const avviso = `${RF.studio.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.studio.errore)}</div>` : ''}`;
  let corpo = '';
  if (scheda === 'studio') {
    const st = d.studio || {};
    corpo = `<div class="card"><div class="section-title">Dati dello studio</div>
      <div class="grid grid-2 mt-8">
        <div class="field"><label>Nome</label><input class="input" id="rf-st-nome" value="${rfEsc(st.nome || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Telefono</label><input class="input" id="rf-st-tel" value="${rfEsc(st.telefono || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Indirizzo (via, NPA e località)</label><input class="input" id="rf-st-indirizzo" value="${rfEsc(st.indirizzo || '')}" ${admin ? '' : 'disabled'} placeholder="Via …, 6900 Lugano"></div>
        <div class="field"><label>E-mail per gli avvisi</label><input class="input" id="rf-st-email" value="${rfEsc(st.notify_email || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Prestazioni offerte</label><input class="input" id="rf-st-spec" value="${rfEsc(st.specialita || '')}" ${admin ? '' : 'disabled'}></div>
      </div>
      <div class="section-title mt-16">Voci del menu che questo studio non usa</div>
      <div class="row wrap mt-8" style="gap:8px">${['prestazioni', 'invianti', 'percorsi', 'moduli', 'documents', 'imaging', 'dittafono', 'converti', 'anonymize', 'inbox', 'ai', 'fatturazione', 'statistics', 'communications', 'visits'].map(k => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="rf-mn" value="${k}" ${(RF.data.moduli_nascosti || []).includes(k) ? 'checked' : ''} ${admin ? '' : 'disabled'} style="margin:0 6px 0 0"> nascondi ${rfEsc((NAV_META[k] || [k])[0])}</label>`).join('')}</div>
      <div class="caption mt-8">Le voci nascoste spariscono dalla barra e dal menu del telefono per tutti i ruoli; Home e Studio restano sempre.</div>
      ${admin ? `<div class="row mt-16"><button class="btn primary" onclick="rfStudioAzione({ azione: 'studio_aggiorna', nome: rfStudioCampo('#rf-st-nome'), telefono: rfStudioCampo('#rf-st-tel'), notify_email: rfStudioCampo('#rf-st-email'), specialita: rfStudioCampo('#rf-st-spec'), indirizzo: rfStudioCampo('#rf-st-indirizzo') }).then(() => rfStudioAzione({ azione: 'moduli_nascosti', voci: [...document.querySelectorAll('.rf-mn:checked')].map(e => e.value) }))">Salva</button></div>` : ''}</div>`;
  } else if (scheda === 'personale') {
    corpo = `<div class="card"><div class="card-head"><span class="section-title">Accessi del personale</span><span class="caption">${d.personale.filter(u => u.attivo).length} attivi</span></div>
      <div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>E-mail</th><th>Ruolo</th><th>2FA</th><th>Stato</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
      ${d.personale.map(u => `<tr>
        <td><b>${rfEsc(u.email)}</b>${u.id === d.io ? ' <span class="caption">(tu)</span>' : ''}</td>
        <td>${admin && u.id !== d.io ? `<select class="input sm" onchange="rfStudioAzione({ azione: 'utente_ruolo', id: '${u.id}', ruolo: this.value })">${Object.entries(ruoloIt).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : rfEsc(ruoloIt[u.role] || u.role)}</td>
        <td>${u.totp ? '<span class="badge success">attiva</span>' : '<span class="caption">no</span>'}</td>
        <td>${u.attivo ? '<span class="badge success">attivo</span>' : '<span class="badge">disattivato</span>'}</td>
        ${admin ? `<td class="row" style="gap:6px;justify-content:flex-end">${u.id !== d.io ? `<button class="btn sm ghost" onclick="rfStudioPassword('${u.id}', '${rfEsc(u.email)}')">Nuova password</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'utente_attivo', id: '${u.id}' })">${u.attivo ? 'Disattiva' : 'Riattiva'}</button>` : ''}</td>` : ''}
      </tr>`).join('')}</tbody></table></div></div>
      ${admin ? `<div class="card mt-16"><div class="section-title">Nuovo accesso</div><div class="grid grid-3 mt-8">
        <div class="field"><label>E-mail</label><input class="input" id="rf-u-email" type="email" autocomplete="off"></div>
        <div class="field"><label>Password iniziale (min. 8)</label><input class="input" id="rf-u-pw" type="password" autocomplete="new-password"></div>
        <div class="field"><label>Ruolo</label><select class="input" id="rf-u-ruolo">${Object.entries(ruoloIt).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
        <div class="row mt-16" style="gap:10px;align-items:center"><button class="btn primary" onclick="rfStudioAzione({ azione: 'utente_crea', email: rfStudioCampo('#rf-u-email'), password: rfStudioCampo('#rf-u-pw'), ruolo: rfStudioCampo('#rf-u-ruolo') })">Crea l'accesso</button><span class="caption">La persona cambierà la password e potrà attivare la 2FA dal suo profilo. Gli accessi non si eliminano: si disattivano.</span></div></div>` : ''}`;
    corpo += `<div class="card mt-16"><div class="card-head"><span class="section-title">Personale senza accesso</span><span class="caption">aiuto medico, segreteria a ore: solo nome, ruolo, percentuale e colore</span></div>
      <div class="list">${(d.personale_senza_accesso || []).map(x => `<div class="list-item"><i class="dot" style="background:${rfEsc(x.colore || 'var(--text-3)')}"></i><div class="grow"><div class="name">${rfEsc(x.nome)}${x.attivo ? '' : ' <span class="badge">non più in servizio</span>'}</div><div class="sub">${rfEsc(x.ruolo)}${x.percentuale != null ? ` · ${x.percentuale} %` : ''}</div></div>${admin ? `<button class="btn sm ghost" onclick="rfStudioPersona('${x.id}')">Modifica</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'personale_attivo', id: '${x.id}' })">${x.attivo ? 'Non più in servizio' : 'Di nuovo in servizio'}</button>` : ''}</div>`).join('') || '<div class="caption">Nessuno.</div>'}</div>
      ${admin ? `<div class="grid grid-4 mt-16"><div class="field"><label>Nome</label><input class="input" id="rf-ps-nome"></div><div class="field"><label>Ruolo</label><input class="input" id="rf-ps-ruolo" list="rf-ps-ruoli" value="aiuto medico"><datalist id="rf-ps-ruoli"><option value="aiuto medico"><option value="segreteria"><option value="infermiere"><option value="tecnico"></datalist></div><div class="field"><label>%</label><input class="input" id="rf-ps-perc" type="number" min="0" max="100" style="max-width:90px"></div><div class="field"><label>Colore</label><input class="input" id="rf-ps-colore" type="color" value="#8a938e" style="height:36px;padding:2px 4px"></div></div><div class="row mt-8"><button class="btn primary" onclick="rfStudioAzione({ azione: 'personale_crea', nome: rfStudioCampo('#rf-ps-nome'), ruolo: rfStudioCampo('#rf-ps-ruolo'), percentuale: rfStudioCampo('#rf-ps-perc'), colore: rfStudioCampo('#rf-ps-colore') })">Aggiungi</button></div>` : ''}</div>`;
  } else if (scheda === 'medici') {
    corpo = `<div class="card"><div class="card-head"><span class="section-title">Medici dell'agenda</span><span class="caption">come compaiono nel robot MediOnline</span></div>
      <div class="list">${d.medici.map(m => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(m.nome)}${m.attivo ? '' : ' <span class="badge">disattivato</span>'}</div><div class="sub">${m.aliases && m.aliases.length ? 'anche: ' + rfEsc(m.aliases.join(', ')) : 'nessun alias'}${m.user_id ? ' · collegato a un accesso' : ''}</div></div>
        ${admin ? `<button class="btn sm ghost" onclick="rfStudioMedico('${m.id}')">Modifica</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'medico_attivo', id: '${m.id}' })">${m.attivo ? 'Disattiva' : 'Riattiva'}</button>` : ''}</div>`).join('') || '<div class="caption">Nessun medico in agenda.</div>'}</div></div>
      ${(d.codici_agenda || []).length ? `<div class="card mt-16"><div class="card-head"><span class="section-title">Codici dell'agenda senza medico</span><span class="caption">campo «luogo» del robot MediOnline, ultimi 60 giorni e futuro</span></div>
        <p class="meta" style="margin:0 0 10px">Per ogni codice: se è un medico, scegli quale e diventa un suo alias (gli appuntamenti si riabbinano subito); se è una sala o un apparecchio, registralo così l'agenda lo mostra come tale.</p>
        <div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Codice</th><th>Appuntamenti</th><th>Ultimo</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
        ${d.codici_agenda.map(c => `<tr><td><b>${rfEsc(c.codice)}</b>${c.risorsa ? ' <span class="badge">sala/apparecchio</span>' : ''}</td><td class="num">${c.n}</td><td class="num">${rfEsc(c.ultimo || '')}</td>
          ${admin ? `<td class="row" style="gap:6px;justify-content:flex-end;flex-wrap:wrap"><select class="input sm" id="rf-cod-${rfEsc(c.codice).replace(/[^a-z0-9]/gi, '_')}"><option value="">è un medico…</option>${d.medici.filter(m => m.attivo).map(m => `<option value="${m.id}">${rfEsc(m.nome)}</option>`).join('')}</select><button class="btn sm" onclick="(function(){ const sel = document.getElementById('rf-cod-${rfEsc(c.codice).replace(/[^a-z0-9]/gi, '_')}'); if (!sel.value) { toast('Scegli il medico'); return; } rfStudioAzione({ azione: 'codice_medico', codice: ${JSON.stringify(c.codice)}, provider_id: sel.value }); })()">Abbina</button>${c.risorsa ? '' : `<button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'codice_risorsa', codice: ${JSON.stringify(c.codice)}, tipo: 'sala' })">È una sala</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'codice_risorsa', codice: ${JSON.stringify(c.codice)}, tipo: 'apparecchio' })">È un apparecchio</button>`}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>` : ''}
      ${admin ? `<div class="card mt-16"><div class="section-title">Nuovo medico in agenda</div><div class="grid grid-2 mt-8"><div class="field"><label>Nome come in agenda</label><input class="input" id="rf-m-nome" placeholder="Dr. med. …"></div><div class="field"><label>Altri modi in cui compare (virgole)</label><input class="input" id="rf-m-alias"></div></div><div class="row mt-16"><button class="btn primary" onclick="rfStudioAzione({ azione: 'medico_crea', nome: rfStudioCampo('#rf-m-nome'), aliases: rfStudioCampo('#rf-m-alias') })">Aggiungi</button></div></div>` : ''}`;
  } else if (scheda === 'suggerimenti') {
    if (RF.sugg === null) { void rfCaricaSuggerimenti(); corpo = '<div class="card"><p class="meta" style="margin:0">Carico…</p></div>'; }
    else {
      const ST = { aperto: ['warning', 'aperto'], fatto: ['success', 'fatto'], no: ['', 'non previsto'] };
      corpo = `<div class="card"><div class="card-head"><span class="section-title">Suggerimenti di modifica</span><span class="caption">${RF.sugg.filter(x => x.stato === 'aperto').length} aperti</span></div>
        <p class="meta" style="margin:0 0 10px;line-height:1.5">Ciò che il personale chiede dal tasto «Suggerisci» nella barra. Lo sviluppatore riceve un avviso e legge qui; l'amministratore segna «fatto» o «non previsto» con una riga di risposta.</p>
        <div class="list">${RF.sugg.map(x => `<div class="list-item" style="align-items:flex-start"><i class="dot ${ST[x.stato][0]}"></i><div class="grow"><div class="name" style="font-size:13px;white-space:pre-wrap">${rfEsc(x.testo)}</div><div class="sub">${rfModQuando(x.created_at)}${x.da ? ` · ${rfEsc(x.da)}` : ''}${x.pagina ? ` · pagina ${rfEsc(x.pagina)}` : ''} · <span class="badge ${ST[x.stato][0]}">${ST[x.stato][1]}</span>${x.risposta ? ` · ${rfEsc(x.risposta)}` : ''}</div></div>${admin && x.stato === 'aperto' ? `<button class="btn sm" onclick="rfSuggStato('${x.id}', 'fatto')">Fatto</button><button class="btn sm ghost" onclick="rfSuggStato('${x.id}', 'no')">Non previsto</button>` : ''}</div>`).join('') || '<div class="caption">Nessun suggerimento.</div>'}</div></div>`;
    }
  } else if (scheda === 'prestazioni') {
    const cat = d.catalogo || []; const ET = { visita: 'Visita', esame: 'Esame', procedura: 'Procedura' };
    corpo = `<div class="card"><div class="card-head"><span class="section-title">Catalogo delle prestazioni</span><span class="caption">${cat.filter(x => x.attivo).length} attive</span></div>
      <p class="meta" style="margin:0 0 10px;line-height:1.5">Ogni voce ha un tipo, una durata standard, una sala predefinita e le <b>parole chiave</b> con cui la piattaforma la riconosce nel motivo degli appuntamenti dell'agenda MediOnline («eco», «ergo», «holter»…). Le prestazioni dei percorsi diventano voci con un clic.</p>
      <div class="list">${cat.map(x => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(x.nome)} <span class="badge">${ET[x.tipo] || x.tipo}</span>${x.attivo ? '' : ' <span class="badge">disattivata</span>'}</div><div class="sub">${x.durata_min}'${x.sala ? ` · ${rfEsc(x.sala)}` : ''}${x.parole_chiave.length ? ` · parole chiave: ${rfEsc(x.parole_chiave.join(', '))}` : ' · riconosciuta dal nome'}${x.codice_tariffa ? ` · posizione ${rfEsc(x.codice_tariffa)}` : ''}${x.colore ? ` · <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${rfEsc(x.colore)};vertical-align:middle"></span> colore agenda` : ''}</div></div>
        ${admin ? `<button class="btn sm ghost" onclick="rfStudioPrestazione('${x.id}')">Modifica</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'prestazione_attivo', id: '${x.id}' })">${x.attivo ? 'Disattiva' : 'Riattiva'}</button>` : ''}</div>`).join('') || '<div class="caption">Nessuna voce: aggiungine una o crea il catalogo dai percorsi.</div>'}</div></div>
      ${admin ? `<div class="card mt-16"><div class="section-title">Nuova prestazione</div><div class="grid grid-2 mt-8"><div class="field"><label>Nome</label><input class="input" id="rf-pr-nome" placeholder="Ecocardiogramma"></div><div class="field"><label>Tipo</label><select class="input" id="rf-pr-tipo"><option value="visita">Visita</option><option value="esame" selected>Esame</option><option value="procedura">Procedura</option></select></div><div class="field"><label>Durata standard (min)</label><input class="input" id="rf-pr-durata" type="number" min="5" max="480" value="30" style="max-width:120px"></div><div class="field"><label>Sala predefinita</label><input class="input" id="rf-pr-sala" list="rf-pr-sale" placeholder="—"><datalist id="rf-pr-sale">${(d.sale || []).map(r => `<option value="${rfEsc(r.nome)}">`).join('')}</datalist></div><div class="field"><label>Posizione tariffaria (TARDOC o forfait, come la registrate nella Cassa dei Medici)</label><input class="input" id="rf-pr-codice" placeholder="es. CA.10.0010"></div><div class="field"><label>Parole chiave (virgole) con cui compare nell'agenda</label><input class="input" id="rf-pr-parole" placeholder="eco, ecocardio, ett"></div></div>
        <div class="row mt-16" style="gap:8px"><button class="btn primary" onclick="rfStudioAzione({ azione: 'prestazione_crea', nome: rfStudioCampo('#rf-pr-nome'), tipo: rfStudioCampo('#rf-pr-tipo'), durata_min: rfStudioCampo('#rf-pr-durata'), sala: rfStudioCampo('#rf-pr-sala'), parole_chiave: rfStudioCampo('#rf-pr-parole'), codice_tariffa: rfStudioCampo('#rf-pr-codice') })">Aggiungi</button><button class="btn" onclick="rfStudioAzione({ azione: 'prestazioni_da_percorsi' })">${ICONS.flow} Crea dalle prestazioni dei percorsi</button></div></div>` : ''}`;
  } else {
    const tipo = scheda === 'sale' ? 'sala' : 'apparecchio';
    const lista = scheda === 'sale' ? d.sale : d.apparecchi;
    const titolo = scheda === 'sale' ? 'Sale' : 'Apparecchi';
    corpo = `<div class="card"><div class="card-head"><span class="section-title">${titolo}</span><span class="caption">${lista.filter(r => r.attivo).length} in uso</span></div>
      <div class="list">${lista.map(r => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(r.nome)}${r.tipo === 'sala' ? ` <span class="badge">${r.posti || 1} ${(r.posti || 1) === 1 ? 'posto' : 'posti'}</span>` : ''}${r.attivo ? '' : ' <span class="badge">fuori uso</span>'}</div><div class="sub">${rfEsc(r.descrizione || '')}</div></div>
        ${admin ? `<button class="btn sm ghost" onclick="rfStudioRisorsa('${r.id}')">Modifica</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'risorsa_attivo', id: '${r.id}' })">${r.attivo ? 'Fuori uso' : 'Rimetti in uso'}</button>` : ''}</div>`).join('') || `<div class="caption">Nessun${scheda === 'sale' ? 'a sala' : ' apparecchio'} registrat${scheda === 'sale' ? 'a' : 'o'}.</div>`}</div></div>
      ${admin ? `<div class="card mt-16"><div class="section-title">${scheda === 'sale' ? 'Nuova sala' : 'Nuovo apparecchio'}</div><div class="grid grid-2 mt-8"><div class="field"><label>Nome</label><input class="input" id="rf-r-nome" placeholder="${scheda === 'sale' ? 'Sala 1, Sala ECG…' : 'Ecografo, Holter 3, ergometro…'}"></div><div class="field"><label>Descrizione</label><input class="input" id="rf-r-desc" placeholder="${scheda === 'sale' ? 'piano, uso' : 'modello, matricola, scadenza manutenzione'}"></div>${scheda === 'sale' ? `<div class="field"><label>Posti (pazienti nello stesso momento)</label><input class="input" id="rf-r-posti" type="number" min="1" max="99" value="1" style="max-width:120px"></div>` : ''}</div><div class="row mt-16"><button class="btn primary" onclick="rfStudioAzione({ azione: 'risorsa_crea', tipo: '${tipo}', nome: rfStudioCampo('#rf-r-nome'), descrizione: rfStudioCampo('#rf-r-desc'), posti: rfStudioCampo('#rf-r-posti') || 1 })">Aggiungi</button></div></div>` : ''}`;
  }
  if (scheda === 'sicurezza') corpo = rfStudioSicurezza(d);
  if (scheda === 'qualita') corpo = rfStudioQualita(d);
  if (scheda === 'statistiche') corpo = rfStudioStatistiche(d);
  return `<div class="page-head"><div><h2 class="page-title">Studio</h2><div class="page-sub">${rfEsc((d.studio || {}).nome || '')} · personale, accesso, medici dell'agenda, sale, qualità della catena e numeri</div></div></div>
    <div class="tabs">${tab('studio', 'Dati')}${tab('personale', 'Personale', d.personale.length)}${tab('sicurezza', 'Il mio accesso')}${tab('medici', 'Medici agenda', d.medici.length)}${tab('prestazioni', 'Prestazioni', (d.catalogo || []).length)}${tab('sale', 'Sale', d.sale.length)}${tab('apparecchi', 'Apparecchi', d.apparecchi.length)}${tab('qualita', 'Qualità AI')}${tab('statistiche', 'Statistiche')}${tab('suggerimenti', 'Suggerimenti', (RF.sugg && RF.sugg.filter(x => x.stato === 'aperto').length) || 0)}</div>
    ${soloAdmin}${avviso}${corpo}`;
};
function rfStudioPassword(id, email) {
  openModal('Nuova password', `<p class="meta">Per <b>${rfEsc(email)}</b>. Comunicagliela a voce; la cambierà al primo accesso dal suo profilo.</p><div class="field mt-16"><label>Password (min. 8)</label><input class="input" id="rf-pw-nuova" type="password" autocomplete="new-password"></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pw-ok">Imposta</button>`);
  document.getElementById('rf-pw-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'utente_password', id, password: rfStudioCampo('#rf-pw-nuova') }); if (ok) closeModal(); };
}
function rfStudioMedico(id) {
  const m = (RF.studio.dati.medici || []).find(x => x.id === id); if (!m) return;
  const accessi = (RF.studio.dati.personale || []).filter(u => u.role === 'medico' || u.role === 'admin');
  openModal('Medico in agenda', `<div class="field"><label>Nome come in agenda</label><input class="input" id="rf-m-e-nome" value="${rfEsc(m.nome)}"></div><div class="field mt-8"><label>Altri modi in cui compare (virgole)</label><input class="input" id="rf-m-e-alias" value="${rfEsc((m.aliases || []).join(', '))}"></div><div class="field mt-8"><label>Accesso collegato</label><select class="input" id="rf-m-e-user"><option value="">nessuno</option>${accessi.map(u => `<option value="${u.id}" ${m.user_id === u.id ? 'selected' : ''}>${rfEsc(u.email)}</option>`).join('')}</select></div><div class="grid grid-3 mt-8"><div class="field"><label>GLN (13 cifre)</label><input class="input" id="rf-m-e-gln" inputmode="numeric" value="${rfEsc(m.gln || '')}"></div><div class="field"><label>RCC (numero concordato)</label><input class="input" id="rf-m-e-rcc" value="${rfEsc(m.rcc || '')}"></div><div class="field"><label>Colore in agenda</label><input class="input" id="rf-m-e-colore" type="color" value="${rfEsc(m.colore || '#0d5c48')}" style="height:36px;padding:2px 4px"></div></div><div class="grid grid-2 mt-8"><div class="field"><label>Ruolo</label><select class="input" id="rf-m-e-ruolo"><option value="medico" ${m.ruolo === 'collaboratore' ? '' : 'selected'}>Medico</option><option value="collaboratore" ${m.ruolo === 'collaboratore' ? 'selected' : ''}>Collaboratore</option></select></div><div class="field"><label>Professione</label><input class="input" id="rf-m-e-prof" value="${rfEsc(m.professione || '')}" placeholder="ecografista, dietista, fisioterapista…"></div></div><div class="caption mt-8">GLN e RCC entrano nel CSV di «Da fatturare» come medico erogante. Le prestazioni di un <b>collaboratore</b> non escono sotto il suo nome: si fatturano sotto chi le supervisiona, e quel nome la piattaforma non lo sa.</div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-m-ok">Salva</button>`);
  document.getElementById('rf-m-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'medico_aggiorna', id, nome: rfStudioCampo('#rf-m-e-nome'), aliases: rfStudioCampo('#rf-m-e-alias'), user_id: rfStudioCampo('#rf-m-e-user'), gln: rfStudioCampo('#rf-m-e-gln'), rcc: rfStudioCampo('#rf-m-e-rcc'), colore: rfStudioCampo('#rf-m-e-colore'), ruolo: rfStudioCampo('#rf-m-e-ruolo'), professione: rfStudioCampo('#rf-m-e-prof') }); if (ok) closeModal(); };
}
function rfStudioPersona(id) {
  const x = ((RF.studio.dati || {}).personale_senza_accesso || []).find(y => y.id === id); if (!x) return;
  openModal('Persona', `<div class="field"><label>Nome</label><input class="input" id="rf-ps-e-nome" value="${rfEsc(x.nome)}"></div><div class="grid grid-3 mt-8"><div class="field"><label>Ruolo</label><input class="input" id="rf-ps-e-ruolo" value="${rfEsc(x.ruolo)}"></div><div class="field"><label>%</label><input class="input" id="rf-ps-e-perc" type="number" min="0" max="100" value="${x.percentuale ?? ''}"></div><div class="field"><label>Colore</label><input class="input" id="rf-ps-e-colore" type="color" value="${rfEsc(x.colore || '#8a938e')}" style="height:36px;padding:2px 4px"></div></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-ps-ok">Salva</button>`);
  document.getElementById('rf-ps-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'personale_aggiorna', id, nome: rfStudioCampo('#rf-ps-e-nome'), ruolo: rfStudioCampo('#rf-ps-e-ruolo'), percentuale: rfStudioCampo('#rf-ps-e-perc'), colore: rfStudioCampo('#rf-ps-e-colore') }); if (ok) closeModal(); };
}
function rfStudioPrestazione(id) {
  const x = ((RF.studio.dati || {}).catalogo || []).find(y => y.id === id); if (!x) return;
  openModal('Prestazione', `<div class="field"><label>Nome</label><input class="input" id="rf-pr-e-nome" value="${rfEsc(x.nome)}"></div><div class="grid grid-2 mt-8"><div class="field"><label>Tipo</label><select class="input" id="rf-pr-e-tipo">${['visita', 'esame', 'procedura'].map(t => `<option value="${t}" ${x.tipo === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div><div class="field"><label>Durata (min)</label><input class="input" id="rf-pr-e-durata" type="number" min="5" max="480" value="${x.durata_min}"></div></div><div class="field mt-8"><label>Sala predefinita</label><input class="input" id="rf-pr-e-sala" value="${rfEsc(x.sala || '')}"></div><div class="field mt-8"><label>Parole chiave (virgole)</label><input class="input" id="rf-pr-e-parole" value="${rfEsc(x.parole_chiave.join(', '))}"></div><div class="field mt-8"><label>Posizione tariffaria (Cassa dei Medici)</label><input class="input" id="rf-pr-e-codice" value="${rfEsc(x.codice_tariffa || '')}" placeholder="es. CA.10.0010"></div><div class="grid grid-2 mt-8"><div class="field"><label>Colore nell'agenda MediOnline</label><input class="input" id="rf-pr-e-colore" type="color" value="${rfEsc(x.colore || '#0d5c48')}" style="height:36px;padding:2px 4px"></div><div class="field"><label>&nbsp;</label><label class="row" style="gap:8px;align-items:center;height:36px"><input type="checkbox" id="rf-pr-e-senza" ${x.colore ? '' : 'checked'}><span class="caption">nessun colore</span></label></div></div><div class="caption mt-8">Il colore è il modo in cui un appuntamento dell'agenda diventa questa prestazione — e quindi prende la sua durata. Un colore solo per prestazione.</div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pr-ok">Salva</button>`);
  document.getElementById('rf-pr-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'prestazione_aggiorna', id, nome: rfStudioCampo('#rf-pr-e-nome'), tipo: rfStudioCampo('#rf-pr-e-tipo'), durata_min: rfStudioCampo('#rf-pr-e-durata'), sala: rfStudioCampo('#rf-pr-e-sala'), parole_chiave: rfStudioCampo('#rf-pr-e-parole'), codice_tariffa: rfStudioCampo('#rf-pr-e-codice'), colore: (document.getElementById('rf-pr-e-senza') || {}).checked ? '' : rfStudioCampo('#rf-pr-e-colore') }); if (ok) closeModal(); };
}
function rfStudioRisorsa(id) {
  const r = [...(RF.studio.dati.sale || []), ...(RF.studio.dati.apparecchi || [])].find(x => x.id === id); if (!r) return;
  openModal(r.tipo === 'sala' ? 'Sala' : 'Apparecchio', `<div class="field"><label>Nome</label><input class="input" id="rf-r-e-nome" value="${rfEsc(r.nome)}"></div><div class="field mt-8"><label>Descrizione</label><input class="input" id="rf-r-e-desc" value="${rfEsc(r.descrizione || '')}"></div>${r.tipo === 'sala' ? `<div class="field mt-8"><label>Posti (pazienti nello stesso momento)</label><input class="input" id="rf-r-e-posti" type="number" min="1" max="99" value="${r.posti || 1}" style="max-width:120px"></div>` : ''}`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-r-ok">Salva</button>`);
  document.getElementById('rf-r-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'risorsa_aggiorna', id, nome: rfStudioCampo('#rf-r-e-nome'), descrizione: rfStudioCampo('#rf-r-e-desc'), posti: r.tipo === 'sala' ? (rfStudioCampo('#rf-r-e-posti') || 1) : 1 }); if (ok) closeModal(); };
}


/* ---------- profilo: la propria password e la 2FA ---------- */
RF.profilo = { dati: null, errore: null, codici: null };
async function rfProfiloCarica() {
  try {
    const r = await fetch('/api/prototipo/profilo', { credentials: 'include' });
    if (r.ok) { RF.profilo.dati = await r.json(); RF.profilo.errore = null; render(); }
    else { RF.profilo.errore = `Non riesco a leggere il tuo profilo (${r.status}).`; render(); }
  } catch { RF.profilo.errore = 'Piattaforma non raggiungibile.'; render(); }
}
async function rfProfiloAzione(corpo) {
  RF.profilo.errore = null;
  try {
    const r = await fetch('/api/prototipo/profilo', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.profilo.errore = j.errore || 'Non riuscito.'; render(); return false; }
    RF.profilo.dati = j; if (j.codici_recupero) RF.profilo.codici = j.codici_recupero; if (j.messaggio) toast(j.messaggio);
    render(); return true;
  } catch { RF.profilo.errore = 'Piattaforma non raggiungibile.'; render(); return false; }
}
const rfProfileOrig = PAGES.profile;
PAGES.profile = () => {
  if (!RF.live) return rfProfileOrig ? rfProfileOrig() : '';
  const d = RF.profilo.dati;
  if (!d) {
    if (!RF.profilo.errore) void rfProfiloCarica();
    return `<div class="page-head"><div><h2 class="page-title">Profilo</h2></div></div><div class="card">${RF.profilo.errore
      ? `<div class="rf-manc">${rfEsc(RF.profilo.errore)}</div><div class="row mt-16"><button class="btn" onclick="RF.profilo.errore=null;render()">Riprova</button></div>`
      : '<div class="caption">Carico…</div>'}</div>`;
  }
  const ruoloIt = { medico: 'Medico', assistente: 'Aiuto medico', segretaria: 'Segreteria', admin: 'Amministrazione', tecnico: 'Tecnico' };
  const err = RF.profilo.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.profilo.errore)}</div>` : '';
  let due = '';
  if (RF.profilo.codici) {
    due = `<div class="card"><div class="section-title">Codici di recupero</div><p class="meta">Salvali ora in un posto sicuro: <b>si vedono una volta sola</b>. Ognuno vale un accesso, se perdi il telefono.</p>
      <div class="rf-codici">${RF.profilo.codici.map(c => `<code>${rfEsc(c)}</code>`).join('')}</div>
      <div class="row mt-16" style="gap:8px"><button class="btn" onclick="navigator.clipboard.writeText(RF.profilo.codici.join('\\n')).then(() => toast('Codici copiati'))">Copia</button><button class="btn primary" onclick="rfProfiloAzione({ azione: '2fa_fine' }).then(ok => { if (ok) { RF.profilo.codici = null; render(); toast('2FA attiva'); } })">Li ho salvati: attiva la 2FA</button></div></div>`;
  } else if (d.totp_attiva) {
    due = `<div class="card"><div class="card-head"><span class="section-title">Verifica in due passaggi</span><span class="badge success">attiva</span></div><p class="meta">All'accesso, dopo la password, serve il codice dell'app di autenticazione. Codici di recupero rimasti: <b>${d.codici_recupero_rimasti}</b>.</p>
      <div class="field mt-16"><label>Per disattivarla, un codice valido (app o recupero)</label><input class="input" id="rf-2fa-off" inputmode="numeric" autocomplete="one-time-code" style="max-width:220px"></div>
      <div class="row mt-8"><button class="btn ghost" onclick="rfProfiloAzione({ azione: '2fa_disattiva', codice: rfStudioCampo('#rf-2fa-off') }).then(ok => ok && toast('2FA disattivata'))">Disattiva la 2FA</button></div></div>`;
  } else if (d.setup_in_corso) {
    due = `<div class="card"><div class="card-head"><span class="section-title">Attiva la verifica in due passaggi</span><span class="badge warning">configurazione in corso</span></div>
      <div class="grid grid-2 mt-8"><div><p class="meta">1. Apri l'app di autenticazione (Google Authenticator, Microsoft Authenticator, 1Password…) e inquadra il codice.</p>${d.qr ? `<img src="${d.qr}" alt="QR" style="width:220px;height:220px;border-radius:12px;border:1px solid var(--border)">` : ''}<p class="caption mt-8">Oppure inserisci a mano: <code>${rfEsc(d.segreto || '')}</code></p></div>
      <div><p class="meta">2. Scrivi qui il codice a sei cifre che l'app mostra ora.</p><div class="field mt-8"><label>Codice</label><input class="input" id="rf-2fa-codice" inputmode="numeric" autocomplete="one-time-code" style="max-width:220px"></div>
      <div class="row mt-16" style="gap:8px"><button class="btn primary" onclick="rfProfiloAzione({ azione: '2fa_conferma', codice: rfStudioCampo('#rf-2fa-codice') })">Conferma</button><button class="btn ghost" onclick="rfProfiloAzione({ azione: '2fa_annulla' })">Annulla</button></div></div></div></div>`;
  } else {
    due = `<div class="card"><div class="card-head"><span class="section-title">Verifica in due passaggi</span><span class="badge">non attiva</span></div><p class="meta">Con la 2FA, oltre alla password serve un codice dal telefono: consigliata per chi accede ai dati dei pazienti.</p><div class="row mt-16"><button class="btn primary" onclick="rfProfiloAzione({ azione: '2fa_avvia' })">Attiva la 2FA</button></div></div>`;
  }
  return `<div class="page-head"><div><h2 class="page-title">Profilo</h2><div class="page-sub">${rfEsc(d.email)} · ${rfEsc(ruoloIt[d.ruolo] || d.ruolo)}</div></div></div>
    ${err}
    <div class="grid grid-2">
      <div class="card"><div class="section-title">Cambia la password</div>
        <div class="field mt-8"><label>Password attuale</label><input class="input" id="rf-pw-att" type="password" autocomplete="current-password"></div>
        <div class="field mt-8"><label>Nuova password (min. 8)</label><input class="input" id="rf-pw-nuo" type="password" autocomplete="new-password"></div>
        <div class="field mt-8"><label>Ripeti la nuova password</label><input class="input" id="rf-pw-rip" type="password" autocomplete="new-password"></div>
        <div class="row mt-16"><button class="btn primary" onclick="(function(){ const a = rfStudioCampo('#rf-pw-nuo'), b = rfStudioCampo('#rf-pw-rip'); if (a !== b) { toast('Le due password non coincidono'); return; } rfProfiloAzione({ azione: 'password', attuale: rfStudioCampo('#rf-pw-att'), nuova: a }); })()">Cambia</button></div></div>
      ${due}
    </div>`;
};
(function () { const st = document.createElement('style'); st.textContent = `.rf-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.rf-week-col{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);min-height:200px;padding:6px}.rf-week-col.oggi{border-color:var(--accent)}.rf-week-head{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-2);padding:4px 6px 8px;border-bottom:1px solid var(--border);margin-bottom:6px}.rf-week-item{border-left:3px solid var(--border-2);padding:5px 8px;margin:4px 0;border-radius:4px;background:var(--surface-2);font-size:12.5px;cursor:pointer;line-height:1.3}.rf-week-item.done{opacity:.6}.rf-week-item:hover{background:var(--accent-soft)}@media (max-width:1199px){.rf-week{grid-template-columns:repeat(4,1fr)}}@media (max-width:767px){.rf-week{grid-template-columns:1fr}.rf-week-col{min-height:0}}.appt.rf-over{border-left-color:var(--danger);background:var(--danger-soft)}.rf-codici{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:10px}.rf-codici code{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:13px;letter-spacing:.04em}`; document.head.appendChild(st); })();


