// ReferralFlow prototype — "Correzione → proposta per la wiki"
// Ogni correzione fatta nella Revisione guidata può diventare una nota candidata per RefraFlow Knowledge
// (cartella 08_Proposte/candidate, schema YAML 04_YAML_SCHEMA.md §5.3). Nel prototipo le proposte vivono in localStorage.
const KP_KEY = 'rf-kb-proposals';
const KP = { list: JSON.parse(localStorage.getItem(KP_KEY) || '[]') };
function kpSave() { localStorage.setItem(KP_KEY, JSON.stringify(KP.list)); }
function kpPending() { return KP.list.filter(p => p.status === 'candidate').length; }
function kpSlug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'regola'; }
function kpDoctorId() { return state.role === 'doctor' ? 'doctor_001' : 'doctor_001'; }
function kpToday() { return new Date().toISOString().slice(0, 10); }

function kpYaml(p) {
  return `---
id: ${p.id}
title: ${p.title}
type: doctor_style
status: candidate
agents: [report]
doctor_scope: [${p.doctor}]
specialty: [cardiology]
exam_types: [${p.examType}]
priority: medium
author: refraflow_knowledge_curator
created_at: ${p.createdAt}
source_kind: learned_from_corrections
source_ref: ${p.sourceRef}
source_occurrences: ${p.occurrences}
confidence: ${p.confidence}
rule_key: ${p.ruleKey}
tags: [correzione, revisione_guidata]
---
## Regola
Nel referto ${p.doctorLabel} scrive «${p.to}» e non «${p.from}».

## Esempi
- Prima: ${p.from}
- Dopo: ${p.to}

## Note
Proposta generata da una correzione nella Revisione guidata (referto ${p.report}, ${p.by}). Da approvare da un umano prima di entrare in produzione.`;
}

/** Chiamata dalla Revisione guidata dopo una correzione di testo. */
function kpPropose(ctx) {
  const from = String(ctx.from || '').trim(), to = String(ctx.to || '').trim();
  if (!from || !to || from === to) return;
  const same = KP.list.find(p => p.from === from && p.to === to);
  if (same) { same.occurrences++; same.confidence = Math.min(0.95, +(same.confidence + 0.1).toFixed(2)); kpSave(); toast(`Correzione già proposta alla wiki · ${same.occurrences} occorrenze`); return; }
  const n = 400 + KP.list.length + 1;
  const draft = {
    id: `KB-${String(n).padStart(6, '0')}`, title: `Formulazione: ${to.slice(0, 60)} (${kpDoctorId()})`,
    doctor: kpDoctorId(), doctorLabel: state.role === 'doctor' ? 'il medico' : 'la Dr.ssa Bianchi', examType: 'all',
    createdAt: kpToday(), sourceRef: `review:${ctx.report || 'r1'}:${ctx.issueId || ''}`, occurrences: 1, confidence: 0.6,
    ruleKey: `phrasing.${kpSlug(to.split(' ').slice(0, 3).join(' '))}`, from, to, report: ctx.report || 'r1', by: ROLES[state.role].label, status: 'candidate',
  };
  openModal('Proposta per la wiki', `
    <p class="meta">Questa correzione può diventare una regola di stile in RefraFlow Knowledge. Viene salvata come <b>candidata</b> in <code>08_Proposte/candidate</code>: entra in produzione solo dopo l'approvazione di una persona.</p>
    <div class="mt-8" style="line-height:1.7"><span class="diff-del">${esc(from)}</span> → <span class="diff-add">${esc(to)}</span></div>
    <div class="grid grid-2 mt-16">
      <div class="field"><label>Titolo nota</label><input class="input" id="kp-title" value="${esc(draft.title)}"></div>
      <div class="field"><label>rule_key</label><input class="input" id="kp-rule" value="${esc(draft.ruleKey)}"></div>
    </div>
    <div class="field mt-8"><label>Tipo di esame</label><select class="input" id="kp-exam">${['all', 'echocardiography', 'cardiology_visit', 'ecg', 'holter_ecg', 'stress_test'].map(e => `<option value="${e}">${e}</option>`).join('')}</select></div>
    <details class="mt-8"><summary class="caption">Anteprima del file Markdown (frontmatter schema v1)</summary><pre class="caption" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:10px;margin-top:6px">${esc(kpYaml(draft))}</pre></details>`,
    `<button class="btn" data-close>Non ora</button><button class="btn primary" id="kp-send">${ICONS.book} Invia proposta alla wiki</button>`);
  document.getElementById('kp-send').onclick = () => {
    draft.title = document.getElementById('kp-title').value.trim() || draft.title;
    draft.ruleKey = document.getElementById('kp-rule').value.trim() || draft.ruleKey;
    draft.examType = document.getElementById('kp-exam').value;
    KP.list.unshift(draft); kpSave(); closeModal();
    if (typeof rvLog === 'function') rvLog('KB_PROPOSAL_CREATED', `${draft.id} ${draft.ruleKey}`);
    toast(`Proposta ${draft.id} inviata alla wiki · in attesa di approvazione`);
    renderSidebar();
  };
}

