// ReferralFlow prototype — Assistente vocale del medico
// Voce in ingresso → trascrizione LOCALE (voice-server/server.py, Whisper on-premise) → intenti → risposta
// nel pannello AI + risposta breve a voce con la voce del dispositivo (speechSynthesis, on-device).
// Fallback dichiarato: riconoscimento vocale del browser (usa il cloud del produttore) → ammesso solo per la demo.
const VA = {
  endpoint: localStorage.getItem('rf-voice-endpoint') || 'http://127.0.0.1:8787',
  engine: 'none',            // 'local' | 'browser' | 'none'
  listening: false, busy: false,
  speak: localStorage.getItem('rf-voice-speak') !== 'off',
  discreet: localStorage.getItem('rf-voice-discreet') === 'on', // non pronunciare dati del paziente a voce
  lastVoice: false, count: 0, rec: null, chunks: [], stream: null, recognition: null,
};

/* ---------- motori ---------- */
async function vaDetect() {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(VA.endpoint + '/health', { signal: ctrl.signal }); clearTimeout(t);
    const j = await r.json();
    if (j.ok) { VA.engine = 'local'; VA.model = j.model; VA.ready = j.ready; return; }
  } catch { /* server locale non raggiungibile */ }
  VA.engine = ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) ? 'browser' : 'none';
}

async function vaStart() {
  if (VA.listening || VA.busy) return;
  if (VA.engine === 'none') await vaDetect();
  if (VA.engine === 'none') { toast('Nessun motore vocale disponibile: avvia voice-server o usa un browser con riconoscimento vocale'); return; }
  if (!['doctor', 'org_admin', 'assistant', 'secretary'].includes(state.role)) { toast('Assistente vocale non disponibile per questo ruolo'); return; }
  if (VA.engine === 'local') return vaStartLocal();
  return vaStartBrowser();
}
function vaStop() {
  if (!VA.listening) return;
  if (VA.engine === 'local' && VA.rec && VA.rec.state !== 'inactive') VA.rec.stop();
  if (VA.engine === 'browser' && VA.recognition) VA.recognition.stop();
}

