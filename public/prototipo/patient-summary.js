// ReferralFlow prototype — Sintesi longitudinale del paziente ("second brain" clinico)
// Generata dai dati strutturati del paziente, verificata dal medico, letta dall'assistente prima di rispondere.
// Non va nella knowledge base (contiene dati del paziente): vive nel fascicolo, con provenienza per ogni riga.
const PS_KEY = 'rf-patient-summary';
const PS = { byPatient: JSON.parse(localStorage.getItem(PS_KEY) || '{}') };
function psSave() { localStorage.setItem(PS_KEY, JSON.stringify(PS.byPatient)); }

/** Impronta dei dati usati: se cambia, una sintesi verificata torna "da riverificare". */
function psFingerprint(p) {
  return JSON.stringify([p.problems, p.meds, p.exams, p.docs, p.lastVisit, p.next]).length + ':' + (p.exams.at(-1)?.d || '') + ':' + (p.docs[0]?.d || '');
}

/** Genera la sintesi da dati strutturati. Ogni riga ha una provenienza (confirmed = dato strutturato, document = documento, inferred = deduzione). */
function psGenerate(p) {
  const active = p.problems.filter(x => x.s === 'active');
  const evalp = p.problems.filter(x => x.s !== 'active');
  const changed = p.meds.filter(m => m.s === 'CHANGED' || m.s === 'NEW');
  const newDocs = p.docs.filter(d => d.new);
  const lastExam = p.exams.at(-1);
  const lines = [];
  // stato
  const stato = active.length
    ? `${p.sex === 'F' ? 'Paziente' : 'Paziente'} di ${p.age} anni, in carico dal ${Math.min(...active.map(x => parseInt(String(x.since).slice(-4)) || 2026))} per ${active.map(x => x.l.toLowerCase()).join(', ')}.`
    : `Paziente di ${p.age} anni senza problemi attivi registrati.`;
  lines.push({ k: 'Quadro', t: stato, prov: 'confirmed' });
  // andamento (dedotto)
  let trend;
  if (changed.length) trend = `Terapia modificata di recente (${changed.map(m => `${m.n} ${m.from ? m.from + ' → ' : ''}${m.d}`).join('; ')}): fase di aggiustamento, da rivalutare al prossimo controllo.`;
  else if (active.length && p.meds.length) trend = `Terapia invariata da tempo (${p.meds.length} farmaci): quadro stabile.`;
  else if (evalp.length) trend = `In fase di inquadramento diagnostico (${evalp.map(x => x.l.toLowerCase()).join(', ')}).`;
  else trend = 'Nessun elemento di instabilità nei dati disponibili.';
  lines.push({ k: 'Andamento', t: trend, prov: 'inferred' });
  if (p.meds.length) lines.push({ k: 'Terapia', t: p.meds.map(m => `${m.n} ${m.d} ${m.f}`).join(', ') + '.', prov: 'confirmed' });
  if (lastExam) lines.push({ k: 'Ultimo esame', t: `${lastExam.t} del ${lastExam.d}: ${lastExam.r}.`, prov: 'confirmed' });
  if (newDocs.length) lines.push({ k: 'Da confermare', t: newDocs.map(d => `${d.t} (${d.d})`).join('; ') + '.', prov: 'document' });
  if (evalp.length && active.length) lines.push({ k: 'Aperto', t: evalp.map(x => `${x.l} (dal ${x.since})`).join('; ') + '.', prov: 'confirmed' });
  if (p.flags.length) lines.push({ k: 'Attenzione', t: p.flags.join('; ') + '.', prov: 'confirmed' });
  lines.push({ k: 'Prossimo passo', t: p.next && p.next !== '—' ? `Controllo ${p.next} con ${DOCTORS[p.doctor]}.` : 'Nessun appuntamento programmato.', prov: 'confirmed' });
  return lines;
}

