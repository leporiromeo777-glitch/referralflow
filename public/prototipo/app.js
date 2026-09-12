// ReferralFlow prototype — core: state, router, shell, palette, AI panel, sheet, modal, toast
const state = {
  role: 'doctor', route: 'home', params: {}, theme: localStorage.getItem('rf-theme') || 'system',
  aiOpen: false, sidebarCollapsed: false, patientCtx: null, visitMode: false, aiMessages: [], aiState: 'idle',
  aiRunning: 2, reportChoice: null, proposalsDone: false,
};
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Theme ---------- */
function applyTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const dark = state.theme === 'dark' || (state.theme === 'system' && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('meta[name=theme-color]').setAttribute('content', dark ? '#0B0B0D' : '#F5F5F7');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
function setTheme(t) { state.theme = t; localStorage.setItem('rf-theme', t); applyTheme(); renderTopbar(); }

/* ---------- Navigation ---------- */
const NAV = {
  secretary: ['home', 'agenda', 'patients', 'reports', 'dittafono', 'documents', 'anonymize', 'communications', 'inbox', 'ai', 'statistics', 'administration'],
  assistant: ['home', 'agenda', 'patients', 'visits', 'dittafono', 'documents', 'communications', 'inbox', 'ai', 'statistics'],
  doctor: ['home', 'agenda', 'patients', 'visits', 'dittafono', 'reports', 'documents', 'anonymize', 'communications', 'inbox', 'ai', 'statistics'],
  org_admin: ['home', 'agenda', 'patients', 'reports', 'dittafono', 'documents', 'anonymize', 'communications', 'inbox', 'ai', 'statistics', 'administration', 'system'],
  tech_admin: ['home', 'inbox', 'ai', 'statistics', 'system'],
};
const NAV_META = {
  home: ['Home', 'home'], agenda: ['Agenda', 'agenda'], patients: ['Pazienti', 'patients'], visits: ['Visite', 'visits'], reports: ['Referti', 'reports'],
  documents: ['Documenti', 'documents'], communications: ['Comunicazioni', 'comms'], inbox: ['Attività', 'tasks'], ai: ['AI', 'ai'], statistics: ['Statistiche', 'stats'],
  administration: ['Amministrazione', 'admin'], system: ['Sistema', 'system'], profile: ['Profilo', 'profile'], settings: ['Impostazioni', 'settings'],
  patient: ['Paziente', 'patients'], visit: ['Visita', 'visits'], report: ['Referto', 'reports'], review: ['Revisione guidata', 'reports'], knowledge: ['Knowledge', 'book'], tasks: ['Task', 'tasks'],
  dittafono: ['Dittafono', 'mic'], anonymize: ['Anonimizzazione', 'shield'],
};
const BADGES = () => ({ inbox: state.role === 'tech_admin' ? 1 : (state.role === 'doctor' ? 4 : 6), reports: state.role === 'doctor' ? 2 : (state.role === 'secretary' ? 1 : 0), documents: 3, ai: typeof kpPending === 'function' ? kpPending() : 0 });

function go(hash) { location.hash = hash; }
function parseHash() {
  const h = (location.hash || '#/home').replace(/^#\//, '');
  const parts = h.split('/').filter(Boolean);
  const route = parts[0] || 'home';
  const params = {};
  if (route === 'patients' && parts[1]) { params.id = parts[1]; params.tab = parts[2] || 'overview'; return { route: 'patient', params }; }
  if (route === 'visit') { params.id = parts[1]; return { route: 'visit', params }; }
  if (route === 'review') { params.id = parts[1] || 'r1'; return { route: 'review', params }; }
  if (route === 'reports' && parts[1]) { params.id = parts[1]; return { route: 'report', params }; }
  if (route === 'system') { params.tab = parts[1] || 'overview'; return { route: 'system', params }; }
  if (route === 'ai') { params.tab = parts[1] || 'history'; return { route: 'ai', params }; }
  if (route === 'administration') { params.tab = parts[1] || 'invoices'; return { route: 'administration', params }; }
  if (route === 'inbox') { params.tab = parts[1] || 'inbox'; return { route: 'inbox', params }; }
  return { route, params };
}
function onRoute() {
  const r = parseHash();
  state.route = r.route; state.params = r.params;
  state.visitMode = r.route === 'visit';
  state.reviewMode = r.route === 'review';
  if (r.route === 'review') state.patientCtx = 'p1';
  else if (r.route === 'patient' || r.route === 'visit') state.patientCtx = r.params.id;
  else if (r.route === 'report') state.patientCtx = (REPORTS.find(x => x.id === r.params.id) || {}).p || null;
  else state.patientCtx = null;
  if (!state.visitMode) closeSheet();
  // context reset for AI when patient changes
  if (state.aiCtxPatient !== state.patientCtx) { state.aiMessages = []; state.aiCtxPatient = state.patientCtx; }
  render();
}
window.addEventListener('hashchange', onRoute);

/* ---------- Shell ---------- */
function render() {
  const app = $('#app');
  app.classList.toggle('with-ai', state.aiOpen);
  app.classList.toggle('sidebar-collapsed', state.sidebarCollapsed || (typeof DV !== 'undefined' && DV.open && state.aiOpen)); // con documento + AI aperti la barra laterale si comprime da sola
  app.classList.toggle('visit-mode', state.visitMode);
  app.classList.toggle('review-mode', state.reviewMode);
  app.classList.toggle('with-doc', typeof DV !== 'undefined' && DV.open);
  renderSidebar(); renderTopbar(); renderSafetyBar(); renderStatusbar(); renderMobileNav(); renderAIPanel();
  if (typeof renderDocViewer === 'function') renderDocViewer();
  const page = PAGES[state.route] || PAGES.home;
  $('#content').innerHTML = `<div class="page">${page()}</div>`;
  $('#content').scrollTop = 0;
  bindCommon($('#content'));
  if (typeof ainBind === 'function') ainBind($('#content'));
  if (typeof anonBind === 'function') anonBind($('#content'));
}
function renderSidebar() {
  const items = NAV[state.role];
  const badges = BADGES();
  const item = (key) => {
    const [label, icon] = NAV_META[key];
    const active = state.route === key || (key === 'patients' && ['patient', 'visit'].includes(state.route)) || (key === 'reports' && state.route === 'report') || (key === 'inbox' && state.route === 'tasks') || (key === 'ai' && state.route === 'knowledge');
    const b = badges[key] ? `<span class="badge count">${badges[key]}</span>` : '';
    return `<button class="nav-item ${active ? 'active' : ''}" data-go="#/${key}" title="${label}">${ICONS[icon]}<span>${label}</span>${b}</button>`;
  };
  $('#sidebar').innerHTML = `
    <div class="brand">${BRAND_MARK}<div><div class="brand-name">ReferralFlow</div><div class="brand-sub">Studio Cardiologico Lugano</div></div></div>
    ${typeof navcRender === 'function' ? navcRender(item, badges) : `<nav class="nav">${items.map(item).join('')}</nav>`}
    <div class="bottom">
      <div class="nav-sep"></div>
      <nav class="nav">${['profile', 'settings'].map(item).join('')}
        <button class="nav-item" id="collapse-btn" title="Comprimi barra laterale">${ICONS.panel}<span>Comprimi</span></button>
      </nav>
      <div class="sysbar"><span class="status"><i class="dot success"></i><span>Server</span></span><span class="status"><i class="dot success"></i><span>AI</span></span><span class="status"><i class="dot success"></i><span>Backup ✓</span></span></div>
    </div>`;
  $('#collapse-btn').onclick = () => { state.sidebarCollapsed = !state.sidebarCollapsed; render(); };
  if (typeof navcBind === 'function') navcBind($('#sidebar'));
  bindCommon($('#sidebar'));
}
function pageTitle() {
  const r = state.route;
  if (r === 'patient') return `<span class="crumb">Pazienti</span>${ICONS.chevR}<span>${esc(fullName(P[state.params.id]))}</span>`;
  if (r === 'report') return `<span class="crumb">Referti</span>${ICONS.chevR}<span>${esc(fullName(P[(REPORTS.find(x => x.id === state.params.id) || REPORTS[0]).p]))}</span>`;
  if (r === 'system') return `<span class="crumb">Sistema</span>${ICONS.chevR}<span>${({ overview: 'Overview', ai: 'AI Control Center', users: 'Utenti', audit: 'Audit', backups: 'Backup', privacy: 'Privacy', workflows: 'Workflow', security: 'Sicurezza', storage: 'Storage' })[state.params.tab] || 'Overview'}</span>`;
  return (NAV_META[r] || ['Home'])[0];
}
function renderTopbar() {
  const role = ROLES[state.role];
  const themeIcon = document.documentElement.getAttribute('data-theme') === 'dark' ? ICONS.sun : ICONS.moon;
  $('#topbar').innerHTML = `
    <div class="title">${pageTitle()}</div>
    <div class="spacer"></div>
    <div class="search-pill" id="open-palette" role="button" tabindex="0">${ICONS.search}<span>Cerca o digita un comando</span><kbd>⌘K</kbd></div>
    <button class="ai-btn" id="toggle-ai" title="ReferralFlow AI (⌘/)"><span class="orb ${state.aiState}"></span>AI</button>
    <button class="icon-btn" id="va-top" title="Assistente vocale (Ctrl+Shift+V)">${ICONS.mic}</button>
    <button class="icon-btn" id="notif-btn" title="Notifiche">${ICONS.bell}<span class="notif-dot"></span></button>
    <button class="icon-btn" id="theme-btn" title="Tema: ${state.theme}">${themeIcon}</button>
    <select class="role-select" id="role-select" title="Cambia ruolo (demo)">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === state.role ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <div class="avatar" title="${esc(role.name)}">${role.initials}</div>`;
  $('#open-palette').onclick = openPalette;
  $('#open-palette').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') openPalette(); };
  $('#toggle-ai').onclick = toggleAI;
  $('#va-top').onclick = () => { if (!state.aiOpen) toggleAI(true); setTimeout(() => (typeof vaStart === 'function' ? (VA.listening ? vaStop() : vaStart()) : null), 80); };
  $('#theme-btn').onclick = () => setTheme(state.theme === 'light' ? 'dark' : state.theme === 'dark' ? 'system' : 'light');
  $('#notif-btn').onclick = () => openSheet('Notifiche', `
    <div class="list">${INBOX.slice(0, 5).map(i => `<div class="list-item"><i class="dot ${i.kind === 'alert' ? 'warning' : i.kind === 'ai' ? 'ai' : 'accent'}"></i><div><div class="name">${esc(i.t)}</div><div class="sub">${esc(i.s)}</div></div></div>`).join('')}</div>
    <div class="caption">Notifiche simili vengono aggregate. Mute e snooze per regola nelle Impostazioni.</div>`, `<button class="btn" data-go="#/inbox">Apri Attività</button>`);
  $('#role-select').onchange = e => { state.role = e.target.value; state.aiMessages = []; go('#/home'); render(); toast(`Ruolo demo: ${ROLES[state.role].label}`); };
}
function renderSafetyBar() {
  const bar = $('#safetybar');
  const p = state.patientCtx ? P[state.patientCtx] : null;
  const canSee = p && !['tech_admin'].includes(state.role);
  bar.className = 'safety-bar' + (canSee ? ' show' : '');
  if (!canSee) { bar.innerHTML = ''; return; }
  bar.innerHTML = `${ICONS.shield}<b>${esc(fullName(p))}</b><span class="sep">·</span><span>nato/a il ${p.dob}</span><span class="sep">·</span><span>ID ${p.num}</span>${p.flags.map(f => `<span class="badge warning">${esc(f)}</span>`).join('')}<span class="caption exit">Contesto paziente attivo — l'AI è isolata su questo paziente</span>`;
}
function renderStatusbar() {
  $('#statusbar').innerHTML = `<span class="status"><i class="dot success"></i>Server</span><span class="status"><i class="dot success"></i>AI · Mac mini + DGX #1</span><span class="status"><i class="dot success"></i>Backup verificato 02:10</span><span class="status">Salvato automaticamente</span>
    <span class="ai-act"><span class="orb ${state.aiRunning ? 'working' : ''}"></span>ReferralFlow AI · ${state.aiRunning} attività in corso</span>`;
}
function renderMobileNav() {
  const items = [['home', 'Today', 'home'], ['patients', 'Pazienti', 'patients'], ['dittafono', 'Dittafono', 'mic'], ['inbox', 'Task', 'tasks'], ['search', 'Cerca', 'search']];
  $('#mobilenav').innerHTML = items.map(([k, l, i]) => `<button class="${state.route === k ? 'active' : ''}" data-mnav="${k}">${ICONS[i]}<span>${l}</span></button>`).join('');
  $('#mobilenav').querySelectorAll('button').forEach(b => b.onclick = () => { const k = b.dataset.mnav; if (k === 'search') openPalette(); else go('#/' + k); });
}
function bindCommon(root) {
  root.querySelectorAll('[data-go]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); go(el.dataset.go); }; });
  root.querySelectorAll('[data-doc]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); if (typeof dvOpen === 'function') dvOpen(el.dataset.doc); }; });
  root.querySelectorAll('[data-toast]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); toast(el.dataset.toast, el.dataset.undo !== undefined); }; });
  root.querySelectorAll('[data-sheet]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); SHEETS[el.dataset.sheet]?.(el.dataset.arg); }; });
  root.querySelectorAll('[data-modal]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); MODALS[el.dataset.modal]?.(el.dataset.arg); }; });
  root.querySelectorAll('[data-ai]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); askAI(el.dataset.ai); }; });
}

/* ---------- Toast ---------- */
function toast(msg, undo = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${ICONS.check}<span>${esc(msg)}</span>${undo ? '<button class="undo">Annulla</button>' : ''}`;
  $('#toasts').appendChild(el);
  if (undo) el.querySelector('.undo').onclick = () => { el.remove(); toast('Operazione annullata (azione compensativa registrata)'); };
  setTimeout(() => el.remove(), 4200);
}

/* ---------- Sheet ---------- */
function openSheet(title, body, foot = '') {
  $('#sheet').innerHTML = `<div class="sheet-head"><h3>${title}</h3><button class="icon-btn right" id="sheet-close">${ICONS.x}</button></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  $('#sheet').classList.add('show'); $('#sheet-overlay').classList.add('show');
  $('#sheet-close').onclick = closeSheet; $('#sheet-overlay').onclick = closeSheet;
  bindCommon($('#sheet'));
}
function closeSheet() { $('#sheet').classList.remove('show'); $('#sheet-overlay').classList.remove('show'); }

/* ---------- Modal ---------- */
function openModal(title, body, actions) {
  $('#modal').innerHTML = `<h3>${title}</h3><div class="m-body">${body}</div><div class="m-actions">${actions}</div>`;
  $('#modal-overlay').classList.add('show');
  $('#modal').querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  bindCommon($('#modal'));
}
function closeModal() { $('#modal-overlay').classList.remove('show'); }
$('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

/* ---------- Command palette ---------- */
let palIndex = 0;
function openPalette() {
  $('#palette-overlay').classList.add('show');
  $('#palette').innerHTML = `<div class="pin">${ICONS.search}<input id="pal-input" placeholder="Cerca pazienti, pagine, azioni… o scrivi un comando" autocomplete="off"><kbd>Esc</kbd></div><div class="results" id="pal-results"></div><div class="pfoot"><span>↑↓ naviga</span><span>↵ apri</span><span>✦ comandi in linguaggio naturale</span></div>`;
  const inp = $('#pal-input'); inp.focus();
  inp.oninput = () => { palIndex = 0; renderPalResults(inp.value); };
  inp.onkeydown = e => {
    const items = [...$('#pal-results').querySelectorAll('.pitem')];
    if (e.key === 'ArrowDown') { palIndex = Math.min(items.length - 1, palIndex + 1); highlightPal(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { palIndex = Math.max(0, palIndex - 1); highlightPal(); e.preventDefault(); }
    if (e.key === 'Enter') { items[palIndex]?.click(); }
  };
  renderPalResults('');
}
function closePalette() { $('#palette-overlay').classList.remove('show'); }
$('#palette-overlay').addEventListener('click', e => { if (e.target.id === 'palette-overlay') closePalette(); });
function highlightPal() { $('#pal-results').querySelectorAll('.pitem').forEach((el, i) => el.classList.toggle('active', i === palIndex)); }
function palItem(icon, label, kind, action, k = '') { return { icon, label, kind, action, k }; }
function renderPalResults(q) {
  const ql = q.trim().toLowerCase();
  const groups = [];
  const canClinical = ['doctor', 'org_admin'].includes(state.role);
  if (!ql) {
    groups.push(['Recenti', [palItem('patients', 'Mario Rossi', 'Paziente · ID 10231', () => go('#/patients/p1')), palItem('reports', 'Referto Rossi 09.09', 'Referto · da approvare', () => go('#/reports/r1')), palItem('documents', 'Lettera di dimissione — Rossi', 'Documento · da confermare', () => go('#/documents'))]]);
    groups.push(['Azioni rapide', [palItem('plus', 'Nuovo appuntamento', 'Azione', () => SHEETS.newAppt(), '⌘N'), palItem('patients', 'Nuovo paziente', 'Azione', () => SHEETS.newPatient()), palItem('ai', 'Chiedi a ReferralFlow AI…', 'AI', () => { toggleAI(true); })]]);
  } else {
    const pats = PATIENTS.filter(p => fullName(p).toLowerCase().includes(ql) || p.num.includes(ql) || (p.phone || '').replace(/\s/g, '').includes(ql.replace(/\s/g, '')));
    if (pats.length) groups.push(['Pazienti', pats.slice(0, 5).map(p => palItem('patients', fullName(p), `Paziente · ${p.dob} · ID ${p.num}`, () => go('#/patients/' + p.id)))]);
    const reps = REPORTS.filter(r => fullName(P[r.p]).toLowerCase().includes(ql) || r.type.toLowerCase().includes(ql) || r.date.includes(ql));
    if (reps.length && (canClinical || state.role === 'secretary')) groups.push(['Referti', reps.slice(0, 4).map(r => palItem('reports', `Referto ${fullName(P[r.p])} ${r.date}`, `${r.type} · ${RSTATUS[r.status]}`, () => go('#/reports/' + (r.id === 'r1' ? 'r1' : 'r1'))))]);
    const toks = ql.split(/\s+/).filter(Boolean);
    const arch = ARCHIVE.filter(a => { const hay = `${a.title} ${ARCH_KIND[a.kind]} ${dmy(a.date)} ${a.date} ${fullName(P[a.p])} ${a.by}`.toLowerCase(); return toks.every(t => hay.includes(t)); });
    if (arch.length && state.role !== 'tech_admin') groups.push(['Archivio storico', arch.slice(0, 4).map(a => palItem('documents', a.title, `${ARCH_KIND[a.kind]} · ${dmy(a.date)} · ${fullName(P[a.p])}`, () => go(`#/patients/${a.p}/${a.kind === 'report' ? 'reports' : a.kind === 'letter' ? 'documents' : 'exams'}`)))]);
    const pages = Object.entries(NAV_META).filter(([k, v]) => NAV[state.role].includes(k) && v[0].toLowerCase().includes(ql));
    if (pages.length) groups.push(['Pagine', pages.map(([k, v]) => palItem(v[1], v[0], 'Pagina', () => go('#/' + k)))]);
    // Natural-language commands
    const cmds = [];
    if (/apri|mostra/.test(ql) && pats.length) cmds.push(palItem('ai', `Apri ${fullName(pats[0])}`, 'Comando interpretato', () => go('#/patients/' + pats[0].id)));
    if (/prossimo paziente/.test(ql)) cmds.push(palItem('ai', 'Mostra il prossimo paziente', 'Comando · Mario Rossi 09:30', () => go('#/patients/p1')));
    if (/sposta|domani|prenota|controllo tra/.test(ql)) cmds.push(palItem('ai', q, 'Comando · richiede conferma (anteprima)', () => previewCommand(q)));
    if (/da approvare|approv/.test(ql)) cmds.push(palItem('ai', 'Quali referti devo ancora approvare?', 'Comando · 2 referti', () => go('#/reports')));
    if (/senza .*follow|follow-up|controllo scaduto/.test(ql)) cmds.push(palItem('ai', 'Pazienti senza follow-up programmato', 'Smart filter → Pazienti', () => { go('#/patients'); setTimeout(() => toast('Filtro AI applicato: follow-up mancante (3 pazienti)'), 300); }));
    if (/richiam/.test(ql)) cmds.push(palItem('ai', 'Chi devo richiamare oggi?', 'Comando · 2 richiami', () => go('#/inbox')));
    if (/fattur|insolut|bilanc|incass|profittevol|redditiz|margin|costi|economic/.test(ql)) cmds.push(palItem('ai', q, 'Domanda economica · risposta con metrica e fonte', () => { toggleAI(true); askAI(q); }));
    if (/vecch|archivio|storic|anni fa|prima del/.test(ql)) cmds.push(palItem('ai', q, 'Ricerca nell\'archivio storico', () => { toggleAI(true); askAI(q); }));
    if (cmds.length) groups.push(['ReferralFlow AI', cmds]);
    if (!groups.length) groups.push(['', [palItem('ai', `Chiedi all'AI: "${q}"`, 'Interpreta come domanda contestuale', () => { toggleAI(true); askAI(q); })]]);
  }
  let idx = 0;
  $('#pal-results').innerHTML = groups.map(([g, items]) => `${g ? `<div class="pgroup">${g}</div>` : ''}${items.map(it => `<div class="pitem ${idx++ === palIndex ? 'active' : ''}" data-idx="${idx - 1}">${ICONS[it.icon]}<div><div>${esc(it.label)}</div><div class="kind">${esc(it.kind)}</div></div>${it.k ? `<span class="k">${it.k}</span>` : ''}</div>`).join('')}`).join('');
  const flat = groups.flatMap(g => g[1]);
  $('#pal-results').querySelectorAll('.pitem').forEach(el => el.onclick = () => { closePalette(); flat[+el.dataset.idx].action(); });
}
function previewCommand(q) {
  const isMove = /sposta/.test(q.toLowerCase());
  openModal(isMove ? 'Sposta appuntamento' : 'Crea appuntamento', `
    <div class="ai-preview"><div class="pt">✦ Anteprima — nessuna modifica è stata applicata</div>
    <div class="kv"><b>Paziente</b><span>Mario Rossi · ID 10231</span><b>Tipo</b><span>Controllo cardiologico</span>${isMove ? '<b>Da</b><span>09 set 2026 · 15:00</span><b>A</b><span>10 set 2026 · 10:00</span>' : '<b>Quando</b><span>15 mar 2027 · 10:30</span><b>Medico</b><span>Dr.ssa Bianchi</span>'}<b>Fonte</b><span>comando ⌘K · Scheduling Agent</span></div></div>
    <p class="caption mt-8">L'azione passa dall'Action Engine: schema, permessi, regole, duplicati, audit.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="confirm-cmd">Conferma</button>`);
  $('#confirm-cmd').onclick = () => { closeModal(); toast(isMove ? 'Appuntamento spostato · registrato in audit' : 'Appuntamento creato · registrato in audit', true); };
}

/* ---------- AI panel ---------- */
function toggleAI(force) { state.aiOpen = typeof force === 'boolean' ? force : !state.aiOpen; render(); if (state.aiOpen) setTimeout(() => $('#ai-in')?.focus(), 50); }
function aiContextChips() {
  const chips = [];
  if (state.patientCtx) chips.push(`<span class="chip active">${ICONS.patients}${esc(fullName(P[state.patientCtx]))}</span>`);
  if (typeof psChip === 'function') { const c = psChip(); if (c) chips.push(c); }
  chips.push(`<span class="chip">${ICONS[NAV_META[state.route]?.[1] || 'home']}${NAV_META[state.route]?.[0] || 'Home'}</span>`);
  chips.push(`<span class="chip">${ICONS.shield}Permessi: ${ROLES[state.role].label}</span>`);
  return chips.join('');
}
function aiQuickActions() {
  const r = state.route, role = state.role;
  if (r === 'patient' || r === 'visit') return ['Cosa è cambiato?', 'Riassumi l\'ultima visita', 'Come è cambiata la FE negli anni', 'Trova gli ecocardiogrammi più vecchi'];
  if (r === 'report') return ['Controlla le incongruenze', 'Ascolta il punto sulla terapia', 'Trova il referto precedente'];
  if (r === 'agenda') return ['Trova un posto la prossima settimana', 'Ci sono conflitti oggi?', 'Chi non ha confermato domani?'];
  if (r === 'administration') return ['Come va il fatturato?', 'Quanto abbiamo di insoluto?', 'Quale prestazione rende di più?', 'Costi e margine di quest\'anno'];
  if (r === 'statistics') return ['Quante visite abbiamo fatto?', 'Com\'è il no-show?', 'Come va il fatturato?'];
  if (role === 'secretary') return ['Chi devo richiamare oggi?', 'Quali referti devo inviare?', 'Quali fatture sono scadute?', 'Trova la lettera di dimissione di Rossi'];
  if (role === 'assistant') return ['Chi è pronto?', 'A chi mancano i parametri?', 'Documenti arrivati oggi'];
  if (role === 'tech_admin') return ['Perché ieri i referti sono stati più lenti?', 'Quale modello genera più correzioni?', 'Storage occupato dagli audio'];
  if (role === 'org_admin') return ['Come va il fatturato?', 'Quale medico è più profittevole?', 'Quanto abbiamo di insoluto?', 'Come chiuderemo l\'anno?'];
  return ['Riassumi la giornata', 'Quali referti devo approvare?', 'Quanto ho fatturato quest\'anno?', 'Trova le analisi vecchie di Rossi'];
}
function renderAIPanel() {
  const el = $('#aipanel');
  if (!state.aiOpen) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="ai-head"><div class="ai-sphere ${state.aiState}" id="ai-sphere"><span class="w"></span></div><div class="t">ReferralFlow AI</div><span class="caption">contestuale</span><button class="icon-btn right" id="ai-close">${ICONS.x}</button></div>
    <div class="ai-ctx">${aiContextChips()}</div>
    <div class="ai-body" id="ai-body">
      ${typeof vaStage === 'function' ? vaStage() : ''}
      ${state.aiMessages.length ? state.aiMessages.map(m => m.html).join('') : `<div class="caption">L'AI conosce il contesto corrente e rispetta i tuoi permessi. Le risposte indicano sempre la fonte; le azioni richiedono conferma.</div><div class="ai-quick">${aiQuickActions().map(q => `<button class="chip" data-ai="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
    </div>
    ${typeof vaStatusLine === 'function' ? vaStatusLine() : ''}
    <div class="ai-input">${typeof vaMicButton === 'function' ? vaMicButton() : ''}<input id="ai-in" placeholder="${state.patientCtx ? 'Chiedi qualcosa su ' + esc(P[state.patientCtx].first) + '…' : 'Chiedi, o parla con il microfono…'}"><button class="btn ai" id="ai-send">${ICONS.send}</button></div>
    <div class="caption" id="va-hint" style="padding:0 16px 10px;min-height:14px"></div>`;
  $('#ai-close').onclick = () => toggleAI(false);
  $('#ai-send').onclick = () => { const v = $('#ai-in').value.trim(); if (v) askAI(v); };
  $('#ai-in').onkeydown = e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) askAI(v); } };
  if (typeof vaBind === 'function') vaBind(el);
  bindCommon(el);
  $('#ai-body').scrollTop = 1e6;
}
function aiAnswer(q) {
  const ql = q.toLowerCase(); const p = state.patientCtx ? P[state.patientCtx] : null;
  const src = (l) => `<span class="src">${l}</span>`;
  const clinical = ['doctor', 'org_admin'].includes(state.role) || (state.role === 'assistant' && ql.includes('pronto'));
  const fx = aiFinance(ql);
  if (fx) return (p ? `<div class="caption" style="margin-bottom:6px">Esco dal contesto paziente: questa risposta non usa nessun dato di ${esc(fullName(p))}.</div>` : '') + fx;
  const ext = aiArchive(ql) || aiOps(ql);
  if (ext) return ext;
  if (p && /sintesi|riassum|come sta|situazione|storia/.test(ql) && typeof psAnswer === 'function') {
    if (!['doctor', 'org_admin'].includes(state.role)) return `Non ho accesso ai dati clinici di ${p.first} con il tuo ruolo (${ROLES[state.role].label}).<div class="srcs">${src('Permission Engine · scope')}</div>`;
    return psAnswer(p);
  }
  if (p && /cambiat|diff/.test(ql)) {
    if (!['doctor', 'org_admin'].includes(state.role)) return `Non ho accesso ai dati clinici di ${p.first} con il tuo ruolo (${ROLES[state.role].label}). Posso mostrarti appuntamenti, documenti ricevuti (solo metadati) e attività.<div class="srcs">${src('Permission Engine · scope')}</div>`;
    return `<b>Cosa è cambiato dall'ultima visita (04.09.2026)</b><br>
      • <span class="prov confirmed">Confermato</span> Terapia: Ramipril 5 → 10 mg; Bisoprololo 2,5 → 5 mg<br>
      • <span class="prov document">Nel documento</span> Nuovo esame: Holter 12.08 — FA burden 3 %<br>
      • <span class="prov document">Nel documento</span> Nuovo sintomo riportato: palpitazioni serali<br>
      • <span class="prov document">Nel documento</span> Documento ricevuto: lettera di dimissione (08.09)<br>
      • <span class="prov verify">Da verificare</span> Prossimo controllo indicato "marzo 2027" ma nessun appuntamento in agenda
      <div class="srcs">${src('Visita 04.09.2026')}${src('Terapia · medication_events')}${src('Holter 12.08.2026')}${src('Documento d1')}</div>`;
  }
  if (p && /riassum|ultima visita/.test(ql)) return clinical ? `<b>Ultima visita 04.09.2026 — Dr.ssa Bianchi</b><br>Controllo per FA parossistica. Ecocardiogramma con FE 58 %, AS 42 mm. Aumentati Ramipril a 10 mg e Bisoprololo a 5 mg per PA e frequenza. Programmato controllo a 6 mesi.<div class="srcs">${src('Referto 04.09.2026 · FINAL')}${src('Eco 04.09.2026')}</div>` : `Con il tuo ruolo posso dirti solo che l'ultima visita è del 04.09.2026 e che il referto è stato inviato il 05.09.<div class="srcs">${src('Referti · stato')}</div>`;
  if (p && /fe|frazione/.test(ql)) return clinical ? `<b>Frazione d'eiezione — Mario Rossi</b><br>• 04.09.2026: <b>58 %</b> <span class="prov confirmed">Confermato</span><br>• 11.02.2025: <b>60 %</b> <span class="prov document">Nel documento</span><br>• 03.2023: <b>55 %</b> <span class="prov document">Nel documento</span><br>Non trovo altri valori nei dati disponibili.<div class="srcs">${src('cardiology_echo · 3 record')}</div>` : `Non ho accesso ai dati clinici con il tuo ruolo.`;
  if (/controllo tra|prenota|sposta/.test(ql)) return `Ho interpretato un comando. Anteprima prima di eseguire:
    <div class="ai-preview"><div class="pt">✦ Crea task follow-up</div><div class="kv"><b>Paziente</b><span>${p ? esc(fullName(p)) : 'Mario Rossi'}</span><b>Tipo</b><span>Controllo cardiologico</span><b>Quando</b><span>tra 6 mesi · ~ marzo 2027</span><b>Assegnato a</b><span>Segreteria</span><b>Stato</b><span>REQUIRES_CONFIRMATION</span></div>
    <div class="row mt-8"><button class="btn sm" data-toast="Proposta rifiutata · registrata">Annulla</button><button class="btn sm primary" data-toast="Task follow-up creato · Action Engine · audit" data-undo>Conferma</button></div></div>`;
  if (/incongru|controlla/.test(ql)) return `<b>Controllo coerenza — referto Rossi 09.09</b><br>• <span class="prov confirmed">Risolto</span> Dosaggio Bisoprololo: la primaria aveva "due e mezzo", il verificatore "cinque" (01:03); corretto dalla segreteria in 5 mg <span class="src" data-toast="▶ Riproduzione audio 01:03 — registrata in audit">▶ Ascolta</span><br>• <span class="prov conflict">Conflitto</span> Holter citato nel follow-up: nessun esame/task collegato<br>• Negazioni: "nega dolore toracico" correttamente riportato ✓<br>• Numeri: 6/6 valori tracciati a una fonte ✓<div class="srcs">${src('Consistency Agent · regole + Qwen3')}${src('Trascrizione · 6 segmenti')}</div>`;
  if (/ascolta/.test(ql)) return `▶ Riproduco il segmento 00:12 – 00:20: "…il paziente continua bisoprololo cinque milligrammi al mattino…"<div class="srcs">${src('Audio originale · span 00:12')}</div><div class="caption mt-8">Ogni riproduzione è registrata nell'audit (AUDIO_PLAYED).</div>`;
  if (/richiam/.test(ql)) return `<b>Richiami di oggi</b><br>• Paolo Gallo — conferma appuntamento 11:30 (nessuna risposta ieri)<br>• Sara Riva — esito laboratorio (proposta da nota chiamata, da confermare)<br><span class="prov confirmed">Confermato</span> dati da Task e Comunicazioni.<div class="srcs">${src('Task t2, t3')}${src('Comunicazioni')}</div>`;
  if (/inviare|invio/.test(ql)) return `<b>Referti da inviare</b><br>• Anna Verdi — approvato 11:10, destinatario: Dr. Ponti (medico curante) <span class="prov confirmed">Confermato</span><br>Nessun altro referto approvato in attesa.<div class="srcs">${src('Referti · stato APPROVED')}</div>`;
  if (/prenotare|controlli/.test(ql)) return `<b>Controlli da prenotare</b><br>• Mario Rossi — Holter di controllo (in attesa approvazione referto)<br>• Elena Fabbri — controllo scompenso a 6 mesi dal 02.03 → scaduto <span class="prov verify">Da verificare</span><br>• Luca Neri — controllo annuale ischemia (03.2027)<div class="srcs">${src('Task · followup')}${src('Agenda')}</div>`;
  if (/pronto|pronti/.test(ql)) return `<b>Pronti per il medico</b><br>• Mario Rossi — Sala 2 · parametri ✓ ECG ✓ · documenti: lettera dimissione da confermare<br><b>In preparazione</b>: nessuno. <b>In attesa</b>: Giulia Conti (10:00), Elena Fabbri (10:30, in ritardo).<div class="srcs">${src('Agenda · stati')}${src('Task prep')}</div>`;
  if (/parametri/.test(ql)) return `<b>Parametri mancanti</b><br>• Giulia Conti (10:00) — non ancora arrivata<br>• Elena Fabbri (10:30) — in ritardo<br>Tutti i pazienti arrivati hanno i parametri registrati ✓<div class="srcs">${src('Vitals · today')}</div>`;
  if (/document/.test(ql)) return `<b>Documenti arrivati oggi</b><br>• Laboratorio Verdi — associato automaticamente (regola lab)<br>• ECG Rossi (foto) — confermato da M. Rezzonico<br>• PDF non identificato — nessun candidato, in Inbox<br>${state.role === 'doctor' ? '• Lettera di dimissione Rossi — <span class="prov verify">da confermare</span>' : ''}<div class="srcs">${src('Documents · 4 record')}</div>`;
  if (/conflitt/.test(ql)) return `<b>Agenda di oggi</b><br>Nessuna sovrapposizione. Un buco di 45 min alle 10:30 nella colonna Dr. Ferrari. <span class="prov inferred">Dedotto</span> Se sposti Gallo (11:30) alle 10:45 elimini il buco — vuoi l'anteprima?<div class="row mt-8"><button class="btn sm" data-ai="sposta Gallo alle 10:45">Anteprima</button></div><div class="srcs">${src('Scheduling Agent · solver')}</div>`;
  if (/posto|slot|prossima settimana/.test(ql)) return `<b>Disponibilità prossima settimana — Dr.ssa Bianchi, controllo 30 min</b><br>• Lun 14 set · 11:00<br>• Mar 15 set · 09:30<br>• Gio 17 set · 15:30<br>Seleziona uno slot per creare un'anteprima appuntamento.<div class="row mt-8"><button class="btn sm" data-ai="prenota lun 14 set 11:00">Lun 11:00</button><button class="btn sm" data-ai="prenota mar 15 set 09:30">Mar 09:30</button></div><div class="srcs">${src('Agenda · availability')}</div>`;
  if (/confermato|domani/.test(ql)) return `<b>Domani — non confermati</b><br>• 3 pazienti senza conferma (Bernasconi 08:30, Ortelli 10:00, Pedrazzini 14:30)<br><span class="prov inferred">Dedotto</span> Posso preparare un reminder per tutti e 3 — anteprima con lista prima dell'invio.<div class="row mt-8"><button class="btn sm primary" data-modal="bulkReminder">Anteprima reminder</button></div>`;
  if (/lenti|lento/.test(ql)) return `<b>Perché ieri i referti sono stati più lenti</b><br>• Latenza media pipeline 4 m 50 s (vs 2 m 20 s media 7 gg)<br>• Causa principale: nodo DGX #1 in modalità degradata 14:10-16:40 (reranker) → extraction su Mac mini (Qwen3 8B, 3,5× più lento)<br>• 6 referti in coda > 15 min; nessun fallimento<div class="srcs">${src('ai_jobs · 18 record')}${src('ai_nodes · heartbeat')}</div><div class="caption mt-8">Analisi solo su metriche, nessun contenuto clinico usato.</div>`;
  if (/modello|correzioni/.test(ql)) return `<b>Correzioni per modello (30 gg)</b><br>• Qwen3 32B + extract_v14: 2,4 correzioni/referto (0,3 critiche)<br>• Qwen3 8B (fallback): 5,1 correzioni/referto (0,9 critiche)<br>Suggerimento: evitare fallback su 8B per report_generation quando DGX è degradato → accodare invece.<div class="srcs">${src('ai_quality_metrics')}</div>`;
  if (/storage|audio/.test(ql)) return `<b>Storage audio</b><br>Audio: 128 GB (originali 74 GB, processati 54 GB) · retention 90 gg dopo ARCHIVED · 11 GB in scadenza questa settimana.<div class="srcs">${src('system.storage')}</div>`;
  if (/giornata|riassumi/.test(ql)) return `<b>La tua giornata</b><br>11 pazienti (2 prime visite, 3 controlli aritmologici). 2 referti da approvare, 2 documenti nuovi, 1 risultato da verificare (lab Verdi). Nessuna criticità organizzativa.<div class="srcs">${src('Agenda')}${src('Referti')}${src('Documenti')}</div>`;
  if (/approv/.test(ql)) return `<b>Referti da approvare</b><br>• Mario Rossi — controllo 09.09 · 2 alert (1 da verificare)<br>• Luca Neri — eco 09.09 · v2 corretta dalla segreteria<div class="row mt-8"><button class="btn sm" data-go="#/reports/r1">Apri Rossi</button></div>`;
  if (/nuovi documenti|con nuovi/.test(ql)) return `<b>Pazienti con nuovi documenti</b><br>• Mario Rossi — lettera di dimissione (08.09)<br>• Anna Verdi — laboratorio (09.09)<br>• Elena Fabbri — controllo PM (02.09)<div class="srcs">${src('Documents · new since last visit')}</div>`;
  return `Non trovo questa informazione nei dati disponibili per il tuo ruolo. Prova a riformulare, oppure apri il paziente o il referto a cui ti riferisci.<div class="srcs">${src('Nessuna fonte')}</div>`;
}
function askAI(q) {
  if (!state.aiOpen) { state.aiOpen = true; }
  state.aiMessages.push({ html: `<div class="ai-msg user">${esc(q)}</div>` });
  state.aiState = 'thinking';
  const steps = /controlla|incongru/.test(q.toLowerCase()) ? ['Recupero contesto autorizzato', 'Confronto con terapia e documenti', 'Controllo coerenza', 'Preparazione risposta'] : ['Recupero contesto autorizzato', 'Analisi', 'Preparazione risposta'];
  const thinkingId = 'th' + Date.now();
  state.aiMessages.push({ id: thinkingId, html: `<div class="ai-msg ai" id="${thinkingId}"><div class="ai-steps">${steps.map((s, i) => `<div class="s ${i === 0 ? 'cur' : ''}"><span class="dot ${i === 0 ? 'accent' : ''}"></span>${s}</div>`).join('')}</div></div>` });
  render();
  let i = 0;
  const iv = setInterval(() => {
    i++;
    const el = document.getElementById(thinkingId);
    if (el) el.querySelectorAll('.s').forEach((s, k) => { s.className = 's ' + (k < i ? 'done' : k === i ? 'cur' : ''); s.querySelector('.dot').className = 'dot ' + (k < i ? 'success' : k === i ? 'accent' : ''); });
    if (i >= steps.length) {
      clearInterval(iv);
      state.aiMessages = state.aiMessages.filter(m => m.id !== thinkingId);
      const answerHtml = aiAnswer(q);
      state.aiMessages.push({ html: `<div class="ai-msg ai">${answerHtml}</div>` });
      state.aiState = 'idle';
      const opened = typeof dvMaybeOpen === 'function' ? dvMaybeOpen(q) : null;
      if (!opened) render();
      if (typeof vaAfterAnswer === 'function') vaAfterAnswer(answerHtml, opened);
    }
  }, 380);
}

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); openPalette(); }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  else if (mod && e.key === '/') { e.preventDefault(); toggleAI(); }
  else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); SHEETS.newAppt(); }
  else if (e.key === 'Escape') { closePalette(); closeSheet(); closeModal(); }
});

/* ---------- Boot ---------- */
applyTheme();
setTimeout(() => { $('#splash').classList.add('hide'); }, 700);
onRoute();
