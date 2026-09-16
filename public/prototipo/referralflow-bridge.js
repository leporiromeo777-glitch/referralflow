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
  RF.agenda = d.agenda || [];
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
  // Voci per ruolo (14.9.2026: Percorsi, Moduli, Da fatturare). Questa riga
  // vince su qualunque aggiunta fatta al caricamento dello script.
  const nav = ['home', 'agenda', 'sale', 'prestazioni', 'patients', 'invianti', 'percorsi', 'reports', 'dittafono', 'documents', 'moduli', 'anonymize', 'inbox', 'ai', 'fatturazione', 'administration'];
  const nascosti = new Set(Array.isArray(RF.data.moduli_nascosti) ? RF.data.moduli_nascosti : []);
  for (const k of Object.keys(NAV)) NAV[k] = nav.filter(v => (v !== 'fatturazione' || ['secretary', 'org_admin'].includes(k)) && (!nascosti.has(v) || v === 'home' || v === 'administration'));
  render();
}

function rfPaginaAccesso(stato) {
  const c = document.getElementById('content');
  if (!c) return;
  const st = stato || RF.accesso || { passo: 'credenziali', errore: null, lavora: false };
  RF.accesso = st;
  // Stesso disegno della pagina di accesso della piattaforma: carta centrata,
  // marchio grande, campi impilati, bottone pieno, righe di assistenza e
  // pastiglie di fiducia. Nessun rimando all'altra interfaccia.
  const app = document.getElementById('app'); if (app) app.classList.add('rf-modo-accesso');
  const marchio = `<div class="rf-auth-brand">Referral<span>Flow</span></div>`;
  const errore = st.errore ? `<p class="rf-auth-error">${rfEsc(st.errore)}</p>` : '';
  c.innerHTML = `<div class="rf-auth">
    ${st.passo === 'codice' ? `
    <form id="rf-acc-form" class="rf-auth-card" autocomplete="off">
      ${marchio}
      <p class="rf-auth-sub">Verifica in due passaggi</p>
      <label>Codice a 6 cifre dall’app di autenticazione
        <input id="rf-acc-codice" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" required autofocus></label>
      <p class="rf-auth-small">Ha perso l’accesso all’app? Inserisca qui sopra uno dei codici di recupero salvati all’attivazione (es. <code>abcd-efgh</code>).</p>
      ${errore}
      <button class="rf-auth-btn" type="submit" ${st.lavora ? 'disabled' : ''}>${st.lavora ? 'Verifica…' : 'Conferma'}</button>
      <button class="rf-auth-link" type="button" id="rf-acc-indietro">Torna all’accesso</button>
    </form>
    <p class="rf-auth-line">Il codice cambia ogni 30 secondi: se non funziona, attenda il successivo.</p>` : `
    <form id="rf-acc-form" class="rf-auth-card">
      ${marchio}
      <p class="rf-auth-sub">La piattaforma delle referral tra studi medici</p>
      <label>Email<input id="rf-acc-email" type="email" required autocomplete="username" inputmode="email"></label>
      <label>Password<input id="rf-acc-password" type="password" required autocomplete="current-password"></label>
      <p class="rf-auth-forgot">Password dimenticata? La reimposta l’amministratore dello studio.</p>
      ${errore}
      <button class="rf-auth-btn" type="submit" ${st.lavora ? 'disabled' : ''}>${st.lavora ? 'Accesso…' : 'Accedi'}</button>
    </form>
    <p class="rf-auth-line">Accesso riservato al personale dello studio · sessione di 8 ore</p>
    <ul class="rf-trust" aria-label="Garanzie di sicurezza e conformità">
      <li><span aria-hidden="true">🇨🇭</span> Dati in Svizzera</li>
      <li><span aria-hidden="true">🔒</span> Conforme nLPD</li>
      <li><span aria-hidden="true">📋</span> Accessi tracciati</li>
      <li><span aria-hidden="true">💾</span> Backup cifrati</li>
    </ul>`}
  </div>`;
  const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
  const mn = document.getElementById('mobilenav'); if (mn) mn.innerHTML = '';
  const form = document.getElementById('rf-acc-form');
  if (form) form.onsubmit = (e) => { e.preventDefault(); void rfAccedi(); };
  const ind = document.getElementById('rf-acc-indietro'); if (ind) ind.onclick = () => rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: false });
  const primo = document.getElementById(st.passo === 'codice' ? 'rf-acc-codice' : 'rf-acc-email'); if (primo && !st.lavora) primo.focus();
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
  { const app = document.getElementById('app'); if (app) app.classList.remove('rf-modo-accesso'); }
  rfPaginaCarico();
  void rfCaricaMedici(); void rfCaricaProcedure(); void rfCaricaDati();
}
async function rfEsci() {
  try { await fetch('/api/prototipo/accesso/esci', { method: 'POST', credentials: 'include' }); } catch { /* comunque */ }
  RF.live = false; RF.caricato = false; RF.data = null; RF.nonAutorizzato = true; RF.loaded = null; RF.accesso = null;
  location.hash = '#/home';
  rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: false });
}
(function () { const st = document.createElement('style'); st.textContent = `
#app.rf-modo-accesso{grid-template-columns:1fr !important}
#app.rf-modo-accesso .sidebar,#app.rf-modo-accesso .topbar{display:none !important}
#app.rf-modo-accesso .content{padding:0;background:#eef2f7}
body:has(#app.rf-modo-accesso){background:#eef2f7}
:root[data-theme="dark"] body:has(#app.rf-modo-accesso){background:#0c1117}
#app.rf-modo-accesso ~ #mobilenav,body:has(#app.rf-modo-accesso) .mobile-nav{display:none !important}
.rf-auth{--a-bg:#eef2f7;--a-surface:#fff;--a-ink:#0f1722;--a-muted:#5a6675;--a-line:#dde4ec;--a-line-strong:#c6d1dd;--a-cta:#1789d6;--a-cta-hover:#0e6db0;--a-danger:#b3564c;--a-danger-bg:#f6e9e7;
  min-height:100%;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:24px;background:var(--a-bg);color:var(--a-ink);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45}
:root[data-theme="dark"] .rf-auth{--a-bg:#0c1117;--a-surface:#151c24;--a-ink:#eef3f8;--a-muted:#9fb0c1;--a-line:#26303c;--a-line-strong:#33404e;--a-cta:#2c93df;--a-cta-hover:#3fa4ea;--a-danger-bg:#3a2320}
:root[data-theme="dark"] #app.rf-modo-accesso .content{background:#0c1117}
.rf-auth-card{width:100%;max-width:390px;background:var(--a-surface);border:1px solid var(--a-line);border-radius:16px;padding:28px;box-shadow:0 2px 4px rgba(15,35,60,.06),0 24px 60px -28px rgba(13,45,80,.30);margin:0}
.rf-auth-brand{font-size:32px;font-weight:700;letter-spacing:-.03em;line-height:1.25;text-align:center}
.rf-auth-brand span{color:var(--a-cta)}
.rf-auth-sub{text-align:center;color:var(--a-muted);margin:6px 0 12px}
.rf-auth-card label{display:block;font-size:13px;font-weight:500;color:var(--a-muted);margin:14px 0 12px}
.rf-auth-card input{display:block;width:100%;margin-top:5px;padding:9px 11px;font:inherit;font-size:14px;color:var(--a-ink);background:var(--a-surface);border:1px solid var(--a-line-strong);border-radius:14px;min-width:0;height:auto;box-sizing:border-box;transition:border-color .12s,box-shadow .12s}
.rf-auth-card input:hover{border-color:#b9c5c1}
.rf-auth-card input:focus{outline:none;border-color:var(--a-cta);box-shadow:0 0 0 3px rgba(23,137,214,.18)}
.rf-auth-forgot{text-align:right;margin:8px 0 0;font-size:13px;color:var(--a-muted)}
.rf-auth-small{color:var(--a-muted);font-size:12px;margin:12px 0 0}
.rf-auth-small code{font-size:12px}
.rf-auth-error{color:var(--a-danger);background:var(--a-danger-bg);border:1px solid #f0d4d4;font-size:13.5px;padding:10px 14px;border-radius:14px;margin:14px 0 0}
.rf-auth-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;margin-top:22px;padding:11px 14px;font:inherit;font-size:15px;font-weight:550;border-radius:999px;border:1.5px solid var(--a-cta);background:var(--a-cta);color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(15,35,60,.06);transition:background .12s,transform .06s}
.rf-auth-btn:hover{background:var(--a-cta-hover);border-color:var(--a-cta-hover)}
.rf-auth-btn:active{transform:scale(.98)}
.rf-auth-btn:disabled{opacity:.6;cursor:default}
.rf-auth-link{display:block;width:100%;margin-top:10px;padding:8px;font:inherit;font-size:13px;color:var(--a-muted);background:none;border:none;cursor:pointer}
.rf-auth-link:hover{color:var(--a-ink)}
.rf-auth-line{max-width:390px;width:100%;text-align:center;color:var(--a-muted);font-size:12px;margin:14px 0 0}
.rf-trust{list-style:none;margin:16px 0;padding:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.rf-trust li{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--a-ink);background:var(--a-surface);border:1px solid var(--a-line-strong);border-radius:999px;padding:6px 12px}
.rf-trust li span{font-size:15px;line-height:1}
`; document.head.appendChild(st); })();

/* ---------- barra laterale: conteggi veri ---------- */
const rfRenderSidebarOrig = renderSidebar;
// Barra laterale a sezioni (14.9.2026, tema minimale): le voci del ruolo
// raggruppate con un'etichetta; una voce fuori da ogni gruppo finisce in coda.
const RF_NAV_GRUPPI = [
  ['Operatività', ['home', 'agenda', 'sale', 'prestazioni', 'inbox']],
  ['Clinico', ['patients', 'invianti', 'percorsi', 'visits', 'reports', 'dittafono', 'documents', 'moduli']],
  ['AI', ['ai', 'anonymize']],
  ['Amministrazione', ['fatturazione', 'communications', 'statistics', 'administration', 'system']],
];
function rfNavGruppi(chiavi, item) {
  const viste = new Set(); let out = '';
  for (const [titolo, voci] of RF_NAV_GRUPPI) {
    const mie = voci.filter(k => chiavi.includes(k)); if (!mie.length) continue;
    out += `<div class="nav-group">${titolo}</div>` + mie.map(k => { viste.add(k); return item(k); }).join('');
  }
  const resto = chiavi.filter(k => !viste.has(k));
  if (resto.length) out += `<div class="nav-group">Altro</div>` + resto.map(item).join('');
  return out;
}
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
    <nav class="nav">${rfNavGruppi(NAV[state.role], item)}</nav>
    <div class="bottom">
      <div class="nav-sep"></div>
      <nav class="nav">
        <button class="nav-item" id="collapse-btn" title="Comprimi barra laterale">${ICONS.panel}<span>Comprimi</span></button>
        <button class="nav-item" id="rf-suggerisci" title="Suggerisci una modifica">${ICONS.why || ''}<span>Suggerisci</span></button>
        <button class="nav-item ${state.route === 'profile' ? 'active' : ''}" data-go="#/profile" title="Profilo">${ICONS.profile || ''}<span>Profilo</span></button>
        <button class="nav-item" id="rf-esci" title="Esci">${ICONS.lock || ''}<span>Esci · ${rfEsc((RF.data.utente.email || '').split('@')[0])}</span></button>
      </nav>
      <div class="sysbar"><span class="status"><i class="dot success"></i><span>Dati veri</span></span><span class="status"><i class="dot success"></i><span>Cleo · locale</span></span></div>
    </div>`;
  document.getElementById('collapse-btn').onclick = () => { state.sidebarCollapsed = !state.sidebarCollapsed; render(); };
  const esci = document.getElementById('rf-esci'); if (esci) esci.onclick = () => { void rfEsci(); };
  const sug = document.getElementById('rf-suggerisci'); if (sug) sug.onclick = () => rfSuggerisci();
  bindCommon(document.getElementById('sidebar'));
};

/* ---------- Home sui dati veri (tutti i ruoli) ---------- */
// Cruscotto della giornata (14.9.2026): sei numeri, il prossimo paziente, le
// cose da fare, la timeline, il monitor delle sale (occupazione di oggi dal
// campo «luogo» dell'agenda abbinato alle risorse dello studio), chi ha agenda
// oggi, i referral urgenti e le bozze della catena. Tutto da `dati`.
(function () {
  const st = document.createElement('style');
  st.textContent = `
