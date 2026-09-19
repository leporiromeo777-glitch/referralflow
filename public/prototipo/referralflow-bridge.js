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
const RF = { live: false, erroreCarico: null, data: null, queue: [], loaded: null, loading: null, meta: null, audioEl: null, medici: [], caricato: false, nonAutorizzato: false, procedure: [], org: null };
function rfDentro() { return /\/prototipo\//.test(location.pathname); }
const rfEsc = (s) => (typeof esc === 'function' ? esc(String(s ?? '')) : String(s ?? ''));
/* Il nome di chi sta in un riquadro dell'agenda. Non tutti gli appuntamenti
   hanno un paziente in cartella: l'agenda dello studio contiene anche blocchi
   («pausa pranzo», «ecg 14h», un trattino), e per quelli il campo `p` è vuoto.
   Prima bastava uno di questi perché `fullName(undefined)` lanciasse: la Home
   restava bianca e ogni domanda a Cleo moriva prima di partire, con la bolla
   «Chiedo al modello locale…» ferma per sempre. */
/* Il giorno di oggi a Zurigo. `toISOString()` è UTC: fra mezzanotte e le
   01:00/02:00 locali dava IERI, e la pagina si apriva sul giorno sbagliato
   (o Cleo rispondeva sulla giornata sbagliata) proprio nelle ore di guardia. */
const rfOggi = () => new Date().toLocaleDateString('sv-SE');
function rfNomeAppt(a) { const paz = a && P[a.p]; return paz ? fullName(paz) : ((a && (a.nomeBreve || a.nome)) || 'Appuntamento'); }

/* ---------- caricamento dei dati veri ---------- */
function rfSvuota(arr) { arr.length = 0; }
function rfRimpiazzaOggetto(obj, nuovo) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, nuovo); }