function kpSetStatus(id, status) {
  const p = KP.list.find(x => x.id === id); if (!p) return;
  p.status = status; if (status === 'approved') { p.reviewedBy = ROLES[state.role].label; p.lastReviewed = kpToday(); }
  kpSave(); render();
  toast(status === 'approved' ? `${p.id} approvata · spostata in 04_Stile/Medici, versione 1` : `${p.id} scartata · spostata in 08_Proposte/rejected`);
}
function kpView(id) {
  const p = KP.list.find(x => x.id === id); if (!p) return;
  openModal(`${p.id} · ${esc(p.title)}`, `<pre class="caption" style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:10px;margin:0">${esc(kpYaml(p))}</pre><p class="caption mt-8">Pagina SilverBullet: <code>08_Proposte/candidate/${p.id}</code></p>`,
    `<button class="btn" data-close>Chiudi</button>${p.status === 'candidate' ? `<button class="btn danger" data-close onclick="kpSetStatus('${p.id}','rejected')">Scarta</button><button class="btn primary" data-close onclick="kpSetStatus('${p.id}','approved')">Approva</button>` : ''}`);
}

/** Card "Proposte dal feedback" per la pagina Knowledge (e riepilogo in Home). */
function kpCard() {
  const items = KP.list.slice(0, 8);
  const st = { candidate: ['In attesa', 'warning'], approved: ['Approvata', 'success'], rejected: ['Scartata', 'danger'] };
  const list = items.length ? items.map(p => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px"><span class="diff-del">${esc(p.from)}</span> → <span class="diff-add">${esc(p.to)}</span></div><div class="sub">${p.id} · ${esc(p.ruleKey)} · ${p.occurrences} occorrenz${p.occurrences === 1 ? 'a' : 'e'} · conf. ${p.confidence}</div></div><span class="badge ${st[p.status][1]}">${st[p.status][0]}</span><button class="btn sm" onclick="kpView('${p.id}')">Vedi</button></div>`).join('')
    : `<div class="caption">Nessuna proposta dalle tue correzioni. Ogni correzione nella Revisione guidata può diventare una regola: comparirà qui.</div>`;
  return `<div class="card ai"><div class="card-head"><span class="section-title">Proposte dal feedback</span>${aiTag()}${kpPending() ? `<span class="badge count">${kpPending()}</span>` : ''}</div>
    <div class="list">${list}</div>
    <div class="caption mt-8">Flusso: correzione nella Revisione guidata → nota candidata in <code>08_Proposte/candidate</code> → approvazione umana → <code>04_Stile/Medici</code>. Il curatore raggruppa le correzioni ripetute e alza la confidenza.</div>
    <div class="row mt-8"><button class="btn sm" data-modal="templateProposal">Esempio: proposta da 34 referti</button></div></div>`;
}