.grid-6 { grid-template-columns: repeat(6, minmax(0,1fr)); }
@media (max-width: 1199px) { .grid-6 { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 767px) { .grid-6 { grid-template-columns: repeat(2, 1fr); } }
.rf-sala { display:flex; flex-direction:column; gap:6px; padding:8px 6px; }
.rf-sala + .rf-sala { border-top:1px solid var(--border); }
.rf-sala .rf-sala-top { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.rf-sala .rf-sala-top .name { font-size:13px; font-weight:600; }
.rf-sala .rf-sala-top .n { font-size:12px; color:var(--text-2); white-space:nowrap; }
.rf-sala .meter { height:6px; }
.rf-sala .meter.now > i { background: var(--warning); }
.rf-sala .cap { font-size:12px; color:var(--text-3); }
.rf-sala .cap.now { color: var(--warning); font-weight:600; }
.rf-persona { display:flex; align-items:center; gap:8px; padding:6px 6px; font-size:13px; }
.rf-persona i.dot { flex:none; }
`; document.head.appendChild(st);
})();
const rfHomeOrig = PAGES.home;
PAGES.home = () => {
  if (!RF.live) return rfHomeOrig();
  const s = RF.data.stats || {};
  const appts = [...APPTS].sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = appts.find(a => a.status !== 'COMPLETED' && a.start >= hm) || appts.find(a => a.status !== 'COMPLETED');
  const stat = (v, l, go, d = '', warn = false) => `<div class="card tight clickable stat" data-go="${go}"><span class="value num">${v}</span><span class="label">${l}</span>${d ? `<span class="delta${warn ? ' warn' : ''}">${d}</span>` : ''}</div>`;
  const data = now.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const mediciOggi = [...new Set(appts.map(a => a.doc).filter(d => d && d !== 'studio'))];
  const nMed = mediciOggi.length;
  const prio = RF.queue.filter(r => r.state === 'priority' && r.status !== 'APPROVED').length;
  const urgenti = TASKS.filter(t => t.prio === 'urgent').slice(0, 6);
  const sale = Array.isArray(RF.data.sale) ? RF.data.sale : [];
  const oreSala = (min) => min >= 60 ? `${(min / 60).toFixed(min % 60 ? 1 : 0).replace('.', ',')} h` : `${min}'`;
  const rigaSala = (x) => {
    const pct = Math.min(100, Math.round(x.minuti / 480 * 100));
    const cap = x.occupataOra ? 'occupata adesso' : x.prossima ? `prossima alle ${x.prossima}` : x.n ? (x.prima ? `finita · prima era alle ${x.prima}` : 'finita per oggi') : 'libera oggi';
    const chi = x.titolare ? `<span class="rf-sala-chi">${rfEsc(x.titolare)}</span>` : (x.perche && x.perche !== 'libera' ? `<span class="rf-sala-chi vuota">${rfEsc(x.perche)}</span>` : '');
    return `<div class="rf-sala"><div class="rf-sala-top"><span class="name">${rfEsc(x.nome)}${chi}${x.tipo === 'apparecchio' ? ' <span class="caption">apparecchio</span>' : x.tipo === 'codice' ? ' <span class="caption">codice agenda</span>' : ''}</span><span class="n num">${x.n ? `${x.n} · ${oreSala(x.minuti)}` : '—'}${x.posti > 1 ? ` <span class="caption">· ${x.posti} posti</span>` : ''}</span></div><div class="meter${x.occupataOra ? ' now' : ''}"><i style="width:${pct}%"></i></div><div class="cap${x.occupataOra ? ' now' : ''}">${cap}</div></div>`;
  };
  return `
    <div class="page-head"><div><div class="eyebrow">La giornata dello studio</div><div class="display">${rfEsc(ROLES[state.role].greet)}</div><div class="page-sub" style="text-transform:none">${data} · ${appts.length} ${appts.length === 1 ? 'appuntamento' : 'appuntamenti'}${nMed ? ` · ${nMed} ${nMed === 1 ? 'medico' : 'medici'} in agenda` : ''} · ${TASKS.length ? `${TASKS.length} cose da fare` : 'niente in sospeso'}</div></div>
      <div class="actions"><button class="btn" data-go="#/agenda">${ICONS.agenda} Agenda</button><button class="btn" data-go="#/reports">${ICONS.reports} Referti</button><button class="btn ai" data-ai="Preparazione della giornata">${ICONS.ai} Prepara la giornata</button></div></div>
    <div class="grid grid-6">
      ${stat(s.appuntamenti_oggi ?? appts.length, 'Appuntamenti oggi', '#/agenda', s.visti_oggi ? `${s.visti_oggi} già visti` : (next ? `prossimo alle ${next.start}` : ''))}
      ${stat(s.bozze_da_rivedere ?? 0, 'Referti da controllare', '#/reports', prio ? `${prio} prioritari` : '', prio > 0)}
      ${stat(s.visti_senza_referto ?? 0, 'Visti senza referto', '#/agenda', 'oggi, ancora da dettare')}
      ${stat(s.urgenti ?? 0, 'Referral urgenti', '#/inbox', s.da_prenotare ? `${s.da_prenotare} da prenotare` : '')}
      ${stat(s.richiami_scaduti ?? 0, 'Richiami scaduti', '#/inbox')}
      ${stat(s.lettere_in_ritardo ?? 0, 'Lettere in ritardo', '#/reports', (s.lettere_in_ritardo ?? 0) > 0 ? 'da sbloccare' : 'nessuna', (s.lettere_in_ritardo ?? 0) > 0)}
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
      <div class="stack">
        <div class="card"><div class="card-head"><span class="section-title">Da fare adesso</span><button class="btn sm ghost" data-go="#/inbox">Tutte ${ICONS.chevR}</button></div>
          <div class="list">${TASKS.length ? TASKS.slice(0, 12).map(t => `<div class="list-item"><i class="dot ${t.prio === 'urgent' || t.prio === 'high' ? 'danger' : 'accent'}"></i><div class="grow"><div class="name">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('') : '<div class="caption" style="padding:8px 6px">Tutto gestito. Buon lavoro.</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Programma di oggi</span><button class="btn sm ghost" data-go="#/agenda">Agenda completa ${ICONS.chevR}</button></div>
          <div class="tl">${appts.length ? appts.map(a => `<div class="tl-item ${a.status === 'COMPLETED' ? 'done' : a === next ? 'now' : a.late ? 'warn' : ''} clickable" data-go="#/patients/${a.p}" style="cursor:pointer"><span class="time num">${a.start}<span class="caption" style="display:block;font-weight:400">${a.dur ? `${a.dur}'` : ''}</span></span><div class="b"><div class="n">${rfEsc(fullName(P[a.p]))}</div><div class="s">${rfEsc(a.reason)} · ${rfEsc(DOCTORS[a.doc] || '')}${a.room ? ` · ${rfEsc(a.room)}` : ''}</div></div>${a.status === 'CANCELLED' ? '' : (typeof statusBadge === 'function' ? statusBadge(a.status) : '')}</div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun appuntamento oggi in agenda.</div>'}</div></div>
      </div>
      <div class="stack">
        ${rfCardSale(sale, rigaSala, nMed)}
        <div class="card"><div class="card-head"><span class="section-title">In studio oggi</span><span class="badge count">${nMed}</span></div>
          <div class="list">${nMed ? mediciOggi.map(d => `<div class="rf-persona"><i class="dot success"></i><span>${rfEsc(DOCTORS[d] || d)}${rfEtichettaRuolo(d)}</span><span class="caption" style="margin-left:auto">${appts.filter(a => a.doc === d).length} app.</span></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun medico con agenda oggi.</div>'}</div>
          <div class="caption mt-8" style="padding:0 6px">${s.accessi_attivi ?? 0} accessi attivi alla piattaforma</div></div>
        ${urgenti.length ? `<div class="card"><div class="card-head"><span class="section-title">Urgenti</span><span class="badge count" style="background:var(--danger);color:#fff">${urgenti.length}</span></div>
          <div class="list">${urgenti.map(t => `<div class="list-item"><i class="dot danger"></i><div class="grow"><div class="name" style="font-size:13px">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('')}</div></div>` : ''}
        ${(RF.data.daChiamare || []).length ? `<div class="card"><div class="card-head"><span class="section-title">Da chiamare per la preparazione</span><span class="badge count">${RF.data.daChiamare.length}</span></div>
          <div class="list">${RF.data.daChiamare.slice(0, 8).map(x => `<div class="list-item" style="align-items:flex-start"><div class="grow"><div class="name" style="font-size:13px"><a href="#/patients/${x.p}">${rfEsc(fullName(P[x.p]) || x.reason)}</a></div><div class="sub">${rfEsc(x.d.split('-').reverse().join('.'))} ${x.start} · ${rfEsc(x.reason)}${x.motivi.length ? ` · <b>${rfEsc(x.motivi.join(', '))}</b>` : ''}</div><div class="row mt-8" style="gap:6px"><select class="input sm" id="rf-ch-${x.id}" style="min-width:150px"><option value="raggiunto">Raggiunto</option><option value="segreteria_telefonica">Segreteria telefonica</option><option value="non_risponde">Non risponde</option><option value="da_richiamare">Da richiamare</option><option value="non_serve">Non serve</option></select><button class="btn sm" onclick="rfChiamata('${x.id}', '${x.p}')">Segna</button></div></div></div>`).join('')}</div>
          <div class="caption mt-8" style="padding:0 6px">Appuntamenti dei prossimi 7 giorni senza una chiamata registrata.</div></div>` : ''}
        <div class="card"><div class="card-head"><span class="section-title">Referti dalla catena</span><span class="badge count">${RF.queue.filter(r => r.status !== 'APPROVED').length}</span></div>
          <div class="list">${RF.queue.filter(r => r.status !== 'APPROVED').slice(0, 5).map(r => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(fullName(P[r.p]))}</div><div class="sub">${rfEsc(r.note)} · ${r.at}</div></div><button class="btn sm" data-go="#/review/${r.id}">Rivedi</button></div>`).join('') || '<div class="caption" style="padding:8px 6px">Nessuna bozza da controllare.</div>'}</div></div>
      </div>
    </div>`;
};

/* ---------- Percorsi diagnostico-terapeutici (14.9.2026) ---------- */
// Sequenze standard per indicazione dalla pagina wiki «Medici/Percorsi»,
// via GET /api/prototipo/percorsi. Ricerca in pagina senza ricaricare; stato
// «proposta» finché il medico non valida la pagina.
if (typeof NAV_META !== 'undefined') NAV_META.percorsi = ['Percorsi', 'flow'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('percorsi')) n.splice(n.indexOf('patients') + 1, 0, 'percorsi'); }
RF.percorsi = null;
async function rfCaricaPercorsi() {
  try {
    const r = await fetch('/api/prototipo/percorsi', { credentials: 'include' });
    const j = r.ok ? await r.json() : {};
    RF.percorsi = Array.isArray(j.percorsi) ? j.percorsi : [];
  } catch { RF.percorsi = []; }
  if (state.route === 'percorsi') render();
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'rf-perc-q') return;
  const q = e.target.value.trim().toLowerCase();
  let n = 0;
  document.querySelectorAll('[data-percorso]').forEach((el) => { const ok = !q || el.getAttribute('data-percorso').includes(q); el.hidden = !ok; if (ok) n++; });
  const c = document.getElementById('rf-perc-n'); if (c) c.textContent = `${n} ${n === 1 ? 'percorso' : 'percorsi'}`;
});
PAGES.percorsi = () => {
  if (!RF.live) return rfPaginaPiattaforma('Percorsi', 'Sequenze standard di prestazioni per indicazione');
  if (RF.percorsi === null) { void rfCaricaPercorsi(); return `<div class="page-head"><div><h2 class="page-title">Percorsi diagnostico-terapeutici</h2><div class="page-sub">Sequenze standard di prestazioni per indicazione</div></div></div><div class="card"><p class="meta" style="margin:0">Leggo la pagina wiki…</p></div>`; }
  const lista = RF.percorsi;
  const proposte = lista.filter(p => p.stato !== 'validato').length;
  const card = (p) => `<div class="card" data-percorso="${rfEsc(`${p.nome} ${p.indicazione} ${p.prestazioni.map(x => x.nome).join(' ')}`.toLowerCase())}">
      <div class="card-head" style="align-items:flex-start"><div><div class="caption" style="letter-spacing:.04em;text-transform:uppercase">${rfEsc(p.indicazione)}</div><div class="section-title" style="font-size:16px;margin-top:2px">${rfEsc(p.nome)}</div></div>
        <div class="row wrap" style="justify-content:flex-end;gap:6px">${p.urgente ? '<span class="badge danger">Urgenza</span>' : ''}<span class="badge ${p.stato === 'validato' ? 'success' : 'warning'}">${p.stato === 'validato' ? 'Validato' : 'Proposta'}</span></div></div>
      <div class="row wrap mt-8" style="gap:6px">${p.durata ? `<span class="badge">${ICONS.clock} ${rfEsc(p.durata)}</span>` : ''}${p.dove ? `<span class="badge">${ICONS.door} ${rfEsc(p.dove)}</span>` : ''}<span class="badge accent">${p.prestazioni.length} prestazioni</span></div>
      <div class="list mt-8">${p.prestazioni.map(x => `<div class="list-item" style="padding:6px 6px"><span class="num" style="width:22px;color:var(--text-3);font-size:12px">${x.n}</span><div class="grow"><div class="name" style="font-size:13px">${rfEsc(x.nome)}${x.esterna ? ' <span class="badge" style="font-size:10px">fuori studio</span>' : ''}</div>${x.condizione ? `<div class="sub">${rfEsc(x.condizione)}</div>` : ''}</div></div>`).join('')}</div>
      ${p.tempi ? `<div class="kv mt-8"><b>Tempi</b><span>${rfEsc(p.tempi)}</span></div>` : ''}
      ${p.urgente && p.urgenza ? `<div class="kv"><b>Urgenza</b><span>${rfEsc(p.urgenza)}</span></div>` : ''}
      ${p.nota ? `<p class="meta mt-8" style="margin:0;line-height:1.5;font-style:italic">${rfEsc(p.nota)}</p>` : ''}
      ${p.fonti ? `<div class="caption mt-8">Fonti: ${rfEsc(p.fonti)}</div>` : ''}
    </div>`;
  return `<div class="page-head"><div><h2 class="page-title">Percorsi diagnostico-terapeutici</h2><div class="page-sub">Sequenze standard di prestazioni per indicazione · <span id="rf-perc-n">${lista.length} ${lista.length === 1 ? 'percorso' : 'percorsi'}</span></div></div>
      <div class="actions"><input class="input" id="rf-perc-q" placeholder="Cerca indicazione o prestazione…" autocomplete="off"><button class="btn ai" data-ai="Quale percorso per un paziente con palpitazioni?">${ICONS.ai} Chiedi a Cleo</button></div></div>
    ${proposte ? `<div class="card" style="border-left:3px solid var(--warning)"><p class="meta" style="margin:0;line-height:1.55"><b>${proposte} ${proposte === 1 ? 'percorso è una proposta' : 'percorsi sono proposte'}</b> scritte dalle linee guida per uno studio ambulatoriale: durate, tempi e criteri li valida il cardiologo. Si correggono nella pagina wiki <code>Medici/Percorsi</code> (SilverBullet sulla rete dello studio, porta 3400); alla riga «Stato» si scrive <code>validato</code>. La piattaforma rilegge la pagina entro 5 minuti.</p></div>` : ''}
    <div class="grid grid-2 mt-16">${lista.length ? lista.map(card).join('') : '<div class="card"><p class="meta" style="margin:0">Nessun percorso nella pagina wiki.</p></div>'}</div>`;
};

/* ---------- Moduli dello studio (14.9.2026) ---------- */
// Definizioni dalla pagina wiki «Piattaforma/Moduli» via GET /api/prototipo/moduli;
// compilazioni salvate nel dossier (POST), aperte e stampate dal dettaglio.
// Le risposte viaggiano solo dentro la sessione; qui non finiscono in log.
if (typeof NAV_META !== 'undefined') NAV_META.moduli = ['Moduli', 'file'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('moduli')) n.splice(n.indexOf('documents') + 1, 0, 'moduli'); }
(function () { const st = document.createElement('style'); st.textContent = `
.rf-mod-campo { display:flex; flex-direction:column; gap:4px; margin-top:10px; }
.rf-mod-campo label { font-size:12.5px; color:var(--text-2); }
.rf-mod-campo label b { color:var(--danger); font-weight:600; }
.rf-mod-campo .input, .rf-mod-campo textarea, .rf-mod-campo select { width:100%; min-width:0; }
.rf-mod-campo textarea { min-height:72px; padding:8px 12px; border-radius:var(--r-input); border:1px solid var(--border); background:var(--surface); font:inherit; resize:vertical; }
.rf-mod-campo .err { font-size:12px; color:var(--danger); }
.rf-mod-sino { display:flex; gap:6px; }
.rf-mod-sino button.active { background:var(--accent-soft); border-color:var(--accent); color:var(--accent-text); }
#rf-print { display:none; }
@media print { body > *:not(#rf-print) { display:none !important; } #rf-print { display:block; font:12pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color:#000; padding:0; } #rf-print h1 { font-size:16pt; margin:0 0 2pt; } #rf-print .meta { color:#333; font-size:10.5pt; margin-bottom:12pt; } #rf-print table { width:100%; border-collapse:collapse; } #rf-print td { border-bottom:1px solid #999; padding:6pt 4pt; vertical-align:top; } #rf-print td:first-child { width:38%; color:#333; } #rf-print .firma { margin-top:28pt; display:flex; justify-content:space-between; } #rf-print .firma span { border-top:1px solid #000; padding-top:4pt; width:40%; font-size:10pt; } }
`; document.head.appendChild(st); })();
RF.moduli = null;
async function rfCaricaModuli(rendi = true) {
  try {
    const r = await fetch('/api/prototipo/moduli', { credentials: 'include' });
    const j = r.ok ? await r.json() : {};
    RF.moduli = { moduli: Array.isArray(j.moduli) ? j.moduli : [], compilazioni: Array.isArray(j.compilazioni) ? j.compilazioni : [] };
  } catch { RF.moduli = { moduli: [], compilazioni: [] }; }
  if (rendi && ['moduli', 'patient'].includes(state.route)) render();
}
function rfModQuando(iso) { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function rfModRigaComp(c, conPaziente = true) {
  return `<div class="list-item"><i class="dot ${c.completo ? 'success' : 'warning'}"></i><div class="grow"><div class="name" style="font-size:13px">${conPaziente ? `${rfEsc(c.paziente || 'senza paziente')} · ` : ''}${rfEsc(c.codice)} ${rfEsc(c.titolo)}</div><div class="sub">${rfModQuando(c.updated_at)}${c.da ? ` · ${rfEsc(c.da)}` : ''}${c.completo ? '' : ' · incompleto'}</div></div><button class="btn sm" onclick="rfModuloApri('${c.id}')">Apri</button></div>`;
}
PAGES.moduli = () => {
  if (!RF.live) return rfPaginaPiattaforma('Moduli', 'I moduli dello studio in versione digitale');
  if (RF.moduli === null) { void rfCaricaModuli(); return `<div class="page-head"><div><h2 class="page-title">Moduli</h2><div class="page-sub">I moduli dello studio in versione digitale</div></div></div><div class="card"><p class="meta" style="margin:0">Leggo la pagina wiki…</p></div>`; }
  const { moduli, compilazioni } = RF.moduli;
  return `<div class="page-head"><div><h2 class="page-title">Moduli</h2><div class="page-sub">I moduli dello studio in versione digitale: compilabili, stampabili, nel dossier del paziente · ${compilazioni.length} compilazioni</div></div></div>
    <div class="grid grid-main-side">
      <div class="card"><div class="card-head"><span class="section-title">Moduli</span><span class="caption">dalla pagina wiki Piattaforma/Moduli</span></div>
        <div class="list">${moduli.length ? moduli.map(m => `<div class="list-item" style="align-items:flex-start"><div class="grow"><div class="name">${rfEsc(m.codice)} — ${rfEsc(m.titolo)}</div><div class="sub">${rfEsc(m.chi)}${m.quando ? ` · ${rfEsc(m.quando)}` : ''} · ${m.campi.length} campi</div>${m.nota ? `<div class="caption mt-8" style="line-height:1.45">${rfEsc(m.nota)}</div>` : ''}</div><button class="btn sm primary" onclick="rfModuloCompila('${m.id}')">${ICONS.plus} Compila</button></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun modulo nella pagina wiki.</div>'}</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Compilazioni</span><span class="badge count">${compilazioni.length}</span></div>
        <div class="list">${compilazioni.length ? compilazioni.slice(0, 60).map(c => rfModRigaComp(c)).join('') : '<div class="caption" style="padding:8px 6px">Nessuna compilazione: inizia da un modulo a sinistra.</div>'}</div></div>
    </div>`;
};
function rfModCampoHtml(c, v, err) {
  const id = `rf-mod-${c.chiave}`; const val = v == null ? '' : String(v);
  let inp;
  if (c.tipo === 'testo_lungo') inp = `<textarea id="${id}" data-chiave="${c.chiave}">${rfEsc(val)}</textarea>`;
  else if (c.tipo === 'numero') inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" inputmode="decimal" value="${rfEsc(val)}" style="max-width:160px">`;
  else if (c.tipo === 'data') inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" type="date" value="${rfEsc(val)}" style="max-width:180px">`;
  else if (c.tipo === 'si_no') inp = `<div class="rf-mod-sino"><input type="hidden" id="${id}" data-chiave="${c.chiave}" value="${rfEsc(val)}"><button type="button" class="btn sm ${val === 'sì' ? 'active' : ''}" onclick="rfModSiNo('${id}','sì',this)">Sì</button><button type="button" class="btn sm ${val === 'no' ? 'active' : ''}" onclick="rfModSiNo('${id}','no',this)">No</button></div>`;
  else if (c.tipo === 'scelta') inp = `<select class="input" id="${id}" data-chiave="${c.chiave}"><option value="">—</option>${c.opzioni.map(o => `<option ${o === val ? 'selected' : ''}>${rfEsc(o)}</option>`).join('')}</select>`;
  else if (/^apparecchio/i.test(c.etichetta) && RF.data && Array.isArray(RF.data.risorse) && RF.data.risorse.some(r => r.tipo === 'apparecchio')) inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" list="rf-mod-app" value="${rfEsc(val)}"><datalist id="rf-mod-app">${RF.data.risorse.filter(r => r.tipo === 'apparecchio').map(r => `<option value="${rfEsc(r.nome)}">`).join('')}</datalist>`;
  else inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" value="${rfEsc(val)}">`;
  return `<div class="rf-mod-campo"><label for="${id}">${c.n}. ${rfEsc(c.etichetta)}${c.obbligatorio ? ' <b>*</b>' : ''}</label>${inp}${err ? `<div class="err">${rfEsc(err)}</div>` : ''}</div>`;
}
function rfModSiNo(id, v, btn) { const h = document.getElementById(id); if (h) h.value = v; btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn)); }
function rfModRaccogli() { const dati = {}; document.querySelectorAll('#modal [data-chiave]').forEach(el => { dati[el.dataset.chiave] = el.value; }); return dati; }
function rfModPazienti() {
  const lista = ((RF.data && RF.data.patients) || []).filter(p => rfUuid(p.id));
  const mappa = new Map(); const opts = [];
  for (const p of lista) { const et = `${p.last} ${p.first}${p.dob ? ` · ${p.dob}` : ''}`; mappa.set(et, p.id); opts.push(`<option value="${rfEsc(et)}">`); }
  return { mappa, html: `<datalist id="rf-mod-paz-list">${opts.join('')}</datalist>` };
}
function rfModuloCompila(moduloId, pazienteId = null) {
  const m = RF.moduli && RF.moduli.moduli.find(x => x.id === moduloId); if (!m) return;
  const paz = rfModPazienti();
  const pre = pazienteId && P[pazienteId] ? `${P[pazienteId].last} ${P[pazienteId].first}${P[pazienteId].dob ? ` · ${P[pazienteId].dob}` : ''}` : '';
  const corpo = `<div class="caption">${rfEsc(m.chi)}${m.quando ? ` · ${rfEsc(m.quando)}` : ''}</div>
    <div class="rf-mod-campo"><label for="rf-mod-paz">Paziente (dalla cartella; vuoto se il modulo non riguarda un paziente)</label><input class="input" id="rf-mod-paz" list="rf-mod-paz-list" placeholder="Cognome Nome…" value="${rfEsc(pre)}" autocomplete="off">${paz.html}</div>
    <div id="rf-mod-campi">${m.campi.map(c => rfModCampoHtml(c, '', '')).join('')}</div><div class="caption mt-8">* obbligatorio. Si può salvare anche incompleto e finire dopo.</div>`;
  openModal(`${m.codice} — ${m.titolo}`, corpo, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-mod-salva">Salva</button>`);
  document.getElementById('rf-mod-salva').onclick = async () => {
    const et = (document.getElementById('rf-mod-paz').value || '').trim();
    const pid = et ? (paz.mappa.get(et) || null) : null;
    if (et && !pid) { toast('Scegli il paziente dall’elenco della cartella'); return; }
    try {
      const r = await fetch('/api/prototipo/moduli', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo: m.id, patient_id: pid, dati: rfModRaccogli() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.errore || 'Salvataggio non riuscito'); return; }
      const dati = rfModRaccogli();
      if (j.errori && Object.keys(j.errori).length) { document.getElementById('rf-mod-campi').innerHTML = m.campi.map(c => rfModCampoHtml(c, dati[c.chiave], j.errori[c.chiave])).join(''); toast('Salvato incompleto: mancano alcuni campi'); }
      else toast('Modulo salvato');
      closeModal(); void rfCaricaModuli();
    } catch { toast('Piattaforma non raggiungibile'); }
  };
}
async function rfModuloApri(id) {
  let j;
  try { const r = await fetch(`/api/prototipo/moduli/${id}`, { credentials: 'include' }); if (!r.ok) throw 0; j = await r.json(); } catch { toast('Compilazione non trovata'); return; }
  const c = j.compilazione, m = j.modulo;
  const campi = m ? m.campi : Object.keys(c.dati || {}).map((k, i) => ({ chiave: k, n: i + 1, etichetta: k, tipo: 'testo', opzioni: [], obbligatorio: false }));
  const corpo = `<div class="caption">${rfEsc(c.paziente || 'senza paziente')}${c.nascita ? ` · nato/a ${rfEsc(c.nascita)}` : ''} · creato ${rfModQuando(c.created_at)}${c.da ? ` da ${rfEsc(c.da)}` : ''}${c.updated_at !== c.created_at ? ` · modificato ${rfModQuando(c.updated_at)}` : ''}</div>
    ${m ? '' : '<div class="caption mt-8">Il modulo non è più nella pagina wiki: si legge e si stampa, non si modifica.</div>'}
    <div id="rf-mod-campi">${campi.map(x => rfModCampoHtml(x, (c.dati || {})[x.chiave], '')).join('')}</div>
    <details class="mt-16"><summary class="caption">Chi l'ha aperto (${(j.accessi || []).length})</summary><div class="caption" style="line-height:1.6">${(j.accessi || []).map(a => `${rfModQuando(a.at)} · ${rfEsc(a.azione)}${a.da ? ` · ${rfEsc(a.da)}` : ''}`).join('<br>')}</div></details>`;
  openModal(`${c.codice} — ${c.titolo}`, corpo, `<button class="btn" data-close>Chiudi</button><button class="btn" id="rf-mod-stampa">${ICONS.print} Stampa</button>${m ? '<button class="btn primary" id="rf-mod-salva">Salva</button>' : ''}`);
  document.getElementById('rf-mod-stampa').onclick = () => rfModuloStampa(c, campi, rfModRaccogli());
  const salva = document.getElementById('rf-mod-salva');
  if (salva) salva.onclick = async () => {
    try {
      const r = await fetch(`/api/prototipo/moduli/${c.id}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dati: rfModRaccogli() }) });
      const k = await r.json().catch(() => ({}));
      if (!r.ok) { toast(k.errore || 'Salvataggio non riuscito'); return; }
      if (k.errori && Object.keys(k.errori).length) { const dati = rfModRaccogli(); document.getElementById('rf-mod-campi').innerHTML = campi.map(x => rfModCampoHtml(x, dati[x.chiave], k.errori[x.chiave])).join(''); toast('Salvato incompleto: mancano alcuni campi'); return; }
      toast('Modulo salvato'); closeModal(); void rfCaricaModuli();
    } catch { toast('Piattaforma non raggiungibile'); }
  };
}
function rfModuloStampa(c, campi, dati) {
  let box = document.getElementById('rf-print'); if (!box) { box = document.createElement('div'); box.id = 'rf-print'; document.body.appendChild(box); }
  const studio = (RF.data && RF.data.utente && RF.data.utente.studio) || 'ReferralFlow';
  box.innerHTML = `<h1>${rfEsc(c.codice)} — ${rfEsc(c.titolo)}</h1><div class="meta">${rfEsc(studio)} · ${rfEsc(c.paziente || 'senza paziente')}${c.nascita ? ` · nato/a ${rfEsc(c.nascita)}` : ''} · ${rfModQuando(c.updated_at || c.created_at)}</div>
    <table>${campi.map(x => `<tr><td>${x.n}. ${rfEsc(x.etichetta)}</td><td>${rfEsc(dati[x.chiave] || '')}</td></tr>`).join('')}</table>
    <div class="firma"><span>Data</span><span>Firma</span></div>`;
  fetch(`/api/prototipo/moduli/${c.id}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'stampa' }) }).catch(() => {});
  setTimeout(() => window.print(), 50);
}
// Scheda paziente → Documenti: i moduli compilati per questo paziente.
const rfPatientDocsOrig = typeof patientDocs === 'function' ? patientDocs : null;
if (rfPatientDocsOrig) patientDocs = function (p) {
  const base = rfPatientDocsOrig(p);
  if (!RF.live || !rfUuid(p.id)) return base;
  if (RF.moduli === null) { void rfCaricaModuli(); return base; }
  const mie = RF.moduli.compilazioni.filter(c => c.patient_id === p.id);
  const scelta = RF.moduli.moduli.map(m => `<option value="${m.id}">${rfEsc(m.codice)} — ${rfEsc(m.titolo)}</option>`).join('');
  return base + `<div class="card mt-16"><div class="card-head"><span class="section-title">Moduli compilati</span><span class="badge count">${mie.length}</span></div>
    <div class="list">${mie.length ? mie.map(c => rfModRigaComp(c, false)).join('') : '<div class="caption" style="padding:8px 6px">Nessun modulo per questo paziente.</div>'}</div>
    ${scelta ? `<div class="row mt-16" style="gap:8px"><select class="input sm" id="rf-mod-scelta-${p.id}">${scelta}</select><button class="btn sm" onclick="rfModuloCompila(document.getElementById('rf-mod-scelta-${p.id}').value, '${p.id}')">${ICONS.plus} Compila</button></div>` : ''}</div>`;
};

/* ---------- Da fatturare (14.9.2026) ---------- */
// La piattaforma non fattura: mostra le prestazioni erogate del mese e le
// esporta in CSV per il gestionale di fatturazione dello studio, segnando
// che cosa è già uscito. Segreteria e amministratore; il medico non la vede.
if (typeof NAV_META !== 'undefined') NAV_META.fatturazione = ['Da fatturare', 'file'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('fatturazione')) n.splice(n.indexOf('administration'), 0, 'fatturazione'); }
RF.fatt = null;
async function rfCaricaFatt(mese) {
  try {
    const r = await fetch(`/api/prototipo/fatturazione?mese=${encodeURIComponent(mese)}`, { credentials: 'include' });
    const j = r.ok ? await r.json() : { righe: [], riepilogo: {}, esportazioni: [] };
    RF.fatt = { mese, ...j };
  } catch { RF.fatt = { mese, righe: [], riepilogo: {}, esportazioni: [], errore: true }; }
  if (state.route === 'fatturazione') render();
}
async function rfFattEsporta() {
  const mese = state.fattMese; const includi = !!(document.getElementById('rf-fatt-incl') || {}).checked;
  if (RF.fattIn) return; RF.fattIn = true; toast('Preparo il CSV…');
  try {
    const r = await fetch('/api/prototipo/fatturazione', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mese, includi_esportate: includi }) });
    if (r.status === 401) { toast('Sessione scaduta: rientra e riprova'); RF.nonAutorizzato = true; RF.caricato = false; render(); return; }
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.errore || `Esportazione non riuscita (${r.status})`); return; }
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || ''; const m = cd.match(/filename="?([^";]+)"?/);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m ? m[1] : `prestazioni_${mese}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('CSV scaricato: aprilo nel gestionale di fatturazione'); void rfCaricaFatt(mese);
  } catch { toast('Piattaforma non raggiungibile'); } finally { RF.fattIn = false; }
}
PAGES.fatturazione = () => {
  if (!RF.live) return rfPaginaPiattaforma('Da fatturare', 'Prestazioni erogate e loro stato nella Cassa dei Medici');
  const oggi = (RF.data && RF.data.today) || new Date().toISOString().slice(0, 10);
  if (!state.fattMese) state.fattMese = oggi.slice(0, 7);
  const mese = state.fattMese;
  if (!RF.fatt || RF.fatt.mese !== mese) { void rfCaricaFatt(mese); return `<div class="page-head"><div><h2 class="page-title">Da fatturare</h2><div class="page-sub">Prestazioni erogate e loro stato nella Cassa dei Medici</div></div></div><div class="card"><p class="meta" style="margin:0">Raccolgo le prestazioni del mese…</p></div>`; }
  const f = RF.fatt; const s = f.riepilogo || {}; const righe = f.righe || []; const c = f.controllo || { in_sospeso: [], senza_stato: [], giorni: 7 };
  const sospese = c.in_sospeso || []; const mute = c.senza_stato || [];
  const stat = (v, l, warn = false) => `<div class="card tight stat"><span class="value num">${v ?? 0}</span><span class="label">${l}</span>${warn && v ? '<span class="delta warn">da controllare</span>' : ''}</div>`;
  const etMese = new Date(`${mese}-01T12:00:00`).toLocaleDateString('it-CH', { month: 'long', year: 'numeric' });
  const nomeDi = (r) => `${r.cognome} ${r.nome}`.trim() || '—';
  return `<div class="page-head"><div><h2 class="page-title">Da fatturare</h2><div class="page-sub" style="text-transform:none">${rfEsc(etMese)} · ${righe.length} prestazioni erogate · lo stato arriva dall'agenda della Cassa dei Medici: la fattura la fa MediOnline</div></div>
      <div class="actions"><input type="month" class="input sm" value="${mese}" onchange="state.fattMese=this.value;render()" style="max-width:170px">${f.puo_esportare ? `<label class="caption" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="rf-fatt-incl"> includi già esportate</label><button class="btn primary" onclick="rfFattEsporta()">${ICONS.upload} Esporta CSV</button>` : ''}</div></div>
    ${sospese.length ? `<div class="card mt-16" style="border-left:3px solid var(--warning, #b8860b)"><div class="card-head"><span class="section-title">Rimaste indietro</span><span class="badge count">${sospese.length}</span></div>
      <p class="meta" style="margin:2px 0 10px;line-height:1.5">Fatte da ${c.giorni} giorni o più e in agenda portano ancora la <b>moneta</b>: in MediOnline non sono state ancora passate alla fatturazione.</p>
      <div class="list">${sospese.slice(0, 12).map(r => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(nomeDi(r))} · ${rfEsc(r.prestazione)}</div><div class="sub">${rfEsc(r.data)} ${rfEsc(r.ora)}${r.medico ? ` · ${rfEsc(r.medico)}` : ''}${r.luogo ? ` · ${rfEsc(r.luogo)}` : ''}</div></div></div>`).join('')}${sospese.length > 12 ? `<div class="caption" style="padding:8px 6px">…e altre ${sospese.length - 12}, nella tabella qui sotto.</div>` : ''}</div></div>` : ''}
    <div class="grid grid-5 mt-16">${stat(s.totale, 'Prestazioni nel mese')}${stat(s.fatturate, 'Fatturate')}${stat(s.da_fatturare, 'Ancora da fatturare')}${stat(sospese.length, `Indietro da ${c.giorni} giorni o più`, true)}${stat(s.senza_referto, 'Senza referto confermato', true)}</div>
    <div class="card mt-16"><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Data</th><th>Ora</th><th>Paziente</th><th>Nascita</th><th>Medico</th><th>Prestazione</th><th>Luogo</th><th>Stato in agenda</th><th>Fatta</th><th>Referto</th><th>Esportata</th></tr></thead>
      <tbody>${righe.length ? righe.map(r => `<tr${r.esportato_il ? ' style="opacity:.6"' : ''}><td class="num">${rfEsc(r.data)}</td><td class="num">${rfEsc(r.ora)}</td><td>${rfEsc(nomeDi(r))}${r.in_cartella ? '' : ' <span class="caption">solo agenda</span>'}</td><td class="num">${rfEsc(r.nascita)}</td><td>${rfEsc(r.medico)}</td><td>${rfEsc(r.prestazione)}</td><td>${rfEsc(r.luogo)}</td><td>${rfStatoPill(r.stato)}</td><td>${r.fatta ? '<i class="dot success"></i>' : '<i class="dot"></i>'}</td><td>${r.referto ? '<i class="dot success"></i>' : '<i class="dot warning"></i>'}</td><td class="num">${rfEsc(r.esportato_il || '—')}</td></tr>`).join('') : `<tr><td colspan="11" class="caption">Nessuna prestazione erogata in ${rfEsc(etMese)}${f.errore ? ' (piattaforma non raggiungibile)' : ''}.</td></tr>`}</tbody></table></div></div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="section-title">Come funziona</div><p class="meta" style="margin:6px 0 0;line-height:1.55">Lo studio fattura con la <b>Cassa dei Medici</b> (MediOnline). Nell'agenda ogni appuntamento porta in alto a destra un'icona che ne dice lo stato: la <b>moneta</b> = ancora da fatturare, il <b>visto con la «F»</b> = fatturato, la sedia = arrivato, lo stetoscopio = in corso. Il robot dell'agenda la legge, <b>in sola lettura</b>, insieme al resto: questa pagina confronta ciò che avete fatto con ciò che là risulta fatturato, e segnala le prestazioni rimaste indietro. La piattaforma non scrive mai in MediOnline e non emette fatture. Il CSV (separatore «;», apribile in Excel) porta paziente con AVS e numero assicurato, medico con GLN e RCC, prestazione con la posizione tariffaria: <b>niente testo clinico</b>.${mute.length ? ` <span class="caption">(${mute.length} prestazioni del mese sono più vecchie della lettura dello stato: per quelle l'agenda non dice nulla.)</span>` : ''}</p></div>
      <div class="card"><div class="card-head"><span class="section-title">Esportazioni</span><span class="badge count">${(f.esportazioni || []).length}</span></div><p class="caption" style="margin:0 0 8px">${s.nuove ?? 0} nuove · ${s.esportate ?? 0} già esportate</p><div class="list">${(f.esportazioni || []).length ? f.esportazioni.map(e => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(e.dal)} → ${rfEsc(e.al)} · ${e.righe} righe</div><div class="sub">${rfModQuando(e.at)}${e.da ? ` · ${rfEsc(e.da)}` : ''}</div></div></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessuna esportazione ancora.</div>'}</div></div>
    </div>`;
};