async function rfCaricaDati() {
  if (!rfDentro()) return;
  let r;
  try { r = await fetch('/api/prototipo/dati', { credentials: 'include' }); } catch (e) { RF.erroreCarico = 'La piattaforma non risponde.'; if (!RF.caricato) rfPaginaCarico(); return; }
  if (r.status === 401) { RF.nonAutorizzato = true; rfPaginaAccesso({ passo: 'credenziali', errore: null, lavora: false }); return; }
  if (!r.ok) { RF.erroreCarico = `La piattaforma ha risposto ${r.status}.`; if (!RF.caricato) rfPaginaCarico(); return; }
  const d = await r.json();
  RF.data = d; RF.live = true; RF.caricato = true; RF.erroreCarico = null;
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
  const nav = ['home', 'agenda', 'visite', 'richiami', 'sale', 'prestazioni', 'patients', 'invianti', 'percorsi', 'reports', 'dittafono', 'converti', 'documents', 'imaging', 'moduli', 'anonymize', 'inbox', 'ai', 'fatturazione', 'administration'];
  const nascosti = new Set(Array.isArray(RF.data.moduli_nascosti) ? RF.data.moduli_nascosti : []);
  // Chi vede che cosa: «Da fatturare» è di segreteria e amministrazione; le
  // immagini sono dati sanitari e le vede chi cura, non il tecnico — come per
  // la scheda del paziente. La rotta dice già di no, ma una voce di menu che
  // risponde «non ti è permesso» è una voce di menu scritta male.
  const soloRuoli = { fatturazione: ['secretary', 'org_admin'], imaging: ['secretary', 'assistant', 'doctor', 'org_admin'], converti: ['secretary', 'assistant', 'doctor', 'org_admin'] };
  for (const k of Object.keys(NAV)) NAV[k] = nav.filter(v => (!soloRuoli[v] || soloRuoli[v].includes(k)) && (!nascosti.has(v) || v === 'home' || v === 'administration'));
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
  ['Operatività', ['home', 'agenda', 'visite', 'richiami', 'sale', 'prestazioni', 'inbox']],
  ['Clinico', ['patients', 'invianti', 'percorsi', 'visits', 'reports', 'dittafono', 'documents', 'imaging', 'moduli']],
  ['AI', ['ai', 'anonymize', 'converti']],   // Converti audio sotto Anonimizzazione; Cleo resta prima (19.9.2026, richiesta utente)
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
  const pazNext = next ? P[next.p] : null;
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
    <div class="page-head"><div><div class="eyebrow">La giornata dello studio</div><div class="display">${rfEsc(ROLES[state.role].greet)}</div><div class="page-sub" style="text-transform:none">${data} · ${appts.length} ${appts.length === 1 ? 'appuntamento' : 'appuntamenti'}${nMed ? ` · ${nMed} ${nMed === 1 ? 'medico' : 'medici'} in agenda` : ''} · ${TASKS.length ? `${TASKS.length} ${TASKS.length === 1 ? 'cosa' : 'cose'} da fare` : 'niente in sospeso'}</div></div>
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
        <div class="grow"><div style="font-size:20px;font-weight:650">${rfEsc(rfNomeAppt(next))}${pazNext && pazNext.age ? ` <span class="meta">· ${pazNext.age} anni</span>` : ''}</div><div class="meta">${rfEsc(next.reason)} · ${rfEsc(DOCTORS[next.doc] || '')}${next.room ? ` · ${rfEsc(next.room)}` : ''}</div>
          <div class="row wrap mt-8">${pazNext && pazNext.docs && pazNext.docs.length ? `<span class="badge accent">${pazNext.docs.length} documenti in cartella</span>` : ''}${pazNext && pazNext.referrals && pazNext.referrals.length ? `<span class="badge">${pazNext.referrals.length} referral</span>` : ''}</div></div>
      </div>
      <div class="row mt-24"><button class="btn primary lg" data-go="#/patients/${next.p}">Scheda paziente</button>${rfUuid(next.p) ? `<button class="btn lg ai" data-ai="Briefing pre-visita di ${rfEsc(rfNomeAppt(next))}">${ICONS.ai} Briefing pre-visita</button>` : ''}<button class="btn lg" data-go="#/agenda">Agenda di oggi</button></div>
    </div>` : ''}
    <div class="grid grid-main-side mt-16">
      <div class="stack rf-home-sx">
        <div class="card"><div class="card-head"><span class="section-title">Da fare adesso</span><button class="btn sm ghost" data-go="#/inbox">Tutte ${ICONS.chevR}</button></div>
          <div class="list">${TASKS.length ? TASKS.slice(0, 12).map(t => `<div class="list-item"><i class="dot ${t.prio === 'urgent' || t.prio === 'high' ? 'danger' : 'accent'}"></i><div class="grow"><div class="name">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('') : '<div class="caption" style="padding:8px 6px">Tutto gestito. Buon lavoro.</div>'}</div></div>
        ${rfCardSale(sale, rigaSala, nMed)}
      </div>
      <div class="stack rf-home-acc">
        ${(() => {
          // L'accoglienza al posto della colonna destra (16.9.2026 sera):
          // gli arrivi di oggi coi tasti, e la frase in italiano.
          const o = RF.orch;
          if (!o) return `<div class="card"><div class="card-head"><span class="section-title">Accoglienza</span></div><div class="caption" style="padding:8px 6px">Carico chi è arrivato…</div></div>`;
          const c = rfOrAccoglienzaCorpo(o, true);
          const arrivati = o.pazienti.filter(p => ['arrivato', 'in_attesa'].includes(p.stato)).length;
          const daChiamare = (o.ingressi || []).filter(i => i.azione === 'chiama').length;
          return `${rfOrMsg()}<div class="card"><div class="card-head"><span class="section-title">Accoglienza</span><span class="caption">${arrivati} in attesa${daChiamare ? ` · <b>${daChiamare} da chiamare</b>` : ''}</span></div>
            ${c.testo}
            <div class="rf-or-acc scorre" style="margin-top:10px">${c.righe}</div></div>`;
        })()}
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
@media print { body.rf-stampa > *:not(#rf-print) { display:none !important; } body.rf-stampa #rf-print { display:block; font:12pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color:#000; padding:0; } #rf-print h1 { font-size:16pt; margin:0 0 2pt; } #rf-print .meta { color:#333; font-size:10.5pt; margin-bottom:12pt; } #rf-print table { width:100%; border-collapse:collapse; } #rf-print td { border-bottom:1px solid #999; padding:6pt 4pt; vertical-align:top; } #rf-print td:first-child { width:38%; color:#333; } #rf-print .firma { margin-top:28pt; display:flex; justify-content:space-between; } #rf-print .firma span { border-top:1px solid #000; padding-top:4pt; width:40%; font-size:10pt; } }
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
// I codici di recupero su carta. Prima questo pulsante chiamava window.print()
// e usciva un foglio bianco: la regola di stampa dei moduli nasconde tutto
// quello che non è il foglio nascosto, e i codici non ci sono mai entrati.
function rfStampaCodici() {
  const p = RF.sic; if (!p || !p.codici) return;
  let box = document.getElementById('rf-print'); if (!box) { box = document.createElement('div'); box.id = 'rf-print'; document.body.appendChild(box); }
  const studio = (RF.data && RF.data.utente && RF.data.utente.studio) || 'ReferralFlow';
  const chi = (RF.data && RF.data.utente && RF.data.utente.name) || '';
  box.innerHTML = `<h1>Codici di recupero</h1><div class="meta">${rfEsc(studio)}${chi ? ` · ${rfEsc(chi)}` : ''} · ${rfEsc(new Date().toLocaleDateString('it-CH'))}</div>
    <table>${p.codici.map((c, i) => `<tr><td>${i + 1}.</td><td>${rfEsc(c)}</td></tr>`).join('')}</table>
    <div class="meta" style="margin-top:12pt">Ognuno vale una volta sola. Tienili dove tieni le cose importanti.</div>`;
  document.body.classList.add('rf-stampa');
  const pulisci = () => { document.body.classList.remove('rf-stampa'); box.innerHTML = ''; window.removeEventListener('afterprint', pulisci); };
  window.addEventListener('afterprint', pulisci);
  setTimeout(() => { window.print(); setTimeout(pulisci, 2000); }, 50);
}
function rfModuloStampa(c, campi, dati) {
  let box = document.getElementById('rf-print'); if (!box) { box = document.createElement('div'); box.id = 'rf-print'; document.body.appendChild(box); }
  const studio = (RF.data && RF.data.utente && RF.data.utente.studio) || 'ReferralFlow';
  box.innerHTML = `<h1>${rfEsc(c.codice)} — ${rfEsc(c.titolo)}</h1><div class="meta">${rfEsc(studio)} · ${rfEsc(c.paziente || 'senza paziente')}${c.nascita ? ` · nato/a ${rfEsc(c.nascita)}` : ''} · ${rfModQuando(c.updated_at || c.created_at)}</div>
    <table>${campi.map(x => `<tr><td>${x.n}. ${rfEsc(x.etichetta)}</td><td>${rfEsc(dati[x.chiave] || '')}</td></tr>`).join('')}</table>
    <div class="firma"><span>Data</span><span>Firma</span></div>`;
  fetch(`/api/prototipo/moduli/${c.id}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'stampa' }) }).catch(() => {});
  // Il foglio nascosto resta nel documento finché non si stampa, e va svuotato
  // subito dopo: se no la stampa successiva — anche un Cmd-P qualunque, anche
  // dei codici di recupero — rifà uscire il modulo di quel paziente.
  document.body.classList.add('rf-stampa');
  const pulisci = () => { document.body.classList.remove('rf-stampa'); box.innerHTML = ''; window.removeEventListener('afterprint', pulisci); };
  window.addEventListener('afterprint', pulisci);
  setTimeout(() => { window.print(); setTimeout(pulisci, 2000); }, 50);
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
  const oggi = (RF.data && RF.data.today) || rfOggi();
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
  const oggi = (RF.data && RF.data.today) || rfOggi();
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

  ['system', 'Sistema', 'Utenti, sicurezza, modelli', '/impostazioni/utenti'],
  ['communications', 'Comunicazioni', 'Telefonate ed e-mail', '/comunicazioni'],
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
    // La visita si prende tutta la finestra: niente margini della pagina, la
    // barra laterale stretta a icone (senza toccare la scelta dell'utente:
    // uscendo dalla visita torna com'era) e il pannello AI globale spento,
    // perché Cleo è già lì dentro nella sua colonna.
    let inVisita = false;
    try { inVisita = state.route === 'visite' && !!RF.orch && !!rfVAperta(); } catch { inVisita = false; }
    app.classList.toggle('visita-larga', inVisita);
    if (inVisita) app.classList.add('sidebar-collapsed');
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
    if (sort === 'time') return String(b.atIso || b.at).localeCompare(String(a.atIso || a.at));
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
    ? `<button class="btn sm ghost" onclick="rfImpagina()" title="${m.formato === 'lettera' ? 'Formato del medico: lettera al collega («Caro …,», corpo, saluto, terapia dalla lettera precedente)' : 'Formato del medico: rapporto a sezioni'}">${ICONS.ai || ''} ${m.formato === 'lettera' ? 'Impagina come lettera' : 'Riorganizza nel formato'}</button><button class="btn sm ghost" onclick="rfDuplica('${id}')" title="Quando in un solo audio ci sono due referti di due pazienti: crea una copia di questa bozza, con lo stesso audio, da tagliare per il secondo">Duplica</button><button class="btn sm ghost" onclick="rfWord('${id}')" title="Word con la carta intestata del medico, dal testo salvato">Word</button>`
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
// «Duplica»: in un solo audio due referti di due pazienti. Ricaricare l'audio
// non serve — l'impronta è la stessa e torna sulla prima bozza — quindi si
// copia la bozza e si taglia la copia. Il testo è lo stesso, l'audio pure.
async function rfDuplica(id) {
  if (!id) return;
  if (!confirm('Creo una copia di questo referto, con lo stesso testo e lo stesso audio, da modificare per l’altro paziente. L’originale resta com’è. Continuo?')) return;
  try {
    const r = await fetch(`/api/prototipo/referti/${id}/duplica`, { method: 'POST', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) { toast(j.errore || 'Duplicazione non riuscita'); return; }
    toast('Copia creata: sei sulla copia');
    RF.loaded = null; RF.meta = null; RF.data = null; RF.caricato = false; rfPaginaCarico();
    await rfCaricaDati();
    go(`#/review/${j.id}`);
  } catch { toast('Piattaforma non raggiungibile'); }
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
  .rf-edita-inline .rf-edita { min-height: 240px; }
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
  if (top && !document.getElementById('rf-vtutto-btn')) {
    // «Verifica tutto» (19.9.2026): chi preferisce ascoltarsi l'audio intero
    // una volta, correggere a mano e poi chiudere le verifiche in un colpo.
    const b = document.createElement('button'); b.id = 'rf-vtutto-btn'; b.className = 'btn sm'; b.type = 'button';
    b.title = 'Segna come verificate tutte le segnalazioni ancora aperte, senza cambiare il testo';
    b.innerHTML = `${(typeof ICONS !== 'undefined' && ICONS.check) || ''} Verifica tutto`; b.onclick = rfVerificaTutto;
    top.insertBefore(b, document.getElementById('rf-edita-btn') ? document.getElementById('rf-edita-btn').nextSibling : null);
  }
  if (top && !document.getElementById('rf-pennello-btn')) {
    const b = document.createElement('button'); b.id = 'rf-pennello-btn'; b.className = 'btn sm'; b.type = 'button'; b.title = 'Pennello: evidenzia il testo da togliere dal referto';
    b.innerHTML = `${RF_PENNELLO_ICONA} Nascondi`; b.onclick = () => rfPennello(!RF.pennello);
    top.insertBefore(b, document.getElementById('rf-edita-btn') || null);
  }
  const eb = document.getElementById('rf-edita-btn'); if (eb) { eb.hidden = RV.mode === 'read'; eb.classList.toggle('primary', !!RF.editaInline); eb.innerHTML = RF.editaInline ? 'Chiudi modifica' : `${(typeof ICONS !== 'undefined' && ICONS.edit) || ''} Edita`; }
  const vb = document.getElementById('rf-vtutto-btn'); if (vb) vb.hidden = RV.mode === 'read' || !!RF.editaInline || !(typeof rvOpen === 'function' && rvOpen().length);
  const pb = document.getElementById('rf-pennello-btn'); if (pb) { pb.hidden = RV.mode === 'read' || !!RF.editaInline; pb.classList.toggle('primary', !!RF.pennello); }
  rfPennelloApplicaStato();
  rfEditaInlineApplica();
  const leg = document.querySelector('#rv-main .rv-legend');
  if (leg && !leg.querySelector('.lg.tolta')) { const sp = document.createElement('span'); sp.className = 'lg tolta'; sp.textContent = 'Tolta dal referto'; leg.appendChild(sp); }
};
function rfEdita() {
  const id = RF.loaded; if (!id) return;
  if (RF.meta && RF.meta.stato !== 'bozza') { toast('Il referto è già confermato: non si modifica più'); return; }
  // Interruttore, come «Nascondi»: acceso, il testo centrale diventa una sola
  // area di scrittura al suo posto; spento senza salvare, torna com'era.
  if (RF.editaInline) { RF.editaInline = false; RF.editaTesto = null; rvRenderReport(); return; }
  if (RF.pennello) rfPennello(false);
  RF.editaInline = true; RF.editaTesto = rfTestoRicomposto();
  rvRenderReport();
}
// Disegna (o toglie) l'area di scrittura al posto del testo con le
// segnalazioni. Si richiama a ogni ridisegno: il testo scritto finora sta in
// RF.editaTesto, così un ridisegno nel mezzo non lo perde.
function rfEditaInlineApplica() {
  const doc = document.querySelector('#rv-main .rv-doc'); if (!doc) return;
  if (!RF.editaInline) return;
  const n = Object.keys(RV.removed).filter(k => RV.removed[k]).length;
  doc.innerHTML = `<div class="rf-edita-inline">
    <textarea class="rf-edita" id="rf-edita-testo" spellcheck="true"></textarea>
    <div class="row mt-8" style="gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn primary" id="rf-edita-ok">Salva</button>
      <button class="btn" onclick="rfEdita()">Annulla</button>
      <span class="caption">È il testo pulito${n ? `, senza ${n === 1 ? 'la frase tolta' : `le ${n} frasi tolte`}` : ''}. Salvando, la revisione si ricalcola sul nuovo testo: le verifiche già chiuse restano chiuse dove le frasi coincidono.</span>
    </div></div>`;
  const box = document.getElementById('rf-edita-testo');
  box.value = RF.editaTesto || '';
  box.oninput = () => { RF.editaTesto = box.value; };
  box.style.height = 'auto'; box.style.height = Math.max(240, box.scrollHeight + 8) + 'px';
  document.getElementById('rf-edita-ok').onclick = () => rfEditaSalva(box.value);
  const leg = document.querySelector('#rv-main .rv-legend'); if (leg) leg.hidden = true;
  setTimeout(() => box.focus(), 40);
}
async function rfEditaSalva(valore) {
  const id = RF.loaded; if (!id) return;
  const originale = rfTestoRicomposto();
  const nuovo = String(valore || '').replace(/\r\n/g, '\n').trim();
  if (!nuovo) { toast('Il testo non può essere vuoto'); return; }
  if (nuovo === originale.trim()) { RF.editaInline = false; RF.editaTesto = null; rvRenderReport(); return; }
  const btn = document.getElementById('rf-edita-ok'); if (btn) { btn.disabled = true; btn.textContent = 'Salvo…'; }
  clearTimeout(rvSave._rf);
  rvLog('CORRECTION', 'testo completo modificato a mano (Edita)');
  RV.metrics.corrections = (RV.metrics.corrections || 0) + 1;
  try {
    const r = await fetch(`/api/prototipo/referti/${id}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: nuovo, stato: rfStatoRevisione(), correzioni: RV.metrics.corrections, verifiche: rvDone() }) });
    if (!r.ok) throw new Error('salvataggio');
  } catch { if (btn) { btn.disabled = false; btn.textContent = 'Salva'; } toast('Non riesco a salvare nella piattaforma'); return; }
  RF.editaInline = false; RF.editaTesto = null;
  localStorage.removeItem(RV_KEY);
  RF.loaded = null; RF.loading = null;
  render();
  toast('Testo salvato · revisione ricalcolata');
}

/* «Verifica tutto» (19.9.2026). Segna come verificate le segnalazioni ancora
   aperte, in un colpo, con due conferme. NON applica le proposte e NON conta
   come correzioni: le correzioni restano quelle fatte a mano (ogni frase
   cambiata nel testo si conta da sé, e l'audit confronta comunque il testo
   confermato con quello della catena). Quante ne sono state chiuse così
   finisce in metrics.verificate_in_blocco: nel cruscotto si distingue
   «verificate una per una» da «verificate in blocco». */
function rfVerificaTutto() {
  if (RF.meta && RF.meta.stato !== 'bozza') { toast('Il referto è già confermato'); return; }
  const aperte = (typeof rvOpen === 'function' ? rvOpen() : []).filter(i => i.status === 'open');
  if (!aperte.length) { toast('Nessuna verifica aperta'); return; }
  const critiche = aperte.filter(i => i.sev === 'critical' || i.cat === 'NO_SOURCE').length;
  if (!confirm(`Segno come verificate ${aperte.length === 1 ? 'la verifica ancora aperta' : `le ${aperte.length} verifiche ancora aperte`}${critiche ? `, ${critiche} ${critiche === 1 ? 'critica compresa' : 'critiche comprese'}` : ''}. Il testo non cambia: le proposte NON vengono applicate. Continuo?`)) return;
  if (!confirm(`Seconda conferma: hai riascoltato l'audio e il testo è quello giusto? ${aperte.length === 1 ? 'La verifica viene chiusa' : `Le ${aperte.length} verifiche vengono chiuse`} senza essere passate una per una.`)) return;
  for (const i of aperte) { i.status = 'verified'; i.resolution = 'verificata in blocco'; }
  RV.metrics.verificate_in_blocco = (RV.metrics.verificate_in_blocco || 0) + aperte.length;
  rvLog('VERIFIED_ALL', `${aperte.length} verifiche chiuse in blocco`);
  rvSave(); rvRenderNav(); rvRenderReport(); if (typeof rvCount === 'function') rvCount(); if (typeof rvRenderSource === 'function') rvRenderSource();
  toast(`${aperte.length} ${aperte.length === 1 ? 'verifica segnata' : 'verifiche segnate'} come verificate · il testo non è cambiato`);
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
    oggi: (RF.data && RF.data.today) || rfOggi(), ruolo: state.role, pagina: state.route,
    documento_aperto: DV.open && DV.item && DV.item.live ? { titolo: DV.item.title, paziente: DV.item.p && P[DV.item.p] ? fullName(P[DV.item.p]) : null, data: DV.item.date } : null,
    numeri: s,
    agenda_oggi: APPTS.map(a => ({ ora: a.start, paziente: rfNomeAppt(a), medico: DOCTORS[a.doc], motivo: a.reason, stato: STATUS_LABEL[a.status] || a.status, in_ritardo: !!a.late })),
    attivita: TASKS.slice(0, 25).map(t => ({ titolo: t.title, scadenza: t.due, priorita: t.prio })),
    referti: RF.queue.slice(0, 15).map(r => ({ paziente: rfNomeAppt(r), medico: DOCTORS[r.doc], stato: r.status === 'APPROVED' ? 'confermato' : 'da controllare', verifiche: r.issues, critiche: r.crit, nota: r.note, quando: r.at })),
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
    return next ? `<b>Prossimo paziente</b><br>${next.start} · ${riga(rfNomeAppt(next))} · ${riga(next.reason)} · ${riga(DOCTORS[next.doc] || '')}${next.late ? ' · <span class="badge danger">in ritardo</span>' : ''}` : 'Nessun altro appuntamento oggi.';
  }
  if (/quanti (appuntamenti|pazienti)|appuntamenti (ci sono )?oggi|agenda di oggi|riassum/.test(ql)) {
    const primo = appts[0]; const ultimo = appts[appts.length - 1];
    const medici = [...new Set(appts.map(a => DOCTORS[a.doc]).filter(Boolean))];
    return `<b>Oggi</b><br>• ${appts.length} appuntamenti${appts.length ? ` dalle ${primo.start} alle ${ultimo.start}` : ''}${medici.length ? ` · ${medici.join(', ')}` : ''}<br>• ${s.visti_oggi || 0} già visti${next ? `, prossimo ${next.start} ${riga(rfNomeAppt(next))}` : ''}<br>• ${s.bozze_da_rivedere || 0} referti da controllare · ${s.urgenti || 0} referral urgenti · ${s.da_prenotare || 0} da prenotare · ${s.richiami_scaduti || 0} richiami scaduti<br>• ${TASKS.length} cose da fare in tutto`;
  }
  if (/referti (da )?(controllare|rivedere|approvare)|bozze/.test(ql)) {
    const aperti = RF.queue.filter(r => r.status !== 'APPROVED');
    return aperti.length ? `<b>Referti da controllare (${aperti.length})</b><br>${aperti.slice(0, 6).map(r => `• ${riga(rfNomeAppt(r))} · ${riga(r.note)} · ${r.crit} critiche`).join('<br>')}` : 'Nessun referto da controllare.';
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
  // Sul telefono il pannello laterale a tutto schermo è una seconda Cleo più
  // povera di quella vera: niente benvenuto, niente tasti dei modi. La
  // domanda va quindi nella PAGINA di Cleo, la stessa del computer.
  if (rfTelefono()) { state.aiOpen = false; if (state.route !== 'ai') go('#/ai'); }
  else if (!state.aiOpen) state.aiOpen = true;
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
    // Dall'agenda si apre la visita: è la via più corta per chi sta guardando
    // il programma del giorno (16.9.2026).
    (inCartella ? `<button class="btn" onclick="closeModal();go('#/patients/${rfEsc(a.p)}')">Apri la cartella</button>` : '') +
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
  const oggi = (RF.data && RF.data.today) || rfOggi();
  // Il giorno scelto resta finché non lo si cambia — ma «oggi» a un certo
  // punto diventa domani. Se la pagina è rimasta aperta oltre la mezzanotte
  // (17.9.2026: l'agenda mostrava ancora il giorno prima), chi era fermo sul
  // giorno corrente si ritrova sul nuovo; chi si era spostato a mano no,
  // altrimenti gli si sposterebbe l'agenda sotto le mani.
  if (!state.agendaGiorno || (state.agendaOggi && state.agendaOggi !== oggi && state.agendaGiorno === state.agendaOggi)) state.agendaGiorno = oggi;
  state.agendaOggi = oggi;
  const giorno = state.agendaGiorno;
  const filtroTipo = state.agendaTipo || '';
  const periodo = state.agendaPeriodo === 'settimana' ? 'settimana' : 'giorno';
  const passaTipo = (a) => !filtroTipo || a.tipoPrest === filtroTipo;
  const lista = (RF.agenda || []).filter(a => a.d === giorno && passaTipo(a)).sort((a, b) => a.start.localeCompare(b.start));
  const nomeDi = (a) => (a.p && P[a.p]) ? fullName(P[a.p]) : (a.nome || 'Paziente');
  // Le colonne sono di chi TIENE un'agenda, non di chi ha appuntamenti quel
  // giorno (16.9.2026): prima Moschovitis spariva il mercoledì perché non
  // aveva visite, e l'agenda cambiava forma da un giorno all'altro. Una
  // colonna vuota dice «nessun appuntamento» e resta al suo posto.
  const medici = [...new Set((RF.agenda || []).filter(a => a.doc && a.doc !== 'studio').map(a => a.doc))].sort((x, y) => (DOCTORS[x] || '').localeCompare(DOCTORS[y] || ''));
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
      <div class="actions"><div class="seg"><button class="${periodo === 'giorno' ? 'active' : ''}" onclick="state.agendaPeriodo='giorno';render()">Giorno</button><button class="${periodo === 'settimana' ? 'active' : ''}" onclick="state.agendaPeriodo='settimana';render()">Settimana</button></div><div class="seg"><button class="${!filtroTipo ? 'active' : ''}" onclick="state.agendaTipo='';render()">Tutto</button><button class="${filtroTipo === 'visita' ? 'active' : ''}" onclick="state.agendaTipo='visita';render()">Visite</button><button class="${filtroTipo === 'esame' ? 'active' : ''}" onclick="state.agendaTipo='esame';render()">Esami</button><button class="${filtroTipo === 'procedura' ? 'active' : ''}" onclick="state.agendaTipo='procedura';render()">Procedure</button></div>${rfTelefono() ? '' : `<div class="seg"><button class="${vista === 'medici' ? 'active' : ''}" onclick="state.agendaVista='medici';render()">Per medico</button><button class="${vista === 'sale' ? 'active' : ''}" onclick="state.agendaVista='sale';render()">Per sala</button></div>`}<div class="seg"><button onclick="state.agendaGiorno='${sposta(periodo === 'settimana' ? -7 : -1)}';render()">‹</button><button class="${giorno === oggi ? 'active' : ''}" onclick="state.agendaGiorno='${oggi}';render()">Oggi</button><button onclick="state.agendaGiorno='${sposta(periodo === 'settimana' ? 7 : 1)}';render()">›</button></div><input type="date" class="input sm" value="${giorno}" onchange="state.agendaGiorno=this.value;render()" style="max-width:160px">${rfTelefono() ? '' : `<button class="btn ai" data-ai="Preparazione della giornata">${ICONS.ai} Prepara la giornata</button>`}</div></div>
    ${avvisi.length ? `<div class="card mb-16" style="border-left:3px solid var(--danger)"><b>Più pazienti dei posti della sala</b>: ${avvisi.map(rfEsc).join(' · ')}. I posti si impostano in Studio → Sale.</div>` : ''}
    ${vista === 'sale' && cols.length && !risorse.some(r => r.tipo === 'sala') ? `<div class="caption mb-16">Nessuna sala registrata: le colonne sono i codici del campo «luogo» dell'agenda. In Studio → Sale si registrano le sale con i posti; in Medici agenda → Codici dell'agenda un codice diventa una sala.</div>` : ''}
    ${senza && vista === 'medici' ? `<div class="caption mb-16">Le colonne a destra della linea sono gli appuntamenti <b>non abbinati a un medico</b>, divisi per colore dell'agenda originale, cioè per tipo. I codici del luogo non abbinati sono ${[...new Set(lista.filter(a => !a.doc || a.doc === 'studio').map(a => a.room).filter(Boolean))].map(rfEsc).join(', ') || 'vuoti'}: si abbinano in Studio → Medici agenda → Codici dell'agenda, e allora tornano nella colonna del medico.</div>` : ''}
    ${lista.length ? (rfTelefono() ? rfAgendaListaHtml(lista, vista) : (() => {
      // Larghezza disponibile stimata: finestra meno barra laterale, margini e
      // colonna delle ore. Le colonne si dividono quello che resta, con un
      // minimo sotto il quale diventano illeggibili.
      const disponibile = Math.max(520, (typeof window !== 'undefined' ? window.innerWidth : 1440) - (state.sidebarCollapsed ? 72 : 240) - 28 - 52 - 24);
      const min = Math.max(104, Math.min(190, Math.floor(disponibile / Math.max(1, cols.length))));
      return `<div class="rf-cal-scorre"><div class="cal${min < 150 ? ' rf-fitta' : ''}" style="--cols:${cols.length};--cal-min:${min}px">`;
    })() + `
      <div class="cal-head"></div>${cols.map(c => `<div class="cal-head${String(c.k).startsWith('col:') ? ' rf-tipo' : ''}">${c.colore ? `<i class="dot" style="background:${rfEsc(c.colore)};margin-right:6px"></i>` : ''}${rfEsc(c.et)}</div>`).join('')}
      <div class="cal-times" style="--slots:${slots};--slot-h:${slotH}px">${times}</div>${cols.map(colHtml).join('')}
    </div></div>`) : `<div class="card"><div class="caption">Nessun appuntamento in agenda per questo giorno${Math.abs((d - new Date(`${oggi}T12:00:00`)) / 86400000) > 30 ? ' (la piattaforma carica ±30 giorni da oggi)' : ''}.</div></div>`}
    ${(() => { const c = {}; for (const a of lista) if (a.colore) c[a.colore] = (c[a.colore] || 0) + 1; const voci = Object.entries(c).sort((x, y) => y[1] - x[1]); return voci.length ? `<div class="row mt-16 caption wrap" style="gap:10px"><span>Colori dell'agenda originale:</span>${voci.map(([col, n]) => `<span class="status"><i class="dot" style="background:${rfEsc(col)}"></i>${n}</span>`).join('')}</div>` : ''; })()}
    <div class="row mt-16 caption wrap"><span class="status"><i class="dot accent"></i>Programmato</span><span class="status"><i class="dot success"></i>Completato</span><span class="status"><i class="dot warning"></i>In ritardo</span><span class="caption">Dal robot MediOnline, in sola lettura; si aggiorna ogni ora.</span></div>`;
};

/* ---------- avvio: dentro la piattaforma niente demo, mai ---------- */
function rfPaginaCarico() {
  // Se il primo caricamento fallisce (riavvio del server, un blip di rete, un
  // 500) prima si restava su «Carico…» per sempre: il ritentativo periodico
  // era dietro `RF.live`, che diventa vero solo dopo il primo successo.
  const c = document.getElementById('content');
  const err = RF.erroreCarico;
  if (c) c.innerHTML = `<div class="page"><div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2 class="page-title">ReferralFlow</h2>${err
    ? `<p class="meta">${rfEsc(err)}</p><div class="row mt-16" style="justify-content:center"><button class="btn primary" onclick="RF.erroreCarico=null;rfPaginaCarico();void rfCaricaDati()">Riprova</button></div>`
    : '<p class="meta">Carico i dati della piattaforma…</p>'}</div></div>`;
  const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
}
if (rfDentro()) {
  const rfRenderVero = render;
  render = function () {
    if (RF.nonAutorizzato) return rfPaginaAccesso();
    if (!RF.caricato) return rfPaginaCarico();
    if (state.route === 'ai') state.aiOpen = false;
    const out = rfRenderVero();
    // La pagina di Cleo scende in fondo SOLO se c'è una conversazione: col
    // benvenuto scendere significava saltare titolo e campo. E sul telefono
    // non si prende il fuoco da sola: la tastiera coprirebbe mezza pagina
    // appena si apre.
    const aip = document.getElementById('rf-aip-body');
    if (aip) {
      aip.scrollTop = state.aiMessages.length ? 1e6 : 0;
      const inp = document.getElementById('rf-aip-in');
      if (inp && !rfTelefono() && !document.activeElement?.closest('#modal')) setTimeout(() => inp.focus({ preventScroll: true }), 0);
    }
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
  // Anche quando il primo caricamento non è mai riuscito: se no chi ha aperto
  // la pagina nel momento sbagliato resta bloccato finché non ricarica a mano.
  setInterval(() => { if (RF.nonAutorizzato) return; if ((RF.live || RF.erroreCarico) && state.route !== 'review') void rfCaricaDati(); }, 120000);
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

/* ---------- Accoglienza: il tablet ---------- */
/* Il corpo dell'accoglienza: la lista di oggi con i tasti e la frase in
   italiano. Lo usano la pagina Accoglienza (per un tablet) e la Home, dove
   dal 16.9 sera sta al posto della colonna destra. */
function rfOrAccoglienzaCorpo(o, compatto) {
  const ingressi = new Map((o.ingressi || []).map(i => [i.id, i]));
  const pazienti = [...o.pazienti].sort((a, b) => a.teorica - b.teorica);
  const rit = (medico) => compatto ? rfOrRitardo(medico) : '';
  const righe = pazienti.map(p => {
    const i = ingressi.get(p.id);
    const fatto = ['dimesso', 'assente', 'annullato', 'visita_finita'].includes(p.stato);
    let sis = '';
    if (p.stato === 'atteso' || p.stato === 'arrivato' || p.stato === 'in_attesa') {
      if (i && i.azione === 'chiama') sis = `<b>Chiamare adesso</b> in ${rfEsc(i.sala)} con ${rfEsc(rfNomeCorto(i.medico || ''))}${rit(i.medico)}`;
      else if (i && i.azione === 'attendi') sis = `Resta in attesa: ${rfEsc(i.perche)}`;
      else if (p.sala && p.ingresso != null) sis = `Entra in <b>${rfEsc(p.sala)}</b> alle <b>${rfOrHm(p.ingresso)}</b>, con ${rfEsc(rfNomeCorto(p.medico || ''))}${rit(p.medico)}${p.inizio != null && p.inizio > p.teorica + 4 ? ` <span class="caption">— ${p.inizio - p.teorica} min dopo l'ora dell'agenda</span>` : ''}`;
      else sis = p.medico ? 'Nessuna stanza prevista: da sistemare' : 'Senza medico in agenda';
    } else if (p.sala) sis = `${rfEsc(p.sala)}${p.inizioReale != null ? ` dalle ${rfOrHm(p.inizioReale)}` : ''}`;
    const az = [];
    if (p.stato === 'atteso') { az.push(`<button class="btn sm primary" onclick="rfOrchEvento('paziente_arrivato',{appointment_id:'${p.id}'},'tablet')">Arrivato</button>`); az.push(`<button class="btn sm ghost" onclick="rfOrchEvento('paziente_assente',{appointment_id:'${p.id}'},'tablet')">Assente</button>`); }
    if (p.stato === 'arrivato') az.push(`<button class="btn sm" onclick="rfOrchEvento('paziente_accolto',{appointment_id:'${p.id}'},'tablet')">In attesa</button>`);
    if (['arrivato', 'in_attesa'].includes(p.stato) && p.sala) az.push(`<button class="btn sm ${i && i.azione === 'chiama' ? 'primary' : ''}" onclick="rfOrchEvento('paziente_chiamato',{appointment_id:'${p.id}',sala:'${rfEsc(p.sala)}'},'tablet')">Chiama</button>`);
    if (p.stato === 'chiamato') az.push(`<button class="btn sm ghost" onclick="rfOrchEvento('paziente_richiamato',{appointment_id:'${p.id}'},'tablet')" title="Torna in sala d'attesa: lo può fare solo una persona">Richiama</button>`);
    return `<div class="r${fatto ? ' fatto' : ''}${compatto ? ' compatta' : ''}"><span class="h">${rfOrHm(p.teorica)}</span><span><span class="n">${rfEsc(p.etichetta)}</span><br><span class="rf-or-pill ${rfEsc(p.stato)}">${rfEsc(rfOrStato(p.stato))}</span></span><span class="m">${rfEsc(p.prestazione || '—')}<br>${rfEsc(rfNomeCorto(p.medico || 'senza medico'))}${rfOrRitardo(p.medico)}</span><span class="sis">${sis}</span><span class="az">${az.join('')}</span></div>`;
  }).join('');
  const t = RF.orchTesto;
  const testo = `<div class="row" style="gap:8px"><input class="input" id="rf-or-testo" placeholder="Scrivi cosa succede: «la signora delle 10:30 arriva alle 11», «Rego è in ritardo di 15 minuti»" onkeydown="if(event.key==='Enter'){event.preventDefault();rfOrchTesto(this.value);}"><button class="btn" onclick="rfOrchTesto(document.getElementById('rf-or-testo').value)">Interpreta</button></div>
      ${t ? (t.attesa ? '<div class="caption" style="margin-top:8px">Leggo…</div>' : t.interpretazione ? `<div class="rf-or-msg ok" style="margin-top:8px">Ho capito: <b>${rfEsc(t.interpretazione.tipo)}</b>${t.interpretazione.etichetta ? ` · ${rfEsc(t.interpretazione.etichetta)}` : ''}${t.interpretazione.medico ? ` · ${rfEsc(t.interpretazione.medico)}` : ''}${t.interpretazione.stanza ? ` · ${rfEsc(t.interpretazione.stanza)}` : ''}${t.interpretazione.minuti != null ? ` · ${t.interpretazione.minuti} min` : ''}${t.interpretazione.nota ? ` · ${rfEsc(t.interpretazione.nota)}` : ''}
          ${(t.problemi || []).length ? `<br><span style="color:#a23b2a">${rfEsc(t.problemi.join(' · '))}</span>` : ''}
          <div class="row" style="gap:6px;margin-top:6px">${(t.problemi || []).length ? '' : `<button class="btn primary sm" onclick="rfOrchConfermaTesto()">Confermo</button>`}<button class="btn sm ghost" onclick="RF.orchTesto=null;render()">Annulla</button></div></div>`
        : `<div class="caption" style="margin-top:8px">${rfEsc(t.nota || t.errore || '')}</div>`) : ''}`;
  return { righe: righe || '<div class="caption">Nessun appuntamento oggi.</div>', testo };
}
PAGES.accoglienza = () => {
  if (!RF.live) return rfPaginaPiattaforma('Accoglienza', 'Arrivi e chiamate');
  const o = RF.orch;
  const testa = `<div class="page-head"><div><h2 class="page-title">Accoglienza</h2><div class="page-sub">Chi è arrivato, chi si chiama, e dove va</div></div></div>`;
  if (!o) return `${testa}<div class="card"><div class="caption">Carico…</div></div>`;
  const c = rfOrAccoglienzaCorpo(o, false);
  return `${testa}${rfOrMsg()}<div class="stack">
    <div class="card"><div class="card-head"><span class="section-title">Scrivi cosa succede</span></div>${c.testo}</div>
    <div class="card"><div class="rf-or-acc">${c.righe}</div></div></div>`;
};
async function rfOrchTesto(testo) {
  const t = String(testo || '').trim(); if (t.length < 4) return;
  RF.orchTesto = { attesa: true }; render();
  try { const r = await fetch('/api/orchestrazione/comandi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: t }) }); RF.orchTesto = await r.json().catch(() => ({ errore: 'Risposta non leggibile.' })); }
  catch { RF.orchTesto = { errore: 'La piattaforma non risponde.' }; }
  render();
}
async function rfOrchConfermaTesto() {
  const t = RF.orchTesto && RF.orchTesto.interpretazione; if (!t) return;
  RF.orchTesto = null;
  if (t.tipo === 'comando' && t.comando) { await rfOrchComando(t.comando, { appointment_id: t.appointment_id, sala: t.stanza, medico: t.medico, minuti: t.minuti }); return; }
  await rfOrchEvento(t.tipo, { appointment_id: t.appointment_id, sala: t.stanza || null, medico: t.medico || null, minuti: t.minuti, testo: t.nota || null }, 'cleo');
}

/* ---------- Stanza: i pulsanti ---------- */
PAGES.stanza = () => {
  if (!RF.live) return rfPaginaPiattaforma('Stanza', 'I tre tasti');
  const o = RF.orch;
  const testa = `<div class="page-head"><div><h2 class="page-title">Stanza</h2><div class="page-sub">Tre tasti: in preparazione, pronto, finito</div></div></div>`;
  if (!o) return `${testa}<div class="card"><div class="caption">Carico…</div></div>`;
  const nome = RF.stanzaScelta;
  const s = o.sale.find(x => x.nome === nome);
  const scelta = `<div class="rf-or-scelta">${o.sale.map(x => `<button class="btn ${x.nome === nome ? 'primary' : ''}" onclick="rfOrchScegliStanza('${rfEsc(x.nome)}')">${rfEsc(x.nome)}</button>`).join('')}</div>`;
  if (!s) return `${testa}<div class="card"><div class="caption" style="margin-bottom:10px">Quale stanza è questa?</div>${scelta}</div>`;
  const d = s.dentro[0];
  const p = d ? o.pazienti.find(x => x.id === d.id) : null;
  let dentro = '';
  if (!p) dentro = `<div class="chi">Nessuno</div><div class="cosa">${s.prossimo ? `Prossimo: ${rfEsc(s.prossimo.etichetta)} con ${rfEsc(rfNomeCorto(s.prossimo.medico || ''))}, entra alle ${rfOrHm(s.prossimo.ingresso)}` : 'Nessun ingresso previsto'}</div>`;
  else {
    const b = [];
    if (p.stato === 'chiamato') b.push(`<button class="btn primary" onclick="rfOrchEvento('preparazione_iniziata',{appointment_id:'${p.id}',sala:'${rfEsc(nome)}'},'stanza')">In preparazione</button>`);
    if (['chiamato', 'in_preparazione'].includes(p.stato)) b.push(`<button class="btn primary" onclick="rfOrchEvento('pronto',{appointment_id:'${p.id}',sala:'${rfEsc(nome)}'},'stanza')">Pronto</button>`);
    if (['chiamato', 'in_preparazione', 'pronto'].includes(p.stato)) b.push(`<button class="btn tutta" onclick="rfOrchEvento('visita_iniziata',{appointment_id:'${p.id}',sala:'${rfEsc(nome)}'},'stanza')">Il medico è entrato</button>`);
    if (p.stato === 'in_visita') b.push(`<button class="btn primary tutta" onclick="rfOrchEvento('visita_finita',{appointment_id:'${p.id}'},'stanza')">Finito</button>`);
    if (['in_visita', 'visita_finita'].includes(p.stato)) b.push(`<button class="btn tutta" onclick="rfOrchEvento('dimesso',{appointment_id:'${p.id}'},'stanza')">Il paziente è uscito</button>`);
    dentro = `<div class="chi">${rfEsc(p.etichetta)}</div><div class="cosa">${rfEsc(p.prestazione || '')} · ${rfEsc(rfNomeCorto(p.medico || 'senza medico'))} · <b>${rfEsc(rfOrStato(p.stato))}</b>${p.inizioReale != null ? ` dalle ${rfOrHm(p.inizioReale)}` : ''}</div><div class="grandi">${b.join('')}</div>
      ${s.prossimo ? `<div class="caption" style="margin-top:14px">Poi: ${rfEsc(s.prossimo.etichetta)} con ${rfEsc(rfNomeCorto(s.prossimo.medico || ''))}, alle ${rfOrHm(s.prossimo.ingresso)}</div>` : ''}`;
  }
  return `${testa}${rfOrMsg()}<div class="card rf-or-stanza"><div class="caption"><b>${rfEsc(nome)}</b> · <span class="rf-or-pill ${rfEsc(s.stato)}">${rfEsc(rfOrStato(s.stato))}</span> · <a href="#" onclick="event.preventDefault();rfOrchScegliStanza('')">cambia stanza</a></div>${dentro}</div>`;
};
function rfOrchScegliStanza(n) { RF.stanzaScelta = n; try { localStorage.setItem('rf-stanza', n); } catch {} render(); }

/* L'elenco dell'accoglienza resta in ordine d'ora, ma si apre dove siamo
   adesso: alle tre del pomeriggio nessuno vuole scorrere mezza mattinata di
   pazienti già usciti. Chi ha fatto la sua visita resta sopra, a portata di
   rotella. Si riposiziona solo quando cambia la persona in cima, così una
   ricarica ogni venti secondi non fa saltare la lista sotto le mani. */
// L'altezza della colonna di sinistra, copiata su quella dell'accoglienza.
// Solo quando le due colonne sono affiancate: sul telefono la griglia le
// impila e un tetto le renderebbe scomode.
function rfOrAltezzaAccoglienza() {
  const sx = document.querySelector('.rf-home-sx');
  const dx = document.querySelector('.rf-home-acc');
  if (!sx || !dx) return;
  if (Math.abs(sx.getBoundingClientRect().top - dx.getBoundingClientRect().top) > 4 || sx.offsetWidth === dx.offsetWidth) {
    dx.style.maxHeight = ''; return;
  }
  dx.style.maxHeight = `${sx.offsetHeight}px`;
  if (!RF.orAccOsserva && typeof ResizeObserver === 'function') {
    RF.orAccOsserva = new ResizeObserver(() => { try { rfOrAltezzaAccoglienza(); } catch { /* la prossima volta */ } });
    RF.orAccOsserva.observe(sx);
  }
}
function rfOrScorriAccoglienza() {
  const box = document.querySelector('.rf-or-acc.scorre');
  if (!box) { RF.orAccAncora = null; return; }
  const righe = [...box.querySelectorAll('.r')];
  const i = righe.findIndex(r => !r.classList.contains('fatto'));
  if (i <= 0) return;
  const ancora = righe[i].textContent.slice(0, 40);
  if (RF.orAccAncora === ancora) return;
  RF.orAccAncora = ancora;
  box.scrollTop = Math.max(0, righe[i].offsetTop - box.offsetTop - 8);
}

/* Il caricamento e il battito seguono la pagina. */
window.addEventListener('resize', () => { try { rfOrAltezzaAccoglienza(); } catch { /* idem */ } });
(function () {
  const r = render;
  render = function () { const out = r.apply(this, arguments); try { rfOrchSincronizza(); rfOrAltezzaAccoglienza(); rfOrScorriAccoglienza(); rfVDopoRender(); } catch {} return out; };
})();

/* =====================================================================
   «Visite» (16.9.2026 sera, seconda versione — dal progetto approvato).
   La pagina che il medico apre fra un paziente e l'altro. Tre cose sole:
   chi è arrivato ed è in sala d'attesa, un tasto per entrare nella visita,
   e dentro il minimo che serve mentre il paziente è seduto davanti.
   Le regole che la tengono onesta:
   - si vedono SOLO i propri pazienti, e solo quelli in sala d'attesa;
   - due tocchi in tutta la visita: «inizia» e «termina»;
   - nessun cronometro: l'ora d'inizio e di fine si registrano, ma chi è
     nella stanza non deve sentirsi cronometrato;
   - il nome del paziente non esce mai dallo schermo: il rischio di questa
     pagina non è la lentezza, è lavorare sulla cartella sbagliata;
   - la cartella sta in pannelli chiusi, uno aperto per volta: una cartella
     con trecento documenti è alta come una con tre.
   ===================================================================== */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-v { max-width:720px; margin:0 auto; padding:8px 0 40px; }
.rf-v-titolo { font-size:29px; font-weight:640; letter-spacing:-.024em; margin:0; }
.rf-v-sotto { color:var(--text-3); font-size:13.5px; margin-top:6px; }
.rf-v-sotto a { color:var(--accent); }
.rf-v-elenco { margin-top:24px; border-top:1px solid var(--border); }
.rf-v-riga { display:grid; grid-template-columns:56px minmax(0,1fr) auto auto; align-items:center; gap:18px; padding:15px 4px; border-bottom:1px solid var(--border); }
.rf-v-riga .ora { font-size:14.5px; font-variant-numeric:tabular-nums; color:var(--text-2); font-weight:600; }
.rf-v-riga .nome { font-size:17px; font-weight:600; letter-spacing:-.011em; }
.rf-v-riga .motivo { font-size:13.5px; color:var(--text-3); margin-top:2px; }
.rf-v-riga .meta { text-align:right; font-size:12.5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-v-stato { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); }
.rf-v-pallino { width:7px; height:7px; border-radius:50%; background:var(--accent); flex:none; }
.rf-v-pallino.lento { background:var(--warning); }
.rf-v-riga .btn { white-space:nowrap; }
.rf-v-vuoto { max-width:460px; margin:0 auto; padding:72px 16px; text-align:center; }
.rf-v-vuoto .segno { width:46px; height:46px; margin:0 auto 18px; border-radius:50%; border:1.5px solid var(--border-2); display:grid; place-items:center; color:var(--text-3); }
.rf-v-vuoto .segno svg { width:20px; height:20px; }
.rf-v-vuoto h2 { font-size:20px; font-weight:600; letter-spacing:-.015em; margin:0; }
.rf-v-vuoto p { color:var(--text-3); font-size:14px; margin:8px 0 0; line-height:1.5; }
.rf-v-vuoto .dopo { margin-top:24px; padding-top:18px; border-top:1px solid var(--border); font-size:13px; color:var(--text-2); }

/* la visita: parte clinica a sinistra, assistente a destra */
.rf-v-schermo { display:grid; grid-template-columns:minmax(0,1fr) var(--rf-v-largh, 360px); gap:0; align-items:stretch; height:100%; }
.rf-v-clinico { min-width:0; overflow:auto; height:100%; padding:0 28px 56px; }
.rf-v-testa { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:14px; flex-wrap:wrap;
  padding:14px 0 13px; margin-bottom:18px; border-bottom:1px solid var(--border); background:var(--bg); }
#app.visita-larga .content { padding:0; overflow:hidden; }
#app.visita-larga .content > .page { max-width:none; height:100%; animation:none; padding:0; }
#app.visita-larga .ai-panel { display:none; }
#app.visita-larga.with-ai { grid-template-columns: var(--sidebar-w) 1fr; }
#app.visita-larga.with-ai.sidebar-collapsed { grid-template-columns: var(--sidebar-c) 1fr; }
.rf-v-testa .chi { min-width:0; }
.rf-v-testa .chi h2 { font-size:19px; font-weight:640; letter-spacing:-.016em; margin:0; }
.rf-v-testa .chi .r { font-size:12.5px; color:var(--text-3); margin-top:2px; }
.rf-v-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:var(--accent-soft); color:var(--accent); font-size:11.5px; font-weight:600; flex:none; }
.rf-v-allergia { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:var(--warning-soft); color:var(--warning); font-size:11.5px; font-weight:600; flex:none; }
.rf-v-spinta { margin-left:auto; padding-left:28px; flex:none; }
.rf-v-sez { font-size:11px; font-weight:640; letter-spacing:.085em; text-transform:uppercase; color:var(--text-3); margin:0 0 10px; }
.rf-v-brief { border:1px solid var(--border); border-radius:var(--r-card); background:var(--surface-2); padding:2px 16px; }
.rf-v-voce { display:grid; grid-template-columns:150px minmax(0,1fr); gap:16px; padding:11px 0; border-top:1px solid var(--border); font-size:14px; line-height:1.5; }
.rf-v-voce:first-child { border-top:0; }
.rf-v-voce .e { color:var(--text-3); font-size:12.5px; padding-top:1px; }
.rf-v-fonte { font-size:11.5px; color:var(--text-3); margin-top:9px; }
.rf-v-cart { margin-top:30px; border-top:1px solid var(--border); }
.rf-v-pan { border-bottom:1px solid var(--border); }
.rf-v-pan > button { width:100%; display:flex; align-items:center; gap:12px; padding:13px 4px; background:none; border:0; cursor:pointer; text-align:left; font:inherit; color:inherit; }
.rf-v-pan .t { font-size:14.5px; font-weight:550; letter-spacing:-.008em; }
.rf-v-pan > button:hover .t { color:var(--accent); }
.rf-v-pan .n { margin-left:auto; font-size:12.5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-v-pan .fr { color:var(--text-3); display:inline-flex; flex:none; transition:transform .22s var(--ease); }
.rf-v-pan.aperto .fr { transform:rotate(90deg); }
.rf-v-pan .corpo { display:none; padding:0 4px 16px; }
.rf-v-pan.aperto .corpo { display:block; }
.rf-v-pan .corpo ul { list-style:none; margin:0; padding:0; }
.rf-v-pan .corpo li { display:grid; grid-template-columns:96px minmax(0,1fr); gap:14px; padding:8px 0; border-top:1px solid var(--border); font-size:13.5px; }
.rf-v-pan .corpo li:first-child { border-top:0; }
.rf-v-pan .corpo li .d { color:var(--text-3); font-size:12.5px; font-variant-numeric:tabular-nums; }
.rf-v-pan .corpo a { color:var(--accent); }
.rf-v-pan .tutti { margin-top:10px; font-size:13px; color:var(--accent); background:none; border:0; padding:0; cursor:pointer; font-weight:550; }

/* l'assistente, colonna sua */
.rf-v-lato { position:relative; height:100%; min-height:0; display:flex; flex-direction:column; border-left:1px solid var(--border); background:var(--surface-2); }
.rf-v-lato .rf-gpt-col { max-width:none; padding:0 14px; }
.rf-v-lato .rf-gpt-thread { gap:18px; padding:16px 0 8px; }
.rf-v-lato .rf-gpt-foot { padding:8px 0 14px; }
.rf-v-lato .rf-gpt-comp { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:10px 10px 9px 16px; border-radius:18px; }
.rf-v-lato .rf-gpt-comp input { grid-column:1 / -1; height:30px; font-size:14px; }
.rf-v-lato .rf-gpt-nota { font-size:10.5px; margin-top:8px; }
.rf-v-lato .ai-msg { font-size:13.5px; }
.rf-v-benv { padding:18px 0 8px; }
.rf-v-benv p { margin:0; font-size:13.5px; line-height:1.55; color:var(--text-2); }
.rf-v-spunti { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.rf-v-spunti button { border:1px solid var(--border-2); background:var(--surface); border-radius:999px; padding:5px 11px; font:inherit; font-size:12px; color:var(--text-2); cursor:pointer; }
.rf-v-spunti button:hover { border-color:var(--accent); color:var(--accent); }
.rf-v-maniglia { position:absolute; left:-3px; top:0; bottom:0; width:7px; cursor:col-resize; z-index:6; }
.rf-v-maniglia::after { content:""; position:absolute; left:3px; top:0; bottom:0; width:1px; background:transparent; transition:background .15s var(--ease); }
.rf-v-maniglia:hover::after, .rf-v-maniglia.presa::after { background:var(--accent); }
.rf-v-lato-t { display:flex; align-items:center; gap:9px; padding:12px 14px; border-bottom:1px solid var(--border); flex:none; }
.rf-v-lato-t .n { font-size:13.5px; font-weight:600; }
.rf-v-lato-t svg { width:15px; height:15px; }
.rf-v-icona { margin-left:auto; width:28px; height:28px; border:0; background:none; border-radius:7px; display:grid; place-items:center; color:var(--text-3); cursor:pointer; }
.rf-v-icona:hover { background:var(--border); color:var(--text); }
.rf-v-rail { position:relative; height:100%; width:46px; border-left:1px solid var(--border); background:var(--surface-2); display:flex; flex-direction:column; align-items:center; padding-top:12px; }
.rf-v-rail button { width:30px; height:30px; border:0; background:none; border-radius:8px; display:grid; place-items:center; color:var(--accent); cursor:pointer; }
.rf-v-rail button:hover { background:var(--accent-soft); }
.rf-v-rail svg { width:16px; height:16px; }

.rf-v-velo { position:fixed; inset:0; background:rgba(20,28,24,.32); display:grid; place-items:center; z-index:60; }
.rf-v-sheet { width:330px; background:var(--surface); border-radius:var(--r-modal); box-shadow:var(--shadow-2); padding:22px 22px 16px; text-align:center; }
.rf-v-sheet h3 { font-size:16px; font-weight:600; margin:0; letter-spacing:-.01em; }
.rf-v-sheet p { font-size:13px; color:var(--text-3); margin:8px 0 18px; }
.rf-v-sheet .righe { display:flex; gap:8px; }
.rf-v-sheet .righe .btn { flex:1 1 0; justify-content:center; }
@media (max-width:980px) {
  .rf-v-schermo { grid-template-columns:minmax(0,1fr); }
  .rf-v-clinico { padding-right:0; }
  .rf-v-schermo { height:auto; }
  .rf-v-clinico { height:auto; overflow:visible; padding:0 16px 32px; }
  .rf-v-lato, .rf-v-rail { height:auto; border-left:0; border-top:1px solid var(--border); width:auto; }
  .rf-v-lato .rf-gpt-scroll { max-height:340px; }
  #app.visita-larga .content { overflow:auto; }
  .rf-v-maniglia { display:none; }
  .rf-v-riga { grid-template-columns:50px minmax(0,1fr); row-gap:10px; }
  .rf-v-riga .meta { grid-column:1 / -1; text-align:left; }
  .rf-v-riga .btn { grid-column:1 / -1; }
}
`; document.head.appendChild(st); })();

if (typeof NAV_META !== 'undefined') NAV_META.visite = ['Visite', 'visits'];
RF.vSel = null; RF.vAperto = null; RF.vConferma = false;
try { RF.vIo = localStorage.getItem('rf-medico') || ''; } catch { RF.vIo = ''; }
try { RF.vLatoChiuso = localStorage.getItem('rf-v-lato') === 'chiuso'; } catch { RF.vLatoChiuso = false; }
try { RF.vLargh = Math.min(520, Math.max(300, Number(localStorage.getItem('rf-v-largh')) || 360)); } catch { RF.vLargh = 360; }

const RF_V_IN_ATTESA = ['arrivato', 'in_attesa'];
const rfVFreccia = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const rfVOrologio = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.4"/><path d="M12 7.6V12l3 1.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

/* Chi sta guardando. Lo dice il server quando l'utente è collegato a un
   medico (`providers.user_id`); finché in studio entrano tutti con lo stesso
   account lo si sceglie una volta e resta su questo dispositivo. È una
   toppa, e si vede che è una toppa: quando ci saranno account veri sparisce
   da sola. */
function rfVChi() { const o = RF.orch; return (o && o.io) || RF.vIo || ''; }
function rfVIoScegli(nome) { RF.vIo = nome; try { localStorage.setItem('rf-medico', nome); } catch {} RF.vSel = null; render(); }
function rfVMiei() {
  const o = RF.orch; if (!o) return [];
  const io = rfVChi(); if (!io) return [];
  if (io === '*') return o.pazienti;
  return o.pazienti.filter((p) => rfNomeNudo(p.medico || '').toLowerCase() === rfNomeNudo(io).toLowerCase());
}
function rfVInAttesa() { return rfVMiei().filter((p) => RF_V_IN_ATTESA.includes(p.stato)).sort((a, b) => a.teorica - b.teorica); }
function rfVInVisita() { return rfVMiei().find((p) => p.stato === 'in_visita') || null; }
function rfVAgenda(sel) { return (RF.agenda || []).find((a) => a.id === sel.id) || null; }
function rfVCartella(sel) { const a = rfVAgenda(sel); const pid = a && a.p && rfUuid(a.p) ? a.p : null; return { pid, p: pid ? P[pid] : null, a }; }

/* ---------- elenco: chi è in sala d'attesa ---------- */
function rfVRiga(p, primo) {
  const o = RF.orch;
  const aspetta = (o && p.arrivo != null) ? Math.max(0, o.adesso - p.arrivo) : null;
  const tardi = aspetta != null && aspetta >= 20;
  return `<div class="rf-v-riga">
    <div class="ora">${rfOrHm(p.teorica)}</div>
    <div>
      <div class="nome">${rfEsc(p.etichetta)}</div>
      <div class="motivo">${rfEsc(p.prestazione || 'prestazione non riconosciuta')}</div>
    </div>
    <div class="meta">
      <div class="rf-v-stato"><span class="rf-v-pallino${tardi ? ' lento' : ''}"></span>In sala d&rsquo;attesa</div>
      <div style="margin-top:3px">${p.arrivo != null ? `arrivo ${rfOrHm(p.arrivo)}${tardi ? ` · da ${aspetta} min` : ''}` : 'arrivo non segnato'}</div>
    </div>
    <button class="btn${primo ? ' primary' : ''}" onclick="rfVInizia('${rfEsc(p.id)}')">Inizia visita</button>
  </div>`;
}
function rfVElenco() {
  const io = rfVChi();
  const lista = rfVInAttesa();
  const cambia = (RF.orch && RF.orch.io) ? '' : ` · <a href="#" onclick="event.preventDefault();rfVIoScegli('')">cambia</a>`;
  const testa = `<h1 class="rf-v-titolo">Visite</h1>
    <div class="rf-v-sotto">${io === '*' ? 'Tutti i pazienti in sala d&rsquo;attesa' : `Pazienti di <b>${rfEsc(rfNomeNudo(io))}</b> in sala d&rsquo;attesa`}${lista.length ? ` · ${lista.length}` : ''}${cambia}</div>`;
  if (!lista.length) {
    const dopo = rfVMiei().filter((p) => p.stato === 'atteso').sort((a, b) => a.teorica - b.teorica)[0];
    return `<div class="rf-v">${testa}
      <div class="rf-v-vuoto">
        <div class="segno">${rfVOrologio}</div>
        <h2>Nessuno in sala d&rsquo;attesa</h2>
        <p>I tuoi pazienti compaiono qui appena la segreteria li segna come arrivati.</p>
        ${dopo ? `<div class="dopo">Prossimo appuntamento: <b>${rfOrHm(dopo.teorica)}</b> · ${rfEsc(dopo.etichetta)}${dopo.prestazione ? ` · ${rfEsc(dopo.prestazione)}` : ''}</div>` : ''}
      </div></div>`;
  }
  return `<div class="rf-v">${testa}
    <div class="rf-v-elenco">${lista.map((p, i) => rfVRiga(p, i === 0)).join('')}</div></div>`;
}

/* ---------- inizio e fine ---------- */
async function rfVInizia(id) {
  const p = rfVMiei().find((x) => x.id === id);
  RF.vSel = id; RF.vAperto = null;
  const c = p ? rfVCartella(p) : { pid: null };
  if (c.pid) state.patientCtx = c.pid;
  await rfOrchEvento('visita_iniziata', { appointment_id: id, ...(p && p.sala ? { sala: p.sala } : {}) }, 'ui');
}
function rfVTerminaChiedi() { RF.vConferma = true; render(); }
function rfVAnnulla() { RF.vConferma = false; render(); }
async function rfVTermina(id) {
  RF.vConferma = false; RF.vSel = null;
  await rfOrchEvento('visita_finita', { appointment_id: id }, 'ui');
}

/* ---------- il briefing: sei righe, sempre le stesse, tutte da dati ----------
   Nessun modello: qui il codice legge la cartella e mette in fila quel che
   c'è. Una riga senza contenuto sparisce, non resta vuota. */
function rfVBriefing(sel, p) {
  const r = [];
  const oggi = `<b>${rfEsc(sel.prestazione || 'prestazione non riconosciuta')}</b> alle ${rfOrHm(sel.teorica)}${sel.sala ? ` · ${rfEsc(sel.sala)}` : ''}`;
  r.push(['Oggi', oggi]);
  if (p && p.indicazione) r.push(['Perché è qui', rfEsc(p.indicazione)]);
  const aperte = p ? (p.referrals || []).filter((x) => x.status !== 'chiusa') : [];
  if (aperte.length) r.push(['Chi l&rsquo;ha mandato', `${rfEsc(aperte[0].medico || 'invio senza medico')}${aperte[0].quesito ? ` — <b>«${rfEsc(aperte[0].quesito)}»</b>` : ''}${aperte[0].urgenza === 'urgente' ? ' · <b>urgente</b>' : ''}`]);
  else if (p && p.gp) r.push(['Medico curante', rfEsc(p.gp)]);
  const referti = p ? (typeof REPORTS !== 'undefined' ? REPORTS : []).filter((x) => x.p === p.id).sort((a, b) => rfDataOrd(b.date).localeCompare(rfDataOrd(a.date))) : [];
  if (referti.length) r.push(['Ultimo contatto', `${rfEsc(referti[0].type)} del ${rfEsc(referti[0].date)} · ${referti[0].status === 'APPROVED' ? 'confermato' : '<b>da controllare</b>'}`]);
  else if (p && p.lastVisit) r.push(['Ultimo contatto', `visita del ${rfEsc(p.lastVisit)}`]);
  if (p && (p.terapia || []).length) r.push(['Terapia in corso', `${p.terapia.map(rfEsc).join(' · ')}${p.terapiaDa ? ` <span class="caption">dal referto del ${rfEsc(p.terapiaDa)}</span>` : ''}`]);
  const problemi = p ? (p.problems || []).filter((x) => x.s !== 'resolved').slice(0, 3) : [];
  if (problemi.length) r.push(['Già noto', problemi.map((x) => rfEsc(x.l)).join(' · ')]);
  return r;
}

/* ---------- la cartella, a pannelli chiusi ---------- */
function rfVPannelli(p) {
  if (!p) return [];
  const R = (typeof REPORTS !== 'undefined' ? REPORTS : []).filter((x) => x.p === p.id).sort((a, b) => rfDataOrd(b.date).localeCompare(rfDataOrd(a.date)));
  const allerg = (p.fatti || []).filter((f) => /allerg|intoller/i.test(f.relazione || ''));
  const altri = (p.fatti || []).filter((f) => !/allerg|intoller/i.test(f.relazione || ''));
  const visite = (p.visits || []).filter((v) => v.fatta).sort((a, b) => rfDataOrd(b.d).localeCompare(rfDataOrd(a.d)));
  return [
    ['Terapia', (p.terapia || []).map((t) => ({ d: p.terapiaDa || '', v: rfEsc(t) }))],
    ['Problemi e quesiti', (p.problems || []).map((x) => ({ d: x.since || '', v: `${rfEsc(x.l)}${x.s === 'resolved' ? ' <span class="caption">chiuso</span>' : ''}` }))],
    ['Visite precedenti', visite.map((v) => ({ d: v.d, v: `${rfEsc(v.motivo || 'visita')}${v.medico ? ` · ${rfEsc(rfNomeCorto(v.medico))}` : ''}` }))],
    ['Esami', (p.exams || []).map((e) => ({ d: e.d, v: `<a href="/api/documents/${rfEsc(e.id)}" target="_blank" rel="noopener">${rfEsc(e.r)}</a>` }))],
    ['Documenti', (p.docs || []).map((d) => ({ d: d.d, v: `<a href="/api/documents/${rfEsc(d.id)}" target="_blank" rel="noopener">${rfEsc(d.t)}</a>${d.new ? ' <span class="caption">nuovo</span>' : ''}` }))],
    ['Referti', R.map((x) => ({ d: x.date, v: `<a href="#/review/${rfEsc(x.id)}">${rfEsc(x.type)}</a> <span class="caption">${x.status === 'APPROVED' ? 'confermato' : 'da controllare'}</span>` }))],
    ['Referral', (p.referrals || []).map((x) => ({ d: x.at || '', v: `${rfEsc(x.quesito || 'senza quesito')}${x.medico ? ` · ${rfEsc(x.medico)}` : ''}` }))],
    ['Allergie', allerg.map((f) => ({ d: '', v: rfEsc(f.oggetto) }))],
    ['Altri fatti', altri.map((f) => ({ d: f.data || '', v: `${rfEsc(f.oggetto)} <span class="caption">${rfEsc((f.relazione || '').replace(/_/g, ' '))}</span>` }))],
  ].filter((x) => x[1].length);
}
function rfVPannello(i) { RF.vAperto = RF.vAperto === i ? null : i; render(); }
function rfVPannelliHtml(p, pid) {
  const pan = rfVPannelli(p);
  if (!pan.length) return `<div class="caption" style="padding:12px 4px;line-height:1.5">Questo paziente è in agenda ma non ha una cartella in ReferralFlow: terapia, referti e documenti compaiono qui quando ce l&rsquo;ha.</div>`;
  return pan.map(([t, righe], i) => `<div class="rf-v-pan${RF.vAperto === i ? ' aperto' : ''}">
    <button type="button" onclick="rfVPannello(${i})" aria-expanded="${RF.vAperto === i}">
      <span class="fr">${rfVFreccia}</span><span class="t">${rfEsc(t)}</span><span class="n">${righe.length}</span></button>
    <div class="corpo">
      <ul>${righe.slice(0, 5).map((x) => `<li><span class="d">${rfEsc(x.d || '')}</span><span>${x.v}</span></li>`).join('')}</ul>
      ${righe.length > 5 && pid ? `<button class="tutti" data-go="#/patients/${rfEsc(pid)}">Vedi tutti (${righe.length}) nella cartella</button>` : ''}
    </div></div>`).join('');
}

/* ---------- l'assistente: la stessa Cleo della sua pagina ----------
   Non una chat scritta a parte, ma i pezzi veri della pagina di Cleo montati
   in colonna: stesso filo (`state.aiMessages`, quindi la conversazione è una
   sola ovunque), stesso campo con i due modi — «Domanda medica» e «Con la
   cartella» — e le stesse note sotto. Una seconda chat che somigliava alla
   prima ma non ne aveva i tasti era peggio che non averla. */
function rfVLato(chiuso) { RF.vLatoChiuso = chiuso; try { localStorage.setItem('rf-v-lato', chiuso ? 'chiuso' : 'aperto'); } catch {} render(); }
function rfVDopoRender() {
  // Il filo resta in fondo, dove c'è l'ultima risposta.
  const f = document.getElementById('rf-v-filo'); if (f) f.scrollTop = f.scrollHeight;
}
function rfVLatoHtml(sel, pid) {
  if (RF.vLatoChiuso) return `<div class="rf-v-rail"><button type="button" onclick="rfVLato(false)" title="Apri ${rfEsc(RF_AI_NOME)}" aria-label="Apri l&rsquo;assistente">${ICONS.ai}</button></div>`;
  const vuota = !state.aiMessages.length;
  const nome = String(sel.etichetta || '').split(' ')[0] || 'questo paziente';
  const spunti = pid
    ? ['Briefing pre-visita', 'Cosa è cambiato dall\u2019ultima visita?', 'Quali esami ha in cartella?']
    : ['Chi ho in sala d\u2019attesa?', 'Come va la giornata?'];
  const benvenuto = `<div class="rf-v-benv">
      <p>Sono qui su <b>${rfEsc(sel.etichetta)}</b>. ${pid ? 'Posso cercare un documento, riassumere un referto o dire che cosa è cambiato dall&rsquo;ultima volta.' : `Di ${rfEsc(nome)} c&rsquo;è solo l&rsquo;appuntamento, non la cartella: posso rispondere sulla giornata.`}</p>
      <div class="rf-v-spunti">${spunti.map((x) => `<button type="button" data-ai="${rfEsc(x)}">${rfEsc(x)}</button>`).join('')}</div>
    </div>`;
  return `<aside class="rf-v-lato">
    <div class="rf-v-maniglia" id="rf-v-maniglia" title="Trascina per ridimensionare"></div>
    <div class="rf-v-lato-t">${rfSegnoCleo()}<span class="n">${rfEsc(RF_AI_NOME)}</span>
      ${vuota ? '' : `<button class="rf-v-icona" onclick="state.aiMessages=[];render()" title="Nuova conversazione" aria-label="Nuova conversazione">${ICONS.x}</button>`}
      <button class="rf-v-icona" onclick="rfVLato(true)" title="Chiudi l&rsquo;assistente" aria-label="Chiudi l&rsquo;assistente">${rfVFreccia}</button></div>
    <div class="rf-gpt-scroll" id="rf-v-filo">
      <div class="rf-gpt-col">${vuota ? benvenuto : `<div class="rf-gpt-thread">${state.aiMessages.map((m) => m.html).join('')}</div>`}</div>
    </div>
    <div class="rf-gpt-foot"><div class="rf-gpt-col">${rfMedicaRiquadro()}${rfCartellaRiquadro()}${rfAiCampo()}${rfAiNota()}</div></div>
  </aside>`;
}

/* La maniglia: si trascina il bordo dell'assistente come una finestra. */
document.addEventListener('pointerdown', (e) => {
  const m = e.target && e.target.closest ? e.target.closest('#rf-v-maniglia') : null;
  if (!m) return;
  m.classList.add('presa');
  const muovi = (ev) => {
    const c = document.querySelector('.rf-v-schermo'); if (!c) return;
    const largh = Math.min(520, Math.max(300, c.getBoundingClientRect().right - ev.clientX));
    RF.vLargh = largh;
    document.documentElement.style.setProperty('--rf-v-largh', `${largh}px`);
  };
  const su = () => { m.classList.remove('presa'); try { localStorage.setItem('rf-v-largh', String(RF.vLargh)); } catch {} document.removeEventListener('pointermove', muovi); document.removeEventListener('pointerup', su); };
  document.addEventListener('pointermove', muovi);
  document.addEventListener('pointerup', su);
});

/* ---------- la visita ---------- */
function rfVAperta() {
  // Quella aperta a mano, oppure la visita che è già in corso: riaprendo la
  // pagina il medico deve ritrovarsi dov'era, non davanti a un elenco.
  const inCorso = rfVInVisita();
  if (RF.vSel) { const s = rfVMiei().find((x) => x.id === RF.vSel); if (s) return s; }
  return inCorso;
}
function rfVVisita(sel) {
  const { pid, p, a } = rfVCartella(sel);
  const allerg = p ? (p.fatti || []).filter((f) => /allerg|intoller/i.test(f.relazione || '')) : [];
  const brief = rfVBriefing(sel, p);
  const nato = (a && a.nascita) || (p && p.dob) || '';
  const eta = p && p.age ? `${p.age} anni` : '';
  return `<div class="rf-v-schermo" style="--rf-v-largh:${RF.vLargh}px">
    <div class="rf-v-clinico">
      <div class="rf-v-testa">
        <div class="chi">
          <h2>${rfEsc(sel.etichetta)}</h2>
          <div class="r">${[eta, nato, sel.prestazione].filter(Boolean).map(rfEsc).join(' · ')}</div>
        </div>
        ${sel.stato === 'in_visita' ? '<span class="rf-v-badge"><span class="rf-v-pallino"></span>Visita in corso</span>' : `<span class="rf-v-badge">${rfEsc(rfOrStato(sel.stato))}</span>`}
        ${allerg.length ? `<span class="rf-v-allergia">Allergie · ${allerg.map((f) => rfEsc(f.oggetto)).join(', ')}</span>` : ''}
        <span class="rf-v-spinta">${sel.stato === 'in_visita'
          ? `<button class="btn" onclick="rfVTerminaChiedi()">Termina visita</button>`
          : `<button class="btn" onclick="rfVChiudi()">Torna all&rsquo;elenco</button>`}</span>
      </div>
      <h3 class="rf-v-sez">Briefing visita</h3>
      <div class="rf-v-brief">${brief.map(([e, v]) => `<div class="rf-v-voce"><div class="e">${e}</div><div class="v">${v}</div></div>`).join('')}</div>
      <div class="rf-v-fonte">Dall&rsquo;agenda di oggi, dalla referral del curante e dall&rsquo;ultimo referto in cartella.</div>
      <h3 class="rf-v-sez" style="margin-top:30px">Cartella${pid ? ` · <a href="#" data-go="#/patients/${rfEsc(pid)}" style="text-transform:none;letter-spacing:0;font-weight:400">apri quella intera</a>` : ''}</h3>
      <div class="rf-v-cart">${rfVPannelliHtml(p, pid)}</div>
    </div>
    ${rfVLatoHtml(sel, pid)}
  </div>
  ${RF.vConferma ? `<div class="rf-v-velo" onclick="if(event.target===this)rfVAnnulla()"><div class="rf-v-sheet" role="dialog" aria-modal="true">
      <h3>Terminare la visita?</h3>
      <p>${rfEsc(sel.etichetta)}${sel.prestazione ? ` · ${rfEsc(sel.prestazione)}` : ''}</p>
      <div class="righe"><button class="btn" onclick="rfVAnnulla()">Annulla</button><button class="btn primary" onclick="rfVTermina('${rfEsc(sel.id)}')">Termina</button></div>
    </div></div>` : ''}`;
}
function rfVChiudi() { RF.vSel = null; RF.vConferma = false; render(); }

PAGES.visite = () => {
  if (!RF.live) return rfPaginaPiattaforma('Visite', 'I tuoi pazienti in sala d’attesa');
  if (!RF.orch) return `<div class="page-head"><div><h2 class="page-title">Visite</h2></div></div><div class="card"><p class="meta" style="margin:0">Leggo la giornata…</p></div>`;
  const io = rfVChi();
  if (!io) {
    // Senza account veri la pagina non sa di chi sono i pazienti: lo chiede
    // una volta, con poche parole, e non lo chiede mai più.
    const medici = [...new Set((RF.orch.pazienti || []).map((x) => x.medico).filter(Boolean))].sort((a, b) => rfNomeCorto(a).localeCompare(rfNomeCorto(b)));
    return `<div class="rf-v">
      <h1 class="rf-v-titolo">Visite</h1>
      <div class="rf-v-sotto">La pagina mostra i <b>tuoi</b> pazienti in sala d&rsquo;attesa. Chi sei? La scelta resta su questo dispositivo.</div>
      <div class="rf-or-scelta" style="margin-top:20px">${medici.map((m) => `<button class="btn" onclick="rfVIoScegli('${rfEsc(m)}')">${rfEsc(rfNomeNudo(m))}</button>`).join('') || '<span class="caption">Nessun medico con appuntamenti oggi.</span>'}</div>
      <div class="row mt-16"><button class="btn sm ghost" onclick="rfVIoScegli('*')">Mostrami tutti</button></div>
    </div>`;
  }
  const sel = rfVAperta();
  // `onRoute` azzera il contesto paziente a ogni cambio di rotta, e «visite»
  // non è fra le rotte che lo tengono: ricaricando con la visita aperta, la
  // colonna clinica mostrava il paziente giusto ma Cleo non sapeva di chi si
  // stesse parlando. Qui glielo si rimette.
  if (sel) { const c = rfVCartella(sel); if (c.pid) state.patientCtx = c.pid; }
  return `${rfOrMsg()}${sel ? rfVVisita(sel) : rfVElenco()}`;
};

/* =====================================================================
   Il telefono (16.9.2026 sera).
   L'interfaccia è nata su uno schermo grande e sul telefono si vedeva:
   tabelle larghe il doppio dello schermo che scorrevano di lato, il
   calendario del giorno con cinque colonne da cento pixel e i nomi
   tagliati a metà, le barre dei filtri alte quattro righe, le pastiglie
   di stato che uscivano dalla loro scheda.
   Qui sotto: le tabelle diventano schede (una riga = una scheda, con le
   etichette prese dall'intestazione), l'agenda del giorno diventa una
   lista in ordine d'ora, i filtri stanno su una riga che scorre, e
   niente esce più dallo schermo.
   Soglia: 640 px — un telefono in verticale. Sul tablet resta tutto
   com'era.
   ===================================================================== */
const rfTelefono = () => (typeof window !== 'undefined' ? window.innerWidth : 1440) <= 640;

/* Le tabelle: l'intestazione sparisce e ogni cella si porta dietro il suo
   nome. L'attributo si mette dopo il disegno, così vale per tutte le
   tabelle — anche quelle che verranno. */
function rfTabelleTelefono() {
  const c = document.getElementById('content');
  if (!c) return;
  const tel = rfTelefono();
  c.querySelectorAll('table').forEach((t) => {
    t.classList.toggle('rf-tab-schede', tel);
    if (!tel) return;
    const teste = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!teste.length) return;
    t.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.dataset.l == null && teste[i] != null) td.dataset.l = teste[i];
      });
    });
  });
}