async function vaStartLocal() {
  try { VA.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, autoGainControl: true, noiseSuppression: true } }); }
  catch { toast('Permesso microfono negato'); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  VA.chunks = []; VA.rec = new MediaRecorder(VA.stream, mime ? { mimeType: mime } : {});
  VA.rec.ondataavailable = e => { if (e.data.size) VA.chunks.push(e.data); };
  VA.rec.onstop = async () => {
    VA.stream.getTracks().forEach(t => t.stop()); VA.listening = false; VA.busy = true; vaRenderState();
    const blob = new Blob(VA.chunks, { type: mime || 'audio/webm' });
    try {
      const prompt = encodeURIComponent('Domanda di un cardiologo al gestionale dello studio: pazienti, agenda, referti, terapia, ecocardiogramma, Holter, ECG.');
      const r = await fetch(`${VA.endpoint}/transcribe?lang=it&prompt=${prompt}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } });
      const j = await r.json();
      VA.busy = false; vaRenderState();
      if (j.text) vaHandle(j.text); else toast('Non ho capito: riprova parlando più vicino al microfono');
    } catch { VA.busy = false; VA.engine = 'none'; vaRenderState(); toast('Server vocale non raggiungibile: la richiesta non è stata inviata a nessun servizio esterno'); }
  };
  VA.rec.start(); VA.listening = true; vaRenderState();
  VA.autoStop = setTimeout(() => vaStop(), 12000); // massimo 12 s per domanda
}

function vaStartBrowser() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR(); r.lang = 'it-IT'; r.interimResults = false; r.maxAlternatives = 1;
  r.onresult = e => { const t = e.results[0][0].transcript; vaHandle(t); };
  r.onerror = e => { VA.listening = false; vaRenderState(); if (e.error !== 'aborted') toast('Riconoscimento vocale non riuscito: ' + e.error); };
  r.onend = () => { VA.listening = false; vaRenderState(); };
  VA.recognition = r; r.start(); VA.listening = true; vaRenderState();
}

/* ---------- comprensione: intenti ---------- */
function vaNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function vaFindPatient(q) {
  const n = vaNorm(q);
  return PATIENTS.find(p => n.includes(vaNorm(p.last))) || PATIENTS.find(p => n.includes(vaNorm(p.first + ' ' + p.last))) || null;
}
const VA_NAV = [[/agenda|appuntamenti di oggi|calendario/, 'agenda', 'Apro l\'agenda'], [/pazienti|elenco pazienti/, 'patients', 'Apro l\'elenco pazienti'], [/referti|refert/, 'reports', 'Apro i referti'], [/attivita|task|cose da fare/, 'inbox', 'Apro le attività'], [/statistic/, 'statistics', 'Apro le statistiche'], [/dittafono|nuova registrazione|detta|dettatura|registra/, 'dittafono', 'Apro il dittafono'], [/impostazioni/, 'settings', 'Apro le impostazioni'], [/home|inizio/, 'home', 'Torno alla home']];

function vaHandle(text) {
  VA.count++; VA.lastVoice = true; VA.listening = false; vaRenderState();
  const q = vaNorm(text);
  const clinical = ['doctor', 'org_admin'].includes(state.role);
  const p = vaFindPatient(q) || (state.patientCtx ? P[state.patientCtx] : null);
  if (!state.aiOpen) { state.aiOpen = true; }
  state.aiMessages.push({ html: `<div class="ai-msg user">${ICONS.mic} ${esc(text)}</div>` });

  if (/^(stop|basta|silenzio|ferma)/.test(q)) { speechSynthesis.cancel(); return vaReply('Ok.', 'Ok.'); }
  if (/aiuto|cosa puoi fare|cosa sai fare/.test(q)) return vaReply(`Posso: aprire pagine ("apri l'agenda"), aprire un paziente ("apri Rossi"), dirti come sta un paziente o cosa è cambiato, elencare i referti da approvare e gli appuntamenti di oggi, trovare documenti ("trova la lettera di dimissione di Rossi"), creare un'attività ("crea un task: richiamare Verdi"), aprire il dittafono. Dì "stop" per fermarmi.`, 'Posso aprire pagine e pazienti, dirti come sta un paziente, elencare referti e appuntamenti, cercare documenti e creare attività.');

  // richiesta di un documento: risposta nel pannello + apertura accanto (prima dell'apertura paziente, "apri l'ultimo eco di Rossi" è un documento)
  const docWord = /ecocardio|\beco\b|holter|\becg\b|elettrocardio|lettera|dimission|referto|documento|esame|laborator|analisi|lab\b|scansion|pdf|risonanza|\btac\b|ergometr|test da sforzo/.test(q);
  if (docWord && /^(apri|trova|cerca|mostrami|mostra|recupera|fammi vedere|dammi|voglio vedere)/.test(q)) {
    if (!(AI_ACCESS[state.role] || {}).archive) return vaReply(`Con il ruolo ${ROLES[state.role].label} non posso aprire documenti clinici.`, 'Non posso aprire documenti clinici con il tuo ruolo.');
    const finder = /trova|cerca|mostrami|recupera|ultim|vecch|precedent|storic|tutti|tutte/.test(q) ? text : 'trova ' + text.replace(/^(apri|mostra|fammi vedere|dammi|voglio vedere)\s*/i, '');
    askAI(finder);
    return;
  }
  // apertura paziente
  if (/^(apri|vai|mostra|fascicolo)/.test(q) && vaFindPatient(q)) { const pt = vaFindPatient(q); vaGoPatient(pt); return vaReply(`Apro il fascicolo di ${esc(fullName(pt))}.`, `Apro ${pt.first} ${pt.last}.`); }
  // navigazione
  for (const [re, key, say] of VA_NAV) if (/^(apri|vai|mostra|portami)/.test(q) && re.test(q)) { go('#/' + key); return vaReply(say + '.', say); }
  // stato del paziente / sintesi
  if (p && /come sta|sintesi|riassum|situazione|storia/.test(q)) {
    if (!clinical) return vaReply(`Non ho accesso ai dati clinici con il ruolo ${ROLES[state.role].label}.`, 'Non ho accesso ai dati clinici con il tuo ruolo.');
    if (state.patientCtx !== p.id) vaGoPatient(p);
    const s = psGet(p);
    return vaReply(psAnswer(p), vaDiscreet(p, `${p.first} ${p.last}: ${s.lines[0].t} ${s.lines[1].t}`));
  }
  if (p && /cambiat|diff|novita/.test(q)) {
    if (state.patientCtx !== p.id) vaGoPatient(p);
    const changed = p.meds.filter(m => m.s);
    const say = changed.length ? `${changed.length} modifiche di terapia: ${changed.map(m => `${m.n} ${m.from ? m.from + ' a ' : ''}${m.d}`).join(', ')}.` : 'Nessuna modifica di terapia registrata.';
    state.aiMessages.push({ html: `<div class="ai-msg ai">${aiAnswer('cosa è cambiato')}</div>` }); vaSay(vaDiscreet(p, say)); render(); return;
  }
  // leggi la sintesi a voce
  if (p && /leggi/.test(q) && /sintesi|riassunto/.test(q)) { if (!clinical) return vaReply('Non disponibile per il tuo ruolo.', 'Non disponibile per il tuo ruolo.'); psSpeak(p.id); return vaReply('Leggo la sintesi.', ''); }
  // referti da approvare
  if (/refert/.test(q) && /approv|firmar|da fare|in attesa|quanti/.test(q)) {
    const mine = REPORTS.filter(r => r.status === 'READY_FOR_REVIEW' && (state.role !== 'doctor' || r.doc === 'eb'));
    const html = `<b>Referti da approvare: ${mine.length}</b><br>${mine.map(r => `• ${esc(fullName(P[r.p]))} — ${r.type} (${r.version}) <a href="#/reports/${r.id}">apri</a>`).join('<br>')}`;
    return vaReply(html, `${mine.length} referti da approvare${mine.length ? ': ' + mine.map(r => P[r.p].last).join(', ') : ''}.`);
  }
  // appuntamenti di oggi / prossimo paziente
  if (/appuntament|agenda|chi c e oggi|prossimo paziente|chi devo vedere/.test(q)) {
    const mine = APPTS.filter(a => a.status !== 'CANCELLED' && (state.role !== 'doctor' || a.doc === 'eb')).sort((a, b) => a.start.localeCompare(b.start));
    const next = mine.find(a => ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PREP'].includes(a.status));
    const html = `<b>Oggi: ${mine.length} appuntamenti</b><br>${mine.map(a => `• ${a.start} ${esc(fullName(P[a.p]))} — ${a.reason} <span class="status"><i class="dot ${STATUS_DOT[a.status]}"></i>${STATUS_LABEL[a.status]}</span>`).join('<br>')}`;
    return vaReply(html, `Oggi hai ${mine.length} appuntamenti. ${next ? `Il prossimo è ${P[next.p].first} ${P[next.p].last} alle ${next.start}, ${next.reason}.` : ''}`);
  }
  // crea un task
  const mt = q.match(/(?:crea|aggiungi|segna|ricordami)(?: un| una)?(?: task| attivita| promemoria)?(?: di| :)? (.+)/);
  if (mt && /crea|aggiungi|segna|ricordami/.test(q)) {
    const title = text.replace(/^.*?(crea|aggiungi|segna|ricordami)( un| una)?( task| attività| promemoria)?( di|:)?\s*/i, '').trim() || mt[1];
    openModal('Creare questa attività?', `<div class="field"><label>Titolo</label><input class="input" id="va-task" value="${esc(title.charAt(0).toUpperCase() + title.slice(1))}"></div><p class="caption mt-8">Le azioni richieste a voce vengono sempre confermate sullo schermo prima di essere eseguite.</p>`,
      `<button class="btn" data-close>Annulla</button><button class="btn primary" id="va-task-ok">Crea attività</button>`);
    document.getElementById('va-task-ok').onclick = () => { TASKS.unshift({ id: 't' + Date.now(), title: document.getElementById('va-task').value.trim(), p: p ? p.id : null, assignee: state.role, prio: 'normal', status: 'TODO', due: 'oggi', cat: 'manual', src: 'voice' }); closeModal(); toast('Attività creata'); render(); };
    return vaReply(`Preparo l'attività "${esc(title)}": conferma sullo schermo.`, 'Ho preparato l\'attività, conferma sullo schermo.');
  }
  // tutto il resto: il normale assistente (trova, fatturato, statistiche…)
  if (p && !state.patientCtx) vaGoPatient(p);
  askAI(text);
}

/** Apre il paziente senza azzerare la conversazione vocale (onRoute resetta i messaggi se cambia il contesto). */
function vaGoPatient(pt) { state.aiCtxPatient = pt.id; go(`#/patients/${pt.id}/overview`); }
function vaDiscreet(p, say) { return VA.discreet ? 'La risposta è sullo schermo.' : say; }
function vaReply(html, say) {
  state.aiMessages.push({ html: `<div class="ai-msg ai">${html}</div>` });
  render(); vaSay(say);
  setTimeout(() => { const b = document.getElementById('ai-body'); if (b) b.scrollTop = 1e6; }, 30);
}
/** Da askAI: dopo una risposta testuale, se la domanda era vocale legge una versione breve. */
function vaAfterAnswer(html, opened) {
  if (!VA.lastVoice) return; VA.lastVoice = false;
  if (opened) { const n = (window.__lastArchiveCount || 1); vaSay(VA.discreet ? 'Ho trovato il documento, lo apro accanto.' : `Ho trovato ${n === 1 ? 'il documento' : n + ' documenti'}: apro ${opened.title}, del ${dmy(opened.date)}, accanto.`); return; }
  const plain = String(html).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const short = plain.split(/(?<=[.!?])\s/).slice(0, 2).join(' ').slice(0, 240);
  vaSay(state.patientCtx ? vaDiscreet(P[state.patientCtx], short) : short);
}
function vaSay(text) {
  if (!VA.speak || !text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; u.rate = 1.05;
  const v = speechSynthesis.getVoices().filter(x => x.lang.startsWith('it') && x.localService)[0] || speechSynthesis.getVoices().find(x => x.lang.startsWith('it'));
  if (v) u.voice = v;
  VA.speaking = true; vaSphere('speaking');
  u.onboundary = () => { document.querySelectorAll('.ai-sphere').forEach(el => { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 90); }); };
  u.onend = u.onerror = () => { VA.speaking = false; vaSphere(''); };
  speechSynthesis.speak(u);
}
/** Stato visivo della sfera (idle | listening | thinking | speaking) senza ridisegnare il pannello. */
function vaSphere(mode) {
  document.querySelectorAll('.ai-sphere').forEach(el => { el.classList.remove('listening', 'speaking', 'thinking'); if (mode) el.classList.add(mode); });
  const st = document.getElementById('ai-stage');
  if (st) { st.hidden = !(VA.listening || VA.speaking || VA.busy); const cap = st.querySelector('.cap'); if (cap) cap.textContent = VA.listening ? 'Ti ascolto…' : VA.busy ? 'Trascrizione locale…' : VA.speaking ? 'Sto rispondendo' : ''; }
}
/** Sfera grande in cima al pannello, visibile mentre ascolta, trascrive o parla. */
function vaStage() {
  const active = VA.listening || VA.speaking || VA.busy;
  const mode = VA.listening ? 'listening' : VA.busy ? 'thinking' : VA.speaking ? 'speaking' : '';
  return `<div class="ai-stage" id="ai-stage" ${active ? '' : 'hidden'}><div class="ai-sphere ${mode}"><span class="w"></span></div><div class="cap">${VA.listening ? 'Ti ascolto…' : VA.busy ? 'Trascrizione locale…' : VA.speaking ? 'Sto rispondendo' : ''}</div></div>`;
}

/* ---------- UI ---------- */
function vaMicButton() {
  const cls = VA.listening ? 'listening' : VA.busy ? 'busy' : '';
  return `<button class="btn va-mic ${cls}" id="va-mic" title="Assistente vocale (Ctrl+Shift+V)">${ICONS.mic}</button>`;
}
function vaStatusLine() {
  const eng = VA.engine === 'local' ? `<span class="prov confirmed">Trascrizione locale</span> ${esc(VA.model || '')} · nessun audio esce dallo studio`
    : VA.engine === 'browser' ? `<span class="prov verify">Demo</span> riconoscimento del browser (cloud del produttore): solo dati fittizi`
    : `<span class="prov conflict">Voce non attiva</span> avvia <code>voice-server</code> per la trascrizione locale`;
  return `<div class="va-status">${eng}
    <span class="right row" style="gap:8px"><label class="caption"><input type="checkbox" id="va-speak" ${VA.speak ? 'checked' : ''}> risposta a voce</label><label class="caption" title="Non pronuncia dati del paziente: utile se c'è qualcuno nella stanza"><input type="checkbox" id="va-discreet" ${VA.discreet ? 'checked' : ''}> riservato</label></span></div>`;
}
function vaRenderState() {
  vaSphere(VA.listening ? 'listening' : VA.busy ? 'thinking' : VA.speaking ? 'speaking' : '');
  const b = document.getElementById('va-mic'); if (b) b.className = `btn va-mic ${VA.listening ? 'listening' : VA.busy ? 'busy' : ''}`;
  const s = document.getElementById('va-hint'); if (s) s.textContent = VA.listening ? 'Ti ascolto… tocca di nuovo per finire' : VA.busy ? 'Trascrizione locale in corso…' : '';
}
function vaBind(root) {
  const mic = root.querySelector('#va-mic'); if (mic) mic.onclick = () => (VA.listening ? vaStop() : vaStart());
  const sp = root.querySelector('#va-speak'); if (sp) sp.onchange = e => { VA.speak = e.target.checked; localStorage.setItem('rf-voice-speak', VA.speak ? 'on' : 'off'); if (!VA.speak) speechSynthesis.cancel(); };
  const d = root.querySelector('#va-discreet'); if (d) d.onchange = e => { VA.discreet = e.target.checked; localStorage.setItem('rf-voice-discreet', VA.discreet ? 'on' : 'off'); };
}
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); if (!state.aiOpen) toggleAI(true); setTimeout(() => (VA.listening ? vaStop() : vaStart()), 80); } });
vaDetect().then(() => { if (state.aiOpen) render(); });
