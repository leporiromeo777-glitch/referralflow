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
        <button class="btn ${r.state === 'priority' ? 'primary' : ''}" data-go="#/review/${r.id}">${r.status === 'APPROVED' ? 'Rileggi' : r.rivisto ? 'Riprendi e conferma' : r.state === 'clean' ? 'Lettura rapida' : 'Apri revisione'}</button>${r.status !== 'APPROVED' ? `<button class="btn ghost" data-prefirma="${r.id}" title="Controllo prima della firma, con traccia">✓ Controllo</button>` : ''}<button class="btn" onclick="event.stopPropagation();rfWord('${rfEsc(r.id)}')" title="${r.status === 'APPROVED' ? 'Il Word del referto confermato' : 'Il Word della bozza com\'è adesso, con le correzioni già salvate'}">${ICONS.file} Scarica Word</button>
      </div>
    </div>`;
  };
  const tot = aperti.reduce((s, r) => s + r.issues, 0), crit = aperti.reduce((s, r) => s + r.crit, 0);
  const inCoda = (typeof AUDIO_INBOX !== 'undefined' ? AUDIO_INBOX : []);
  // Un audio appena caricato sta nella coda come le bozze, non in un elenco a
  // parte sotto il modulo (19.9.2026, richiesta utente): finché la catena
  // lavora è una scheda «in elaborazione» senza numeri; quando la bozza
  // arriva, la scheda è la bozza stessa. Restano schede solo i casi che
  // chiedono attenzione: la catena che non consegna, e il «già dettato».
  const rigaAudio = (a) => {
    const quando = a.at ? ` · ${a.at}` : '';
    const chi = rfEsc(a.medico ? (DOCTORS[a.medico] || ((RF.medici || []).find(m => m.id === a.medico) || {}).nome || a.medico) : '');
    if (a.state === 'duplicate') return `<div class="card q lavoro">
      <div class="row wrap" style="gap:12px"><div class="avatar-sm">${initials({ first: 'Già', last: 'dettato' })}</div>
        <div class="grow" style="min-width:220px"><div class="row" style="gap:8px"><b>Già dettato${a.paziente ? ` · ${rfEsc(a.paziente)}` : ''}</b><span class="badge warning">stesso audio</span></div>
          <div class="caption">${chi}${quando} · stesso audio di un referto del ${rfEsc(a.bozzaData || '')}: nessuna bozza nuova</div></div>
        <button class="btn" data-go="#/review/${a.bozza}">Apri quello</button></div></div>`;
    if (a.state === 'failed') return `<div class="card q lavoro">
      <div class="row wrap" style="gap:12px"><div class="avatar-sm">!</div>
        <div class="grow" style="min-width:220px"><div class="row" style="gap:8px"><b>Elaborazione senza bozza</b><span class="badge danger">da guardare</span></div>
          <div class="caption">${chi}${quando} · la catena non ha consegnato niente: il file è in errori/ sul Mac</div></div></div></div>`;
    return `<div class="card q lavoro">
      <div class="row wrap" style="gap:12px"><div class="avatar-sm"><span class="spinner"></span></div>
        <div class="grow" style="min-width:220px"><div class="row" style="gap:8px"><b>${a.aggiunge_a ? 'Seconda traccia' : a.fase === 'in_coda' ? 'In coda' : 'In elaborazione'}</b>${a.aggiunge_a ? `<span class="badge">si aggiunge a ${rfEsc(a.paziente || 'un referto')}</span>` : ''}<span class="badge">${a.fase && a.fase !== 'in_coda' && a.fase !== 'elaborazione' ? rfEsc(a.fase) : 'catena'}</span></div>
          <div class="caption">${chi}${quando} · la catena impiega 4-10 minuti; la scheda diventa la bozza da sola</div></div>
        <div class="qm"><span class="v num">…</span><span class="l">verifiche</span></div><div class="qm"><span class="v num">…</span><span class="l">critiche</span></div></div></div>`;
  };
  const medici = RF.medici.length ? RF.medici : Object.entries(DOCTORS).map(([id, nome]) => ({ id, nome }));
  return `
    <div class="page-head"><div><h2 class="page-title">Referti</h2><div class="page-sub">${aperti.length} da controllare · ${tot} verifiche · ${crit} critiche · ${chiusi.length} confermati negli ultimi 30 giorni</div></div>
      <div class="actions"><div class="seg">${[['priority', 'Priorità'], ['time', 'Ora'], ['doctor', 'Medico'], ['patient', 'Paziente']].map(([k, l]) => `<button class="${sort === k ? 'active' : ''}" onclick="state.qSort='${k}';render()">${l}</button>`).join('')}</div><button class="btn" data-go="#/dittafono">${ICONS.mic || ''} Detta dal telefono</button></div></div>
    <div class="card mb-16" id="rf-intake">
      <div class="card-head"><span class="section-title">Nuovo dettato</span><span class="caption">DS2, m4a, wav, mp3 · va alla coda della catena</span></div>
      <div class="row wrap" style="gap:10px;align-items:center">
        <select id="rf-intake-medico" class="input sm">${medici.map(m => `<option value="${rfEsc(m.id)}">${rfEsc(m.nome)}</option>`).join('')}</select>
        <select id="rf-intake-tipo" class="input sm"><option value="referto">Referto</option><option value="visita">Visita registrata</option></select>
        <input type="file" id="rf-intake-file" accept=".ds2,.dss,.m4a,.mp3,.wav,.aac,.ogg,.flac,.caf,.mp4" class="input sm" style="max-width:320px">
        <button class="btn primary" id="rf-intake-invia">Invia alla catena</button>
        <span class="caption" id="rf-intake-esito"></span>
      </div>
    </div>
    <div class="stack">${[...inCoda.filter(a => a.state !== 'ready').map(rigaAudio), ...ordina(aperti).map(riga)].join('') || '<div class="card"><div class="caption">Nessuna bozza da controllare.</div></div>'}</div>
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
    ? `<button class="btn sm ghost" onclick="rfImpagina()" title="${m.formato === 'lettera' ? 'Formato del medico: lettera al collega («Caro …,», corpo, saluto, terapia dalla lettera precedente)' : 'Formato del medico: rapporto a sezioni'}">${ICONS.ai || ''} ${m.formato === 'lettera' ? 'Impagina come lettera' : 'Riorganizza nel formato'}</button><button class="btn sm ghost" onclick="rfDuplica('${id}')" title="Quando in un solo audio ci sono due referti di due pazienti: crea una copia di questa bozza, con lo stesso audio, da tagliare per il secondo">Duplica</button><label class="btn sm ghost" title="Quando il medico ha spezzato il dettato in due file: il secondo si aggiunge in fondo a questo referto, e nel riascolto le due tracce sono una sola">${m.tracce_in_arrivo ? 'Traccia in arrivo…' : 'Aggiungi traccia audio'}<input type="file" accept=".ds2,.dss,.m4a,.mp3,.wav,.aac,.ogg,.flac,.caf,.mp4" style="display:none" ${m.tracce_in_arrivo ? 'disabled' : ''} onchange="rfTracciaAggiungi('${id}', this)"></label><button class="btn sm ghost" onclick="rfWord('${id}')" title="Word con la carta intestata del medico, dal testo salvato">Word</button>`
    : `<button class="btn sm ghost" onclick="rfDuplica('${id}')" title="Anche da un referto già confermato: la copia riparte dal dettato della catena, da tagliare per il secondo paziente">Duplica</button><button class="btn sm ghost" onclick="rfWord('${id}')">Word</button>`;
  html = html.replace('<div class="rv-top-r">', `<div class="rv-top-r">${bottoni}`);
  const note = Array.isArray(m.note_segreteria) ? m.note_segreteria.filter(n => typeof n === 'string' && n.trim()) : [];
  // Ogni nota ha «Rimetti»: la catena a volte scambia una frase clinica per
  // un'istruzione alla segretaria, e prima non c'era modo di riportarla nel
  // referto (19.9.2026). Le note già rimesse non si mostrano più.
  const rimesse = RF.noteRimesse || new Set();
  const daMostrare = note.map((n, k) => ({ n, k })).filter(x => !rimesse.has(x.k));
  if (daMostrare.length) html = html.replace('<div class="rv-grid', `<div class="rf-note-seg">${ICONS.tasks || ''}<b>Note per la segreteria (${daMostrare.length})</b>${daMostrare.map(x => `<span class="badge" style="display:inline-flex;gap:6px;align-items:center">${rfEsc(x.n)}${m.stato === 'bozza' ? `<button class="btn sm ghost" style="padding:0 6px;height:20px" onclick="rfNotaRimetti(${x.k})" title="Riporta questa frase nel testo del referto">Rimetti</button>` : ''}</span>`).join('')}<span class="caption">Istruzioni dettate dal medico, tolte dal testo del referto.${rimesse.size ? ` ${rimesse.size === 1 ? 'Una rimessa' : `${rimesse.size} rimesse`} nel referto.` : ''}</span></div><div class="rv-grid`);
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
    RF.noteRimesse = new Set();
    if (j.revisione_prototipo && typeof j.revisione_prototipo === 'object') {
      const rp = j.revisione_prototipo;
      (Array.isArray(rp.note_rimesse) ? rp.note_rimesse : []).forEach(k => { if (Number.isInteger(k)) RF.noteRimesse.add(k); });
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
    rfAudioSetup(j.audio.url, j.tracce);
    render();
  } catch (e) { RF.loading = null; toast('Bozza non disponibile'); }
}
/* Ricompone il testo dalle frasi: le frasi che iniziavano una riga (nl)
   restano a capo, le altre seguono sulla stessa riga; le sezioni (paragrafi)
   restano separate da una riga vuota; le aggiunte vanno subito dopo la frase
   indicata in «after» (il punto del dettato), le altre in coda alla sezione. */