/* L'agenda del giorno sul telefono: una lista in ordine d'ora. Il
   calendario a colonne resta su schermo grande — su un telefono cinque
   colonne da cento pixel non sono un'agenda, sono un indovinello. */
function rfAgendaListaHtml(lista, vista) {
  const nome = (a) => (a.p && typeof P !== 'undefined' && P[a.p] && typeof fullName === 'function') ? fullName(P[a.p]) : (a.nomeBreve || a.nome || 'Paziente');
  const ordinati = [...lista].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return `<div class="rf-ag-lista">${ordinati.map((a) => {
    const sotto = [a.prestazione || a.reason || '', vista === 'sale' ? (a.room || '') : (DOCTORS[a.doc] ? rfNomeCorto(DOCTORS[a.doc]) : '')].filter(Boolean).join(' · ');
    return `<button type="button" class="rf-ag-r${a.status === 'COMPLETED' ? ' fatta' : ''}${a.late ? ' tardi' : ''}" ${a.p && rfUuid(a.p) ? `data-go="#/patients/${rfEsc(a.p)}"` : ''}>
      <span class="h">${rfEsc(a.start)}</span>
      <span class="c"><span class="n">${rfEsc(nome(a))}</span>${sotto ? `<span class="s">${rfEsc(sotto)}</span>` : ''}</span>
      ${a.colore ? `<i class="pun" style="background:${rfEsc(a.colore)}"></i>` : ''}
    </button>`;
  }).join('')}</div>`;
}

