// ReferralFlow prototype — Anonimizzazione documenti
// Rileva i dati identificativi in un testo clinico (nomi, date di nascita, ID, AVS, telefoni, email, indirizzi,
// età ≥ 90) e produce una versione anonimizzata con segnaposto o pseudonimi coerenti. Tutto nel browser:
// il testo non viene inviato a nessun servizio. La mappa di re-identificazione resta locale e separata.
// Usi: inviare un caso a un consulente esterno, preparare esempi per la wiki (07_Esempi_approvati, phi_check strict),
// didattica, test dei modelli. Non sostituisce la revisione umana: la lista dei rilevamenti va controllata.
const ANON = {
  text: '', entities: [], done: false,
  opt: JSON.parse(localStorage.getItem('rf-anon-opt') || '{"mode":"pseudonym","keepDoctors":true,"shiftDates":true,"keepYears":true}'),
  source: '',
};
function anonSaveOpt() { localStorage.setItem('rf-anon-opt', JSON.stringify(ANON.opt)); }

const ANON_TYPES = {
  PERSON: ['Persona', 'danger'], DOCTOR: ['Medico', 'accent'], DOB: ['Data di nascita', 'danger'], DATE: ['Data', 'warning'],
  ID: ['Identificativo', 'danger'], AVS: ['Numero AVS', 'danger'], PHONE: ['Telefono', 'danger'], EMAIL: ['E-mail', 'danger'],
  ADDRESS: ['Indirizzo', 'danger'], PLACE: ['Località', 'warning'], AGE: ['Età ≥ 90', 'warning'], ORG: ['Struttura', 'warning'],
};
const ANON_MONTHS = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
// parole che iniziano per maiuscola ma non sono nomi di persona
const ANON_STOP = new Set(('Il La Lo Le Gli I Un Una Uno Del Della Dei Delle Al Alla Nel Nella Con Per Da Di In A E O Ma Se Non Si Dr Dott Sig Signor Signora Paziente Terapia Diagnosi Anamnesi Esame Ecocardiogramma Holter ECG Referto Controllo Visita Ospedale Regionale Cardiocentro Ticino Lugano Mendrisio Bellinzona Locarno Chiasso Bisoprololo Ramipril Apixaban Atorvastatina Amlodipina Furosemide Sacubitril Valsartan Empagliflozin FA NYHA FE TAPSE PAPs Fibrillazione Ipertensione Dislipidemia Continua Sospendere Aumentare Ridurre Prossimo Follow Motivo Conclusioni Indicazioni Data Ora Gentile Cordiali Saluti Egregio Collega Dottore Dottoressa Cara Caro Studio Cardiologico Medico Centro Reparto Pronto Soccorso Laboratorio Servizio Cardiologia Medicina Interna Ambulatorio').split(' '));

