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
const RF = { live: false, data: null, queue: [], loaded: null, loading: null, meta: null, audioEl: null, medici: [], caricato: false, nonAutorizzato: false };
function rfDentro() { return /\/prototipo\//.test(location.pathname); }
const rfEsc = (s) => (typeof esc === 'function' ? esc(String(s ?? '')) : String(s ?? ''));

/* ---------- caricamento dei dati veri ---------- */
function rfSvuota(arr) { arr.length = 0; }
function rfRimpiazzaOggetto(obj, nuovo) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, nuovo); }

async function rfCaricaDati() {
  if (!rfDentro()) return;
  let r;
  try { r = await fetch('/api/prototipo/dati', { credentials: 'include' }); } catch (e) { return; }
  if (r.status === 401) { RF.nonAutorizzato = true; rfPaginaAccesso(); return; }
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
    RV_QUEUE.push({ id: x.id, p: x.p, doc: x.doc, type: x.type, at: x.at, audio: x.audio, issues: x.issues, crit: x.crit, est: x.est, state: x.state, note: x.note, blocked: false, status: x.status });
  }
  const nav = ['home', 'agenda', 'patients', 'reports', 'dittafono', 'documents', 'inbox', 'ai'];
  for (const k of Object.keys(NAV)) NAV[k] = nav.slice();
  render();
}

function rfPaginaAccesso() {
  const c = document.getElementById('content');
  if (!c) return;
  c.innerHTML = `<div class="page"><div class="card" style="max-width:520px;margin:40px auto;text-align:center">
    <h2 class="page-title">Accedi alla piattaforma</h2>
    <p class="meta" style="line-height:1.55">Questa è l'interfaccia nuova di ReferralFlow con i dati veri dello studio: serve la sessione della piattaforma. Nessun dato dimostrativo viene mostrato.</p>
    <a class="btn primary" href="/login" style="margin-top:12px;display:inline-flex">Vai al login</a>
  </div></div>`;
  const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
}

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
        <a class="nav-item" href="/" title="Piattaforma classica">${ICONS.home || ''}<span>Piattaforma classica</span></a>
        <button class="nav-item" id="collapse-btn" title="Comprimi barra laterale">${ICONS.panel}<span>Comprimi</span></button>
      </nav>
      <div class="sysbar"><span class="status"><i class="dot success"></i><span>Dati veri</span></span><span class="status"><i class="dot success"></i><span>AI locale</span></span></div>
    </div>`;
  document.getElementById('collapse-btn').onclick = () => { state.sidebarCollapsed = !state.sidebarCollapsed; render(); };
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
      <div class="actions"><button class="btn" data-go="#/agenda">${ICONS.agenda} Agenda</button><button class="btn" data-go="#/reports">${ICONS.reports} Referti</button><button class="btn ai" data-ai="Riassumi la giornata">${ICONS.ai} Brief AI</button></div></div>
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
      <div class="row mt-24"><button class="btn primary lg" data-go="#/patients/${next.p}">Scheda paziente</button><button class="btn lg" data-go="#/agenda">Agenda di oggi</button></div>
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
function rfPaginaPiattaforma(titolo, testo, href) {
  return `<div class="page-head"><div><h2 class="page-title">${titolo}</h2><div class="page-sub">${testo}</div></div></div>
    <div class="card"><p class="meta" style="margin:0 0 12px;line-height:1.55">Questa sezione non ha ancora dati propri nell'interfaccia nuova: la versione operativa è nella piattaforma classica.</p><a class="btn primary" href="${href}">Apri nella piattaforma</a></div>`;
}
const rfOrig = {};
for (const [k, titolo, testo, href] of [
  ['statistics', 'Statistiche', 'Tempi, volumi, qualità della catena', '/statistiche'],
  ['administration', 'Amministrazione', 'Fatture e prestazioni', '/impostazioni'],
  ['system', 'Sistema', 'Utenti, sicurezza, modelli', '/impostazioni/utenti'],
  ['communications', 'Comunicazioni', 'Telefonate, e-mail, consulti', '/consulti'],
  ['visits', 'Visite', 'Visite registrate', '/visite'],
  ['knowledge', 'Knowledge', 'La conoscenza degli agenti sta nella wiki', '/referti/qualita'],
  ['anonymize', 'Anonimizzazione', 'Documenti anonimizzati in locale', '/anonimizza'],
]) {
  rfOrig[k] = PAGES[k];
  PAGES[k] = () => (RF.live ? rfPaginaPiattaforma(titolo, testo, href) : rfOrig[k] ? rfOrig[k]() : '');
}
const rfAiPageOrig = PAGES.ai;
PAGES.ai = () => (RF.live ? `<div class="page-head"><div><h2 class="page-title">AI</h2><div class="page-sub">Modello locale, nessun cloud: chiedi dalla barra a destra (⌘/)</div></div></div>
  <div class="card"><p class="meta" style="margin:0;line-height:1.55">L'assistente risponde sui numeri e sulle liste della giornata già caricate qui (agenda, attività, referti, documenti) con il modello locale della piattaforma. Non dà consigli clinici e non inventa dati: se una cosa non c'è, lo dice. Le proposte per la wiki e la qualità della catena sono in <a href="/referti/qualita">Qualità AI</a>.</p></div>` : rfAiPageOrig());