(function () { const st = document.createElement('style'); st.textContent = `
@media (max-width: 640px) {
  /* nella barra in alto il titolo sparisce: la pagina ce l'ha già sotto, e
     su 375 px quello spazio serve alle icone (si leggeva «Age…») */
  .topbar .title, .topbar .crumb { display:none; }
  .page-head { flex-direction:column; align-items:stretch; gap:12px; }
  .page-head .actions { width:100%; }

  /* filtri e bottoni: vanno a capo. Scorrere di lato nascondeva mezzo tasto
     verde, e un tasto tagliato sembra un guasto. */
  .page-head .actions, .toolbar { flex-wrap:wrap; row-gap:8px; }
  .page-head .actions > *, .toolbar > * { max-width:100%; }
  .page-head .actions .btn, .toolbar .btn { flex:0 1 auto; }
  .toolbar .input, .page-head .actions .input { min-width:0; width:100%; }
  .seg { max-width:100%; overflow-x:auto; scrollbar-width:none; }
  .seg::-webkit-scrollbar { display:none; }

  /* le tabelle diventano schede: una riga, una scheda */
  .table-wrap { overflow:visible; max-height:none; box-shadow:none; }
  .rf-tab-schede { display:block; width:100%; border-collapse:separate; }
  .rf-tab-schede thead { display:none; }
  .rf-tab-schede tbody, .rf-tab-schede tr, .rf-tab-schede td { display:block; width:auto; }
  .rf-tab-schede tr { border:1px solid var(--border); border-radius:10px; background:var(--surface); padding:10px 12px; margin-bottom:8px; }
  .rf-tab-schede tr:hover { border-color:var(--accent); }
  /* etichetta a sinistra e valore di seguito, con il rientro sporgente: così
     un valore fatto di due pezzi («01.03.1950» e «(60)») resta sulla stessa
     riga invece di finire sotto l'etichetta. */
  .rf-tab-schede td { padding:3px 0 3px 100px; text-indent:-100px; border:0; font-size:13px; white-space:normal; line-height:1.45; }
  .rf-tab-schede td::before { content:attr(data-l); display:inline-block; width:92px; margin-right:8px; text-indent:0;
    color:var(--text-3); font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; vertical-align:baseline; }
  .rf-tab-schede td:first-child { padding:0 0 6px; text-indent:0; font-size:15.5px; font-weight:600; }
  .rf-tab-schede td:first-child::before { display:none; }
  .rf-tab-schede td:empty { display:none; }
  /* il rientro sporgente non deve scendere nei figli: una pastiglia lo
     ereditava e il suo testo finiva 100 px a sinistra, fuori dalla vista. */
  .rf-tab-schede td * { text-indent:0; }
  .rf-tab-schede td .row { display:inline-flex; flex-wrap:wrap; gap:6px; vertical-align:baseline; }

  /* l'agenda del giorno: lista invece di calendario */
  .rf-ag-lista { display:flex; flex-direction:column; border-top:1px solid var(--border); }
  .rf-ag-r { display:grid; grid-template-columns:52px minmax(0,1fr) auto; gap:12px; align-items:center; width:100%; text-align:left;
    background:none; border:0; border-bottom:1px solid var(--border); padding:13px 2px; font:inherit; color:inherit; cursor:pointer; }
  .rf-ag-r .h { font-variant-numeric:tabular-nums; font-size:14px; font-weight:600; color:var(--text-2); }
  .rf-ag-r .c { min-width:0; display:flex; flex-direction:column; gap:2px; }
  .rf-ag-r .n { font-size:15px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rf-ag-r .s { font-size:12.5px; color:var(--text-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rf-ag-r .pun { width:8px; height:8px; border-radius:50%; flex:none; }
  .rf-ag-r.fatta { opacity:.55; }
  .rf-ag-r.tardi .h { color:var(--warning); }

  /* sale: una colonna, e le pastiglie non escono più dalla scheda */
  .rf-or-mappa { grid-template-columns:minmax(0,1fr); }
  .rf-or-sala { min-height:0; }
  .rf-or-sala .t { flex-wrap:wrap; row-gap:4px; }
  .rf-or-sala .t b { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rf-or-pill { font-size:9.5px; padding:2px 6px; max-width:100%; overflow:hidden; text-overflow:ellipsis; }

  /* le tessere dei numeri: due per riga, tutte della stessa altezza */
  .grid-4, .grid-5 { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .stat .label, .card.tight .label { font-size:10px; line-height:1.3; }
  .stat .value, .card .num { font-size:28px; }

  /* la visita: la colonna dell'assistente sotto, non di fianco */
  .rf-v-testa { position:static; }
  .rf-v-testa .rf-v-spinta { margin-left:0; padding-left:0; width:100%; }
  .rf-v-testa .rf-v-spinta .btn { width:100%; }
  .rf-v-voce { grid-template-columns:minmax(0,1fr); gap:2px; }
  .rf-v-voce .e { font-size:11px; text-transform:uppercase; letter-spacing:.05em; }

  /* la pagina di Cleo: il benvenuto parte dall'alto, così la prima cosa che
     si vede è il campo con i due modi e non la metà di un elenco. */
  .rf-gpt-scroll.vuota { justify-content:flex-start; }
  .rf-gpt-col { padding:0 16px; }
  .rf-gpt-w h3 { font-size:20px; margin-top:8px; }
  .rf-aiw-grid { grid-template-columns:minmax(0,1fr); }
  .rf-gpt-foot { padding-bottom:12px; }

  /* niente esce mai di lato */
  #content, #content > .page { max-width:100%; overflow-x:hidden; }
  .rf-cal-scorre { max-width:100%; }
}
`; document.head.appendChild(st); })();

