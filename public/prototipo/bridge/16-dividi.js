/* =====================================================================
   Dividi cartella (9.10.2026) — [[Piattaforma/Dividi cartella]]
   =====================================================================
   Una cartella completa arriva spesso come UN PDF (la cartella cartacea
   scansionata, l'esportazione di un altro programma): qui la si divide nei
   suoi documenti — lettere, referti, esami — ognuno un PDF a sé nella
   cartella del paziente. Il server PROPONE i tagli dal testo delle pagine
   (src/lib/dividi/tagli.ts); qui si guardano le miniature, si corregge e si
   conferma. L'originale resta com'è.
   Mentre si corregge NON si ridisegna la pagina intera (tornerebbe in cima a
   ogni clic): si ridisegna solo l'elenco dei pezzi. */
if (typeof NAV_META !== 'undefined') NAV_META.dividi = ['Dividi cartella', 'dividi'];
if (typeof ICONS !== 'undefined' && typeof I === 'function' && !ICONS.dividi) ICONS.dividi = I('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5 20 18"/><path d="M8 16.5 20 6"/>');
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin', 'tech_admin']) {
  const n = NAV[r]; if (n && !n.includes('dividi')) n.splice(Math.max(0, n.indexOf('documents')) + 1, 0, 'dividi');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-div-pezzo { border:1px solid var(--border); border-radius:16px; padding:12px 14px; background:var(--surface); margin-top:12px; }
