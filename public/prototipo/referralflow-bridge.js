/* Ponte con la piattaforma ReferralFlow (13.9.2026, v2 «operativo»).
   Quando il prototipo è servito dalla piattaforma (percorso /prototipo/):
   - tutte le liste (pazienti, agenda dal robot MediOnline, attività, referti,
     documenti, audio in coda) vengono dalla piattaforma con la sessione del
     browser: i dati demo spariscono;
   - il ruolo e il nome sono quelli dell'utente collegato;
   - la Home e i Referti sono riscritti sui dati veri; le pagine senza un
     backing vero (amministrazione, sistema, statistiche, comunicazioni,
     visite, AI/knowledge) rimandano alla piattaforma;
   - la sidebar AI parla col modello locale della piattaforma (Ollama) sui
     dati già in pagina;
   - un audio caricato in Referti va alla coda dei referti (stessa catena
     del DS2);
   - la Guided Review lavora sulla bozza vera con l'audio vero e «Termina
     revisione» salva il testo nella piattaforma (la conferma resta lì).
   Fuori dalla piattaforma (porta 8765) il ponte è inerte: restano i dati finti. */
const RF = { live: false, data: null, queue: [], loaded: null, loading: null, meta: null, audioEl: null, medici: [], caricato: false, nonAutorizzato: false, procedure: [], org: null };
function rfDentro() { return /\/prototipo\//.test(location.pathname); }
const rfEsc = (s) => (typeof esc === 'function' ? esc(String(s ?? '')) : String(s ?? ''));

/* ---------- caricamento dei dati veri ---------- */
function rfSvuota(arr) { arr.length = 0; }
function rfRimpiazzaOggetto(obj, nuovo) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, nuovo); }

async function rfCaricaDati() {
  if (!rfDentro()) return;
  let r;
  try { r = await fetch('/api/prototipo/dati', { credentials: 'include' }); } catch (e) { return; }
  if (r.status === 401) { RF.nonAutorizzato = true; rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: false }); return; }
  if (!r.ok) return;
  const d = await r.json();
  RF.data = d; RF.live = true; RF.caricato = true;
  const ruolo = ['secretary', 'doctor', 'org_admin', 'assistant', 'tech_admin'].includes(d.utente.role) ? d.utente.role : 'secretary';
  for (const k of Object.keys(ROLES)) ROLES[k] = { ...ROLES[k], name: d.utente.name, initials: d.utente.initials, greet: `Buongiorno, ${d.utente.name}` };
  ROLES[ruolo].greet = `${new Date().getHours() < 13 ? 'Buongiorno' : 'Buonasera'}, ${d.utente.name}`;
  state.role = ruolo;
  rfRimpiazzaOggetto(DOCTORS, d.doctors || {});
  rfSvuota(ROOMS); [...new Set((d.appts || []).map(a => a.room).filter(Boolean))].forEach(x => ROOMS.push(x));
  rfSvuota(PATIENTS); (d.patients || []).forEach(p => PATIENTS.push(p));
  rfRimpiazzaOggetto(P, Object.fromEntries(PATIENTS.map(p => [p.id, p])));
  rfSvuota(APPTS); (d.appts || []).forEach(a => APPTS.push(a));
  rfSvuota(TASKS); (d.tasks || []).forEach(t => TASKS.push(t));
  rfSvuota(REPORTS); (d.reports || []).forEach(x => REPORTS.push(x));
  rfSvuota(DOCUMENTS); (d.documents || []).forEach(x => DOCUMENTS.push(x));
  rfSvuota(INBOX); (d.inbox || []).forEach(x => INBOX.push(x));
  rfSvuota(COMMS);
  if (typeof AUDIO_INBOX !== 'undefined') { rfSvuota(AUDIO_INBOX); (d.audioInbox || []).forEach(x => AUDIO_INBOX.push(x)); }
  RF.queue = (d.reports || []).map(x => ({ ...x }));
  rfSvuota(RV_QUEUE);
  for (const x of RF.queue) {
    RV_QUEUE.push({ id: x.id, p: x.p, doc: x.doc, type: x.type, at: x.at, audio: x.audio, issues: x.issues, crit: x.crit, est: x.est, state: x.state, note: x.note, blocked: false, status: x.status, rivisto: x.rivisto || null });
  }
  // Niente residui demo nelle pagine raggiungibili: archivio storico della
  // palette, audit e job finti, knowledge, fatture.
  for (const nome of ['ARCHIVE', 'AUDIT', 'AIJOBS', 'KNOWLEDGE', 'INVOICES']) { try { if (Array.isArray(window[nome])) rfSvuota(window[nome]); } catch { /* assente */ } }
  const nav = ['home', 'agenda', 'patients', 'reports', 'dittafono', 'documents', 'anonymize', 'inbox', 'ai', 'administration'];
  for (const k of Object.keys(NAV)) NAV[k] = nav.slice();
  render();
}

function rfPaginaAccesso(stato) {
  const c = document.getElementById('content');
  if (!c) return;
  const st = stato || RF.accesso || { passo: 'credenziali', errore: null, lavora: false };
  RF.accesso = st;
  c.innerHTML = `<div class="page"><div class="card rf-accesso">
    <div class="brand" style="justify-content:center;padding-bottom:6px">${typeof BRAND_MARK !== 'undefined' ? BRAND_MARK : ''}<div><div class="brand-name">ReferralFlow</div><div class="brand-sub">interfaccia nuova · dati dello studio</div></div></div>
    ${st.passo === 'codice' ? `
      <h2 class="page-title" style="font-size:18px;text-align:center">Codice di verifica</h2>
      <p class="meta" style="text-align:center">Inserisci il codice dell'app di autenticazione, oppure un codice di recupero.</p>
      <form id="rf-acc-form" autocomplete="off">
        <div class="field mt-16"><label>Codice</label><input class="input" id="rf-acc-codice" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" autofocus></div>
        ${st.errore ? `<div class="rf-manc mt-8">${rfEsc(st.errore)}</div>` : ''}
        <div class="row mt-16" style="gap:8px"><button class="btn primary grow" type="submit" ${st.lavora ? 'disabled' : ''}>${st.lavora ? 'Verifico…' : 'Entra'}</button><button class="btn ghost" type="button" id="rf-acc-indietro">Indietro</button></div>
      </form>` : `
      <h2 class="page-title" style="font-size:18px;text-align:center">Accedi</h2>
      <form id="rf-acc-form">
        <div class="field mt-16"><label>E-mail</label><input class="input" id="rf-acc-email" type="email" autocomplete="username" inputmode="email" required></div>
        <div class="field mt-8"><label>Password</label><input class="input" id="rf-acc-password" type="password" autocomplete="current-password" required></div>
        ${st.errore ? `<div class="rf-manc mt-8">${rfEsc(st.errore)}</div>` : ''}
        <button class="btn primary mt-16" type="submit" style="width:100%" ${st.lavora ? 'disabled' : ''}>${st.lavora ? 'Accedo…' : 'Entra'}</button>
        <p class="caption mt-16" style="text-align:center">Sessione di 8 ore sul Mac dello studio. Nessun dato dimostrativo.</p>
      </form>`}
  </div></div>`;
  const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
  const mn = document.getElementById('mobilenav'); if (mn) mn.innerHTML = '';
  const form = document.getElementById('rf-acc-form');
  if (form) form.onsubmit = (e) => { e.preventDefault(); void rfAccedi(); };
  const ind = document.getElementById('rf-acc-indietro'); if (ind) ind.onclick = () => rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: false });
}
async function rfAccedi() {
  const st = RF.accesso || { passo: 'credenziali' };
  if (st.passo === 'codice') {
    const codice = (document.getElementById('rf-acc-codice') || {}).value || '';
    rfPaginaAccesso({ passo: 'codice', errore: null, lavora: true });
    try {
      const r = await fetch('/api/prototipo/accesso/verifica', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codice }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { rfPaginaAccesso({ passo: j.ricomincia ? 'credenziali' : 'codice', errore: j.errore || 'Codice non valido.', lavora: false }); return; }
    } catch { rfPaginaAccesso({ passo: 'codice', errore: 'Piattaforma non raggiungibile.', lavora: false }); return; }
  } else {
    const email = (document.getElementById('rf-acc-email') || {}).value || '';
    const password = (document.getElementById('rf-acc-password') || {}).value || '';
    rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: true });
    try {
      const r = await fetch('/api/prototipo/accesso', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { rfPaginaAccesso({ passo: 'credenziali', errore: j.errore || 'Accesso non riuscito.', lavora: false }); return; }
      if (j.richiede_codice) { rfPaginaAccesso({ passo: 'codice', errore: null, lavora: false }); return; }
    } catch { rfPaginaAccesso({ passo: 'credenziali', errore: 'Piattaforma non raggiungibile.', lavora: false }); return; }
  }
  RF.accesso = null; RF.nonAutorizzato = false; RF.caricato = false;
  rfPaginaCarico();
  void rfCaricaMedici(); void rfCaricaProcedure(); void rfCaricaDati();
}
async function rfEsci() {
  try { await fetch('/api/prototipo/accesso/esci', { method: 'POST', credentials: 'include' }); } catch { /* comunque */ }
  RF.live = false; RF.caricato = false; RF.data = null; RF.nonAutorizzato = true; RF.loaded = null; RF.accesso = null;
  location.hash = '#/home';
  rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: false });
}
(function () { const st = document.createElement('style'); st.textContent = `.rf-accesso{max-width:420px;margin:40px auto;padding:22px 24px}@media (max-width:767px){.rf-accesso{margin:16px auto}}`; document.head.appendChild(st); })();

/* ---------- barra laterale: conteggi veri ---------- */
const rfRenderSidebarOrig = renderSidebar;
renderSidebar = function () {
  if (!RF.live) return rfRenderSidebarOrig();
  const s = RF.data.stats || {};
  const badges = { inbox: TASKS.length, reports: s.bozze_da_rivedere || 0, documents: 0, ai: 0 };
  const item = (key) => {
    const meta = NAV_META[key] || [key, 'home'];
    const active = state.route === key || (key === 'patients' && ['patient', 'visit'].includes(state.route)) || (key === 'reports' && ['report', 'review'].includes(state.route)) || (key === 'inbox' && state.route === 'tasks');
    const b = badges[key] ? `<span class="badge count">${badges[key]}</span>` : '';
    return `<button class="nav-item ${active ? 'active' : ''}" data-go="#/${key}" title="${meta[0]}">${ICONS[meta[1]] || ''}<span>${meta[0]}</span>${b}</button>`;
  };
  document.getElementById('sidebar').innerHTML = `
    <div class="brand">${BRAND_MARK}<div><div class="brand-name">ReferralFlow</div><div class="brand-sub">${rfEsc(RF.data.utente.studio)}</div></div></div>
    <nav class="nav">${NAV[state.role].map(item).join('')}</nav>
    <div class="bottom">
      <div class="nav-sep"></div>
      <nav class="nav">
        <button class="nav-item" id="collapse-btn" title="Comprimi barra laterale">${ICONS.panel}<span>Comprimi</span></button>
        <button class="nav-item ${state.route === 'profile' ? 'active' : ''}" data-go="#/profile" title="Profilo">${ICONS.profile || ''}<span>Profilo</span></button>
        <button class="nav-item" id="rf-esci" title="Esci">${ICONS.lock || ''}<span>Esci · ${rfEsc((RF.data.utente.email || '').split('@')[0])}</span></button>
      </nav>
      <div class="sysbar"><span class="status"><i class="dot success"></i><span>Dati veri</span></span><span class="status"><i class="dot success"></i><span>AI locale</span></span></div>
    </div>`;
  document.getElementById('collapse-btn').onclick = () => { state.sidebarCollapsed = !state.sidebarCollapsed; render(); };
  const esci = document.getElementById('rf-esci'); if (esci) esci.onclick = () => { void rfEsci(); };
  bindCommon(document.getElementById('sidebar'));
};