/* Le tabelle si sistemano dopo ogni disegno, e quando si gira il telefono. */
(function () {
  const r = render;
  render = function () { const out = r.apply(this, arguments); try { rfTabelleTelefono(); } catch { /* pazienza */ } return out; };
  let largo = (typeof window !== 'undefined' ? window.innerWidth : 0);
  window.addEventListener('resize', () => {
    // Si ridisegna solo quando si passa la soglia: sul telefono il resize
    // scatta anche quando compare la tastiera.
    const ora = window.innerWidth;
    if ((largo <= 640) !== (ora <= 640)) { largo = ora; render(); } else { largo = ora; try { rfTabelleTelefono(); } catch { /* idem */ } }
  });
})();

/* Il tasto «AI» della barra in alto, sul telefono, porta alla PAGINA di Cleo.
   Prima apriva il pannello laterale, che sul telefono diventa un foglio a
   tutto schermo: sembrava Cleo ma non lo era — senza benvenuto, senza i due
   modi «Domanda medica» e «Con la cartella». Con il microfono il pannello
   resta, perché la dettatura scrive nel campo che sta lì dentro. */
if (typeof toggleAI === 'function') {
  const rfToggleAiOrig = toggleAI;
  toggleAI = function (force) {
    // Il tasto passa l'evento del clic come primo argomento: «esplicito» è
    // solo un vero true/false, cioè il microfono che chiede il pannello.
    if (rfTelefono() && typeof force !== 'boolean' && !state.aiOpen) {
      state.aiOpen = false;
      if (state.route !== 'ai') go('#/ai'); else render();
      return;
    }
    return rfToggleAiOrig.apply(this, arguments);
  };
}

/* =====================================================================
   «Richiami» (16.9.2026): chi va richiamato, e dove metterlo.
   Due cose che finora stavano in due mondi diversi — i richiami in una
   pagina della piattaforma vecchia, i buchi in agenda da nessuna parte —
   e che servono insieme: un richiamo scaduto senza un posto dove metterlo
   è una lista che cresce, e un buco senza un nome da chiamare è tempo
   perso. Qui la proposta è una riga sola: «questo paziente, in questo
   buco, perché».
   Il conto lo fa il codice ([[src/lib/agenda-buchi]]); il modello locale
   scrive solo la frase da dire al telefono; a prenotare, sull'agenda
   della Cassa dei Medici, è sempre una persona.
   ===================================================================== */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-ric { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); gap:16px; align-items:start; }
