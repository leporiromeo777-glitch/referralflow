// ReferralFlow prototype — Ingresso audio (drag & drop) → catena referto
// Sezione della pagina Referti (segreteria e medico): si trascinano i file audio (o l'export ZIP/JSON del
// dittafono), si associano a paziente/medico/tipo e si avvia la catena:
//   Ricevuto → Preparazione audio → Trascrizione → Analisi → Bozza → Controllo → Da controllare
// La trascrizione è REALE se voice-server è attivo (Whisper locale, `22_ASSISTENTE_VOCALE.md`); i passi
// successivi (analisi, bozza) sono simulati nel prototipo e marcati come tali.
const AI_KEY = 'rf-audio-intake';
const AIN = { items: JSON.parse(localStorage.getItem(AI_KEY) || '[]'), files: {}, drag: false, endpoint: (typeof VA !== 'undefined' && VA.endpoint) || 'http://127.0.0.1:8787' };
function ainSave() { localStorage.setItem(AI_KEY, JSON.stringify(AIN.items.map(({ transcript, ...rest }) => ({ ...rest, transcript: transcript ? transcript.slice(0, 4000) : transcript })))); }
const AIN_STAGES = ['RECEIVED', 'PREPROCESSING', 'TRANSCRIBING', 'UNDERSTANDING', 'DRAFTING', 'VALIDATING', 'READY_FOR_FORMAL_REVIEW'];
const AIN_TYPES = ['Controllo cardiologico', 'Ecocardiogramma', 'Holter ECG', 'ECG', 'Consulto', 'Lettera', 'Prima visita', 'Altro'];
const AIN_ACCEPT = /\.(webm|m4a|mp4|mp3|wav|ogg|opus|aac|zip|json)$/i;

function ainFmtBytes(b) { return b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function ainFmtDur(s) { if (!isFinite(s) || s <= 0) return '—'; const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }
function ainDuration(file) {
  return new Promise(res => {
    const a = document.createElement('audio'); a.preload = 'metadata'; const u = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(u); res(v); };
    a.onloadedmetadata = () => { if (isFinite(a.duration)) done(a.duration); else { a.currentTime = 1e101; a.ontimeupdate = () => { a.ontimeupdate = null; done(isFinite(a.duration) ? a.duration : null); }; } };
    a.onerror = () => done(null); a.src = u; setTimeout(() => done(null), 6000);
  });
}

/** Accetta file trascinati o scelti. Riconosce metadata.json del dittafono (recording_id, tipo, durata, prompt). */
async function ainAddFiles(fileList) {
  const files = [...fileList].filter(f => AIN_ACCEPT.test(f.name));
  if (!files.length) { toast('Formati accettati: m4a, webm, mp3, wav, ogg, zip o metadata.json del dittafono'); return; }
  let meta = null;
  for (const f of files) if (/\.json$/i.test(f.name)) { try { meta = JSON.parse(await f.text()); } catch { /* ignora */ } }
  for (const f of files) {
    if (/\.json$/i.test(f.name)) continue;
    const id = 'in_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const isZip = /\.zip$/i.test(f.name);
    const dur = isZip ? (meta && meta.duration) || null : await ainDuration(f);
    const docType = meta && meta.document_type ? ({ visita: 'Controllo cardiologico', ecocardiografia: 'Ecocardiogramma', holter: 'Holter ECG', ecg: 'ECG', consulto: 'Consulto', lettera: 'Lettera', referto: 'Controllo cardiologico', nota_interna: 'Altro', altro: 'Altro' })[meta.document_type] || 'Altro' : '';
    const item = { id, name: f.name, size: f.size, mime: f.type || '', duration: dur, addedAt: new Date().toISOString(), p: '', doc: 'eb', type: docType, status: 'NEW', stage: -1, recordingId: meta ? meta.recording_id : null, patientRef: meta ? meta.patient_reference : '', prompt: meta && meta.transcription ? meta.transcription.whisper_prompt : '', markers: meta ? (meta.markers || []).length : 0, isZip, by: ROLES[state.role].label };
    AIN.files[id] = f; AIN.items.unshift(item);
  }
  ainSave(); render();
  toast(`${files.filter(f => !/\.json$/i.test(f.name)).length} audio in ingresso${meta ? ' · metadata del dittafono letti' : ''}`);
}

