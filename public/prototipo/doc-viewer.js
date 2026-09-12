// ReferralFlow prototype — Visualizzatore documenti "accanto"
// Quando il medico chiede un documento (a voce o scritto), l'assistente risponde nel pannello AI e
// apre il documento in una colonna affiancata, senza lasciare la pagina corrente.
const DV = { open: false, item: null, source: '' };

function dvFind(id) {
  const a = ARCHIVE.find(x => x.id === id);
  if (a) return { ...a, _from: 'archive' };
  const d = DOCUMENTS.find(x => x.id === id);
  if (d) return { id: d.id, p: d.p, kind: d.type === 'report' ? 'report' : d.type === 'lab' ? 'lab' : d.type === 'discharge' ? 'letter' : 'exam', type: d.type, date: d.date.split('.').reverse().join('-'), title: d.t, by: d.src, origin: 'external', text: d.status === 'confirmed' ? 'text' : 'ocr_unverified', _from: 'inbox' };
  return null;
}
function dvOpen(idOrItem, source = '') {
  const item = typeof idOrItem === 'string' ? dvFind(idOrItem) : idOrItem;
  if (!item) { toast('Documento non trovato'); return; }
  const acc = (AI_ACCESS[state.role] || {}).archive;
  if (!acc) { toast('Il tuo ruolo non può aprire documenti clinici'); return; }
  DV.open = true; DV.item = item; DV.source = source;
  if (typeof rvLog === 'function') rvLog('DOCUMENT_VIEWED', item.id);
  render();
}
function dvClose() { DV.open = false; DV.item = null; render(); }