/* ---------- Referti: coda vera + caricamento audio ---------- */
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
          <div class="row" style="gap:8px"><b>${rfEsc(fullName(P[r.p]))}</b><span class="badge ${st[1]}">${st[0]}</span>${r.status === 'APPROVED' ? '<span class="badge success">confermato</span>' : ''}</div>
          <div class="caption">${rfEsc(DOCTORS[r.doc] || '')} · ${rfEsc(r.type)} · ${r.at}</div>
          <div class="sub" style="font-size:12.5px;color:var(--text-2);margin-top:2px">${rfEsc(r.note)}</div>
        </div>
        <div class="qm"><span class="v num">${r.issues}</span><span class="l">verifiche</span></div>
        <div class="qm"><span class="v num ${r.crit ? 'crit' : ''}">${r.crit}</span><span class="l">critiche</span></div>
        <div class="qm"><span class="v num">${r.audio}</span><span class="l">audio</span></div>
        <button class="btn ${r.state === 'priority' ? 'primary' : ''}" data-go="#/review/${r.id}">${r.status === 'APPROVED' ? 'Rileggi' : r.state === 'clean' ? 'Lettura rapida' : 'Apri revisione'}</button>
        <a class="btn ghost" href="/referti/${r.id}" title="Revisione e conferma nella piattaforma">Piattaforma</a>
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
      ${inCoda.length ? `<div class="list mt-8">${inCoda.map(a => `<div class="list-item"><i class="dot accent"></i><div class="grow"><div class="name" style="font-size:13px">${rfEsc(a.name)}</div><div class="sub">in lavorazione · ${rfEsc(a.fase || '')} · ${a.at}${a.medico ? ` · ${rfEsc(DOCTORS[a.medico] || a.medico)}` : ''}</div></div></div>`).join('')}</div>` : ''}
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
  if (!RF.live || !id || !/^[0-9a-f-]{36}$/.test(id)) return RF.live ? rfPaginaPiattaforma('Revisione guidata', 'Scegli un referto dalla coda', '/referti') : rfReviewOrig();
  if (RF.loaded !== id) {
    if (RF.loading !== id) { RF.loading = id; void rfCaricaRevisione(id); }
    return `<div class="page-head"><div><h2 class="page-title">Revisione guidata</h2><div class="page-sub">Carico la bozza dalla piattaforma…</div></div></div>`;
  }
  const m = RF.meta || {};
  const html = rfReviewOrig();
  const testata = `<div class="rv-pat">${ICONS.shield}<b>${rfEsc(m.paziente || 'Paziente non indicato')}</b><span>${rfEsc(m.nascita || '')}</span><span class="sep">·</span><span>${m.tipo === 'visita' ? 'Visita' : 'Referto'}</span><span class="sep">·</span><span>${rfEsc(m.medico || '')}</span><span class="sep">·</span><span>${RV_AUDIO.label}</span>${m.stato === 'confermata' ? '<span class="sep">·</span><span class="badge success">confermato</span>' : ''}</div>`;
  return html.replace(/<div class="rv-pat">[\s\S]*?<\/div>/, testata);
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
    localStorage.removeItem(RV_KEY);
    RV.issues = [];
    rfAudioSetup(j.audio.url);
    render();
  } catch (e) { RF.loading = null; toast('Bozza non disponibile'); }
}
function rfTestoRicomposto() {
  const blocchi = [];
  for (const s of RV_REPORT) {
    const frasi = s.parts.filter(p => !RV.removed[p.id]).map(p => (RV.text[p.id] != null ? RV.text[p.id] : p.t).trim()).filter(Boolean);
    for (const a of RV.added.filter(x => x.section === s.code)) if (a.text && a.text.trim()) frasi.push(a.text.trim());
    if (frasi.length) blocchi.push(frasi.join(' '));
  }
  return blocchi.join('\n\n');
}
const rfFinishOrig = rvFinish;
rvFinish = function () {
  if (!RF.live || !RF.loaded) return rfFinishOrig();
  const block = rvBlocking();
  if (block.length) return rfFinishOrig();
  const testo = rfTestoRicomposto();
  const cats = {};
  RV.issues.filter(i => i.status === 'corrected').forEach(i => { const c = RV_CAT[i.cat][0]; cats[c] = (cats[c] || 0) + 1; });
  openModal('Salva la revisione nella piattaforma', `
    <div class="kv"><b>Verifiche</b><span>${rvDone()} di ${RV.issues.length} controllate</span><b>Correzioni</b><span>${RV.metrics.corrections}</span><b>Audio consultato</b><span>${RV.metrics.plays} volte</span><b>Testo</b><span>${testo.length} caratteri</span></div>
    ${Object.keys(cats).length ? `<div class="mt-16"><div class="caption">Correzioni per categoria</div><div class="row wrap mt-8" style="gap:6px">${Object.entries(cats).map(([c, n]) => `<span class="badge">${c} ×${n}</span>`).join('')}</div></div>` : ''}
    <p class="caption mt-16">Il testo ricomposto entra nella bozza della piattaforma come lavoro in corso (non conferma). La conferma, con la presa d'atto sui punti critici, resta nella piattaforma.</p>`,
    `<button class="btn" data-close>Continua a rivedere</button><button class="btn primary" id="rf-finish-ok">Salva nella piattaforma</button>`);
  document.getElementById('rf-finish-ok').onclick = async () => {
    const b = document.getElementById('rf-finish-ok'); b.disabled = true; b.textContent = 'Salvo…';
    try {
      const r = await fetch(`/api/prototipo/referti/${RF.loaded}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo, correzioni: RV.metrics.corrections, verifiche: rvDone() }) });
      if (!r.ok) throw new Error(String(r.status));
      rvLog('SECRETARY_REVIEW_COMPLETED', `${RV.metrics.corrections} correzioni · salvato nella piattaforma`);
      localStorage.removeItem(RV_KEY);
      closeModal(); toast('Salvato nella piattaforma: conferma da lì quando sei pronto');
      window.open(`/referti/${RF.loaded}`, '_blank');
      go('#/reports');
    } catch (e) {
      b.disabled = false; b.textContent = 'Salva nella piattaforma';
      toast(e.message === '409' ? 'La bozza è già confermata: non si può più modificare' : 'Salvataggio non riuscito');
    }
  };
};

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

/* ---------- il bot: sidebar AI sul modello locale della piattaforma ---------- */
function rfContestoBot() {
  const s = RF.data ? RF.data.stats : {};
  const p = state.patientCtx ? P[state.patientCtx] : null;
  return {
    oggi: new Date().toISOString().slice(0, 10), ruolo: state.role, pagina: state.route,
    numeri: s,
    agenda_oggi: APPTS.map(a => ({ ora: a.start, paziente: fullName(P[a.p]), medico: DOCTORS[a.doc], motivo: a.reason, stato: STATUS_LABEL[a.status] || a.status, in_ritardo: !!a.late })),
    attivita: TASKS.slice(0, 25).map(t => ({ titolo: t.title, scadenza: t.due, priorita: t.prio })),
    referti: RF.queue.slice(0, 15).map(r => ({ paziente: fullName(P[r.p]), medico: DOCTORS[r.doc], stato: r.status === 'APPROVED' ? 'confermato' : 'da controllare', verifiche: r.issues, critiche: r.crit, nota: r.note, quando: r.at })),
    documenti_recenti: DOCUMENTS.slice(0, 15).map(d => ({ titolo: d.t, paziente: P[d.p] ? fullName(P[d.p]) : null, tipo: DOC_TYPE[d.type] || d.type, data: d.date })),
    paziente_aperto: p ? { nome: fullName(p), nascita: p.dob, referral: p.referrals || [], documenti: (p.docs || []).map(d => ({ titolo: d.t, data: d.d })), prossimo: p.next, ultima_visita: p.lastVisit, medico_inviante: p.gp } : null,
  };
}
const rfAskOrig = askAI;
askAI = function (q) {
  if (!RF.live) return rfAskOrig(q);
  if (!state.aiOpen) state.aiOpen = true;
  state.aiMessages.push({ html: `<div class="ai-msg user">${rfEsc(q)}</div>` });
  state.aiState = 'thinking';
  const thinkingId = 'th' + Date.now();
  state.aiMessages.push({ id: thinkingId, html: `<div class="ai-msg ai" id="${thinkingId}"><div class="ai-steps"><div class="s cur"><span class="dot accent"></span>Leggo i dati della giornata</div><div class="s"><span class="dot"></span>Chiedo al modello locale</div></div></div>` });
  render();
  fetch('/api/prototipo/assistente', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domanda: q, ruolo: state.role, contesto: rfContestoBot() }) })
    .then(r => r.json())
    .then(j => {
      state.aiMessages = state.aiMessages.filter(m => m.id !== thinkingId);
      const testo = rfEsc(j.risposta || 'Nessuna risposta.').replace(/\n/g, '<br>');
      state.aiMessages.push({ html: `<div class="ai-msg ai">${testo}<div class="srcs"><span class="src">${j.fonte === 'modello locale' ? 'Modello locale · dati della piattaforma' : 'Piattaforma'}</span></div></div>` });
      state.aiState = 'idle'; render();
    })
    .catch(() => {
      state.aiMessages = state.aiMessages.filter(m => m.id !== thinkingId);
      state.aiMessages.push({ html: `<div class="ai-msg ai">L'assistente non è raggiungibile in questo momento.</div>` });
      state.aiState = 'idle'; render();
    });
};

/* ---------- avvio ---------- */
window.addEventListener('load', () => {
  if (!rfDentro()) return;
  void rfCaricaMedici();
  void rfCaricaDati();
  setInterval(() => { if (RF.live && state.route !== 'review') void rfCaricaDati(); }, 120000);
});