function psGet(p) {
  const fp = psFingerprint(p);
  let s = PS.byPatient[p.id];
  if (!s) { s = { status: 'draft', lines: psGenerate(p), fp, generatedAt: TODAY }; PS.byPatient[p.id] = s; psSave(); }
  else if (s.status === 'verified' && s.fp !== fp) { s.status = 'stale'; psSave(); }
  return s;
}
function psRegenerate(id) { const p = P[id]; PS.byPatient[id] = { status: 'draft', lines: psGenerate(p), fp: psFingerprint(p), generatedAt: TODAY }; psSave(); render(); toast('Sintesi rigenerata dai dati aggiornati · da verificare'); }
function psVerify(id) {
  const s = PS.byPatient[id]; if (!s) return;
  if (!['doctor', 'org_admin'].includes(state.role)) { toast('Solo un medico può verificare la sintesi'); return; }
  s.status = 'verified'; s.verifiedBy = ROLES[state.role].name; s.verifiedAt = TODAY; s.fp = psFingerprint(P[id]); psSave(); render();
  toast('Sintesi verificata · da ora l\'assistente la usa come contesto');
}
function psEdit(id) {
  const s = PS.byPatient[id]; if (!s) return;
  openModal('Modifica la sintesi', `<div class="field"><label>Una riga per voce, "Voce: testo". Le righe modificate diventano testo del medico (provenienza confermata).</label><textarea class="input" id="ps-text" rows="9">${esc(s.lines.map(l => `${l.k}: ${l.t}`).join('\n'))}</textarea></div>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="ps-ok">Salva e verifica</button>`);
  document.getElementById('ps-ok').onclick = () => {
    const lines = document.getElementById('ps-text').value.split('\n').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf(':'); return i > 0 ? { k: x.slice(0, i).trim(), t: x.slice(i + 1).trim(), prov: 'confirmed' } : { k: 'Nota', t: x, prov: 'confirmed' }; });
    s.lines = lines; closeModal(); psVerify(id);
  };
}
function psText(s, short = false) { return (short ? s.lines.slice(0, 2) : s.lines).map(l => `${l.k}: ${l.t}`).join(' '); }
function psSpeak(id) {
  const s = PS.byPatient[id]; if (!s || !('speechSynthesis' in window)) { toast('Lettura vocale non disponibile'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(psText(s, true)); u.lang = 'it-IT';
  const v = speechSynthesis.getVoices().filter(x => x.lang.startsWith('it') && x.localService)[0]; if (v) u.voice = v;
  speechSynthesis.speak(u);
  toast('Lettura con la voce del dispositivo · nessun servizio esterno');
}

const PS_STATUS = { draft: ['Bozza AI · da verificare', 'warning'], verified: ['Verificata', 'success'], stale: ['Dati cambiati · da riverificare', 'danger'] };

/** Card per la pagina paziente (sostituisce "AI clinical summary"). */
function psCard(p) {
  const s = psGet(p);
  const [label, cls] = PS_STATUS[s.status];
  const canVerify = ['doctor', 'org_admin'].includes(state.role);
  return `<div class="card ai"><div class="card-head"><span class="section-title">Sintesi longitudinale</span><span class="row" style="gap:6px">${aiTag()}<span class="badge ${cls}">${label}</span></span></div>
    <div class="kv" style="grid-template-columns:130px 1fr">${s.lines.map(l => `<b>${esc(l.k)}</b><span>${esc(l.t)} ${provChip(l.prov)}</span>`).join('')}</div>
    <div class="caption mt-8">${s.status === 'verified' ? `Verificata da ${esc(s.verifiedBy)} il ${s.verifiedAt}. L'assistente la legge prima di rispondere su questo paziente.` : s.status === 'stale' ? 'Sono arrivati dati nuovi dopo la verifica: la sintesi resta visibile ma l\'assistente la usa solo come bozza.' : `Generata il ${s.generatedAt} dai dati strutturati del fascicolo. Nessuna riga senza provenienza.`}</div>
    <div class="row mt-8" style="gap:6px;flex-wrap:wrap">
      ${canVerify && s.status !== 'verified' ? `<button class="btn sm primary" onclick="psVerify('${p.id}')">${ICONS.check} Verifica</button>` : ''}
      ${canVerify ? `<button class="btn sm" onclick="psEdit('${p.id}')">${ICONS.why} Modifica</button>` : ''}
      <button class="btn sm" onclick="psRegenerate('${p.id}')">Rigenera</button>
      <button class="btn sm ghost" onclick="psSpeak('${p.id}')">${ICONS.wave} Leggi a voce</button>
    </div></div>`;
}

/** Chip di contesto per il pannello AI. */
function psChip() {
  if (!state.patientCtx) return '';
  const s = PS.byPatient[state.patientCtx];
  if (!s) return '';
  return `<span class="chip ${s.status === 'verified' ? 'active' : ''}">${ICONS.book}Sintesi ${s.status === 'verified' ? 'verificata' : 'bozza'}</span>`;
}

/** Risposta dell'assistente alle domande "come sta / riassumi / sintesi". */
function psAnswer(p) {
  const s = psGet(p);
  const head = s.status === 'verified' ? `<span class="prov confirmed">Sintesi verificata</span> da ${esc(s.verifiedBy)} il ${s.verifiedAt}` : `<span class="prov verify">Sintesi non ancora verificata</span> generata dai dati strutturati`;
  return `<b>${esc(fullName(p))} — in sintesi</b><br><div class="caption" style="margin:4px 0 6px">${head}</div>` +
    s.lines.map(l => `• <b>${esc(l.k)}</b>: ${esc(l.t)} <span class="prov ${l.prov}">${{ confirmed: 'Confermato', document: 'Nel documento', inferred: 'Dedotto' }[l.prov]}</span>`).join('<br>') +
    `<div class="srcs"><span class="src">Sintesi longitudinale · fascicolo</span><span class="src">Permission Engine · scope</span></div>`;
}