/* Stato dell'appuntamento come lo segna l'agenda della Cassa dei Medici. */
const RF_STATI = {
  bloccato: ['Bloccato', 'muto'],
  fissato: ['Fissato', 'muto'],
  arrivato: ['Arrivato', 'attesa'],
  in_corso: ['In corso', 'attesa'],
  da_fatturare: ['Da fatturare', 'moneta'],
  trattato: ['Trattato', 'fatto'],
  fatturato: ['Fatturato', 'fatto'],
  scusato: ['Scusato', 'muto'],
  annullato: ['Annullato', 'muto'],
};
function rfStatoPill(stato) {
  const v = RF_STATI[stato];
  if (!v) return '<span class="caption">—</span>';
  return `<span class="rf-stato ${v[1]}">${rfEsc(v[0])}</span>`;
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-stato { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11.5px; font-weight:600; white-space:nowrap; border:1px solid var(--border); color:var(--text-2); }
.rf-stato.moneta { border-color:#c9a227; background:rgba(201,162,39,.12); color:#8a6d0b; }
.rf-stato.fatto { border-color:var(--cta, #0d5c48); background:rgba(13,92,72,.10); color:var(--cta, #0d5c48); }
.rf-stato.attesa { border-color:#2b6cb0; background:rgba(43,108,176,.10); color:#2b6cb0; }
.rf-stato.muto { color:var(--text-3); }
`; document.head.appendChild(st); })();

/* ---------- Pazienti: anagrafica completa, nuovo, import CSV, scheda (14.9.2026) ---------- */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-paz-form { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 14px; }
.rf-paz-form .field label { display:block; font-size:12px; font-weight:600; color:var(--text-2); margin-bottom:5px; }
.rf-paz-form .input { width:100%; min-width:0; }
.rf-paz-form .err { font-size:12px; color:var(--danger); margin-top:3px; }
.rf-paz-form .full { grid-column: 1 / -1; }
.rf-imp-area { width:100%; min-height:120px; padding:10px 12px; border-radius:var(--r-input); border:1px solid var(--border); background:var(--surface); font:12.5px/1.45 var(--font-mono, monospace); resize:vertical; }
.rf-imp-tab td { font-size:12.5px; }
.rf-imp-tab tr.errore td { color: var(--danger); }
.rf-imp-tab tr.esiste td, .rf-imp-tab tr.doppione td { color: var(--text-3); }
.rf-terapia li { padding:5px 0; border-top:1px solid var(--border); font-size:13px; }
.rf-terapia li:first-child { border-top:0; }
@media (max-width: 767px) { .rf-paz-form { grid-template-columns: 1fr; } }
`; document.head.appendChild(st); })();
const RF_SESSO = { F: 'F', M: 'M' };
function rfPazCampo(id, label, val, opts = {}) {
  const inp = opts.select ? `<select class="input" id="${id}">${opts.select.map(o => `<option value="${rfEsc(o[0])}" ${String(val) === o[0] ? 'selected' : ''}>${rfEsc(o[1])}</option>`).join('')}</select>`
    : `<input class="input" id="${id}" type="${opts.type || 'text'}" value="${rfEsc(val || '')}" ${opts.list ? `list="${opts.list}"` : ''} ${opts.ph ? `placeholder="${rfEsc(opts.ph)}"` : ''} autocomplete="off">`;
  return `<div class="field ${opts.full ? 'full' : ''}"><label for="${id}">${label}${opts.obbl ? ' <b style="color:var(--danger)">*</b>' : ''}</label>${inp}<div class="err" id="${id}-err"></div></div>`;
}
function rfPazForm(p) {
  const perc = (RF.percorsi || []);
  if (RF.percorsi === null) void rfCaricaPercorsi();
  const nomePerc = perc.find(x => x.id === (p && p.percorso))?.nome || (p && p.percorso) || '';
  return `<div class="rf-paz-form">
    ${rfPazCampo('rf-pz-cognome', 'Cognome', p && p.last, { obbl: true })}${rfPazCampo('rf-pz-nome', 'Nome', p && p.first, { obbl: true })}
    ${rfPazCampo('rf-pz-nascita', 'Data di nascita', p && p.dobIso, { type: 'date' })}${rfPazCampo('rf-pz-sesso', 'Sesso', p && p.sex, { select: [['', '—'], ['F', 'F'], ['M', 'M']] })}
    ${rfPazCampo('rf-pz-telefono', 'Telefono', p && p.phone, { type: 'tel' })}${rfPazCampo('rf-pz-email', 'E-mail', p && p.email, { type: 'email' })}
    ${rfPazCampo('rf-pz-via', 'Via', p && p.via, { full: true })}${rfPazCampo('rf-pz-npa', 'NPA', p && p.npa, { ph: '6900' })}${rfPazCampo('rf-pz-localita', 'Località', p && p.localita)}
    ${rfPazCampo('rf-pz-avs', 'Numero AVS', p && p.avs, { ph: '756.1234.5678.97' })}${rfPazCampo('rf-pz-cassa', 'Cassa malati', p && p.assicurazione)}${rfPazCampo('rf-pz-assicurato', 'Numero assicurato (tessera)', p && p.n_assicurato)}
    ${rfPazCampo('rf-pz-indicazione', 'Indicazione clinica', p && p.indicazione, { ph: 'es. fibrillazione atriale' })}${rfPazCampo('rf-pz-percorso', 'Percorso', nomePerc, { list: 'rf-pz-perc-list', ph: 'dalla pagina Percorsi' })}
    <datalist id="rf-pz-perc-list">${perc.map(x => `<option value="${rfEsc(x.nome)}">`).join('')}</datalist>
  </div>`;
}
function rfPazRaccogli() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  const perc = (RF.percorsi || []).find(x => x.nome === v('rf-pz-percorso'));
  return { cognome: v('rf-pz-cognome'), nome: v('rf-pz-nome'), data_nascita: v('rf-pz-nascita'), sesso: v('rf-pz-sesso'), telefono: v('rf-pz-telefono'), email: v('rf-pz-email'), via: v('rf-pz-via'), npa: v('rf-pz-npa'), localita: v('rf-pz-localita'), avs: v('rf-pz-avs'), assicurazione: v('rf-pz-cassa'), n_assicurato: v('rf-pz-assicurato'), indicazione: v('rf-pz-indicazione'), percorso_id: perc ? perc.id : v('rf-pz-percorso') };
}
function rfPazErrori(errori) {
  const mappa = { cognome: 'rf-pz-cognome', nome: 'rf-pz-nome', data_nascita: 'rf-pz-nascita', sesso: 'rf-pz-sesso', email: 'rf-pz-email', npa: 'rf-pz-npa', avs: 'rf-pz-avs' };
  document.querySelectorAll('#modal .rf-paz-form .err').forEach(e => e.textContent = '');
  for (const [k, m] of Object.entries(errori || {})) { const e = document.getElementById(`${mappa[k] || ''}-err`); if (e) e.textContent = m; }
}
async function rfPazienteSalva(id) {
  const corpo = Object.assign({ azione: id ? 'aggiorna' : 'crea', id }, rfPazRaccogli());
  try {
    const r = await fetch('/api/prototipo/pazienti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 400 && j.errori) { rfPazErrori(j.errori); toast('Controlla i campi segnati'); return; }
    if (!r.ok) { toast(j.errore || 'Salvataggio non riuscito'); return; }
    closeModal(); toast(id ? 'Anagrafica salvata' : 'Paziente creato');
    await rfCaricaDati();
    if (!id && j.id) go(`#/patients/${j.id}`);
  } catch { toast('Piattaforma non raggiungibile'); }
}
function rfPazienteModifica(id) {
  const p = id ? P[id] : null;
  openModal(p ? 'Anagrafica' : 'Nuovo paziente', rfPazForm(p), `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pz-ok">Salva</button>`);
  document.getElementById('rf-pz-ok').onclick = () => rfPazienteSalva(p ? p.id : null);
}
function rfPazientiImporta() {
  openModal('Importa pazienti da CSV', `<p class="meta" style="margin:0 0 10px;line-height:1.5">Prima riga = intestazione: <code>cognome; nome; data di nascita; telefono; e-mail; via; npa; località; avs; cassa; n. assicurato; sesso</code> (bastano cognome e nome; l'ordine non conta; separatore ; , o tabulazione; date 31.12.1950). Le righe già in cartella (stesso cognome, nome e nascita) non si duplicano.</p>
    <input type="file" id="rf-imp-file" accept=".csv,.txt,text/csv" class="mb-16"><textarea class="rf-imp-area" id="rf-imp-testo" placeholder="oppure incolla qui il CSV…"></textarea>
    <div id="rf-imp-esito" class="mt-16"></div>`, `<button class="btn" data-close>Chiudi</button><button class="btn" id="rf-imp-anteprima">Anteprima</button><button class="btn primary" id="rf-imp-conferma" disabled>Importa</button>`);
  const file = document.getElementById('rf-imp-file'); file.onchange = () => { const f = file.files && file.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { document.getElementById('rf-imp-testo').value = String(rd.result || ''); }; rd.readAsText(f); };
  const manda = async (azione) => {
    const csv = document.getElementById('rf-imp-testo').value; if (!csv.trim()) { toast('Incolla o carica un CSV'); return null; }
    const r = await fetch('/api/prototipo/pazienti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione, csv }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.errore || 'Lettura non riuscita'); return null; } return j;
  };
  document.getElementById('rf-imp-anteprima').onclick = async () => {
    const j = await manda('importa'); if (!j) return;
    const et = { nuovo: 'nuovo', esiste: 'già in cartella', errore: 'errore', doppione: 'doppione nel file' };
    document.getElementById('rf-imp-esito').innerHTML = `<div class="row wrap" style="gap:6px"><span class="badge success">${j.riepilogo.nuovi} nuovi</span><span class="badge">${j.riepilogo.esistenti} già in cartella</span>${j.riepilogo.errori ? `<span class="badge danger">${j.riepilogo.errori} con errori</span>` : ''}${j.riepilogo.doppioni ? `<span class="badge warning">${j.riepilogo.doppioni} doppioni</span>` : ''}${j.ignorate.length ? `<span class="caption">colonne ignorate: ${rfEsc(j.ignorate.join(', '))}</span>` : ''}</div>
      <div class="table-wrap mt-8" style="max-height:260px;box-shadow:none"><table class="dense rf-imp-tab"><thead><tr><th>#</th><th>Cognome</th><th>Nome</th><th>Nascita</th><th>AVS</th><th>Esito</th></tr></thead><tbody>${j.righe.map(r => `<tr class="${r.stato}"><td class="num">${r.n}</td><td>${rfEsc(r.dati.cognome)}</td><td>${rfEsc(r.dati.nome)}</td><td class="num">${rfEsc(r.dati.data_nascita || '')}</td><td class="num">${rfEsc(r.dati.avs || '')}</td><td>${et[r.stato]}${r.stato === 'errore' ? ': ' + rfEsc(Object.values(r.errori).join(' ')) : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const b = document.getElementById('rf-imp-conferma'); b.disabled = !j.riepilogo.nuovi; b.textContent = `Importa ${j.riepilogo.nuovi} nuovi`;
  };
  document.getElementById('rf-imp-conferma').onclick = async () => { const j = await manda('importa_conferma'); if (!j) return; toast(`${j.inseriti} pazienti importati`); closeModal(); void rfCaricaDati(); };
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'rf-paz-q') return;
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('tr[data-paz]').forEach((tr) => { const ok = !q || tr.getAttribute('data-paz').includes(q); tr.hidden = !ok; if (ok) n++; });
  const c = document.getElementById('rf-paz-n'); if (c) c.textContent = `${n} ${n === 1 ? 'paziente' : 'pazienti'}`;
});
const rfPatientsOrig = PAGES.patients;
PAGES.patients = () => {
  if (!RF.live) return rfPatientsOrig();
  const inCartella = PATIENTS.filter(p => rfUuid(p.id));
  const soloAgenda = PATIENTS.length - inCartella.length;
  const riga = (p) => `<tr data-go="#/patients/${p.id}" data-paz="${rfEsc(`${p.last} ${p.first} ${p.avs || ''} ${p.phone || ''} ${p.email || ''} ${p.indicazione || ''}`.toLowerCase())}"><td><div class="row"><div class="avatar-sm">${initials(p)}</div><b>${rfEsc(fullName(p))}</b>${rfUuid(p.id) ? '' : ' <span class="caption">solo agenda</span>'}</div></td><td class="num">${p.dob ? `${p.dob} <span class="caption">(${p.age})</span>` : '—'}</td><td class="num">${rfEsc(p.avs || '—')}</td><td class="num">${rfEsc(p.phone || '—')}</td><td>${rfEsc(p.assicurazione || '—')}</td><td>${rfEsc(p.indicazione || '—')}</td><td class="num">${p.lastVisit || '—'}</td><td class="num">${p.next || '—'}</td><td><div class="row">${p.docs.some(d => d.new) ? '<span class="badge accent">Doc. nuovi</span>' : ''}${TASKS.some(t => t.p === p.id && t.status !== 'DONE') ? '<span class="badge">Task</span>' : ''}${p.flags.length ? `<span class="badge warning">${rfEsc(p.flags[0])}</span>` : ''}</div></td></tr>`;
  return `
    <div class="page-head"><div><h2 class="page-title">Pazienti</h2><div class="page-sub"><span id="rf-paz-n">${inCartella.length} in cartella</span>${soloAgenda ? ` · ${soloAgenda} solo in agenda` : ''}</div></div>
      <div class="actions"><button class="btn" onclick="rfPazientiImporta()">${ICONS.upload} Importa CSV</button><button class="btn primary" onclick="rfPazienteModifica(null)">${ICONS.plus} Nuovo paziente</button></div></div>
    <div class="toolbar"><input class="input" id="rf-paz-q" placeholder="Cerca cognome, nome, AVS, telefono, e-mail, indicazione…" autocomplete="off" style="min-width:320px"><button class="btn ai" data-ai="Pazienti con richiamo scaduto">${ICONS.ai} Chiedi a Cleo</button></div>
    <div class="table-wrap"><table><thead><tr><th>Paziente</th><th>Nascita</th><th>AVS</th><th>Telefono</th><th>Cassa</th><th>Indicazione</th><th>Ultima visita</th><th>Prossimo</th><th>Indicatori</th></tr></thead><tbody>
      ${PATIENTS.length ? [...inCartella, ...PATIENTS.filter(p => !rfUuid(p.id))].map(riga).join('') : '<tr><td colspan="9" class="caption">Nessun paziente in cartella: «Nuovo paziente» o «Importa CSV».</td></tr>'}
    </tbody></table></div>`;
};
// Scheda paziente → Overview: tessere, terapia derivata dai referti, fatti del grafo.
const rfOverviewOrig = typeof patientOverview === 'function' ? patientOverview : null;
if (rfOverviewOrig) patientOverview = function (p, clinical) {
  if (!RF.live || !rfUuid(p.id)) return rfOverviewOrig(p, clinical);
  const perc = (RF.percorsi || []).find(x => x.id === p.percorso);
  if (RF.percorsi === null) void rfCaricaPercorsi();
  const visiteFatte = (p.visits || []).filter(v => v.fatta).length;
  const referti = RF.queue.filter(r => r.p === p.id);
  const confermati = referti.filter(r => r.status === 'APPROVED').length;
  const fcMax = p.age ? 220 - Number(p.age) : null;
  const tile = (l, v, s, go) => `<div class="card tight stat ${go ? 'clickable' : ''}" ${go ? `data-go="${go}"` : ''}><span class="label">${l}</span><span class="value" style="font-size:${String(v).length > 12 ? 15 : 24}px;line-height:1.2">${v}</span>${s ? `<span class="delta">${s}</span>` : ''}</div>`;
  return `<div class="grid grid-4">
      ${tile('Indicazione', rfEsc(p.indicazione || '—'), perc ? `percorso: ${rfEsc(perc.nome)}` : (p.percorso ? rfEsc(p.percorso) : ''), '#/percorsi')}
      ${tile('Visite fatte', visiteFatte, p.lastVisit ? `ultima ${p.lastVisit}` : 'dall\'agenda')}
      ${tile('Referti confermati', confermati, referti.length - confermati ? `${referti.length - confermati} in lavorazione` : '', '#/reports')}
      ${tile('Cassa malati', rfEsc(p.assicurazione || '—'), p.n_assicurato ? `n. ${rfEsc(p.n_assicurato)}` : (p.avs ? `AVS ${rfEsc(p.avs)}` : ''))}
    </div>
    <div class="grid grid-main-side mt-16">
      <div class="stack">
        ${clinical ? `<div class="card"><div class="card-head"><span class="section-title">Terapia in corso</span><span class="caption">${p.terapia.length ? `dall'ultimo referto confermato${p.terapiaDa ? ` del ${p.terapiaDa}` : ''}` : 'nessun referto confermato con terapia'}</span></div>
          ${p.terapia.length ? `<ul class="rf-terapia" style="list-style:none;margin:0;padding:0">${p.terapia.map(r => `<li>${rfEsc(r)}</li>`).join('')}</ul>` : '<div class="caption">La terapia si ricava dal blocco «Terapia» del referto confermato: niente da ridigitare.</div>'}</div>` : ''}
        <div class="card"><div class="card-head"><span class="section-title">Quesiti e referral</span><span class="badge count">${p.problems.length}</span></div><div class="list">${p.problems.map(x => `<div class="list-item"><i class="dot ${x.s === 'resolved' ? '' : 'accent'}"></i><div class="grow"><div class="name" style="font-size:13px">${rfEsc(x.l)}</div><div class="sub">${x.s === 'resolved' ? 'chiusa' : 'aperta'} · ${x.since}</div></div></div>`).join('') || '<div class="caption">Nessuna referral</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Esami recenti</span><button class="btn sm ghost" data-go="#/patients/${p.id}/exams">Tutti ${ICONS.chevR}</button></div><div class="list">${p.exams.slice(0, 6).map(e => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(e.t)}</div><div class="sub">${e.d} · ${rfEsc(e.r)}</div></div></div>`).join('') || '<div class="caption">Nessun esame in cartella</div>'}</div></div>
        ${p.fatti && p.fatti.length ? `<div class="card"><div class="card-head"><span class="section-title">Fatti registrati</span><span class="caption">dal grafo della piattaforma</span></div><div class="list">${p.fatti.map(f => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(f.oggetto)}</div><div class="sub">${rfEsc(f.relazione.replace(/_/g, ' '))}${f.data ? ` · ${f.data}` : ''} · ${rfEsc(f.fonte)}</div></div></div>`).join('')}</div></div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><span class="section-title">Prossimo appuntamento</span></div><div style="font-size:18px;font-weight:600">${p.next || '—'}</div><div class="meta">${(p.visits || []).filter(v => v.futura)[0] ? rfEsc((p.visits || []).filter(v => v.futura)[0].motivo || '') : 'nessuno in agenda'}</div></div>
        ${fcMax ? `<div class="card"><div class="card-head"><span class="section-title">FC massimale teorica</span></div><div class="num" style="font-size:18px;font-weight:600">${fcMax} bpm</div><div class="meta">220 − età · 85 % = ${Math.round(fcMax * 0.85)} bpm</div></div>` : ''}
        <div class="card"><div class="card-head"><span class="section-title">Attività aperte</span></div><div class="list">${TASKS.filter(t => t.p === p.id && t.status !== 'DONE').map(t => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('') || '<div class="caption">Nessuna</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Anagrafica</span><button class="btn sm ghost" onclick="rfPazienteModifica('${p.id}')">Modifica</button></div><div class="kv"><b>Nascita</b><span>${p.dob || '—'}${p.sex ? ` · ${p.sex}` : ''}</span><b>Telefono</b><span>${rfEsc(p.phone || '—')}</span><b>E-mail</b><span>${rfEsc(p.email || '—')}</span><b>Indirizzo</b><span>${rfEsc([p.via, [p.npa, p.localita].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—')}</span><b>Medico inviante</b><span>${rfEsc(p.gp || '—')}</span></div></div>
      </div>
    </div>`;
};

/* ---------- Prestazioni: tutti gli appuntamenti con filtri (14.9.2026) ---------- */
if (typeof NAV_META !== 'undefined') NAV_META.prestazioni = ['Prestazioni', 'activity'];
document.addEventListener('change', (e) => { if (e.target && e.target.id && e.target.id.startsWith('rf-pf-')) { state.prestFiltri = state.prestFiltri || {}; state.prestFiltri[e.target.id.slice(6)] = e.target.value; render(); } });
PAGES.prestazioni = () => {
  if (!RF.live) return rfPaginaPiattaforma('Prestazioni', 'Tutte le prestazioni a calendario');
  const f = state.prestFiltri || {};
  const oggi = (RF.data && RF.data.today) || new Date().toISOString().slice(0, 10);
  const tutte = (RF.agenda || []).slice().sort((a, b) => (b.d + b.start).localeCompare(a.d + a.start));
  const settimana = (() => { const d = new Date(`${oggi}T12:00:00`); const a = new Date(d); a.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const b = new Date(a); b.setDate(a.getDate() + 6); return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)]; })();
  const periodo = f.periodo || 'settimana';
  const inPeriodo = (a) => periodo === 'oggi' ? a.d === oggi : periodo === 'settimana' ? (a.d >= settimana[0] && a.d <= settimana[1]) : periodo === 'mese' ? a.d.slice(0, 7) === oggi.slice(0, 7) : true;
  const statoDi = (a) => a.status === 'COMPLETED' ? 'completata' : a.status === 'CANCELLED' ? 'annullata' : (a.d < oggi || (a.d === oggi && a.late)) ? 'passata' : 'programmata';
  const lista = tutte.filter(a => inPeriodo(a) && (!f.tipo || a.tipoPrest === f.tipo) && (!f.stato || statoDi(a) === f.stato) && (!f.sala || (a.room || '') === f.sala) && (!f.medico || a.doc === f.medico));
  const sale = [...new Set(tutte.map(a => a.room).filter(Boolean))].sort();
  const medici = [...new Set(tutte.map(a => a.doc).filter(d => d && d !== 'studio'))];
  const ET = { visita: 'Visita', esame: 'Esame', procedura: 'Procedura' }; const ES = { completata: 'success', annullata: '', passata: 'warning', programmata: 'accent' };
  const conta = (t) => lista.filter(a => a.tipoPrest === t).length;
  const sel = (id, val, opts, primo) => `<select class="input sm" id="rf-pf-${id}"><option value="">${primo}</option>${opts.map(o => `<option value="${rfEsc(o[0])}" ${val === o[0] ? 'selected' : ''}>${rfEsc(o[1])}</option>`).join('')}</select>`;
  // Nel riquadro solo il nome: data di nascita, numero paziente e sigla
  // dell'agenda stanno nella scheda che si apre cliccando, non addosso al
  // riquadro dove non ci stanno e coprono tutto.
  const nomeDi = (a) => (a.p && P[a.p]) ? fullName(P[a.p]) : (a.nomeBreve || a.nome || 'Paziente');
  return `<div class="page-head"><div><div class="eyebrow">Attività clinica</div><h2 class="page-title">Prestazioni</h2><div class="page-sub">${lista.length} nel periodo · ${conta('visita')} visite · ${conta('esame')} esami · ${conta('procedura')} procedure · dall'agenda MediOnline (±30 giorni)</div></div>
      <div class="actions"><button class="btn" data-go="#/administration">${ICONS.settings} Catalogo</button></div></div>
    <div class="toolbar">${sel('periodo', periodo, [['oggi', 'Oggi'], ['settimana', 'Questa settimana'], ['mese', 'Questo mese'], ['tutto', 'Tutto (±30 gg)']], 'Periodo')}${sel('tipo', f.tipo || '', [['visita', 'Visite'], ['esame', 'Esami'], ['procedura', 'Procedure']], 'Tutti i tipi')}${sel('stato', f.stato || '', [['programmata', 'Programmate'], ['passata', 'Passate, non segnate'], ['completata', 'Completate'], ['annullata', 'Annullate']], 'Tutti gli stati')}${sale.length ? sel('sala', f.sala || '', sale.map(x => [x, x]), 'Tutte le sale') : ''}${medici.length ? sel('medico', f.medico || '', medici.map(m => [m, DOCTORS[m] || m]), 'Tutti i medici') : ''}</div>
    <div class="card"><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Data</th><th>Ora</th><th>Paziente</th><th>Prestazione</th><th>Tipo</th><th>Medico</th><th>Sala</th><th>Durata</th><th>Stato</th></tr></thead><tbody>
      ${lista.length ? lista.slice(0, 400).map(a => { const st = statoDi(a); return `<tr ${a.p ? `data-go="#/patients/${a.p}"` : ''}><td class="num">${rfEsc(a.d.split('-').reverse().join('.'))}</td><td class="num">${a.start}</td><td><b>${rfEsc(nomeDi(a))}</b></td><td>${rfEsc(a.prestazione || a.reason || '')}${a.prestazione && a.reason && a.prestazione !== a.reason ? `<div class="caption">${rfEsc(a.reason)}</div>` : ''}</td><td><span class="badge">${ET[a.tipoPrest] || '—'}</span></td><td>${rfEsc(DOCTORS[a.doc] || '—')}</td><td>${rfEsc(a.room || '—')}</td><td class="num">${a.dur}'</td><td><span class="badge ${ES[st]}">${st}</span></td></tr>`; }).join('') : '<tr><td colspan="9" class="caption">Nessuna prestazione con questi filtri.</td></tr>'}
    </tbody></table></div>${lista.length > 400 ? '<div class="caption mt-8">Mostrate le prime 400: restringi il periodo.</div>' : ''}</div>
    ${!(RF.data && RF.data.catalogo && RF.data.catalogo.length) ? `<div class="card mt-16" style="border-left:3px solid var(--warning)"><p class="meta" style="margin:0;line-height:1.55"><b>Catalogo vuoto</b>: il tipo è stimato dal testo dell'agenda. In Studio → Prestazioni si crea il catalogo (anche in un clic dalle prestazioni dei percorsi) e si scrivono le parole chiave con cui ogni voce compare in agenda.</p></div>` : ''}`;
};

/* ---------- Chiamate di preparazione e Medici invianti (14.9.2026) ---------- */
async function rfChiamata(appointmentId, patientId) {
  const sel = document.getElementById(`rf-ch-${appointmentId}`); const esito = sel ? sel.value : 'raggiunto';
  try {
    const r = await fetch('/api/prototipo/chiamate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_id: appointmentId, patient_id: rfUuid(patientId) ? patientId : null, esito }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.errore || 'Non registrata'); return; }
    toast('Chiamata registrata'); void rfCaricaDati();
  } catch { toast('Piattaforma non raggiungibile'); }
}
if (typeof NAV_META !== 'undefined') NAV_META.invianti = ['Medici invianti', 'users'];
RF.invianti = null;
async function rfCaricaInvianti() {
  try { const r = await fetch('/api/prototipo/invianti', { credentials: 'include' }); const j = r.ok ? await r.json() : {}; RF.invianti = { lista: Array.isArray(j.invianti) ? j.invianti : [], referral_12m: j.referral_12m || 0 }; }
  catch { RF.invianti = { lista: [], referral_12m: 0 }; }
  if (state.route === 'invianti') render();
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'rf-inv-q') return;
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('tr[data-inv]').forEach((tr) => { const ok = !q || tr.getAttribute('data-inv').includes(q); tr.hidden = !ok; if (ok) n++; });
  const c = document.getElementById('rf-inv-n'); if (c) c.textContent = `${n} invianti`;
});
function rfInvianteApri(id) {
  const d = (RF.invianti && RF.invianti.lista.find(x => x.id === id)); if (!d) return;
  const ST = { ricevuta: 'ricevuta', triage: 'triage', da_prenotare: 'da prenotare', prenotata: 'prenotata', vista: 'vista', chiusa: 'chiusa' };
  openSheet(rfEsc(d.nome), `<div class="kv"><b>Studio</b><span>${rfEsc(d.studio || '—')}</span><b>Telefono</b><span>${rfEsc(d.telefono || '—')}</span><b>E-mail</b><span>${rfEsc(d.email || '—')}</span><b>HIN</b><span>${rfEsc(d.hin || '—')}</span><b>Referral</b><span>${d.n_12m} negli ultimi 12 mesi · ${d.n_tot} in totale${d.ultimo ? ` · ultima ${d.ultimo}` : ''}</span></div>
    <div class="section-title mt-16">Ultime referral</div><div class="list">${(d.referral || []).map(r => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(r.paziente)}</div><div class="sub">${r.data} · ${ST[r.stato] || r.stato}${r.quesito ? ` · ${rfEsc(r.quesito)}` : ''}</div></div><a class="btn sm" href="/referral/${r.id}">Apri</a></div>`).join('') || '<div class="caption">Nessuna referral.</div>'}</div>`);
}
function rfInvianteNuovo() {
  openModal('Nuovo medico inviante', `<div class="field"><label>Nome (Dr. med. …)</label><input class="input" id="rf-inv-nome"></div><div class="field mt-8"><label>Studio</label><input class="input" id="rf-inv-studio"></div><div class="grid grid-2 mt-8"><div class="field"><label>Telefono</label><input class="input" id="rf-inv-tel"></div><div class="field"><label>E-mail</label><input class="input" id="rf-inv-email" type="email"></div></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-inv-ok">Aggiungi</button>`);
  document.getElementById('rf-inv-ok').onclick = async () => {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    try { const r = await fetch('/api/prototipo/invianti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: v('rf-inv-nome'), studio: v('rf-inv-studio'), telefono: v('rf-inv-tel'), email: v('rf-inv-email') }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.errore || 'Non salvato'); return; } closeModal(); toast('Inviante aggiunto'); void rfCaricaInvianti(); } catch { toast('Piattaforma non raggiungibile'); }
  };
}
PAGES.invianti = () => {
  if (!RF.live) return rfPaginaPiattaforma('Medici invianti', 'Chi manda i pazienti allo studio');
  if (RF.invianti === null) { void rfCaricaInvianti(); return `<div class="page-head"><div><h2 class="page-title">Medici invianti</h2></div></div><div class="card"><p class="meta" style="margin:0">Carico…</p></div>`; }
  const lista = RF.invianti.lista;
  return `<div class="page-head"><div><div class="eyebrow">${rfEsc((RF.data.utente || {}).studio || '')}</div><h2 class="page-title">Medici invianti</h2><div class="page-sub"><span id="rf-inv-n">${lista.length} invianti</span> · ${RF.invianti.referral_12m} referral negli ultimi 12 mesi</div></div>
      <div class="actions"><input class="input" id="rf-inv-q" placeholder="Cerca nome, studio, città…" autocomplete="off"><button class="btn primary" onclick="rfInvianteNuovo()">${ICONS.plus} Nuovo inviante</button></div></div>
    <div class="card"><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Medico</th><th>Studio</th><th>Telefono</th><th>E-mail</th><th class="num">Referral 12 mesi</th><th class="num">Totale</th><th>Ultima</th></tr></thead><tbody>
      ${lista.length ? lista.map(d => `<tr data-inv="${rfEsc(`${d.nome} ${d.studio || ''} ${d.email || ''}`.toLowerCase())}" onclick="rfInvianteApri('${d.id}')" style="cursor:pointer"><td><b>${rfEsc(d.nome)}</b></td><td>${rfEsc(d.studio || '—')}</td><td class="num">${rfEsc(d.telefono || '—')}</td><td>${rfEsc(d.email || '—')}</td><td class="num"><b>${d.n_12m}</b></td><td class="num">${d.n_tot}</td><td class="num">${d.ultimo || '—'}</td></tr>`).join('') : '<tr><td colspan="7" class="caption">Nessun medico inviante: si aggiungono qui o arrivano da soli con la prima referral.</td></tr>'}
    </tbody></table></div></div>`;
};

/* ---------- Suggerisci una modifica (14.9.2026) ---------- */
RF.sugg = null;
async function rfCaricaSuggerimenti() {
  try { const r = await fetch('/api/prototipo/suggerimenti', { credentials: 'include' }); const j = r.ok ? await r.json() : {}; RF.sugg = Array.isArray(j.suggerimenti) ? j.suggerimenti : []; } catch { RF.sugg = []; }
  if (state.route === 'administration') render();
}
function rfSuggerisci() {
  const pagina = (NAV_META[state.route] || [state.route])[0];
  openModal('Suggerisci una modifica', `<p class="meta" style="margin:0 0 10px;line-height:1.5">Un campo che manca, una schermata da semplificare, una parola che da voi si dice in un altro modo. La richiesta resta nella piattaforma (Studio → Suggerimenti); lo sviluppatore riceve un avviso e la vede lì. <b>Non scrivere nomi di pazienti né dati clinici.</b></p><div class="caption">Pagina: ${rfEsc(pagina)}</div><textarea class="rf-imp-area mt-8" id="rf-sug-testo" placeholder="Vorrei che…" style="font-family:var(--font);min-height:110px"></textarea>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-sug-ok">Invia</button>`);
  document.getElementById('rf-sug-ok').onclick = async () => {
    const testo = (document.getElementById('rf-sug-testo').value || '').trim();
    try { const r = await fetch('/api/prototipo/suggerimenti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'crea', pagina, testo }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.errore || 'Non inviato'); return; } closeModal(); toast('Grazie: suggerimento registrato'); RF.sugg = null; } catch { toast('Piattaforma non raggiungibile'); }
  };
}
async function rfSuggStato(id, stato) {
  const risposta = stato === 'no' ? (prompt('Una riga di risposta (facoltativa):') || '') : '';
  try { const r = await fetch('/api/prototipo/suggerimenti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'stato', id, stato, risposta }) }); if (!r.ok) { toast('Non aggiornato'); return; } toast('Aggiornato'); RF.sugg = null; render(); } catch { toast('Piattaforma non raggiungibile'); }
}

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
// Pagina AI (14.9.2026, richiesta utente): la STESSA conversazione del pannello
// laterale, a tutto schermo. Stesso `state.aiMessages`, stesso `askAI` (codice
// che decide, procedure con traccia, modello locale per la sintesi): non è una
// seconda chat. Quando si è su questa pagina il pannello laterale resta chiuso.
const RF_AI_NOME = 'Cleo';
(function () { const st = document.createElement('style'); st.textContent = `
.rf-aip { display:flex; flex-direction:column; height: calc(100vh - var(--topbar-h) - 150px); min-height: 420px; }
.rf-aip .ai-body { flex:1; overflow:auto; padding: 18px 22px; gap: 14px; }
.rf-aip .ai-msg { font-size: 14px; line-height: 1.55; max-width: 780px; }
.rf-aip .ai-msg.user { max-width: 70%; }
.rf-aip .ai-input { padding: 12px 18px; }
.rf-aip .ai-input input { height: 42px; font-size: 14px; }
.rf-aip-chips { display:flex; flex-wrap:wrap; gap:6px; padding: 0 22px 12px; }
/* Cleo a tutto schermo: la pagina esce dal riquadro e diventa una chat.
   La forma è quella che tutti conoscono (colonna stretta al centro, campo a
   pastiglia in basso); la sostanza no — vedi la riga di chiusura. */
.rf-gpt { display:flex; flex-direction:column; height:100%; }
.rf-gpt-top { flex:none; display:flex; align-items:center; gap:10px; padding:10px 24px; border-bottom:1px solid var(--border); }
/* Il segno di Cleo: la stella di ICONS.ai, la stessa della voce nel menu.
   Ferma quando è in attesa, pulsante mentre lavora — così dice qualcosa
   invece di essere un ornamento. */
.rf-segno { display:inline-flex; vertical-align:-2px; margin-right:6px; color:var(--accent); }
.rf-segno svg { width:15px; height:15px; }
.rf-segno.viva { animation: pulse 1.4s infinite; }
/* Agenda: colonne dei tipi (quel che non è di un medico), staccate dalle
   colonne dei medici da una linea più marcata. */
.cal-head.rf-tipo { background: var(--surface-3); color: var(--text-2); }
.cal-head.rf-tipo:first-of-type { box-shadow: inset 2px 0 0 var(--border-2); }
/* Sovrapposti: quando si dividono la colonna il testo si stringe. */
.appt.rf-stretta { padding: 4px 5px; font-size: 11px; border-radius: 7px; }
.appt.rf-stretta .n { gap: 4px; font-size: 11px; }
.appt.rf-stretta .s { font-size: 10px; }
.appt.rf-stretta .dot { width: 6px; height: 6px; }
/* Di chi è la stanza, accanto al nome nel riquadro «Sale oggi». */
.rf-sala-chi { display:block; font-size:11.5px; font-weight:400; color:var(--accent); margin-top:1px; }
.rf-sala-chi.vuota { color:var(--text-3); font-style:italic; }
/* Piano delle sale: preparato dal cron prima che qualcuno lo chieda. */
.rf-piano { display:flex; flex-direction:column; }
.rf-piano-prop { margin-top:10px; padding:10px 12px; border-radius:var(--r-card,10px); background:var(--accent-soft); }
.rf-piano-prop .t { display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:650; text-transform:uppercase; letter-spacing:.03em; color:var(--accent-text); margin-bottom:6px; }
.rf-piano-prop .t svg { width:13px; height:13px; }
.rf-piano-prop .c { font-size:12.5px; line-height:1.5; }
/* Con medici + tipi le colonne diventano tante: la griglia scorre dentro il
   suo riquadro invece di essere tagliata (.cal ha overflow:hidden). */
.rf-cal-scorre { overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
.rf-cal-scorre .cal { min-width: min-content; }
.rf-gpt-top .actions { margin-left:auto; }
/* «modello locale, su questo Mac» sta accanto al nome nella barra in alto:
   è la stessa informazione, detta una volta sola e nel posto più visibile. */
.topbar .title .rf-sotto { font-weight:400; font-size:12px; color:var(--text-3); }
@media (max-width: 900px) { .topbar .title .rf-sotto { display:none; } }
.rf-gpt-scroll { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
.rf-gpt-scroll.vuota { justify-content:center; }
.rf-gpt-col { width:100%; max-width:760px; margin:0 auto; padding:0 24px; }
.rf-gpt-thread { display:flex; flex-direction:column; gap:24px; padding:30px 0 10px; }
.rf-gpt-foot { flex:none; padding:10px 0 34px; }
/* I messaggi li scrive askAI: qui si rivestono, non si riscrivono. */
.rf-gpt .ai-msg { max-width:none; padding:0; border:0; border-radius:0; background:none; font-size:15px; line-height:1.65; color:var(--text); }
.rf-gpt .ai-msg.user { align-self:flex-end; max-width:78%; padding:10px 16px; border-radius:20px; background:var(--surface-3); color:var(--text); }
.rf-gpt .ai-msg .srcs { margin-top:10px; }
.rf-gpt .ai-thinking, .rf-gpt .ai-steps { font-size:13.5px; }
/* Campo a pastiglia. */
.rf-gpt-comp { display:flex; align-items:center; gap:8px; padding:6px 6px 6px 18px; border:1px solid var(--border); border-radius:26px; background:var(--surface); box-shadow:var(--shadow-1); }
.rf-gpt-comp:focus-within { border-color:var(--accent); }
.rf-gpt-comp input { flex:1; min-width:0; height:38px; border:0; background:none; outline:none; font:inherit; font-size:15px; color:var(--text); }
/* Solo il tondo d'invio: se il selettore prende tutti i bottoni schiaccia
   anche le pillole dei modi (è più specifico di .rf-modo). */
.rf-gpt-comp > button.invia { flex:none; width:34px; height:34px; padding:0; border:0; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.rf-gpt-comp > button.invia svg { width:16px; height:16px; }
.rf-gpt-nota { margin:9px 0 0; text-align:center; font-size:11.5px; line-height:1.5; color:var(--text-3); }
/* Modi dentro il campo, come i tasti «ricerca approfondita» o «crea immagine». */
.rf-gpt-comp { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:10px 10px 9px 18px; }
.rf-gpt-comp input { grid-column:1 / -1; height:30px; }
.rf-gpt-modi { grid-column:1; display:flex; gap:6px; flex-wrap:wrap; margin-left:-12px; }
.rf-gpt-comp > button.invia { grid-column:2; }
.rf-modo { display:inline-flex; flex:none; align-items:center; gap:6px; height:30px; padding:0 12px; white-space:nowrap; border:1px solid var(--border); border-radius:999px; background:transparent; font:inherit; font-size:12.5px; color:var(--text-2); cursor:pointer; }
.rf-modo svg { width:14px; height:14px; }
.rf-modo:hover { border-color:var(--border-2); }
.rf-modo[aria-pressed="true"] { border-color:var(--accent); background:var(--accent-soft); color:var(--accent-text); font-weight:600; }
/* Il momento che rende sicura tutta la faccenda: si vede prima di partire. */
.rf-med { border:1px solid var(--accent); border-radius:var(--r-card,10px); background:var(--surface); padding:14px 18px; margin-bottom:10px; }
.rf-med .t { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:650; text-transform:uppercase; letter-spacing:.03em; color:var(--text-3); margin-bottom:9px; }
.rf-med .t svg { width:14px; height:14px; }
.rf-cart-lista { display:flex; flex-direction:column; gap:4px; margin-top:8px; max-height:220px; overflow:auto; }
.rf-cart-v { display:flex; align-items:baseline; gap:8px; width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer;
  border:1px solid var(--border); background:var(--surface); border-radius:9px; padding:7px 10px; font-size:12.5px; transition:.14s var(--ease); }
.rf-cart-v:hover { border-color:var(--accent); background:var(--accent-soft); }
.rf-cart-v b { font-weight:600; }
.rf-cart-v span { color:var(--text-3); font-size:11.5px; margin-left:auto; }
.rf-cart-p { margin:8px 0; padding:9px 11px; border-radius:10px; background:var(--surface-2); font-size:12.5px; line-height:1.55; }
.rf-cart-t { width:100%; box-sizing:border-box; margin-top:4px; padding:7px 9px; border:1px solid var(--border); border-radius:8px;
  font:inherit; font-size:12.5px; line-height:1.5; color:var(--text-1); background:var(--surface-1); resize:vertical; }
.rf-cart-t:focus { outline:none; border-color:var(--accent); }
.rf-cert { margin-left:auto; font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.04em;
  padding:2px 7px; border-radius:999px; background:var(--surface-2); color:var(--text-3); }
.rf-cert.alta { background:#e8f3ee; color:#0d5c48; }
.rf-cert.bassa { background:#fdf0e6; color:#8a4b12; }
.rf-cart-p b { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-3); margin-bottom:3px; }
.rf-med textarea { width:100%; min-height:62px; padding:9px 11px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2); font:inherit; font-size:14px; line-height:1.5; color:var(--text); resize:vertical; }
.rf-med .segnali { margin:9px 0 0; display:flex; flex-direction:column; gap:4px; }
.rf-med .segnale { font-size:12.5px; display:flex; align-items:flex-start; gap:6px; }
.rf-med .segnale.blocco { color:var(--danger); }
.rf-med .segnale.avviso { color:var(--warning); }
.rf-med .azioni { display:flex; align-items:center; gap:8px; margin-top:12px; }
.rf-med .dove { margin-left:auto; font-size:11.5px; color:var(--text-3); text-align:right; }
.rf-gen { border-left:3px solid var(--accent); padding-left:14px; }
.rf-gen .et { display:inline-block; font-size:11px; font-weight:650; text-transform:uppercase; letter-spacing:.03em; color:var(--text-3); margin-bottom:6px; }
/* Apertura: saluto, campo al centro, e le domande che sappiamo rispondere. */
.rf-gpt-w { padding:24px 0; }
.rf-gpt-w h3 { margin:0 0 18px; font-size:25px; font-weight:650; letter-spacing:-0.015em; text-align:center; }
.rf-gpt-w .sotto { margin:14px 0 22px; font-size:13px; line-height:1.55; color:var(--text-2); text-align:center; }
.rf-aiw-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px 20px; }
.rf-aiw-g > .t { display:flex; align-items:center; gap:7px; font-size:11.5px; font-weight:650; letter-spacing:.03em; text-transform:uppercase; color:var(--text-3); margin:0 0 4px; }
.rf-aiw-g > .t svg { width:13px; height:13px; }
.rf-aiw-g button { display:block; width:100%; text-align:left; border:0; background:none; padding:6px 10px; margin:0 -10px; border-radius:8px; font:inherit; font-size:13.5px; color:var(--text); cursor:pointer; }
.rf-aiw-g button:hover { background:var(--surface-2); }
.rf-aiw-g .da { display:block; font-size:11.5px; color:var(--text-3); margin-top:1px; }
/* Fuori dal riquadro: niente margini del contenuto, niente pannello laterale
   dell'AI (sarebbe la stessa chat due volte). La barra di sicurezza RESTA:
   quando c'è un contesto paziente dice che l'AI è isolata su quel paziente,
   ed è qui che conta. */
#app.ai-mode .ai-panel { display:none; }
#app.ai-mode .content { padding:0; overflow:hidden; }
#app.ai-mode .content > .page { max-width:none; height:100%; animation:none; }
#app.ai-mode.with-ai { grid-template-columns: var(--sidebar-w) 1fr; }
#app.ai-mode.with-ai.sidebar-collapsed { grid-template-columns: var(--sidebar-c) 1fr; }
/* Agenda a tutta larghezza: le colonne sono tante e nessuno vuole scorrere di
   lato per vedere la propria. Si toglie il limite di 1440 px e si stringono i
   margini; le colonne si restringono fino a --cal-min, calcolato su quante
   sono, e solo se proprio non ci stanno la griglia scorre. */
#app.agenda-larga .content > .page { max-width: none; }
#app.agenda-larga .content { padding-left: 14px; padding-right: 14px; }
/* Le sale stanno in mezzo: più larghe della pagina normale (1440), non senza
   limite come l'agenda — oltre una certa larghezza le colonne diventano
   lenzuola e l'occhio deve viaggiare per niente. */
#app.sale-larga .content > .page { max-width: 1760px; }
#app.sale-larga .content { padding-left: 20px; padding-right: 20px; }
.cal { grid-template-columns: 52px repeat(var(--cols, 3), minmax(var(--cal-min, 180px), 1fr)); }
.cal-head { padding: 9px 10px; }
.cal.rf-fitta .cal-head { padding: 8px 7px; font-size: 12px; }
.cal.rf-fitta .appt { padding: 4px 6px; font-size: 11.5px; border-radius: 8px; }
.cal.rf-fitta .appt .n { font-size: 11.5px; gap: 5px; }
.cal.rf-fitta .appt .s { font-size: 10.5px; }
.cal.rf-fitta .appt .dot { width: 6px; height: 6px; }
@media (max-width: 767px) { .rf-aip { height: calc(100vh - var(--topbar-h) - 190px); } .rf-aip .ai-body { padding: 12px; } .rf-aip .ai-msg.user { max-width: 88%; }
  .rf-gpt-col { padding:0 16px; } .rf-gpt-top { padding:8px 16px; } .rf-gpt-w h3 { font-size:21px; } .rf-aiw-grid { grid-template-columns:1fr; gap:14px; } .rf-gpt-foot { padding-bottom:78px; } }
`; document.head.appendChild(st); })();
function rfAiPaginaInvia() {
  const el = document.getElementById('rf-aip-in'); const v = el ? el.value.trim() : '';
  if (!v) return; el.value = '';
  if (state.modoMedico && rfPuoDomandaMedica()) { void rfDomandaMedica(v); return; }
  if (state.modoCartella && rfPuoDomandaMedica()) { void rfCartellaChiedi(v); return; }
  askAI(v);
}
// Domanda avviata ma non mandata: quelle che finiscono con un nome le scrive
// la persona, non le indoviniamo noi.
function rfAiPrecompila(inizio) {
  const el = document.getElementById('rf-aip-in');
  if (!el) return;
  el.value = inizio;
  el.focus();
  el.setSelectionRange(inizio.length, inizio.length);
}
// Campo della domanda: nella schermata vuota sta al centro sotto il saluto,
// a conversazione iniziata in fondo. È lo stesso pezzo, spostato.
// Il modo «domanda medica» lo può accendere chi fa medicina: la segreteria no.
function rfPuoDomandaMedica() { return ['doctor', 'org_admin'].includes(state.role); }
function rfModoMedico() { state.modoMedico = !state.modoMedico; if (state.modoMedico) state.modoCartella = false; render(); const i = document.getElementById('rf-aip-in'); if (i) i.focus(); }
/* «Con la cartella»: il modello locale legge la cartella intera e prepara il
   contesto minimo che servirebbe a chi non conosce il paziente. In questa
   fetta NON esce niente — si mostra che cosa uscirebbe. */
function rfModoCartella() { state.modoCartella = !state.modoCartella; if (state.modoCartella) state.modoMedico = false; render(); const i = document.getElementById('rf-aip-in'); if (i) i.focus(); }
function rfAiCampo() {
  const paz = state.patientCtx && P[state.patientCtx] ? P[state.patientCtx] : null;
  const med = !!state.modoMedico;
  const ph = med
    ? 'Scrivi la domanda come ti viene, col paziente dentro: non esce da qui'
    : state.modoCartella
      ? (paz ? `Chiedi guardando la cartella di ${rfEsc(paz.first)}…` : 'Scegli un paziente qui sotto, poi scrivi la domanda…')
      : (paz ? 'Chiedi qualcosa su ' + rfEsc(paz.first) + '…' : 'Scrivi una domanda…');
  return `<div class="rf-gpt-comp">
    <input id="rf-aip-in" placeholder="${ph}" autocomplete="off" onkeydown="if(event.key==='Enter'){rfAiPaginaInvia();}">
    <div class="rf-gpt-modi">${rfPuoDomandaMedica() ? `<button type="button" class="rf-modo" aria-pressed="${med}" onclick="rfModoMedico()" title="La domanda viene riscritta in forma generale dal modello locale, e la approvi tu prima che parta">${ICONS.activity} Domanda medica</button>
      <button type="button" class="rf-modo" aria-pressed="${!!state.modoCartella}" onclick="rfModoCartella()" title="Il modello locale legge la cartella intera e prepara il minimo che servirebbe a chi non conosce il paziente. In questa versione non esce niente: si guarda e basta.">${ICONS.file || ICONS.patients} Con la cartella</button>` : ''}</div>
    <button type="button" class="invia" title="Invia" onclick="rfAiPaginaInvia()">${ICONS.send}</button>
  </div>`;
}
function rfAiNota() {
  return `<p class="rf-gpt-nota">${rfEsc(RF_AI_NOME)} non dà consigli clinici e non fa diagnosi. Sotto ogni risposta c'è «Da dove viene»; se un dato non c'è lo dice invece di inventarlo. Nessuna domanda esce da questo Mac.</p>`;
}
// Schermata d'apertura: quattro gruppi di domande che sappiamo rispondere,
// ognuna con scritto DA DOVE arriverà la risposta.
function rfAiBenvenuto() {
  const paz = state.patientCtx && P[state.patientCtx] ? P[state.patientCtx] : null;
  const nomePaz = paz ? `${paz.last} ${paz.first}`.trim() : '';
  const gruppi = [
    { t: 'La giornata', icona: ICONS.clock, voci: [
      ['prepara la giornata', 'dal codice, subito'],
      ['chi arriva domani', 'dall\'agenda della Cassa dei Medici'],
      ['di chi è la Sala 3 oggi pomeriggio', 'dalle regole delle sale'],
      ['dove mettiamo un\'urgenza alle 15', 'proposta, non decisione'],
    ] },
    { t: 'Rimasto indietro', icona: ICONS.alert, voci: [
      ['lettere in ritardo', 'dalle referral e dai referti'],
      ['prestazioni ancora da fatturare', 'dallo stato in agenda'],
      ['referti da confermare', 'dalle bozze della catena'],
    ] },
    { t: 'Come si fa', icona: ICONS.book, voci: [
      ['come si fa la chiusura mensile', 'dalla procedura scritta'],
      ['chi si occupa dei richiami', 'dall\'organizzazione dello studio'],
      ['quale percorso per le palpitazioni', 'dai percorsi validati'],
    ] },
    { t: 'Un paziente', icona: ICONS.patients, voci: [
      [nomePaz ? `cosa è cambiato per ${nomePaz}` : 'cosa è cambiato per ', 'dai referti confermati', !nomePaz],
      [nomePaz ? `che esami ha fatto ${nomePaz}` : 'che esami ha fatto ', 'dai documenti della cartella', !nomePaz],
      [nomePaz ? `documenti di ${nomePaz}` : 'documenti di ', 'dalla cartella', !nomePaz],
    ] },
  ];
  const voce = ([testo, da, precompila]) => precompila
    ? `<button type="button" onclick="rfAiPrecompila(${JSON.stringify(testo).replace(/"/g, '&quot;')})">${rfEsc(testo)}…<span class="da">${rfEsc(da)}</span></button>`
    : `<button type="button" data-ai="${rfEsc(testo)}">${rfEsc(testo)}<span class="da">${rfEsc(da)}</span></button>`;
  return `<div class="rf-gpt-w">
    <h3>Che cosa ti serve sapere?</h3>
    ${rfCartellaRiquadro()}${rfAiCampo()}
    <p class="sotto">${rfEsc(RF_AI_NOME)} legge quello che c'è qui dentro — agenda, attività, referti, documenti, cartelle, procedure dello studio — e niente altro. Le risposte immediate le calcola il codice; quelle di sintesi il modello che gira su questo Mac.</p>
    <div class="rf-aiw-grid">${gruppi.map(g => `<div class="rf-aiw-g"><div class="t">${g.icona}${rfEsc(g.t)}</div>${g.voci.map(voce).join('')}</div>`).join('')}</div>
    ${rfAiNota()}
  </div>`;
}
/* ---------- Domanda medica in generale (14.9.2026) ----------
   La domanda del medico resta sul Mac. Il modello LOCALE la riscrive come
   domanda di medicina generale — non pseudonimizzata: proprio senza nessun
   paziente — e la persona la approva prima che parta. Il codice della
   piattaforma la ricontrolla lato server: il modello propone, il codice
   decide. La risposta arriva staccata e non entra in cartella. */
async function rfDomandaMedica(q) {
  state.aiMessages.push({ html: `<div class="ai-msg user">${rfEsc(q)}</div>` });
  state.medica = { originale: q, generale: '', blocchi: [], avvisi: [], stato: 'riformulo' };
  render();
  try {
    const r = await fetch('/api/prototipo/domanda-medica', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'riformula', domanda: q }),
    });
    const j = await r.json().catch(() => ({}));
    if (j && j.non_medica) {
      state.medica = null; state.modoMedico = false;
      state.aiMessages.push({ html: `<div class="ai-msg ai">Questa non sembra una domanda di medicina: la giro a ${rfEsc(RF_AI_NOME)} come al solito.</div>` });
      render(); askAI(q); return;
    }
    if (!r.ok) {
      state.medica = null;
      state.aiMessages.push({ html: `<div class="ai-msg ai">${rfEsc(j.errore || 'Riformulazione non riuscita.')} <span class="caption">La domanda non è uscita da qui.</span></div>` });
      render(); return;
    }
    state.medica = { originale: q, generale: j.generale || '', blocchi: j.blocchi || [], avvisi: j.avvisi || [], stato: 'attesa' };
  } catch {
    state.medica = null;
    state.aiMessages.push({ html: `<div class="ai-msg ai">Piattaforma non raggiungibile. La domanda non è uscita da qui.</div>` });
  }
  render();
}
function rfMedicaModifica(t) {
  const m = state.medica; if (!m) return;
  m.generale = t;
  if (!(m.blocchi || []).length) return;
  // Si riaccende il tasto a mano: un render qui sposterebbe il cursore.
  m.blocchi = [];
  const box = document.querySelector('.rf-med');
  if (!box) return;
  const ok = box.querySelector('.azioni .btn.primary'); if (ok) ok.disabled = false;
  box.querySelectorAll('.segnale.blocco').forEach(e => e.remove());
  const dove = box.querySelector('.dove'); if (dove) dove.textContent = 'La domanda originale resta su questo Mac.';
}
function rfMedicaAnnulla() { state.medica = null; render(); }
async function rfMedicaInvia() {
  const m = state.medica; if (!m) return;
  const area = document.getElementById('rf-med-testo');
  const generale = (area ? area.value : m.generale).trim();
  if (!generale) return;
  state.medica = { ...m, generale, stato: 'invio' };
  render();
  try {
    const r = await fetch('/api/prototipo/domanda-medica', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'chiedi', domanda: m.originale, generale }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // «Non c'è ancora un modello adatto» non è un errore della domanda: la
      // riformulazione è buona, manca il destinatario. Si dice e si chiude.
      if (j.non_collegato) {
        state.medica = null;
        state.aiMessages.push({ html: `<div class="ai-msg ai"><b>La domanda è pronta, ma non parte.</b><br>${rfEsc(j.errore || '')}<div class="caption" style="margin-top:6px">Domanda riscritta: «${rfEsc(generale)}» — puoi copiarla e porla dove vuoi.</div></div>` });
        render(); return;
      }
      state.medica = { ...m, generale, stato: 'attesa', blocchi: j.blocchi || [{ tipo: 'errore', spiega: j.errore || 'non riuscita' }], avvisi: j.avvisi || [] };
      render(); return;
    }
    state.medica = null;
    state.aiMessages.push({ html: `<div class="ai-msg ai rf-gen"><span class="et">Risposta generale · non riferita a un paziente</span><div>${rfEsc(j.risposta || 'Nessuna risposta.').replace(/\n/g, '<br>')}</div><div class="srcs"><span class="src">domanda riscritta: ${rfEsc(generale)}</span><span class="src">${j.dove === 'locale' ? 'modello locale, su questo Mac' : rfEsc(j.dove || '')}</span></div><div class="caption" style="margin-top:6px">Conoscenza generale, non un parere sul tuo paziente: non viene salvata in cartella.</div></div>` });
  } catch {
    state.medica = { ...m, generale, stato: 'attesa', blocchi: [{ tipo: 'errore', spiega: 'piattaforma non raggiungibile' }] };
  }
  render();
}
/* ---------- «Con la cartella»: il pacchetto, e che cosa uscirebbe ---------- */
// Prima fetta della ricerca clinica esterna protetta. Il modello LOCALE legge
// la cartella intera e ne ricava il minimo indispensabile; un controllo cerca
// dentro quel testo gli identificatori VERI di quel paziente. Niente esce da
// questo Mac: il «fuori» non è ancora costruito, e si vede prima di farlo.
async function rfCartellaChiedi(q) {
  const pid = state.patientCtx;
  if (!pid) { state.cartellaCtx = { stato: 'pronto', errore: 'Scegli prima il paziente.' }; render(); return; }
  state.cartellaCtx = { stato: 'lavora', domanda: q, errore: null };
  render();
  try {
    const r = await fetch('/api/prototipo/contesto-clinico', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: pid, domanda: q }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { state.cartellaCtx = { stato: 'pronto', domanda: q, errore: j.errore || 'Non ha funzionato.' }; render(); return; }
    state.cartellaCtx = { stato: 'fatto', domanda: q, esito: j, errore: null };
    render();
  } catch { state.cartellaCtx = { stato: 'pronto', domanda: q, errore: 'La piattaforma non risponde.' }; render(); }
}
function rfCartellaChiudi() { state.cartellaCtx = null; render(); }
function rfCartellaPaziente(id) { state.patientCtx = id || null; render(); const i = document.getElementById('rf-aip-in'); if (i) i.focus(); }
/* La ricerca del paziente: tocca solo la lista, non ridisegna la pagina —
   a ogni lettera si perderebbe il cursore. Al massimo otto nomi: se non basta
   si scrive una lettera in più. */
function rfCartellaTrova(q) {
  const t = String(q ?? '').trim().toLowerCase();
  if (t.length < 2) return [];
  const tutti = (typeof PATIENTS !== 'undefined' ? PATIENTS : []);
  return tutti.filter(p => {
    const a = `${p.last ?? ''} ${p.first ?? ''}`.toLowerCase(), b = `${p.first ?? ''} ${p.last ?? ''}`.toLowerCase();
    return a.includes(t) || b.includes(t);
  }).slice(0, 8);
}
function rfCartellaCerca(q) {
  const box = document.getElementById('rf-cart-lista');
  if (!box) return;
  const t = String(q ?? '').trim();
  const trovati = rfCartellaTrova(t);
  box.innerHTML = trovati.length
    ? trovati.map(p => `<button type="button" class="rf-cart-v" onclick="rfCartellaPaziente('${rfEsc(p.id)}')">
        <b>${rfEsc(`${p.last ?? ''} ${p.first ?? ''}`.trim())}</b>${p.dob ? `<span>${rfEsc(p.dob)}</span>` : ''}</button>`).join('')
    : `<span class="caption">${t.length < 2 ? 'Scrivi almeno due lettere.' : 'Nessun paziente con questo nome.'}</span>`;
}
function rfCartellaPrimo() {
  const el = document.getElementById('rf-cart-cerca');
  const trovati = rfCartellaTrova(el ? el.value : '');
  if (trovati.length) rfCartellaPaziente(trovati[0].id);
}
/* Passi 5-7: esce il pacchetto, torna la ricerca, il modello locale la
   rilegge con la cartella davanti. Il testo che parte è quello nei due riquadri
   — il medico può averlo corretto — e la piattaforma lo ricontrolla lo stesso. */
async function rfCartellaManda() {
  const c = state.cartellaCtx; if (!c || !c.esito || !c.esito.ricerca_id) return;
  const ctx = document.getElementById('rf-cart-ctx'), dom = document.getElementById('rf-cart-dom');
  const corpo = {
    azione: 'manda', ricerca_id: c.esito.ricerca_id,
    contesto: ctx ? ctx.value : c.esito.contesto,
    domanda_generale: dom ? dom.value : c.esito.domanda_generale,
  };
  state.cartellaCtx = { ...c, stato: 'cerca', errore: null };
  render();
  try {
    const r = await fetch('/api/prototipo/contesto-clinico', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { state.cartellaCtx = { ...c, stato: 'fatto', erroreInvio: j.errore || 'Non ha funzionato.' }; render(); return; }
    state.cartellaCtx = { ...c, stato: 'risposta', ricerca: j, errore: null };
  } catch { state.cartellaCtx = { ...c, stato: 'fatto', erroreInvio: 'La piattaforma non risponde.' }; }
  render();
}
/* Passo 8: che cosa ne ha fatto il medico. Resta scritto accanto a tutto il
   resto, perché di una consulenza si deve poter dire mesi dopo com'è finita. */
async function rfCartellaConferma(scelta) {
  const c = state.cartellaCtx; if (!c || !c.ricerca) return;
  state.cartellaCtx = { ...c, conferma: scelta };
  render();
  try {
    await fetch('/api/prototipo/contesto-clinico', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'conferma', ricerca_id: c.ricerca.ricerca_id, conferma: scelta }),
    });
  } catch {}
}
const RF_SEZIONI = [
  ['sintesi', 'Sintesi'],
  ['evidenze', 'Evidenze trovate'],
  ['pertinenti', 'Per questo paziente'],
  ['attenzioni', 'Attenzioni'],
  ['mancanti', 'Informazioni mancanti'],
];
function rfCartellaRisposta(c, paz) {
  const j = c.ricerca || {}, sez = j.sezioni || {};
  const righe = RF_SEZIONI.filter(([k]) => (sez[k] || '').trim())
    .map(([k, titolo]) => `<div class="rf-cart-p"><b>${titolo}</b><div>${rfEsc(sez[k]).replace(/\n/g, '<br>')}</div></div>`).join('');
  const fonti = (j.fonti || []);
  const dubbie = (j.da_verificare || []);
  const cert = j.certezza ? `<span class="rf-cert ${rfEsc(j.certezza)}">certezza ${rfEsc(j.certezza)}</span>` : '';
  return `<div class="rf-med">
    <div class="t">${ICONS.book || ICONS.ai} La ricerca, riletta sulla cartella di ${rfEsc(paz.last)} ${cert}</div>
    ${righe || `<p class="caption" style="margin:0 0 8px">Il modello non ha risposto nella forma attesa.</p>`}
    <div class="rf-cart-p"><b>Fonti · citate a memoria, da verificare</b><div>${
      fonti.length ? fonti.map(f => rfEsc(f)).join('<br>') : 'Nessuna fonte sicura indicata.'
    }</div></div>
    <div class="segnali">
      ${dubbie.length ? `<div class="segnale blocco">${ICONS.alert}<span>Ci sono ${dubbie.length} fra link e codici: il modello esterno non naviga, quindi non li ha verificati. Non fidartene senza aprirli.</span></div>` : ''}
      <div class="segnale">${ICONS.info}<span>Supporto alla decisione: non cambia terapie, non fa diagnosi. Decide il medico.</span></div>
    </div>
    <div class="azioni">
      ${c.conferma
        ? `<span class="caption">Segnata come ${c.conferma === 'usata' ? 'usata' : 'scartata'}.</span>`
        : `<button class="btn primary" onclick="rfCartellaConferma('usata')">${ICONS.check} L'ho usata</button>
           <button class="btn" onclick="rfCartellaConferma('scartata')">Non mi serve</button>`}
      <button class="btn" onclick="rfCartellaChiudi()">Chiudi</button>
      <span class="dove">Sono usciti ${(j.uscito && j.uscito.contesto) || 0}+${(j.uscito && j.uscito.domanda) || 0} caratteri verso ${rfEsc(j.dove || '')} · ${rfEsc(j.modello_esterno || '')} in ${(((j.ms_esterno || 0)) / 1000).toFixed(1)} s, riletti qui da ${rfEsc(j.modello_locale || '')} in ${(((j.ms_finale || 0)) / 1000).toFixed(1)} s. La cartella non è uscita.</span>
    </div>
  </div>`;
}
function rfCartellaRiquadro() {
  if (!state.modoCartella && !state.cartellaCtx) return '';
  const c = state.cartellaCtx;
  const paz = state.patientCtx && P[state.patientCtx] ? P[state.patientCtx] : null;
  // Senza paziente non si può fare niente: si sceglie qui.
  if (!paz) {
    // Si cerca scrivendo: con qualche migliaio di pazienti un elenco a tendina
    // non si scorre. La lista si aggiorna da sola senza ridisegnare la pagina,
    // altrimenti a ogni lettera si perderebbe il cursore.
    return `<div class="rf-med"><div class="t">${ICONS.patients || ICONS.file} Quale paziente</div>
      <p class="caption" style="margin:0 0 8px">La domanda parte dalla sua cartella. La cartella resta su questo Mac.</p>
      <input class="input" id="rf-cart-cerca" placeholder="Cerca per cognome o nome…" autocomplete="off"
        oninput="rfCartellaCerca(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();rfCartellaPrimo();}">
      <div class="rf-cart-lista" id="rf-cart-lista"><span class="caption">Scrivi almeno due lettere.</span></div></div>`;
  }
  if (c && c.stato === 'lavora') {
    return `<div class="rf-med"><div class="t">${ICONS.activity} Leggo la cartella di ${rfEsc(paz.last)} e preparo il minimo indispensabile</div>
      <p class="caption" style="margin:0">Lo fa il modello su questo Mac. Su una cartella lunga ci mette una ventina di secondi.</p></div>`;
  }
  if (c && c.errore) {
    return `<div class="rf-med"><div class="t">${ICONS.alert} Non ha funzionato</div>
      <p class="caption" style="margin:0 0 8px">${rfEsc(c.errore)}</p>
      <div class="azioni"><button class="btn" onclick="rfCartellaChiudi()">Chiudi</button></div></div>`;
  }
  if (c && c.stato === 'fatto') {
    const e = c.esito, k = e.controllo || {};
    const male = [
      ...(k.fughe || []).map(x => `nel testo compare «${x}»`),
      ...(k.deittici || []).map(x => `la domanda dice «${x}»: non vale per chiunque`),
      ...(k.etaEsatta ? [`c'è l'età esatta («${k.etaEsatta}»)`] : []),
      ...(k.vuoto ? ['il modello non ha prodotto un contesto utile'] : []),
    ];
    const puo = male.length === 0;
    return `<div class="rf-med">
      <div class="t">${ICONS.shield || ICONS.activity} Questo è ciò che uscirebbe${puo ? '' : ' — e così non esce'}</div>
      <p class="caption" style="margin:0 0 8px">Dalla cartella di ${rfEsc(paz.last)} (${e.cartella_caratteri} caratteri) il modello locale ha tenuto ${(e.contesto || '').length + (e.domanda_generale || '').length} caratteri. Puoi correggerli prima di mandarli: il controllo si rifà dall'altra parte.</p>
      <div class="rf-cart-p"><b>Contesto</b><textarea class="rf-cart-t" id="rf-cart-ctx" rows="4">${rfEsc(e.contesto || '')}</textarea></div>
      <div class="rf-cart-p"><b>Domanda</b><textarea class="rf-cart-t" id="rf-cart-dom" rows="3">${rfEsc(e.domanda_generale || '')}</textarea></div>
      <div class="segnali">
        ${c.erroreInvio ? `<div class="segnale blocco">${ICONS.alert}<span>${rfEsc(c.erroreInvio)}</span></div>` : ''}
        ${male.length
          ? male.map(x => `<div class="segnale blocco">${ICONS.alert}<span>${rfEsc(x)}</span></div>`).join('')
          : `<div class="segnale"><span>Nessun dato che identifichi ${rfEsc(paz.last)}, domanda valida per chiunque, nessuna età esatta.</span></div>`}
      </div>
      <div class="azioni">
        ${puo && e.collegato !== false
          ? `<button class="btn primary" onclick="rfCartellaManda()">${ICONS.send} Manda fuori la ricerca</button>`
          : ''}
        <button class="btn" onclick="rfCartellaChiudi()">Chiudi</button>
        <span class="dove">${rfEsc(e.modello || '')} · ${((e.ms || 0) / 1000).toFixed(1)} s · ${puo
          ? (e.collegato === false
            ? '<b>non è collegato nessun fornitore autorizzato</b>: il pacchetto è pronto e resta qui.'
            : 'esce solo quello che vedi qui sopra, verso Infomaniak · Ginevra.')
          : '<b>niente è uscito</b>: finché c\'è un segnale rosso non parte.'}</span>
      </div>
    </div>`;
  }
  if (c && c.stato === 'cerca') {
    return `<div class="rf-med"><div class="t">${ICONS.activity} Cerco fuori, poi rileggo con la cartella</div>
      <p class="caption" style="margin:0">Il pacchetto è uscito verso Infomaniak (Ginevra). Quando torna, il modello di questo Mac lo rimette accanto alla cartella di ${rfEsc(paz.last)}: è l'unico che conosce tutti e due i lati. Un minuto circa.</p></div>`;
  }
  if (c && c.stato === 'risposta') return rfCartellaRisposta(c, paz);
  return `<div class="rf-med"><div class="t">${ICONS.file || ICONS.patients} Con la cartella di ${rfEsc(paz.last)}</div>
    <p class="caption" style="margin:0">Scrivi la domanda come ti viene. Il modello locale legge la cartella intera e prepara il minimo che servirebbe a chi non conosce il paziente: lo vedi prima, e per ora non esce da qui.</p>
    <div class="azioni"><button class="btn sm ghost" onclick="rfCartellaPaziente('')">Cambia paziente</button></div></div>`;
}

