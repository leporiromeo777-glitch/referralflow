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