.rf-ric-prop { display:flex; flex-direction:column; border-top:1px solid var(--border); }
.rf-ric-p { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; padding:13px 2px; border-bottom:1px solid var(--border); align-items:start; }
.rf-ric-p .quando { font-size:12.5px; color:var(--text-2); font-variant-numeric:tabular-nums; }
.rf-ric-p .quando b { color:var(--text); }
.rf-ric-p .chi { font-size:15.5px; font-weight:600; margin-top:3px; }
.rf-ric-p .perche { font-size:12.5px; color:var(--text-3); line-height:1.45; margin-top:3px; }
.rf-ric-p .az { display:flex; flex-direction:column; gap:6px; align-items:stretch; }
.rf-ric-p .az .btn { white-space:nowrap; }
.rf-ric-p.pausa { opacity:.62; }
.rf-ric-el { display:flex; flex-direction:column; border-top:1px solid var(--border); max-height:none; }
.rf-ric-r { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:11px 2px; border-bottom:1px solid var(--border); align-items:center; }
.rf-ric-r .n { font-size:14px; font-weight:600; }
.rf-ric-r .s { font-size:12px; color:var(--text-3); margin-top:2px; }
.rf-ric-r .s.tardi { color:var(--warning); }
.rf-ric-alt { grid-column:1 / -1; margin:6px 0 2px; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
.rf-ric-alt .t { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-3); margin-bottom:8px; }
.rf-ric-alt button.scelta { display:block; width:100%; text-align:left; border:0; background:none; font:inherit; padding:7px 4px; border-top:1px solid var(--border); cursor:pointer; font-size:13px; }
.rf-ric-alt button.scelta:first-of-type { border-top:0; }
.rf-ric-alt button.scelta:hover { color:var(--accent); }
.rf-ric-tel { grid-column:1 / -1; margin:8px 0 2px; padding:11px 13px; border-left:3px solid var(--accent); background:var(--accent-soft); border-radius:0 10px 10px 0; font-size:13.5px; line-height:1.5; }
.rf-ric-tel .da { display:block; margin-top:6px; font-size:10.5px; color:var(--text-3); }
.rf-ric-nuovo { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.rf-ric-nuovo .input { flex:1 1 200px; min-width:0; }
@media (max-width:980px) { .rf-ric { grid-template-columns:minmax(0,1fr); } }
`; document.head.appendChild(st); })();

if (typeof NAV_META !== 'undefined') NAV_META.richiami = ['Richiami', 'clock'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('richiami')) n.splice(n.indexOf('agenda') + 1, 0, 'richiami'); }
RF.ric = null; RF.ricGiorni = 7; RF.ricAlt = null; RF.ricTel = null; RF.ricMsg = null;

async function rfRicCarica(rendi = true) {
  try {
    const r = await fetch(`/api/prototipo/richiami?giorni=${RF.ricGiorni}`, { credentials: 'include', cache: 'no-store' });
    RF.ric = r.ok ? await r.json() : { buchi: [], candidati: [], proposte: [], chiamate: [] };
  } catch { RF.ric = { buchi: [], candidati: [], proposte: [], chiamate: [] }; }
  if (rendi && state.route === 'richiami') render();
}
async function rfRicAzione(corpo, messaggio) {
  RF.ricMsg = null;
  try {
    const r = await fetch('/api/prototipo/richiami', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    RF.ricMsg = (r.ok && j.ok) ? { tipo: 'ok', testo: messaggio } : { tipo: 'male', testo: j.errore || 'Non riuscito.' };
    return j;
  } catch { RF.ricMsg = { tipo: 'male', testo: 'La piattaforma non risponde.' }; return null; }
}
async function rfRicFatto(id) { await rfRicAzione({ azione: 'fatto', id }, 'Richiamo chiuso.'); RF.ricAlt = null; await rfRicCarica(); }
async function rfRicRimanda(id, mesi) { await rfRicAzione({ azione: 'rimanda', id, mesi }, `Rimandato di ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}.`); await rfRicCarica(); }
// «Ho chiamato»: vale per la proposta che è aperta in quel momento — quella
// di cui si sta leggendo la frase al telefono.
async function rfRicChiamato(esito) {
  const p = RF.ricTel && RF.ricTel.proposta;
  if (!p) return;
  await rfRicAzione({ azione: 'chiamato', id: p.candidato.id, esito, patient_id: p.candidato.patientId || null,
    giorno: p.buco.giorno, dalle: p.buco.dalle, medico: p.buco.medico },
    esito === 'fissato' ? 'Appuntamento fissato: il richiamo è chiuso.' : 'Telefonata segnata.');
  RF.ricAlt = null; RF.ricTel = null; await rfRicCarica();
}
// Le alternative, dai due lati: da una proposta o da un buco vuoto si chiede
// «chi altro», da un paziente in attesa si chiede «dove».
async function rfRicAlternative(chiave, tipo, rif) {
  if (RF.ricAlt && RF.ricAlt.chiave === chiave) { RF.ricAlt = null; render(); return; }
  RF.ricAlt = { chiave, lista: null }; RF.ricTel = null; render();
  let corpo = null;
  if (tipo === 'buco') { const p = rfRicPresa('prop', rif); corpo = p ? { buco: p.buco } : null; }
  else if (tipo === 'vuoto') { const [giorno, dalle, medico] = String(rif).split('|'); corpo = { buco: { giorno, dalle: Number(dalle), medico } }; }
  else corpo = { id: rif };
  if (!corpo) { RF.ricAlt = null; render(); return; }
  const j = await rfRicAzione({ azione: 'alternative', giorni: RF.ricGiorni, ...corpo }, null);
  RF.ricAlt = { chiave, lista: (j && j.alternative) || [] }; RF.ricMsg = null; render();
}
async function rfRicTelefonata(fonte, i, chiave) {
  const p = rfRicPresa(fonte, i);
  if (!p) return;
  RF.ricTel = { chiave, proposta: p, testo: null }; render();
  const j = await rfRicAzione({ azione: 'telefonata', proposta: p }, null);
  RF.ricTel = { chiave, proposta: p, testo: (j && j.testo) || null, causa: j && j.causa }; RF.ricMsg = null; render();
}
async function rfRicNuovo() {
  const et = (document.getElementById('rf-ric-paz') || {}).value || '';
  const mesi = Number((document.getElementById('rf-ric-mesi') || {}).value || 6);
  const paz = rfModPazienti();
  const pid = paz.mappa.get(et.trim());
  if (!pid) { RF.ricMsg = { tipo: 'male', testo: 'Scegli il paziente dall’elenco della cartella.' }; render(); return; }
  await rfRicAzione({ azione: 'nuovo', patient_id: pid, mesi }, `Richiamo creato: fra ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}.`);
  await rfRicCarica();
}
function rfRicGiorni(n) { RF.ricGiorni = n; RF.ricAlt = null; RF.ric = null; render(); void rfRicCarica(); }

const rfRicOra = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const RF_RIC_GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
function rfRicGiorno(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const oggi = (RF.data && RF.data.today) || rfOggi();
  const domani = new Date(`${oggi}T12:00:00`); domani.setDate(domani.getDate() + 1);
  if (iso === oggi) return 'oggi';
  if (iso === domani.toLocaleDateString('sv-SE')) return 'domani';
  return `${RF_RIC_GIORNI[d.getDay()]} ${d.getDate()}`;
}
function rfRicProposta(p, i) {
  const chiave = `p${i}`;
  const alt = RF.ricAlt && RF.ricAlt.chiave === chiave ? RF.ricAlt : null;
  const tel = RF.ricTel && RF.ricTel.chiave === chiave ? RF.ricTel : null;
  return `<div class="rf-ric-p${p.buco.pausa ? ' pausa' : ''}">
    <div>
      <div class="quando"><b>${rfEsc(rfRicGiorno(p.buco.giorno))} ${rfRicOra(p.buco.dalle)}–${rfRicOra(p.buco.alle)}</b> · ${rfEsc(rfNomeCorto(p.buco.medico))} · ${p.buco.minuti} min liberi</div>
      <div class="chi">${rfEsc(p.candidato.paziente)}${p.candidato.prestazione ? ` <span class="caption">${rfEsc(p.candidato.prestazione)} · ${p.candidato.durata} min</span>` : ''}</div>
      <div class="perche">${rfEsc(p.perche.join(' · '))}</div>
    </div>
    <div class="az">
      <button class="btn sm primary" onclick="rfRicTelefonata('prop', ${i}, '${chiave}')">${ICONS.phone || ''} Chiama</button>
      <button class="btn sm ghost" onclick="rfRicAlternative('${chiave}', 'buco', ${i})">Chi altro?</button>
    </div>
    ${tel ? `<div class="rf-ric-tel">${tel.testo ? rfEsc(tel.testo).replace(/\n/g, '<br>') : (tel.causa ? `${rfEsc((tel.proposta && tel.proposta.frase) || p.frase)}<span class="da">Il modello locale non ha risposto (${rfEsc(tel.causa)}): questa è la frase del codice.</span>` : 'Scrivo che cosa dire…')}
      ${tel.testo || tel.causa ? `<div class="row mt-8" style="gap:6px;flex-wrap:wrap">
        <button class="btn sm primary" onclick="rfRicChiamato('fissato')">Ha detto di sì</button>
        <button class="btn sm" onclick="rfRicChiamato('non risponde')">Non risponde</button>
        <button class="btn sm ghost" onclick="rfRicChiamato('rifiutato')">Non gli va bene</button></div>` : ''}
      ${tel.testo ? `<span class="da">Scritta dal modello locale, su questo computer. La prenotazione la fa una persona sull’agenda.</span>` : ''}</div>` : ''}
    ${alt ? `<div class="rf-ric-alt"><div class="t">Chi altro entrerebbe in questo buco</div>
      ${alt.lista === null ? '<span class="caption">Guardo…</span>' : (alt.lista.length ? alt.lista.map((x, j) => `<button type="button" class="scelta" onclick="rfRicTelefonata('alt', ${j}, '${chiave}')"><b>${rfEsc(x.candidato.paziente)}</b> <span class="caption">${rfEsc(x.perche.join(' · '))}</span></button>`).join('') : '<span class="caption">Nessun altro ci sta dentro.</span>')}</div>` : ''}
  </div>`;
}
/* Niente oggetti dentro gli onclick: si passa da dove stanno già (RF), con
   un indice. Un JSON dentro un attributo HTML è una citazione dentro una
   citazione dentro una citazione, e prima o poi si rompe su un apostrofo. */
function rfRicPresa(fonte, i) {
  if (fonte === 'alt') return (RF.ricAlt && RF.ricAlt.lista && RF.ricAlt.lista[i]) || null;
  return (RF.ric && RF.ric.proposte && RF.ric.proposte[i]) || null;
}

PAGES.richiami = () => {
  if (!RF.live) return rfPaginaPiattaforma('Richiami', 'Chi va richiamato, e dove metterlo');
  if (RF.ric === null) { void rfRicCarica(); return `<div class="page-head"><div><h2 class="page-title">Richiami</h2></div></div><div class="card"><p class="meta" style="margin:0">Guardo i richiami e i buchi in agenda…</p></div>`; }
  const d = RF.ric;
  const senzaProposta = d.buchi.filter((b) => !d.proposte.some((p) => p.buco.giorno === b.giorno && p.buco.dalle === b.dalle && p.buco.medico === b.medico));
  const scaduti = d.candidati.filter((c) => c.giorniDiRitardo > 0);
  const paz = typeof rfModPazienti === 'function' ? rfModPazienti() : { html: '' };
  return `<div class="page-head"><div><h2 class="page-title">Richiami</h2>
      <div class="page-sub">${d.candidati.length} da rivedere${scaduti.length ? ` · <b>${scaduti.length} in ritardo</b>` : ''} · ${d.buchi.length} ${d.buchi.length === 1 ? 'buco' : 'buchi'} nei prossimi ${d.giorni} giorni</div></div>
    <div class="actions"><div class="seg">${[3, 7, 14].map((n) => `<button class="${RF.ricGiorni === n ? 'active' : ''}" onclick="rfRicGiorni(${n})">${n} giorni</button>`).join('')}</div></div></div>
    ${RF.ricMsg ? `<div class="rf-or-msg ${RF.ricMsg.tipo === 'ok' ? 'ok' : ''}">${rfEsc(RF.ricMsg.testo)}</div>` : ''}
    <div class="rf-ric">
      <div class="card">
        <div class="card-head"><span class="section-title">Da chiamare adesso</span><span class="caption">${d.proposte.length} ${d.proposte.length === 1 ? 'proposta' : 'proposte'}</span></div>
        ${d.proposte.length ? `<div class="rf-ric-prop">${d.proposte.map(rfRicProposta).join('')}</div>`
          : `<p class="meta" style="margin:0;line-height:1.55">Nessun accostamento da proporre: ${d.buchi.length ? 'i buchi ci sono, ma nessuno di chi aspetta ci starebbe dentro (durata, medico o prestazione).' : 'nei prossimi giorni l’agenda non ha buchi.'}</p>`}
      </div>
      <div class="stack" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-head"><span class="section-title">Chi aspetta</span><span class="caption">${d.candidati.length}</span></div>
          ${d.candidati.length ? `<div class="rf-ric-el">${d.candidati.slice(0, 12).map((c) => {
            const chiave = `c${c.id}`;
            const alt = RF.ricAlt && RF.ricAlt.chiave === chiave ? RF.ricAlt : null;
            return `<div class="rf-ric-r">
              <div><div class="n">${rfEsc(c.paziente)}</div>
                <div class="s${c.giorniDiRitardo > 0 ? ' tardi' : ''}">${c.tipo === 'da_prenotare' ? 'da prenotare' : (c.giorniDiRitardo > 0 ? `in ritardo di ${c.giorniDiRitardo} giorni` : `entro il ${rfEsc(c.scadenza || '')}`)}${c.prestazione ? ` · ${rfEsc(c.prestazione)}` : ''}${c.medico ? ` · ${rfEsc(rfNomeCorto(c.medico))}` : ''}</div></div>
              <div class="row" style="gap:6px">
                <button class="btn sm" onclick="rfRicAlternative('${chiave}', 'candidato', '${rfEsc(c.id)}')">Dove?</button>
                <button class="btn sm ghost" onclick="rfRicFatto('${rfEsc(c.id)}')" title="Toglilo dalla lista">Fatto</button>
              </div>
              ${alt ? `<div class="rf-ric-alt"><div class="t">Dove potrebbe entrare</div>
                ${alt.lista === null ? '<span class="caption">Guardo…</span>' : (alt.lista.length ? alt.lista.map((x, j) => `<button type="button" class="scelta" onclick="rfRicTelefonata('alt', ${j}, '${chiave}')"><b>${rfEsc(rfRicGiorno(x.buco.giorno))} ${rfRicOra(x.buco.dalle)}</b> · ${rfEsc(rfNomeCorto(x.buco.medico))} <span class="caption">${x.buco.minuti} min</span></button>`).join('') : '<span class="caption">Nessun buco adatto nei prossimi giorni.</span>')}</div>` : ''}
              ${RF.ricTel && RF.ricTel.chiave === chiave ? `<div class="rf-ric-tel">${RF.ricTel.testo ? rfEsc(RF.ricTel.testo).replace(/\n/g, '<br>') : 'Scrivo che cosa dire…'}</div>` : ''}
            </div>`;
          }).join('')}</div>${d.candidati.length > 12 ? `<div class="caption mt-8">e altri ${d.candidati.length - 12}.</div>` : ''}`
            : '<p class="meta" style="margin:0">Nessuno in attesa di essere richiamato.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><span class="section-title">Buchi senza nessuno</span><span class="caption">${senzaProposta.length}</span></div>
          ${senzaProposta.length ? `<div class="rf-ric-el">${senzaProposta.slice(0, 8).map((b) => `<div class="rf-ric-r">
              <div><div class="n">${rfEsc(rfRicGiorno(b.giorno))} ${rfRicOra(b.dalle)}–${rfRicOra(b.alle)}</div>
                <div class="s">${rfEsc(rfNomeCorto(b.medico))} · ${b.minuti} min${b.pausa ? ' · ora di pranzo' : ''}</div></div>
              <div class="row"><button class="btn sm ghost" onclick="rfRicAlternative('b${rfEsc(b.giorno)}${b.dalle}', 'vuoto', '${rfEsc(b.giorno)}|${b.dalle}|${rfEsc(b.medico)}')">Chi?</button></div>
              ${RF.ricAlt && RF.ricAlt.chiave === `b${b.giorno}${b.dalle}` ? `<div class="rf-ric-alt"><div class="t">Chi entrerebbe</div>${RF.ricAlt.lista === null ? '<span class="caption">Guardo…</span>' : (RF.ricAlt.lista.length ? RF.ricAlt.lista.map((x, j) => `<button type="button" class="scelta" onclick="rfRicTelefonata('alt', ${j}, 'b${rfEsc(b.giorno)}${b.dalle}')"><b>${rfEsc(x.candidato.paziente)}</b> <span class="caption">${rfEsc(x.perche.join(' · '))}</span></button>`).join('') : '<span class="caption">Nessuno: o non ci sta, o non è il suo medico.</span>')}</div>` : ''}
            </div>`).join('')}</div>` : '<p class="meta" style="margin:0">Tutti i buchi hanno un nome accanto.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><span class="section-title">Nuovo richiamo</span></div>
          <div class="rf-ric-nuovo">
            <input class="input" id="rf-ric-paz" list="rf-mod-paz-list" placeholder="Cognome Nome…" autocomplete="off">${paz.html || ''}
            <select class="input" id="rf-ric-mesi" style="max-width:130px">${[1, 3, 6, 12, 24].map((m) => `<option value="${m}"${m === 6 ? ' selected' : ''}>fra ${m} ${m === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select>
            <button class="btn primary" onclick="rfRicNuovo()">Crea</button>
          </div>
          <div class="caption mt-8">Nasce come appuntamento da fissare: comparirà qui a sinistra quando sarà il momento, e nei buchi di quei giorni.</div>
        </div>
      </div>
    </div>`;
};

/* ---------- tre schede portate qui dalle pagine vecchie (16.9.2026) ----------
   «Il mio accesso» (la verifica in due passi, che è una cosa propria e non
   dell'amministratore), «Qualità AI» (com'è andata la catena dei referti, ed
   è l'unico posto dove si guarda se sta migliorando) e «Statistiche».
   Stanno nello Studio perché si guardano di rado e insieme al resto della
   configurazione — non meritavano tre voci di menu. */
RF.sic = null;

async function rfSicAzione(corpo) {
  RF.studio.errore = null;
  try {
    const r = await fetch('/api/prototipo/studio', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { RF.studio.errore = j.errore || 'Non riuscito.'; render(); return null; }
    return j;
  } catch { RF.studio.errore = 'Piattaforma non raggiungibile.'; render(); return null; }
}
async function rfSicAvvia() { const j = await rfSicAzione({ azione: '2fa_avvia' }); if (j) { RF.sic = { passo: 'qr', qr: j.qr, segreto: j.segreto, uri: j.uri }; render(); } }
async function rfSicAnnulla() { await rfSicAzione({ azione: '2fa_annulla' }); RF.sic = null; await rfStudioCarica(); }
async function rfSicConferma() {
  const c = (document.getElementById('rf-sic-codice') || {}).value || '';
  const j = await rfSicAzione({ azione: '2fa_conferma', codice: c });
  if (j) { RF.sic = { passo: 'codici', codici: j.codici }; await rfStudioCarica(); }
}
async function rfSicSpegni() {
  const c = (document.getElementById('rf-sic-spegni') || {}).value || '';
  const j = await rfSicAzione({ azione: '2fa_spegni', codice: c });
  if (j) { RF.sic = null; await rfStudioCarica(); }
}

function rfStudioSicurezza(d) {
  const s = d.sicurezza || {};
  const attiva = !!s.attiva;
  const p = RF.sic;
  if (p && p.passo === 'codici') {
    return `<div class="card"><div class="card-head"><span class="section-title">Codici di recupero</span></div>
      <p class="meta" style="margin:0 0 12px;line-height:1.55">La verifica in due passi è <b>attiva</b>. Questi codici servono se perdi il telefono: si vedono <b>una volta sola</b>. Stampali o mettili dove tieni le cose importanti — ognuno vale una volta.</p>
      <div class="rf-codici">${p.codici.map(c => `<code>${rfEsc(c)}</code>`).join('')}</div>
      <div class="row mt-16"><button class="btn primary" onclick="RF.sic=null;render()">Li ho messi al sicuro</button>
        <button class="btn ghost" onclick="rfStampaCodici()">${ICONS.print || ''} Stampa</button></div></div>`;
  }
  if (p && p.passo === 'qr') {
    return `<div class="card"><div class="card-head"><span class="section-title">Attivare la verifica in due passi</span></div>
      <div class="grid grid-2" style="align-items:start;gap:20px">
        <div><p class="meta" style="margin:0 0 10px;line-height:1.55">1. Apri l&rsquo;app di autenticazione (Google Authenticator, 1Password, Aegis…).<br>2. Inquadra il codice, oppure incolla la chiave.<br>3. Scrivi qui il numero di sei cifre che ti mostra.</p>
          <img src="${p.qr}" alt="Codice QR" style="width:200px;height:200px;border:1px solid var(--border);border-radius:10px;background:#fff;padding:6px">
          <div class="caption mt-8">Chiave: <code>${rfEsc(p.segreto)}</code></div>
          <div class="caption mt-8">Dal telefono, <a href="${rfEsc(p.uri)}">tocca qui</a> per aprirla direttamente nell&rsquo;app.</div></div>
        <div><div class="field"><label>Codice dell&rsquo;app</label><input class="input" id="rf-sic-codice" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" style="max-width:180px;font-size:20px;letter-spacing:.2em"></div>
          <div class="row mt-16"><button class="btn primary" onclick="rfSicConferma()">Attiva</button><button class="btn ghost" onclick="rfSicAnnulla()">Annulla</button></div>
          <p class="caption mt-16" style="line-height:1.5">Il segreto è stato creato su questo computer e non è uscito da qui. Finché non arriva un codice giusto, la verifica non è attiva.</p></div>
      </div></div>`;
  }
  return `<div class="card"><div class="card-head"><span class="section-title">Verifica in due passi</span>${attiva ? '<span class="badge success">attiva</span>' : '<span class="badge warning">non attiva</span>'}</div>
    <p class="meta" style="margin:0 0 12px;line-height:1.55">Il tuo accesso è <b>${rfEsc(s.email || '')}</b>. Con la verifica in due passi, chi ruba la password non entra lo stesso: serve anche il codice che cambia ogni 30 secondi sul tuo telefono.${attiva ? ` Attiva dal ${rfEsc((s.attiva || '').slice(0, 10).split('-').reverse().join('.'))}, ${s.codici} codici di recupero ancora buoni.` : ''}</p>
    ${attiva
      ? `<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div class="field" style="margin:0"><label>Per spegnerla, il codice dell&rsquo;app</label><input class="input" id="rf-sic-spegni" inputmode="numeric" placeholder="123456" style="max-width:160px"></div>
          <button class="btn ghost" onclick="rfSicSpegni()">Spegni la verifica</button></div>`
      : `<div class="row"><button class="btn primary" onclick="rfSicAvvia()">Attiva la verifica in due passi</button></div>`}
    <p class="caption mt-16" style="line-height:1.5">È una cosa tua: la accendi e la spegni tu, non l&rsquo;amministratore. Nella scheda «Personale» si vede solo chi ce l&rsquo;ha e chi no.</p></div>`;
}

function rfStudioQualita(d) {
  const q = d.qualita;
  if (!q) { void rfStudioCarica('qualita'); return `<div class="card"><div class="caption">Guardo com&rsquo;è andata la catena…</div></div>`; }
  const totale = q.settimane.reduce((s, r) => s + r.n, 0);
  const num = (v, suff = '') => v == null || v === '' ? '—' : `${Math.round(Number(v) * 10) / 10}${suff}`;
  const barre = (lista, chiave) => lista.length ? `<div class="rf-con-el">${lista.map(x => `<div class="rf-stu-r"><div><div class="n">${rfEsc(x[chiave])}</div></div><div class="num">${x.n}</div></div>`).join('')}</div>` : '<div class="caption">Ancora niente.</div>';
  const diz = (q.dizionario || []).reduce((a, r) => (a[r.stato] = r.n, a), {});
  const bozze = (q.bozze || []).reduce((a, r) => (a[r.stato] = r.n, a), {});
  return `${rfQualitaCorrezioni(q.correzioni)}
    <div class="grid grid-4 mt-16">
      <div class="card tight stat"><span class="label">Referti confermati</span><span class="value num">${bozze.confermata || 0}</span><span class="delta">${bozze.bozza || 0} aperti · ${bozze.scartata || 0} scartati</span></div>
      <div class="card tight stat"><span class="label">Con la revisione misurata</span><span class="value num">${totale}</span><span class="delta">ultime 8 settimane</span></div>
      <div class="card tight stat"><span class="label">Dizionario</span><span class="value num">${diz.confermato || 0}</span><span class="delta">${diz.proposto || 0} da confermare</span></div>
      <div class="card tight stat"><span class="label">Correzioni classificate</span><span class="value num">${q.classi.reduce((s, x) => s + x.n, 0)}</span><span class="delta">${q.classi.filter(x => /^ASR/i.test(x.classe)).reduce((s, x) => s + x.n, 0)} dal riconoscimento</span></div>
    </div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Settimana per settimana</span></div>
      ${q.settimane.length ? `<div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Settimana</th><th class="num">Referti</th><th class="num">Quota modificata</th><th class="num">Tempo di revisione</th><th class="num">Verifiche</th><th class="num">Accettate senza riascolto</th></tr></thead><tbody>
        ${q.settimane.map(r => `<tr><td>${rfEsc(r.settimana)}</td><td class="num">${r.n}</td><td class="num">${num(r.quota_med && Number(r.quota_med) * 100, '%')}</td><td class="num">${num(r.tempo_med, ' s')}</td><td class="num">${r.flag ?? '—'}</td><td class="num">${r.senza ?? '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="caption">Nessun referto confermato con la revisione misurata: i numeri compaiono appena si conferma una bozza.</div>'}
      <div class="caption mt-8" style="line-height:1.5">«Quota modificata» è quanta parte del testo dettato è stata cambiata a mano; se scende, la catena sta migliorando. «Accettate senza riascolto» conta le verifiche chiuse senza riascoltare l&rsquo;audio: se sale troppo, qualcuno sta approvando alla cieca.</div>
    </div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Che cosa si corregge</span></div>${barre(q.classi, 'classe')}
        <div class="caption mt-8">Solo le classi che cominciano per «ASR» alimentano il dizionario: sono gli errori di ascolto, non le scelte di stile.</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Da dove arriva il testo corretto</span></div>${barre(q.origini, 'origine')}</div>
    </div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Chi conferma</span></div>${barre(q.perUtente, 'email')}
      <div class="caption mt-8">Finché in studio si entra con pochi accessi condivisi, questa colonna dice poco: dirà molto quando ogni medico avrà il suo.</div></div>`;
}

function rfStudioStatistiche(d) {
  const s = d.statistiche;
  if (!s) { void rfStudioCarica('statistiche'); return `<div class="card"><div class="caption">Conto…</div></div>`; }
  const max = Math.max(1, ...s.perSettimana.map(x => x.n));
  return `<div class="grid grid-4">
      <div class="card tight stat"><span class="label">Referral ricevute</span><span class="value num">${s.referral}</span><span class="delta">${s.prenotate} prenotate</span></div>
      <div class="card tight stat"><span class="label">Giorni fino alla prenotazione</span><span class="value num">${rfEsc(String(s.giorni))}</span><span class="delta">mediana</span></div>
      <div class="card tight stat"><span class="label">Medici invianti</span><span class="value num">${s.invianti}</span><span class="delta">con almeno una referral</span></div>
      <div class="card tight stat"><span class="label">Appuntamenti, 30 giorni</span><span class="value num">${s.appuntamenti}</span><span class="delta">dall&rsquo;agenda</span></div>
    </div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Referral per settimana</span></div>
        <div class="row" style="align-items:flex-end;gap:6px;height:120px;margin-top:8px">
          ${s.perSettimana.map(x => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px">
            <div style="width:100%;background:var(--accent-soft);border-radius:4px 4px 0 0;height:${Math.round((x.n / max) * 90)}px" title="${x.n}"></div>
            <span class="caption">${rfEsc(x.label)}</span></div>`).join('')}
        </div></div>
      <div class="card"><div class="card-head"><span class="section-title">La catena</span></div>
        <div class="kv"><b>Referti dettati, 30 giorni</b><span class="num">${s.dettature}</span><b>Referti confermati in tutto</b><span class="num">${s.refertiConf}</span><b>Richiami aperti</b><span class="num">${s.richiamiAperti}</span></div>
        <div class="caption mt-8" style="line-height:1.5">Il confronto che conta: ${s.dettature} referti dettati contro ${s.appuntamenti} appuntamenti negli stessi 30 giorni.</div></div>
    </div>`;
}


/* «Statistiche» non è più una pagina a sé: sta nello Studio, con la qualità
   della catena. Il vecchio indirizzo porta lì invece di mostrare i numeri
   finti della demo. */
if (typeof PAGES !== 'undefined' && PAGES.statistics) {
  const rfStatOrig = PAGES.statistics;
  PAGES.statistics = () => {
    if (!RF.live) return rfStatOrig();
    RF.studio.scheda = 'statistiche';
    setTimeout(() => go('#/administration'), 0);
    return '<div class="page"><div class="caption">Le statistiche stanno nello Studio…</div></div>';
  };
}

/* ---------- «Quanto corregge la segretaria» (16.9.2026) ----------
   La funzione della piattaforma vecchia, portata qui: ogni correzione fatta
   a mano su un referto finisce nel registro (`audit.human_edits`), e da lì
   si vede quante ne servono, referto per referto, e se col tempo calano.
   Un punto = un referto. L'altezza = le correzioni della persona sull'ULTIMO
   testo dell'AI: le trasformazioni AI→AI non entrano, e nemmeno le modifiche
   del medico, che sono un'altra domanda. La linea è la media mobile: è quella
   che dice se la catena sta migliorando, non il singolo referto. */
function rfQualitaCorrezioni(c) {
  if (!c || !c.punti || !c.punti.length) {
    return `<div class="card"><div class="card-head"><span class="section-title">Quanto si corregge</span></div>
      <p class="meta" style="margin:0;line-height:1.55">Nessuna correzione registrata. Il conto parte da solo: ogni volta che qualcuno rivede una bozza e la conferma, la differenza rispetto al testo dell&rsquo;AI finisce nel registro e compare qui.</p></div>`;
  }
  const p = c.punti;
  const max = Math.max(1, ...p.map(x => x.edit_count));
  const L = 640, H = 150, passo = L / Math.max(1, p.length);
  const larg = Math.max(2, Math.min(18, passo - 2));
  const y = (v) => H - (v / max) * (H - 12);
  const barre = p.map((x, i) => {
    const alto = H - y(x.edit_count);
    const tit = `${x.edit_count} correzioni · ${Math.round((x.edits_per_100_words || 0) * 10) / 10} ogni 100 parole · ${rfEsc((x.created_at || '').slice(0, 10).split('-').reverse().join('.'))}${x.medico ? ` · ${rfEsc(rfNomeCorto(x.medico))}` : ''}`;
    return `<rect x="${(i * passo + (passo - larg) / 2).toFixed(1)}" y="${y(x.edit_count).toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(1, alto).toFixed(1)}" rx="2" fill="var(--accent)" opacity="${x.edit_count === 0 ? '.25' : '.55'}"><title>${tit}</title></rect>`;
  }).join('');
  const linea = p.map((x, i) => x.media == null ? null : `${(i * passo + passo / 2).toFixed(1)},${y(x.media).toFixed(1)}`).filter(Boolean).join(' ');
  const n = (v, d = 1) => v == null ? '—' : String(Math.round(Number(v) * 10 ** d) / 10 ** d);
  const tempo = c.tempo && c.tempo.mediana != null ? `${Math.round(c.tempo.mediana)} s` : '—';
  return `<div class="card">
    <div class="card-head"><span class="section-title">Quanto si corregge, referto per referto</span><span class="caption">${p.length} referti rivisti · media mobile su ${c.finestra}</span></div>
    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="card tight stat" style="box-shadow:none"><span class="label">Correzioni per referto</span><span class="value num">${n(c.st.mediana, 0)}</span><span class="delta">mediana · media ${n(c.st.media)}</span></div>
      <div class="card tight stat" style="box-shadow:none"><span class="label">Ogni 100 parole</span><span class="value num">${n(c.per100.mediana)}</span><span class="delta">peggiore ${n(c.per100.p90)} (9 su 10 sotto)</span></div>
      <div class="card tight stat" style="box-shadow:none"><span class="label">Referti senza correzioni</span><span class="value num">${c.senzaCorrezioni}</span><span class="delta">su ${p.length}</span></div>
      <div class="card tight stat" style="box-shadow:none"><span class="label">Tempo di revisione</span><span class="value num">${tempo}</span><span class="delta">mediana</span></div>
    </div>
    <div style="overflow-x:auto"><svg viewBox="0 0 ${L} ${H + 16}" style="width:100%;min-width:320px;height:${H + 16}px" role="img" aria-label="Correzioni per referto nel tempo">
      <line x1="0" y1="${H}" x2="${L}" y2="${H}" stroke="var(--border-2)" stroke-width="1"/>
      ${barre}
      ${linea ? `<polyline points="${linea}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` : ''}
    </svg></div>
    <div class="caption" style="line-height:1.5">Da sinistra (il più vecchio) a destra (l&rsquo;ultimo). Le barre sono i singoli referti, la linea è la media mobile: se scende, la catena sta imparando a sbagliare meno. Le correzioni del medico non entrano — qui si misura solo quanto lavoro resta a chi rivede.</div>
    ${c.categorie.length ? `<div class="mt-16"><div class="section-title" style="margin-bottom:8px">Che cosa si corregge</div>
      <div class="row wrap" style="gap:8px">${c.categorie.map(x => `<span class="badge">${rfEsc(x.categoria)} · ${x.n}</span>`).join('')}</div></div>` : ''}
  </div>`;
}

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

/* =====================================================================
   Immagini diagnostiche (18.9.2026) — [[Piattaforma/Immagini]]
   =====================================================================
   Gli esami per immagini erano l'unica parte della cartella che la
   piattaforma non sapeva tenere: arrivavano su CD e su chiavette, e per
   guardarli bisognava andare al PC dove era installato il visualizzatore.
   Qui diventano una voce del menu come le altre — stesso studio, stesso
   paziente, stessi ruoli, e un registro di chi ha aperto cosa.

   Il DICOM lo apre il server (imaging/leggi-dicom.py) e manda al browser un
   PNG già finestrato: niente libreria da megabyte, funziona sul telefono, e
   il file originale non esce mai da qui. */
if (typeof NAV_META !== 'undefined') NAV_META.imaging = ['Immagini', 'imaging'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) {
  const n = NAV[r]; if (n && !n.includes('imaging')) n.splice(n.indexOf('documents') + 1, 0, 'imaging');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-img-corpo { display:grid; grid-template-columns: 148px 1fr; gap:16px; align-items:start; }
@media (max-width: 900px) { .rf-img-corpo { grid-template-columns: 1fr; } }
.rf-img-serie { display:flex; flex-direction:column; gap:8px; max-height:70vh; overflow:auto; padding-right:4px; }
@media (max-width: 900px) { .rf-img-serie { flex-direction:row; max-height:none; overflow-x:auto; } }
.rf-img-s { border:1px solid var(--border); border-radius:10px; padding:6px; background:var(--surface); cursor:pointer; text-align:left; min-width:132px; }
.rf-img-s.active { border-color:var(--cta); box-shadow:0 0 0 1px var(--cta) inset; }
.rf-img-s img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; background:#000; display:block; }
.rf-img-s .n { font-size:11px; color:var(--muted); margin-top:4px; line-height:1.3; }
.rf-img-vista { background:#000; border-radius:12px; display:flex; align-items:center; justify-content:center; min-height:44vh; overflow:hidden; position:relative; }
.rf-img-vista img { max-width:100%; max-height:70vh; display:block; image-rendering:auto; }
.rf-img-vista .vuoto { color:#888; font-size:13px; padding:40px; text-align:center; }
.rf-img-hud { position:absolute; left:10px; top:8px; color:#bbb; font-size:11px; font-variant-numeric:tabular-nums; pointer-events:none; text-shadow:0 1px 2px #000; }
.rf-img-hud.destra { left:auto; right:10px; text-align:right; }
.rf-img-barra { display:flex; align-items:center; gap:10px; margin-top:10px; flex-wrap:wrap; }
.rf-img-barra input[type=range] { flex:1; min-width:160px; }
.rf-img-drop { border:1.5px dashed var(--border); border-radius:12px; padding:18px; text-align:center; color:var(--muted); font-size:13px; }
.rf-img-drop.sopra { border-color:var(--cta); color:var(--cta); }
.rf-img-limite { font-size:12px; line-height:1.5; color:var(--muted); border-left:3px solid var(--border); padding:2px 0 2px 10px; margin:12px 0 0; }
.rf-img-vista .limite { position:absolute; left:0; right:0; bottom:0; background:rgba(0,0,0,.55); color:#ddd; font-size:11px; padding:5px 10px; text-align:center; pointer-events:none; }
`; document.head.appendChild(st); })();

RF.img = { lista: null, conta: {}, errore: null, lettore: true, aperto: null, dati: null, serie: 0, idx: 0, frame: 0, ww: null, wl: null, carico: false, filtro: '' };

async function rfImgCarica(rendi = true) {
  try {
    const r = await fetch('/api/prototipo/imaging', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { RF.img.errore = r.status === 403 ? 'Le immagini le vede chi cura: il tuo ruolo non ci accede.' : `Non riesco a leggere gli esami (${r.status}).`; if (rendi) render(); return; }
    const j = await r.json();
    RF.img.lista = j.esami || []; RF.img.conta = j.conta || {}; RF.img.lettore = j.lettore !== false;
    RF.img.ricezione = j.ricezione || null; RF.img.errore = null;
  } catch { RF.img.errore = 'Piattaforma non raggiungibile.'; }
  if (rendi) render();
}

async function rfImgApri(id) {
  RF.img.aperto = id; RF.img.dati = null; RF.img.serie = 0; RF.img.idx = 0; RF.img.frame = 0; RF.img.ww = null; RF.img.wl = null;
  render();
  try {
    const r = await fetch(`/api/prototipo/imaging/${id}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { RF.img.errore = `Esame non leggibile (${r.status}).`; render(); return; }
    RF.img.dati = await r.json();
  } catch { RF.img.errore = 'Piattaforma non raggiungibile.'; }
  render();
}
function rfImgChiudi() { RF.img.aperto = null; RF.img.dati = null; render(); void rfImgCarica(); }

function rfImgSerieCorrente() {
  const d = RF.img.dati; if (!d) return null;
  return d.serie[Math.min(RF.img.serie, d.serie.length - 1)] || null;
}
function rfImgVisibili(s) { return (s && s.immagini ? s.immagini.filter(i => i.immagine) : []); }
function rfImgCorrente() {
  const v = rfImgVisibili(rfImgSerieCorrente());
  return v[Math.min(RF.img.idx, v.length - 1)] || null;
}
function rfImgUrl(i, lato, frame) {
  if (!i) return '';
  const q = [`lato=${lato}`, `frame=${frame || 0}`];
  if (RF.img.ww !== null && RF.img.wl !== null) q.push(`ww=${RF.img.ww}`, `wl=${RF.img.wl}`);
  return `/api/prototipo/imaging/immagine/${i.id}?${q.join('&')}`;
}
function rfImgVaiSerie(n) { RF.img.serie = n; RF.img.idx = 0; RF.img.frame = 0; render(); }
function rfImgScorri(d) {
  const v = rfImgVisibili(rfImgSerieCorrente()); if (!v.length) return;
  const i = rfImgCorrente();
  if (i && i.frame > 1) { RF.img.frame = Math.max(0, Math.min(i.frame - 1, RF.img.frame + d)); render(); return; }
  RF.img.idx = Math.max(0, Math.min(v.length - 1, RF.img.idx + d)); RF.img.frame = 0; render();
}
function rfImgVai(n) { RF.img.idx = Number(n) || 0; RF.img.frame = 0; render(); }
function rfImgFrame(n) { RF.img.frame = Number(n) || 0; render(); }
function rfImgFinestra(ww, wl) { RF.img.ww = ww; RF.img.wl = wl; render(); }

async function rfImgAzione(corpo, messaggio) {
  try {
    const r = await fetch('/api/prototipo/imaging', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.errore || 'Non riuscito'); return false; }
    if (messaggio) toast(messaggio);
    return true;
  } catch { toast('Piattaforma non raggiungibile'); return false; }
}

function rfImgAbbina(id) {
  const paz = (RF.data && RF.data.patients ? RF.data.patients : []).filter(p => rfUuid(p.id));
  const righe = paz.slice(0, 400).map(p => `<option value="${p.id}">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</option>`).join('');
  openModal('A chi è questo esame', `<div class="field"><label>Paziente della cartella</label><select class="input" id="rf-img-paz"><option value="">— scegli —</option>${righe}</select></div>
    <p class="caption mt-8">La piattaforma abbina da sola solo quando nome <b>e</b> data di nascita del file combaciano con una persona sola. Un omonimo non si indovina: lo decide chi guarda.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-img-ok">Abbina</button>`);
  document.getElementById('rf-img-ok').onclick = async () => {
    const pid = document.getElementById('rf-img-paz').value;
    if (!pid) { toast('Scegli un paziente'); return; }
    if (await rfImgAzione({ azione: 'abbina', id, patient_id: pid }, 'Esame abbinato')) {
      closeModal(); if (RF.img.aperto === id) await rfImgApri(id); else await rfImgCarica();
    }
  };
}

async function rfImgImporta(files) {
  if (!files || !files.length) return;
  RF.img.carico = true; render();
  const fd = new FormData();
  let n = 0;
  for (const f of files) { if (n >= 300) break; fd.append('file', f); n++; }
  try {
    const r = await fetch('/api/prototipo/imaging', { method: 'POST', credentials: 'include', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.errore || 'Importazione non riuscita');
    else toast(`${j.immagini} immagini in ${j.esami} ${j.esami === 1 ? 'esame' : 'esami'}${j.scartati ? ` · ${j.scartati} file non DICOM` : ''}`);
  } catch { toast('Piattaforma non raggiungibile'); }
  RF.img.carico = false;
  await rfImgCarica();
}

function rfImgDrop(e, sopra) { e.preventDefault(); const z = document.getElementById('rf-img-drop'); if (z) z.classList.toggle('sopra', sopra); }
function rfImgDropFile(e) {
  e.preventDefault(); rfImgDrop(e, false);
  const dt = e.dataTransfer; if (!dt) return;
  void rfImgImporta([...dt.files]);
}

const RF_IMG_STATO = { da_verificare: ['warning', 'da verificare'], disponibile: ['success', 'in cartella'], nascosto: ['', 'nascosto'] };

PAGES.imaging = () => {
  if (!RF.live) return '<div class="page"><div class="card"><p class="meta" style="margin:0">Le immagini sono una funzione della piattaforma: qui, fuori, non ci sono dati.</p></div></div>';
  if (RF.img.lista === null && !RF.img.errore) { void rfImgCarica(); return `<div class="page-head"><div><h2 class="page-title">Immagini</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  if (RF.img.aperto) return rfImgDettaglio();

  const l = RF.img.lista || [];
  const f = RF.img.filtro;
  const mostrati = f === 'verifica' ? l.filter(e => e.stato === 'da_verificare') : f === 'senza' ? l.filter(e => !e.patient_id) : l;
  const riga = (e) => {
    const st = RF_IMG_STATO[e.stato] || ['', e.stato];
    return `<div class="list-item" style="cursor:pointer" onclick="rfImgApri('${e.id}')">
      <div class="grow"><div class="name">${rfEsc(e.descrizione || 'Esame')} <span class="badge">${rfEsc(e.modalita || '—')}</span> ${st[1] ? `<span class="badge ${st[0]}">${st[1]}</span>` : ''}</div>
        <div class="sub">${e.origine === 'rete' ? '<span class="badge">dall’apparecchio</span> ' : ''}${rfEsc(rfImgData(e.data_esame))}${e.ora_esame ? ` ${rfEsc(e.ora_esame.slice(0, 2))}:${rfEsc(e.ora_esame.slice(2, 4))}` : ''} · ${e.n_serie} ${e.n_serie === 1 ? 'serie' : 'serie'} · ${e.n_immagini} immagini · ${rfImgPeso(e.byte)}${e.istituto ? ` · ${rfEsc(e.istituto)}` : ''}</div></div>
      <div style="text-align:right"><div class="name">${e.paziente ? rfEsc(e.paziente) : `<span class="meta">${rfEsc(e.paziente_dicom || 'senza nome')}</span>`}</div>
        <div class="sub">${e.patient_id ? 'in cartella' : 'non abbinato'}</div></div></div>`;
  };
  const c = RF.img.conta || {};
  return `
    <div class="page-head"><div><h2 class="page-title">Immagini</h2><div class="page-sub">${l.length} esami${c.da_verificare ? ` · ${c.da_verificare} da verificare` : ''}${c.senza_paziente ? ` · ${c.senza_paziente} senza paziente` : ''}</div></div>
      <div class="actions"><div class="seg"><button class="${!f ? 'active' : ''}" onclick="RF.img.filtro='';render()">Tutti</button><button class="${f === 'verifica' ? 'active' : ''}" onclick="RF.img.filtro='verifica';render()">Da verificare</button><button class="${f === 'senza' ? 'active' : ''}" onclick="RF.img.filtro='senza';render()">Senza paziente</button></div></div></div>
    ${RF.img.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.img.errore)}</div>` : ''}
    ${RF.img.lettore ? '' : '<div class="rf-manc mb-16">Il lettore DICOM non è installato su questo server: gli esami si vedono, ma non si importano e non si disegnano.</div>'}
    <p class="rf-img-limite">Queste immagini si <b>consultano</b>: servono a ritrovare l'esame giusto della persona giusta e a guardarlo nel contesto della cartella. <b>La diagnosi si fa sulla console dell'apparecchio o su un visualizzatore certificato</b>, e il referto nasce dal dettato come sempre. Non ci sono misure, e non devono essercene.</p>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Esami</span><span class="caption">dal più recente</span></div>
      <div class="list">${mostrati.length ? mostrati.map(riga).join('') : '<div class="caption">Nessun esame.</div>'}</div></div>
    ${rfImgRicezione()}
    <div class="card mt-16"><div class="section-title">Portare dentro un esame a mano</div>
      <div id="rf-img-drop" class="rf-img-drop mt-8" ondragover="rfImgDrop(event, true)" ondragleave="rfImgDrop(event, false)" ondrop="rfImgDropFile(event)">
        ${RF.img.carico ? 'Leggo i file…' : 'Trascina qui i file di un CD (anche tutta la cartella), oppure scegli'}<br>
        <div class="row mt-8" style="gap:8px;justify-content:center">
          <label class="btn sm">File… <input type="file" multiple style="display:none" onchange="rfImgImporta(this.files)"></label>
          <label class="btn sm">Cartella… <input type="file" webkitdirectory multiple style="display:none" onchange="rfImgImporta(this.files)"></label>
        </div>
      </div>
      <p class="meta" style="margin:10px 0 0;line-height:1.55">I file restano su questo Mac e non escono mai: il browser riceve un'immagine già pronta, non il DICOM. L'esame si aggancia da solo al paziente quando <b>nome e data di nascita</b> del file combaciano con una persona sola della cartella; se no resta «da verificare», e lo abbina qualcuno.</p></div>`;
};

// «Dagli apparecchi»: quello che serve al tecnico che installa l'ecografo, e
// nient'altro. Il DICOM è uno standard pubblico dal 1993: l'apparecchio manda
// a chi risponde, e da oggi risponde la piattaforma.
function rfImgRicezione() {
  const r = RF.img.ricezione;
  if (!r || !r.attiva) {
    return `<div class="card mt-16"><div class="section-title">Dagli apparecchi (ecografo, RM, TAC)</div>
      <p class="meta" style="margin:8px 0 0;line-height:1.55">La ricezione diretta non è ancora accesa su questo server. Si accende una volta sola, da Terminale:
      <br><code>bash mac/installa-ricezione-dicom.sh</code><br>Da lì in poi gli apparecchi mandano gli esami qui dentro da soli, senza CD e senza chiavette.</p></div>`;
  }
  const dove = (r.indirizzi || []).length ? r.indirizzi.join(' oppure ') : 'l’indirizzo di questo Mac';
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Dagli apparecchi (ecografo, RM, TAC)</span>
      ${r.in_coda ? `<span class="badge warning">${r.in_coda} in arrivo</span>` : '<span class="badge success">in ascolto</span>'}</div>
    <p class="meta" style="margin:8px 0 10px;line-height:1.55">Sull'apparecchio si registra una destinazione DICOM con questi tre dati, e gli esami arrivano in cartella da soli.</p>
    <div class="kv"><b>AE Title di destinazione</b><span class="num">${rfEsc(r.ae_title)}</span><b>Indirizzo</b><span class="num">${rfEsc(dove)}</span><b>Porta</b><span class="num">${r.porta}</span></div>
    <p class="meta" style="margin:10px 0 0;line-height:1.55">${r.apparecchi.length
      ? `Apparecchi ammessi: <b>${r.apparecchi.map(rfEsc).join(', ')}</b>. Chi non è in elenco viene rifiutato e annotato.`
      : '<b>Nessun apparecchio ammesso</b>: finché l’elenco è vuoto non si accetta niente da nessuno. Gli AE Title si aggiungono in <code>~/referti-imaging/ricezione.conf</code>.'}
      Il tasto «prova connessione» dell'apparecchio (C-ECHO) deve dare esito positivo prima di mandare il primo esame.</p></div>`;
}

// Le misure dell'apparecchio. Non le fa la piattaforma e non le può fare: è
// scritto in destinazione-uso-immagini.md, e la riga sotto la tabella lo dice
// anche a chi guarda — perché un numero senza provenienza è un numero di cui
// qualcuno si prenderà la responsabilità per sbaglio.
function rfImgMisure(misure) {
  if (!misure || !misure.length) return '';
  const gruppi = [];
  for (const m of misure) {
    const g = m.gruppo || 'Misure';
    let riga = gruppi.find(x => x.nome === g);
    if (!riga) { riga = { nome: g, voci: [] }; gruppi.push(riga); }
    riga.voci.push(m);
  }
  const numero = (v) => String(Math.round(Number(v) * 100) / 100).replace('.', ',');
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Misure dell'apparecchio</span><span class="badge">${misure.length}</span></div>
    ${gruppi.map(g => `<div class="mt-8"><div class="caption" style="text-transform:uppercase;letter-spacing:.04em">${rfEsc(g.nome)}</div>
      <div class="kv">${g.voci.map(v => `<b>${rfEsc(v.nome)}</b><span class="num">${numero(v.valore)}${v.unita ? ` ${rfEsc(v.unita)}` : ''}</span>`).join('')}</div></div>`).join('')}
    <p class="rf-img-limite">Misurate <b>dall'apparecchio</b> al momento dell'esame e lette dal suo referto strutturato: la piattaforma le mostra, non le calcola e non le rifà. Se una misura va ripetuta, si ripete sulla console.</p></div>`;
}

function rfImgData(iso) {
  if (!iso) return 'data ignota';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function rfImgPeso(b) {
  const n = Number(b) || 0;
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`;
  if (n > 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} kB`;
}

function rfImgDettaglio() {
  const d = RF.img.dati;
  if (!d) return `<div class="page-head"><div><h2 class="page-title">Immagini</h2></div><div class="actions"><button class="btn" onclick="rfImgChiudi()">Indietro</button></div></div><div class="card"><div class="caption">Apro l'esame…</div></div>`;
  const e = d.esame;
  const s = rfImgSerieCorrente();
  const visibili = rfImgVisibili(s);
  const i = rfImgCorrente();
  const nonImmagini = (s && s.immagini ? s.immagini.length - visibili.length : 0);
  const finestre = d.finestre || [];
  const anteprima = (ser) => {
    const prima = (ser.immagini || []).find(x => x.immagine);
    return prima ? `<img src="/api/prototipo/imaging/immagine/${prima.id}?anteprima=1" alt="" loading="lazy">` : `<div style="aspect-ratio:1;border-radius:6px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px">nessuna<br>immagine</div>`;
  };
  return `
    <div class="page-head"><div><h2 class="page-title">${rfEsc(e.descrizione || 'Esame')}</h2>
      <div class="page-sub">${rfEsc(rfImgData(e.data_esame))} · ${rfEsc(e.modalita || '—')} · ${e.n_serie} serie · ${e.n_immagini} immagini${e.istituto ? ` · ${rfEsc(e.istituto)}` : ''}</div></div>
      <div class="actions">
        ${e.patient_id ? `<button class="btn" data-go="#/patients/${e.patient_id}">Cartella di ${rfEsc(e.paziente || '')}</button>` : `<button class="btn primary" onclick="rfImgAbbina('${e.id}')">Abbina a un paziente</button>`}
        <button class="btn" onclick="rfImgChiudi()">Indietro</button></div></div>

    ${e.patient_id ? '' : `<div class="rf-manc mb-16"><b>Non abbinato a nessuno.</b> Nel file c'è scritto «${rfEsc(e.paziente_dicom || 'niente')}»${e.paziente_nascita ? `, nato/a ${rfEsc(rfImgData(e.paziente_nascita))}` : ''}: non basta per riconoscerlo senza indovinare.</div>`}

    <div class="rf-img-corpo">
      <div class="rf-img-serie">
        ${(d.serie || []).map((x, n) => `<button class="rf-img-s ${n === RF.img.serie ? 'active' : ''}" onclick="rfImgVaiSerie(${n})">
          ${anteprima(x)}<div class="n"><b>${x.numero || n + 1}</b> · ${rfEsc(x.modalita || '')}<br>${rfEsc((x.descrizione || '').slice(0, 30) || '—')}<br>${x.n_immagini} img</div></button>`).join('')}
      </div>
      <div>
        <div class="rf-img-vista" onwheel="event.preventDefault(); rfImgScorri(event.deltaY > 0 ? 1 : -1)">
          ${i ? `<img src="${rfImgUrl(i, 1024, RF.img.frame)}" alt="Immagine ${RF.img.idx + 1}">
            <div class="rf-img-hud">${rfEsc(s.descrizione || s.modalita || '')}<br>${i.colonne || '?'}×${i.righe || '?'}</div>
            <div class="rf-img-hud destra">${RF.img.idx + 1} / ${visibili.length}${i.frame > 1 ? `<br>fotogramma ${RF.img.frame + 1} / ${i.frame}` : ''}${RF.img.ww !== null ? `<br>W ${RF.img.ww} / L ${RF.img.wl}` : ''}</div>
            <div class="limite">Consultazione — la diagnosi si fa sulla console dell'apparecchio o su un visualizzatore certificato</div>`
            : `<div class="vuoto">Questa serie non contiene immagini da disegnare${nonImmagini ? ` (${nonImmagini} ${nonImmagini === 1 ? 'oggetto DICOM non grafico' : 'oggetti DICOM non grafici'}: referti strutturati, PDF o modelli)` : ''}.</div>`}
        </div>
        ${i ? `<div class="rf-img-barra">
          <button class="btn sm" onclick="rfImgScorri(-1)">‹</button>
          <input type="range" min="0" max="${Math.max(0, visibili.length - 1)}" value="${RF.img.idx}" oninput="rfImgVai(this.value)" aria-label="Immagine della serie">
          <button class="btn sm" onclick="rfImgScorri(1)">›</button>
        </div>
        ${i.frame > 1 ? `<div class="rf-img-barra"><span class="caption">fotogrammi</span><input type="range" min="0" max="${i.frame - 1}" value="${RF.img.frame}" oninput="rfImgFrame(this.value)" aria-label="Fotogramma"></div>` : ''}
        ${finestre.length ? `<div class="row wrap mt-8" style="gap:6px"><span class="caption" style="align-self:center">finestra</span>
          <button class="btn sm ${RF.img.ww === null ? 'primary' : ''}" onclick="rfImgFinestra(null, null)">Del file</button>
          ${finestre.map(f => `<button class="btn sm ${RF.img.ww === f.ww && RF.img.wl === f.wl ? 'primary' : ''}" onclick="rfImgFinestra(${f.ww}, ${f.wl})">${rfEsc(f.nome)}</button>`).join('')}</div>` : ''}` : ''}
      </div>
    </div>

    ${rfImgMisure(d.misure)}

    <div class="card mt-16"><div class="card-head"><span class="section-title">Chi ha aperto questo esame</span><span class="caption">ultimi 20</span></div>
      <div class="list">${(d.accessi || []).map(a => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(a.chi || 'qualcuno')}</div><div class="sub">${rfEsc(a.azione)}</div></div><div class="caption">${rfEsc(rfModQuando(a.quando))}</div></div>`).join('') || '<div class="caption">Nessun accesso registrato.</div>'}</div></div>`;
}

/* Gli esami per immagini nella scheda del paziente: stanno con gli altri
   documenti, perché è lì che chi cura li cerca — non in una pagina a parte. */
RF.imgPaz = {};
async function rfImgDelPaziente(pid) {
  if (RF.imgPaz[pid] !== undefined) return;
  RF.imgPaz[pid] = null;
  try {
    const r = await fetch(`/api/prototipo/imaging?paziente=${encodeURIComponent(pid)}`, { credentials: 'include', cache: 'no-store' });
    RF.imgPaz[pid] = r.ok ? ((await r.json()).esami || []) : [];
  } catch { RF.imgPaz[pid] = []; }
  render();
}
const rfPatientDocsImg = typeof patientDocs === 'function' ? patientDocs : null;
if (rfPatientDocsImg) patientDocs = function (p) {
  const base = rfPatientDocsImg(p);
  if (!RF.live || !rfUuid(p.id)) return base;
  const mie = RF.imgPaz[p.id];
  if (mie === undefined) { void rfImgDelPaziente(p.id); return base; }
  if (mie === null) return base + '<div class="card mt-16"><div class="section-title">Immagini</div><div class="caption mt-8">Carico…</div></div>';
  return base + `<div class="card mt-16"><div class="card-head"><span class="section-title">Immagini</span><span class="badge count">${mie.length}</span></div>
    <div class="list">${mie.length ? mie.map(e => `<div class="list-item" style="cursor:pointer" onclick="go('#/imaging');rfImgApri('${e.id}')">
      <div class="grow"><div class="name">${rfEsc(e.descrizione || 'Esame')} <span class="badge">${rfEsc(e.modalita || '—')}</span></div>
        <div class="sub">${rfEsc(rfImgData(e.data_esame))} · ${e.n_immagini} immagini${e.istituto ? ` · ${rfEsc(e.istituto)}` : ''}</div></div>
      <button class="btn sm ghost">Apri</button></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun esame per immagini in cartella.</div>'}</div></div>`;
};


/* =====================================================================
   Converti audio (19.9.2026)
   =====================================================================
   Il dittafono Philips scrive .dss e .ds2, e quelli non li apre niente: né
   un telefono, né un player, né un collega. Qui un file entra e torna un
   MP3, convertito sul Mac dello studio con lo stesso decoder della catena.
   Niente si salva: il file va al server, il risultato torna al browser, i
   file di lavoro spariscono subito. Il download è locale, sul dispositivo
   di chi lo chiede. */
if (typeof NAV_META !== 'undefined') NAV_META.converti = ['Converti audio', 'mic'];
(function () { const st = document.createElement('style'); st.textContent = `
.rf-cv-drop { border:1.5px dashed var(--border); border-radius:12px; padding:26px 18px; text-align:center; color:var(--muted); font-size:13px; }
.rf-cv-drop.sopra { border-color:var(--cta); color:var(--cta); }
.rf-cv-riga { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
.rf-cv-riga:last-child { border-bottom:0; }
.rf-cv-riga .nome { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rf-cv-riga .stato { font-size:12px; color:var(--muted); white-space:nowrap; }
`; document.head.appendChild(st); })();

RF.cv = { file: [] };
const RF_CV_ESTENSIONI = ['.dss', '.ds2', '.wav', '.m4a', '.mp3', '.aac', '.ogg', '.opus', '.flac', '.wma', '.aiff', '.aif', '.amr', '.3gp', '.mp4', '.mov', '.webm'];

function rfCvPeso(b) { return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} kB`; }

async function rfCvConverti(files) {
  for (const f of files || []) {
    const ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const voce = { nome: f.name, byte: f.size, stato: RF_CV_ESTENSIONI.includes(ext) ? 'in coda' : 'formato non riconosciuto', url: null, errore: !RF_CV_ESTENSIONI.includes(ext), file: f };
    RF.cv.file.unshift(voce);
  }
  render();
  // Uno alla volta: il decoder dei .ds2 vuole tempo (4 s per minuto) e
  // due decodifiche insieme si rubano la memoria.
  for (const v of [...RF.cv.file].reverse()) {
    if (v.stato !== 'in coda') continue;
    v.stato = 'converto…'; render();
    try {
      const fd = new FormData(); fd.append('file', v.file);
      const r = await fetch('/api/prototipo/converti-audio', { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) { const j = await r.json().catch(() => ({})); v.stato = j.errore || `non riuscita (${r.status})`; v.errore = true; }
      else {
        const blob = await r.blob();
        v.url = URL.createObjectURL(blob); v.mp3 = blob.size; v.stato = 'pronto';
        v.mp3nome = v.nome.replace(/\.[^.]+$/, '') + '.mp3';
      }
    } catch { v.stato = 'piattaforma non raggiungibile'; v.errore = true; }
    v.file = null; render();
  }
}
function rfCvDrop(e, sopra) { e.preventDefault(); const z = document.getElementById('rf-cv-drop'); if (z) z.classList.toggle('sopra', sopra); }
function rfCvDropFile(e) { e.preventDefault(); rfCvDrop(e, false); if (e.dataTransfer) void rfCvConverti([...e.dataTransfer.files]); }
function rfCvSvuota() { for (const v of RF.cv.file) if (v.url) URL.revokeObjectURL(v.url); RF.cv.file = []; render(); }

PAGES.converti = () => {
  if (!RF.live) return rfPaginaPiattaforma('Converti audio', 'Dal dittafono a un MP3 che si apre ovunque');
  const righe = RF.cv.file.map(v => `<div class="rf-cv-riga">
      <span class="nome" title="${rfEsc(v.nome)}">${rfEsc(v.nome)} <span class="caption">${rfCvPeso(v.byte)}</span></span>
      <span class="stato ${v.errore ? 'danger' : ''}">${rfEsc(v.stato)}${v.mp3 ? ` · ${rfCvPeso(v.mp3)}` : ''}</span>
      ${v.url ? `<a class="btn sm primary" href="${v.url}" download="${rfEsc(v.mp3nome)}">Scarica MP3</a>` : v.stato === 'converto…' ? '<span class="spinner"></span>' : ''}
    </div>`).join('');
  return `
    <div class="page-head"><div><h2 class="page-title">Converti audio</h2><div class="page-sub">Dal dittafono (.dss, .ds2) a un MP3 che si apre ovunque</div></div>
      ${RF.cv.file.length ? `<div class="actions"><button class="btn" onclick="rfCvSvuota()">Svuota l'elenco</button></div>` : ''}</div>
    <div class="card">
      <div id="rf-cv-drop" class="rf-cv-drop" ondragover="rfCvDrop(event, true)" ondragleave="rfCvDrop(event, false)" ondrop="rfCvDropFile(event)">
        Trascina qui i file del dittafono, oppure<br>
        <div class="row mt-8" style="justify-content:center"><label class="btn sm">Scegli i file… <input type="file" multiple accept="${RF_CV_ESTENSIONI.join(',')}" style="display:none" onchange="rfCvConverti(this.files); this.value=''"></label></div>
      </div>
      ${righe ? `<div class="mt-16">${righe}</div>` : ''}
      <p class="meta" style="margin:14px 0 0;line-height:1.55">La conversione avviene <b>sul Mac dello studio</b>, con lo stesso decoder che usa la catena dei referti: il file non esce da qui e non viene conservato — entra, si converte, torna a te come MP3 e i file di lavoro spariscono. Va bene anche per wav, m4a, ogg e gli altri formati comuni. Un .ds2 cifrato con password non si lascia aprire.</p>
      <p class="rf-img-limite">Un dettato è un dato sanitario: l'MP3 che scarichi finisce sul tuo dispositivo, e da lì la responsabilità di dove va è tua — non mandarlo per e-mail o chat.</p>
    </div>`;
};