function rfTestoRicomposto() {
  const blocchi = [];
  for (const s of RV_REPORT) {
    let testo = '';
    const aggiunte = RV.added.filter(x => x.section === s.code && x.text && x.text.trim());
    const messe = new Set();
    const metti = id => aggiunte.filter(a => a.after === id).forEach(a => { messe.add(a); testo += (testo ? ' ' : '') + a.text.trim(); });
    metti('^');
    for (const p of s.parts) {
      const t = RV.removed[p.id] ? '' : (RV.text[p.id] != null ? RV.text[p.id] : p.t).trim();
      if (t) testo += testo ? (p.nl ? '\n' : ' ') + t : t;
      metti(p.id);   // anche dopo una frase tolta: il punto resta quello
    }
    for (const a of aggiunte) if (!messe.has(a)) testo += (testo ? '\n' : '') + a.text.trim();
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
  return { note_rimesse: [...(RF.noteRimesse || [])], issues: RV.issues.map(i => ({ id: i.id, status: i.status, resolution: i.resolution, cat: i.cat, testo: String((i.span && RV.text[i.span]) || i.now || '').slice(0, 60) })), metrics: RV.metrics, log: (RV.log || []).slice(-200), cur: RV.cur, t: RV.t, motivazioni: RF.motivazioni || {}, tolte };
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
  if (!confirm('Creo una copia di questo referto che riparte dal dettato della catena — senza le correzioni fatte qui, con lo stesso audio — da tagliare per l’altro paziente. L’originale resta com’è. Continuo?')) return;
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


/* ---------- seconda traccia audio (19.9.2026) ---------- */
// Il secondo file di un dettato spezzato in due va nella stessa coda della
// catena, ma dichiarando a quale bozza si aggiunge. Alla consegna il testo
// finisce in fondo a questo referto e le due tracce si riascoltano di seguito.
async function rfTracciaAggiungi(id, input) {
  const f = input && input.files && input.files[0]; if (!f) return;
  if (!confirm(`Aggiungo «${f.name}» come seconda traccia di questo referto: la catena la trascrive (4-10 minuti) e il testo si aggiunge in fondo. Continuo?`)) { input.value = ''; return; }
  const fd = new FormData(); fd.append('audio', f);
  toast('Invio la traccia…');
  try {
    const r = await fetch(`/api/prototipo/referti/${id}/audio`, { method: 'POST', credentials: 'include', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.errore || 'Invio non riuscito'); input.value = ''; return; }
    toast('Traccia in coda: il testo si aggiunge da solo quando la catena finisce');
    if (RF.meta) RF.meta.tracce_in_arrivo = (RF.meta.tracce_in_arrivo || 0) + 1;
    render();
  } catch { toast('Piattaforma non raggiungibile'); }
  input.value = '';
}

/* ---------- punto di rientro nel dettato (23.9.2026) ---------- */
/* Richiesta dello studio: «Rimetti» deve rimettere la frase esattamente dove
   la catena l'aveva tolta, non in coda. Il punto si ritrova dall'audio: il
   momento in cui la frase è stata detta (le sue parole nella trascrizione con
   i tempi, o il secondo già noto per le omissioni) e il momento di ogni frase
   del referto; va subito dopo l'ultima frase detta prima. Null se non si
   ritrova con sicurezza (meno di metà delle parole): allora si fa come prima. */
function rfTokRientro(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || []; }
function rfTempoDi(testo, seg) {
  const t = new Set(rfTokRientro(testo));
  const w = (seg && Array.isArray(seg.w)) ? seg.w.find(([, x]) => t.has(rfTokRientro(x)[0])) : null;
  return w ? w[0] : (seg ? seg.s : null);
}
function rfPuntoDiRientro(testo, secondo) {
  const segs = typeof RV_TRANSCRIPT !== 'undefined' ? RV_TRANSCRIPT : [];
  if (!segs.length || typeof RV_REPORT === 'undefined') return null;
  let quando = typeof secondo === 'number' && secondo >= 0 ? secondo : null;
  if (quando === null) {
    const t = new Set(rfTokRientro(testo)); if (!t.size) return null;
    let best = null, bp = 0;
    for (const s of segs) { const ts = new Set(rfTokRientro(s.tx)); let c = 0; for (const w of t) if (ts.has(w)) c++; if (c / t.size > bp) { bp = c / t.size; best = s; } }
    if (!best || bp < 0.5) return null;
    quando = rfTempoDi(testo, best);
  }
  const perId = new Map(segs.map(s => [s.id, s]));
  let dopo = null, tDopo = -1;
  for (const sz of RV_REPORT) for (const p of sz.parts) {
    const seg = p.src ? perId.get(p.src) : null; if (!seg) continue;
    const tp = rfTempoDi(p.t, seg);
    if (tp !== null && tp < quando && tp >= tDopo) { tDopo = tp; dopo = { section: RV.moved[p.id] || sz.code, after: p.id }; }
  }
  if (dopo) return dopo;
  return RV_REPORT.length ? { section: RV_REPORT[0].code, after: '^' } : null;
}

/* ---------- note alla segretaria: «Rimetti nel referto» (19.9.2026) ---------- */
// Si sceglie la sezione (la frase va in coda a quella), e la nota diventa una
// frase aggiunta: entra nel testo ricomposto, nel salvataggio e nel Word come
// le altre aggiunte. Nel testo si vede evidenziata come «aggiunta a mano».
function rfNotaRimetti(k) {
  const m = RF.meta || {};
  const note = Array.isArray(m.note_segreteria) ? m.note_segreteria.filter(n => typeof n === 'string' && n.trim()) : [];
  const testo = note[k]; if (!testo) return;
  if (m.stato !== 'bozza') { toast('Il referto è già confermato'); return; }
  const sezioni = (typeof RV_REPORT !== 'undefined' ? RV_REPORT : []).map(sz => ({ code: sz.code, label: sz.label }));
  if (!sezioni.length) { toast('Nessuna sezione in cui rimetterla'); return; }
  const ultima = sezioni[sezioni.length - 1].code;
  const pos = rfPuntoDiRientro(testo);
  openModal('Rimetti nel referto', `<p style="margin:0 0 10px">${rfEsc(testo)}</p>
    <div class="field"><label>Dove</label><select class="input" id="rf-nota-sez">${pos ? '<option value="__dettato" selected>Dove era nel dettato</option>' : ''}${sezioni.map(sz => `<option value="${rfEsc(sz.code)}" ${!pos && sz.code === ultima ? 'selected' : ''}>In coda a: ${rfEsc(sz.label)}</option>`).join('')}</select></div>
    <p class="caption mt-8">${pos ? 'Torna esattamente nel punto del dettato da cui la catena l’aveva tolta.' : 'Il punto del dettato non si ritrova: la frase va in coda alla parte scelta.'} Resta evidenziata come aggiunta a mano: da lì si può correggere o togliere come ogni altra.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-nota-ok">Rimetti</button>`);
  document.getElementById('rf-nota-ok').onclick = () => {
    const scelta = document.getElementById('rf-nota-sez').value || ultima;
    const sez = scelta === '__dettato' && pos ? pos.section : scelta;
    RV.added = RV.added || [];
    RV.added.push({ id: `nota-${k}-${Date.now()}`, section: sez, after: scelta === '__dettato' && pos ? pos.after : undefined, text: testo });
    RF.noteRimesse = RF.noteRimesse || new Set(); RF.noteRimesse.add(k);
    rvLog('NOTE_RESTORED', `nota ${k + 1} rimessa in ${sez}`);
    closeModal(); rvSave(); rvAfterRender();
    // la barra delle note sta fuori dal testo: si ridisegna la pagina
    render();
    toast('Frase rimessa nel referto');
  };
}

/* ---------- frasi tolte barrate e tasto «Edita» (14.9.2026) ---------- */
/* Durante la correzione una frase tolta resta nel testo centrale, barrata a
   tratteggio (clic: rimettila o lasciala tolta); nella lettura pulita, nel
   testo salvato e nel Word non c'è. «Edita» apre tutto il testo pulito in una
   finestra per correggerlo a mano: si salva nella piattaforma e la revisione
   si ricalcola sul nuovo testo, riapplicando gli esiti alle segnalazioni che
   coincidono. */
(function () { const st = document.createElement('style'); st.textContent = `
  .card.q.lavoro { border-left-color: var(--border-2); opacity: .92; }
  .card.q.lavoro .spinner { width: 14px; height: 14px; }
  .rv-span.rf-tolta { text-decoration: line-through; text-decoration-style: dashed; text-decoration-thickness: 1.5px; text-decoration-color: var(--danger); color: var(--text-3); cursor: pointer; }
  .rv-span.rf-tolta:hover { background: var(--danger-soft); border-radius: 4px; }
  .rv.read .rv-span.rf-tolta { display: none; }
  .rv-legend .lg.tolta { border-bottom: none; text-decoration: line-through dashed var(--danger); color: var(--text-3); }
  .rf-edita { width: 100%; min-height: 55vh; height: auto; padding: 10px 12px; border-radius: var(--r-input); border: 1px solid var(--border); background: var(--surface-2); resize: vertical; line-height: 1.55; font: inherit; font-size: 14px; }
  .rf-edita:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--surface); }
  @media (max-width: 767px) { .rf-edita { min-height: 50vh; } }
  .rv-doc.rf-modifica, .rv-doc.rf-modifica .rv-span { cursor: text; }
  .rv-doc.rf-modifica .rv-sec p { border-radius: 6px; box-shadow: 0 0 0 1px var(--border) inset; padding: 4px 6px; }
  .rv-doc.rf-modifica .rv-sec p:focus { box-shadow: 0 0 0 2px var(--accent-soft) inset; }
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
  // Interruttore come «Nascondi», ma il testo NON si muove (19.9.2026,
  // richiesta utente): niente area a parte, niente ridisegno. Acceso, il
  // testo che c'è diventa scrivibile al suo posto, come in Word — il clic su
  // una frase mette il cursore invece di aprire la segnalazione o cercare
  // l'audio. Ogni frase cambiata si salva da sé (rvHumanEdit), come le
  // correzioni fatte finora frase per frase.
  if (RF.pennello) rfPennello(false);
  RF.editaInline = !RF.editaInline;
  rfEditaInlineApplica();
  const eb = document.getElementById('rf-edita-btn'); if (eb) { eb.classList.toggle('primary', !!RF.editaInline); eb.innerHTML = RF.editaInline ? 'Chiudi modifica' : `${(typeof ICONS !== 'undefined' && ICONS.edit) || ''} Edita`; }
  const vb = document.getElementById('rf-vtutto-btn'); if (vb) vb.hidden = RV.mode === 'read' || !!RF.editaInline || !(typeof rvOpen === 'function' && rvOpen().length);
  const pb = document.getElementById('rf-pennello-btn'); if (pb) pb.hidden = RV.mode === 'read' || !!RF.editaInline;
  toast(RF.editaInline ? 'Modifica accesa: clicca sul testo e scrivi, si salva da sé' : 'Modifica chiusa');
}
// Accende o spegne la scrittura sul testo così com'è: solo una classe e
// contenteditable, nessun ridisegno — il testo resta esattamente dov'era.
function rfEditaInlineApplica() {
  const doc = document.querySelector('#rv-main .rv-doc'); if (!doc) return;
  doc.classList.toggle('rf-modifica', !!RF.editaInline);
  doc.querySelectorAll('[data-sec-body]').forEach(p => p.setAttribute('contenteditable', RV.mode === 'read' || RF.pennello ? 'false' : 'true'));
  document.querySelectorAll('.rv-mini').forEach(x => x.remove());
}
const rfSpanClickEdita = rvSpanClick;
rvSpanClick = function (id) {
  // In modifica il clic mette il cursore: niente salto alla segnalazione.
  if (RF.live && RF.editaInline) return;
  return rfSpanClickEdita(id);
};
const rfHoverEdita = rvHover;
rvHover = function (sp) {
  if (RF.live && RF.editaInline) return;
  return rfHoverEdita(sp);
};

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
/* «Rimetti nel referto» rimette la frase tolta nel punto del dettato da cui
   era stata tolta (rfPuntoDiRientro; in coda all'ultima sezione se non si ritrova); «Lascia fuori» la lascia fuori. Le note per
   la segreteria (allega, invia, richiama…) stanno in una striscia sopra il
   testo: sono istruzioni, non testo del referto. */
const rfChooseOrig = rvChoose;
rvChoose = function (k) {
  const i = typeof rvIssue === 'function' ? rvIssue() : null;
  if (RF.live && i && i.status === 'open' && i.cat === 'STRUCTURE' && i.add && i.opts && i.opts[k]) {
    const o = i.opts[k];
    if (o.l === 'Rimetti nel referto') { const pos = rfPuntoDiRientro(i.add.text); RV.added.push({ id: 'add-' + i.id, section: (pos && pos.section) || i.add.section, after: pos ? pos.after : undefined, text: i.add.text }); i.status = 'corrected'; i.resolution = 'rimessa nel referto'; RV.metrics.corrections++; rvLog('CORRECTION', i.id + ': frase tolta rimessa'); }
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
      ${rvBlocking().length ? `<div class="rv-block">${ICONS.alert || ''} ${rvBlocking().length === 1 ? '1 verifica obbligatoria' : `${rvBlocking().length} verifiche obbligatorie`}</div>` : '<div class="rv-ok">Controlli obbligatori completati</div>'}
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
  .rf-campo { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 6px; align-items: center; margin-top: 6px; font-size: 12px; color: var(--text-2); }
  .rf-campo input { width: 100%; min-width: 0; box-sizing: border-box; }
  .rf-campi { min-width: 0; overflow: hidden; }
  .rf-perche { margin-top: 10px; }`;
  document.head.appendChild(st);
})();

/* audio vero al posto dell'orologio simulato: stesse funzioni, stesso stato RV */
function rfAudioSetup(url, tracce) {
  // Più tracce (19.9.2026): un dettato spezzato in due file. La piattaforma
  // ha già messo le parole della seconda traccia dopo la prima sulla linea
  // del tempo; qui i file si suonano di seguito, e RV.t resta UNA sola linea:
  // t = spostamento della traccia + posizione nel suo file.
  if (RF.audioEl) { RF.audioEl.pause(); RF.audioEl = null; }
  RF.tracce = [];
  const lista = Array.isArray(tracce) && tracce.length ? tracce : (url ? [{ url, offset: 0 }] : []);
  if (!lista.length) return;
  lista.forEach((t, k) => {
    const a = new Audio(t.url); a.preload = k === 0 ? 'auto' : 'metadata';
    const tr = { el: a, offset: Number(t.offset) || 0, dur: 0 };
    a.addEventListener('timeupdate', () => {
      if (RF.audioEl !== a) return;
      RV.t = tr.offset + a.currentTime;
      if (RV.stopAt != null && RV.t >= RV.stopAt) { a.pause(); RV.playing = false; RV.stopAt = null; }
      if (typeof rvTick === 'function') rvTick();
    });
    a.addEventListener('ended', () => {
      if (RF.audioEl !== a) return;
      const prossima = RF.tracce[k + 1];
      if (prossima && RV.playing) { RF.audioEl = prossima.el; prossima.el.playbackRate = RV.speed || 1; try { prossima.el.currentTime = 0; } catch (e) { /* metadati */ } prossima.el.play().catch(() => { RV.playing = false; rvTick(); }); return; }
      RV.playing = false; if (typeof rvTick === 'function') rvTick();
    });
    // Lo stato del tasto segue l'audio VERO (23.9.2026): se il file si ferma o
    // riparte per conto suo (fine del tratto, sistema, cuffie), RV.playing non
    // resta indietro e il clic successivo fa la cosa giusta.
    a.addEventListener('play', () => { if (RF.audioEl === a && !RV.playing) { RV.playing = true; if (typeof rvTick === 'function') rvTick(); } });
    a.addEventListener('pause', () => { if (RF.audioEl === a && RV.playing && !a.ended) { RV.playing = false; if (typeof rvTick === 'function') rvTick(); } });
    a.addEventListener('loadedmetadata', () => {
      if (isFinite(a.duration) && a.duration > 0) { tr.dur = a.duration; const tot = RF.tracce.reduce((m, x) => Math.max(m, x.offset + (x.dur || 0)), 0); if (tot > 0) { RV_AUDIO.dur = tot; RV_AUDIO.label = fmt(tot); } }
    });
    RF.tracce.push(tr);
  });
  RF.audioEl = RF.tracce[0].el;
}
// La traccia a cui appartiene un istante della linea unica, e la posizione dentro il suo file.
function rfTracciaPer(t) {
  const L = RF.tracce || []; if (!L.length) return null;
  let k = 0; for (let i = 0; i < L.length; i++) if (t >= L[i].offset) k = i;
  return { k, el: L[k].el, locale: Math.max(0, t - L[k].offset) };
}
const rfPlayOrig = rvPlay, rfPauseOrig = rvPause, rfSeekOrig = rvSeek;
rvPlay = function (from, to) {
  if (!RF.audioEl) return rfPlayOrig(from, to);
  if (from != null) RV.t = from;
  RV.stopAt = to != null ? to : null;
  RV.playing = true; RV.metrics.plays++;
  const tr = rfTracciaPer(RV.t) || { el: RF.audioEl, locale: RV.t };
  if (RF.audioEl !== tr.el) { RF.audioEl.pause(); RF.audioEl = tr.el; }
  RF.audioEl.playbackRate = RV.speed || 1;
  try { RF.audioEl.currentTime = tr.locale; } catch (e) { /* metadati non pronti */ }
  // Una pausa premuta mentre l'audio sta ancora partendo interrompe play():
  // non è un audio rotto, niente avviso.
  RF.audioEl.play().catch(e => { RV.playing = false; if (!e || e.name !== 'AbortError') toast('Audio non riproducibile'); rvTick(); });
};
rvPause = function () { if (!RF.audioEl) return rfPauseOrig(); RF.audioEl.pause(); RV.playing = false; rvTick(); };
// Play o pausa lo decide lo stato vero dell'audio, non quello ricordato.
const rfToggleOrig = rvToggle;
rvToggle = function () {
  if (!RF.audioEl) return rfToggleOrig();
  if (!RF.audioEl.paused || RV.playing) rvPause(); else rvPlay();
};
rvSeek = function (t, play) {
  if (!RF.audioEl) return rfSeekOrig(t, play);
  RV.t = Math.min(RV_AUDIO.dur || t, Math.max(0, t)); RV.detached = false;
  const tr = rfTracciaPer(RV.t);
  if (tr && RF.audioEl !== tr.el) { RF.audioEl.pause(); RF.audioEl = tr.el; }
  try { RF.audioEl.currentTime = tr ? tr.locale : RV.t; } catch (e) { /* metadati non pronti */ }
  if (play) rvPlay(RV.t, null); else rvTick();
};