/* ---------- Home sui dati veri (tutti i ruoli) ---------- */
const rfHomeOrig = PAGES.home;
PAGES.home = () => {
  if (!RF.live) return rfHomeOrig();
  const s = RF.data.stats || {};
  const appts = [...APPTS].sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = appts.find(a => a.status !== 'COMPLETED' && a.start >= hm) || appts.find(a => a.status !== 'COMPLETED');
  const stat = (v, l, go, d = '') => `<div class="card tight clickable stat" data-go="${go}"><span class="value num">${v}</span><span class="label">${l}</span>${d ? `<span class="delta">${d}</span>` : ''}</div>`;
  const data = now.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const nMed = new Set(appts.map(a => a.doc)).size;
  const prio = RF.queue.filter(r => r.state === 'priority' && r.status !== 'APPROVED').length;
  return `
    <div class="page-head"><div><div class="display">${rfEsc(ROLES[state.role].greet)}</div><div class="page-sub" style="text-transform:none">${data} · ${appts.length} ${appts.length === 1 ? 'appuntamento' : 'appuntamenti'}${nMed ? ` · ${nMed} ${nMed === 1 ? 'medico' : 'medici'} in studio` : ''} · ${TASKS.length ? `${TASKS.length} cose da fare` : 'niente in sospeso'}</div></div>
      <div class="actions"><button class="btn" data-go="#/agenda">${ICONS.agenda} Agenda</button><button class="btn" data-go="#/reports">${ICONS.reports} Referti</button><button class="btn ai" data-ai="Preparazione della giornata">${ICONS.ai} Prepara la giornata</button></div></div>
    <div class="grid grid-5">
      ${stat(s.appuntamenti_oggi ?? appts.length, 'Appuntamenti oggi', '#/agenda', s.visti_oggi ? `${s.visti_oggi} già visti` : '')}
      ${stat(s.bozze_da_rivedere ?? 0, 'Referti da controllare', '#/reports', prio ? `${prio} prioritari` : '')}
      ${stat(s.urgenti ?? 0, 'Referral urgenti', '#/inbox')}
      ${stat(s.da_prenotare ?? 0, 'Da prenotare', '#/inbox')}
      ${stat(s.richiami_scaduti ?? 0, 'Richiami scaduti', '#/inbox')}
    </div>
    ${next ? `<div class="card hero mt-16">
      <div class="row between"><span class="section-title">Prossimo paziente</span><span class="status"><i class="dot ${next.late ? 'danger' : 'success'}"></i>${next.late ? 'In ritardo' : STATUS_LABEL[next.status] || ''}</span></div>
      <div class="row mt-16" style="gap:16px;align-items:flex-start">
        <div class="num" style="font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1">${next.start}</div>
        <div class="grow"><div style="font-size:20px;font-weight:650">${rfEsc(fullName(P[next.p]))}${P[next.p].age ? ` <span class="meta">· ${P[next.p].age} anni</span>` : ''}</div><div class="meta">${rfEsc(next.reason)} · ${rfEsc(DOCTORS[next.doc] || '')}${next.room ? ` · ${rfEsc(next.room)}` : ''}</div>
          <div class="row wrap mt-8">${P[next.p].docs && P[next.p].docs.length ? `<span class="badge accent">${P[next.p].docs.length} documenti in cartella</span>` : ''}${P[next.p].referrals && P[next.p].referrals.length ? `<span class="badge">${P[next.p].referrals.length} referral</span>` : ''}</div></div>
      </div>
      <div class="row mt-24"><button class="btn primary lg" data-go="#/patients/${next.p}">Scheda paziente</button>${rfUuid(next.p) ? `<button class="btn lg ai" data-ai="Briefing pre-visita di ${rfEsc(fullName(P[next.p]))}">${ICONS.ai} Briefing pre-visita</button>` : ''}<button class="btn lg" data-go="#/agenda">Agenda di oggi</button></div>
    </div>` : ''}
    <div class="grid grid-main-side mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Da fare adesso</span><button class="btn sm ghost" data-go="#/inbox">Tutte ${ICONS.chevR}</button></div>
        <div class="list">${TASKS.length ? TASKS.slice(0, 12).map(t => `<div class="list-item"><i class="dot ${t.prio === 'urgent' || t.prio === 'high' ? 'danger' : 'accent'}"></i><div class="grow"><div class="name">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('') : '<div class="caption" style="padding:8px 6px">Tutto gestito. Buon lavoro.</div>'}</div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><span class="section-title">Timeline di oggi</span><button class="btn sm ghost" data-go="#/agenda">Agenda ${ICONS.chevR}</button></div>
          <div class="tl">${appts.length ? appts.map(a => `<div class="tl-item ${a.status === 'COMPLETED' ? 'done' : a === next ? 'now' : a.late ? 'warn' : ''} clickable" data-go="#/patients/${a.p}" style="cursor:pointer"><span class="time num">${a.start}</span><div class="b"><div class="n">${rfEsc(fullName(P[a.p]))}</div><div class="s">${rfEsc(a.reason)} · ${rfEsc(DOCTORS[a.doc] || '')}</div></div></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun appuntamento oggi in agenda.</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Referti dalla catena</span><span class="badge count">${RF.queue.filter(r => r.status !== 'APPROVED').length}</span></div>
          <div class="list">${RF.queue.filter(r => r.status !== 'APPROVED').slice(0, 5).map(r => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(fullName(P[r.p]))}</div><div class="sub">${rfEsc(r.note)} · ${r.at}</div></div><button class="btn sm" data-go="#/review/${r.id}">Rivedi</button></div>`).join('') || '<div class="caption" style="padding:8px 6px">Nessuna bozza da controllare.</div>'}</div></div>
      </div>
    </div>`;
};

/* ---------- pagine senza backing vero → alla piattaforma ---------- */
function rfPaginaPiattaforma(titolo, testo) {
  return `<div class="page-head"><div><h2 class="page-title">${titolo}</h2><div class="page-sub">${testo}</div></div></div>
    <div class="card"><p class="meta" style="margin:0;line-height:1.55">Questa sezione non è ancora disponibile in questa interfaccia.</p></div>`;
}
const rfOrig = {};
for (const [k, titolo, testo, href] of [
  ['statistics', 'Statistiche', 'Tempi, volumi, qualità della catena', '/statistiche'],
  ['system', 'Sistema', 'Utenti, sicurezza, modelli', '/impostazioni/utenti'],
  ['communications', 'Comunicazioni', 'Telefonate, e-mail, consulti', '/consulti'],
  ['visits', 'Visite', 'Visite registrate', '/visite'],
  ['knowledge', 'Knowledge', 'La conoscenza degli agenti sta nella wiki', '/referti/qualita'],
]) {
  rfOrig[k] = PAGES[k];
  PAGES[k] = () => (RF.live ? rfPaginaPiattaforma(titolo, testo) : rfOrig[k] ? rfOrig[k]() : '');
}
const rfAiPageOrig = PAGES.ai;
PAGES.ai = () => (RF.live ? `<div class="page-head"><div><h2 class="page-title">AI</h2><div class="page-sub">Modello locale, nessun cloud: chiedi dalla barra a destra (⌘/)</div></div></div>
  <div class="card"><p class="meta" style="margin:0;line-height:1.55">L'assistente risponde sui numeri e sulle liste della giornata già caricate qui (agenda, attività, referti, documenti) con il modello locale della piattaforma. Non dà consigli clinici e non inventa dati: se una cosa non c'è, lo dice. Le proposte per la wiki e la qualità della catena sono in</p></div>` : rfAiPageOrig());

/* ---------- Referti: coda vera + caricamento audio ---------- */
// La pagina «report» del prototipo (#/reports/<id>) è demo: dentro la piattaforma rimanda alla revisione vera.
if (typeof PAGES !== 'undefined' && PAGES.report) {
  const rfReportOrig = PAGES.report;
  PAGES.report = () => { if (!RF.live) return rfReportOrig(); const id = state.params && state.params.id; setTimeout(() => go(id && rfUuid(id) ? `#/review/${id}` : '#/reports'), 0); return '<div class="page"><div class="caption">Apro la revisione…</div></div>'; };
}
const rfReportsOrig = PAGES.reports;
PAGES.reports = () => (RF.live ? reportsQueue() : rfReportsOrig());
const rfReportsQueueOrig = reportsQueue;
reportsQueue = function () {
  if (!RF.live) return rfReportsQueueOrig();
  const sort = state.qSort || 'priority';
  const rank = { priority: 0, advised: 1, some: 2, clean: 3 };
  const aperti = RV_QUEUE.filter(r => r.status !== 'APPROVED');
  const chiusi = RV_QUEUE.filter(r => r.status === 'APPROVED');
  const ordina = (l) => [...l].sort((a, b) => {
    if (sort === 'priority') return rank[a.state] - rank[b.state] || b.crit - a.crit;
    if (sort === 'time') return b.at.localeCompare(a.at);
    if (sort === 'doctor') return (DOCTORS[a.doc] || '').localeCompare(DOCTORS[b.doc] || '');
    return fullName(P[a.p]).localeCompare(fullName(P[b.p]));
  });
  const riga = (r) => {
    const st = RV_QSTATE[r.state];
    return `<div class="card q ${r.state}">
      <div class="row wrap" style="gap:12px">
        <div class="avatar-sm">${initials(P[r.p])}</div>
        <div class="grow" style="min-width:220px">
          <div class="row" style="gap:8px"><b>${rfEsc(fullName(P[r.p]))}</b><span class="badge ${st[1]}">${st[0]}</span>${r.status === 'APPROVED' ? '<span class="badge success">confermato</span>' : r.rivisto ? `<span class="badge accent" title="${r.rivisto.correzioni} correzioni · ${r.rivisto.chiuse} verifiche chiuse">rivisto ${rfEsc(r.rivisto.quando)}</span>` : ''}</div>
          <div class="caption">${rfEsc(DOCTORS[r.doc] || '')} · ${rfEsc(r.type)} · ${r.at}</div>
          <div class="sub" style="font-size:12.5px;color:var(--text-2);margin-top:2px">${rfEsc(r.note)}</div>
        </div>
        <div class="qm"><span class="v num">${r.issues}</span><span class="l">verifiche</span></div>
        <div class="qm"><span class="v num ${r.crit ? 'crit' : ''}">${r.crit}</span><span class="l">critiche</span></div>
        <div class="qm"><span class="v num">${r.audio}</span><span class="l">audio</span></div>
        <button class="btn ${r.state === 'priority' ? 'primary' : ''}" data-go="#/review/${r.id}">${r.status === 'APPROVED' ? 'Rileggi' : r.rivisto ? 'Riprendi e conferma' : r.state === 'clean' ? 'Lettura rapida' : 'Apri revisione'}</button>${r.status !== 'APPROVED' ? `<button class="btn ghost" data-prefirma="${r.id}" title="Controllo prima della firma, con traccia">✓ Controllo</button>` : ''}
      </div>
    </div>`;
  };
  const tot = aperti.reduce((s, r) => s + r.issues, 0), crit = aperti.reduce((s, r) => s + r.crit, 0);
  const inCoda = (typeof AUDIO_INBOX !== 'undefined' ? AUDIO_INBOX : []);
  const medici = RF.medici.length ? RF.medici : Object.entries(DOCTORS).map(([id, nome]) => ({ id, nome }));
  return `
    <div class="page-head"><div><h2 class="page-title">Referti</h2><div class="page-sub">${aperti.length} da controllare · ${tot} verifiche · ${crit} critiche · ${chiusi.length} confermati negli ultimi 30 giorni</div></div>
      <div class="actions"><div class="seg">${[['priority', 'Priorità'], ['time', 'Ora'], ['doctor', 'Medico'], ['patient', 'Paziente']].map(([k, l]) => `<button class="${sort === k ? 'active' : ''}" onclick="state.qSort='${k}';render()">${l}</button>`).join('')}</div><a class="btn" href="/dittafono/index.html">${ICONS.mic || ''} Detta dal telefono</a></div></div>
    <div class="card mb-16" id="rf-intake">
      <div class="card-head"><span class="section-title">Nuovo dettato</span><span class="caption">DS2, m4a, wav, mp3 · va alla coda della catena</span></div>
      <div class="row wrap" style="gap:10px;align-items:center">
        <select id="rf-intake-medico" class="input sm">${medici.map(m => `<option value="${rfEsc(m.id)}">${rfEsc(m.nome)}</option>`).join('')}</select>
        <select id="rf-intake-tipo" class="input sm"><option value="referto">Referto</option><option value="visita">Visita registrata</option></select>
        <input type="file" id="rf-intake-file" accept=".ds2,.dss,.m4a,.mp3,.wav,.aac,.ogg,.flac,.caf,.mp4" class="input sm" style="max-width:320px">
        <button class="btn primary" id="rf-intake-invia">Invia alla catena</button>
        <span class="caption" id="rf-intake-esito"></span>
      </div>
      ${inCoda.length ? `<div class="list mt-8">${inCoda.map(a => {
        const quando = a.at ? ` · ${a.at}` : '';
        if (a.state === 'ready') return `<div class="list-item"><i class="dot success"></i><div class="grow"><div class="name" style="font-size:13px">Bozza pronta${a.paziente ? ` · ${rfEsc(a.paziente)}` : ''}</div><div class="sub">${rfEsc(a.medico || '')}${quando} · dettato arrivato dalla catena</div></div><button class="btn sm" data-go="#/review/${a.bozza}">${a.bozzaStato === 'confermata' ? 'Rileggi' : 'Apri revisione'}</button></div>`;
        if (a.state === 'duplicate') return `<div class="list-item"><i class="dot warning"></i><div class="grow"><div class="name" style="font-size:13px">Già dettato: stesso audio di un referto del ${a.bozzaData}${a.paziente ? ` (${rfEsc(a.paziente)})` : ''}</div><div class="sub">${rfEsc(a.medico || '')}${quando} · la catena l'ha elaborato e la piattaforma ha riconosciuto il duplicato: nessuna bozza nuova</div></div><button class="btn sm ghost" data-go="#/review/${a.bozza}">Apri quello</button></div>`;
        if (a.state === 'failed') return `<div class="list-item"><i class="dot danger"></i><div class="grow"><div class="name" style="font-size:13px">Elaborazione senza bozza</div><div class="sub">${rfEsc(a.medico || '')}${quando} · la catena non ha consegnato un referto per questo audio</div></div></div>`;
        return `<div class="list-item"><i class="dot accent"></i><div class="grow"><div class="name" style="font-size:13px">${a.fase === 'in_coda' ? 'In coda' : 'In elaborazione'}${a.fase && a.fase !== 'in_coda' && a.fase !== 'elaborazione' ? ` · ${rfEsc(a.fase)}` : ''}</div><div class="sub">${rfEsc(a.medico || '')}${quando} · la catena impiega 4-10 minuti; la pagina si aggiorna da sola</div></div><span class="badge">…</span></div>`;
      }).join('')}</div>` : '<div class="caption mt-8">Nessun audio caricato nelle ultime 24 ore.</div>'}
    </div>
    <div class="stack">${ordina(aperti).map(riga).join('') || '<div class="card"><div class="caption">Nessuna bozza da controllare.</div></div>'}</div>
    ${chiusi.length ? `<div class="caption mt-16" style="margin-bottom:8px">Confermati</div><div class="stack">${ordina(chiusi).slice(0, 10).map(riga).join('')}</div>` : ''}`;
};
document.addEventListener('click', async (e) => {
  const b = e.target.closest && e.target.closest('#rf-intake-invia');
  if (!b) return;
  const f = document.getElementById('rf-intake-file');
  const esito = document.getElementById('rf-intake-esito');
  if (!f || !f.files || !f.files[0]) { esito.textContent = 'Scegli un file audio.'; return; }
  const fd = new FormData();
  fd.append('audio', f.files[0]);
  fd.append('medico', document.getElementById('rf-intake-medico').value);
  fd.append('tipo', document.getElementById('rf-intake-tipo').value);
  esito.textContent = 'Invio…'; b.disabled = true;
  try {
    const r = await fetch('/api/referti/upload', { method: 'POST', body: fd, credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { esito.textContent = 'In coda: la catena parte da sola, la bozza arriva qui in pochi minuti.'; toast('Audio in coda'); setTimeout(rfCaricaDati, 4000); }
    else esito.textContent = j.errore === 'medico_mancante' ? 'Scegli il medico che ha dettato.' : j.errore === 'formato_non_audio' ? 'Formato non riconosciuto.' : 'Invio non riuscito.';
  } catch (err) { esito.textContent = 'Invio non riuscito.'; }
  b.disabled = false;
});
async function rfCaricaMedici() {
  try { const r = await fetch('/api/referti/upload', { credentials: 'include' }); if (r.ok) { const j = await r.json(); RF.medici = j.medici || []; } } catch (e) { /* ignora */ }
}

/* ---------- Revisione: bozza vera, audio vero, salvataggio nella piattaforma ---------- */
const rfReviewOrig = PAGES.review;
PAGES.review = () => {
  const id = state.params && state.params.id;
  if (!RF.live || !id || !/^[0-9a-f-]{36}$/.test(id)) return RF.live ? rfPaginaPiattaforma('Revisione guidata', 'Scegli un referto dalla coda') : rfReviewOrig();
  if (RF.loaded !== id) {
    if (RF.loading !== id) { RF.loading = id; void rfCaricaRevisione(id); }
    return `<div class="page-head"><div><h2 class="page-title">Revisione guidata</h2><div class="page-sub">Carico la bozza dalla piattaforma…</div></div></div>`;
  }
  const m = RF.meta || {};
  // La pagina originale disegna il paziente demo «p1» (P.p1), che dentro la
  // piattaforma non esiste: senza segnaposto fullName() andava in errore e
  // restava a schermo «Carico la bozza…». Il contesto del bot punta al
  // paziente vero della bozza, se è in cartella.
  const q = RF.queue.find(r => r.id === id);
  if (q && P[q.p]) state.patientCtx = q.p;
  const segnaposto = !P.p1;
  if (segnaposto) P.p1 = { id: 'p1', first: '', last: m.paziente || 'Paziente', dob: m.nascita || '', docs: [], exams: [], referrals: [] };
  let html;
  try { html = rfReviewOrig(); } finally { if (segnaposto) delete P.p1; }
  const testata = `<div class="rv-pat">${ICONS.shield}<b>${rfEsc(m.paziente || 'Paziente non indicato')}</b><span>${rfEsc(m.nascita || '')}</span><span class="sep">·</span><span>${m.tipo === 'visita' ? 'Visita' : 'Referto'}</span><span class="sep">·</span><span>${rfEsc(m.medico || '')}</span><span class="sep">·</span><span>${RV_AUDIO.label}</span>${m.stato === 'confermata' ? '<span class="sep">·</span><span class="badge success">confermato</span>' : ''}</div>`;
  html = html.replace(/<div class="rv-pat">[\s\S]*?<\/div>/, testata);
  // Impaginazione nel formato del medico e Word: stessi motori della piattaforma.
  const bottoni = m.stato === 'bozza'
    ? `<button class="btn sm ghost" onclick="rfImpagina()" title="${m.formato === 'lettera' ? 'Formato del medico: lettera al collega («Caro …,», corpo, saluto, terapia dalla lettera precedente)' : 'Formato del medico: rapporto a sezioni'}">${ICONS.ai || ''} ${m.formato === 'lettera' ? 'Impagina come lettera' : 'Riorganizza nel formato'}</button><a class="btn sm ghost" href="/api/referti/docx/${id}" target="_blank" rel="noopener" title="Word con la carta intestata del medico, dal testo salvato">Word</a>`
    : `<a class="btn sm ghost" href="/api/referti/docx/${id}" target="_blank" rel="noopener">Word</a>`;
  html = html.replace('<div class="rv-top-r">', `<div class="rv-top-r">${bottoni}`);
  const note = Array.isArray(m.note_segreteria) ? m.note_segreteria.filter(n => typeof n === 'string' && n.trim()) : [];
  if (note.length) html = html.replace('<div class="rv-grid', `<div class="rf-note-seg">${ICONS.tasks || ''}<b>Note per la segreteria (${note.length})</b>${note.map(n => `<span class="badge">${rfEsc(n)}</span>`).join('')}<span class="caption">Istruzioni dettate dal medico, tolte dal testo del referto.</span></div><div class="rv-grid`);
  return html;
};
async function rfCaricaRevisione(id) {
  try {
    const r = await fetch('/api/prototipo/referti/' + id, { credentials: 'include' });
    if (!r.ok) { RF.loading = null; toast('Bozza non disponibile'); go('#/reports'); return; }
    const j = await r.json();
    RV_AUDIO.dur = j.audio.dur; RV_AUDIO.label = j.audio.label;
    rfSvuota(RV_TRANSCRIPT); (j.transcript || []).forEach(s => RV_TRANSCRIPT.push(s));
    rfSvuota(RV_MARKERS); (j.markers || []).forEach(x => RV_MARKERS.push(x));
    rfSvuota(RV_REPORT); (j.report || []).forEach(s => RV_REPORT.push(s));
    rfSvuota(RV_ISSUES); (j.issues || []).forEach(i => RV_ISSUES.push(i));
    RF.meta = j; RF.loaded = id; RF.loading = null;
    // Revisione già fatta e salvata nel prototipo: riparte da lì (verifiche
    // chiuse, correzioni per frase, frasi tolte o aggiunte).
    RF.campi = Object.assign({}, j.campi || {});
    RF.motivazioni = {};
    if (j.revisione_prototipo && typeof j.revisione_prototipo === 'object') {
      const rp = j.revisione_prototipo;
      RF.motivazioni = rp.motivazioni && typeof rp.motivazioni === 'object' ? rp.motivazioni : {};
      localStorage.setItem(RV_KEY, JSON.stringify({ issues: rp.issues || [], metrics: rp.metrics || {}, log: rp.log || [], cur: rp.cur || 0, t: 0 }));
    } else localStorage.removeItem(RV_KEY);
    RV.issues = [];
    rfAudioSetup(j.audio.url);
    render();
  } catch (e) { RF.loading = null; toast('Bozza non disponibile'); }
}
/* Ricompone il testo dalle frasi: le frasi che iniziavano una riga (nl)
   restano a capo, le altre seguono sulla stessa riga; le sezioni (paragrafi)
   restano separate da una riga vuota; le aggiunte vanno in coda alla sezione. */
function rfTestoRicomposto() {
  const blocchi = [];
  for (const s of RV_REPORT) {
    let testo = '';
    for (const p of s.parts) {
      if (RV.removed[p.id]) continue;
      const t = (RV.text[p.id] != null ? RV.text[p.id] : p.t).trim();
      if (!t) continue;
      testo += testo ? (p.nl ? '\n' : ' ') + t : t;
    }
    for (const a of RV.added.filter(x => x.section === s.code)) if (a.text && a.text.trim()) testo += (testo ? '\n' : '') + a.text.trim();
    if (testo.trim()) blocchi.push(testo);
  }
  return blocchi.join('\n\n');
}
const rfFinishOrig = rvFinish;
rvFinish = function () {
  if (!RF.live || !RF.loaded) return rfFinishOrig();
  const m = RF.meta || {};
  const testo = rfTestoRicomposto();
  const block = rvBlocking();
  const critTot = RV.issues.filter(i => i.sev === 'critical' || i.cat === 'NO_SOURCE').length;
  const critChiusi = critTot - block.length;
  const verificaRidotta = m.livello_verifica && m.livello_verifica !== 'pieno';
  const servePresaAtto = block.length > 0 || verificaRidotta;
  const cats = {};
  RV.issues.filter(i => i.status === 'corrected').forEach(i => { const c = RV_CAT[i.cat][0]; cats[c] = (cats[c] || 0) + 1; });
  openModal('Termina la revisione', `
    <div class="kv"><b>Verifiche</b><span>${rvDone()} di ${RV.issues.length} controllate</span><b>Correzioni</b><span>${RV.metrics.corrections}</span><b>Audio consultato</b><span>${RV.metrics.plays} volte</span></div>
    ${Object.keys(cats).length ? `<div class="mt-16"><div class="caption">Correzioni per categoria</div><div class="row wrap mt-8" style="gap:6px">${Object.entries(cats).map(([c, n]) => `<span class="badge">${rfEsc(c)} · ${n}</span>`).join('')}</div></div>` : ''}
    ${m.richiamo ? `<div class="caption mt-16">Richiamo già impostato dal referto: tra ${m.richiamo.mesi} mesi.</div>` : m.richiamo_proposto ? `<label class="row mt-16" style="gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="rf-richiamo" checked style="margin-top:3px"><span>Alla conferma crea il <b>richiamo a ${m.richiamo_proposto.mesi} mesi</b> sull'ultima referral del paziente <span class="caption">(dal dettato: «${rfEsc(m.richiamo_proposto.frase)}»)</span></span></label>` : ''}
    ${servePresaAtto ? `<div class="rf-manc mt-16"><b>Prima della firma</b>${block.length ? `<div>• ${block.length} verific${block.length === 1 ? 'a critica ancora aperta' : 'he critiche ancora aperte'}.</div>` : ''}${verificaRidotta ? `<div>• La catena ha verificato solo in parte (livello «${rfEsc(m.livello_verifica)}»).</div>` : ''}<label class="row mt-8" style="gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="rf-presa-atto" style="margin-top:3px"><span>Ne prendo atto e confermo lo stesso: resta registrato come presa d'atto.</span></label></div>` : '<div class="caption mt-16">Nessuna verifica critica aperta.</div>'}
    <p class="caption mt-16">Dove va a finire: <b>Salva</b> mette il testo corretto nella bozza come lavoro in corso (si può riprendere). <b>Conferma</b> chiude il referto: entra nell'audit con il tuo ruolo, alimenta il dizionario proposto, e da lì si scarica il Word con la carta intestata del medico. Prima di confermare puoi impaginare nel formato del medico dal tasto nella barra.</p>`,
    `<button class="btn" data-close>Continua a rivedere</button><button class="btn" id="rf-finish-salva">Salva</button><button class="btn primary" id="rf-finish-conferma">Conferma il referto</button>`);
  const riarma = (t) => { const b = document.getElementById('rf-finish-conferma'); if (b) { b.disabled = false; b.textContent = 'Conferma il referto'; } toast(t); };
  document.getElementById('rf-finish-salva').onclick = async () => {
    const b = document.getElementById('rf-finish-salva'); b.disabled = true; b.textContent = 'Salvo…';
    try {
      const r = await fetch(`/api/prototipo/referti/${RF.loaded}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo, correzioni: RV.metrics.corrections, verifiche: rvDone(), stato: rfStatoRevisione() }) });
      if (!r.ok) throw new Error(String(r.status));
      rvLog('SECRETARY_REVIEW_COMPLETED', `${RV.metrics.corrections} correzioni · salvato`);
      closeModal(); toast('Salvato: il referto è segnato come rivisto, da confermare'); RF.loaded = null; go('#/reports'); void rfCaricaDati();
    } catch (e) { b.disabled = false; b.textContent = 'Salva'; toast(e.message === '409' ? 'La bozza è già confermata' : 'Salvataggio non riuscito'); }
  };
  document.getElementById('rf-finish-conferma').onclick = async () => {
    const presa = document.getElementById('rf-presa-atto');
    if (servePresaAtto && !(presa && presa.checked)) { toast('Serve la presa d’atto per confermare con punti aperti'); return; }
    const b = document.getElementById('rf-finish-conferma'); b.disabled = true; b.textContent = 'Confermo…';
    try {
      const r = await fetch(`/api/prototipo/referti/${RF.loaded}/conferma`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        testo, campi: RF.campi || {}, presa_atto: !!(presa && presa.checked), flag_totali: RV.issues.length, flag_accettati_senza_riascolto: Math.max(0, rvDone() - RV.metrics.plays),
        flag_critici_totali: critTot, flag_critici_chiusi: critChiusi, tempo_revisione_s: Math.round((Date.now() - (RV.metrics.started || Date.now())) / 1000),
        revisione_iniziata_at: new Date(RV.metrics.started || Date.now()).toISOString(),
      }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.errore || String(r.status)); }
      rvLog('CONFIRMED', 'referto confermato');
      localStorage.removeItem(RV_KEY);
      const idBozza = RF.loaded;
      let notaRichiamo = '';
      const chk = document.getElementById('rf-richiamo');
      if (chk && chk.checked && m.richiamo_proposto) {
        try {
          const rr = await fetch(`/api/prototipo/referti/${idBozza}/richiamo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesi: m.richiamo_proposto.mesi }) });
          const jr = await rr.json().catch(() => ({}));
          notaRichiamo = rr.ok ? `<p>Richiamo creato a ${jr.mesi} mesi: lo trovi tra le cose da fare alla scadenza.</p>` : `<p class="caption">Richiamo non creato: ${jr.errore === 'paziente' ? 'paziente non trovato in cartella' : jr.errore === 'referral' ? 'il paziente non ha referral' : jr.errore === 'gia_creato' ? 'già impostato' : 'errore'}.</p>`;
        } catch { notaRichiamo = '<p class="caption">Richiamo non creato: piattaforma non raggiungibile.</p>'; }
      }
      closeModal();
      openModal('Referto confermato', `<p>Il referto è confermato ed è nell'audit con il tuo ruolo. Il testo corretto alimenta le proposte di dizionario del medico.</p>${notaRichiamo}`,
        `<a class="btn" href="/api/referti/docx/${idBozza}" target="_blank" rel="noopener">Scarica il Word</a><button class="btn primary" data-close onclick="RF.loaded=null;go('#/reports');void rfCaricaDati()">Torna ai referti</button>`);
    } catch (e) {
      riarma(e.message === 'critici' ? 'La piattaforma chiede la presa d’atto: spunta la casella' : e.message === 'non_bozza' ? 'La bozza è già confermata' : 'Conferma non riuscita');
    }
  };
};