function rfMedicaRiquadro() {
  const m = state.medica; if (!m) return '';
  if (m.stato === 'riformulo') return `<div class="rf-med"><div class="t">${ICONS.activity} Riscrivo la domanda in forma generale</div><p class="caption" style="margin:0">Lo fa il modello su questo Mac. La tua domanda non è uscita.</p></div>`;
  const bloccata = (m.blocchi || []).length > 0;
  const seg = (arr, cls) => (arr || []).map(x => `<div class="segnale ${cls}">${cls === 'blocco' ? ICONS.alert : ICONS.info}<span>${rfEsc(x.spiega)}</span></div>`).join('');
  return `<div class="rf-med">
    <div class="t">${ICONS.activity} Parte questa, non la tua — controllala</div>
    <textarea id="rf-med-testo" oninput="rfMedicaModifica(this.value)" ${m.stato === 'invio' ? 'disabled' : ''}>${rfEsc(m.generale)}</textarea>
    ${bloccata || (m.avvisi || []).length ? `<div class="segnali">${seg(m.blocchi, 'blocco')}${seg(m.avvisi, 'avviso')}</div>` : ''}
    <div class="azioni">
      <button class="btn primary" onclick="rfMedicaInvia()" ${m.stato === 'invio' || bloccata ? 'disabled' : ''}>${m.stato === 'invio' ? 'Chiedo…' : 'Chiedi così'}</button>
      <button class="btn" onclick="rfMedicaAnnulla()">Annulla</button>
      <span class="dove">${bloccata ? 'Correggi la riga qui sopra e il tasto si riaccende.' : 'La domanda originale resta su questo Mac.'}</span>
    </div>
  </div>`;
}