.rf-div-pezzo.escluso { opacity:.5; }
.rf-div-testa { display:flex; flex-wrap:wrap; gap:10px 12px; align-items:center; }
.rf-div-testa .n { font-weight:650; font-variant-numeric:tabular-nums; white-space:nowrap; }
.input.rf-div-in { min-width:0 !important; height:34px; padding:0 10px; }
.rf-div-pagine { display:flex; flex-wrap:wrap; gap:6px 4px; align-items:flex-end; margin-top:12px; }
.rf-div-th { position:relative; width:112px; cursor:zoom-in; border:1px solid var(--border); border-radius:6px; overflow:hidden; background:#fff; line-height:0; }
.rf-div-th img, .rf-div-th .vuota { display:block; width:112px; height:150px; object-fit:contain; background:#fff; }
.rf-div-th .vuota { background:var(--surface-2, #eef0ec); }
.rf-div-th span { position:absolute; left:4px; bottom:4px; font-size:11px; line-height:1.3; padding:0 5px; border-radius:5px; background:rgba(0,0,0,.6); color:#fff; font-variant-numeric:tabular-nums; }
.rf-div-taglia { align-self:stretch; width:22px; border:0; border-radius:6px; background:transparent; color:var(--text-3, var(--text-2)); cursor:pointer; font-size:13px; padding:0; }
.rf-div-taglia:hover { background:var(--surface-3, rgba(0,0,0,.06)); color:var(--text); }
.rf-div-zoom { position:fixed; inset:0; z-index:45; background:rgba(0,0,0,.86); display:flex; flex-direction:column; align-items:center; padding:10px; gap:8px; }
.rf-div-zoom .barra { display:flex; gap:10px; align-items:center; background:var(--surface); border-radius:12px; padding:6px 10px; }
.rf-div-zoom .tela { flex:1; min-height:0; overflow:auto; display:flex; justify-content:center; width:100%; }
.rf-div-zoom canvas { background:#fff; max-width:none; }
.rf-div-drop { border:1.5px dashed var(--border); border-radius:12px; padding:18px; text-align:center; color:var(--text-2); font-size:13.5px; }
.rf-div-drop.sopra { border-color:var(--accent); color:var(--accent); }
`; document.head.appendChild(st); })();

RF.div = { pid: '', nome: '', cerca: '', documenti: null, doc: null, pezzi: [], proposti: [], carico: false, errore: null, creati: null, invio: null, pdf: null, pdfId: null, mini: {}, zoom: 0, attesa: null };
const RF_DIV_URL = '/api/prototipo/dividi';
const RF_DIV_TIPI = [['lettera', 'Lettera'], ['referto', 'Referto'], ['dimissione', 'Lettera di dimissione'], ['laboratorio', 'Laboratorio'], ['ecg', 'ECG'], ['ett', 'Ecocardiogramma'], ['ciclo', 'Prova da sforzo'], ['holter', 'Holter'], ['imaging', 'Imaging'], ['consenso', 'Consenso'], ['altro', 'Documento']];
const rfDivEtichetta = (k) => (RF_DIV_TIPI.find(x => x[0] === k) || ['', 'Documento'])[1];
const rfDivGiorno = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const rfDivTitolo = (p) => `${rfDivEtichetta(p.categoria)}${p.data ? ` ${p.data}` : ''}`;

async function rfDivChiedi(url, corpo) {
  try {
    const r = await fetch(url, corpo ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { errore: j.errore === 'non_permesso' || j.errore === 'ruolo_non_ammesso' ? 'Il tuo ruolo non divide le cartelle.' : (j.errore || `Non riuscito (${r.status}).`) };
  } catch { return { errore: 'Piattaforma non raggiungibile.' }; }
}

/* ---------- scegliere il paziente e la cartella ---------- */
// Lo storico: le cartelle complete caricate di recente e a che punto sono (in lettura, da dividere, divise).
async function rfDivStorico() {
  if (RF.div.storicoChiesto && Date.now() - RF.div.storicoChiesto < 15000) return;      // si ridisegna a ogni tasto: non a ogni tasto una richiesta
  RF.div.storicoChiesto = Date.now();
  const j = await rfDivChiedi(`${RF_DIV_URL}?recenti=1`);
  RF.div.storico = j.errore ? [] : (j.cartelle || []);
  const el = document.getElementById('rf-div-storico'); if (el) el.innerHTML = rfDivStoricoHtml();
}
function rfDivStoricoHtml() {
  const s = RF.div.storico;
  if (!s) return '<div class="caption mt-8">Cerco le cartelle caricate…</div>';
  if (!s.length) return '<div class="caption mt-8">Ancora nessuna: le cartelle che carichi qui restano in questo elenco, per riprenderle quando vuoi.</div>';
  return `<div class="list mt-8">${s.map(x => {
    const stato = x.divisa_il ? `<span class="badge success">divisa in ${x.documenti || '?'} documenti il ${rfEsc(rfDivGiorno(x.divisa_il))}</span>` : x.ocr_stato === 'da_fare' ? '<span class="badge warning">il Mac la sta leggendo</span>' : '<span class="badge accent">da dividere</span>';
    return `<div class="list-item"><div class="grow"><div class="name">${rfEsc(x.paziente)}</div><div class="sub">${rfEsc(x.filename)} · caricata il ${rfEsc(rfDivGiorno(x.caricato))}</div></div>${stato}
      <button class="btn sm ghost" data-go="#/patients/${x.patient_id}">Cartella</button><button class="btn sm${x.divisa_il ? '' : ' primary'}" onclick="rfDivApri('${x.id}')">${x.divisa_il ? 'Dividi di nuovo' : 'Dividi'}</button></div>`; }).join('')}</div>`;
}
function rfDivCerca(v) { RF.div.cerca = v; render(); const e = document.getElementById('rf-div-cerca'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }
async function rfDivPaziente(pid) {
  const p = (RF.data.patients || []).find(x => x.id === pid);
  Object.assign(RF.div, { pid, nome: p ? fullName(p) : '', cerca: '', documenti: null, errore: null, creati: null });
  render();
  const j = await rfDivChiedi(`${RF_DIV_URL}?paziente=${encodeURIComponent(pid)}`);
  if (j.errore) RF.div.errore = j.errore; else RF.div.documenti = j.documenti || [];
  render();
}
function rfDivCambia() { rfDivLiberaPdf(); Object.assign(RF.div, { storicoChiesto: 0, pid: '', nome: '', cerca: '', documenti: null, doc: null, pezzi: [], proposti: [], creati: null, errore: null, invio: null, attesa: null }); render(); }
function rfDivDrop(e, sopra) { e.preventDefault(); const z = document.getElementById('rf-div-drop'); if (z) z.classList.toggle('sopra', sopra); }
function rfDivDropFile(e) { e.preventDefault(); rfDivDrop(e, false); if (e.dataTransfer && e.dataTransfer.files[0]) rfDivFile(e.dataTransfer.files[0]); }

/* ---------- un PDF trascinato PRIMA di scegliere il paziente (9.10.2026) ----------
   Serve per chi in ReferralFlow non c'è ancora: il file aspetta qui nel browser, dal suo testo si
   propongono nome e data di nascita, e la cartella si crea (o si sceglie) senza uscire dalla pagina.
   Finché non si conferma di chi è, sul server non arriva né il file né un paziente nuovo. */
function rfDivFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name)) { toast('Serve un PDF'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('Il file supera i 50 MB: dividilo in due parti prima di caricarlo'); return; }
  if (RF.div.pid) { void rfDivCarica(file); return; }
  RF.div.attesa = { file, stato: 'leggo', letto: null, trovato: null, cognome: '', nome: '', nascita: '', pagine: null, salvo: false };
  RF.div.errore = null; RF.div.cerca = ''; render();
  void rfDivChiE(file);
}
// Il testo delle prime pagine si estrae qui nel browser: così il file non si carica due volte.
async function rfDivChiE(file) {
  const a = RF.div.attesa; let testi = [];
  try {
    const lib = await rfPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, wasmUrl: '/prototipo/vendor/pdfjs/wasm/', standardFontDataUrl: '/prototipo/vendor/pdfjs/standard_fonts/' }).promise;
    a.pagine = pdf.numPages;
    for (let n = 1; n <= Math.min(12, pdf.numPages); n++) {
      const tc = await (await pdf.getPage(n)).getTextContent(); let s = '';
      for (const it of tc.items) s += (it.str || '') + (it.hasEOL ? '\n' : ' ');
      testi.push(s.slice(0, 8000));
    }
    try { pdf.destroy(); } catch { /* già chiuso */ }
  } catch { testi = []; }
  if (RF.div.attesa !== a) return;                       // nel frattempo il file è stato tolto
  const j = testi.some(x => x.trim().length > 20) ? await rfDivChiedi(RF_DIV_URL, { azione: 'chi', testi }) : {};
  if (RF.div.attesa !== a) return;
  a.stato = 'pronto'; a.letto = j.letto || null; a.trovato = j.trovato || null;
  if (a.letto) { a.cognome = a.letto.cognome || ''; a.nome = a.letto.nome || ''; a.nascita = rfDivGiorno(a.letto.nascita); }
  render();
}
function rfDivAttesaCerca(v) { RF.div.cerca = v; render(); const e = document.getElementById('rf-div-cerca'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }
// È di qualcuno che c'è già: si carica nella sua cartella e si passa alla proposta.
function rfDivUsa(pid, nome) {
  const a = RF.div.attesa; if (!a) return;
  const p = (RF.data.patients || []).find(x => x.id === pid);
  Object.assign(RF.div, { pid, nome: nome || (p ? fullName(p) : ''), attesa: null, cerca: '' });
  void rfDivCarica(a.file);
}
// Non c'è ancora: nasce la cartella coi dati confermati qui, poi il file ci entra.
async function rfDivCreaPaziente() {
  const a = RF.div.attesa; if (!a || a.salvo) return;
  if (!a.cognome.trim() || !a.nome.trim() || !a.nascita.trim()) { toast('Servono cognome, nome e data di nascita'); return; }
  a.salvo = true; const b = document.getElementById('rf-div-creapaz'); if (b) { b.disabled = true; b.textContent = 'Creo la cartella…'; }
  let j = {}, stato = 0;
  try {
    const r = await fetch('/api/prototipo/pazienti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'crea', cognome: a.cognome, nome: a.nome, data_nascita: a.nascita }) });
    stato = r.status; j = await r.json().catch(() => ({}));
  } catch { /* sotto */ }
  a.salvo = false;
  // 409 = quella persona c'è già (stesso cognome, nome e data di nascita): si usa la sua cartella, senza doppioni.
  if ((stato === 201 || stato === 409) && j.id) {
    if (stato === 409) toast('Questa persona c’era già: uso la sua cartella');
    void rfCaricaDati();
    rfDivUsa(j.id, `${a.cognome.trim()} ${a.nome.trim()}`);
    return;
  }
  const perche = j.errori ? Object.values(j.errori)[0] : (j.errore === 'non_permesso' ? 'Il tuo ruolo non crea cartelle' : j.errore);
  toast(perche || (stato ? `La cartella non si è creata (${stato})` : 'Piattaforma non raggiungibile'));
  if (b) { b.disabled = false; b.textContent = 'Crea la cartella e continua'; }
}
// La cartella completa entra come un documento della cartella (col suo OCR, se è una scansione), poi la si divide.
function rfDivCarica(file) {
  if (!file || !RF.div.pid) return;
  if (!/\.pdf$/i.test(file.name)) { toast('Serve un PDF'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('Il file supera i 50 MB: dividilo in due parti prima di caricarlo'); return; }
  RF.div.invio = 0; RF.div.errore = null; render();
  const fd = new FormData(); fd.append('file', file); fd.append('categoria', 'altro'); fd.append('nota', 'cartella completa, da dividere');
  const x = new XMLHttpRequest();
  x.open('POST', `/api/prototipo/pazienti/${encodeURIComponent(RF.div.pid)}/documenti`);
  x.withCredentials = true;
  x.upload.onprogress = (ev) => { if (ev.lengthComputable) { RF.div.invio = Math.round(ev.loaded / ev.total * 100); const b = document.getElementById('rf-div-invio'); if (b) b.textContent = `Carico… ${RF.div.invio}%`; } };
  x.onload = () => {
    let j = {}; try { j = JSON.parse(x.responseText || '{}'); } catch { /* risposta non leggibile */ }
    RF.div.invio = null;
    if (x.status !== 201 || !j.id) { RF.div.errore = j.errore || `Caricamento non riuscito (${x.status}).`; RF.div.documenti = RF.div.documenti || []; render(); return; }
    void rfDivApri(j.id);
  };
  x.onerror = () => { RF.div.invio = null; RF.div.errore = 'Piattaforma non raggiungibile.'; render(); };
  x.send(fd);
}

/* ---------- la proposta ---------- */
async function rfDivApri(id) {
  rfDivLiberaPdf();
  Object.assign(RF.div, { carico: true, errore: null, creati: null, doc: null, pezzi: [], proposti: [] }); render();
  const j = await rfDivChiedi(`${RF_DIV_URL}?documento=${encodeURIComponent(id)}`);
  RF.div.carico = false;
  if (j.errore) { RF.div.errore = j.errore; render(); return; }
  RF.div.doc = { id: j.documento.id, filename: j.documento.filename, pagine: j.pagine, con_testo: j.con_testo, ocr: j.ocr };
  if (!RF.div.pid) { RF.div.pid = j.documento.patient_id; RF.div.nome = j.documento.paziente; }
  RF.div.proposti = (j.pezzi || []).map(p => [p.da, p.a]);
  RF.div.pezzi = (j.pezzi || []).map(p => ({ da: p.da, a: p.a, categoria: p.categoria, data: rfDivGiorno(p.data), titolo: '', auto: true, sicurezza: p.sicurezza, escluso: false }));
  RF.div.pezzi.forEach(p => { p.titolo = rfDivTitolo(p); });
  RF.div.toccato = false;
  render();
  void rfDivPdf();
  rfDivAspetta();
}
// Una scansione senza testo il Mac la legge da sé (OCR), di solito in un minuto o due: la pagina aspetta
// e, a lettura finita, rifà la proposta da sola. Se nel frattempo si è già cominciato a tagliare a mano,
// non tocca niente e lo dice: si sceglie se passare ai tagli proposti.
let rfDivTimer = null;
const rfDivPochi = (d) => d.con_testo < d.pagine * 0.5;
function rfDivAvvisoHtml() {
  const d = RF.div.doc; if (!d || !rfDivPochi(d)) return '';
  const quante = d.con_testo ? `Solo ${d.con_testo} pagine su ${d.pagine} hanno un testo leggibile` : 'Questo PDF non ha testo leggibile';
  if (d.ocr === 'da_fare') return `<div class="rf-manc mb-16"><b>È una scansione: il Mac la sta leggendo.</b> Per ${d.pagine} pagine ci vuole circa ${rfDivStima(d.pagine)} (di più se sta trascrivendo un referto: quello ha la precedenza). <b>La pagina si aggiorna da sola</b> e propone i tagli appena ha finito; intanto puoi guardare le pagine o tagliare a mano.</div>`;
  if (d.ocr === 'pronta') return `<div class="rf-manc mb-16"><b>Il Mac ha finito di leggere la scansione.</b> Hai già cominciato a tagliare a mano: <a href="javascript:void 0" onclick="rfDivDaCapo()">passa ai tagli proposti</a> (le tue correzioni si perdono) oppure continua così.</div>`;
  return `<div class="rf-manc mb-16"><b>${quante}${d.ocr === 'fatto' ? ', anche dopo la lettura del Mac' : ''}.</b> ${d.ocr === 'fallito' ? 'La lettura automatica non è riuscita. ' : d.ocr === 'fatto' ? 'Il resto è scritto a mano o troppo sbiadito. ' : ''}Dove manca il testo i tagli non si possono proporre: mettili tu con le forbici fra le pagine.</div>`;
}
const rfDivStima = (pagine) => { const m = Math.max(1, Math.ceil(pagine * 0.5 / 60)); return m === 1 ? 'un minuto' : `${m} minuti`; };
function rfDivAspetta() {
  clearTimeout(rfDivTimer); rfDivTimer = null;
  const d = RF.div.doc; if (!d || d.ocr !== 'da_fare' || !rfDivPochi(d)) return;
  rfDivTimer = setTimeout(async () => {
    if (RF.div.doc !== d || !document.getElementById('rf-div-avviso')) return;      // si è cambiato documento o pagina
    const j = await rfDivChiedi(`${RF_DIV_URL}?stato=${encodeURIComponent(d.id)}`);
    if (RF.div.doc !== d) return;
    if (j.ocr === 'fatto' && !RF.div.toccato) { void rfDivApri(d.id); return; }
    if (j.ocr === 'fatto' || j.ocr === 'fallito') { d.ocr = j.ocr === 'fatto' ? 'pronta' : 'fallito'; const el = document.getElementById('rf-div-avviso'); if (el) el.innerHTML = rfDivAvvisoHtml(); return; }
    rfDivAspetta();
  }, 5000);
}
function rfDivLiberaPdf() { try { if (RF.div.pdf) RF.div.pdf.destroy(); } catch { /* già chiuso */ } RF.div.pdf = null; RF.div.pdfId = null; RF.div.mini = {}; RF.div.zoom = 0; }
// Il PDF si apre una volta nel browser, per le miniature e per guardare una pagina in grande.
async function rfDivPdf() {
  const d = RF.div.doc; if (!d || RF.div.pdfId === d.id) return;
  RF.div.pdfId = d.id;
  try {
    const lib = await rfPdfJs();
    const r = await fetch(`/api/documents/${d.id}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const dati = new Uint8Array(await r.arrayBuffer());
    if (!RF.div.doc || RF.div.doc.id !== d.id) return;
    RF.div.pdf = await lib.getDocument({ data: dati, isEvalSupported: false, wasmUrl: '/prototipo/vendor/pdfjs/wasm/', standardFontDataUrl: '/prototipo/vendor/pdfjs/standard_fonts/' }).promise;
    rfDivOsserva();
  } catch { if (RF.div.doc && RF.div.doc.id === d.id) { RF.div.pdfId = null; toast('Non riesco a mostrare le miniature: i tagli si possono fare lo stesso, per numero di pagina'); } }
}
// Le miniature si disegnano quando si avvicinano allo schermo e restano in memoria (una piccola immagine per pagina).
let rfDivOss = null;
function rfDivOsserva() {
  if (!RF.div.pdf) return;
  if (rfDivOss) rfDivOss.disconnect();
  rfDivOss = new IntersectionObserver((voci) => voci.forEach(v => { if (v.isIntersecting) { rfDivOss.unobserve(v.target); void rfDivMini(Number(v.target.dataset.n)); } }), { root: document.getElementById('content'), rootMargin: '900px 0px' });
  document.querySelectorAll('.rf-div-th[data-n]').forEach(el => { if (!RF.div.mini[el.dataset.n]) rfDivOss.observe(el); });
}
async function rfDivMini(n) {
  const pdf = RF.div.pdf; if (!pdf || RF.div.mini[n]) return;
  RF.div.mini[n] = 'attesa';
  try {
    const p = await pdf.getPage(n), v1 = p.getViewport({ scale: 1 }), v = p.getViewport({ scale: 224 / v1.width });
    const c = document.createElement('canvas'); c.width = Math.floor(v.width); c.height = Math.floor(v.height);
    await p.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: v }).promise;
    if (RF.div.pdf !== pdf) return;
    RF.div.mini[n] = c.toDataURL('image/jpeg', 0.72);
    const el = document.querySelector(`.rf-div-th[data-n="${n}"]`);
    if (el) el.innerHTML = `<img src="${RF.div.mini[n]}" alt="Pagina ${n}"><span>${n}</span>`;
  } catch { delete RF.div.mini[n]; }
}

/* ---------- correggere i tagli (senza ridisegnare la pagina intera) ---------- */
function rfDivAggiorna() {
  const el = document.getElementById('rf-div-pezzi'); if (!el) { render(); return; }
  el.innerHTML = rfDivPezziHtml();
  const b = document.getElementById('rf-div-crea'); if (b) b.textContent = rfDivTastoCrea();
  rfDivOsserva();
}
function rfDivTaglia(n) {
  RF.div.toccato = true;
  const k = RF.div.pezzi.findIndex(p => p.da < n && n <= p.a); if (k < 0) return;
  const p = RF.div.pezzi[k];
  const nuovo = { da: n, a: p.a, categoria: 'altro', data: '', titolo: '', auto: true, sicurezza: 'tua', escluso: p.escluso };
  nuovo.titolo = rfDivTitolo(nuovo); p.a = n - 1;
  RF.div.pezzi.splice(k + 1, 0, nuovo); rfDivAggiorna();
}
function rfDivUnisci(k) { if (k < 1) return; RF.div.toccato = true; RF.div.pezzi[k - 1].a = RF.div.pezzi[k].a; RF.div.pezzi.splice(k, 1); rfDivAggiorna(); }
function rfDivEscludi(k) { RF.div.toccato = true; RF.div.pezzi[k].escluso = !RF.div.pezzi[k].escluso; rfDivAggiorna(); }
function rfDivCampo(k, campo, v) {
  RF.div.toccato = true;
  const p = RF.div.pezzi[k]; if (!p) return;
  p[campo] = v;
  if (campo === 'titolo') { p.auto = false; return; }
  // Finché il titolo è quello proposto, segue il tipo e la data che si scelgono.
  if (p.auto) { p.titolo = rfDivTitolo(p); const t = document.getElementById(`rf-div-t-${k}`); if (t) t.value = p.titolo; }
}
function rfDivDaCapo() {
  if (!RF.div.doc || !confirm('Tornare ai tagli proposti? Le correzioni fatte fin qui si perdono.')) return;
  void rfDivApri(RF.div.doc.id);
}
const rfDivTastoCrea = () => { const n = RF.div.pezzi.filter(p => !p.escluso).length; return n === 1 ? 'Crea 1 documento' : `Crea ${n} documenti`; };

/* ---------- guardare una pagina in grande ---------- */
function rfDivZoom(n) {
  const d = RF.div.doc; if (!d || !RF.div.pdf) return;
  RF.div.zoom = Math.max(1, Math.min(d.pagine, n));
  let z = document.getElementById('rf-div-zoom');
  if (!z) { z = document.createElement('div'); z.id = 'rf-div-zoom'; z.className = 'rf-div-zoom'; z.onclick = (e) => { if (e.target === z || e.target.classList.contains('tela')) rfDivZoomVia(); }; document.body.appendChild(z); }
  const k = RF.div.pezzi.findIndex(p => p.da <= RF.div.zoom && RF.div.zoom <= p.a), inizio = k >= 0 && RF.div.pezzi[k].da === RF.div.zoom;
  z.innerHTML = `<div class="barra"><button class="btn sm" onclick="rfDivZoom(${RF.div.zoom - 1})" ${RF.div.zoom <= 1 ? 'disabled' : ''}>‹</button><b style="font-variant-numeric:tabular-nums">pagina ${RF.div.zoom} di ${d.pagine}</b><button class="btn sm" onclick="rfDivZoom(${RF.div.zoom + 1})" ${RF.div.zoom >= d.pagine ? 'disabled' : ''}>›</button>
    ${RF.div.zoom > 1 ? (inizio ? `<button class="btn sm" onclick="rfDivUnisci(${k});rfDivZoom(${RF.div.zoom})">Non comincia qui: unisci al precedente</button>` : `<button class="btn sm primary" onclick="rfDivTaglia(${RF.div.zoom});rfDivZoom(${RF.div.zoom})">Qui comincia un documento</button>`) : ''}
    <button class="btn sm ghost" onclick="rfDivZoomVia()">Chiudi</button></div><div class="tela"><canvas></canvas></div>`;
  const quale = RF.div.zoom, pdf = RF.div.pdf;
  pdf.getPage(quale).then(async (p) => {
    const tela = z.querySelector('.tela'), c = z.querySelector('canvas'); if (!c || RF.div.zoom !== quale) return;
    const v1 = p.getViewport({ scale: 1 }), dpr = Math.min(2, window.devicePixelRatio || 1);
    const scala = Math.min((tela.clientWidth - 20) / v1.width, 1.6) * dpr, v = p.getViewport({ scale: scala });
    c.width = Math.floor(v.width); c.height = Math.floor(v.height); c.style.width = `${Math.floor(v.width / dpr)}px`; c.style.height = `${Math.floor(v.height / dpr)}px`;
    await p.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: v }).promise;
  }).catch(() => null);
}
function rfDivZoomVia() { RF.div.zoom = 0; const z = document.getElementById('rf-div-zoom'); if (z) z.remove(); }
window.addEventListener('keydown', (e) => {
  if (!RF.div.zoom) return;
  if (e.key === 'Escape') { e.preventDefault(); rfDivZoomVia(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); rfDivZoom(RF.div.zoom + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); rfDivZoom(RF.div.zoom - 1); }
});