/* ---------- lo stato della revisione va nella bozza, non solo nel browser ---------- */
/* Ogni salvataggio locale del prototipo (rvSave, 500 ms) viene seguito da un
   salvataggio nella piattaforma (2 s dopo l'ultima modifica): così la coda
   mostra il referto come rivisto e un altro dispositivo riparte da lì. */
const rfSaveOrig = rvSave;
rvSave = function () {
  rfSaveOrig();
  if (!RF.live || !RF.loaded) return;
  clearTimeout(rvSave._rf);
  const id = RF.loaded;
  rvSave._rf = setTimeout(async () => {
    try {
      if (RF.loaded !== id || (RF.meta && RF.meta.stato !== 'bozza')) return;
      // Il testo corretto viaggia insieme allo stato: così un referto lasciato a
      // metà ha già le correzioni nella bozza. Le mappe per id di frase non si
      // salvano (gli id cambiano col testo): si salvano solo gli esiti.
      await fetch(`/api/prototipo/referti/${id}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: rfTestoRicomposto(), stato: rfStatoRevisione(), correzioni: RV.metrics.corrections, verifiche: rvDone() }), keepalive: true });
    } catch { /* riprova al prossimo salvataggio */ }
  }, 2000);
};
function rfStatoRevisione() {
  return { issues: RV.issues.map(i => ({ id: i.id, status: i.status, resolution: i.resolution })), metrics: RV.metrics, log: (RV.log || []).slice(-200), cur: RV.cur, t: RV.t, motivazioni: RF.motivazioni || {} };
}


/* ---------- impaginazione nel formato del medico (lettera o rapporto) ---------- */
/* POST /api/referti/struttura avvia il lavoro sul modello locale col testo
   come lo vede chi rivede (correzioni comprese); GET ne dà l'avanzamento
   (percentuale vera). A fine lavoro la piattaforma ha già scritto il testo
   impaginato nella bozza: la revisione si ricarica e mostra la lettera.
   L'avanzamento si vede nella finestra E in una pillola fissa in alto, che
   resta anche se la finestra viene chiusa, con percentuale e tempo. */
(function () {
  const st = document.createElement('style');
  st.textContent = `
  #rf-imp-pill { position: fixed; top: calc(8px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 60; min-width: 260px; max-width: 92vw; padding: 8px 12px; border-radius: 12px; background: var(--glass-strong, var(--surface)); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--border-2); box-shadow: var(--shadow-2); font-size: 12.5px; }
  #rf-imp-pill .rf-imp-testo { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .rf-imp-track { height: 6px; border-radius: 6px; background: rgba(127,127,127,.18); overflow: hidden; }
  .rf-imp-fill { height: 100%; width: 2%; border-radius: 6px; background: var(--accent); transition: width .5s var(--ease); background-image: linear-gradient(45deg, rgba(255,255,255,.28) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.28) 50%, rgba(255,255,255,.28) 75%, transparent 75%, transparent); background-size: 18px 18px; animation: rf-imp-strisce 1s linear infinite; }
  .rf-imp-fill.ferma { animation: none; }
  @keyframes rf-imp-strisce { from { background-position: 0 0; } to { background-position: 18px 0; } }`;
  document.head.appendChild(st);
})();
function rfImpPill(testo, pct, fine) {
  let el = document.getElementById('rf-imp-pill');
  if (!el) { el = document.createElement('div'); el.id = 'rf-imp-pill'; el.innerHTML = '<div class="rf-imp-testo"><span class="rf-imp-t"></span><span class="rf-imp-p num"></span></div><div class="rf-imp-track"><div class="rf-imp-fill"></div></div>'; document.body.appendChild(el); }
  el.querySelector('.rf-imp-t').textContent = testo;
  el.querySelector('.rf-imp-p').textContent = pct != null ? `${Math.round(pct)}%` : '';
  const f = el.querySelector('.rf-imp-fill'); if (pct != null) f.style.width = `${Math.max(2, Math.min(100, pct))}%`; f.classList.toggle('ferma', !!fine);
  if (fine) setTimeout(() => { const e = document.getElementById('rf-imp-pill'); if (e) e.remove(); }, fine === 'errore' ? 8000 : 2500);
}
async function rfImpagina() {
  const id = RF.loaded; if (!id) return;
  if (RF.impaginando === id) { toast('Impaginazione già in corso'); return; }
  const m = RF.meta || {};
  const testo = rfTestoRicomposto();
  const titolo = m.formato === 'lettera' ? 'Impagina come lettera' : 'Riorganizza nel formato del medico';
  const inizio = Date.now();
  const mmss = () => { const sec = Math.round((Date.now() - inizio) / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  openModal(titolo, `<div id="rf-imp"><p class="caption">${m.formato === 'lettera' ? 'Il modello locale impagina il testo nel formato lettera del medico: apertura, corpo, saluto, terapia ripresa dalla lettera precedente se non ridettata. Le guardie del codice bloccano numeri, unità e relazioni cambiate.' : 'Il modello locale riorganizza il testo nel rapporto a sezioni del medico.'}</p><div class="rf-imp-track mt-16"><div id="rf-imp-bar" class="rf-imp-fill" style="width:2%"></div></div><div class="caption mt-8" id="rf-imp-stato">Avvio…</div><p class="caption mt-8">Puoi chiudere questa finestra: l'avanzamento resta in alto nella pagina.</p></div>`, `<button class="btn" data-close>Chiudi</button>`);
  let ultimoPct = 2, ultimoTesto = 'Avvio…', finito = false;
  const stato = (t, pct, fine) => {
    ultimoTesto = t; if (pct != null) ultimoPct = pct; if (fine) finito = true;
    const e = document.getElementById('rf-imp-stato'); if (e) e.textContent = `${t}${fine ? '' : ` · ${mmss()}`}`;
    const b = document.getElementById('rf-imp-bar'); if (b && pct != null) b.style.width = `${Math.max(2, Math.min(100, pct))}%`;
    rfImpPill(`${titolo}: ${fine === 'errore' ? 'non riuscita' : fine ? 'fatta' : 'in corso'} · ${mmss()}`, pct != null ? pct : ultimoPct, fine);
  };
  const orologio = setInterval(() => { if (finito) { clearInterval(orologio); return; } stato(ultimoTesto, ultimoPct); }, 1000);
  RF.impaginando = id;
  try {
    const r = await fetch('/api/referti/struttura', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, testo }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); stato(j.errore === 'non_trovata' ? 'La bozza è già confermata: si impagina solo una bozza aperta.' : 'Non riesco ad avviare l’impaginazione.', 100, 'errore'); return; }
    stato('In lavorazione sul modello locale (1-4 minuti)…', 5);
    for (let i = 0; i < 200; i++) {
      await new Promise(x => setTimeout(x, 3000));
      const g = await fetch(`/api/referti/struttura?id=${id}`, { credentials: 'include', cache: 'no-store' });
      if (!g.ok) continue;
      const j = await g.json();
      if (j.stato === 'lavora') { stato(`In lavorazione… ${j.percento || 0}%`, Math.max(5, j.percento || 0)); continue; }
      if (j.stato === 'fatto') {
        stato('Fatto: il testo impaginato è nella bozza. Ricarico la revisione…', 100, 'fatto');
        if (typeof rvLog === 'function') rvLog('FORMATTED', m.formato === 'lettera' ? 'impaginata come lettera' : 'riorganizzata nel formato');
        localStorage.removeItem(RV_KEY);
        RF.loaded = null; RF.loading = null;
        setTimeout(() => { closeModal(); render(); toast(m.formato === 'lettera' ? 'Lettera impaginata nel formato del medico' : 'Testo riorganizzato nel formato del medico'); }, 800);
        return;
      }
      if (j.stato === 'errore') {
        const motivi = { ai_non_risponde: 'il modello locale non ha risposto', troppo_corto: 'la proposta perdeva contenuto ed è stata scartata', numeri: 'la proposta cambiava dei numeri ed è stata scartata', unita: 'la proposta cambiava delle unità ed è stata scartata', relazioni: 'la proposta scambiava dei valori tra misure ed è stata scartata' };
        stato(`Non impaginato: ${motivi[j.motivo] || j.motivo || 'errore'}. Il testo della revisione è rimasto com’era.`, 100, 'errore');
        return;
      }
      if (j.stato === 'assente') { stato('Il lavoro non risulta avviato: riprova.', 0, 'errore'); return; }
    }
    stato('Sta impiegando troppo: riprova più tardi, il lavoro continua sul Mac.', 90, 'errore');
  } catch { stato('Non riesco a raggiungere la piattaforma.', 100, 'errore'); }
  finally { RF.impaginando = null; }
}


/* ---------- frasi tolte dalla catena e note per la segreteria ---------- */
/* «Rimetti nel referto» rimette la frase tolta in coda all'ultima sezione
   (come un'omissione aggiunta); «Lascia fuori» la lascia fuori. Le note per
   la segreteria (allega, invia, richiama…) stanno in una striscia sopra il
   testo: sono istruzioni, non testo del referto. */
const rfChooseOrig = rvChoose;
rvChoose = function (k) {
  const i = typeof rvIssue === 'function' ? rvIssue() : null;
  if (RF.live && i && i.status === 'open' && i.cat === 'STRUCTURE' && i.add && i.opts && i.opts[k]) {
    const o = i.opts[k];
    if (o.l === 'Rimetti nel referto') { RV.added.push({ id: 'add-' + i.id, section: i.add.section, text: i.add.text }); i.status = 'corrected'; i.resolution = 'rimessa nel referto'; RV.metrics.corrections++; rvLog('CORRECTION', i.id + ': frase tolta rimessa'); }
    else { i.status = 'verified'; i.resolution = 'lasciata fuori'; rvLog('ISSUE_VERIFIED', i.id); }
    if (typeof rvAfterResolve === 'function') rvAfterResolve(i); else { rvSave(); rvAfterRender(); }
    return;
  }
  return rfChooseOrig(k);
};


/* ---------- stessi passi della piattaforma: elenco per passo, campi, perché, richiamo ---------- */
/* La colonna delle segnalazioni raggruppa per PASSO nello stesso ordine del
   wizard della piattaforma (prima le parole, poi le frasi); in testa i campi
   estratti da confermare o correggere (salvati nella bozza); sulle correzioni
   automatiche decise compare il campo «Perché?»; alla conferma il richiamo
   proposto dal dettato si crea con una spunta. */
RF.campi = RF.campi || {}; RF.motivazioni = RF.motivazioni || {};
const rfRenderNavOrig = rvRenderNav;
rvRenderNav = function () {
  if (!RF.live) return rfRenderNavOrig();
  const el = document.getElementById('rv-nav'); if (!el) return;
  const done = rvDone(), tot = RV.issues.length;
  const openIssues = RV.issues.filter(i => i.status === 'open');
  const closed = RV.issues.filter(i => i.status !== 'open');
  const card = (i) => {
    const idx = RV.issues.indexOf(i);
    const sev = RV_SEV[i.sev];
    return `<button class="rv-issue ${i.sev} ${idx === RV.cur ? 'active' : ''} ${i.status !== 'open' ? 'closed' : ''}" onclick="rvGo(${idx})">
      <span class="d"></span>
      <span class="b"><span class="t">${rfEsc(i.title)}</span>
      <span class="s">${rfEsc(RV_CAT[i.cat][0])}${i.ev ? ' · ' + fmt(i.ev.focus) : ' · nessuna fonte'}</span></span>
      ${i.status !== 'open' ? `<span class="badge ${i.status === 'escalated' ? 'warning' : 'success'}">${i.status === 'escalated' ? '↗' : '✓'}</span>` : `<span class="badge ${sev[1]}">${sev[0]}</span>`}
    </button>`;
  };
  const passi = [];
  for (const i of openIssues) { const k = i.passo || 9; let g = passi.find(x => x.k === k); if (!g) { g = { k, titolo: i.passoTitolo || 'Altro', voci: [] }; passi.push(g); } g.voci.push(i); }
  passi.sort((a, b) => a.k - b.k);
  const c = RF.campi || {};
  const campo = (k, l, ph) => `<label class="rf-campo"><span>${l}</span><input class="input sm" data-campo="${k}" value="${rfEsc(c[k] || '')}" placeholder="${ph}"></label>`;
  el.innerHTML = `
    <div class="rv-nav-head">
      <div class="row between"><b style="font-size:13px">Revisione</b><span class="caption">${done} / ${tot} controllati</span></div>
      <div class="rv-prog"><i style="width:${tot ? Math.round(done / tot * 100) : 100}%"></i></div>
      ${rvBlocking().length ? `<div class="rv-block">${ICONS.alert || ''} ${rvBlocking().length} verifica${rvBlocking().length > 1 ? 'e' : ''} obbligatoria${rvBlocking().length > 1 ? 'e' : ''}</div>` : '<div class="rv-ok">Controlli obbligatori completati</div>'}
    </div>
    <div class="rv-nav-body">
      <details class="rf-campi" ${Object.values(c).some(v => !v) ? 'open' : ''}><summary><b>Campi estratti</b> <span class="caption">${['nome_paziente', 'data_nascita', 'medico_destinatario'].filter(k => c[k]).length}/3 · dalla catena, correggibili</span></summary>
        ${campo('nome_paziente', 'Paziente', 'Cognome Nome')}${campo('data_nascita', 'Nascita', 'gg.mm.aaaa')}${campo('medico_destinatario', 'Destinatario', 'Dr. …')}
        <div class="caption" style="margin-top:4px">Si salvano nella bozza appena li cambi; valgono per la lettera e per il Word.</div></details>
      ${passi.length ? passi.map((g, n) => `<div class="rv-group">${n + 1}. ${rfEsc(g.titolo)} <span class="caption">${g.voci.length}</span></div>${g.voci.map(card).join('')}`).join('') : '<div class="rv-group">Nessuna verifica aperta</div>'}
      ${closed.length ? `<div class="rv-group">Controllati</div>${closed.map(card).join('')}` : ''}
    </div>
    <div class="rv-nav-foot">
      <button class="btn sm ghost grow" onclick="rvStep(-1)" title="⌘K">${ICONS.chevL || ''} Prec.</button>
      <button class="btn sm grow" onclick="rvStep(1)" title="⌘J">Succ. ${ICONS.chevR}</button>
    </div>`;
  el.querySelectorAll('[data-campo]').forEach(inp => {
    inp.oninput = () => { RF.campi[inp.dataset.campo] = inp.value; clearTimeout(rvRenderNav._c); rvRenderNav._c = setTimeout(() => rfSalvaCampi(), 800); };
  });
};
async function rfSalvaCampi() {
  const id = RF.loaded; if (!id) return;
  try { await fetch(`/api/prototipo/referti/${id}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campi: RF.campi }) }); } catch { /* al prossimo */ }
}
/* «Perché?» sotto la scheda di una correzione automatica già decisa */
const rfRenderSourceOrig = rvRenderSource;
rvRenderSource = function () {
  rfRenderSourceOrig();
  if (!RF.live) return;
  const i = typeof rvIssue === 'function' ? rvIssue() : null;
  if (!i || i.status === 'open' || i.title !== 'Correzione automatica') return;
  const card = document.querySelector('#rv-src-body .rv-card'); if (!card || card.querySelector('.rf-perche')) return;
  const box = document.createElement('div'); box.className = 'rf-perche';
  box.innerHTML = `<input class="input sm" maxlength="200" placeholder="Perché? (facoltativo, aiuta il consolidatore)" value="${rfEsc(RF.motivazioni[i.id] || '')}">`;
  box.querySelector('input').oninput = (e) => { RF.motivazioni[i.id] = e.target.value; rvSave(); };
  card.appendChild(box);
};
(function () {
  const st = document.createElement('style');
  st.textContent = `
  .rf-campi { margin: 4px 4px 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  .rf-campi summary { cursor: pointer; font-size: 12.5px; }
  .rf-campo { display: grid; grid-template-columns: 82px 1fr; gap: 6px; align-items: center; margin-top: 6px; font-size: 12px; color: var(--text-2); }
  .rf-perche { margin-top: 10px; }`;
  document.head.appendChild(st);
})();

/* audio vero al posto dell'orologio simulato: stesse funzioni, stesso stato RV */
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
  try { RF.audioEl.currentTime = RV.t; } catch (e) { /* metadati non pronti */ }
  RF.audioEl.play().catch(() => { RV.playing = false; toast('Audio non riproducibile'); rvTick(); });
  rvTick();
};
rvPause = function () { if (!RF.audioEl) return rfPauseOrig(); RF.audioEl.pause(); RV.playing = false; rvTick(); };
rvSeek = function (t, play) {
  if (!RF.audioEl) return rfSeekOrig(t, play);
  RV.t = Math.min(RV_AUDIO.dur, Math.max(0, t)); RV.detached = false;
  try { RF.audioEl.currentTime = RV.t; } catch (e) { /* ignora */ }
  if (play) rvPlay(RV.t, null); else rvTick();
};

/* ---------- visualizzatore: i file veri si aprono accanto, dentro la piattaforma ---------- */
const rfDvOpenOrig = dvOpen, rfRenderDocViewerOrig = renderDocViewer;
dvOpen = function (idOrItem, source = '') {
  if (!RF.live) return rfDvOpenOrig(idOrItem, source);
  const id = typeof idOrItem === 'string' ? idOrItem : idOrItem && idOrItem.id;
  const d = DOCUMENTS.find(x => x.id === id) || (PATIENTS.flatMap(p => (p.docs || []).map(x => ({ ...x, p: p.id }))).find(x => x.id === id));
  if (!d) { toast('Documento non trovato'); return; }
  const nome = String(d.filename || d.t || '').toLowerCase();
  DV.open = true; DV.source = source;
  DV.item = { id: d.id, live: true, p: d.p, title: d.t, date: d.date || d.d || '', kind: d.type || d.k || 'exam', filename: d.filename || '', pdf: nome.endsWith('.pdf'), testo: null };
  if (!DV.item.pdf) {
    fetch(`/api/prototipo/documenti/${d.id}/testo`, { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(j => { if (DV.item && DV.item.id === d.id) { DV.item.testo = j ? (j.testo || '(nessun testo estraibile)') : 'Testo non disponibile.'; renderDocViewer(); } }).catch(() => {});
  }
  render();
};
renderDocViewer = function () {
  if (!RF.live || !DV.item || !DV.item.live) return rfRenderDocViewerOrig();
  const el = document.getElementById('docviewer');
  if (!el) return;
  if (!DV.open) { el.innerHTML = ''; return; }
  const a = DV.item;
  const paz = a.p && P[a.p] ? fullName(P[a.p]) : '';
  const corpo = a.pdf
    ? `<iframe src="/api/documents/${a.id}#toolbar=1&view=FitH" title="${rfEsc(a.title)}" style="width:100%;height:100%;min-height:70vh;border:0;background:#fff;border-radius:12px"></iframe>`
    : `<div class="dv-page"><div class="dv-head"><div><div class="dv-title">${rfEsc(a.title)}</div><div class="caption">${rfEsc(paz)}${a.date ? ' · ' + rfEsc(a.date) : ''}</div></div></div><pre style="white-space:pre-wrap;font:inherit;margin:12px 0 0">${a.testo == null ? 'Estraggo il testo…' : rfEsc(a.testo)}</pre></div>`;
  el.innerHTML = `
    <div class="dv-bar"><span class="section-title" style="margin:0">Documento</span><span class="badge">${rfEsc(DOC_TYPE[a.kind] || a.kind)}</span><span class="caption">${rfEsc(paz)}${a.date ? ' · ' + a.date : ''}</span>
      <span class="right row" style="gap:4px">
        ${a.p ? `<button class="icon-btn" title="Scheda paziente" data-go="#/patients/${a.p}">${ICONS.patients}</button>` : ''}
        <button class="icon-btn" title="Chiedi all'assistente di riassumerlo" data-ai="Riassumi questo documento in poche righe">${ICONS.ai}</button>
        <a class="icon-btn" title="Scarica" href="/api/documents/${a.id}" target="_blank" rel="noopener">${ICONS.download || '↓'}</a>
        <button class="icon-btn" id="dv-close" title="Chiudi">${ICONS.x}</button></span></div>
    ${DV.source ? `<div class="caption" style="padding:6px 14px 0">${ICONS.ai} ${rfEsc(DV.source)}</div>` : ''}
    <div class="dv-body" style="display:flex;flex-direction:column">${corpo}</div>
    <div class="dv-foot caption">${ICONS.shield} Apertura registrata nel registro accessi · chiedi all'assistente: «cosa dice questo documento?», «quali valori riporta?»</div>`;
  el.querySelector('#dv-close').onclick = dvClose;
  bindCommon(el);
};

/* ---------- il bot: sidebar AI sul modello locale della piattaforma ---------- */
function rfContestoBot() {
  const s = RF.data ? RF.data.stats : {};
  const p = state.patientCtx ? P[state.patientCtx] : null;
  return {
    oggi: new Date().toISOString().slice(0, 10), ruolo: state.role, pagina: state.route,
    documento_aperto: DV.open && DV.item && DV.item.live ? { titolo: DV.item.title, paziente: DV.item.p && P[DV.item.p] ? fullName(P[DV.item.p]) : null, data: DV.item.date } : null,
    numeri: s,
    agenda_oggi: APPTS.map(a => ({ ora: a.start, paziente: fullName(P[a.p]), medico: DOCTORS[a.doc], motivo: a.reason, stato: STATUS_LABEL[a.status] || a.status, in_ritardo: !!a.late })),
    attivita: TASKS.slice(0, 25).map(t => ({ titolo: t.title, scadenza: t.due, priorita: t.prio })),
    referti: RF.queue.slice(0, 15).map(r => ({ paziente: fullName(P[r.p]), medico: DOCTORS[r.doc], stato: r.status === 'APPROVED' ? 'confermato' : 'da controllare', verifiche: r.issues, critiche: r.crit, nota: r.note, quando: r.at })),
    documenti_recenti: DOCUMENTS.slice(0, 15).map(d => ({ titolo: d.t, paziente: P[d.p] ? fullName(P[d.p]) : null, tipo: DOC_TYPE[d.type] || d.type, data: d.date })),
    paziente_aperto: p ? { nome: fullName(p), nascita: p.dob, referral: p.referrals || [], documenti: (p.docs || []).map(d => ({ titolo: d.t, data: d.d })), prossimo: p.next, ultima_visita: p.lastVisit, medico_inviante: p.gp } : null,
  };
}
/* Risposte immediate, senza modello, per le domande più comuni: numeri,
   prossimo paziente, referti, urgenze, richiami. Il modello resta per il resto. */
/* Ricerca di un documento in cartella dalla domanda («trovami il duplex di Blazek»,
   «l'eco da sforzo di Karel Blazek», «documenti di Rossi»): paziente per nome,
   esame per parole del titolo o del nome del file. Deterministico, con link
   di apertura (la piattaforma registra ogni accesso). */
const RF_GENERICHE = new Set(['trova', 'trovami', 'cerca', 'cercami', 'mostra', 'mostrami', 'apri', 'aprimi', 'dammi', 'documento', 'documenti', 'esame', 'esami', 'referto', 'referti', 'paziente', 'pazienti', 'della', 'dello', 'delle', 'degli', 'quale', 'quali', 'ultimo', 'ultima', 'vorrei', 'voglio', 'puoi', 'fammi', 'vedere', 'cartella', 'file', 'signor', 'signora', 'dottor', 'anno', 'mese', 'fatto', 'fatti', 'fatta', 'fatte', 'eseguito', 'eseguiti', 'quando', 'come', 'cosa', 'che', 'sono', 'stato', 'stati', 'tutti', 'tutte', 'suoi', 'sue', 'del', 'dei', 'per', 'con', 'una', 'uno', 'gli', 'nel', 'nella', 'ultimi', 'ultime', 'recenti',
  'abbiamo', 'avete', 'hanno', 'avevamo', 'oggi', 'ieri', 'domani', 'settimana', 'questa', 'questo', 'questi', 'queste', 'quella', 'quello', 'quelle', 'quelli', 'nostro', 'nostra', 'nostri', 'nostre', 'stamattina', 'pomeriggio', 'mattina', 'ancora', 'anche', 'gia', 'stata', 'state', 'sia', 'siano', 'possiamo', 'posso', 'devo', 'dobbiamo', 'bisogna', 'serve', 'servono', 'elenco', 'lista', 'tipo', 'tipi']);
const rfNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const rfTok = (s) => (rfNorm(s).match(/[a-z0-9]{3,}/g) || []);
/* Distanza di Levenshtein limitata (stessa regola dell'interprete lato server). */
function rfDist(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let minRiga = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < minRiga) minRiga = cur[j]; }
    if (minRiga > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/* Un gettone della domanda corrisponde a una parte del nome se è uguale, se
   differisce di un refuso (entrambi ≥ 5 lettere) o se è l'inizio del nome
   (≥ 5 lettere). MAI il contrario: «abbiamo» non è «Abbi…», «della» non è «Dell». */
function rfNomeCorrisponde(t, n) {
  if (RF_GENERICHE.has(t)) return false;
  if (t === n) return true;
  if (t.length >= 5 && n.length >= 5 && rfDist(t, n, 1) <= 1) return true;
  return t.length >= 5 && n.length > t.length && n.startsWith(t);
}
function rfCercaDocumenti(q) {
  const tok = rfTok(q).filter(t => !RF_GENERICHE.has(t));
  if (!tok.length) return null;
  // paziente: cognome o nome tra le parole della domanda; chi ha cognome E nome vince
  const punteggiati = PATIENTS.map(p => {
    const cog = rfTok(p.last).some(n => tok.some(t => rfNomeCorrisponde(t, n)));
    const nom = rfTok(p.first).some(n => tok.some(t => rfNomeCorrisponde(t, n)));
    return { p, n: (cog ? 2 : 0) + (nom ? 1 : 0) };
  }).filter(x => x.n > 0);
  const max = punteggiati.length ? Math.max(...punteggiati.map(x => x.n)) : 0;
  // il solo nome di battesimo non identifica nessuno se ce ne sono più d'uno
  const pazienti = max === 1 && punteggiati.filter(x => x.n === 1).length > 1 ? [] : punteggiati.filter(x => x.n === max).map(x => x.p);
  // le parole che sono nome o cognome dei pazienti trovati (anche con refuso) non sono chiavi di ricerca
  const nomiPaz = pazienti.flatMap(p => [...rfTok(p.last), ...rfTok(p.first)]);
  const chiavi = tok.filter(t => !nomiPaz.some(n => rfNomeCorrisponde(t, n)));
  const candidati = pazienti.length ? DOCUMENTS.filter(d => pazienti.some(p => p.id === d.p)) : DOCUMENTS;
  const punteggio = (d) => {
    const testo = rfTok(`${d.t} ${d.filename || ''} ${DOC_TYPE[d.type] || ''}`);
    let n = 0;
    for (const k of chiavi) if (testo.some(w => w === k || (k.length >= 4 && w.startsWith(k.slice(0, 5))) || (w.length >= 4 && k.startsWith(w.slice(0, 5))))) n++;
    return n;
  };
  const trovati = candidati.map(d => ({ d, n: punteggio(d) })).filter(x => (chiavi.length ? x.n > 0 : true)).sort((a, b) => b.n - a.n || String(b.d.date).localeCompare(String(a.d.date))).slice(0, 6);
  return { pazienti, chiavi, trovati };
}
function rfRispostaDocumento(q) {
  const ql = q.toLowerCase();
  const parlaDiDocumenti = /trov|cerc|mostr|apr|dammi|fammi|document|esam|refert|duplex|eco|ecg|holter|tac|letter|risonanz|coronar|laborator|ergometr|scintigraf|dimission|cartella|allegat|pdf|file/.test(ql);
  const nominaPaziente = PATIENTS.some(p => [...rfTok(p.last), ...rfTok(p.first)].some(n => n.length >= 4 && rfTok(ql).some(t => t === n || t.startsWith(n) || n.startsWith(t))));
  if (!parlaDiDocumenti && !nominaPaziente) return null;
  if (/referti (da )?(controllare|rivedere|approvare)|bozze/.test(ql)) return null;
  if (/\b(oggi|stamattina|ieri)\b/.test(ql) && /esam|document|refert|fatt/.test(ql) && !PATIENTS.some(p => [...rfTok(p.last), ...rfTok(p.first)].some(n => rfTok(ql).some(t => rfNomeCorrisponde(t, n))))) {
    const giorno = /ieri/.test(ql) ? new Date(Date.now() - 86400000) : new Date();
    const gg = `${String(giorno.getDate()).padStart(2, '0')}.${String(giorno.getMonth() + 1).padStart(2, '0')}.${giorno.getFullYear()}`;
    const oggiDoc = DOCUMENTS.filter(d => d.date === gg);
    return oggiDoc.length
      ? `<b>Documenti caricati ${/ieri/.test(ql) ? 'ieri' : 'oggi'} (${oggiDoc.length})</b><br>` + oggiDoc.slice(0, 8).map(d => `• ${rfEsc(d.t)}${P[d.p] ? ' · ' + rfEsc(fullName(P[d.p])) : ''} · ${DOC_TYPE[d.type] || ''} <button class="btn sm" data-doc="${d.id}">Apri</button>`).join('<br>')
      : `Nessun documento caricato in cartella ${/ieri/.test(ql) ? 'ieri' : 'oggi'}. Gli esami eseguiti in studio arrivano in cartella quando la segreteria li carica; l'agenda di oggi la vedi con «quanti appuntamenti oggi».`;
  }
  const r = rfCercaDocumenti(q);
  if (!r) return null;
  const { pazienti, chiavi, trovati } = r;
  if (!pazienti.length && !chiavi.length) return null;
  const chi = pazienti.length ? pazienti.map(p => fullName(p)).join(', ') : null;
  if (trovati.length === 1 && /^(apri|aprimi|mostrami|fammi vedere|vedi|visualizza)/.test(ql.trim()) && typeof dvOpen === 'function') {
    const d = trovati[0].d;
    setTimeout(() => dvOpen(d.id), 50);
    return `Apro «${rfEsc(d.t)}»${P[d.p] ? ` di ${rfEsc(fullName(P[d.p]))}` : ''} (${d.date}). Puoi chiedermi cosa dice.`;
  }
  if (trovati.length) {
    return `<b>${trovati.length === 1 ? 'Trovato' : 'Trovati'}${chi ? ` per ${rfEsc(chi)}` : ''}</b><br>` + trovati.map(({ d }) => `• ${rfEsc(d.t)}${!chi && P[d.p] ? ' · ' + rfEsc(fullName(P[d.p])) : ''} · ${DOC_TYPE[d.type] || ''} · ${d.date} <button class="btn sm" data-doc="${d.id}">Apri</button> <a class="btn sm ghost" href="/api/documents/${d.id}" target="_blank" rel="noopener" title="Scarica il file">↓</a>`).join('<br>') + (pazienti.length === 1 ? `<br><a class="btn sm ghost" data-go="#/patients/${pazienti[0].id}">Scheda di ${rfEsc(fullName(pazienti[0]))}</a>` : '');
  }
  if (pazienti.length) return `Per ${rfEsc(chi)} non trovo documenti${chiavi.length ? ` che parlino di «${rfEsc(chiavi.join(' '))}»` : ' in cartella'}.${pazienti.length === 1 ? ` <a class="btn sm ghost" data-go="#/patients/${pazienti[0].id}">Apri la scheda</a>` : ''}`;
  if (chiavi.length) {
    const elenco = PATIENTS.filter(p => (p.docs && p.docs.length) || p.referrals && p.referrals.length).slice(0, 8).map(p => rfEsc(fullName(p)));
    return `Nessun paziente in cartella corrisponde a «${rfEsc(chiavi.join(' '))}».${elenco.length ? `<br>Pazienti con documenti o referral in cartella: ${elenco.join(', ')}.` : ' La cartella è ancora vuota: i pazienti entrano con le referral, l\'agenda o il caricamento di documenti.'}<br>Chiedi con cognome e tipo di esame, per esempio «duplex di Blazek».`;
  }
  return null;
}

function rfRispostaImmediata(q) {
  const ql = q.toLowerCase();
  // Con un documento aperto accanto, le domande su «questo documento», i
  // valori, le conclusioni, un riassunto vanno al modello con il suo testo.
  if (DV.open && DV.item && DV.item.live && /questo|questa|documento|file|riassum|cosa dice|valor|conclusion|risultat|referto|esame|spieg|significa|anomal|normale|terapia|dosaggi|quando|chi ha|data/.test(ql) && !/trov|cerc|altri documenti|documenti di/.test(ql)) return null;
  const doc = rfRispostaDocumento(q);
  if (doc) return doc;
  const s = (RF.data && RF.data.stats) || {};
  const appts = [...APPTS].sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = appts.find(a => a.status !== 'COMPLETED' && a.start >= hm) || appts.find(a => a.status !== 'COMPLETED');
  const riga = (t) => rfEsc(t);
  if (/prossim[oa] (paziente|appuntamento)|chi (è|e) il prossimo|dopo chi/.test(ql)) {
    return next ? `<b>Prossimo paziente</b><br>${next.start} · ${riga(fullName(P[next.p]))} · ${riga(next.reason)} · ${riga(DOCTORS[next.doc] || '')}${next.late ? ' · <span class="badge danger">in ritardo</span>' : ''}` : 'Nessun altro appuntamento oggi.';
  }
  if (/quanti (appuntamenti|pazienti)|appuntamenti (ci sono )?oggi|agenda di oggi|riassum/.test(ql)) {
    const primo = appts[0]; const ultimo = appts[appts.length - 1];
    const medici = [...new Set(appts.map(a => DOCTORS[a.doc]).filter(Boolean))];
    return `<b>Oggi</b><br>• ${appts.length} appuntamenti${appts.length ? ` dalle ${primo.start} alle ${ultimo.start}` : ''}${medici.length ? ` · ${medici.join(', ')}` : ''}<br>• ${s.visti_oggi || 0} già visti${next ? `, prossimo ${next.start} ${riga(fullName(P[next.p]))}` : ''}<br>• ${s.bozze_da_rivedere || 0} referti da controllare · ${s.urgenti || 0} referral urgenti · ${s.da_prenotare || 0} da prenotare · ${s.richiami_scaduti || 0} richiami scaduti<br>• ${TASKS.length} cose da fare in tutto`;
  }
  if (/referti (da )?(controllare|rivedere|approvare)|bozze/.test(ql)) {
    const aperti = RF.queue.filter(r => r.status !== 'APPROVED');
    return aperti.length ? `<b>Referti da controllare (${aperti.length})</b><br>${aperti.slice(0, 6).map(r => `• ${riga(fullName(P[r.p]))} · ${riga(r.note)} · ${r.crit} critiche`).join('<br>')}` : 'Nessun referto da controllare.';
  }
  if (/urgent/.test(ql)) return `<b>Referral urgenti aperte</b>: ${s.urgenti || 0}${TASKS.filter(t => t.prio === 'urgent').length ? '<br>' + TASKS.filter(t => t.prio === 'urgent').slice(0, 6).map(t => `• ${riga(t.title)}`).join('<br>') : ''}`;
  if (/richiam|follow.?up/.test(ql)) { const l = TASKS.filter(t => t.cat === 'followup'); return l.length ? `<b>Richiami scaduti (${l.length})</b><br>${l.slice(0, 8).map(t => `• ${riga(t.title)}`).join('<br>')}` : 'Nessun richiamo scaduto.'; }
  if (/da prenotare|prenotare/.test(ql)) { const l = TASKS.filter(t => t.cat === 'call'); return l.length ? `<b>Da prenotare o richiamare (${l.length})</b><br>${l.slice(0, 8).map(t => `• ${riga(t.title)}`).join('<br>')}` : 'Niente da prenotare.'; }
  if (/cosa devo fare|da fare|attivit|task/.test(ql)) return TASKS.length ? `<b>Da fare (${TASKS.length})</b><br>${TASKS.slice(0, 8).map(t => `• ${riga(t.title)} · ${riga(t.due)}`).join('<br>')}` : 'Niente in sospeso.';
  if (/document/.test(ql)) return DOCUMENTS.length ? `<b>Documenti recenti</b><br>${DOCUMENTS.slice(0, 6).map(d => `• ${riga(d.t)}${P[d.p] ? ' · ' + riga(fullName(P[d.p])) : ''} · ${d.date}`).join('<br>')}` : 'Nessun documento in cartella.';
  if (/in ritardo/.test(ql)) { const l = appts.filter(a => a.late); return l.length ? `<b>In ritardo</b><br>${l.map(a => `• ${a.start} ${riga(fullName(P[a.p]))}`).join('<br>')}` : 'Nessuno in ritardo.'; }
  return null;
}


/* ---------- procedure con traccia: briefing pre-visita ---------- */
/* Il briefing lo decide il CODICE della piattaforma (referral, questionario,
   ultimo referto e terapia, esami con le condizioni ECG 12 mesi / eco 24
   mesi, agenda, sospesi); il modello locale scrive solo la sintesi. Ogni
   risposta porta la sua traccia («Da dove viene»): passi, fonti, mancanze. */
(function () {
  const st = document.createElement('style');
  st.textContent = `
  .rf-brief .rf-sez{margin-top:10px}.rf-brief .rf-sez b{display:block;margin-bottom:2px}
  .rf-brief .rf-riga{display:flex;gap:6px;align-items:baseline;margin:2px 0}.rf-brief .rf-riga .btn.sm{padding:0 6px;line-height:18px;font-size:11px}
  .rf-brief .rf-manc{margin-top:10px;padding:8px 10px;border-radius:8px;background:rgba(214,92,42,.10);border:1px solid rgba(214,92,42,.35)}
  .rf-brief .rf-sint{margin-bottom:6px;padding:8px 10px;border-radius:8px;background:rgba(13,92,72,.08);border:1px solid rgba(13,92,72,.25)}
  .rf-note-seg{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--warning-soft,rgba(214,150,42,.10));font-size:12.5px}
  .rf-note-seg svg{width:16px;height:16px}
  .rf-traccia{margin-top:8px;font-size:12px}.rf-traccia summary{cursor:pointer;opacity:.75}.rf-traccia summary:hover{opacity:1}
  .rf-traccia ul{margin:6px 0 0 0;padding-left:16px}.rf-traccia li{margin:2px 0}
  .rf-traccia .ok{color:var(--ok,#0d5c48)}.rf-traccia .mancante{color:#b43c14}.rf-traccia .vuoto{opacity:.6}`;
  document.head.appendChild(st);
})();
const rfUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
function rfDomandaBriefing(q) {
  return /briefing|prepar(a|ami|are|azione)( la| alla| della| per la)? visita|prima della visita|preparami|cosa (devo|dobbiamo) sapere (su|di|prima)|riassunto (del |della )?(paziente|cartella)|sintesi (del |della )?(paziente|cartella)|prossimo paziente.*(prepar|brief)/.test(q.toLowerCase());
}
function rfPazienteDaDomanda(q) {
  const r = rfCercaDocumenti(q);
  const trovati = r && r.pazienti ? r.pazienti.filter(p => rfUuid(p.id)) : [];
  if (trovati.length === 1) return { p: trovati[0] };
  if (trovati.length > 1) return { ambigui: trovati };
  const ctx = state.patientCtx && P[state.patientCtx] && rfUuid(state.patientCtx) ? P[state.patientCtx] : null;
  if (ctx && (state.route === 'patient' || state.route === 'visit')) return { p: ctx };
  if (/prossimo paziente/.test(q.toLowerCase())) {
    const appts = [...APPTS].sort((a, b) => a.start.localeCompare(b.start));
    const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const next = appts.find(a => a.status !== 'COMPLETED' && a.start >= hm) || appts.find(a => a.status !== 'COMPLETED');
    if (next && P[next.p] && rfUuid(next.p)) return { p: P[next.p] };
  }
  return {};
}
function rfBottoneFonte(f) {
  if (!f) return '';
  if (f.tipo === 'documento') return `<button class="btn sm" data-doc="${f.id}" title="${rfEsc(f.titolo)}${f.data ? ' · ' + f.data : ''}">Apri</button>`;
  if (f.tipo === 'referto') return REPORTS.some(r => r.id === f.id) ? `<button class="btn sm" data-go="#/review/${f.id}" title="${rfEsc(f.titolo)}">Apri</button>` : `<button class="btn sm" data-go="#/review/${f.id}" title="${rfEsc(f.titolo)}">Apri</button>`;
  if (f.tipo === 'referral' || f.tipo === 'questionario') { const paz = PATIENTS.find(p => (p.referrals || []).some(r => r.id === f.id)); return paz ? `<button class="btn sm ghost" data-go="#/patients/${paz.id}" title="${rfEsc(f.titolo)}">Scheda</button>` : ''; }
  if (f.tipo === 'appuntamento') return `<button class="btn sm ghost" data-go="#/agenda">Agenda</button>`;
  return '';
}
function rfHtmlTraccia(t) {
  if (!t) return '';
  const segno = { ok: '✓', mancante: '✗', vuoto: '–' };
  const passi = (t.passi || []).map(p => `<li class="${p.esito}">${segno[p.esito] || '·'} ${rfEsc(p.passo)}${p.nota ? ` <span class="caption">· ${rfEsc(p.nota)}</span>` : ''}${p.fonti && p.fonti.length ? ` <span class="caption">· ${p.fonti.length} font${p.fonti.length === 1 ? 'e' : 'i'}</span>` : ''}</li>`).join('');
  const fonti = (t.fonti || []).map(f => `<li>${rfEsc(f.titolo)}${f.data ? ` · ${f.data}` : ''} ${rfBottoneFonte(f)}</li>`).join('');
  const nMan = (t.mancanti || []).length;
  const riass = `${(t.passi || []).length} passi · ${(t.fonti || []).length} fonti${nMan ? ` · ${nMan} mancant${nMan === 1 ? 'e' : 'i'}` : ''}${t.modello ? ` · ${rfEsc(t.modello)}` : ' · solo codice'}${t.durata_ms ? ` · ${(t.durata_ms / 1000).toFixed(1)} s` : ''}${t.id ? ` · traccia #${t.id}` : ''}`;
  return `<details class="rf-traccia"><summary>Da dove viene · ${riass}</summary><ul>${passi}</ul>${fonti ? `<div class="caption" style="margin-top:6px">Fonti lette</div><ul>${fonti}</ul>` : ''}</details>`;
}
function rfHtmlProcedura(b) {
  const sez = (b.sezioni || []).map(s => `<div class="rf-sez"><b>${rfEsc(s.titolo)}</b>${s.righe.map(r => `<div class="rf-riga"><span>• ${rfEsc(r.testo)}</span>${rfBottoneFonte(r.fonte)}</div>`).join('')}</div>`).join('');
  const manc = (b.mancanti || []).length ? `<div class="rf-manc"><b>${b.procedura === 'briefing_previsita' ? 'Da segnalare al medico' : 'Da fare'}</b>${b.mancanti.map(m => `<div>• ${rfEsc(m.testo)}</div>`).join('')}</div>` : '';
  const sint = b.sintesi ? `<div class="rf-sint">${rfEsc(b.sintesi).replace(/\n/g, '<br>')}</div>` : '';
  const azioni = (b.azioni || []).map(a => a.go ? `<button class="btn sm ghost" data-go="${rfEsc(a.go)}">${rfEsc(a.etichetta)}</button>` : `<a class="btn sm ghost" href="${rfEsc(a.href)}" target="_blank" rel="noopener">${rfEsc(a.etichetta)}</a>`).join(' ');
  const passi = b.traccia && b.traccia.passi ? b.traccia.passi : b.passi;
  return `<div class="rf-brief"><b>${rfEsc(b.titolo)}</b>${sint}${sez}${manc}${azioni ? `<div class="row mt-8">${azioni}</div>` : ''}${rfHtmlTraccia({ id: b.traccia && b.traccia.id, passi, fonti: b.fonti, mancanti: b.mancanti, modello: b.traccia && b.traccia.modello, durata_ms: b.traccia && b.traccia.durata_ms })}</div>`;
}
const rfHtmlBriefing = rfHtmlProcedura;
function rfProcedura(corpo, attesa) {
  state.aiState = 'thinking';
  const id = 'ai' + Date.now();
  state.aiMessages.push({ id, html: `<div class="ai-msg ai" id="${id}"><span class="caption">${rfEsc(attesa)}</span></div>` });
  render();
  const fine = (html, fonte) => {
    state.aiMessages = state.aiMessages.filter(m => m.id !== id);
    state.aiMessages.push({ html: `<div class="ai-msg ai">${html}<div class="srcs"><span class="src">${fonte}</span></div></div>` });
    state.aiState = 'idle'; render();
  };
  fetch('/api/prototipo/procedura', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then(async r => {
      if (!r.ok) { fine('Non riesco a eseguire la procedura in questo momento.', 'Piattaforma'); return; }
      fine(rfHtmlProcedura(await r.json()), 'Procedura della piattaforma · solo codice');
    })
    .catch(() => fine('Non riesco a eseguire la procedura in questo momento.', 'Piattaforma'));
}
function rfDomandaGiornata(q) { return /prepar(a|ami|are|azione)( la| della| mia)? giornata|briefing (di|per) (tutti|oggi|la giornata)|tutti i pazienti di oggi|giornata di oggi|preparami (la )?giornata|prepara oggi/.test(q.toLowerCase()); }
function rfDomandaLettere(q) { return /letter[ae] in ritardo|referti (confermati )?senza word|word non (scaricat|prodott)|bozze ferme|in ritardo con (le lettere|i referti)|lettere da (mandare|spedire|inviare)/.test(q.toLowerCase()); }
function rfDomandaChiusura(q) { return /chiusura (mensile|del mese)|chiud(i|ere) il mese|bilancio del mese|numeri del mese|com.è andato il mese|resoconto (mensile|del mese)/.test(q.toLowerCase()); }
function rfMeseDaDomanda(q) {
  const m = q.toLowerCase().match(/(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?/);
  if (!m) return null;
  const idx = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'].indexOf(m[1]);
  const anno = m[2] ? Number(m[2]) : new Date().getFullYear();
  return `${anno}-${String(idx + 1).padStart(2, '0')}`;
}
function rfDomandaCambiamenti(q) { return /cosa (è|e') cambiat|cos'è cambiat|differenz|confront.*(ultim|preced)|rispetto all.ultima|dall.ultima visita/.test(q.toLowerCase()); }
function rfDomandaRichiamiMese(q) { return /richiami (del|di questo|in scadenza|prossim|del prossimo)|chi (devo|dobbiamo|va) (ri)?chiam|da richiamare/.test(q.toLowerCase()); }
function rfDomandaPreFirma(q) { return /prima della firma|pronto per la firma|posso firmar|si può firmar|controllo (pre|prima)|controlla (il|questo) referto|manca (qualcosa|niente) (per|prima)/.test(q.toLowerCase()); }
function rfBozzaDaContesto(q) {
  if (state.route === 'review' && state.params && state.params.id && rfUuid(state.params.id)) return state.params.id;
  const chi = rfPazienteDaDomanda(q);
  const p = chi.p;
  const aperte = RF.queue.filter(r => r.status !== 'APPROVED' && (!p || r.p === p.id));
  if (aperte.length === 1 || (p && aperte.length)) return aperte[0].id;
  return null;
}
function rfBriefing(p) {
  state.aiState = 'thinking';
  const id = 'ai' + Date.now();
  state.aiMessages.push({ id, html: `<div class="ai-msg ai" id="${id}"><span class="caption">Preparo il briefing di ${rfEsc(fullName(p))}: leggo cartella, referti e agenda…</span></div>` });
  render();
  const fine = (html, fonte) => {
    state.aiMessages = state.aiMessages.filter(m => m.id !== id);
    state.aiMessages.push({ html: `<div class="ai-msg ai">${html}<div class="srcs"><span class="src">${fonte}</span></div></div>` });
    state.aiState = 'idle'; render();
  };
  fetch('/api/prototipo/briefing', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient_id: p.id }) })
    .then(async r => {
      if (!r.ok) { fine('Non riesco a preparare il briefing in questo momento.', 'Piattaforma'); return; }
      const b = await r.json();
      fine(rfHtmlBriefing(b), b.traccia.modello ? 'Procedura della piattaforma · sintesi del modello locale' : 'Procedura della piattaforma · solo codice');
    })
    .catch(() => fine('Non riesco a preparare il briefing in questo momento.', 'Piattaforma'));
}

/* ---------- grafo operativo e organizzativo: registro delle procedure ---------- */
/* Le procedure arrivano dal server COME DATI (src/lib/procedure-registro.ts):
   frasi che le attivano, input che serve, chip per pagina, chi ne risponde e
   quando (wiki «Organizzazione dello studio»). Il ponte non decide più con le
   sue espressioni: legge il registro. */
async function rfCaricaProcedure() {
  try {
    const r = await fetch('/api/prototipo/procedure', { credentials: 'include' });
    if (!r.ok) return;
    const j = await r.json();
    RF.procedure = Array.isArray(j.procedure) ? j.procedure : [];
    RF.org = j.organizzazione || null;
  } catch { /* si resta con l'instradamento di riserva */ }
}
function rfTrovaProcedura(q) {
  const ql = q.toLowerCase();
  for (const p of RF.procedure) if ((p.frasi || []).some(f => { try { return new RegExp(f, 'i').test(ql); } catch { return false; } })) return p;
  return null;
}
function rfRispondiSubito(html) {
  state.aiMessages.push({ html: `<div class="ai-msg ai">${html}<div class="srcs"><span class="src">Piattaforma · immediato</span></div></div>` });
  state.aiState = 'idle'; render();
}
function rfLanciaProcedura(def, q) {
  const chi = def.responsabile ? ` <span class="caption">· ${rfEsc(def.responsabile.ruolo)}${def.responsabile.quando ? ', ' + rfEsc(def.responsabile.quando) : ''}</span>` : '';
  if (def.input === 'paziente') {
    const r = rfPazienteDaDomanda(q);
    if (r.p) { if (def.nome === 'briefing_previsita') rfBriefing(r.p); else rfProcedura({ nome: def.nome, patient_id: r.p.id }, def.attesa); return; }
    const testo = r.ambigui
      ? `Per questo uso la procedura «${rfEsc(def.titolo)}»${chi}. Più pazienti corrispondono: ${r.ambigui.map(p => `<button class="btn sm" data-ai="${rfEsc(def.titolo)} di ${rfEsc(fullName(p))}">${rfEsc(fullName(p))}</button>`).join(' ')}`
      : `Per questo uso la procedura «${rfEsc(def.titolo)}»${chi}: mi serve il paziente. Scrivi il cognome («${rfEsc(def.titolo.toLowerCase())} di Bernasconi») oppure apri la sua scheda.`;
    rfRispondiSubito(testo); return;
  }
  if (def.input === 'bozza') {
    const bid = rfBozzaDaContesto(q);
    if (bid) { rfProcedura({ nome: def.nome, bozza_id: bid }, def.attesa); return; }
    rfRispondiSubito(`Per questo uso la procedura «${rfEsc(def.titolo)}»${chi}: mi serve la bozza. Apri una revisione e richiedila, oppure scrivi il cognome del paziente.`); return;
  }
  const corpo = { nome: def.nome };
  if ((def.parametri || []).includes('mese')) { const m = rfMeseDaDomanda(q); if (m) corpo.mese = m; }
  rfProcedura(corpo, def.attesa);
}
/* «Chi si occupa di…», «quando si fa…»: risposta dal grafo organizzativo. */
function rfRispostaOrganizzazione(q) {
  if (!RF.org || !RF.org.responsabilita || !RF.org.responsabilita.length) return null;
  const ql = q.toLowerCase();
  if (!/chi (si occupa|è responsabile|e' responsabile|fa|deve|segue|controlla|gestisce)|di chi (è|e')|quando si (fa|fanno|controlla|controllano|prepara|chiude)|responsabil|chi risponde/.test(ql)) return null;
  const tok = rfTok(ql).filter(t => !RF_GENERICHE.has(t) && !['occupa', 'responsabile', 'quando', 'deve', 'segue', 'controlla', 'gestisce', 'risponde'].includes(t));
  const punteggio = (r) => { const testo = rfTok(`${r.cosa} ${r.quando} ${r.note} ${r.procedura || ''}`); return tok.filter(t => testo.some(w => w === t || (t.length >= 4 && w.startsWith(t.slice(0, 5))) || (w.length >= 4 && t.startsWith(w.slice(0, 5))))).length; };
  const trovate = RF.org.responsabilita.map(r => ({ r, n: punteggio(r) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4);
  if (!trovate.length) return `Non trovo questa responsabilità nell'organizzazione dello studio. Ruoli: ${RF.org.ruoli.map(r => rfEsc(r.ruolo)).join(', ')}. La pagina wiki «Organizzazione dello studio» si può completare.`;
  return `<b>Dal grafo organizzativo</b><br>` + trovate.map(({ r }) => `• <b>${rfEsc(r.ruolo)}</b>: ${rfEsc(r.cosa)}${r.quando ? ` · ${rfEsc(r.quando)}` : ''}${r.procedura ? ` <button class="btn sm ghost" data-ai="${rfEsc((RF.procedure.find(p => p.nome === r.procedura) || {}).titolo || r.procedura)}">${rfEsc((RF.procedure.find(p => p.nome === r.procedura) || {}).titolo || r.procedura)}</button>` : ''}${r.note && r.note !== '—' ? `<br><span class="caption">${rfEsc(r.note)}</span>` : ''}`).join('<br>');
}

const rfQuickOrig = aiQuickActions;
aiQuickActions = function () {
  if (!RF.live) return rfQuickOrig();
  const r = state.route;
  if (RF.procedure.length) {
    const ctx = (r === 'patient' || r === 'visit') ? (rfUuid(state.patientCtx) ? 'patient' : 'nessuno') : r;
    const dalRegistro = RF.procedure.flatMap(p => (p.chip || []).filter(c => c.contesto === ctx).map(c => c.etichetta));
    const extra = { patient: ['Quali esami ha in cartella?', 'Qual è la terapia in corso?'], review: ['Referti da controllare'], home: ['Quanti appuntamenti oggi?'], reports: ['Referti da controllare'], agenda: ['Quanti appuntamenti oggi?', 'Chi è in ritardo?'] }[ctx] || ['Quanti appuntamenti oggi?', 'Referti da controllare', 'Trova un documento di un paziente', 'Chi si occupa dei richiami?'];
    return [...new Set([...dalRegistro, ...extra])].slice(0, 5);
  }
  if ((r === 'patient' || r === 'visit') && rfUuid(state.patientCtx)) return ['Briefing pre-visita', 'Cosa è cambiato dall\'ultima visita?', 'Quali esami ha in cartella?', 'Trova l\'ultimo ECG'];
  if (r === 'review') return ['Controllo prima della firma', 'Cosa è cambiato dall\'ultima visita?', 'Referti da controllare'];
  if (r === 'home') return ['Preparazione della giornata', 'Briefing del prossimo paziente', 'Lettere in ritardo', 'Chiusura mensile'];
  if (r === 'reports') return ['Lettere in ritardo', 'Referti da controllare', 'Chiusura mensile'];
  if (r === 'agenda') return ['Preparazione della giornata', 'Quanti appuntamenti oggi?', 'Chi è in ritardo?'];
  return ['Richiami del mese', 'Referti da controllare', 'Trova un documento di un paziente', 'Quanti appuntamenti oggi?'];
};


/* ---------- interprete delle domande scritte (server, in codice) ---------- */
/* La domanda va a /api/prototipo/interpreta: normalizzazione, refusi,
   procedura dal registro, paziente/mese/giorno, contesto della pagina. Il
   modello locale fa da giudice solo nei casi probabili, e vale solo se
   sceglie nel registro. Qui si esegue quello che l'interprete ha capito. */
function rfContestoInterprete() {
  return {
    pagina: state.route,
    paziente_id: state.patientCtx && rfUuid(state.patientCtx) ? state.patientCtx : null,
    bozza_id: state.route === 'review' && state.params && rfUuid(state.params.id) ? state.params.id : null,
    documento_id: DV.open && DV.item && DV.item.live ? DV.item.id : null,
  };
}
function rfPazienteLocale(id, nome) {
  if (P[id]) return P[id];
  const pezzi = String(nome || '').split(' ');
  return { id, last: pezzi[0] || '', first: pezzi.slice(1).join(' ') };
}
async function rfInterpretaEAgisci(q) {
  state.aiState = 'thinking';
  const id = 'ai' + Date.now();
  state.aiMessages.push({ id, html: `<div class="ai-msg ai" id="${id}"><span class="caption">Interpreto la domanda…</span></div>` });
  render();
  let esito = null;
  try {
    const r = await fetch('/api/prototipo/interpreta', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domanda: q, contesto: rfContestoInterprete() }) });
    if (r.ok) esito = await r.json();
  } catch { esito = null; }
  state.aiMessages = state.aiMessages.filter(m => m.id !== id);
  if (!esito || esito.azione === 'libera') { rfRispondiLibera(q); return; }
  const def = RF.procedure.find(p => p.nome === esito.procedura.nome) || esito.procedura;
  const capito = `<span class="caption">Ho capito: ${rfEsc(esito.spiegazione)}</span>`;
  if (esito.azione === 'chiedi') {
    let testo;
    if (esito.pazientiAmbigui && esito.pazientiAmbigui.length) testo = `${capito}<br>Più pazienti corrispondono: ${esito.pazientiAmbigui.map(p => `<button class="btn sm" data-ai="${rfEsc(def.titolo)} di ${rfEsc(p.nome)}">${rfEsc(p.nome)}</button>`).join(' ')}`;
    else if (esito.mancano.includes('paziente')) testo = `${capito}<br>Mi serve il paziente: scrivi il cognome («${rfEsc(def.titolo.toLowerCase())} di Bernasconi») oppure apri la sua scheda.`;
    else testo = `${capito}<br>Mi serve la bozza: apri una revisione e richiedila, oppure scrivi il cognome del paziente.`;
    rfRispondiSubito(testo); return;
  }
  const par = esito.parametri || {};
  state.aiMessages.push({ html: `<div class="ai-msg ai">${capito}</div>` });
  if (def.nome === 'briefing_previsita') { rfBriefing(rfPazienteLocale(par.patient_id, esito.paziente && esito.paziente.nome)); return; }
  const corpo = { nome: def.nome };
  if (def.input === 'paziente') corpo.patient_id = par.patient_id;
  if (def.input === 'bozza') {
    let bid = par.bozza_id;
    if (!bid && par.patient_id) { const aperte = RF.queue.filter(r => r.status !== 'APPROVED' && r.p === par.patient_id); if (aperte.length) bid = aperte[0].id; }
    if (!bid) { rfRispondiSubito(`${capito}<br>Non trovo una bozza aperta per questo paziente.`); return; }
    corpo.bozza_id = bid;
  }
  if (par.mese) corpo.mese = par.mese;
  if (par.giorno) corpo.giorno = par.giorno;
  rfProcedura(corpo, def.attesa || 'Eseguo la procedura…');
}

const rfAskOrig = askAI;
askAI = function (q) {
  if (!RF.live) return rfAskOrig(q);
  if (!state.aiOpen) state.aiOpen = true;
  state.aiMessages.push({ html: `<div class="ai-msg user">${rfEsc(q)}</div>` });
  const org = rfRispostaOrganizzazione(q);
  if (org) { rfRispondiSubito(org); return; }
  if (RF.procedure.length) { void rfInterpretaEAgisci(q); return; } else {
  if (rfDomandaChiusura(q)) { const mese = rfMeseDaDomanda(q); rfProcedura(mese ? { nome: 'chiusura_mensile', mese } : { nome: 'chiusura_mensile' }, 'Raccolgo i numeri del mese…'); return; }
  if (rfDomandaLettere(q)) { rfProcedura({ nome: 'lettere_ritardo' }, 'Cerco le lettere in ritardo…'); return; }
  if (rfDomandaGiornata(q)) { rfProcedura({ nome: 'preparazione_giornata' }, 'Preparo la giornata: un briefing per ogni paziente in agenda…'); return; }
  if (rfDomandaPreFirma(q)) {
    const bid = rfBozzaDaContesto(q);
    if (bid) { rfProcedura({ nome: 'controllo_prefirma', bozza_id: bid }, 'Controllo la bozza prima della firma…'); return; }
    state.aiMessages.push({ html: `<div class="ai-msg ai">Quale referto? Apri una revisione e chiedi «controllo prima della firma», oppure scrivi il cognome del paziente.<div class="srcs"><span class="src">Piattaforma · immediato</span></div></div>` });
    state.aiState = 'idle'; render(); return;
  }
  if (rfDomandaRichiamiMese(q)) { rfProcedura({ nome: 'richiami_mese' }, 'Raccolgo i richiami del mese…'); return; }
  if (rfDomandaCambiamenti(q)) {
    const chi = rfPazienteDaDomanda(q);
    if (chi.p) { rfProcedura({ nome: 'cambiamenti_ultima_visita', patient_id: chi.p.id }, `Confronto gli ultimi due referti di ${rfEsc(fullName(chi.p))}…`); return; }
    state.aiMessages.push({ html: `<div class="ai-msg ai">Di quale paziente? Scrivi il cognome («cosa è cambiato per Bernasconi») o apri la sua scheda.<div class="srcs"><span class="src">Piattaforma · immediato</span></div></div>` });
    state.aiState = 'idle'; render(); return;
  }
  if (rfDomandaBriefing(q)) {
    const chi = rfPazienteDaDomanda(q);
    if (chi.p) { rfBriefing(chi.p); return; }
    const testo = chi.ambigui ? `Più pazienti corrispondono: ${chi.ambigui.map(p => `<button class="btn sm" data-ai="Briefing pre-visita di ${rfEsc(fullName(p))}">${rfEsc(fullName(p))}</button>`).join(' ')}` : 'Di quale paziente? Scrivi il cognome, per esempio «briefing di Bernasconi», oppure apri la sua scheda e chiedi «briefing pre-visita».';
    state.aiMessages.push({ html: `<div class="ai-msg ai">${testo}<div class="srcs"><span class="src">Piattaforma · immediato</span></div></div>` });
    state.aiState = 'idle'; render(); return;
  }
  }
  rfRispondiLibera(q);
};
function rfRispondiLibera(q) {
  const immediata = rfRispostaImmediata(q);
  if (immediata) {
    state.aiMessages.push({ html: `<div class="ai-msg ai">${immediata}<div class="srcs"><span class="src">Piattaforma · immediato</span></div></div>` });
    state.aiState = 'idle'; render(); return;
  }
  state.aiState = 'thinking';
  const id = 'ai' + Date.now();
  state.aiMessages.push({ id, html: `<div class="ai-msg ai" id="${id}"><span class="caption">Chiedo al modello locale…</span></div>` });
  render();
  const fine = (html, fonte) => {
    state.aiMessages = state.aiMessages.filter(m => m.id !== id);
    state.aiMessages.push({ html: `<div class="ai-msg ai">${html}<div class="srcs"><span class="src">${fonte}</span></div></div>` });
    state.aiState = 'idle'; render();
  };
  fetch('/api/prototipo/assistente', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domanda: q, ruolo: state.role, contesto: rfContestoBot(), documento_id: DV.open && DV.item && DV.item.live ? DV.item.id : null, paziente_id: state.patientCtx && rfUuid(state.patientCtx) ? state.patientCtx : null }) })
    .then(async r => {
      if (!r.ok || !r.body) { fine('L\'assistente non è raggiungibile in questo momento.', 'Piattaforma'); return; }
      const fonte = r.headers.get('X-Fonte') === 'modello locale' ? 'Modello locale · dati della piattaforma' : 'Piattaforma';
      const lettore = r.body.getReader(); const dec = new TextDecoder(); let testo = '';
      for (;;) {
        const { value, done } = await lettore.read();
        if (done) break;
        testo += dec.decode(value, { stream: true });
        const el = document.getElementById(id);
        if (el) el.innerHTML = rfEsc(testo).replace(/\n/g, '<br>') + '<span class="caption"> ▍</span>';
      }
      const tid = r.headers.get('X-Traccia');
      let traccia = '';
      if (tid) { try { const rt = await fetch(`/api/prototipo/tracce/${tid}`, { credentials: 'include' }); if (rt.ok) traccia = rfHtmlTraccia(await rt.json()); } catch { /* senza traccia */ } }
      fine(rfEsc(testo.trim() || 'Nessuna risposta.').replace(/\n/g, '<br>') + traccia, fonte);
    })
    .catch(() => fine('L\'assistente non è raggiungibile in questo momento.', 'Piattaforma'));
};


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
const rfMobileNavOrig = renderMobileNav;
renderMobileNav = function () {
  if (!RF.live) return rfMobileNavOrig();
  const nav = document.getElementById('mobilenav');
  if (!nav) return;
  nav.classList.add('rf-pill');
  nav.classList.toggle('rf-ai', !!state.aiOpen);
  const voci = [['home', 'Oggi', 'home'], ['agenda', 'Agenda', 'agenda'], ['patients', 'Pazienti', 'patients'], ['reports', 'Referti', 'reports'], ['dittafono', 'Dittafono', 'mic'], ['ai', 'AI', 'ai']];
  const attiva = (k) => k === 'ai' ? state.aiOpen : (state.route === k || (k === 'patients' && ['patient', 'visit'].includes(state.route)) || (k === 'reports' && ['report', 'review'].includes(state.route)));
  nav.innerHTML = voci.map(([k, l, i]) => `<button class="${attiva(k) ? 'active' : ''}" data-mnav="${k}" aria-label="${l}">${ICONS[i] || ''}<span>${l}</span></button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.mnav;
    if (k === 'ai') { state.aiOpen = !state.aiOpen; render(); return; }
    if (k === 'dittafono') { window.location.href = '/dittafono/index.html'; return; }
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
  return `<div class="grid grid-2"><div class="card"><div class="card-head"><span class="section-title">Anagrafica</span></div><div class="kv"><b>Nascita</b><span>${p.dob || '—'}</span><b>Telefono</b><span>${rfEsc(p.phone || '—')}</span><b>Medico inviante</b><span>${rfEsc(p.gp || '—')}</span><b>Assicurazione</b><span>${rfEsc(p.assicurazione || '—')}</span></div></div><div class="card"><div class="card-head"><span class="section-title">Referral</span></div><div class="list">${(p.referrals || []).map(r => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(r.quesito || 'quesito non indicato')}</div><div class="sub">${r.at} · ${rfEsc(r.medico || '')} · ${rfEsc(r.status || '')}${r.urgenza === 'urgente' ? ' · <b>urgente</b>' : ''}</div></div></div>`).join('') || '<div class="caption">Nessuna referral.</div>'}</div></div></div>`;
};
// La pagina «visita» del prototipo è demo: dentro la piattaforma si apre la scheda del paziente.
if (typeof PAGES !== 'undefined' && PAGES.visit) {
  const rfVisitOrig = PAGES.visit;
  PAGES.visit = () => { if (!RF.live) return rfVisitOrig(); const id = state.params && state.params.id; setTimeout(() => go(id ? `#/patients/${id}` : '#/patients'), 0); return '<div class="page"><div class="caption">Apro la scheda…</div></div>'; };
}


/* ---------- anonimizzazione: stessa libreria della piattaforma, modello locale ---------- */
RF.anon = { stato: 'pronto', esito: null, errore: null, file: null, t0: 0 };
const rfAnonOrig = PAGES.anonymize;
PAGES.anonymize = () => {
  if (!RF.live) return rfAnonOrig();
  const a = RF.anon;
  const evidenzia = (testo, sost) => {
    let out = rfEsc(testo);
    for (const s of [...sost].sort((x, y) => y.originale.length - x.originale.length)) {
      if (!s.originale) continue;
      out = out.split(rfEsc(s.originale)).join(`<mark class="rf-anon-mark" title="→ ${rfEsc(s.segnaposto)}">${rfEsc(s.originale)}</mark>`);
    }
    return out.replace(/\n/g, '<br>');
  };
  const tipi = (sost) => { const m = {}; for (const s of sost) { const k = String(s.segnaposto || '').replace(/[\[\]_\d]/g, '').trim() || 'altro'; m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((x, y) => y[1] - x[1]); };
  return `
    <div class="page-head"><div><h2 class="page-title">Anonimizzazione documenti</h2><div class="page-sub">Toglie i dati identificativi da un testo clinico prima di condividerlo o usarlo come esempio. Modello locale sul Mac dello studio, niente cloud, niente salvataggio.</div></div>
      <div class="actions">${a.esito ? `<button class="btn" onclick="rfAnonNuovo()">Nuovo</button>` : ''}</div></div>
    ${!a.esito ? `
    <div class="grid grid-main-side">
      <div class="card">
        <div class="field"><label>Testo da anonimizzare</label><textarea class="input" id="rf-anon-in" rows="14" placeholder="Incolla qui il testo… oppure scegli un file sotto (.txt, .md, .pdf con testo, .docx)"></textarea></div>
        <div class="row wrap mt-16" style="gap:10px;align-items:center">
          <input type="file" id="rf-anon-file" class="input sm" accept=".txt,.md,.csv,.json,.html,.htm,.pdf,.docx" style="max-width:320px">
          <button class="btn primary" id="rf-anon-via" onclick="rfAnonAvvia()" ${a.stato === 'lavora' ? 'disabled' : ''}>${ICONS.shield || ''} ${a.stato === 'lavora' ? 'Anonimizzo…' : 'Anonimizza'}</button>
        </div>
        ${a.stato === 'lavora' ? `<div class="rf-imp-track mt-16"><div class="rf-imp-fill" style="width:40%"></div></div><div class="caption mt-8" id="rf-anon-stato">Il modello locale legge il testo e individua i dati identificativi (10-90 secondi)…</div>` : ''}
        ${a.errore ? `<div class="rf-manc mt-16">${rfEsc(a.errore)}</div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="section-title">Come funziona</div><div class="meta" style="line-height:1.7;font-size:13px;margin-top:6px">Il modello locale individua nomi, date di nascita, indirizzi, numeri AVS, telefoni, e-mail e riferimenti a persone; il <b>codice</b> li sostituisce con segnaposto coerenti (la stessa persona ha sempre lo stesso segnaposto). Una rete di regole copre AVS, e-mail e telefoni svizzeri anche se il modello li perde.</div></div>
        <div class="card"><div class="section-title">Che cosa NON fa</div><div class="meta" style="line-height:1.7;font-size:13px;margin-top:6px">Non anonimizza le scansioni senza testo. Non toglie i dati clinici (diagnosi, terapie, misure): quelli restano, sono il contenuto. Il testo non viene salvato da nessuna parte.</div></div>
      </div>
    </div>` : `
    <div class="card tight mb-16 row wrap" style="gap:10px">
      <span class="badge success">${ICONS.check || ''} ${a.esito.sostituzioni.length} sostituzioni</span>
      ${tipi(a.esito.sostituzioni).map(([k, n]) => `<span class="badge">${rfEsc(k)} · ${n}</span>`).join('')}
      <span class="caption">${rfEsc(a.esito.modello)} · ${(a.esito.ms / 1000).toFixed(1)} s</span>
      <span class="right row" style="gap:6px"><button class="btn sm" onclick="rfAnonCopia()">${ICONS.copy || ''} Copia</button><button class="btn sm" onclick="rfAnonScarica()">${ICONS.upload || ''} Scarica .txt</button></span>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><span class="section-title">Originale con i rilevamenti</span></div><div class="anon-doc" style="white-space:normal;line-height:1.6">${evidenzia(a.esito.originale, a.esito.sostituzioni)}</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Anonimizzato</span><span class="caption">segnaposto</span></div><textarea class="input" id="rf-anon-out" rows="18" readonly>${rfEsc(a.esito.testo)}</textarea></div>
    </div>`}`;
};
async function rfAnonAvvia() {
  const ta = document.getElementById('rf-anon-in'); const fi = document.getElementById('rf-anon-file');
  const testo = ta ? ta.value.trim() : ''; const file = fi && fi.files && fi.files[0];
  if (!testo && !file) { toast('Incolla un testo o scegli un file'); return; }
  RF.anon = { stato: 'lavora', esito: null, errore: null, t0: Date.now() };
  render();
  try {
    const fd = new FormData(); if (testo) fd.append('testo', testo); if (file) fd.append('file', file);
    const r = await fetch('/api/prototipo/anonimizza', { method: 'POST', credentials: 'include', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.anon = { stato: 'pronto', esito: null, errore: j.errore || 'Anonimizzazione non riuscita.' }; render(); if (ta) ta.value = testo; return; }
    RF.anon = { stato: 'pronto', esito: j, errore: null };
    render();
  } catch { RF.anon = { stato: 'pronto', esito: null, errore: 'Piattaforma non raggiungibile.' }; render(); }
}
function rfAnonNuovo() { RF.anon = { stato: 'pronto', esito: null, errore: null }; render(); }
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
async function rfStudioCarica() {
  try { const r = await fetch('/api/prototipo/studio', { credentials: 'include' }); if (r.ok) { RF.studio.dati = await r.json(); render(); } } catch { /* riprova al prossimo giro */ }
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
  if (!d) { void rfStudioCarica(); return `<div class="page-head"><div><h2 class="page-title">Studio</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  const admin = !!d.admin;
  const scheda = RF.studio.scheda;
  const tab = (k, l, n) => `<button class="tab ${scheda === k ? 'active' : ''}" onclick="RF.studio.scheda='${k}';render()">${l}${n != null ? ` <span class="badge">${n}</span>` : ''}</button>`;
  const ruoloIt = { segretaria: 'Segreteria', medico: 'Medico', admin: 'Amministrazione' };
  const soloAdmin = admin ? '' : `<div class="caption mb-16">Solo l'amministratore dello studio può modificare: tu puoi consultare.</div>`;
  const avviso = `${RF.studio.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.studio.errore)}</div>` : ''}`;
  let corpo = '';
  if (scheda === 'studio') {
    const st = d.studio || {};
    corpo = `<div class="card"><div class="section-title">Dati dello studio</div>
      <div class="grid grid-2 mt-8">
        <div class="field"><label>Nome</label><input class="input" id="rf-st-nome" value="${rfEsc(st.nome || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Telefono</label><input class="input" id="rf-st-tel" value="${rfEsc(st.telefono || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>E-mail per gli avvisi</label><input class="input" id="rf-st-email" value="${rfEsc(st.notify_email || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Prestazioni offerte</label><input class="input" id="rf-st-spec" value="${rfEsc(st.specialita || '')}" ${admin ? '' : 'disabled'}></div>
      </div>
      ${admin ? `<div class="row mt-16"><button class="btn primary" onclick="rfStudioAzione({ azione: 'studio_aggiorna', nome: rfStudioCampo('#rf-st-nome'), telefono: rfStudioCampo('#rf-st-tel'), notify_email: rfStudioCampo('#rf-st-email'), specialita: rfStudioCampo('#rf-st-spec') })">Salva</button></div>` : ''}</div>`;
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
  } else {
    const tipo = scheda === 'sale' ? 'sala' : 'apparecchio';
    const lista = scheda === 'sale' ? d.sale : d.apparecchi;
    const titolo = scheda === 'sale' ? 'Sale' : 'Apparecchi';
    corpo = `<div class="card"><div class="card-head"><span class="section-title">${titolo}</span><span class="caption">${lista.filter(r => r.attivo).length} in uso</span></div>
      <div class="list">${lista.map(r => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(r.nome)}${r.attivo ? '' : ' <span class="badge">fuori uso</span>'}</div><div class="sub">${rfEsc(r.descrizione || '')}</div></div>
        ${admin ? `<button class="btn sm ghost" onclick="rfStudioRisorsa('${r.id}')">Modifica</button><button class="btn sm ghost" onclick="rfStudioAzione({ azione: 'risorsa_attivo', id: '${r.id}' })">${r.attivo ? 'Fuori uso' : 'Rimetti in uso'}</button>` : ''}</div>`).join('') || `<div class="caption">Nessun${scheda === 'sale' ? 'a sala' : ' apparecchio'} registrat${scheda === 'sale' ? 'a' : 'o'}.</div>`}</div></div>
      ${admin ? `<div class="card mt-16"><div class="section-title">${scheda === 'sale' ? 'Nuova sala' : 'Nuovo apparecchio'}</div><div class="grid grid-2 mt-8"><div class="field"><label>Nome</label><input class="input" id="rf-r-nome" placeholder="${scheda === 'sale' ? 'Sala 1, Sala ECG…' : 'Ecografo, Holter 3, ergometro…'}"></div><div class="field"><label>Descrizione</label><input class="input" id="rf-r-desc" placeholder="${scheda === 'sale' ? 'piano, uso' : 'modello, matricola, scadenza manutenzione'}"></div></div><div class="row mt-16"><button class="btn primary" onclick="rfStudioAzione({ azione: 'risorsa_crea', tipo: '${tipo}', nome: rfStudioCampo('#rf-r-nome'), descrizione: rfStudioCampo('#rf-r-desc') })">Aggiungi</button></div></div>` : ''}`;
  }
  return `<div class="page-head"><div><h2 class="page-title">Studio</h2><div class="page-sub">${rfEsc((d.studio || {}).nome || '')} · personale, medici dell'agenda, sale e apparecchi</div></div></div>
    <div class="tabs">${tab('studio', 'Dati')}${tab('personale', 'Personale', d.personale.length)}${tab('medici', 'Medici agenda', d.medici.length)}${tab('sale', 'Sale', d.sale.length)}${tab('apparecchi', 'Apparecchi', d.apparecchi.length)}</div>
    ${soloAdmin}${avviso}${corpo}`;
};
function rfStudioPassword(id, email) {
  openModal('Nuova password', `<p class="meta">Per <b>${rfEsc(email)}</b>. Comunicagliela a voce; la cambierà al primo accesso dal suo profilo.</p><div class="field mt-16"><label>Password (min. 8)</label><input class="input" id="rf-pw-nuova" type="password" autocomplete="new-password"></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pw-ok">Imposta</button>`);
  document.getElementById('rf-pw-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'utente_password', id, password: rfStudioCampo('#rf-pw-nuova') }); if (ok) closeModal(); };
}
function rfStudioMedico(id) {
  const m = (RF.studio.dati.medici || []).find(x => x.id === id); if (!m) return;
  const accessi = (RF.studio.dati.personale || []).filter(u => u.role === 'medico' || u.role === 'admin');
  openModal('Medico in agenda', `<div class="field"><label>Nome come in agenda</label><input class="input" id="rf-m-e-nome" value="${rfEsc(m.nome)}"></div><div class="field mt-8"><label>Altri modi in cui compare (virgole)</label><input class="input" id="rf-m-e-alias" value="${rfEsc((m.aliases || []).join(', '))}"></div><div class="field mt-8"><label>Accesso collegato</label><select class="input" id="rf-m-e-user"><option value="">nessuno</option>${accessi.map(u => `<option value="${u.id}" ${m.user_id === u.id ? 'selected' : ''}>${rfEsc(u.email)}</option>`).join('')}</select></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-m-ok">Salva</button>`);
  document.getElementById('rf-m-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'medico_aggiorna', id, nome: rfStudioCampo('#rf-m-e-nome'), aliases: rfStudioCampo('#rf-m-e-alias'), user_id: rfStudioCampo('#rf-m-e-user') }); if (ok) closeModal(); };
}
function rfStudioRisorsa(id) {
  const r = [...(RF.studio.dati.sale || []), ...(RF.studio.dati.apparecchi || [])].find(x => x.id === id); if (!r) return;
  openModal(r.tipo === 'sala' ? 'Sala' : 'Apparecchio', `<div class="field"><label>Nome</label><input class="input" id="rf-r-e-nome" value="${rfEsc(r.nome)}"></div><div class="field mt-8"><label>Descrizione</label><input class="input" id="rf-r-e-desc" value="${rfEsc(r.descrizione || '')}"></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-r-ok">Salva</button>`);
  document.getElementById('rf-r-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'risorsa_aggiorna', id, nome: rfStudioCampo('#rf-r-e-nome'), descrizione: rfStudioCampo('#rf-r-e-desc') }); if (ok) closeModal(); };
}


/* ---------- profilo: la propria password e la 2FA ---------- */
RF.profilo = { dati: null, errore: null, codici: null };
async function rfProfiloCarica() {
  try { const r = await fetch('/api/prototipo/profilo', { credentials: 'include' }); if (r.ok) { RF.profilo.dati = await r.json(); render(); } } catch { /* al prossimo */ }
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
  if (!d) { void rfProfiloCarica(); return `<div class="page-head"><div><h2 class="page-title">Profilo</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  const ruoloIt = { segretaria: 'Segreteria', medico: 'Medico', admin: 'Amministrazione' };
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
(function () { const st = document.createElement('style'); st.textContent = `.rf-codici{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:10px}.rf-codici code{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:13px;letter-spacing:.04em}`; document.head.appendChild(st); })();

/* ---------- avvio: dentro la piattaforma niente demo, mai ---------- */
function rfPaginaCarico() {
  const c = document.getElementById('content');
  if (c) c.innerHTML = `<div class="page"><div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2 class="page-title">ReferralFlow</h2><p class="meta">Carico i dati della piattaforma…</p></div></div>`;
  const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
}
if (rfDentro()) {
  const rfRenderVero = render;
  render = function () {
    if (RF.nonAutorizzato) return rfPaginaAccesso();
    if (!RF.caricato) return rfPaginaCarico();
    const out = rfRenderVero();
    rfRicordaPagina();
    rfTastoIndietro();
    document.querySelectorAll('[data-prefirma]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); if (!state.aiOpen) state.aiOpen = true; state.aiMessages.push({ html: `<div class="ai-msg user">Controllo prima della firma</div>` }); rfProcedura({ nome: 'controllo_prefirma', bozza_id: el.dataset.prefirma }, 'Controllo la bozza prima della firma…'); }; });
    return out;
  };
  rfPaginaCarico();
}
window.addEventListener('load', () => {
  if (!rfDentro()) return;
  void rfCaricaMedici();
  void rfCaricaProcedure();
  void rfCaricaDati();
  setInterval(() => { if (RF.live && state.route !== 'review') void rfCaricaDati(); }, 120000);
});