// Il segno accanto al nome: la stessa stella che la voce «Cleo» ha nel menu.
// Pulsa mentre Cleo lavora, così il nome dice se sta pensando.
function rfSegnoCleo() {
  const viva = state.aiState && state.aiState !== 'idle';
  const spiega = viva ? `${RF_AI_NOME} sta lavorando` : `${RF_AI_NOME} è pronta · modello locale su questo Mac`;
  return `<span class="rf-segno${viva ? ' viva' : ''}" title="${rfEsc(spiega)}">${ICONS.ai}</span>`;
}

const rfAiPageOrig = PAGES.ai;
PAGES.ai = () => {
  if (!RF.live) return rfAiPageOrig();
  const vuota = !state.aiMessages.length;
  return `<div class="rf-gpt">
      ${vuota ? '' : `<div class="rf-gpt-top"><span class="actions"><button class="btn sm" onclick="state.aiMessages=[];render()">${ICONS.x} Nuova conversazione</button></span></div>`}
      <div class="rf-gpt-scroll ${vuota ? 'vuota' : ''}" id="rf-aip-body">
        <div class="rf-gpt-col">${vuota ? rfAiBenvenuto() : `<div class="rf-gpt-thread">${state.aiMessages.map(m => m.html).join('')}</div>`}</div>
      </div>
      ${vuota ? '' : `<div class="rf-gpt-foot"><div class="rf-gpt-col">${rfMedicaRiquadro()}${rfCartellaRiquadro()}${rfAiCampo()}${rfAiNota()}</div></div>`}
    </div>`;
};
// Il titolo nella barra in alto: sulla pagina di Cleo porta la stessa lucina.
const rfPageTitleOrig = pageTitle;
pageTitle = function () {
  if (RF.live && state.route === 'ai') {
    return `${rfSegnoCleo()}${rfEsc(RF_AI_NOME)}<span class="rf-sotto">modello locale, su questo Mac</span>`;
  }
  return rfPageTitleOrig.apply(this, arguments);
};