/* ---------- creare i documenti ---------- */
async function rfDivCrea() {
  const d = RF.div.doc; if (!d || RF.div.carico) return;
  const scelti = RF.div.pezzi.filter(p => !p.escluso);
  if (!scelti.length) { toast('Non c’è nessun documento da creare'); return; }
  if (!confirm(`${rfDivTastoCrea()} nella cartella di ${RF.div.nome}? L’originale resta com’è.`)) return;
  RF.div.carico = true; const b = document.getElementById('rf-div-crea'); if (b) { b.disabled = true; b.textContent = 'Divido…'; }
  const j = await rfDivChiedi(RF_DIV_URL, { azione: 'crea', documento_id: d.id, proposti: RF.div.proposti, pezzi: scelti.map(p => ({ da: p.da, a: p.a, categoria: p.categoria, titolo: p.titolo, data: p.data })) });
  RF.div.carico = false;
  if (j.errore) { toast(j.errore); if (b) { b.disabled = false; b.textContent = rfDivTastoCrea(); } return; }
  RF.div.creati = j.creati || []; rfDivLiberaPdf(); RF.div.doc = null; RF.div.pezzi = [];
  toast(`${RF.div.creati.length} documenti nella cartella di ${RF.div.nome}`);
  void rfCaricaDati(); render();
}
async function rfDivZip() {
  const ids = (RF.div.creati || []).map(x => x.id); if (!ids.length) return;
  try {
    const r = await fetch(RF_DIV_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'zip', ids }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.errore || 'Il file .zip non si prepara'); return; }
    const u = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = u; a.download = `Documenti ${RF.div.nome || ''}.zip`.replace(/\s+\./, '.'); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  } catch { toast('Piattaforma non raggiungibile'); }
}

