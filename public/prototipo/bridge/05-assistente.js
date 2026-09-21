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
  .rf-doc{border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden;margin:2px 0}
  .rf-doc-testa{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:14px 16px 12px;border-bottom:1px solid var(--border);background:rgba(13,92,72,.05)}
  .rf-doc-testa .t{font-size:16px;font-weight:650;line-height:1.25;text-wrap:balance}.rf-doc-testa .s{font-size:12.5px;color:var(--muted);margin-top:2px}
  .rf-doc-testa .az{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
  #app.ai-mode .rf-doc-grande{display:none}
  .rf-doc-corpo{padding:14px 16px 16px;display:flex;flex-direction:column;gap:14px}
  .rf-doc-num{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
  .rf-doc-num div{border:1px solid var(--border);border-radius:10px;padding:8px 10px}
  .rf-doc-num b{display:block;font-size:20px;font-variant-numeric:tabular-nums;line-height:1.1}.rf-doc-num span{font-size:11.5px;color:var(--muted)}
  .rf-doc-num .attenzione{border-color:rgba(214,92,42,.45);background:rgba(214,92,42,.07)}.rf-doc-num .attenzione b{color:#a3431b}
  .rf-doc-num .ok b{color:#0d5c48}
  .rf-doc h4{margin:0 0 6px;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .rf-doc-breve{padding:10px 12px;border-radius:10px;background:rgba(13,92,72,.08);border:1px solid rgba(13,92,72,.25);line-height:1.5}
  .rf-doc-avviso{padding:10px 12px;border-radius:10px;background:rgba(214,92,42,.08);border:1px solid rgba(214,92,42,.35)}
  .rf-doc-avv-gr{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px 16px;margin-bottom:6px}.rf-doc-avv-gr b{font-weight:600;font-size:13px}.rf-doc-avv-gr ul{margin-top:1px}
  .rf-doc-avviso h4{color:#a3431b}.rf-doc-avviso ul,.rf-doc-gr ul{margin:0;padding-left:18px}.rf-doc li{margin:3px 0;line-height:1.45}
  .rf-doc li .btn.sm{padding:0 6px;line-height:18px;font-size:11px;margin-left:6px}
  .rf-doc-tab{overflow-x:auto}.rf-doc-tab table{width:100%;border-collapse:collapse;font-size:13px}
  .rf-doc-tab th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:4px 8px;border-bottom:1px solid var(--border)}
  .rf-doc-tab td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}.rf-doc-tab td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}
  .rf-doc-tab tr.vai{cursor:pointer}.rf-doc-tab tr.vai:hover td{background:rgba(13,92,72,.05)}
  .rf-doc-tab .attenzione td:last-child{color:#a3431b;font-weight:600}.rf-doc-tab .ok td:last-child{color:#0d5c48}
  .rf-doc-griglia{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
  .rf-doc-gr{border:1px solid var(--border);border-radius:10px;padding:10px 12px}
  .rf-doc-sch{border:1px solid var(--border);border-radius:10px}.rf-doc-sch.attenzione{border-left:3px solid #d65c2a}
  .rf-doc-sch summary{display:flex;gap:10px;align-items:baseline;padding:9px 12px;cursor:pointer;list-style:none}.rf-doc-sch summary::-webkit-details-marker{display:none}
  .rf-doc-sch summary .ora{font-variant-numeric:tabular-nums;font-weight:650;min-width:44px}.rf-doc-sch summary .n{font-weight:600}.rf-doc-sch summary .so{color:var(--muted);font-size:12.5px;flex:1}
  .rf-doc-sch .dentro{padding:2px 12px 12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
  .rf-md-t{font-weight:650;margin:8px 0 2px}.rf-md-t:first-child{margin-top:0}.rf-md ul{margin:0 0 4px;padding-left:18px}.rf-md li{margin:2px 0}
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
/* La risposta di una procedura come DOCUMENTO (21.9.2026): intestazione, numeri,
   «in breve», riquadro delle cose da segnalare, tabella dell'agenda, gruppi in
   griglia, una scheda richiudibile per paziente. La forma la decide il server
   (src/lib/procedure-documento.ts); qui si disegna e si stampa. */
RF.documenti = [];
function rfDocRighe(righe) { return `<ul>${(righe || []).map(r => `<li>${rfEsc(r.testo)}${rfBottoneFonte(r.fonte)}</li>`).join('')}</ul>`; }
function rfHtmlDocumento(b) {
  const d = b.documento; const n = RF.documenti.push(b) - 1;
  const numeri = (d.numeri || []).length ? `<div class="rf-doc-num">${d.numeri.map(x => `<div class="${rfEsc(x.tono || 'neutro')}"><b>${rfEsc(x.valore)}</b><span>${rfEsc(x.etichetta)}</span></div>`).join('')}</div>` : '';
  const breve = b.sintesi ? `<div class="rf-doc-breve"><h4>In breve</h4>${rfEsc(b.sintesi).replace(/\n/g, '<br>')}</div>` : '';
  const pezzi = []; let gruppi = [], schede = [];
  const svuotaGruppi = () => { if (gruppi.length) { pezzi.push(`<div class="rf-doc-griglia">${gruppi.join('')}</div>`); gruppi = []; } };
  const svuotaSchede = () => { if (schede.length) { pezzi.push(`<div><h4>Paziente per paziente</h4><div style="display:flex;flex-direction:column;gap:8px">${schede.join('')}</div></div>`); schede = []; } };
  for (const bl of (d.blocchi || [])) {
    if (bl.tipo === 'gruppo') { svuotaSchede(); gruppi.push(`<div class="rf-doc-gr"><h4>${rfEsc(bl.titolo)}</h4>${rfDocRighe(bl.righe)}</div>`); continue; }
    if (bl.tipo === 'scheda') {
      svuotaGruppi();
      schede.push(`<details class="rf-doc-sch ${rfEsc(bl.tono || '')}" ${bl.tono === 'attenzione' ? 'open' : ''}><summary><span class="ora">${rfEsc(bl.etichetta || '')}</span><span class="n">${rfEsc(bl.titolo)}</span><span class="so">${rfEsc(bl.sottotitolo || '')}</span>${bl.go ? `<button class="btn sm ghost" data-go="${rfEsc(bl.go)}">Scheda</button>` : ''}</summary><div class="dentro">${(bl.gruppi || []).map(g => `<div><h4>${rfEsc(g.titolo)}</h4>${rfDocRighe(g.righe)}</div>`).join('')}</div></details>`);
      continue;
    }
    svuotaGruppi(); svuotaSchede();
    if (bl.tipo === 'avviso') pezzi.push(`<div class="rf-doc-avviso"><h4>${rfEsc(bl.titolo)} · ${bl.totale || ((bl.gruppi || []).reduce((t, g) => t + g.righe.length, 0) + bl.righe.length)}</h4>${(bl.gruppi || []).length ? `<div class="rf-doc-avv-gr">${bl.gruppi.map(g => `<div><b>${rfEsc(g.titolo)}</b>${rfDocRighe(g.righe)}</div>`).join('')}</div>` : ''}${bl.righe.length ? rfDocRighe(bl.righe) : ''}</div>`);
    if (bl.tipo === 'tabella') pezzi.push(`<div><h4>${rfEsc(bl.titolo)}</h4><div class="rf-doc-tab"><table><thead><tr>${bl.colonne.map(c => `<th>${rfEsc(c)}</th>`).join('')}</tr></thead><tbody>${bl.righe.map(r => `<tr class="${rfEsc(r.tono || '')} ${r.go ? 'vai' : ''}" ${r.go ? `data-go="${rfEsc(r.go)}"` : ''}>${r.celle.map(c => `<td>${rfEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
  }
  svuotaGruppi(); svuotaSchede();
  const azioni = (b.azioni || []).map(a => a.go ? `<button class="btn sm ghost" data-go="${rfEsc(a.go)}">${rfEsc(a.etichetta)}</button>` : `<a class="btn sm ghost" href="${rfEsc(a.href)}" target="_blank" rel="noopener">${rfEsc(a.etichetta)}</a>`).join('');
  const passi = b.traccia && b.traccia.passi ? b.traccia.passi : b.passi;
  return `<div class="rf-doc" id="rf-doc-${n}"><div class="rf-doc-testa"><div><div class="t">${rfEsc(d.intestazione.titolo)}</div>${d.intestazione.sottotitolo ? `<div class="s">${rfEsc(d.intestazione.sottotitolo)}</div>` : ''}</div><div class="az">${azioni}<button class="btn sm primary rf-doc-grande" onclick="rfDocInGrande(${n})" title="Apri questo documento nella pagina grande di Cleo">Apri in grande</button><button class="btn sm" onclick="rfDocStampa(${n})" title="Stampa o salva in PDF">Stampa</button></div></div>
    <div class="rf-doc-corpo">${numeri}${breve}${pezzi.join('')}${rfHtmlTraccia({ id: b.traccia && b.traccia.id, passi, fonti: b.fonti, mancanti: b.mancanti, modello: b.traccia && b.traccia.modello, durata_ms: b.traccia && b.traccia.durata_ms })}</div></div>`;
}
// Dal pannello laterale alla pagina grande di Cleo: la conversazione è la
// stessa (state.aiMessages), quindi basta andarci e portare in vista il
// documento. Il tasto si vede solo nel laterale (in pagina grande lo nasconde il CSS).
function rfDocInGrande(n) {
  location.hash = '#/ai';
  let giri = 0;
  const cerca = () => {
    const el = document.getElementById(`rf-doc-${n}`);
    const grande = document.getElementById('app') && document.getElementById('app').classList.contains('ai-mode');
    if (el && grande) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (++giri < 20) setTimeout(cerca, 80);
  };
  setTimeout(cerca, 60);
}
// La stampa: lo stesso documento, su carta — tutte le schede aperte, niente bottoni.
function rfDocStampa(n) {
  const b = RF.documenti[n]; if (!b || !b.documento) return;
  const d = b.documento; const box = document.getElementById('rf-print'); if (!box) { window.print(); return; }
  const righe = (rr) => `<ul>${(rr || []).map(r => `<li>${rfEsc(r.testo)}</li>`).join('')}</ul>`;
  const ora = new Date();
  box.innerHTML = `<div class="rf-docp"><h1>${rfEsc(d.intestazione.titolo)}</h1><div class="meta">${rfEsc(d.intestazione.sottotitolo || '')}${d.intestazione.sottotitolo ? ' · ' : ''}stampato il ${String(ora.getDate()).padStart(2, '0')}.${String(ora.getMonth() + 1).padStart(2, '0')}.${ora.getFullYear()} alle ${String(ora.getHours()).padStart(2, '0')}:${String(ora.getMinutes()).padStart(2, '0')}</div>
    ${(d.numeri || []).length ? `<p class="num">${d.numeri.map(x => `<b>${rfEsc(x.valore)}</b> ${rfEsc(x.etichetta.toLowerCase())}`).join(' · ')}</p>` : ''}
    ${b.sintesi ? `<p>${rfEsc(b.sintesi)}</p>` : ''}
    ${(d.blocchi || []).map(bl => bl.tipo === 'tabella'
      ? `<h2>${rfEsc(bl.titolo)}</h2><table class="griglia"><thead><tr>${bl.colonne.map(c => `<th>${rfEsc(c)}</th>`).join('')}</tr></thead><tbody>${bl.righe.map(r => `<tr>${r.celle.map(c => `<td>${rfEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : bl.tipo === 'scheda'
        ? `<div class="sch"><h2>${rfEsc(bl.etichetta ? bl.etichetta + ' · ' : '')}${rfEsc(bl.titolo)}${bl.sottotitolo ? ` <span>· ${rfEsc(bl.sottotitolo)}</span>` : ''}</h2>${(bl.gruppi || []).map(g => `<h3>${rfEsc(g.titolo)}</h3>${righe(g.righe)}`).join('')}</div>`
        : `<h2>${rfEsc(bl.titolo)}${bl.totale ? ` · ${bl.totale}` : ''}</h2>${(bl.gruppi || []).map(g => `<h3>${rfEsc(g.titolo)}</h3>${righe(g.righe)}`).join('')}${(bl.righe || []).length ? righe(bl.righe) : ''}`).join('')}</div>`;
  document.body.classList.add('rf-stampa');
  const pulisci = () => { document.body.classList.remove('rf-stampa'); box.innerHTML = ''; window.removeEventListener('afterprint', pulisci); };
  window.addEventListener('afterprint', pulisci);
  window.print();
}
// Le risposte libere del modello: titoli in **grassetto** su una riga e righe
// «- » diventano parti con il loro elenco, non un blocco unico di testo.
function rfMdLeggero(t) {
  const righe = String(t || '').split('\n'); const out = []; let lista = [];
  const chiudi = () => { if (lista.length) { out.push(`<ul>${lista.join('')}</ul>`); lista = []; } };
  const inline = (x) => rfEsc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  for (const r0 of righe) {
    const r = r0.trim();
    if (!r) { chiudi(); continue; }
    const tit = r.match(/^(?:#{1,4}\s*(.+)|\*\*([^*]+)\*\*:?)$/);
    if (tit) { chiudi(); out.push(`<div class="rf-md-t">${rfEsc((tit[1] || tit[2]).replace(/:$/, ''))}</div>`); continue; }
    const el = r.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (el) { lista.push(`<li>${inline(el[1])}</li>`); continue; }
    chiudi(); out.push(`<div>${inline(r)}</div>`);
  }
  chiudi();
  return `<div class="rf-md">${out.join('')}</div>`;
}
function rfHtmlProcedura(b) {
  if (b && b.documento && b.documento.intestazione) return rfHtmlDocumento(b);
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
        if (el) el.innerHTML = rfMdLeggero(testo) + '<span class="caption"> ▍</span>';
      }
      const tid = r.headers.get('X-Traccia');
      let traccia = '';
      if (tid) { try { const rt = await fetch(`/api/prototipo/tracce/${tid}`, { credentials: 'include' }); if (rt.ok) traccia = rfHtmlTraccia(await rt.json()); } catch { /* senza traccia */ } }
      fine(rfMdLeggero(testo.trim() || 'Nessuna risposta.') + traccia, fonte);
    })
    .catch(() => fine('L\'assistente non è raggiungibile in questo momento.', 'Piattaforma'));
};