// A tutto schermo solo sulla pagina di Cleo: il riquadro, la barra di sicurezza
// e il pannello laterale dell'AI se ne vanno finché si è lì.
// La larghezza delle colonne si calcola al disegno: se la finestra cambia,
// l'agenda va ridisegnata, altrimenti resta con le misure di prima.
(function () {
  let attesa = null;
  const grandi = ['agenda', 'sale'];   // l'altezza del calendario delle sale viene dalla finestra
  window.addEventListener('resize', () => {
    if (!grandi.includes(state.route)) return;
    clearTimeout(attesa);
    attesa = setTimeout(() => { if (grandi.includes(state.route)) render(); }, 180);
  });
})();

const rfRenderOrigAi = render;
render = function () {
  rfRenderOrigAi.apply(this, arguments);
  const app = document.getElementById('app');
  if (app) {
    app.classList.toggle('ai-mode', state.route === 'ai');
    app.classList.toggle('agenda-larga', state.route === 'agenda');
    app.classList.toggle('sale-larga', state.route === 'sale');
  }
};

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
    ? `<button class="btn sm ghost" onclick="rfImpagina()" title="${m.formato === 'lettera' ? 'Formato del medico: lettera al collega («Caro …,», corpo, saluto, terapia dalla lettera precedente)' : 'Formato del medico: rapporto a sezioni'}">${ICONS.ai || ''} ${m.formato === 'lettera' ? 'Impagina come lettera' : 'Riorganizza nel formato'}</button><button class="btn sm ghost" onclick="rfWord('${id}')" title="Word con la carta intestata del medico, dal testo salvato">Word</button>`
    : `<button class="btn sm ghost" onclick="rfWord('${id}')">Word</button>`;
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
      const testoDi = (sp) => { const p = RV_REPORT.flatMap(x => x.parts).find(x => x.id === sp); return p ? p.t : ''; };
      const esiti = (rp.issues || []).filter(x => {
        const i = RV_ISSUES.find(y => y.id === x.id); if (!i) return false;
        if (x.cat && x.cat !== i.cat) return false;
        if (x.testo) { const ora = String((i.span && testoDi(i.span)) || i.now || '').slice(0, 60); if (ora !== x.testo) return false; }
        return true;
      });
      const removed = {};
      (Array.isArray(rp.tolte) ? rp.tolte : []).forEach((t, n) => {
        const sez = RV_REPORT.find(x => x.code === t.sec); if (!sez || !t.testo) return;
        if (sez.parts.some(p => p.t === t.testo)) return; // la frase è di nuovo nel testo: non è più tolta
        const id = 'tolta' + n;
        sez.parts.splice(Math.min(Math.max(0, t.pos | 0), sez.parts.length), 0, { id, t: t.testo, src: null, conf: 'none', nl: true });
        removed[id] = true;
      });
      localStorage.setItem(RV_KEY, JSON.stringify({ issues: esiti, metrics: rp.metrics || {}, log: rp.log || [], cur: Math.min(rp.cur || 0, Math.max(0, RV_ISSUES.length - 1)), t: 0, removed }));
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
        `<button class="btn" onclick="rfWord('${idBozza}')">Scarica il Word</button><button class="btn primary" data-close onclick="RF.loaded=null;go('#/reports');void rfCaricaDati()">Torna ai referti</button>`);
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
  // Le frasi tolte si salvano con sezione, posizione e testo: alla riapertura
  // tornano nel testo centrale barrate (non nel testo salvato né nel Word).
  const tolte = [];
  RV_REPORT.forEach(s => s.parts.forEach((p, k) => { if (RV.removed[p.id]) tolte.push({ sec: s.code, pos: k, testo: RV.text[p.id] != null ? RV.text[p.id] : p.t }); }));
  // Ogni esito porta anche categoria e inizio della frase: se il testo cambia
  // (Edita, impaginazione) gli id delle segnalazioni si rinumerano, e un esito
  // si riapplica solo alla stessa segnalazione, non a un'altra con lo stesso numero.
  return { issues: RV.issues.map(i => ({ id: i.id, status: i.status, resolution: i.resolution, cat: i.cat, testo: String((i.span && RV.text[i.span]) || i.now || '').slice(0, 60) })), metrics: RV.metrics, log: (RV.log || []).slice(-200), cur: RV.cur, t: RV.t, motivazioni: RF.motivazioni || {}, tolte };
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
  if (fine) setTimeout(() => { const e = document.getElementById('rf-imp-pill'); if (e) e.remove(); }, fine === 'errore' ? 20000 : 2500);
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
        try { clearTimeout(rvSave._rf); await fetch(`/api/prototipo/referti/${id}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stato: Object.assign(rfStatoRevisione(), { tolte: [] }) }) }); } catch { /* lo stato si risalva al prossimo giro */ }
        RF.loaded = null; RF.loading = null;
        setTimeout(() => { closeModal(); render(); toast(m.formato === 'lettera' ? 'Lettera impaginata nel formato del medico' : 'Testo riorganizzato nel formato del medico'); }, 800);
        return;
      }
      if (j.stato === 'errore') {
        const motivi = { ai_non_risponde: 'il modello locale non ha risposto', troppo_corto: 'la proposta perdeva contenuto ed è stata scartata', numeri: 'la proposta cambiava dei numeri ed è stata scartata', unita: 'la proposta cambiava delle unità ed è stata scartata', relazioni: 'la proposta scambiava dei valori tra misure ed è stata scartata' };
        const d = j.dettaglio || {};
        const pezzi = [];
        if (Array.isArray(d.mancanti) && d.mancanti.length) pezzi.push(`mancavano ${d.mancanti.join(', ')}`);
        if (Array.isArray(d.in_piu) && d.in_piu.length) pezzi.push(`comparivano ${d.in_piu.join(', ')}`);
        if (Array.isArray(d.misure) && d.misure.length) pezzi.push(`valori scambiati: ${d.misure.join('; ')}`);
        if (Array.isArray(j.aggiunte) && j.aggiunte.length && j.motivo === 'parole_aggiunte') pezzi.push(`parole nuove: ${j.aggiunte.join(', ')}`);
        stato(`Non impaginato: ${motivi[j.motivo] || j.motivo || 'errore'}${pezzi.length ? ` (${pezzi.join(' · ')})` : ''}. Il testo della revisione è rimasto com’era. Stesso modello e stesse guardie della piattaforma: riprova, il modello non risponde sempre uguale.`, 100, 'errore');
        return;
      }
      if (j.stato === 'assente') { stato('Il lavoro non risulta avviato: riprova.', 0, 'errore'); return; }
    }
    stato('Sta impiegando troppo: riprova più tardi, il lavoro continua sul Mac.', 90, 'errore');
  } catch { stato('Non riesco a raggiungere la piattaforma.', 100, 'errore'); }
  finally { RF.impaginando = null; }
}


/* ---------- frasi tolte barrate e tasto «Edita» (14.9.2026) ---------- */
/* Durante la correzione una frase tolta resta nel testo centrale, barrata a
   tratteggio (clic: rimettila o lasciala tolta); nella lettura pulita, nel
   testo salvato e nel Word non c'è. «Edita» apre tutto il testo pulito in una
   finestra per correggerlo a mano: si salva nella piattaforma e la revisione
   si ricalcola sul nuovo testo, riapplicando gli esiti alle segnalazioni che
   coincidono. */
(function () { const st = document.createElement('style'); st.textContent = `
  .rv-span.rf-tolta { text-decoration: line-through; text-decoration-style: dashed; text-decoration-thickness: 1.5px; text-decoration-color: var(--danger); color: var(--text-3); cursor: pointer; }
  .rv-span.rf-tolta:hover { background: var(--danger-soft); border-radius: 4px; }
  .rv.read .rv-span.rf-tolta { display: none; }
  .rv-legend .lg.tolta { border-bottom: none; text-decoration: line-through dashed var(--danger); color: var(--text-3); }
  .rf-edita { width: 100%; min-height: 55vh; height: auto; padding: 10px 12px; border-radius: var(--r-input); border: 1px solid var(--border); background: var(--surface-2); resize: vertical; line-height: 1.55; font: inherit; font-size: 14px; }
  .rf-edita:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--surface); }
  @media (max-width: 767px) { .rf-edita { min-height: 50vh; } }