/* ---------- la pagina ---------- */
function rfDivPezziHtml() {
  const pezzi = RF.div.pezzi;
  const mini = (n) => { const m = RF.div.mini[n]; return `<div class="rf-div-th" data-n="${n}" onclick="rfDivZoom(${n})" title="Pagina ${n}: guarda in grande">${m && m !== 'attesa' ? `<img src="${m}" alt="Pagina ${n}">` : '<div class="vuota"></div>'}<span>${n}</span></div>`; };
  return pezzi.map((p, k) => {
    let pagine = '';
    for (let n = p.da; n <= p.a; n++) pagine += (n > p.da ? `<button class="rf-div-taglia" onclick="rfDivTaglia(${n})" title="Taglia qui: la pagina ${n} comincia un documento nuovo">✂</button>` : '') + mini(n);
    return `<div class="rf-div-pezzo ${p.escluso ? 'escluso' : ''}">
      <div class="rf-div-testa"><span class="n">${k + 1} · ${p.da === p.a ? `pagina ${p.da}` : `pagine ${p.da}–${p.a}`}</span>
        <select class="input rf-div-in" onchange="rfDivCampo(${k}, 'categoria', this.value)" aria-label="Tipo di documento">${RF_DIV_TIPI.map(([v, n]) => `<option value="${v}" ${p.categoria === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <input class="input rf-div-in" style="width:118px" placeholder="data (12.03.2019)" value="${rfEsc(p.data)}" oninput="rfDivCampo(${k}, 'data', this.value)" aria-label="Data del documento">
        <input class="input rf-div-in" id="rf-div-t-${k}" style="flex:1;min-width:180px !important" placeholder="Nome del documento" value="${rfEsc(p.titolo)}" oninput="rfDivCampo(${k}, 'titolo', this.value)" aria-label="Nome del documento">
        ${p.sicurezza === 'media' ? '<span class="badge warning" title="Il taglio è probabile ma non certo: guarda la prima pagina">da guardare</span>' : p.sicurezza === 'bassa' ? '<span class="badge warning">senza testo: taglia tu</span>' : p.sicurezza === 'tua' ? '<span class="badge">taglio tuo</span>' : ''}
        ${k > 0 ? `<button class="btn sm" onclick="rfDivUnisci(${k})" title="Questo pezzo è il seguito del precedente">Unisci al precedente</button>` : ''}
        <button class="btn sm ghost" onclick="rfDivEscludi(${k})" title="Pagine bianche o doppie: non diventano un documento">${p.escluso ? 'Rimetti' : 'Lascia fuori'}</button></div>
      <div class="rf-div-pagine">${pagine}</div></div>`;
  }).join('');
}

PAGES.dividi = () => {
  if (!RF.live) return rfPaginaPiattaforma('Dividi cartella', 'Da un PDF unico ai singoli documenti');
  const v = RF.div; setTimeout(rfDivOsserva, 0);
  const testa = (sotto, azioni = '') => `<div class="page-head"><div><h2 class="page-title">Dividi cartella</h2><div class="page-sub">${sotto}</div></div>${azioni ? `<div class="actions">${azioni}</div>` : ''}</div>`;
  const limite = '<p class="rf-img-limite mt-16">I tagli li <b>propone</b> la piattaforma leggendo il testo delle pagine (un saluto, «Luogo, data», un titolo, «pagina 1 di 2»…) e li <b>conferma una persona</b>: su una cartella scansionata male sbaglia, e per questo ogni pezzo si può unire, tagliare, rinominare o lasciare fuori. Tutto avviene sul Mac dello studio. L’originale non si tocca.</p>';
  const errore = v.errore ? `<div class="rf-manc mb-16">${rfEsc(v.errore)}</div>` : '';

  // 3 — fatto: i documenti creati.
  if (v.creati) {
    return `${testa(`${v.creati.length} documenti nella cartella di ${rfEsc(v.nome)}`, `<button class="btn" onclick="rfDivCambia()">Dividi un’altra cartella</button>`)}
      <div class="card"><div class="card-head"><span class="section-title">Documenti creati</span><span><button class="btn sm" onclick="rfDivZip()">Scarica tutti (.zip)</button> <button class="btn sm primary" data-go="#/patients/${v.pid}">Apri la cartella di ${rfEsc(v.nome)}</button></span></div>
        <div class="list">${v.creati.map(x => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(x.filename)}</div><div class="sub">${rfEsc(rfDivEtichetta(x.categoria))} · ${x.pagine} ${x.pagine === 1 ? 'pagina' : 'pagine'}</div></div>
          <button class="btn sm ghost" onclick="rfGuarda('/api/documents/${x.id}', '${rfEsc(x.filename).replace(/'/g, '&#39;')}', 1, '${x.id}')">Apri</button><a class="btn sm ghost" href="/api/documents/${x.id}" download="${rfEsc(x.filename)}">Scarica</a></div>`).join('')}</div></div>
      <p class="rf-img-limite mt-16">Il PDF di partenza è rimasto nella cartella com’era. Un documento scaricato finisce sul tuo dispositivo: da lì la responsabilità di dove va è tua.</p>`;
  }
  // 2 — la proposta da controllare.
  if (v.doc) {
    const d = v.doc;
    return `${testa(`${rfEsc(v.nome)} · ${rfEsc(d.filename)} · ${d.pagine} pagine`, `<button class="btn" onclick="rfDivDaCapo()">Torna ai tagli proposti</button><button class="btn" onclick="rfDivCambia()">Cambia cartella</button>`)}
      ${errore}
      <div id="rf-div-avviso">${rfDivAvvisoHtml()}</div>
      <div class="card"><div class="card-head"><span class="section-title">Documenti trovati</span><span class="caption">clicca una pagina per guardarla in grande · ✂ fra due pagine per tagliare</span></div>
        <div id="rf-div-pezzi">${rfDivPezziHtml()}</div>
        <div class="row mt-16" style="gap:12px;justify-content:flex-end;align-items:center"><span class="caption">I documenti nascono nella cartella di ${rfEsc(v.nome)}; l’originale resta.</span><button class="btn primary" id="rf-div-crea" onclick="rfDivCrea()">${rfDivTastoCrea()}</button></div></div>
      ${limite}`;
  }
  if (v.carico) return `${testa('Leggo le pagine e cerco dove comincia ogni documento…')}<div class="card"><div class="caption">Per una cartella lunga ci vuole qualche secondo.</div></div>`;
  // 1 — il PDF e di chi è, in qualunque ordine: si può trascinare subito il file anche di chi non è ancora in ReferralFlow.
  const q = (v.cerca || '').trim().toLowerCase();
  const trovati = q.length >= 2 ? (RF.data.patients || []).filter(p => rfUuid(p.id) && fullName(p).toLowerCase().includes(q)).slice(0, 8) : [];
  const zona = (testo) => `<div id="rf-div-drop" class="rf-div-drop mt-8" ondragover="rfDivDrop(event, true)" ondragleave="rfDivDrop(event, false)" ondrop="rfDivDropFile(event)">
        ${v.invio !== null ? `<span id="rf-div-invio">Carico… ${v.invio}%</span>` : `${testo}<br><div class="row mt-8" style="justify-content:center"><label class="btn sm">Scegli il file… <input type="file" accept="application/pdf,.pdf" style="display:none" onchange="rfDivFile(this.files[0]); this.value=''"></label></div>`}
      </div>`;
  // 1b — il file aspetta: di chi è?
  if (v.attesa) {
    const a = v.attesa, peso = a.file.size > 1048576 ? `${(a.file.size / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(a.file.size / 1024))} kB`;
    const campo = (k, ph, largo) => `<input class="input rf-div-in" style="width:${largo}px" placeholder="${ph}" value="${rfEsc(a[k])}" oninput="RF.div.attesa.${k}=this.value" aria-label="${ph}">`;
    return `${testa('Da un PDF unico con tutta la cartella ai singoli documenti')}
      ${errore}
      <div class="card"><div class="card-head"><span class="section-title">${rfEsc(a.file.name)}</span><span class="caption">${peso}${a.pagine ? ` · ${a.pagine} pagine` : ''} <button class="btn sm ghost" onclick="rfDivCambia()">Togli</button></span></div>
        <div class="section-title mt-8">Di chi è questa cartella?</div>
        ${a.stato === 'leggo' ? '<div class="caption mt-8">Cerco nome e data di nascita nelle prime pagine…</div>'
          : a.trovato ? `<p class="meta" style="margin:8px 0 10px;line-height:1.55">Nel PDF c’è scritto <b>${rfEsc(`${a.letto.cognome} ${a.letto.nome}`.trim())}</b>${a.letto.nascita ? `, ${rfEsc(rfDivGiorno(a.letto.nascita))}` : ''}: in ReferralFlow c’è già la sua cartella.</p>
              <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" onclick="rfDivUsa('${a.trovato.id}', '${rfEsc(a.trovato.nome).replace(/'/g, '&#39;')}')">È ${rfEsc(a.trovato.nome)}: usa la sua cartella</button><button class="btn sm ghost" onclick="RF.div.attesa.trovato=null;render()">Non è lei/lui</button></div>`
          : `<p class="meta" style="margin:8px 0 10px;line-height:1.55">${a.letto ? 'Non è ancora in ReferralFlow. <b>Nome e data di nascita li ho letti dal PDF: controllali</b> (cognome e nome possono essere scambiati), poi crea la cartella.' : 'Nel PDF non trovo il nome del paziente (è una scansione senza testo, o è scritto in un modo che non riconosco): <b>scrivilo tu</b>, poi crea la cartella.'}</p>
              <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">${campo('cognome', 'Cognome', 170)}${campo('nome', 'Nome', 170)}${campo('nascita', 'Nascita (31.12.1950)', 170)}<button class="btn primary" id="rf-div-creapaz" onclick="rfDivCreaPaziente()">Crea la cartella e continua</button></div>`}
        ${a.stato === 'leggo' ? '' : `<div class="section-title mt-16">…oppure è di qualcuno che c’è già</div>
          <div class="row mt-8" style="gap:8px;flex-wrap:wrap;align-items:center"><input class="input" id="rf-div-cerca" style="width:260px" placeholder="Scrivi il cognome" value="${rfEsc(v.cerca)}" oninput="rfDivAttesaCerca(this.value)">${trovati.map(p => `<button class="btn sm" onclick="rfDivUsa('${p.id}')">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</button>`).join('')}</div>`}</div>
      ${limite}`;
  }
  // 1a — paziente già scelto: il file, o un PDF che ha già in cartella.
  if (v.pid) {
    return `${testa('Da un PDF unico con tutta la cartella ai singoli documenti')}
      ${errore}
      <div class="card"><div class="section-title">Di chi è la cartella</div>
        <div class="row mt-8" style="gap:10px;align-items:center"><span class="badge accent">${rfEsc(v.nome)}</span><button class="btn sm ghost" onclick="rfDivCambia()">Cambia</button></div></div>
      <div class="card mt-16"><div class="section-title">La cartella completa, in PDF</div>
        ${zona('Trascina qui il PDF, oppure')}
        <p class="meta" style="margin:10px 0 0;line-height:1.55">Fino a 50 MB. Il file entra nella cartella del paziente così com’è, poi lo si divide. Se è una scansione senza testo, il Mac la legge prima (qualche minuto).</p>
        ${v.documenti === null ? '<div class="caption mt-16">Cerco i PDF già in cartella…</div>' : v.documenti.length ? `<div class="section-title mt-16">…oppure un PDF già nella sua cartella</div>
          <div class="list mt-8">${v.documenti.map(x => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(x.filename)}</div><div class="sub">caricato il ${rfEsc(rfDivGiorno(x.caricato))}${x.ocr_stato === 'da_fare' ? ' · in lettura sul Mac' : ''}</div></div><button class="btn sm" onclick="rfDivApri('${x.id}')">Dividi</button></div>`).join('')}</div>` : ''}</div>
      ${limite}`;
  }
  // 1 — niente ancora: il PDF subito, oppure prima il paziente.
  void rfDivStorico();
  return `${testa('Da un PDF unico con tutta la cartella ai singoli documenti')}
    ${errore}
    <div class="card"><div class="section-title">Trascina qui la cartella completa, in PDF</div>
      ${zona('Anche di un paziente che <b>non è ancora in ReferralFlow</b>: la sua cartella si crea qui, subito dopo.<br>Trascina il PDF, oppure')}
      <p class="meta" style="margin:10px 0 0;line-height:1.55">Fino a 50 MB. Nome e data di nascita si leggono dal PDF, quando ci sono, e li confermi tu.</p></div>
    <div class="card mt-16"><div class="section-title">…oppure parti da un paziente che c’è già</div>
      <div class="row mt-8" style="gap:8px;flex-wrap:wrap;align-items:center"><input class="input" id="rf-div-cerca" style="width:260px" placeholder="Scrivi il cognome" value="${rfEsc(v.cerca)}" oninput="rfDivCerca(this.value)">${trovati.map(p => `<button class="btn sm" onclick="rfDivPaziente('${p.id}')">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</button>`).join('')}</div>
      <p class="meta" style="margin:10px 0 0">Così puoi anche dividere un PDF che ha già nella sua cartella.</p></div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Cartelle già caricate</span><span class="caption">ultimi 90 giorni</span></div>
      <div id="rf-div-storico">${rfDivStoricoHtml()}</div></div>
    ${limite}`;
};