async function ainStart(id) {
  const it = AIN.items.find(x => x.id === id); if (!it) return;
  if (!it.p) { toast('Scegli il paziente prima di avviare il referto'); return; }
  if (!it.type) { toast('Scegli il tipo di referto'); return; }
  it.status = 'RUNNING'; it.stage = 0; it.startedAt = new Date().toISOString(); it.log = [`${ainNow()} ricevuto · ${it.name}`]; ainSave(); render();
  const step = async (i, ms) => { it.stage = i; it.log.push(`${ainNow()} ${RSTATUS[AIN_STAGES[i]]}`); ainSave(); ainPaint(it); await new Promise(r => setTimeout(r, ms)); };
  await step(1, 700);
  await step(2, 100);
  const file = AIN.files[id];
  let live = false;
  try {
    const h = await fetch(AIN.endpoint + '/health', { signal: AbortSignal.timeout(1200) }).then(r => r.json()).catch(() => null);
    live = !!(h && h.ok && file && !it.isZip);
  } catch { live = false; }
  if (live) {
    try {
      const prompt = encodeURIComponent(it.prompt || `${it.type} dettato in italiano da un cardiologo, con punteggiatura.`);
      const r = await fetch(`${AIN.endpoint}/transcribe?lang=it&prompt=${prompt}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      const j = await r.json();
      if (j.text) { it.transcript = j.text; it.transcribedIn = j.elapsed; it.log.push(`${ainNow()} trascrizione locale completata (${j.elapsed} s, ${j.segments?.length || 0} segmenti)`); }
      else throw new Error(j.error || 'vuota');
    } catch (e) { it.status = 'FAILED'; it.error = 'Trascrizione locale non riuscita: ' + (e.message || e); ainSave(); render(); return; }
  } else {
    it.transcript = null; it.log.push(`${ainNow()} server vocale non attivo: trascrizione in coda (nessun servizio esterno usato)`);
    it.status = 'QUEUED'; it.stage = 2; ainSave(); render(); return;
  }
  // passi successivi: simulati nel prototipo (analisi, bozza, controllo)
  await step(3, 900); await step(4, 1100); await step(5, 700);
  it.stage = 6; it.status = 'DONE'; it.log.push(`${ainNow()} referto in coda "Da controllare" (prototipo: bozza simulata dalla trascrizione reale)`);
  ainSave(); render(); toast(`Referto avviato per ${fullName(P[it.p])} · in coda per la revisione`);
}
function ainNow() { return new Date().toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function ainRemove(id) { AIN.items = AIN.items.filter(x => x.id !== id); delete AIN.files[id]; ainSave(); render(); }
function ainSet(id, k, v) { const it = AIN.items.find(x => x.id === id); if (it) { it[k] = v; ainSave(); } }
function ainView(id) {
  const it = AIN.items.find(x => x.id === id); if (!it) return;
  openModal(`${esc(it.name)} · ${it.p ? esc(fullName(P[it.p])) : 'senza paziente'}`, `
    ${it.transcript ? `<div class="section-title">Trascrizione (Whisper locale)</div><div style="font-size:13.5px;line-height:1.6;background:var(--surface-2);padding:12px;border-radius:10px;max-height:40vh;overflow:auto">${esc(it.transcript)}</div>` : `<div class="caption">Nessuna trascrizione: il server vocale non era attivo. Avvia voice-server e premi "Riprova".</div>`}
    <div class="section-title mt-16">Registro</div><div class="caption" style="line-height:1.7">${(it.log || []).map(esc).join('<br>')}</div>
    ${it.recordingId ? `<div class="caption mt-8">ID registrazione dittafono: <code>${esc(it.recordingId)}</code>${it.markers ? ` · ${it.markers} marcatori` : ''}</div>` : ''}`,
    `<button class="btn" data-close>Chiudi</button>${it.status === 'QUEUED' || it.status === 'FAILED' ? `<button class="btn primary" data-close onclick="ainStart('${it.id}')">Riprova</button>` : ''}${it.status === 'DONE' ? `<button class="btn primary" data-close data-go="#/review/r1">Apri revisione (demo)</button>` : ''}`);
}
function ainPaint(it) {
  const el = document.getElementById('ain-prog-' + it.id); if (!el) return;
  el.style.width = Math.round(((it.stage + 1) / AIN_STAGES.length) * 100) + '%';
  const lab = document.getElementById('ain-stage-' + it.id); if (lab) lab.textContent = RSTATUS[AIN_STAGES[it.stage]] + '…';
}

/** Sezione da inserire nella pagina Referti. */
function ainSection() {
  const canIntake = ['secretary', 'doctor', 'org_admin', 'assistant'].includes(state.role);
  if (!canIntake) return '';
  const patientsOpt = (sel) => `<option value="">Paziente…</option>` + PATIENTS.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(fullName(p))} · ${p.num}</option>`).join('');
  const rows = AIN.items.map(it => {
    const running = it.status === 'RUNNING';
    const st = it.status === 'NEW' ? ['Da avviare', ''] : running ? [RSTATUS[AIN_STAGES[it.stage]] + '…', 'accent'] : it.status === 'QUEUED' ? ['In coda: server vocale non attivo', 'warning'] : it.status === 'FAILED' ? ['Errore', 'danger'] : ['Da controllare', 'success'];
    return `<div class="card tight ain-row">
      <div class="row wrap" style="gap:10px">
        <div class="ain-ico">${it.isZip ? ICONS.file : ICONS.wave}</div>
        <div class="grow" style="min-width:220px">
          <div class="row" style="gap:8px"><b style="font-size:13px">${esc(it.name)}</b><span class="badge ${st[1]}">${st[0]}</span>${it.recordingId ? '<span class="badge ai">dittafono</span>' : ''}</div>
          <div class="caption">${ainFmtBytes(it.size)} · durata ${ainFmtDur(it.duration)} · caricato da ${esc(it.by)}${it.patientRef ? ' · rif. ' + esc(it.patientRef) : ''}</div>
          ${running || it.status === 'DONE' ? `<div class="meter mt-8" style="height:6px"><i id="ain-prog-${it.id}" style="width:${Math.round(((it.stage + 1) / AIN_STAGES.length) * 100)}%"></i></div><div class="caption" id="ain-stage-${it.id}">${it.status === 'DONE' ? 'Catena completata' : RSTATUS[AIN_STAGES[it.stage]] + '…'}</div>` : ''}
        </div>
        ${it.status === 'NEW' ? `
          <select class="input" style="width:200px" onchange="ainSet('${it.id}','p',this.value)">${patientsOpt(it.p)}</select>
          <select class="input" style="width:150px" onchange="ainSet('${it.id}','doc',this.value)">${Object.entries(DOCTORS).map(([k, v]) => `<option value="${k}" ${it.doc === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select class="input" style="width:170px" onchange="ainSet('${it.id}','type',this.value)"><option value="">Tipo…</option>${AIN_TYPES.map(t => `<option ${it.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <button class="btn primary" onclick="ainStart('${it.id}')">${ICONS.play} Avvia referto</button>
          <button class="btn ghost" onclick="ainRemove('${it.id}')" title="Rimuovi">${ICONS.x}</button>` :
        `<div class="caption" style="min-width:160px">${it.p ? esc(fullName(P[it.p])) : ''}<br>${DOCTORS[it.doc] || ''} · ${esc(it.type || '')}</div>
          <button class="btn sm" onclick="ainView('${it.id}')">Dettagli</button>
          ${it.status !== 'RUNNING' ? `<button class="btn sm ghost" onclick="ainRemove('${it.id}')">${ICONS.x}</button>` : ''}`}
      </div></div>`;
  }).join('');
  return `<div class="card ain mb-16">
    <div class="card-head"><span class="section-title">Audio in ingresso → catena referto</span><span class="caption">${AIN.items.length ? AIN.items.length + ' in lista' : ''}</span></div>
    <div class="dropzone" id="ain-drop" tabindex="0" role="button" aria-label="Trascina qui gli audio">
      ${ICONS.upload}<div><b>Trascina qui gli audio</b> (m4a, webm, mp3, wav) o l'export del dittafono (ZIP + metadata.json)<br><span class="caption">oppure <u>scegli i file</u> · restano sul server dello studio: trascrizione locale, nessun servizio esterno</span></div>
      <input type="file" id="ain-file" multiple accept=".webm,.m4a,.mp4,.mp3,.wav,.ogg,.opus,.aac,.zip,.json,audio/*" hidden>
    </div>
    ${rows ? `<div class="stack mt-16">${rows}</div>` : ''}
    <div class="caption mt-8">Catena: Ricevuto → Preparazione audio → Trascrizione (Whisper locale) → Analisi → Bozza → Controllo → «Da controllare». Nel prototipo la trascrizione è reale quando voice-server è attivo; analisi e bozza sono simulate.</div>
  </div>`;
}
function ainBind(root) {
  const dz = root.querySelector('#ain-drop'), inp = root.querySelector('#ain-file'); if (!dz) return;
  dz.onclick = () => inp.click(); dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  inp.onchange = () => { ainAddFiles(inp.files); inp.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) ainAddFiles(e.dataTransfer.files); });
}