`; document.head.appendChild(st); })();
const rfPartHtmlOrig = rvPartHtml;
rvPartHtml = function (p, secCode) {
  if (RF.live && RV.removed[p.id] && RV.mode !== 'read') {
    const t = RV.text[p.id] != null ? RV.text[p.id] : p.t;
    return `<span class="rv-span rf-tolta" data-span="${p.id}" data-src="${p.src || ''}" data-conf="tolta" contenteditable="false" title="Frase tolta dal referto · clic per rimetterla">${esc(t)}</span>`;
  }
  return rfPartHtmlOrig(p, secCode);
};
const rfSpanClickOrig = rvSpanClick;
rvSpanClick = function (id) {
  if (RF.live && RV.removed[id]) { rfFraseTolta(id); return; }
  return rfSpanClickOrig(id);
};
function rfFraseTolta(id) {
  const t = RV.text[id] || '';
  openModal('Frase tolta dal referto', `<p style="text-decoration:line-through dashed var(--danger);color:var(--text-3)">${esc(t)}</p><p class="caption mt-8">Resta barrata nel testo finché la revisione è aperta; nella lettura pulita, nel testo salvato e nel Word non c'è.</p>`,
    `<button class="btn" data-close>Lascia tolta</button><button class="btn primary" id="rf-rimetti">Rimetti nel referto</button>`);
  document.getElementById('rf-rimetti').onclick = () => {
    delete RV.removed[id];
    const i = RV.issues.find(x => x.span === id);
    if (i && i.status !== 'open' && /rimoss|fuori|tolt/i.test(i.resolution || '')) { i.status = 'open'; i.resolution = null; }
    rvLog('RESTORED', id);
    closeModal(); rvSave(); rvAfterRender(); if (typeof rvCount === 'function') rvCount();
    toast('Frase rimessa nel referto');
  };
}
const rfRenderReportOrig = rvRenderReport;
rvRenderReport = function () {
  rfRenderReportOrig();
  if (!RF.live) return;
  const top = document.querySelector('.rv-top-r');
  if (top && !document.getElementById('rf-edita-btn')) {
    const b = document.createElement('button'); b.id = 'rf-edita-btn'; b.className = 'btn sm'; b.type = 'button'; b.title = 'Correggi a mano tutto il testo';
    b.innerHTML = `${(typeof ICONS !== 'undefined' && ICONS.edit) || ''} Edita`; b.onclick = rfEdita;
    const lettura = Array.from(top.querySelectorAll('button')).find(x => /Lettura pulita|Torna alle verifiche/.test(x.textContent || ''));
    top.insertBefore(b, lettura || null);
  }
  if (top && !document.getElementById('rf-pennello-btn')) {
    const b = document.createElement('button'); b.id = 'rf-pennello-btn'; b.className = 'btn sm'; b.type = 'button'; b.title = 'Pennello: evidenzia il testo da togliere dal referto';
    b.innerHTML = `${RF_PENNELLO_ICONA} Nascondi`; b.onclick = () => rfPennello(!RF.pennello);
    top.insertBefore(b, document.getElementById('rf-edita-btn') || null);
  }
  const eb = document.getElementById('rf-edita-btn'); if (eb) eb.hidden = RV.mode === 'read';
  const pb = document.getElementById('rf-pennello-btn'); if (pb) { pb.hidden = RV.mode === 'read'; pb.classList.toggle('primary', !!RF.pennello); }
  rfPennelloApplicaStato();
  const leg = document.querySelector('#rv-main .rv-legend');
  if (leg && !leg.querySelector('.lg.tolta')) { const sp = document.createElement('span'); sp.className = 'lg tolta'; sp.textContent = 'Tolta dal referto'; leg.appendChild(sp); }
};
function rfEdita() {
  const id = RF.loaded; if (!id) return;
  if (RF.meta && RF.meta.stato !== 'bozza') { toast('Il referto è già confermato: non si modifica più'); return; }
  const testo = rfTestoRicomposto();
  const n = Object.keys(RV.removed).filter(k => RV.removed[k]).length;
  openModal('Edita il testo completo', `<textarea class="rf-edita" id="rf-edita-testo" spellcheck="true">${esc(testo)}</textarea>
    <p class="caption mt-8">È il testo pulito${n ? `, senza ${n === 1 ? 'la frase tolta' : `le ${n} frasi tolte`}` : ''}. Salvando, la revisione si ricalcola sul nuovo testo: le verifiche già chiuse restano chiuse dove le frasi coincidono, le altre si riaprono. La modifica a mano resta registrata.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-edita-ok">Salva</button>`);
  setTimeout(() => { const t = document.getElementById('rf-edita-testo'); if (t) t.focus(); }, 60);
  document.getElementById('rf-edita-ok').onclick = async () => {
    const box = document.getElementById('rf-edita-testo');
    const nuovo = (box ? box.value : '').replace(/\r\n/g, '\n').trim();
    if (!nuovo) { toast('Il testo non può essere vuoto'); return; }
    if (nuovo === testo.trim()) { closeModal(); return; }
    const btn = document.getElementById('rf-edita-ok'); btn.disabled = true; btn.textContent = 'Salvo…';
    clearTimeout(rvSave._rf);
    rvLog('CORRECTION', 'testo completo modificato a mano (Edita)');
    RV.metrics.corrections = (RV.metrics.corrections || 0) + 1;
    try {
      const r = await fetch(`/api/prototipo/referti/${id}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: nuovo, stato: rfStatoRevisione(), correzioni: RV.metrics.corrections, verifiche: rvDone() }) });
      if (!r.ok) throw new Error('salvataggio');
    } catch { btn.disabled = false; btn.textContent = 'Salva'; toast('Non riesco a salvare nella piattaforma'); return; }
    closeModal();
    localStorage.removeItem(RV_KEY);
    RF.loaded = null; RF.loading = null;
    render();
    toast('Testo salvato · revisione ricalcolata');
  };
}


/* ---------- scaricare il Word (14.9.2026) ---------- */
/* Prima era un link con target="_blank": nell'app installata sul telefono
   (manifest «standalone») la scheda nuova non si apre e non succede NULLA,
   senza un messaggio. Ora il file si scarica con una richiesta vera: gli
   errori del server (sessione scaduta, referto vuoto) si vedono, e il file
   arriva dal blob, che funziona anche dentro l'app installata. */
async function rfWord(id) {
  if (!id) return;
  if (RF.word === id) { toast('Word già in preparazione'); return; }
  RF.word = id;
  toast('Preparo il Word…');
  try {
    const r = await fetch(`/api/referti/docx/${id}`, { credentials: 'include', cache: 'no-store' });
    if (r.status === 401) { toast('Sessione scaduta: rientra e riprova'); RF.nonAutorizzato = true; RF.caricato = false; render(); return; }
    if (!r.ok) {
      const t = (await r.text().catch(() => '')).slice(0, 120);
      toast(`Word non riuscito: ${t || 'errore ' + r.status}`);
      return;
    }
    const blob = await r.blob();
    if (!blob || blob.size < 1000) { toast('Il Word è arrivato vuoto: riprova'); return; }
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    const nome = (m && m[1]) || 'referto.docx';
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    if ('download' in a) {
      a.href = href; a.download = nome; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      toast(`Word pronto: ${nome}`);
    } else {
      // Browser senza «download» (vecchi iOS): si apre, poi si salva a mano.
      location.href = href;
    }
  } catch {
    toast('Non riesco a raggiungere la piattaforma');
  } finally {
    RF.word = null;
  }
}


/* ---------- pennello «Nascondi» (14.9.2026) ---------- */
/* Tasto nella barra: acceso, il testo centrale non si scrive più ma si
   evidenzia; ciò che viene evidenziato (anche un pezzo di frase, anche più
   frasi) diventa una frase tolta: barrata a tratteggio, fuori dal testo
   salvato e dal Word, clic per rimetterla. Sul computer la riga si tira al
   rilascio del mouse; sul telefono, dopo la selezione, compare il tasto
   «Tira una riga» (le maniglie della selezione si spostano ancora). Esc lo
   spegne. Le frasi spezzate a metà: il pezzo evidenziato diventa una parte
   a sé, i resti restano parti normali (la segnalazione, se c'era, resta sul
   pezzo che rimane). */
const RF_PENNELLO_ICONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l3.5-1 11-11-2.5-2.5-11 11L3 21z"/><path d="M14 4l2-2 4 4-2 2"/><path d="M3 12h4M17 21h4" opacity=".5"/></svg>';
(function () { const st = document.createElement('style'); st.textContent = `
  .rv-doc.rf-pennello { cursor: text; }
  .rv-doc.rf-pennello ::selection { background: rgba(229,72,77,.28); }
  .rv-doc.rf-pennello .rv-span { cursor: text; }
  .rf-pennello-avviso { max-width: 760px; margin: 0 auto 12px; padding: 8px 12px; border-radius: 10px; background: var(--danger-soft); border: 1px solid rgba(229,72,77,.35); font-size: 12.5px; display: flex; gap: 10px; align-items: center; }
  .rf-pennello-avviso svg { width: 16px; height: 16px; flex: none; }
  #rf-pennello-pill { position: fixed; z-index: 70; left: 50%; transform: translateX(-50%); bottom: calc(84px + env(safe-area-inset-bottom)); padding: 10px 16px; border-radius: 999px; background: var(--danger); color: #fff; font-weight: 600; box-shadow: var(--shadow-2); border: none; font-size: 14px; }
  @media (max-width: 767px) { .rv-top-r .btn.sm { padding: 4px 8px; } }
`; document.head.appendChild(st); })();
function rfPennello(on) {
  RF.pennello = !!on;
  const pb = document.getElementById('rf-pennello-btn'); if (pb) pb.classList.toggle('primary', RF.pennello);
  rfPennelloApplicaStato();
  if (RF.pennello) toast('Pennello acceso: evidenzia il testo da togliere'); else { rfPennelloPill(false); }
}
function rfPennelloApplicaStato() {
  const doc = document.querySelector('#rv-main .rv-doc'); if (!doc) return;
  doc.classList.toggle('rf-pennello', !!RF.pennello);
  doc.querySelectorAll('[data-sec-body]').forEach(p => p.setAttribute('contenteditable', RF.pennello || RV.mode === 'read' ? 'false' : 'true'));
  let av = document.getElementById('rf-pennello-avviso');
  if (RF.pennello && RV.mode !== 'read') {
    if (!av) { av = document.createElement('div'); av.id = 'rf-pennello-avviso'; av.className = 'rf-pennello-avviso'; av.innerHTML = `${RF_PENNELLO_ICONA}<span>Pennello acceso: evidenzia le parole o le frasi da togliere dal referto. Vengono barrate; un clic sulla parte barrata le rimette. Esc per spegnere.</span>`; doc.parentNode.insertBefore(av, doc); }
  } else if (av) av.remove();
}
function rfPennelloPill(mostra) {
  let p = document.getElementById('rf-pennello-pill');
  if (!mostra) { if (p) p.remove(); return; }
  if (!p) { p = document.createElement('button'); p.id = 'rf-pennello-pill'; p.type = 'button'; p.textContent = 'Tira una riga'; p.onclick = () => { rfPennelloApplica(); rfPennelloPill(false); }; document.body.appendChild(p); }
}
// Offset di testo di un punto della selezione dentro una frase (span con un solo nodo di testo).
function rfOffsetIn(span, nodo, off) {
  if (nodo === span) return off === 0 ? 0 : span.textContent.length;
  if (span.contains(nodo)) { let n = 0; for (const c of span.childNodes) { if (c === nodo || c.contains(nodo)) return n + off; n += c.textContent.length; } return span.textContent.length; }
  const pos = span.compareDocumentPosition(nodo);
  return (pos & Node.DOCUMENT_POSITION_PRECEDING) ? 0 : span.textContent.length;
}
function rfPennelloApplica() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return 0;
  const doc = document.querySelector('#rv-main .rv-doc'); if (!doc) return 0;
  const range = sel.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return 0;
  let n = 0;
  const spans = Array.from(doc.querySelectorAll('.rv-span')).filter(sp => range.intersectsNode(sp) && !sp.classList.contains('rf-tolta') && sp.dataset.span);
  for (const sp of spans) {
    const id = sp.dataset.span;
    const t = sp.textContent;
    let a = rfOffsetIn(sp, range.startContainer, range.startOffset);
    let b = rfOffsetIn(sp, range.endContainer, range.endOffset);
    if (b <= a) continue;
    // parole intere
    while (a > 0 && /\S/.test(t[a - 1])) a--;
    while (b < t.length && /\S/.test(t[b])) b++;
    const prima = t.slice(0, a).trim(), mezzo = t.slice(a, b).trim(), dopo = t.slice(b).trim();
    if (!mezzo) continue;
    if (id.startsWith('add-')) {
      const k = RV.added.findIndex(x => x.id === id); if (k < 0) continue;
      if (!prima && !dopo) RV.added.splice(k, 1); else RV.added[k].text = [prima, dopo].filter(Boolean).join(' ');
      n++; continue;
    }
    let sez = null, idx = -1;
    for (const s of RV_REPORT) { const i = s.parts.findIndex(p => p.id === id); if (i >= 0) { sez = s; idx = i; break; } }
    if (!sez) continue;
    const p = sez.parts[idx];
    if (!prima && !dopo) { RV.removed[id] = true; n++; continue; }
    // frase spezzata: il pezzo evidenziato diventa una parte a sé, tolta
    const nuove = [];
    const base = { src: p.src || null, conf: p.conf || 'none' };
    let seq = 0; const nid = () => `${id}-${++seq}${Date.now().toString(36).slice(-3)}`;
    // il pezzo che resta tiene l'id (e la segnalazione) della frase; se la
    // frase iniziava una riga, la riga la inizia il primo pezzo che resta
    if (prima) nuove.push({ ...p, t: prima, nl: !!p.nl });
    const tolta = { ...base, id: nid(), t: mezzo, nl: false };
    nuove.push(tolta);
    if (dopo) nuove.push({ ...base, id: prima ? nid() : p.id, t: dopo, nl: !prima && !!p.nl });
    sez.parts.splice(idx, 1, ...nuove);
    for (const q of nuove) { RV.text[q.id] = q.t; if (q.id === p.id) { if (RV.text[p.id] !== q.t) RV.edited[p.id] = true; } }
    RV.removed[tolta.id] = true;
    n++;
  }
  sel.removeAllRanges();
  if (n) { rvLog('HIDDEN', `${n} part${n === 1 ? 'e tolta' : 'i tolte'} col pennello`); rvSave(); rvAfterRender(); toast(`${n === 1 ? 'Parte tolta' : n + ' parti tolte'} dal referto · clic sul barrato per rimetterla`); }
  return n;
}
(function () {
  let tocco = false;
  document.addEventListener('pointerdown', e => { tocco = e.pointerType === 'touch'; }, true);
  document.addEventListener('mouseup', () => { if (!RF.pennello || RV.mode === 'read' || tocco) return; setTimeout(rfPennelloApplica, 10); });
  document.addEventListener('selectionchange', () => {
    if (!RF.pennello || !tocco) { if (!RF.pennello) rfPennelloPill(false); return; }
    const sel = window.getSelection(); const doc = document.querySelector('#rv-main .rv-doc');
    const ok = sel && sel.rangeCount && !sel.isCollapsed && doc && doc.contains(sel.getRangeAt(0).commonAncestorContainer);
    rfPennelloPill(!!ok);
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && RF.pennello) { rfPennello(false); } }, true);
  window.addEventListener('hashchange', () => { if (RF.pennello) { RF.pennello = false; rfPennelloPill(false); } });
})();


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
// «Come ti chiami?», «chi sei?»: risponde il codice, subito (14.9.2026).
function rfRispostaNome(q) {
  const t = q.toLowerCase();
  if (/come ti chiami|chi sei|qual ?[eè] il tuo nome|sei cleo|ti chiami/.test(t)) return `Mi chiamo <b>${rfEsc(RF_AI_NOME)}</b>: l'assistente di ReferralFlow. Rispondo sui dati dello studio caricati qui, seguo le procedure con traccia e uso il modello locale per le sintesi. Non do consigli clinici e sotto ogni risposta dico da dove viene.`;
  return null;
}
function rfRispostaOrganizzazione(q) {
  const nome = rfRispostaNome(q); if (nome) return nome;
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
  const voci = [['home', 'Oggi', 'home'], ['agenda', 'Agenda', 'agenda'], ['patients', 'Pazienti', 'patients'], ['reports', 'Referti', 'reports'], ['dittafono', 'Dittafono', 'mic'], ['ai', 'Cleo', 'ai'], ['altro', 'Altro', 'moreV']];
  const fisse = new Set(voci.map(v => v[0]));
  const altre = (NAV[state.role] || []).filter(k => !fisse.has(k));
  const attiva = (k) => k === 'ai' ? state.aiOpen : k === 'altro' ? altre.includes(state.route) : (state.route === k || (k === 'patients' && ['patient', 'visit'].includes(state.route)) || (k === 'reports' && ['report', 'review'].includes(state.route)));
  nav.innerHTML = voci.map(([k, l, i]) => `<button class="${attiva(k) ? 'active' : ''}" data-mnav="${k}" aria-label="${l}">${ICONS[i] || ''}<span>${l}</span></button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.mnav;
    if (k === 'ai') { state.aiOpen = !state.aiOpen; render(); return; }
    if (k === 'dittafono') { window.location.href = '/dittafono/index.html'; return; }
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
        <div class="field"><label>Indirizzo (via, NPA e località)</label><input class="input" id="rf-st-indirizzo" value="${rfEsc(st.indirizzo || '')}" ${admin ? '' : 'disabled'} placeholder="Via …, 6900 Lugano"></div>
        <div class="field"><label>E-mail per gli avvisi</label><input class="input" id="rf-st-email" value="${rfEsc(st.notify_email || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Prestazioni offerte</label><input class="input" id="rf-st-spec" value="${rfEsc(st.specialita || '')}" ${admin ? '' : 'disabled'}></div>
      </div>
      <div class="section-title mt-16">Voci del menu che questo studio non usa</div>
      <div class="row wrap mt-8" style="gap:8px">${['prestazioni', 'invianti', 'percorsi', 'moduli', 'documents', 'dittafono', 'anonymize', 'inbox', 'ai', 'fatturazione', 'statistics', 'communications', 'visits'].map(k => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="rf-mn" value="${k}" ${(RF.data.moduli_nascosti || []).includes(k) ? 'checked' : ''} ${admin ? '' : 'disabled'} style="margin:0 6px 0 0"> nascondi ${rfEsc((NAV_META[k] || [k])[0])}</label>`).join('')}</div>
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
      <div class="list">${cat.map(x => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(x.nome)} <span class="badge">${ET[x.tipo] || x.tipo}</span>${x.attivo ? '' : ' <span class="badge">disattivata</span>'}</div><div class="sub">${x.durata_min}'${x.sala ? ` · ${rfEsc(x.sala)}` : ''}${x.parole_chiave.length ? ` · parole chiave: ${rfEsc(x.parole_chiave.join(', '))}` : ' · riconosciuta dal nome'}${x.codice_tariffa ? ` · posizione ${rfEsc(x.codice_tariffa)}` : ''}</div></div>
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
  return `<div class="page-head"><div><h2 class="page-title">Studio</h2><div class="page-sub">${rfEsc((d.studio || {}).nome || '')} · personale, medici dell'agenda, sale e apparecchi</div></div></div>
    <div class="tabs">${tab('studio', 'Dati')}${tab('personale', 'Personale', d.personale.length)}${tab('medici', 'Medici agenda', d.medici.length)}${tab('prestazioni', 'Prestazioni', (d.catalogo || []).length)}${tab('sale', 'Sale', d.sale.length)}${tab('suggerimenti', 'Suggerimenti', (RF.sugg && RF.sugg.filter(x => x.stato === 'aperto').length) || 0)}${tab('apparecchi', 'Apparecchi', d.apparecchi.length)}</div>
    ${soloAdmin}${avviso}${corpo}`;
};
function rfStudioPassword(id, email) {
  openModal('Nuova password', `<p class="meta">Per <b>${rfEsc(email)}</b>. Comunicagliela a voce; la cambierà al primo accesso dal suo profilo.</p><div class="field mt-16"><label>Password (min. 8)</label><input class="input" id="rf-pw-nuova" type="password" autocomplete="new-password"></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pw-ok">Imposta</button>`);
  document.getElementById('rf-pw-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'utente_password', id, password: rfStudioCampo('#rf-pw-nuova') }); if (ok) closeModal(); };
}
function rfStudioMedico(id) {
  const m = (RF.studio.dati.medici || []).find(x => x.id === id); if (!m) return;
  const accessi = (RF.studio.dati.personale || []).filter(u => u.role === 'medico' || u.role === 'admin');
  openModal('Medico in agenda', `<div class="field"><label>Nome come in agenda</label><input class="input" id="rf-m-e-nome" value="${rfEsc(m.nome)}"></div><div class="field mt-8"><label>Altri modi in cui compare (virgole)</label><input class="input" id="rf-m-e-alias" value="${rfEsc((m.aliases || []).join(', '))}"></div><div class="field mt-8"><label>Accesso collegato</label><select class="input" id="rf-m-e-user"><option value="">nessuno</option>${accessi.map(u => `<option value="${u.id}" ${m.user_id === u.id ? 'selected' : ''}>${rfEsc(u.email)}</option>`).join('')}</select></div><div class="grid grid-3 mt-8"><div class="field"><label>GLN (13 cifre)</label><input class="input" id="rf-m-e-gln" inputmode="numeric" value="${rfEsc(m.gln || '')}"></div><div class="field"><label>RCC (numero concordato)</label><input class="input" id="rf-m-e-rcc" value="${rfEsc(m.rcc || '')}"></div><div class="field"><label>Colore in agenda</label><input class="input" id="rf-m-e-colore" type="color" value="${rfEsc(m.colore || '#0d5c48')}" style="height:36px;padding:2px 4px"></div></div><div class="caption mt-8">GLN e RCC entrano nel CSV di «Da fatturare» come medico erogante.</div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-m-ok">Salva</button>`);
  document.getElementById('rf-m-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'medico_aggiorna', id, nome: rfStudioCampo('#rf-m-e-nome'), aliases: rfStudioCampo('#rf-m-e-alias'), user_id: rfStudioCampo('#rf-m-e-user'), gln: rfStudioCampo('#rf-m-e-gln'), rcc: rfStudioCampo('#rf-m-e-rcc'), colore: rfStudioCampo('#rf-m-e-colore') }); if (ok) closeModal(); };
}
function rfStudioPersona(id) {
  const x = ((RF.studio.dati || {}).personale_senza_accesso || []).find(y => y.id === id); if (!x) return;
  openModal('Persona', `<div class="field"><label>Nome</label><input class="input" id="rf-ps-e-nome" value="${rfEsc(x.nome)}"></div><div class="grid grid-3 mt-8"><div class="field"><label>Ruolo</label><input class="input" id="rf-ps-e-ruolo" value="${rfEsc(x.ruolo)}"></div><div class="field"><label>%</label><input class="input" id="rf-ps-e-perc" type="number" min="0" max="100" value="${x.percentuale ?? ''}"></div><div class="field"><label>Colore</label><input class="input" id="rf-ps-e-colore" type="color" value="${rfEsc(x.colore || '#8a938e')}" style="height:36px;padding:2px 4px"></div></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-ps-ok">Salva</button>`);
  document.getElementById('rf-ps-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'personale_aggiorna', id, nome: rfStudioCampo('#rf-ps-e-nome'), ruolo: rfStudioCampo('#rf-ps-e-ruolo'), percentuale: rfStudioCampo('#rf-ps-e-perc'), colore: rfStudioCampo('#rf-ps-e-colore') }); if (ok) closeModal(); };
}
function rfStudioPrestazione(id) {
  const x = ((RF.studio.dati || {}).catalogo || []).find(y => y.id === id); if (!x) return;
  openModal('Prestazione', `<div class="field"><label>Nome</label><input class="input" id="rf-pr-e-nome" value="${rfEsc(x.nome)}"></div><div class="grid grid-2 mt-8"><div class="field"><label>Tipo</label><select class="input" id="rf-pr-e-tipo">${['visita', 'esame', 'procedura'].map(t => `<option value="${t}" ${x.tipo === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div><div class="field"><label>Durata (min)</label><input class="input" id="rf-pr-e-durata" type="number" min="5" max="480" value="${x.durata_min}"></div></div><div class="field mt-8"><label>Sala predefinita</label><input class="input" id="rf-pr-e-sala" value="${rfEsc(x.sala || '')}"></div><div class="field mt-8"><label>Parole chiave (virgole)</label><input class="input" id="rf-pr-e-parole" value="${rfEsc(x.parole_chiave.join(', '))}"></div><div class="field mt-8"><label>Posizione tariffaria (Cassa dei Medici)</label><input class="input" id="rf-pr-e-codice" value="${rfEsc(x.codice_tariffa || '')}" placeholder="es. CA.10.0010"></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pr-ok">Salva</button>`);
  document.getElementById('rf-pr-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'prestazione_aggiorna', id, nome: rfStudioCampo('#rf-pr-e-nome'), tipo: rfStudioCampo('#rf-pr-e-tipo'), durata_min: rfStudioCampo('#rf-pr-e-durata'), sala: rfStudioCampo('#rf-pr-e-sala'), parole_chiave: rfStudioCampo('#rf-pr-e-parole'), codice_tariffa: rfStudioCampo('#rf-pr-e-codice') }); if (ok) closeModal(); };
}
function rfStudioRisorsa(id) {
  const r = [...(RF.studio.dati.sale || []), ...(RF.studio.dati.apparecchi || [])].find(x => x.id === id); if (!r) return;
  openModal(r.tipo === 'sala' ? 'Sala' : 'Apparecchio', `<div class="field"><label>Nome</label><input class="input" id="rf-r-e-nome" value="${rfEsc(r.nome)}"></div><div class="field mt-8"><label>Descrizione</label><input class="input" id="rf-r-e-desc" value="${rfEsc(r.descrizione || '')}"></div>${r.tipo === 'sala' ? `<div class="field mt-8"><label>Posti (pazienti nello stesso momento)</label><input class="input" id="rf-r-e-posti" type="number" min="1" max="99" value="${r.posti || 1}" style="max-width:120px"></div>` : ''}`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-r-ok">Salva</button>`);
  document.getElementById('rf-r-ok').onclick = async () => { const ok = await rfStudioAzione({ azione: 'risorsa_aggiorna', id, nome: rfStudioCampo('#rf-r-e-nome'), descrizione: rfStudioCampo('#rf-r-e-desc'), posti: r.tipo === 'sala' ? (rfStudioCampo('#rf-r-e-posti') || 1) : 1 }); if (ok) closeModal(); };
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
(function () { const st = document.createElement('style'); st.textContent = `.rf-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.rf-week-col{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);min-height:200px;padding:6px}.rf-week-col.oggi{border-color:var(--accent)}.rf-week-head{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-2);padding:4px 6px 8px;border-bottom:1px solid var(--border);margin-bottom:6px}.rf-week-item{border-left:3px solid var(--border-2);padding:5px 8px;margin:4px 0;border-radius:4px;background:var(--surface-2);font-size:12.5px;cursor:pointer;line-height:1.3}.rf-week-item.done{opacity:.6}.rf-week-item:hover{background:var(--accent-soft)}@media (max-width:1199px){.rf-week{grid-template-columns:repeat(4,1fr)}}@media (max-width:767px){.rf-week{grid-template-columns:1fr}.rf-week-col{min-height:0}}.appt.rf-over{border-left-color:var(--danger);background:var(--danger-soft)}.rf-codici{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:10px}.rf-codici code{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:13px;letter-spacing:.04em}`; document.head.appendChild(st); })();


/* ---------- agenda vera: colonne per medico, giorno per giorno ---------- */
/* La pagina Agenda del prototipo aveva colonne finte (Dr.ssa Bianchi, Dr.
   Ferrari, Sala ECG). Qui le colonne sono i medici che hanno appuntamenti nel
   giorno scelto (nomi dal registro dei medici dell'agenda) più «Senza
   medico», dove il codice del luogo resta visibile. Giorno cambiabile
   nella finestra ±30 giorni caricata da /api/prototipo/dati. */
/* ---------- Agenda: che cosa vuol dire il colore del riquadro ----------
   Nell'agenda della Cassa dei Medici il colore è il tipo di appuntamento.
   Il catalogo è quello dello studio, scritto in [[Piattaforma/Robot agenda
   MediOnline]]: si cambia qui finché non diventa una scheda in Studio.
   Un colore che non è in tabella NON si inventa: si mostra com'è. */
const RF_COLORI_TIPO = {
  '#2ecc40': 'Visite',
  '#01ff70': 'Colloqui telefonici',
  '#0074d9': 'Risonanze',
  '#7fdbff': 'ICCT · emodinamica e CVE',
  '#85144b': 'Interventi',
  '#ff4136': 'Urgenze',
  '#ff851b': 'Ecocardiogrammi',
};
function rfTipoColore(colore) {
  const c = String(colore || '').toLowerCase();
  if (!c) return 'Senza colore';
  return RF_COLORI_TIPO[c] || `Altro · ${c}`;
}

// Scheda dell'appuntamento: si apre cliccando il riquadro in agenda. Mostra
// quel che il riquadro non ha spazio di dire — data di nascita, numero di
// paziente di MediOnline, stato della fatturazione, sigla dell'agenda — e
// porta alla cartella quando il paziente è abbinato. Sola lettura: qui non si
// modifica niente, l'agenda resta della Cassa dei Medici.
function rfApptScheda(id) {
  const a = (RF.agenda || []).find(x => x.id === id);
  if (!a) return;
  const inCartella = a.p && rfUuid(a.p);
  const paz = a.p && P[a.p] ? P[a.p] : null;
  const riga = (et, val) => val ? `<div class="rf-ap-riga"><span class="e">${et}</span><span class="v">${val}</span></div>` : '';
  const fine = (() => { const [h, m] = a.start.split(':').map(Number); const t = h * 60 + m + a.dur; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
  const et = new Date(`${a.d}T12:00:00`).toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const corpo = `
    <div class="rf-ap">
      ${riga('Quando', `${rfEsc(et)} · <b>${a.start} – ${fine}</b> <span class="caption">(${a.dur} min)</span>`)}
      ${riga('Paziente', rfEsc(a.nomeBreve || a.nome))}
      ${riga('Nato il', rfEsc(a.nascita))}
      ${riga('N° paziente', a.nPaziente ? `<code>${rfEsc(a.nPaziente)}</code> <span class="caption">in MediOnline</span>` : '')}
      ${riga(rfRuoloDi(a.doc) ? 'Eseguito da' : 'Medico', a.doc && a.doc !== 'studio' ? rfEsc(DOCTORS[a.doc] || a.doc) + rfEtichettaRuolo(a.doc) : `<span class="caption">non abbinato</span>`)}
      ${riga('Agenda', a.sigla ? `<code>${rfEsc(a.sigla)}</code>` : (a.room ? `<code>${rfEsc(a.room)}</code>` : ''))}
      ${riga('Tipo', a.colore ? `<span class="status"><i class="dot" style="background:${rfEsc(a.colore)}"></i>${rfEsc(rfTipoColore(a.colore))}</span>` : '')}
      ${riga('Prestazione', a.prestazione || a.motivoVero
        ? rfEsc(a.prestazione || a.motivoVero)
        : `<span class="caption">MediOnline nel riquadro non scrive la prestazione. Il tipo qui sopra viene dal colore; per avere il nome della prestazione si riempie il catalogo in Studio → Prestazioni.</span>`)}
      ${riga('In MediOnline', a.statoMol ? rfStatoPill(a.statoMol) : '<span class="caption">non ancora letto</span>')}
      ${riga('Nella piattaforma', inCartella ? '<span class="status"><i class="dot success"></i>paziente in cartella</span>' : '<span class="status"><i class="dot warning"></i>solo in agenda, non in cartella</span>')}
      <div class="rf-ap-grezzo"><span class="caption">Come sta scritto nell'agenda</span><div>${rfEsc(a.nome)}</div></div>
    </div>`;
  const azioni = `<button class="btn" data-close>Chiudi</button>` +
    (inCartella ? `<button class="btn primary" onclick="closeModal();go('#/patients/${rfEsc(a.p)}')">Apri la cartella</button>` : '') +
    `<button class="btn ai" onclick="closeModal();askAI('Briefing pre-visita di ${rfEsc((a.nomeBreve || a.nome).replace(/'/g, ' '))}')">${ICONS.ai} Briefing</button>`;
  openModal('Appuntamento', corpo, azioni);
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-ap { display:flex; flex-direction:column; gap:1px; }
.rf-ap-riga { display:grid; grid-template-columns: 130px minmax(0,1fr); gap:10px; padding:7px 0; border-top:1px solid var(--border); font-size:13.5px; align-items:baseline; }
.rf-ap-riga:first-child { border-top:0; }
.rf-ap-riga .e { color:var(--text-3); font-size:12.5px; }
.rf-ap-riga .v code { font-family:var(--font-mono, ui-monospace, monospace); font-size:12.5px; background:var(--surface-2); padding:1px 5px; border-radius:4px; }
.rf-ap-grezzo { margin-top:10px; padding-top:9px; border-top:1px solid var(--border); }
.rf-ap-grezzo div { font-size:12.5px; color:var(--text-2); margin-top:3px; }
@media (max-width: 600px) { .rf-ap-riga { grid-template-columns: 1fr; gap:2px; } }
`; document.head.appendChild(st); })();

// Chi tiene un'agenda senza essere medico (l'ecografista, per esempio): il
// nome si mostra, ma con scritto che cos'è — non lo si chiama medico.
function rfRuoloDi(id) { return (RF.data && RF.data.ruoliMedici && RF.data.ruoliMedici[id]) || ''; }
function rfEtichettaRuolo(id) { const r = rfRuoloDi(id); return r ? ` <span class="caption">${rfEsc(r)}</span>` : ''; }

const rfAgendaOrig = PAGES.agenda;
PAGES.agenda = () => {
  if (!RF.live) return rfAgendaOrig();
  const oggi = (RF.data && RF.data.today) || new Date().toISOString().slice(0, 10);
  if (!state.agendaGiorno) state.agendaGiorno = oggi;
  const giorno = state.agendaGiorno;
  const filtroTipo = state.agendaTipo || '';
  const periodo = state.agendaPeriodo === 'settimana' ? 'settimana' : 'giorno';
  const passaTipo = (a) => !filtroTipo || a.tipoPrest === filtroTipo;
  const lista = (RF.agenda || []).filter(a => a.d === giorno && passaTipo(a)).sort((a, b) => a.start.localeCompare(b.start));
  const nomeDi = (a) => (a.p && P[a.p]) ? fullName(P[a.p]) : (a.nome || 'Paziente');
  const medici = [...new Set(lista.filter(a => a.doc && a.doc !== 'studio').map(a => a.doc))].sort((x, y) => (DOCTORS[x] || '').localeCompare(DOCTORS[y] || ''));
  const minuti = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Vista per sala (14.9.2026): colonne = luoghi dell'agenda del giorno
  // abbinati alle risorse dello studio (più le sale registrate senza
  // appuntamenti); sovrapposizioni oltre i posti della sala segnalate.
  const vista = state.agendaVista === 'sale' ? 'sale' : 'medici';
  const risorse = (RF.data && Array.isArray(RF.data.risorse)) ? RF.data.risorse : [];
  const risorsaDi = (codice) => risorse.find(r => r.nome.toLowerCase() === String(codice || '').trim().toLowerCase()) || null;
  const chiaveSala = (a) => String(a.room || '').trim().toLowerCase();
  const sovra = new Set(); const avvisi = [];
  let cols;
  if (vista === 'sale') {
    const viste = new Map();
    for (const a of lista) { const k = chiaveSala(a); if (!k) continue; if (!viste.has(k)) { const r = risorsaDi(a.room); viste.set(k, { k, nome: r ? r.nome : a.room.trim(), posti: r ? (r.posti || 1) : null, tipo: r ? r.tipo : 'codice' }); } }
    for (const r of risorse) if (r.tipo === 'sala' && !viste.has(r.nome.toLowerCase())) viste.set(r.nome.toLowerCase(), { k: r.nome.toLowerCase(), nome: r.nome, posti: r.posti || 1, tipo: 'sala' });
    const ordinate = [...viste.values()].sort((x, y) => x.nome.localeCompare(y.nome));
    cols = ordinate.map(c => ({ k: c.k, et: `${c.nome}${c.posti ? ` · ${c.posti} ${c.posti === 1 ? 'posto' : 'posti'}` : ''}${c.tipo === 'apparecchio' ? ' · apparecchio' : c.tipo === 'codice' ? ' · codice' : ''}`, colore: '', test: (a) => chiaveSala(a) === c.k }));
    if (lista.some(a => !chiaveSala(a))) cols.push({ k: '', et: 'Senza luogo', colore: '', test: (a) => !chiaveSala(a) });
    for (const c of ordinate) {
      if (!c.posti) continue;
      const inSala = lista.filter(a => chiaveSala(a) === c.k && a.status !== 'CANCELLED');
      for (const a of inSala) {
        const ini = minuti(a.start), fine = ini + a.dur;
        const conc = inSala.filter(b => minuti(b.start) < fine && minuti(b.start) + b.dur > ini).length;
        if (conc > c.posti) { sovra.add(a.id); const t = `${c.nome} alle ${a.start} (${conc} su ${c.posti})`; if (!avvisi.includes(t)) avvisi.push(t); }
      }
    }
  } else {
    cols = medici.map(k => ({ k, et: (DOCTORS[k] || k) + (rfRuoloDi(k) ? ` · ${rfRuoloDi(k)}` : ''), colore: (RF.data && RF.data.coloriMedici && RF.data.coloriMedici[k]) || '', test: (a) => a.doc === k }));
    // Quel che non è di un medico non finisce più in una colonna sola dove si
    // copre a vicenda: si divide per COLORE del riquadro nell'agenda
    // originale, che nello studio vuol dire il tipo di appuntamento
    // (catalogo in [[Piattaforma/Robot agenda MediOnline]]).
    const orfani = lista.filter(a => !a.doc || a.doc === 'studio');
    const gruppi = new Map();
    for (const a of orfani) {
      const c = String(a.colore || '').toLowerCase();
      if (!gruppi.has(c)) gruppi.set(c, { c, n: 0 });
      gruppi.get(c).n++;
    }
    for (const g of [...gruppi.values()].sort((x, y) => y.n - x.n)) {
      cols.push({ k: `col:${g.c}`, et: rfTipoColore(g.c), colore: g.c, test: (a) => (!a.doc || a.doc === 'studio') && String(a.colore || '').toLowerCase() === g.c });
    }
  }
  const startH = lista.length ? Math.max(6, Math.min(8, Math.floor(Math.min(...lista.map(a => minuti(a.start))) / 60))) : 8;
  const endH = lista.length ? Math.min(21, Math.max(18, Math.ceil(Math.max(...lista.map(a => minuti(a.start) + a.dur)) / 60))) : 18;
  const slotH = 44, slots = (endH - startH) * 2;
  const top = (t) => (minuti(t) - startH * 60) / 30 * slotH;
  // Sovrapposizioni: gli appuntamenti che si accavallano si dividono la
  // larghezza della colonna invece di coprirsi a vicenda (era illeggibile).
  // Algoritmo classico da calendario: si raggruppano quelli legati a catena e
  // dentro il gruppo si assegna la prima corsia libera.
  const disponi = (app) => {
    const ord = [...app].sort((a, b) => minuti(a.start) - minuti(b.start) || b.dur - a.dur);
    const pos = new Map();
    let gruppo = [], fine = -1;
    const chiudi = () => {
      if (!gruppo.length) return;
      const corsie = [];
      for (const a of gruppo) {
        let i = 0;
        while (corsie[i] !== undefined && corsie[i] > minuti(a.start)) i++;
        corsie[i] = minuti(a.start) + a.dur;
        pos.set(a.id, { c: i, n: 1 });
      }
      for (const a of gruppo) pos.get(a.id).n = corsie.length;
      gruppo = []; fine = -1;
    };
    for (const a of ord) {
      const ini = minuti(a.start);
      if (gruppo.length && ini >= fine) chiudi();
      gruppo.push(a);
      fine = Math.max(fine, ini + a.dur);
    }
    chiudi();
    return pos;
  };
  const chip = (a, p) => {
    const n = Math.max(1, (p && p.n) || 1), c = (p && p.c) || 0;
    const larg = 100 / n;
    const geo = n > 1
      ? `left:calc(${(c * larg).toFixed(3)}% + 3px);width:calc(${larg.toFixed(3)}% - 6px);right:auto`
      : 'left:6px;right:6px';
    return `<div class="appt ${a.late ? 'LATE' : a.status}${sovra.has(a.id) ? ' rf-over' : ''}${n > 2 ? ' rf-stretta' : ''}" style="${geo};top:${top(a.start) + 2}px;height:${Math.max(24, a.dur / 30 * slotH - 4)}px${a.colore ? `;border-left:4px solid ${rfEsc(a.colore)};background:${rfEsc(a.colore)}1a` : (RF.data && RF.data.coloriMedici && RF.data.coloriMedici[a.doc] ? `;border-left:4px solid ${rfEsc(RF.data.coloriMedici[a.doc])}` : '')}" onclick="rfApptScheda('${rfEsc(a.id)}')" title="${rfEsc(nomeDi(a))} · ${a.start}${a.prestazione || a.motivoVero ? ' · ' + rfEsc(a.prestazione || a.motivoVero) : (a.colore ? ' · ' + rfEsc(rfTipoColore(a.colore)) : '')}${a.room ? ' · ' + rfEsc(a.room) : ''} — clicca per la scheda"><div class="n"><i class="dot ${a.late ? 'warning' : a.status === 'COMPLETED' ? 'success' : 'accent'}"></i>${rfEsc(nomeDi(a))}</div><div class="s">${a.start}${n > 2 ? '' : `${(() => { const d = a.prestazione || a.motivoVero || (a.colore ? rfTipoColore(a.colore) : ''); return d && !String(d).startsWith('Altro · ') ? ` · ${rfEsc(d)}` : ''; })()}${a.room ? ` · <b>${rfEsc(a.room)}</b>` : ''}`}</div></div>`;
  };
  const colHtml = (col) => {
    const dentro = lista.filter(col.test);
    const pos = disponi(dentro);
    return `<div class="cal-col" style="height:${slots * slotH}px">${Array.from({ length: slots }, (_, i) => `<div class="cal-line ${i % 2 ? 'half' : ''}" style="top:${i * slotH}px"></div>`).join('')}${dentro.map(a => chip(a, pos.get(a.id))).join('')}</div>`;
  };
  const times = Array.from({ length: slots }, (_, i) => i % 2 === 0 ? `<div class="cal-time num" style="top:${i * slotH}px">${String(startH + i / 2).padStart(2, '0')}:00</div>` : '').join('');
  const d = new Date(`${giorno}T12:00:00`);
  const etichetta = d.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sposta = (n) => { const x = new Date(`${giorno}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const senza = lista.filter(a => !a.doc || a.doc === 'studio').length;
  if (periodo === 'settimana') {
    // Settimana (14.9.2026, punto 6): sette colonne, ogni appuntamento in una
    // riga compatta; per sala mostra la sala, per medico il medico col colore.
    const lun = new Date(`${giorno}T12:00:00`); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
    const giorni = Array.from({ length: 7 }, (_, i) => { const x = new Date(lun); x.setDate(lun.getDate() + i); return x.toISOString().slice(0, 10); });
    const sett = (RF.agenda || []).filter(a => a.d >= giorni[0] && a.d <= giorni[6] && passaTipo(a)).sort((a, b) => (a.d + a.start).localeCompare(b.d + b.start));
    const col = (a) => a.colore || (RF.data && RF.data.coloriMedici && RF.data.coloriMedici[a.doc]) || '';
    const et = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-CH', { weekday: 'short', day: 'numeric' });
    const etSett = `${new Date(`${giorni[0]}T12:00:00`).toLocaleDateString('it-CH', { day: 'numeric', month: 'short' })} – ${new Date(`${giorni[6]}T12:00:00`).toLocaleDateString('it-CH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `
    <div class="page-head"><div><h2 class="page-title">Agenda</h2><div class="page-sub">Settimana ${rfEsc(etSett)} · ${sett.length} appuntamenti${filtroTipo ? ` · solo ${filtroTipo === 'visita' ? 'visite' : filtroTipo === 'esame' ? 'esami' : 'procedure'}` : ''}</div></div>
      <div class="actions"><div class="seg"><button onclick="state.agendaPeriodo='giorno';render()">Giorno</button><button class="active">Settimana</button></div><div class="seg"><button class="${!filtroTipo ? 'active' : ''}" onclick="state.agendaTipo='';render()">Tutto</button><button class="${filtroTipo === 'visita' ? 'active' : ''}" onclick="state.agendaTipo='visita';render()">Visite</button><button class="${filtroTipo === 'esame' ? 'active' : ''}" onclick="state.agendaTipo='esame';render()">Esami</button><button class="${filtroTipo === 'procedura' ? 'active' : ''}" onclick="state.agendaTipo='procedura';render()">Procedure</button></div><div class="seg"><button class="${vista === 'medici' ? 'active' : ''}" onclick="state.agendaVista='medici';render()">Per medico</button><button class="${vista === 'sale' ? 'active' : ''}" onclick="state.agendaVista='sale';render()">Per sala</button></div><div class="seg"><button onclick="state.agendaGiorno='${sposta(-7)}';render()">‹</button><button class="${giorni.includes(oggi) ? 'active' : ''}" onclick="state.agendaGiorno='${oggi}';render()">Oggi</button><button onclick="state.agendaGiorno='${sposta(7)}';render()">›</button></div></div></div>
    <div class="rf-week">${giorni.map(g => { const del = sett.filter(a => a.d === g); return `<div class="rf-week-col ${g === oggi ? 'oggi' : ''}"><div class="rf-week-head"><span>${rfEsc(et(g))}</span><span class="caption">${del.length || ''}</span></div>${del.map(a => `<div class="rf-week-item ${a.status === 'COMPLETED' ? 'done' : ''}" ${a.p && rfUuid(a.p) ? `data-go="#/patients/${a.p}"` : ''} style="${col(a) ? `border-left-color:${rfEsc(col(a))}` : ''}" title="${rfEsc(nomeDi(a))} · ${rfEsc(a.reason || '')}"><span class="num">${a.start}</span> <b>${rfEsc(nomeDi(a))}</b><div class="caption">${rfEsc(a.prestazione || a.reason || '')}${vista === 'sale' ? (a.room ? ` · ${rfEsc(a.room)}` : '') : (DOCTORS[a.doc] ? ` · ${rfEsc(DOCTORS[a.doc])}` : '')}</div></div>`).join('') || '<div class="caption" style="padding:8px">—</div>'}</div>`; }).join('')}</div>
    <div class="row mt-16 caption wrap"><span class="caption">Dal robot MediOnline, in sola lettura; clic su un appuntamento apre la scheda del paziente in cartella.</span></div>`;
  }
  return `
    <div class="page-head"><div><h2 class="page-title">Agenda</h2><div class="page-sub">${rfEsc(etichetta)} · ${lista.length} appuntamenti${medici.length ? ` · ${medici.length} medici` : ''}${senza ? ` · ${senza} senza medico` : ''}</div></div>
      <div class="actions"><div class="seg"><button class="${periodo === 'giorno' ? 'active' : ''}" onclick="state.agendaPeriodo='giorno';render()">Giorno</button><button class="${periodo === 'settimana' ? 'active' : ''}" onclick="state.agendaPeriodo='settimana';render()">Settimana</button></div><div class="seg"><button class="${!filtroTipo ? 'active' : ''}" onclick="state.agendaTipo='';render()">Tutto</button><button class="${filtroTipo === 'visita' ? 'active' : ''}" onclick="state.agendaTipo='visita';render()">Visite</button><button class="${filtroTipo === 'esame' ? 'active' : ''}" onclick="state.agendaTipo='esame';render()">Esami</button><button class="${filtroTipo === 'procedura' ? 'active' : ''}" onclick="state.agendaTipo='procedura';render()">Procedure</button></div><div class="seg"><button class="${vista === 'medici' ? 'active' : ''}" onclick="state.agendaVista='medici';render()">Per medico</button><button class="${vista === 'sale' ? 'active' : ''}" onclick="state.agendaVista='sale';render()">Per sala</button></div><div class="seg"><button onclick="state.agendaGiorno='${sposta(periodo === 'settimana' ? -7 : -1)}';render()">‹</button><button class="${giorno === oggi ? 'active' : ''}" onclick="state.agendaGiorno='${oggi}';render()">Oggi</button><button onclick="state.agendaGiorno='${sposta(periodo === 'settimana' ? 7 : 1)}';render()">›</button></div><input type="date" class="input sm" value="${giorno}" onchange="state.agendaGiorno=this.value;render()" style="max-width:160px"><button class="btn ai" data-ai="Preparazione della giornata">${ICONS.ai} Prepara la giornata</button></div></div>
    ${avvisi.length ? `<div class="card mb-16" style="border-left:3px solid var(--danger)"><b>Più pazienti dei posti della sala</b>: ${avvisi.map(rfEsc).join(' · ')}. I posti si impostano in Studio → Sale.</div>` : ''}
    ${vista === 'sale' && cols.length && !risorse.some(r => r.tipo === 'sala') ? `<div class="caption mb-16">Nessuna sala registrata: le colonne sono i codici del campo «luogo» dell'agenda. In Studio → Sale si registrano le sale con i posti; in Medici agenda → Codici dell'agenda un codice diventa una sala.</div>` : ''}
    ${senza && vista === 'medici' ? `<div class="caption mb-16">Le colonne a destra della linea sono gli appuntamenti <b>non abbinati a un medico</b>, divisi per colore dell'agenda originale, cioè per tipo. I codici del luogo non abbinati sono ${[...new Set(lista.filter(a => !a.doc || a.doc === 'studio').map(a => a.room).filter(Boolean))].map(rfEsc).join(', ') || 'vuoti'}: si abbinano in Studio → Medici agenda → Codici dell'agenda, e allora tornano nella colonna del medico.</div>` : ''}
    ${lista.length ? (() => {
      // Larghezza disponibile stimata: finestra meno barra laterale, margini e
      // colonna delle ore. Le colonne si dividono quello che resta, con un
      // minimo sotto il quale diventano illeggibili.
      const disponibile = Math.max(520, (typeof window !== 'undefined' ? window.innerWidth : 1440) - (state.sidebarCollapsed ? 72 : 240) - 28 - 52 - 24);
      const min = Math.max(104, Math.min(190, Math.floor(disponibile / Math.max(1, cols.length))));
      return `<div class="rf-cal-scorre"><div class="cal${min < 150 ? ' rf-fitta' : ''}" style="--cols:${cols.length};--cal-min:${min}px">`;
    })() + `
      <div class="cal-head"></div>${cols.map(c => `<div class="cal-head${String(c.k).startsWith('col:') ? ' rf-tipo' : ''}">${c.colore ? `<i class="dot" style="background:${rfEsc(c.colore)};margin-right:6px"></i>` : ''}${rfEsc(c.et)}</div>`).join('')}
      <div class="cal-times" style="--slots:${slots};--slot-h:${slotH}px">${times}</div>${cols.map(colHtml).join('')}
    </div></div>` : `<div class="card"><div class="caption">Nessun appuntamento in agenda per questo giorno${Math.abs((d - new Date(`${oggi}T12:00:00`)) / 86400000) > 30 ? ' (la piattaforma carica ±30 giorni da oggi)' : ''}.</div></div>`}
    ${(() => { const c = {}; for (const a of lista) if (a.colore) c[a.colore] = (c[a.colore] || 0) + 1; const voci = Object.entries(c).sort((x, y) => y[1] - x[1]); return voci.length ? `<div class="row mt-16 caption wrap" style="gap:10px"><span>Colori dell'agenda originale:</span>${voci.map(([col, n]) => `<span class="status"><i class="dot" style="background:${rfEsc(col)}"></i>${n}</span>`).join('')}</div>` : ''; })()}
    <div class="row mt-16 caption wrap"><span class="status"><i class="dot accent"></i>Programmato</span><span class="status"><i class="dot success"></i>Completato</span><span class="status"><i class="dot warning"></i>In ritardo</span><span class="caption">Dal robot MediOnline, in sola lettura; si aggiorna ogni ora.</span></div>`;
};

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
    if (state.route === 'ai') state.aiOpen = false;
    const out = rfRenderVero();
    const aip = document.getElementById('rf-aip-body'); if (aip) { aip.scrollTop = 1e6; const inp = document.getElementById('rf-aip-in'); if (inp && !document.activeElement?.closest('#modal')) setTimeout(() => inp.focus({ preventScroll: true }), 0); }
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
  const p = RF.data.pianoSale;
  const c = RF.data.capienzaSale;
  const notaCapienza = (() => { if (!c || !c.picco) return ''; const scarso = c.oreOltre && c.oreOltre.length;
    return `<div class="caption mt-8" style="padding:0 6px">Al massimo oggi <b>${c.picco} appuntamenti insieme</b> su ${c.stanze} stanze.${scarso ? ` Non bastano dalle <b>${rfEsc(c.oreOltre[0])}</b>${c.oreOltre.length > 1 ? ` alle <b>${rfEsc(c.oreOltre[c.oreOltre.length - 1])}</b>` : ''}. Una fetta in agenda non è sempre una persona in stanza: è una capienza da guardare, non un errore.` : ''}</div>`; })();
  if (!p || !Array.isArray(p.righe) || !p.righe.length) {
    const lista = Array.isArray(sale) ? sale : [];
    return `<div class="card"><div class="card-head"><span class="section-title">Sale e medici</span><button class="btn sm ghost" data-go="#/administration">Studio ${ICONS.chevR}</button></div>
      ${lista.length ? lista.slice(0, 10).map(rigaSala).join('') : `<div class="caption" style="padding:8px 6px">Nessuna sala registrata. Le sale si registrano in Studio → Sale e apparecchi.</div>`}
      ${lista.length ? '<div class="caption mt-8" style="padding:0 6px">Il piano di oggi non è ancora pronto: questa è l\'occupazione letta dal campo «luogo» dell\'agenda.</div>' : ''}
      ${notaCapienza}</div>`;
  }
  const ora = rfOraRif();
  const righe = p.righe;
  const stati = righe.map(r => rfStatoStanza(r, ora));
  const inUso = stati.filter(x => x.inCorso && x.inCorso.length).length;
  const libere = stati.filter(x => x.vuotaOggi && !x.aperta).length;
  const aperte = stati.filter(x => x.aperta).length;
  const cambi = rfCambiDelGiorno(righe, ora).slice(0, 3);
  const fuoriOrario = RF.saleQuando === 'ora' && (rfOraOra() < RF_APERTURA || rfOraOra() >= RF_CHIUSURA);
  const bottone = (k, et) => `<button class="${RF.saleQuando === k ? 'on' : ''}" onclick="rfSaleQuando('${k}')">${et}</button>`;
  return `<div class="card">
    <div class="rf-sale-head"><span class="section-title">Sale e medici</span>
      <div class="rf-seg">${bottone('ora', 'Ora')}${bottone('mattina', 'Mattina')}${bottone('pomeriggio', 'Pomeriggio')}</div></div>
    <div class="rf-sale-sint">${nMed} ${nMed === 1 ? 'medico' : 'medici'} in studio · ${inUso} ${inUso === 1 ? 'sala in uso' : 'sale in uso'}${libere ? ` · ${libere} ${libere === 1 ? 'libera oggi' : 'libere oggi'}` : ''}${aperte ? ` · ${aperte} da decidere` : ''}</div>
    ${fuoriOrario ? `<div class="caption" style="padding:0 2px 8px">Lo studio è chiuso: questa è la giornata di oggi alle ${rfEsc(ora)}.</div>` : ''}
    ${rfSaleElenco(righe, ora)}
    ${cambi.length ? `<div class="rf-cambi"><div class="tit">Prossimi cambi</div>
      ${cambi.map(x => `<div class="rf-cambio"><span class="ora num">${rfEsc(x.ora)}</span>${x.chi ? `${rfAvatar(x.chi)}<span>${rfEsc(rfNomeNudo(x.chi))}</span>` : '<span style="color:var(--text-2);font-style:italic">si libera</span>'}<span class="dove">${rfEsc(x.stanza)}</span></div>`).join('')}</div>` : ''}
    ${p.proposta && !RF.salaAperta ? (() => {
      const righeP = String(p.proposta).split('\n').filter(x => x.trim());
      const prime = righeP.slice(0, 2).map(rfEsc).join('<br>');
      return `<div class="rf-piano-prop" style="margin-top:12px"><div class="t">${ICONS.ai} Proposta per oggi</div>
        <div class="c">${prime}</div>
        <div class="caption mt-8">${righeP.length > 2 ? `…e altre ${righeP.length - 2} righe. ` : ''}${p.accettata_at ? 'Confermata.' : '<b>Da confermare</b>, la decisione è di chi è in studio.'} <a href="#/sale">Aprila in Sale</a></div></div>`;
    })() : ''}
    <div class="row mt-16" style="justify-content:space-between;align-items:center;gap:8px">
      <button class="btn sm ghost" data-go="#/sale">Vedi pianificazione completa ${ICONS.chevR}</button>
      ${p.accettata_at ? '<span class="badge success">piano confermato</span>' : ''}</div>
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
      <span class="sf">${n ? `${n} ${n === 1 ? 'visita' : 'visite'}` : `libera${st.seg && st.seg.chi ? ` · di ${rfEsc(rfNomeCorto(st.seg.chi))}` : ''}`}${r.funzione ? ` · ${rfEsc(r.funzione)}` : ''}</span></button>`;
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
        ${s.manuale ? '<span class="am">a mano</span>' : ''}</button>`;
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
    <div class="rf-cs-vv">${rfVisiteSala(r.stanza).map(v => {
      const h = (rfMinuti(v.fine) - rfMinuti(v.inizio)) * M - 1;
      const n = Math.max(1, v.corsie || 1), c = v.corsia || 0;
      return `<button class="rf-cs-v${v.sovra ? ' sovra' : ''}" style="top:${su(v.inizio).toFixed(1)}px;height:${Math.max(7, h).toFixed(1)}px;left:${(c / n * 100).toFixed(2)}%;width:calc(${(100 / n).toFixed(2)}% - 2px)"
        onclick="event.stopPropagation(); rfApptScheda('${rfEsc(v.id)}')" data-sug="${rfEsc(rfSugVisita(v, r.stanza))}"><span class="nm">${rfEsc(rfVisitaNome(v))}</span>${(v.motivo || v.etichetta) ? `<span class="pr">${rfEsc(v.motivo || v.etichetta)}</span>` : ''}</button>`;
    }).join('')}</div></div>`;

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