function anonDetect(text) {
  const ents = [];
  const add = (type, m, offset = 0, len) => { const s = m.index + offset; const t = (len ? m[0].substr(offset, len) : m[0].slice(offset)).replace(/\s+$/, ''); ents.push({ type, start: s, end: s + t.length, text: t }); };
  let m;
  // medici (Dr., Dr.ssa, Dott., Dott.ssa + Nome/Cognome)
  const reDoc = /\b(Dr\.?\s?ssa|Dott\.?\s?ssa|Dr\.?|Dott\.?|Prof\.?\s?ssa|Prof\.?)\s+([A-ZÀ-Ý][a-zà-ÿ']+(?:\s+[A-ZÀ-Ý][a-zà-ÿ']+)?)/g;
  while ((m = reDoc.exec(text))) ents.push({ type: 'DOCTOR', start: m.index, end: m.index + m[0].length, text: m[0] });
  // pazienti noti (dataset) in entrambi gli ordini
  for (const p of PATIENTS) for (const full of [`${p.first} ${p.last}`, `${p.last} ${p.first}`]) {
    const re = new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    while ((m = re.exec(text))) ents.push({ type: 'PERSON', start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  // persone: "paziente/sig./signora Nome Cognome" o coppie di maiuscole non in stoplist
  const rePers = /\b(?:paziente|sig\.?ra|sig\.?|signora|signor|figlio di|figlia di|moglie di|marito di)\s+([A-ZÀ-Ý][a-zà-ÿ']+\s+[A-ZÀ-Ý][a-zà-ÿ']+)/gi;
  while ((m = rePers.exec(text))) { const s = m.index + m[0].length - m[1].length; ents.push({ type: 'PERSON', start: s, end: s + m[1].length, text: m[1] }); }
  const rePair = /\b([A-ZÀ-Ý][a-zà-ÿ']{2,})\s+([A-ZÀ-Ý][a-zà-ÿ']{2,})\b/g;
  while ((m = rePair.exec(text))) { if (ANON_STOP.has(m[1]) || ANON_STOP.has(m[2])) continue; const before = text.slice(Math.max(0, m.index - 12), m.index); if (/(Dr|Dott|Prof)\.?\s?(ssa)?\s*$/.test(before)) continue; ents.push({ type: 'PERSON', start: m.index, end: m.index + m[0].length, text: m[0], weak: true }); }
  // date di nascita (contesto) e date generiche
  const reDob = /\b(nat[oa]\s+(?:il|a\s+\S+\s+il)\s+)(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{1,2}\s+(?:GENNAIO|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})/gi;
  while ((m = reDob.exec(text))) { const s = m.index + m[1].length; ents.push({ type: 'DOB', start: s, end: s + m[2].length, text: m[2] }); }
  const reDate = new RegExp(`\\b(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}|\\d{1,2}\\s+(?:${ANON_MONTHS})\\s+\\d{4})\\b`, 'gi');
  while ((m = reDate.exec(text))) ents.push({ type: 'DATE', start: m.index, end: m.index + m[0].length, text: m[0] });
  // identificativi, AVS, telefono, email
  const reId = /\b(?:ID|n\.|nr\.|numero|cartella|paziente n\.?)\s*[:#]?\s*(\d{4,8})\b/gi;
  while ((m = reId.exec(text))) { const s = m.index + m[0].length - m[1].length; ents.push({ type: 'ID', start: s, end: s + m[1].length, text: m[1] }); }
  const reAvs = /\b756\.\d{4}\.\d{4}\.\d{2}\b/g;
  while ((m = reAvs.exec(text))) add('AVS', m);
  const rePhone = /(?:\+41|0041|\b0)\s?\d{2}[\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}\b/g;
  while ((m = rePhone.exec(text))) add('PHONE', m);
  const reMail = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
  while ((m = reMail.exec(text))) add('EMAIL', m);
  // indirizzi e località (via/viale/piazza + numero; CAP + città)
  const reAddr = /\b(?:via|viale|piazza|corso|vicolo|strada)\s+[A-ZÀ-Ýa-zà-ÿ'\s]{2,40}?\s\d{1,4}[a-z]?\b/gi;
  while ((m = reAddr.exec(text))) add('ADDRESS', m);
  const reCap = /\b(?:CH-)?\d{4}\s+[A-ZÀ-Ý][a-zà-ÿ]+(?:\s[A-ZÀ-Ý][a-zà-ÿ]+)?\b/g;
  while ((m = reCap.exec(text))) add('PLACE', m);
  // età ≥ 90
  const reAge = /\b(9\d|1[0-1]\d)\s+anni\b/g;
  while ((m = reAge.exec(text))) add('AGE', m);
  // strutture esterne
  const reOrg = /\b(?:Ospedale|Clinica|Cardiocentro|Casa di cura|Studio medico)\s+(?:[A-ZÀ-Ý][a-zà-ÿ']+\s?){1,3}/g;
  while ((m = reOrg.exec(text))) add('ORG', m);

  // dedup/sovrapposizioni: vince l'entità più lunga; DOB batte DATE; forte batte debole
  ents.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = [];
  for (const e of ents) {
    const last = out[out.length - 1];
    if (last && e.start < last.end) {
      const rank = (x) => (x.type === 'DOB' ? 3 : x.type === 'DOCTOR' ? 3 : x.weak ? 0 : 2) + (x.end - x.start) / 1000;
      if (rank(e) > rank(last)) out[out.length - 1] = e;
      continue;
    }
    out.push(e);
  }
  // pseudonimi coerenti per testo identico
  const counters = {}, map = {};
  for (const e of out) {
    const key = e.type + '|' + e.text.toLowerCase().replace(/\s+/g, ' ');
    if (!map[key]) { counters[e.type] = (counters[e.type] || 0) + 1; map[key] = counters[e.type]; }
    e.n = map[key];
    e.keep = e.type === 'DOCTOR' ? !!ANON.opt.keepDoctors : false;
    e.id = e.type + '_' + e.start;
  }
  return out;
}

function anonReplacement(e) {
  const mode = ANON.opt.mode;
  switch (e.type) {
    case 'PERSON': return mode === 'pseudonym' ? `Paziente ${String.fromCharCode(64 + Math.min(26, e.n))}` : '[PERSONA]';
    case 'DOCTOR': return mode === 'pseudonym' ? `Dr. ${String.fromCharCode(64 + Math.min(26, e.n))}` : '[MEDICO]';
    case 'DOB': return ANON.opt.keepYears ? `[DATA DI NASCITA · anno ${(e.text.match(/\d{4}/) || ['—'])[0]}]` : '[DATA DI NASCITA]';
    case 'DATE': return ANON.opt.shiftDates ? anonShiftDate(e.text) : '[DATA]';
    case 'ID': return `[ID ${e.n}]`;
    case 'AVS': return '[AVS]';
    case 'PHONE': return '[TELEFONO]';
    case 'EMAIL': return '[E-MAIL]';
    case 'ADDRESS': return '[INDIRIZZO]';
    case 'PLACE': return '[LOCALITÀ]';
    case 'AGE': return 'oltre 89 anni';
    case 'ORG': return mode === 'pseudonym' ? `[Struttura ${e.n}]` : '[STRUTTURA]';
  }
  return '[OMISSIS]';
}
/** Sposta le date di un offset fisso per documento (mantiene gli intervalli tra eventi clinici). */
function anonShiftDate(s) {
  if (!ANON.shiftDays) ANON.shiftDays = -(7 + Math.floor(Math.random() * 40));
  const mi = { gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5, luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11 };
  let d = null; const a = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/), b = s.match(/^(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})$/i);
  if (a) d = new Date(+(a[3].length === 2 ? '20' + a[3] : a[3]), +a[2] - 1, +a[1]);
  else if (b && mi[b[2].toLowerCase()] !== undefined) d = new Date(+b[3], mi[b[2].toLowerCase()], +b[1]);
  if (!d || isNaN(d)) return '[DATA]';
  d.setDate(d.getDate() + ANON.shiftDays);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function anonOutput() {
  let out = '', pos = 0;
  for (const e of ANON.entities) { out += ANON.text.slice(pos, e.start) + (e.keep ? e.text : anonReplacement(e)); pos = e.end; }
  return out + ANON.text.slice(pos);
}
function anonHighlighted() {
  let out = '', pos = 0;
  for (const e of ANON.entities) {
    out += esc(ANON.text.slice(pos, e.start));
    out += `<mark class="an ${e.keep ? 'keep' : ANON_TYPES[e.type][1]}" title="${ANON_TYPES[e.type][0]}${e.keep ? ' · mantenuto' : ' → ' + esc(anonReplacement(e))}" onclick="anonToggle('${e.id}')">${esc(e.text)}</mark>`;
    pos = e.end;
  }
  return out + esc(ANON.text.slice(pos));
}
function anonRun() {
  const ta = document.getElementById('anon-in'); if (ta) ANON.text = ta.value;
  if (!ANON.text.trim()) { toast('Incolla o trascina un testo da anonimizzare'); return; }
  ANON.shiftDays = 0; ANON.entities = anonDetect(ANON.text); ANON.done = true; render();
  toast(`${ANON.entities.length} elementi identificativi rilevati · elaborazione locale`);
}
function anonToggle(id) { const e = ANON.entities.find(x => x.id === id); if (e) { e.keep = !e.keep; render(); } }
function anonToggleType(type, keep) { ANON.entities.forEach(e => { if (e.type === type) e.keep = keep; }); render(); }
function anonSetOpt(k, v) { ANON.opt[k] = v; anonSaveOpt(); if (ANON.done) { ANON.entities.forEach(e => { if (e.type === 'DOCTOR') e.keep = !!ANON.opt.keepDoctors; }); } render(); }
function anonCopy() { navigator.clipboard?.writeText(anonOutput()).then(() => toast('Testo anonimizzato copiato'), () => toast('Copia non disponibile')); }
function anonDownload(kind) {
  let content, name;
  if (kind === 'text') { content = anonOutput(); name = 'documento-anonimizzato.txt'; }
  else { content = JSON.stringify({ note: 'Mappa di re-identificazione: SOLO uso interno, non allegare al documento anonimizzato', created_at: new Date().toISOString(), shift_days: ANON.shiftDays || 0, entries: ANON.entities.filter(e => !e.keep).map(e => ({ type: e.type, original: e.text, replacement: anonReplacement(e) })) }, null, 2); name = 'mappa-reidentificazione.json'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  toast(kind === 'text' ? 'Documento anonimizzato scaricato' : 'Mappa scaricata · conservala separatamente');
}
function anonReset() { ANON.text = ''; ANON.entities = []; ANON.done = false; ANON.source = ''; render(); }
function anonLoadExample() {
  ANON.text = `Gentile Collega,\n\nle scrivo in merito al paziente Mario Rossi, nato il 12.03.1959, residente in via Nassa 24, 6900 Lugano, tel. +41 79 412 33 21, e-mail m.rossi@example.ch, ID 10231, AVS 756.1234.5678.97.\n\nIl paziente, 67 anni, è seguito dal 2023 per fibrillazione atriale parossistica. Il 12.08.2026 ha eseguito un Holter ECG (burden 3 %); l'ecocardiogramma del 4 settembre 2026 mostra FE 58 % e atrio sinistro 42 mm. Recente ricovero presso Ospedale Regionale Lugano (lettera di dimissione dell'8 settembre 2026, Dr. Ponti) per FA ad alta risposta ventricolare.\n\nTerapia: Bisoprololo 5 mg 1x/die, Ramipril 10 mg, Apixaban 5 mg 2x/die, Atorvastatina 20 mg. La moglie, Anna Rossi, riferisce palpitazioni serali.\n\nControllo tra 6 mesi. Resto a disposizione.\n\nDr.ssa Elena Bianchi\nStudio Cardiologico Lugano`;
  ANON.source = 'esempio (dati fittizi)'; ANON.entities = []; ANON.done = false; render();
}
async function anonFiles(list) {
  const f = [...list][0]; if (!f) return;
  if (/\.pdf$/i.test(f.name)) { toast('PDF: nel prototipo incolla il testo estratto. In produzione l\'estrazione avviene sul server dello studio.'); return; }
  if (!/\.(txt|md|json|csv|html?)$/i.test(f.name)) { toast('Formati accettati nel prototipo: txt, md, json, csv, html'); return; }
  let t = await f.text();
  if (/\.html?$/i.test(f.name)) t = t.replace(/<[^>]+>/g, ' ');
  ANON.text = t; ANON.source = f.name; ANON.entities = []; ANON.done = false; render();
}
/** Dal visualizzatore documenti: anonimizza il documento aperto accanto. */
function anonFromDoc() {
  const body = document.querySelector('#docviewer .dv-page'); if (!body) return;
  ANON.text = body.innerText.replace(/\n{3,}/g, '\n\n'); ANON.source = (DV.item && DV.item.title) || 'documento'; ANON.entities = []; ANON.done = false;
  go('#/anonymize');
}

PAGES.anonymize = () => {
  const acc = (AI_ACCESS[state.role] || {}).archive;
  if (!acc) return `<div class="card">${emptyState('shield', 'Non disponibile con il tuo ruolo', 'L\'anonimizzazione lavora su contenuti clinici: richiede l\'accesso all\'archivio.')}</div>`;
  const groups = {};
  ANON.entities.forEach(e => { (groups[e.type] = groups[e.type] || []).push(e); });
  const hidden = ANON.entities.filter(e => !e.keep).length;
  return `
    <div class="page-head"><div><h2 class="page-title">Anonimizzazione documenti</h2><div class="page-sub">Rimuove i dati identificativi da un testo clinico prima di condividerlo, usarlo come esempio o passarlo a un modello. Tutto avviene sul tuo dispositivo: nessun invio.</div></div>
      <div class="actions">${ANON.done ? `<button class="btn" onclick="anonReset()">Nuovo</button>` : `<button class="btn ghost" onclick="anonLoadExample()">Carica esempio</button>`}</div></div>
    ${!ANON.done ? `
    <div class="grid grid-main-side">
      <div class="card">
        <div class="dropzone" id="anon-drop" tabindex="0" role="button">${ICONS.upload}<div><b>Trascina qui un documento</b> (txt, md, json, csv, html) o incolla il testo sotto<br><span class="caption">PDF e scansioni: in produzione l'estrazione del testo avviene sul server dello studio</span></div><input type="file" id="anon-file" hidden accept=".txt,.md,.json,.csv,.html,.htm,.pdf"></div>
        <div class="field mt-16"><label>Testo da anonimizzare${ANON.source ? ` · <span class="caption">${esc(ANON.source)}</span>` : ''}</label><textarea class="input" id="anon-in" rows="14" placeholder="Incolla qui una lettera, un referto, una nota…">${esc(ANON.text)}</textarea></div>
        <div class="row mt-16" style="gap:8px"><button class="btn primary" onclick="anonRun()">${ICONS.shield} Analizza e anonimizza</button><span class="caption">Il testo resta nel browser.</span></div>
      </div>
      <div class="stack">
        <div class="card"><div class="section-title">Opzioni</div>${anonOptions()}</div>
        <div class="card"><div class="section-title">Cosa viene rilevato</div><div class="meta" style="line-height:1.9;font-size:13px">${Object.entries(ANON_TYPES).map(([k, v]) => `<span class="badge ${v[1]}" style="margin:0 4px 4px 0">${v[0]}</span>`).join('')}</div><p class="caption mt-8">Farmaci, diagnosi, valori e nomi dei medici (se scelto) restano: servono al contenuto clinico. La lista dei rilevamenti va sempre controllata da una persona prima dell'uso.</p></div>
      </div>
    </div>` : `
    <div class="card tight mb-16 row" style="gap:10px;flex-wrap:wrap">
      <span class="badge success">${ICONS.check} ${hidden} elementi sostituiti</span>${ANON.entities.length - hidden ? `<span class="badge">${ANON.entities.length - hidden} mantenuti</span>` : ''}
      <span class="caption">Clic su un elemento evidenziato per mantenerlo o sostituirlo.</span>
      <span class="right row" style="gap:6px"><button class="btn sm" onclick="anonCopy()">${ICONS.copy} Copia testo</button><button class="btn sm" onclick="anonDownload('text')">${ICONS.upload} Scarica .txt</button><button class="btn sm ghost" onclick="anonDownload('map')" title="Solo uso interno">${ICONS.key} Mappa di re-identificazione</button>${typeof kpPropose === 'function' ? `<button class="btn sm ai" onclick="anonProposeExample()">${ICONS.book} Proponi come esempio per la wiki</button>` : ''}</span>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><span class="section-title">Originale con rilevamenti</span></div><div class="anon-doc">${anonHighlighted()}</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Anonimizzato</span><span class="caption">${ANON.opt.mode === 'pseudonym' ? 'pseudonimi coerenti' : 'segnaposto'}${ANON.opt.shiftDates ? ' · date traslate' : ''}</span></div><div class="anon-doc out">${esc(anonOutput())}</div></div>
    </div>
    <div class="grid grid-main-side mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Rilevamenti per tipo</span></div>
        ${Object.keys(groups).length ? Object.entries(groups).map(([t, list]) => `<div class="list-item"><span class="badge ${ANON_TYPES[t][1]}">${ANON_TYPES[t][0]}</span><div class="grow" style="font-size:13px">${[...new Set(list.map(e => e.text))].map(esc).join(' · ')}</div><span class="caption num">${list.length}</span><div class="act"><button class="btn sm ghost" onclick="anonToggleType('${t}', true)">Mantieni</button><button class="btn sm" onclick="anonToggleType('${t}', false)">Sostituisci</button></div></div>`).join('') : '<div class="caption">Nessun dato identificativo rilevato.</div>'}
      </div>
      <div class="stack"><div class="card"><div class="section-title">Opzioni</div>${anonOptions()}</div>
        <div class="card"><div class="section-title">Registro</div><div class="caption" style="line-height:1.7">Elaborazione locale nel browser · nessun servizio esterno · evento <code>DOCUMENT_ANONYMIZED</code> (solo conteggi, mai il contenuto)${ANON.source ? ` · origine: ${esc(ANON.source)}` : ''}</div></div></div>
    </div>`}`;
};
function anonOptions() {
  const o = ANON.opt;
  return `<div class="stack" style="gap:8px;font-size:13px">
    <label class="row" style="gap:8px"><input type="radio" name="anon-mode" ${o.mode === 'pseudonym' ? 'checked' : ''} onchange="anonSetOpt('mode','pseudonym')"> Pseudonimi coerenti (Paziente A, Dr. B)</label>
    <label class="row" style="gap:8px"><input type="radio" name="anon-mode" ${o.mode === 'placeholder' ? 'checked' : ''} onchange="anonSetOpt('mode','placeholder')"> Segnaposto ([PERSONA], [DATA])</label>
    <label class="row" style="gap:8px"><input type="checkbox" ${o.keepDoctors ? 'checked' : ''} onchange="anonSetOpt('keepDoctors',this.checked)"> Mantieni i nomi dei medici</label>
    <label class="row" style="gap:8px"><input type="checkbox" ${o.shiftDates ? 'checked' : ''} onchange="anonSetOpt('shiftDates',this.checked)"> Trasla le date (stesso scarto per tutto il documento)</label>
    <label class="row" style="gap:8px"><input type="checkbox" ${o.keepYears ? 'checked' : ''} onchange="anonSetOpt('keepYears',this.checked)"> Della data di nascita conserva solo l'anno</label>
  </div>`;
}
function anonProposeExample() {
  if (typeof kpPropose !== 'function') return;
  const txt = anonOutput();
  if (ANON.entities.some(e => !e.keep && e.type !== 'DOCTOR' && e.type !== 'DATE') === false && ANON.entities.length) { /* tutto mantenuto: avvisa */ }
  if (ANON.entities.some(e => e.keep && ['PERSON', 'DOB', 'ID', 'AVS', 'PHONE', 'EMAIL', 'ADDRESS'].includes(e.type))) { toast('Ci sono dati identificativi mantenuti: la wiki (phi_check strict) non li accetta'); return; }
  kpPropose({ from: 'Esempio anonimizzato', to: txt.slice(0, 160) + (txt.length > 160 ? '…' : ''), report: 'anonymize', issueId: 'example' });
}
function anonBind(root) {
  const dz = root.querySelector('#anon-drop'), inp = root.querySelector('#anon-file'); if (!dz) return;
  dz.onclick = () => inp.click(); dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  inp.onchange = () => { anonFiles(inp.files); inp.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) anonFiles(e.dataTransfer.files); });
  const ta = root.querySelector('#anon-in'); if (ta) ta.oninput = () => { ANON.text = ta.value; };
}