/** Corpo del documento (dati dimostrativi coerenti con l'archivio). */
function dvBody(a, meta) {
  if (meta) return `<div class="dv-page"><div class="banner">${ICONS.lock}<span>Con il tuo ruolo vedi solo i metadati: il contenuto clinico non viene mostrato. Puoi inoltrare o allegare il documento.</span></div></div>`;
  if (a.text === 'image_only') return `<div class="dv-page dv-scan"><div class="dv-scan-ph">${ICONS.file}<div>Scansione senza testo estratto</div><div class="caption">Non ricercabile per contenuto. Chiedi la digitalizzazione con OCR per renderla interrogabile.</div></div></div>`;
  const vals = a.vals ? `<table class="dv-table"><thead><tr><th>Parametro</th><th>Valore</th></tr></thead><tbody>${Object.entries(a.vals).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num"><b>${esc(v)}</b></td></tr>`).join('')}</tbody></table>` : '';
  const p = a.p ? P[a.p] : null;
  const head = `<div class="dv-head"><div><div class="dv-title">${esc(a.title)}</div><div class="caption">${p ? esc(fullName(p)) + ' · nato/a il ' + p.dob + ' · ' : ''}${dmy(a.date)} · ${esc(a.by)}</div></div><div class="dv-logo">${a.origin === 'internal' ? BRAND_MARK : ICONS.file}</div></div>`;
  if (a.kind === 'report' && a.p === 'p1' && a.date === '2026-09-04') {
    return `<div class="dv-page">${head}${REPORT_R1.sections.map(s => `<h4>${esc(s.label)}</h4><p>${s.html.replace(/<span class="hl[^"]*">/g, '<u>').replace(/<\/span>/g, '</u>')}</p>`).join('')}<p class="caption">Firmato digitalmente · Dr.ssa E. Bianchi · versione FINAL</p></div>`;
  }
  if (a.kind === 'exam') return `<div class="dv-page">${head}<h4>Risultati</h4>${vals || '<p>Vedi allegato.</p>'}<h4>Conclusioni</h4><p>${a.type === 'echo' ? 'Funzione sistolica ventricolare sinistra conservata. Atrio sinistro ai limiti superiori. Nessun versamento pericardico.' : a.type === 'holter' ? 'Fibrillazione atriale parossistica con burden modesto. Nessuna pausa significativa, nessuna aritmia ventricolare complessa.' : a.type === 'ecg' ? 'Ritmo sinusale, conduzione nei limiti.' : 'Nessun rilievo di rilievo.'}</p></div>`;
  if (a.kind === 'lab') return `<div class="dv-page">${head}<h4>Valori</h4>${vals || ''}<p class="caption">Valori di riferimento del laboratorio esterno. ${a.text === 'ocr_unverified' ? 'Testo da OCR non ancora confermato.' : ''}</p></div>`;
  if (a.kind === 'letter') return `<div class="dv-page">${head}${a.text === 'ocr_unverified' ? '<div class="banner warn">' + ICONS.alert + '<span>Testo ottenuto con OCR, non ancora confermato da una persona: verifica i valori prima di usarli.</span></div>' : ''}<h4>Diagnosi di dimissione</h4><p>Fibrillazione atriale ad alta risposta ventricolare, cardiovertita farmacologicamente. Ipertensione arteriosa.</p><h4>Terapia alla dimissione</h4><p>Bisoprololo 5 mg 1x/die (aumentato), Ramipril 10 mg 1x/die (aumentato), Apixaban 5 mg 2x/die, Atorvastatina 20 mg 1x/die.</p><h4>Indicazioni</h4><p>Controllo cardiologico entro 2 settimane. Holter ECG di controllo a 3 mesi.</p></div>`;
  return `<div class="dv-page">${head}<p>Contenuto non disponibile nel prototipo.</p></div>`;
}

function renderDocViewer() {
  const el = document.getElementById('docviewer');
  if (!el) return;
  if (!DV.open || !DV.item) { el.innerHTML = ''; return; }
  const a = DV.item;
  const meta = (AI_ACCESS[state.role] || {}).archive === 'meta';
  const [tl, tc] = ARCH_TEXT[a.text] || ['', ''];
  el.innerHTML = `
    <div class="dv-bar"><span class="section-title" style="margin:0">Documento</span><span class="badge ${tc}">${tl}</span><span class="badge">${ARCH_KIND[a.kind] || a.kind}</span>
      <span class="right row" style="gap:4px">
        ${a.p ? `<button class="icon-btn" title="Apri archivio paziente" data-go="#/patients/${a.p}/${a.kind === 'report' ? 'reports' : a.kind === 'letter' ? 'documents' : 'exams'}">${ICONS.patients}</button>` : ''}
        <button class="icon-btn" title="Anonimizza questo documento" id="dv-anon">${ICONS.shield}</button>
        <button class="icon-btn" title="Leggi i valori a voce" id="dv-speak">${ICONS.wave}</button>
        <button class="icon-btn" id="dv-close" title="Chiudi">${ICONS.x}</button></span></div>
    ${DV.source ? `<div class="caption" style="padding:6px 14px 0">${ICONS.ai} ${esc(DV.source)}</div>` : ''}
    <div class="dv-body">${dvBody(a, meta)}</div>
    <div class="dv-foot caption">${ICONS.shield} Accesso registrato in audit (DOCUMENT_VIEWED · ${a.id}) · ${a.origin === 'internal' ? 'documento interno' : 'documento esterno'}</div>`;
  el.querySelector('#dv-close').onclick = dvClose;
  el.querySelector('#dv-anon').onclick = () => { if (typeof anonFromDoc === 'function') anonFromDoc(); };
  el.querySelector('#dv-speak').onclick = () => {
    const say = a.vals ? `${a.title}, ${dmy(a.date)}: ${Object.entries(a.vals).map(([k, v]) => `${k} ${v}`).join(', ')}.` : `${a.title} del ${dmy(a.date)}, ${a.by}.`;
    if (typeof vaSay === 'function') { VA.speak = true; vaSay(say); }
  };
  bindCommon(el);
}

/** Dopo una risposta dell'assistente: se era una ricerca di documenti con risultati, apre il primo accanto. */
function dvMaybeOpen(q, items) {
  const list = items || window.__lastArchiveItems || [];
  if (!list.length) return null;
  const ql = q.toLowerCase();
  if (!/trova|cerca|mostrami|recupera|apri|fammi vedere|ultim|vecch|precedent|storic/.test(ql)) return null;
  const item = list[0];
  dvOpen(item, `Aperto dalla richiesta: "${q}"`);
  window.__lastArchiveItems = [];
  return item;
}
