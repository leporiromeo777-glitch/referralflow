/* ---------- Accoglienza: il tablet ---------- */
/* Il corpo dell'accoglienza: la lista di oggi con i tasti e la frase in
   italiano. Lo usano la pagina Accoglienza (per un tablet) e la Home, dove
   dal 16.9 sera sta al posto della colonna destra. */
function rfOrAccoglienzaCorpo(o, compatto) {
  const ingressi = new Map((o.ingressi || []).map(i => [i.id, i]));
  const pazienti = [...o.pazienti].sort((a, b) => a.teorica - b.teorica);
  const rit = (medico) => compatto ? rfOrRitardo(medico) : '';
  const righe = pazienti.map(p => {
    const i = ingressi.get(p.id);
    const fatto = ['dimesso', 'assente', 'annullato', 'visita_finita'].includes(p.stato);
    let sis = '';
    if (p.stato === 'atteso' || p.stato === 'arrivato' || p.stato === 'in_attesa') {
      if (i && i.azione === 'chiama') sis = `<b>Chiamare adesso</b> in ${rfEsc(i.sala)} con ${rfEsc(rfNomeCorto(i.medico || ''))}${rit(i.medico)}`;
      else if (i && i.azione === 'attendi') sis = `Resta in attesa: ${rfEsc(i.perche)}`;
      else if (p.sala && p.ingresso != null) sis = `Entra in <b>${rfEsc(p.sala)}</b> alle <b>${rfOrHm(p.ingresso)}</b>, con ${rfEsc(rfNomeCorto(p.medico || ''))}${rit(p.medico)}${p.inizio != null && p.inizio > p.teorica + 4 ? ` <span class="caption">— ${p.inizio - p.teorica} min dopo l'ora dell'agenda</span>` : ''}`;
      else sis = p.medico ? 'Nessuna stanza prevista: da sistemare' : 'Senza medico in agenda';
    } else if (p.sala) sis = `${rfEsc(p.sala)}${p.inizioReale != null ? ` dalle ${rfOrHm(p.inizioReale)}` : ''}`;
    const az = [];
    if (p.stato === 'atteso') { az.push(`<button class="btn sm primary" onclick="rfOrchEvento('paziente_arrivato',{appointment_id:'${p.id}'},'tablet')">Arrivato</button>`); az.push(`<button class="btn sm ghost" onclick="rfOrchEvento('paziente_assente',{appointment_id:'${p.id}'},'tablet')">Assente</button>`); }
    if (p.stato === 'arrivato') az.push(`<button class="btn sm" onclick="rfOrchEvento('paziente_accolto',{appointment_id:'${p.id}'},'tablet')">In attesa</button>`);
    if (['arrivato', 'in_attesa'].includes(p.stato) && p.sala) az.push(`<button class="btn sm ${i && i.azione === 'chiama' ? 'primary' : ''}" onclick="rfOrchEvento('paziente_chiamato',{appointment_id:'${p.id}',sala:'${rfEsc(p.sala)}'},'tablet')">Chiama</button>`);
    if (p.stato === 'chiamato') az.push(`<button class="btn sm ghost" onclick="rfOrchEvento('paziente_richiamato',{appointment_id:'${p.id}'},'tablet')" title="Torna in sala d'attesa: lo può fare solo una persona">Richiama</button>`);
    return `<div class="r${fatto ? ' fatto' : ''}${compatto ? ' compatta' : ''}"><span class="h">${rfOrHm(p.teorica)}</span><span><span class="n">${rfEsc(p.etichetta)}</span><br><span class="rf-or-pill ${rfEsc(p.stato)}">${rfEsc(rfOrStato(p.stato))}</span></span><span class="m">${rfEsc(p.prestazione || '—')}<br>${rfEsc(rfNomeCorto(p.medico || 'senza medico'))}${rfOrRitardo(p.medico)}</span><span class="sis">${sis}</span><span class="az">${az.join('')}</span></div>`;
  }).join('');
  const t = RF.orchTesto;
  const testo = `<div class="row" style="gap:8px"><input class="input" id="rf-or-testo" placeholder="Scrivi cosa succede: «la signora delle 10:30 arriva alle 11», «Rego è in ritardo di 15 minuti»" onkeydown="if(event.key==='Enter'){event.preventDefault();rfOrchTesto(this.value);}"><button class="btn" onclick="rfOrchTesto(document.getElementById('rf-or-testo').value)">Interpreta</button></div>
      ${t ? (t.attesa ? '<div class="caption" style="margin-top:8px">Leggo…</div>' : t.interpretazione ? `<div class="rf-or-msg ok" style="margin-top:8px">Ho capito: <b>${rfEsc(t.interpretazione.tipo)}</b>${t.interpretazione.etichetta ? ` · ${rfEsc(t.interpretazione.etichetta)}` : ''}${t.interpretazione.medico ? ` · ${rfEsc(t.interpretazione.medico)}` : ''}${t.interpretazione.stanza ? ` · ${rfEsc(t.interpretazione.stanza)}` : ''}${t.interpretazione.minuti != null ? ` · ${t.interpretazione.minuti} min` : ''}${t.interpretazione.nota ? ` · ${rfEsc(t.interpretazione.nota)}` : ''}
          ${(t.problemi || []).length ? `<br><span style="color:#a23b2a">${rfEsc(t.problemi.join(' · '))}</span>` : ''}
          <div class="row" style="gap:6px;margin-top:6px">${(t.problemi || []).length ? '' : `<button class="btn primary sm" onclick="rfOrchConfermaTesto()">Confermo</button>`}<button class="btn sm ghost" onclick="RF.orchTesto=null;render()">Annulla</button></div></div>`
        : `<div class="caption" style="margin-top:8px">${rfEsc(t.nota || t.errore || '')}</div>`) : ''}`;
  return { righe: righe || '<div class="caption">Nessun appuntamento oggi.</div>', testo };
}
PAGES.accoglienza = () => {
  if (!RF.live) return rfPaginaPiattaforma('Accoglienza', 'Arrivi e chiamate');
  const o = RF.orch;
  const testa = `<div class="page-head"><div><h2 class="page-title">Accoglienza</h2><div class="page-sub">Chi è arrivato, chi si chiama, e dove va</div></div></div>`;
  if (!o) return `${testa}<div class="card"><div class="caption">Carico…</div></div>`;
  const c = rfOrAccoglienzaCorpo(o, false);
  return `${testa}${rfOrMsg()}<div class="stack">
    <div class="card"><div class="card-head"><span class="section-title">Scrivi cosa succede</span></div>${c.testo}</div>
    <div class="card"><div class="rf-or-acc">${c.righe}</div></div></div>`;
};
async function rfOrchTesto(testo) {
  const t = String(testo || '').trim(); if (t.length < 4) return;
  RF.orchTesto = { attesa: true }; render();
  try { const r = await fetch('/api/orchestrazione/comandi', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: t }) }); RF.orchTesto = await r.json().catch(() => ({ errore: 'Risposta non leggibile.' })); }
  catch { RF.orchTesto = { errore: 'La piattaforma non risponde.' }; }
  render();
}
async function rfOrchConfermaTesto() {
  const t = RF.orchTesto && RF.orchTesto.interpretazione; if (!t) return;
  RF.orchTesto = null;
  if (t.tipo === 'comando' && t.comando) { await rfOrchComando(t.comando, { appointment_id: t.appointment_id, sala: t.stanza, medico: t.medico, minuti: t.minuti }); return; }
  await rfOrchEvento(t.tipo, { appointment_id: t.appointment_id, sala: t.stanza || null, medico: t.medico || null, minuti: t.minuti, testo: t.nota || null }, 'cleo');
}

/* ---------- Stanza: i pulsanti ---------- */
PAGES.stanza = () => {
  if (!RF.live) return rfPaginaPiattaforma('Stanza', 'I tre tasti');
  const o = RF.orch;
  const testa = `<div class="page-head"><div><h2 class="page-title">Stanza</h2><div class="page-sub">Tre tasti: in preparazione, pronto, finito</div></div></div>`;
  if (!o) return `${testa}<div class="card"><div class="caption">Carico…</div></div>`;
  const nome = RF.stanzaScelta;
  const s = o.sale.find(x => x.nome === nome);
  const scelta = `<div class="rf-or-scelta">${o.sale.map(x => `<button class="btn ${x.nome === nome ? 'primary' : ''}" onclick="rfOrchScegliStanza('${rfEsc(x.nome)}')">${rfEsc(x.nome)}</button>`).join('')}</div>`;
  if (!s) return `${testa}<div class="card"><div class="caption" style="margin-bottom:10px">Quale stanza è questa?</div>${scelta}</div>`;
  const d = s.dentro[0];
  const p = d ? o.pazienti.find(x => x.id === d.id) : null;
  let dentro = '';
  if (!p) dentro = `<div class="chi">Nessuno</div><div class="cosa">${s.prossimo ? `Prossimo: ${rfEsc(s.prossimo.etichetta)} con ${rfEsc(rfNomeCorto(s.prossimo.medico || ''))}, entra alle ${rfOrHm(s.prossimo.ingresso)}` : 'Nessun ingresso previsto'}</div>`;
  else {
    const b = [];
    if (p.stato === 'chiamato') b.push(`<button class="btn primary" onclick="rfOrchEvento('preparazione_iniziata',{appointment_id:'${p.id}',sala:'${rfEsc(nome)}'},'stanza')">In preparazione</button>`);
    if (['chiamato', 'in_preparazione'].includes(p.stato)) b.push(`<button class="btn primary" onclick="rfOrchEvento('pronto',{appointment_id:'${p.id}',sala:'${rfEsc(nome)}'},'stanza')">Pronto</button>`);
    if (['chiamato', 'in_preparazione', 'pronto'].includes(p.stato)) b.push(`<button class="btn tutta" onclick="rfOrchEvento('visita_iniziata',{appointment_id:'${p.id}',sala:'${rfEsc(nome)}'},'stanza')">Il medico è entrato</button>`);
    if (p.stato === 'in_visita') b.push(`<button class="btn primary tutta" onclick="rfOrchEvento('visita_finita',{appointment_id:'${p.id}'},'stanza')">Finito</button>`);
    if (['in_visita', 'visita_finita'].includes(p.stato)) b.push(`<button class="btn tutta" onclick="rfOrchEvento('dimesso',{appointment_id:'${p.id}'},'stanza')">Il paziente è uscito</button>`);
    dentro = `<div class="chi">${rfEsc(p.etichetta)}</div><div class="cosa">${rfEsc(p.prestazione || '')} · ${rfEsc(rfNomeCorto(p.medico || 'senza medico'))} · <b>${rfEsc(rfOrStato(p.stato))}</b>${p.inizioReale != null ? ` dalle ${rfOrHm(p.inizioReale)}` : ''}</div><div class="grandi">${b.join('')}</div>
      ${s.prossimo ? `<div class="caption" style="margin-top:14px">Poi: ${rfEsc(s.prossimo.etichetta)} con ${rfEsc(rfNomeCorto(s.prossimo.medico || ''))}, alle ${rfOrHm(s.prossimo.ingresso)}</div>` : ''}`;
  }
  return `${testa}${rfOrMsg()}<div class="card rf-or-stanza"><div class="caption"><b>${rfEsc(nome)}</b> · <span class="rf-or-pill ${rfEsc(s.stato)}">${rfEsc(rfOrStato(s.stato))}</span> · <a href="#" onclick="event.preventDefault();rfOrchScegliStanza('')">cambia stanza</a></div>${dentro}</div>`;
};
function rfOrchScegliStanza(n) { RF.stanzaScelta = n; try { localStorage.setItem('rf-stanza', n); } catch {} render(); }

/* L'elenco dell'accoglienza resta in ordine d'ora, ma si apre dove siamo
   adesso: alle tre del pomeriggio nessuno vuole scorrere mezza mattinata di
   pazienti già usciti. Chi ha fatto la sua visita resta sopra, a portata di
   rotella. Si riposiziona solo quando cambia la persona in cima, così una
   ricarica ogni venti secondi non fa saltare la lista sotto le mani. */
// L'altezza della colonna di sinistra, copiata su quella dell'accoglienza.
// Solo quando le due colonne sono affiancate: sul telefono la griglia le
// impila e un tetto le renderebbe scomode.
function rfOrAltezzaAccoglienza() {
  const sx = document.querySelector('.rf-home-sx');
  const dx = document.querySelector('.rf-home-acc');
  if (!sx || !dx) return;
  if (Math.abs(sx.getBoundingClientRect().top - dx.getBoundingClientRect().top) > 4 || sx.offsetWidth === dx.offsetWidth) {
    dx.style.maxHeight = ''; return;
  }
  dx.style.maxHeight = `${sx.offsetHeight}px`;
  if (!RF.orAccOsserva && typeof ResizeObserver === 'function') {
    RF.orAccOsserva = new ResizeObserver(() => { try { rfOrAltezzaAccoglienza(); } catch { /* la prossima volta */ } });
    RF.orAccOsserva.observe(sx);
  }
}
function rfOrScorriAccoglienza() {
  const box = document.querySelector('.rf-or-acc.scorre');
  if (!box) { RF.orAccAncora = null; return; }
  const righe = [...box.querySelectorAll('.r')];
  const i = righe.findIndex(r => !r.classList.contains('fatto'));
  if (i <= 0) return;
  const ancora = righe[i].textContent.slice(0, 40);
  if (RF.orAccAncora === ancora) return;
  RF.orAccAncora = ancora;
  box.scrollTop = Math.max(0, righe[i].offsetTop - box.offsetTop - 8);
}

/* Il caricamento e il battito seguono la pagina. */
window.addEventListener('resize', () => { try { rfOrAltezzaAccoglienza(); } catch { /* idem */ } });
(function () {
  const r = render;
  render = function () { const out = r.apply(this, arguments); try { rfOrchSincronizza(); rfOrAltezzaAccoglienza(); rfOrScorriAccoglienza(); rfVDopoRender(); } catch {} return out; };
})();

/* =====================================================================
   «Visite» (16.9.2026 sera, seconda versione — dal progetto approvato).
   La pagina che il medico apre fra un paziente e l'altro. Tre cose sole:
   chi è arrivato ed è in sala d'attesa, un tasto per entrare nella visita,
   e dentro il minimo che serve mentre il paziente è seduto davanti.
   Le regole che la tengono onesta:
   - si vedono SOLO i propri pazienti, e solo quelli in sala d'attesa;
   - due tocchi in tutta la visita: «inizia» e «termina»;
   - nessun cronometro: l'ora d'inizio e di fine si registrano, ma chi è
     nella stanza non deve sentirsi cronometrato;
   - il nome del paziente non esce mai dallo schermo: il rischio di questa
     pagina non è la lentezza, è lavorare sulla cartella sbagliata;
   - la cartella sta in pannelli chiusi, uno aperto per volta: una cartella
     con trecento documenti è alta come una con tre.
   ===================================================================== */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-v { max-width:720px; margin:0 auto; padding:8px 0 40px; }
.rf-v-titolo { font-size:29px; font-weight:640; letter-spacing:-.024em; margin:0; }
.rf-v-sotto { color:var(--text-3); font-size:13.5px; margin-top:6px; }
.rf-v-sotto a { color:var(--accent); }
.rf-v-elenco { margin-top:24px; border-top:1px solid var(--border); }
.rf-v-riga { display:grid; grid-template-columns:56px minmax(0,1fr) auto auto; align-items:center; gap:18px; padding:15px 4px; border-bottom:1px solid var(--border); }
.rf-v-riga .ora { font-size:14.5px; font-variant-numeric:tabular-nums; color:var(--text-2); font-weight:600; }
.rf-v-riga .nome { font-size:17px; font-weight:600; letter-spacing:-.011em; }
.rf-v-riga .motivo { font-size:13.5px; color:var(--text-3); margin-top:2px; }
.rf-v-riga .meta { text-align:right; font-size:12.5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-v-stato { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); }
.rf-v-pallino { width:7px; height:7px; border-radius:50%; background:var(--accent); flex:none; }
.rf-v-pallino.lento { background:var(--warning); }
.rf-v-riga .btn { white-space:nowrap; }
.rf-v-vuoto { max-width:460px; margin:0 auto; padding:72px 16px; text-align:center; }
.rf-v-vuoto .segno { width:46px; height:46px; margin:0 auto 18px; border-radius:50%; border:1.5px solid var(--border-2); display:grid; place-items:center; color:var(--text-3); }
.rf-v-vuoto .segno svg { width:20px; height:20px; }
.rf-v-vuoto h2 { font-size:20px; font-weight:600; letter-spacing:-.015em; margin:0; }
.rf-v-vuoto p { color:var(--text-3); font-size:14px; margin:8px 0 0; line-height:1.5; }
.rf-v-vuoto .dopo { margin-top:24px; padding-top:18px; border-top:1px solid var(--border); font-size:13px; color:var(--text-2); }

/* la visita: parte clinica a sinistra, assistente a destra */
.rf-v-schermo { display:grid; grid-template-columns:minmax(0,1fr) var(--rf-v-largh, 360px); gap:0; align-items:stretch; height:100%; }
.rf-v-clinico { min-width:0; overflow:auto; height:100%; padding:0 28px 56px; }
.rf-v-testa { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:14px; flex-wrap:wrap;
  padding:14px 0 13px; margin-bottom:18px; border-bottom:1px solid var(--border); background:var(--bg); }
#app.visita-larga .content { padding:0; overflow:hidden; }
#app.visita-larga .content > .page { max-width:none; height:100%; animation:none; padding:0; }
#app.visita-larga .ai-panel { display:none; }
#app.visita-larga.with-ai { grid-template-columns: var(--sidebar-w) 1fr; }
#app.visita-larga.with-ai.sidebar-collapsed { grid-template-columns: var(--sidebar-c) 1fr; }
.rf-v-testa .chi { min-width:0; }
.rf-v-testa .chi h2 { font-size:19px; font-weight:640; letter-spacing:-.016em; margin:0; }
.rf-v-testa .chi .r { font-size:12.5px; color:var(--text-3); margin-top:2px; }
.rf-v-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:var(--accent-soft); color:var(--accent); font-size:11.5px; font-weight:600; flex:none; }
.rf-v-allergia { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:var(--warning-soft); color:var(--warning); font-size:11.5px; font-weight:600; flex:none; }
.rf-v-spinta { margin-left:auto; padding-left:28px; flex:none; }
.rf-v-sez { font-size:11px; font-weight:640; letter-spacing:.085em; text-transform:uppercase; color:var(--text-3); margin:0 0 10px; }
.rf-v-brief { border:1px solid var(--border); border-radius:var(--r-card); background:var(--surface-2); padding:2px 16px; }
.rf-v-voce { display:grid; grid-template-columns:150px minmax(0,1fr); gap:16px; padding:11px 0; border-top:1px solid var(--border); font-size:14px; line-height:1.5; }
.rf-v-voce:first-child { border-top:0; }
.rf-v-voce .e { color:var(--text-3); font-size:12.5px; padding-top:1px; }
.rf-v-fonte { font-size:11.5px; color:var(--text-3); margin-top:9px; }
.rf-v-cart { margin-top:30px; border-top:1px solid var(--border); }
.rf-v-pan { border-bottom:1px solid var(--border); }
.rf-v-pan > button { width:100%; display:flex; align-items:center; gap:12px; padding:13px 4px; background:none; border:0; cursor:pointer; text-align:left; font:inherit; color:inherit; }
.rf-v-pan .t { font-size:14.5px; font-weight:550; letter-spacing:-.008em; }
.rf-v-pan > button:hover .t { color:var(--accent); }
.rf-v-pan .n { margin-left:auto; font-size:12.5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-v-pan .fr { color:var(--text-3); display:inline-flex; flex:none; transition:transform .22s var(--ease); }
.rf-v-pan.aperto .fr { transform:rotate(90deg); }
.rf-v-pan .corpo { display:none; padding:0 4px 16px; }
.rf-v-pan.aperto .corpo { display:block; }
.rf-v-pan .corpo ul { list-style:none; margin:0; padding:0; }
.rf-v-pan .corpo li { display:grid; grid-template-columns:96px minmax(0,1fr); gap:14px; padding:8px 0; border-top:1px solid var(--border); font-size:13.5px; }
.rf-v-pan .corpo li:first-child { border-top:0; }
.rf-v-pan .corpo li .d { color:var(--text-3); font-size:12.5px; font-variant-numeric:tabular-nums; }
.rf-v-pan .corpo a { color:var(--accent); }
.rf-v-pan .tutti { margin-top:10px; font-size:13px; color:var(--accent); background:none; border:0; padding:0; cursor:pointer; font-weight:550; }

/* l'assistente, colonna sua */
.rf-v-lato { position:relative; height:100%; min-height:0; display:flex; flex-direction:column; border-left:1px solid var(--border); background:var(--surface-2); }
.rf-v-lato .rf-gpt-col { max-width:none; padding:0 14px; }
.rf-v-lato .rf-gpt-thread { gap:18px; padding:16px 0 8px; }
.rf-v-lato .rf-gpt-foot { padding:8px 0 14px; }
.rf-v-lato .rf-gpt-comp { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:10px 10px 9px 16px; border-radius:18px; }
.rf-v-lato .rf-gpt-comp input { grid-column:1 / -1; height:30px; font-size:14px; }
.rf-v-lato .rf-gpt-nota { font-size:10.5px; margin-top:8px; }
.rf-v-lato .ai-msg { font-size:13.5px; }
.rf-v-benv { padding:18px 0 8px; }
.rf-v-benv p { margin:0; font-size:13.5px; line-height:1.55; color:var(--text-2); }
.rf-v-spunti { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.rf-v-spunti button { border:1px solid var(--border-2); background:var(--surface); border-radius:999px; padding:5px 11px; font:inherit; font-size:12px; color:var(--text-2); cursor:pointer; }
.rf-v-spunti button:hover { border-color:var(--accent); color:var(--accent); }
.rf-v-maniglia { position:absolute; left:-3px; top:0; bottom:0; width:7px; cursor:col-resize; z-index:6; }
.rf-v-maniglia::after { content:""; position:absolute; left:3px; top:0; bottom:0; width:1px; background:transparent; transition:background .15s var(--ease); }
.rf-v-maniglia:hover::after, .rf-v-maniglia.presa::after { background:var(--accent); }
.rf-v-lato-t { display:flex; align-items:center; gap:9px; padding:12px 14px; border-bottom:1px solid var(--border); flex:none; }
.rf-v-lato-t .n { font-size:13.5px; font-weight:600; }
.rf-v-lato-t svg { width:15px; height:15px; }
.rf-v-icona { margin-left:auto; width:28px; height:28px; border:0; background:none; border-radius:7px; display:grid; place-items:center; color:var(--text-3); cursor:pointer; }
.rf-v-icona:hover { background:var(--border); color:var(--text); }
.rf-v-rail { position:relative; height:100%; width:46px; border-left:1px solid var(--border); background:var(--surface-2); display:flex; flex-direction:column; align-items:center; padding-top:12px; }
.rf-v-rail button { width:30px; height:30px; border:0; background:none; border-radius:8px; display:grid; place-items:center; color:var(--accent); cursor:pointer; }
.rf-v-rail button:hover { background:var(--accent-soft); }
.rf-v-rail svg { width:16px; height:16px; }

.rf-v-velo { position:fixed; inset:0; background:rgba(20,28,24,.32); display:grid; place-items:center; z-index:60; }
.rf-v-sheet { width:330px; background:var(--surface); border-radius:var(--r-modal); box-shadow:var(--shadow-2); padding:22px 22px 16px; text-align:center; }
.rf-v-sheet h3 { font-size:16px; font-weight:600; margin:0; letter-spacing:-.01em; }
.rf-v-sheet p { font-size:13px; color:var(--text-3); margin:8px 0 18px; }
.rf-v-sheet .righe { display:flex; gap:8px; }
.rf-v-sheet .righe .btn { flex:1 1 0; justify-content:center; }
@media (max-width:980px) {
  .rf-v-schermo { grid-template-columns:minmax(0,1fr); }
  .rf-v-clinico { padding-right:0; }
  .rf-v-schermo { height:auto; }
  .rf-v-clinico { height:auto; overflow:visible; padding:0 16px 32px; }
  .rf-v-lato, .rf-v-rail { height:auto; border-left:0; border-top:1px solid var(--border); width:auto; }
  .rf-v-lato .rf-gpt-scroll { max-height:340px; }
  #app.visita-larga .content { overflow:auto; }
  .rf-v-maniglia { display:none; }
  .rf-v-riga { grid-template-columns:50px minmax(0,1fr); row-gap:10px; }
  .rf-v-riga .meta { grid-column:1 / -1; text-align:left; }
  .rf-v-riga .btn { grid-column:1 / -1; }
}
`; document.head.appendChild(st); })();

if (typeof NAV_META !== 'undefined') NAV_META.visite = ['Visite', 'visits'];
RF.vSel = null; RF.vAperto = null; RF.vConferma = false;
try { RF.vIo = localStorage.getItem('rf-medico') || ''; } catch { RF.vIo = ''; }
try { RF.vLatoChiuso = localStorage.getItem('rf-v-lato') === 'chiuso'; } catch { RF.vLatoChiuso = false; }
try { RF.vLargh = Math.min(520, Math.max(300, Number(localStorage.getItem('rf-v-largh')) || 360)); } catch { RF.vLargh = 360; }

const RF_V_IN_ATTESA = ['arrivato', 'in_attesa'];
const rfVFreccia = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const rfVOrologio = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.4"/><path d="M12 7.6V12l3 1.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

/* Chi sta guardando. Lo dice il server quando l'utente è collegato a un
   medico (`providers.user_id`); finché in studio entrano tutti con lo stesso
   account lo si sceglie una volta e resta su questo dispositivo. È una
   toppa, e si vede che è una toppa: quando ci saranno account veri sparisce
   da sola. */
function rfVChi() { const o = RF.orch; return (o && o.io) || RF.vIo || ''; }
function rfVIoScegli(nome) { RF.vIo = nome; try { localStorage.setItem('rf-medico', nome); } catch {} RF.vSel = null; render(); }
function rfVMiei() {
  const o = RF.orch; if (!o) return [];
  const io = rfVChi(); if (!io) return [];
  if (io === '*') return o.pazienti;
  return o.pazienti.filter((p) => rfNomeNudo(p.medico || '').toLowerCase() === rfNomeNudo(io).toLowerCase());
}
function rfVInAttesa() { return rfVMiei().filter((p) => RF_V_IN_ATTESA.includes(p.stato)).sort((a, b) => a.teorica - b.teorica); }
function rfVInVisita() { return rfVMiei().find((p) => p.stato === 'in_visita') || null; }
function rfVAgenda(sel) { return (RF.agenda || []).find((a) => a.id === sel.id) || null; }
function rfVCartella(sel) { const a = rfVAgenda(sel); const pid = a && a.p && rfUuid(a.p) ? a.p : null; return { pid, p: pid ? P[pid] : null, a }; }

/* ---------- elenco: chi è in sala d'attesa ---------- */
function rfVRiga(p, primo) {
  const o = RF.orch;
  const aspetta = (o && p.arrivo != null) ? Math.max(0, o.adesso - p.arrivo) : null;
  const tardi = aspetta != null && aspetta >= 20;
  return `<div class="rf-v-riga">
    <div class="ora">${rfOrHm(p.teorica)}</div>
    <div>
      <div class="nome">${rfEsc(p.etichetta)}</div>
      <div class="motivo">${rfEsc(p.prestazione || 'prestazione non riconosciuta')}</div>
    </div>
    <div class="meta">
      <div class="rf-v-stato"><span class="rf-v-pallino${tardi ? ' lento' : ''}"></span>In sala d&rsquo;attesa</div>
      <div style="margin-top:3px">${p.arrivo != null ? `arrivo ${rfOrHm(p.arrivo)}${tardi ? ` · da ${aspetta} min` : ''}` : 'arrivo non segnato'}</div>
    </div>
    <button class="btn${primo ? ' primary' : ''}" onclick="rfVInizia('${rfEsc(p.id)}')">Inizia visita</button>
  </div>`;
}
function rfVElenco() {
  const io = rfVChi();
  const lista = rfVInAttesa();
  const cambia = (RF.orch && RF.orch.io) ? '' : ` · <a href="#" onclick="event.preventDefault();rfVIoScegli('')">cambia</a>`;
  const testa = `<h1 class="rf-v-titolo">Visite</h1>
    <div class="rf-v-sotto">${io === '*' ? 'Tutti i pazienti in sala d&rsquo;attesa' : `Pazienti di <b>${rfEsc(rfNomeNudo(io))}</b> in sala d&rsquo;attesa`}${lista.length ? ` · ${lista.length}` : ''}${cambia}</div>`;
  if (!lista.length) {
    const dopo = rfVMiei().filter((p) => p.stato === 'atteso').sort((a, b) => a.teorica - b.teorica)[0];
    return `<div class="rf-v">${testa}
      <div class="rf-v-vuoto">
        <div class="segno">${rfVOrologio}</div>
        <h2>Nessuno in sala d&rsquo;attesa</h2>
        <p>I tuoi pazienti compaiono qui appena la segreteria li segna come arrivati.</p>
        ${dopo ? `<div class="dopo">Prossimo appuntamento: <b>${rfOrHm(dopo.teorica)}</b> · ${rfEsc(dopo.etichetta)}${dopo.prestazione ? ` · ${rfEsc(dopo.prestazione)}` : ''}</div>` : ''}
      </div></div>`;
  }
  return `<div class="rf-v">${testa}
    <div class="rf-v-elenco">${lista.map((p, i) => rfVRiga(p, i === 0)).join('')}</div></div>`;
}

/* ---------- inizio e fine ---------- */
async function rfVInizia(id) {
  const p = rfVMiei().find((x) => x.id === id);
  RF.vSel = id; RF.vAperto = null;
  const c = p ? rfVCartella(p) : { pid: null };
  if (c.pid) state.patientCtx = c.pid;
  await rfOrchEvento('visita_iniziata', { appointment_id: id, ...(p && p.sala ? { sala: p.sala } : {}) }, 'ui');
}
function rfVTerminaChiedi() { RF.vConferma = true; render(); }
function rfVAnnulla() { RF.vConferma = false; render(); }
async function rfVTermina(id) {
  RF.vConferma = false; RF.vSel = null;
  await rfOrchEvento('visita_finita', { appointment_id: id }, 'ui');
}

/* ---------- il briefing: sei righe, sempre le stesse, tutte da dati ----------
   Nessun modello: qui il codice legge la cartella e mette in fila quel che
   c'è. Una riga senza contenuto sparisce, non resta vuota. */
function rfVBriefing(sel, p) {
  const r = [];
  const oggi = `<b>${rfEsc(sel.prestazione || 'prestazione non riconosciuta')}</b> alle ${rfOrHm(sel.teorica)}${sel.sala ? ` · ${rfEsc(sel.sala)}` : ''}`;
  r.push(['Oggi', oggi]);
  if (p && p.indicazione) r.push(['Perché è qui', rfEsc(p.indicazione)]);
  const aperte = p ? (p.referrals || []).filter((x) => x.status !== 'chiusa') : [];
  if (aperte.length) r.push(['Chi l&rsquo;ha mandato', `${rfEsc(aperte[0].medico || 'invio senza medico')}${aperte[0].quesito ? ` — <b>«${rfEsc(aperte[0].quesito)}»</b>` : ''}${aperte[0].urgenza === 'urgente' ? ' · <b>urgente</b>' : ''}`]);
  else if (p && p.gp) r.push(['Medico curante', rfEsc(p.gp)]);
  const referti = p ? (typeof REPORTS !== 'undefined' ? REPORTS : []).filter((x) => x.p === p.id).sort((a, b) => rfDataOrd(b.date).localeCompare(rfDataOrd(a.date))) : [];
  if (referti.length) r.push(['Ultimo contatto', `${rfEsc(referti[0].type)} del ${rfEsc(referti[0].date)} · ${referti[0].status === 'APPROVED' ? 'confermato' : '<b>da controllare</b>'}`]);
  else if (p && p.lastVisit) r.push(['Ultimo contatto', `visita del ${rfEsc(p.lastVisit)}`]);
  if (p && (p.terapia || []).length) r.push(['Terapia in corso', `${p.terapia.map(rfEsc).join(' · ')}${p.terapiaDa ? ` <span class="caption">dal referto del ${rfEsc(p.terapiaDa)}</span>` : ''}`]);
  const problemi = p ? (p.problems || []).filter((x) => x.s !== 'resolved').slice(0, 3) : [];
  if (problemi.length) r.push(['Già noto', problemi.map((x) => rfEsc(x.l)).join(' · ')]);
  return r;
}

/* ---------- la cartella, a pannelli chiusi ---------- */
function rfVPannelli(p) {
  if (!p) return [];
  const R = (typeof REPORTS !== 'undefined' ? REPORTS : []).filter((x) => x.p === p.id).sort((a, b) => rfDataOrd(b.date).localeCompare(rfDataOrd(a.date)));
  const allerg = (p.fatti || []).filter((f) => /allerg|intoller/i.test(f.relazione || ''));
  const altri = (p.fatti || []).filter((f) => !/allerg|intoller/i.test(f.relazione || ''));
  const visite = (p.visits || []).filter((v) => v.fatta).sort((a, b) => rfDataOrd(b.d).localeCompare(rfDataOrd(a.d)));
  return [
    ['Terapia', (p.terapia || []).map((t) => ({ d: p.terapiaDa || '', v: rfEsc(t) }))],
    ['Problemi e quesiti', (p.problems || []).map((x) => ({ d: x.since || '', v: `${rfEsc(x.l)}${x.s === 'resolved' ? ' <span class="caption">chiuso</span>' : ''}` }))],
    ['Visite precedenti', visite.map((v) => ({ d: v.d, v: `${rfEsc(v.motivo || 'visita')}${v.medico ? ` · ${rfEsc(rfNomeCorto(v.medico))}` : ''}` }))],
    ['Esami', (p.exams || []).map((e) => ({ d: e.d, v: `<a href="/api/documents/${rfEsc(e.id)}" target="_blank" rel="noopener">${rfEsc(e.r)}</a>` }))],
    ['Documenti', (p.docs || []).map((d) => ({ d: d.d, v: `<a href="/api/documents/${rfEsc(d.id)}" target="_blank" rel="noopener">${rfEsc(d.t)}</a>${d.new ? ' <span class="caption">nuovo</span>' : ''}` }))],
    ['Referti', R.map((x) => ({ d: x.date, v: `<a href="#/review/${rfEsc(x.id)}">${rfEsc(x.type)}</a> <span class="caption">${x.status === 'APPROVED' ? 'confermato' : 'da controllare'}</span>` }))],
    ['Referral', (p.referrals || []).map((x) => ({ d: x.at || '', v: `${rfEsc(x.quesito || 'senza quesito')}${x.medico ? ` · ${rfEsc(x.medico)}` : ''}` }))],
    ['Allergie', allerg.map((f) => ({ d: '', v: rfEsc(f.oggetto) }))],
    ['Altri fatti', altri.map((f) => ({ d: f.data || '', v: `${rfEsc(f.oggetto)} <span class="caption">${rfEsc((f.relazione || '').replace(/_/g, ' '))}</span>` }))],
  ].filter((x) => x[1].length);
}
function rfVPannello(i) { RF.vAperto = RF.vAperto === i ? null : i; render(); }
function rfVPannelliHtml(p, pid) {
  const pan = rfVPannelli(p);
  if (!pan.length) return `<div class="caption" style="padding:12px 4px;line-height:1.5">Questo paziente è in agenda ma non ha una cartella in ReferralFlow: terapia, referti e documenti compaiono qui quando ce l&rsquo;ha.</div>`;
  return pan.map(([t, righe], i) => `<div class="rf-v-pan${RF.vAperto === i ? ' aperto' : ''}">
    <button type="button" onclick="rfVPannello(${i})" aria-expanded="${RF.vAperto === i}">
      <span class="fr">${rfVFreccia}</span><span class="t">${rfEsc(t)}</span><span class="n">${righe.length}</span></button>
    <div class="corpo">
      <ul>${righe.slice(0, 5).map((x) => `<li><span class="d">${rfEsc(x.d || '')}</span><span>${x.v}</span></li>`).join('')}</ul>
      ${righe.length > 5 && pid ? `<button class="tutti" data-go="#/patients/${rfEsc(pid)}">Vedi tutti (${righe.length}) nella cartella</button>` : ''}
    </div></div>`).join('');
}

/* ---------- l'assistente: la stessa Cleo della sua pagina ----------
   Non una chat scritta a parte, ma i pezzi veri della pagina di Cleo montati
   in colonna: stesso filo (`state.aiMessages`, quindi la conversazione è una
   sola ovunque), stesso campo con i due modi — «Domanda medica» e «Con la
   cartella» — e le stesse note sotto. Una seconda chat che somigliava alla
   prima ma non ne aveva i tasti era peggio che non averla. */
function rfVLato(chiuso) { RF.vLatoChiuso = chiuso; try { localStorage.setItem('rf-v-lato', chiuso ? 'chiuso' : 'aperto'); } catch {} render(); }
function rfVDopoRender() {
  // Il filo resta in fondo, dove c'è l'ultima risposta.
  const f = document.getElementById('rf-v-filo'); if (f) f.scrollTop = f.scrollHeight;
}
function rfVLatoHtml(sel, pid) {
  if (RF.vLatoChiuso) return `<div class="rf-v-rail"><button type="button" onclick="rfVLato(false)" title="Apri ${rfEsc(RF_AI_NOME)}" aria-label="Apri l&rsquo;assistente">${ICONS.ai}</button></div>`;
  const vuota = !state.aiMessages.length;
  const nome = String(sel.etichetta || '').split(' ')[0] || 'questo paziente';
  const spunti = pid
    ? ['Briefing pre-visita', 'Cosa è cambiato dall\u2019ultima visita?', 'Quali esami ha in cartella?']
    : ['Chi ho in sala d\u2019attesa?', 'Come va la giornata?'];
  const benvenuto = `<div class="rf-v-benv">
      <p>Sono qui su <b>${rfEsc(sel.etichetta)}</b>. ${pid ? 'Posso cercare un documento, riassumere un referto o dire che cosa è cambiato dall&rsquo;ultima volta.' : `Di ${rfEsc(nome)} c&rsquo;è solo l&rsquo;appuntamento, non la cartella: posso rispondere sulla giornata.`}</p>
      <div class="rf-v-spunti">${spunti.map((x) => `<button type="button" data-ai="${rfEsc(x)}">${rfEsc(x)}</button>`).join('')}</div>
    </div>`;
  return `<aside class="rf-v-lato">
    <div class="rf-v-maniglia" id="rf-v-maniglia" title="Trascina per ridimensionare"></div>
    <div class="rf-v-lato-t">${rfSegnoCleo()}<span class="n">${rfEsc(RF_AI_NOME)}</span>
      ${vuota ? '' : `<button class="rf-v-icona" onclick="state.aiMessages=[];render()" title="Nuova conversazione" aria-label="Nuova conversazione">${ICONS.x}</button>`}
      <button class="rf-v-icona" onclick="rfVLato(true)" title="Chiudi l&rsquo;assistente" aria-label="Chiudi l&rsquo;assistente">${rfVFreccia}</button></div>
    <div class="rf-gpt-scroll" id="rf-v-filo">
      <div class="rf-gpt-col">${vuota ? benvenuto : `<div class="rf-gpt-thread">${state.aiMessages.map((m) => m.html).join('')}</div>`}</div>
    </div>
    <div class="rf-gpt-foot"><div class="rf-gpt-col">${rfMedicaRiquadro()}${rfCartellaRiquadro()}${rfAiCampo()}${rfAiNota()}</div></div>
  </aside>`;
}

/* La maniglia: si trascina il bordo dell'assistente come una finestra. */
document.addEventListener('pointerdown', (e) => {
  const m = e.target && e.target.closest ? e.target.closest('#rf-v-maniglia') : null;
  if (!m) return;
  m.classList.add('presa');
  const muovi = (ev) => {
    const c = document.querySelector('.rf-v-schermo'); if (!c) return;
    const largh = Math.min(520, Math.max(300, c.getBoundingClientRect().right - ev.clientX));
    RF.vLargh = largh;
    document.documentElement.style.setProperty('--rf-v-largh', `${largh}px`);
  };
  const su = () => { m.classList.remove('presa'); try { localStorage.setItem('rf-v-largh', String(RF.vLargh)); } catch {} document.removeEventListener('pointermove', muovi); document.removeEventListener('pointerup', su); };
  document.addEventListener('pointermove', muovi);
  document.addEventListener('pointerup', su);
});

/* ---------- la visita ---------- */
function rfVAperta() {
  // Quella aperta a mano, oppure la visita che è già in corso: riaprendo la
  // pagina il medico deve ritrovarsi dov'era, non davanti a un elenco.
  const inCorso = rfVInVisita();
  if (RF.vSel) { const s = rfVMiei().find((x) => x.id === RF.vSel); if (s) return s; }
  return inCorso;
}
function rfVVisita(sel) {
  const { pid, p, a } = rfVCartella(sel);
  const allerg = p ? (p.fatti || []).filter((f) => /allerg|intoller/i.test(f.relazione || '')) : [];
  const brief = rfVBriefing(sel, p);
  const nato = (a && a.nascita) || (p && p.dob) || '';
  const eta = p && p.age ? `${p.age} anni` : '';
  return `<div class="rf-v-schermo" style="--rf-v-largh:${RF.vLargh}px">
    <div class="rf-v-clinico">
      <div class="rf-v-testa">
        <div class="chi">
          <h2>${rfEsc(sel.etichetta)}</h2>
          <div class="r">${[eta, nato, sel.prestazione].filter(Boolean).map(rfEsc).join(' · ')}</div>
        </div>
        ${sel.stato === 'in_visita' ? '<span class="rf-v-badge"><span class="rf-v-pallino"></span>Visita in corso</span>' : `<span class="rf-v-badge">${rfEsc(rfOrStato(sel.stato))}</span>`}
        ${allerg.length ? `<span class="rf-v-allergia">Allergie · ${allerg.map((f) => rfEsc(f.oggetto)).join(', ')}</span>` : ''}
        <span class="rf-v-spinta">${sel.stato === 'in_visita'
          ? `<button class="btn" onclick="rfVTerminaChiedi()">Termina visita</button>`
          : `<button class="btn" onclick="rfVChiudi()">Torna all&rsquo;elenco</button>`}</span>
      </div>
      <h3 class="rf-v-sez">Briefing visita</h3>
      <div class="rf-v-brief">${brief.map(([e, v]) => `<div class="rf-v-voce"><div class="e">${e}</div><div class="v">${v}</div></div>`).join('')}</div>
      <div class="rf-v-fonte">Dall&rsquo;agenda di oggi, dalla referral del curante e dall&rsquo;ultimo referto in cartella.</div>
      <h3 class="rf-v-sez" style="margin-top:30px">Cartella${pid ? ` · <a href="#" data-go="#/patients/${rfEsc(pid)}" style="text-transform:none;letter-spacing:0;font-weight:400">apri quella intera</a>` : ''}</h3>
      <div class="rf-v-cart">${rfVPannelliHtml(p, pid)}</div>
    </div>
    ${rfVLatoHtml(sel, pid)}
  </div>
  ${RF.vConferma ? `<div class="rf-v-velo" onclick="if(event.target===this)rfVAnnulla()"><div class="rf-v-sheet" role="dialog" aria-modal="true">
      <h3>Terminare la visita?</h3>
      <p>${rfEsc(sel.etichetta)}${sel.prestazione ? ` · ${rfEsc(sel.prestazione)}` : ''}</p>
      <div class="righe"><button class="btn" onclick="rfVAnnulla()">Annulla</button><button class="btn primary" onclick="rfVTermina('${rfEsc(sel.id)}')">Termina</button></div>
    </div></div>` : ''}`;
}
function rfVChiudi() { RF.vSel = null; RF.vConferma = false; render(); }

PAGES.visite = () => {
  if (!RF.live) return rfPaginaPiattaforma('Visite', 'I tuoi pazienti in sala d’attesa');
  if (!RF.orch) return `<div class="page-head"><div><h2 class="page-title">Visite</h2></div></div><div class="card"><p class="meta" style="margin:0">Leggo la giornata…</p></div>`;
  const io = rfVChi();
  if (!io) {
    // Senza account veri la pagina non sa di chi sono i pazienti: lo chiede
    // una volta, con poche parole, e non lo chiede mai più.
    const medici = [...new Set((RF.orch.pazienti || []).map((x) => x.medico).filter(Boolean))].sort((a, b) => rfNomeCorto(a).localeCompare(rfNomeCorto(b)));
    return `<div class="rf-v">
      <h1 class="rf-v-titolo">Visite</h1>
      <div class="rf-v-sotto">La pagina mostra i <b>tuoi</b> pazienti in sala d&rsquo;attesa. Chi sei? La scelta resta su questo dispositivo.</div>
      <div class="rf-or-scelta" style="margin-top:20px">${medici.map((m) => `<button class="btn" onclick="rfVIoScegli('${rfEsc(m)}')">${rfEsc(rfNomeNudo(m))}</button>`).join('') || '<span class="caption">Nessun medico con appuntamenti oggi.</span>'}</div>
      <div class="row mt-16"><button class="btn sm ghost" onclick="rfVIoScegli('*')">Mostrami tutti</button></div>
    </div>`;
  }
  const sel = rfVAperta();
  // `onRoute` azzera il contesto paziente a ogni cambio di rotta, e «visite»
  // non è fra le rotte che lo tengono: ricaricando con la visita aperta, la
  // colonna clinica mostrava il paziente giusto ma Cleo non sapeva di chi si
  // stesse parlando. Qui glielo si rimette.
  if (sel) { const c = rfVCartella(sel); if (c.pid) state.patientCtx = c.pid; }
  return `${rfOrMsg()}${sel ? rfVVisita(sel) : rfVElenco()}`;
};

/* =====================================================================
   Il telefono (16.9.2026 sera).
   L'interfaccia è nata su uno schermo grande e sul telefono si vedeva:
   tabelle larghe il doppio dello schermo che scorrevano di lato, il
   calendario del giorno con cinque colonne da cento pixel e i nomi
   tagliati a metà, le barre dei filtri alte quattro righe, le pastiglie
   di stato che uscivano dalla loro scheda.
   Qui sotto: le tabelle diventano schede (una riga = una scheda, con le
   etichette prese dall'intestazione), l'agenda del giorno diventa una
   lista in ordine d'ora, i filtri stanno su una riga che scorre, e
   niente esce più dallo schermo.
   Soglia: 640 px — un telefono in verticale. Sul tablet resta tutto
   com'era.
   ===================================================================== */
const rfTelefono = () => (typeof window !== 'undefined' ? window.innerWidth : 1440) <= 640;

/* Le tabelle: l'intestazione sparisce e ogni cella si porta dietro il suo
   nome. L'attributo si mette dopo il disegno, così vale per tutte le
   tabelle — anche quelle che verranno. */
function rfTabelleTelefono() {
  const c = document.getElementById('content');
  if (!c) return;
  const tel = rfTelefono();
  c.querySelectorAll('table').forEach((t) => {
    t.classList.toggle('rf-tab-schede', tel);
    if (!tel) return;
    const teste = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!teste.length) return;
    t.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.dataset.l == null && teste[i] != null) td.dataset.l = teste[i];
      });
    });
  });
}

/* L'agenda del giorno sul telefono: una lista in ordine d'ora. Il
   calendario a colonne resta su schermo grande — su un telefono cinque
   colonne da cento pixel non sono un'agenda, sono un indovinello. */
function rfAgendaListaHtml(lista, vista) {
  const nome = (a) => (a.p && typeof P !== 'undefined' && P[a.p] && typeof fullName === 'function') ? fullName(P[a.p]) : (a.nomeBreve || a.nome || 'Paziente');
  const ordinati = [...lista].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return `<div class="rf-ag-lista">${ordinati.map((a) => {
    const sotto = [a.prestazione || a.reason || '', vista === 'sale' ? (a.room || '') : (DOCTORS[a.doc] ? rfNomeCorto(DOCTORS[a.doc]) : '')].filter(Boolean).join(' · ');
    return `<button type="button" class="rf-ag-r${a.status === 'COMPLETED' ? ' fatta' : ''}${a.late ? ' tardi' : ''}" ${a.p && rfUuid(a.p) ? `data-go="#/patients/${rfEsc(a.p)}"` : ''}>
      <span class="h">${rfEsc(a.start)}</span>
      <span class="c"><span class="n">${rfEsc(nome(a))}</span>${sotto ? `<span class="s">${rfEsc(sotto)}</span>` : ''}</span>
      ${a.colore ? `<i class="pun" style="background:${rfEsc(a.colore)}"></i>` : ''}
    </button>`;
  }).join('')}</div>`;
}

(function () { const st = document.createElement('style'); st.textContent = `
@media (max-width: 640px) {
  /* nella barra in alto il titolo sparisce: la pagina ce l'ha già sotto, e
     su 375 px quello spazio serve alle icone (si leggeva «Age…») */
  .topbar .title, .topbar .crumb { display:none; }
  .page-head { flex-direction:column; align-items:stretch; gap:12px; }
  .page-head .actions { width:100%; }

  /* filtri e bottoni: vanno a capo. Scorrere di lato nascondeva mezzo tasto
     verde, e un tasto tagliato sembra un guasto. */
  .page-head .actions, .toolbar { flex-wrap:wrap; row-gap:8px; }
  .page-head .actions > *, .toolbar > * { max-width:100%; }
  .page-head .actions .btn, .toolbar .btn { flex:0 1 auto; }
  .toolbar .input, .page-head .actions .input { min-width:0; width:100%; }
  .seg { max-width:100%; overflow-x:auto; scrollbar-width:none; }
  .seg::-webkit-scrollbar { display:none; }

  /* le tabelle diventano schede: una riga, una scheda */
  .table-wrap { overflow:visible; max-height:none; box-shadow:none; }
  .rf-tab-schede { display:block; width:100%; border-collapse:separate; }
  .rf-tab-schede thead { display:none; }
  .rf-tab-schede tbody, .rf-tab-schede tr, .rf-tab-schede td { display:block; width:auto; }
  .rf-tab-schede tr { border:1px solid var(--border); border-radius:10px; background:var(--surface); padding:10px 12px; margin-bottom:8px; }
  .rf-tab-schede tr:hover { border-color:var(--accent); }
  /* etichetta a sinistra e valore di seguito, con il rientro sporgente: così
     un valore fatto di due pezzi («01.03.1950» e «(60)») resta sulla stessa
     riga invece di finire sotto l'etichetta. */
  .rf-tab-schede td { padding:3px 0 3px 100px; text-indent:-100px; border:0; font-size:13px; white-space:normal; line-height:1.45; }
  .rf-tab-schede td::before { content:attr(data-l); display:inline-block; width:92px; margin-right:8px; text-indent:0;
    color:var(--text-3); font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; vertical-align:baseline; }
  .rf-tab-schede td:first-child { padding:0 0 6px; text-indent:0; font-size:15.5px; font-weight:600; }
  .rf-tab-schede td:first-child::before { display:none; }
  .rf-tab-schede td:empty { display:none; }
  /* il rientro sporgente non deve scendere nei figli: una pastiglia lo
     ereditava e il suo testo finiva 100 px a sinistra, fuori dalla vista. */
  .rf-tab-schede td * { text-indent:0; }
  .rf-tab-schede td .row { display:inline-flex; flex-wrap:wrap; gap:6px; vertical-align:baseline; }

  /* l'agenda del giorno: lista invece di calendario */
  .rf-ag-lista { display:flex; flex-direction:column; border-top:1px solid var(--border); }
  .rf-ag-r { display:grid; grid-template-columns:52px minmax(0,1fr) auto; gap:12px; align-items:center; width:100%; text-align:left;
    background:none; border:0; border-bottom:1px solid var(--border); padding:13px 2px; font:inherit; color:inherit; cursor:pointer; }
  .rf-ag-r .h { font-variant-numeric:tabular-nums; font-size:14px; font-weight:600; color:var(--text-2); }
  .rf-ag-r .c { min-width:0; display:flex; flex-direction:column; gap:2px; }
  .rf-ag-r .n { font-size:15px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rf-ag-r .s { font-size:12.5px; color:var(--text-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rf-ag-r .pun { width:8px; height:8px; border-radius:50%; flex:none; }
  .rf-ag-r.fatta { opacity:.55; }
  .rf-ag-r.tardi .h { color:var(--warning); }

  /* sale: una colonna, e le pastiglie non escono più dalla scheda */
  .rf-or-mappa { grid-template-columns:minmax(0,1fr); }
  .rf-or-sala { min-height:0; }
  .rf-or-sala .t { flex-wrap:wrap; row-gap:4px; }
  .rf-or-sala .t b { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rf-or-pill { font-size:9.5px; padding:2px 6px; max-width:100%; overflow:hidden; text-overflow:ellipsis; }

  /* le tessere dei numeri: due per riga, tutte della stessa altezza */
  .grid-4, .grid-5 { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .stat .label, .card.tight .label { font-size:10px; line-height:1.3; }
  /* solo i numeri grandi a blocco: «.card .num» prendeva OGNI cifra dentro una scheda (valori di tabelle, misure, indirizzi) e la portava a 28 px sul telefono */
  .stat .value, .card > div.num { font-size:28px; }

  /* la visita: la colonna dell'assistente sotto, non di fianco */
  .rf-v-testa { position:static; }
  .rf-v-testa .rf-v-spinta { margin-left:0; padding-left:0; width:100%; }
  .rf-v-testa .rf-v-spinta .btn { width:100%; }
  .rf-v-voce { grid-template-columns:minmax(0,1fr); gap:2px; }
  .rf-v-voce .e { font-size:11px; text-transform:uppercase; letter-spacing:.05em; }

  /* la pagina di Cleo: il benvenuto parte dall'alto, così la prima cosa che
     si vede è il campo con i due modi e non la metà di un elenco. */
  .rf-gpt-scroll.vuota { justify-content:flex-start; }
  .rf-gpt-col { padding:0 16px; }
  .rf-gpt-w h3 { font-size:20px; margin-top:8px; }
  .rf-aiw-grid { grid-template-columns:minmax(0,1fr); }
  .rf-gpt-foot { padding-bottom:12px; }

  /* niente esce mai di lato */
  #content, #content > .page { max-width:100%; overflow-x:hidden; }
  .rf-cal-scorre { max-width:100%; }
}
`; document.head.appendChild(st); })();

/* Le tabelle si sistemano dopo ogni disegno, e quando si gira il telefono. */
(function () {
  const r = render;
  render = function () { const out = r.apply(this, arguments); try { rfTabelleTelefono(); } catch { /* pazienza */ } return out; };
  let largo = (typeof window !== 'undefined' ? window.innerWidth : 0);
  window.addEventListener('resize', () => {
    // Si ridisegna solo quando si passa la soglia: sul telefono il resize
    // scatta anche quando compare la tastiera.
    const ora = window.innerWidth;
    if ((largo <= 640) !== (ora <= 640)) { largo = ora; render(); } else { largo = ora; try { rfTabelleTelefono(); } catch { /* idem */ } }
  });
})();

/* Il tasto «AI» della barra in alto, sul telefono, porta alla PAGINA di Cleo.
   Prima apriva il pannello laterale, che sul telefono diventa un foglio a
   tutto schermo: sembrava Cleo ma non lo era — senza benvenuto, senza i due
   modi «Domanda medica» e «Con la cartella». Con il microfono il pannello
   resta, perché la dettatura scrive nel campo che sta lì dentro. */
if (typeof toggleAI === 'function') {
  const rfToggleAiOrig = toggleAI;
  toggleAI = function (force) {
    // Il tasto passa l'evento del clic come primo argomento: «esplicito» è
    // solo un vero true/false, cioè il microfono che chiede il pannello.
    if (rfTelefono() && typeof force !== 'boolean' && !state.aiOpen) {
      state.aiOpen = false;
      if (state.route !== 'ai') go('#/ai'); else render();
      return;
    }
    return rfToggleAiOrig.apply(this, arguments);
  };
}

/* =====================================================================
   «Richiami» (16.9.2026): chi va richiamato, e dove metterlo.
   Due cose che finora stavano in due mondi diversi — i richiami in una
   pagina della piattaforma vecchia, i buchi in agenda da nessuna parte —
   e che servono insieme: un richiamo scaduto senza un posto dove metterlo
   è una lista che cresce, e un buco senza un nome da chiamare è tempo
   perso. Qui la proposta è una riga sola: «questo paziente, in questo
   buco, perché».
   Il conto lo fa il codice ([[src/lib/agenda-buchi]]); il modello locale
   scrive solo la frase da dire al telefono; a prenotare, sull'agenda
   della Cassa dei Medici, è sempre una persona.
   ===================================================================== */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-ric { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); gap:16px; align-items:start; }
.rf-ric-prop { display:flex; flex-direction:column; border-top:1px solid var(--border); }
.rf-ric-p { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; padding:13px 2px; border-bottom:1px solid var(--border); align-items:start; }
.rf-ric-p .quando { font-size:12.5px; color:var(--text-2); font-variant-numeric:tabular-nums; }
.rf-ric-p .quando b { color:var(--text); }
.rf-ric-p .chi { font-size:15.5px; font-weight:600; margin-top:3px; }
.rf-ric-p .perche { font-size:12.5px; color:var(--text-3); line-height:1.45; margin-top:3px; }
.rf-ric-p .az { display:flex; flex-direction:column; gap:6px; align-items:stretch; }
.rf-ric-p .az .btn { white-space:nowrap; }
.rf-ric-p.pausa { opacity:.62; }
.rf-ric-el { display:flex; flex-direction:column; border-top:1px solid var(--border); max-height:none; }
.rf-ric-r { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:11px 2px; border-bottom:1px solid var(--border); align-items:center; }
.rf-ric-r .n { font-size:14px; font-weight:600; }
.rf-ric-r .s { font-size:12px; color:var(--text-3); margin-top:2px; }
.rf-ric-r .s.tardi { color:var(--warning); }
.rf-ric-alt { grid-column:1 / -1; margin:6px 0 2px; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
.rf-ric-alt .t { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-3); margin-bottom:8px; }
.rf-ric-alt button.scelta { display:block; width:100%; text-align:left; border:0; background:none; font:inherit; padding:7px 4px; border-top:1px solid var(--border); cursor:pointer; font-size:13px; }
.rf-ric-alt button.scelta:first-of-type { border-top:0; }
.rf-ric-alt button.scelta:hover { color:var(--accent); }
.rf-ric-tel { grid-column:1 / -1; margin:8px 0 2px; padding:11px 13px; border-left:3px solid var(--accent); background:var(--accent-soft); border-radius:0 10px 10px 0; font-size:13.5px; line-height:1.5; }
.rf-ric-tel .da { display:block; margin-top:6px; font-size:10.5px; color:var(--text-3); }
.rf-ric-nuovo { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.rf-ric-nuovo .input { flex:1 1 200px; min-width:0; }
@media (max-width:980px) { .rf-ric { grid-template-columns:minmax(0,1fr); } }
`; document.head.appendChild(st); })();

if (typeof NAV_META !== 'undefined') NAV_META.richiami = ['Richiami', 'clock'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('richiami')) n.splice(n.indexOf('agenda') + 1, 0, 'richiami'); }
RF.ric = null; RF.ricGiorni = 7; RF.ricAlt = null; RF.ricTel = null; RF.ricMsg = null;

async function rfRicCarica(rendi = true) {
  try {
    const r = await fetch(`/api/prototipo/richiami?giorni=${RF.ricGiorni}`, { credentials: 'include', cache: 'no-store' });
    RF.ric = r.ok ? await r.json() : { buchi: [], candidati: [], proposte: [], chiamate: [] };
  } catch { RF.ric = { buchi: [], candidati: [], proposte: [], chiamate: [] }; }
  if (rendi && state.route === 'richiami') render();
}
async function rfRicAzione(corpo, messaggio) {
  RF.ricMsg = null;
  try {
    const r = await fetch('/api/prototipo/richiami', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    RF.ricMsg = (r.ok && j.ok) ? { tipo: 'ok', testo: messaggio } : { tipo: 'male', testo: j.errore || 'Non riuscito.' };
    return j;
  } catch { RF.ricMsg = { tipo: 'male', testo: 'La piattaforma non risponde.' }; return null; }
}
async function rfRicFatto(id) { await rfRicAzione({ azione: 'fatto', id }, 'Richiamo chiuso.'); RF.ricAlt = null; await rfRicCarica(); }
async function rfRicRimanda(id, mesi) { await rfRicAzione({ azione: 'rimanda', id, mesi }, `Rimandato di ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}.`); await rfRicCarica(); }
// «Ho chiamato»: vale per la proposta che è aperta in quel momento — quella
// di cui si sta leggendo la frase al telefono.
async function rfRicChiamato(esito) {
  const p = RF.ricTel && RF.ricTel.proposta;
  if (!p) return;
  await rfRicAzione({ azione: 'chiamato', id: p.candidato.id, esito, patient_id: p.candidato.patientId || null,
    giorno: p.buco.giorno, dalle: p.buco.dalle, medico: p.buco.medico },
    esito === 'fissato' ? 'Appuntamento fissato: il richiamo è chiuso.' : 'Telefonata segnata.');
  RF.ricAlt = null; RF.ricTel = null; await rfRicCarica();
}
// Le alternative, dai due lati: da una proposta o da un buco vuoto si chiede
// «chi altro», da un paziente in attesa si chiede «dove».
async function rfRicAlternative(chiave, tipo, rif) {
  if (RF.ricAlt && RF.ricAlt.chiave === chiave) { RF.ricAlt = null; render(); return; }
  RF.ricAlt = { chiave, lista: null }; RF.ricTel = null; render();
  let corpo = null;
  if (tipo === 'buco') { const p = rfRicPresa('prop', rif); corpo = p ? { buco: p.buco } : null; }
  else if (tipo === 'vuoto') { const [giorno, dalle, medico] = String(rif).split('|'); corpo = { buco: { giorno, dalle: Number(dalle), medico } }; }
  else corpo = { id: rif };
  if (!corpo) { RF.ricAlt = null; render(); return; }
  const j = await rfRicAzione({ azione: 'alternative', giorni: RF.ricGiorni, ...corpo }, null);
  RF.ricAlt = { chiave, lista: (j && j.alternative) || [] }; RF.ricMsg = null; render();
}
async function rfRicTelefonata(fonte, i, chiave) {
  const p = rfRicPresa(fonte, i);
  if (!p) return;
  RF.ricTel = { chiave, proposta: p, testo: null }; render();
  const j = await rfRicAzione({ azione: 'telefonata', proposta: p }, null);
  RF.ricTel = { chiave, proposta: p, testo: (j && j.testo) || null, causa: j && j.causa }; RF.ricMsg = null; render();
}
async function rfRicNuovo() {
  const et = (document.getElementById('rf-ric-paz') || {}).value || '';
  const mesi = Number((document.getElementById('rf-ric-mesi') || {}).value || 6);
  const paz = rfModPazienti();
  const pid = paz.mappa.get(et.trim());
  if (!pid) { RF.ricMsg = { tipo: 'male', testo: 'Scegli il paziente dall’elenco della cartella.' }; render(); return; }
  await rfRicAzione({ azione: 'nuovo', patient_id: pid, mesi }, `Richiamo creato: fra ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}.`);
  await rfRicCarica();
}
function rfRicGiorni(n) { RF.ricGiorni = n; RF.ricAlt = null; RF.ric = null; render(); void rfRicCarica(); }

const rfRicOra = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const RF_RIC_GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
function rfRicGiorno(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const oggi = (RF.data && RF.data.today) || rfOggi();
  const domani = new Date(`${oggi}T12:00:00`); domani.setDate(domani.getDate() + 1);
  if (iso === oggi) return 'oggi';
  if (iso === domani.toLocaleDateString('sv-SE')) return 'domani';
  return `${RF_RIC_GIORNI[d.getDay()]} ${d.getDate()}`;
}
function rfRicProposta(p, i) {
  const chiave = `p${i}`;
  const alt = RF.ricAlt && RF.ricAlt.chiave === chiave ? RF.ricAlt : null;
  const tel = RF.ricTel && RF.ricTel.chiave === chiave ? RF.ricTel : null;
  return `<div class="rf-ric-p${p.buco.pausa ? ' pausa' : ''}">
    <div>
      <div class="quando"><b>${rfEsc(rfRicGiorno(p.buco.giorno))} ${rfRicOra(p.buco.dalle)}–${rfRicOra(p.buco.alle)}</b> · ${rfEsc(rfNomeCorto(p.buco.medico))} · ${p.buco.minuti} min liberi</div>
      <div class="chi">${rfEsc(p.candidato.paziente)}${p.candidato.prestazione ? ` <span class="caption">${rfEsc(p.candidato.prestazione)} · ${p.candidato.durata} min</span>` : ''}</div>
      <div class="perche">${rfEsc(p.perche.join(' · '))}</div>
    </div>
    <div class="az">
      <button class="btn sm primary" onclick="rfRicTelefonata('prop', ${i}, '${chiave}')">${ICONS.phone || ''} Chiama</button>
      <button class="btn sm ghost" onclick="rfRicAlternative('${chiave}', 'buco', ${i})">Chi altro?</button>
    </div>
    ${tel ? `<div class="rf-ric-tel">${tel.testo ? rfEsc(tel.testo).replace(/\n/g, '<br>') : (tel.causa ? `${rfEsc((tel.proposta && tel.proposta.frase) || p.frase)}<span class="da">Il modello locale non ha risposto (${rfEsc(tel.causa)}): questa è la frase del codice.</span>` : 'Scrivo che cosa dire…')}
      ${tel.testo || tel.causa ? `<div class="row mt-8" style="gap:6px;flex-wrap:wrap">
        <button class="btn sm primary" onclick="rfRicChiamato('fissato')">Ha detto di sì</button>
        <button class="btn sm" onclick="rfRicChiamato('non risponde')">Non risponde</button>
        <button class="btn sm ghost" onclick="rfRicChiamato('rifiutato')">Non gli va bene</button></div>` : ''}
      ${tel.testo ? `<span class="da">Scritta dal modello locale, su questo computer. La prenotazione la fa una persona sull’agenda.</span>` : ''}</div>` : ''}
    ${alt ? `<div class="rf-ric-alt"><div class="t">Chi altro entrerebbe in questo buco</div>
      ${alt.lista === null ? '<span class="caption">Guardo…</span>' : (alt.lista.length ? alt.lista.map((x, j) => `<button type="button" class="scelta" onclick="rfRicTelefonata('alt', ${j}, '${chiave}')"><b>${rfEsc(x.candidato.paziente)}</b> <span class="caption">${rfEsc(x.perche.join(' · '))}</span></button>`).join('') : '<span class="caption">Nessun altro ci sta dentro.</span>')}</div>` : ''}
  </div>`;
}
/* Niente oggetti dentro gli onclick: si passa da dove stanno già (RF), con
   un indice. Un JSON dentro un attributo HTML è una citazione dentro una
   citazione dentro una citazione, e prima o poi si rompe su un apostrofo. */
function rfRicPresa(fonte, i) {
  if (fonte === 'alt') return (RF.ricAlt && RF.ricAlt.lista && RF.ricAlt.lista[i]) || null;
  return (RF.ric && RF.ric.proposte && RF.ric.proposte[i]) || null;
}

PAGES.richiami = () => {
  if (!RF.live) return rfPaginaPiattaforma('Richiami', 'Chi va richiamato, e dove metterlo');
  if (RF.ric === null) { void rfRicCarica(); return `<div class="page-head"><div><h2 class="page-title">Richiami</h2></div></div><div class="card"><p class="meta" style="margin:0">Guardo i richiami e i buchi in agenda…</p></div>`; }
  const d = RF.ric;
  const senzaProposta = d.buchi.filter((b) => !d.proposte.some((p) => p.buco.giorno === b.giorno && p.buco.dalle === b.dalle && p.buco.medico === b.medico));
  const scaduti = d.candidati.filter((c) => c.giorniDiRitardo > 0);
  const paz = typeof rfModPazienti === 'function' ? rfModPazienti() : { html: '' };
  return `<div class="page-head"><div><h2 class="page-title">Richiami</h2>
      <div class="page-sub">${d.candidati.length} da rivedere${scaduti.length ? ` · <b>${scaduti.length} in ritardo</b>` : ''} · ${d.buchi.length} ${d.buchi.length === 1 ? 'buco' : 'buchi'} nei prossimi ${d.giorni} giorni</div></div>
    <div class="actions"><div class="seg">${[3, 7, 14].map((n) => `<button class="${RF.ricGiorni === n ? 'active' : ''}" onclick="rfRicGiorni(${n})">${n} giorni</button>`).join('')}</div></div></div>
    ${RF.ricMsg ? `<div class="rf-or-msg ${RF.ricMsg.tipo === 'ok' ? 'ok' : ''}">${rfEsc(RF.ricMsg.testo)}</div>` : ''}
    <div class="rf-ric">
      <div class="card">
        <div class="card-head"><span class="section-title">Da chiamare adesso</span><span class="caption">${d.proposte.length} ${d.proposte.length === 1 ? 'proposta' : 'proposte'}</span></div>
        ${d.proposte.length ? `<div class="rf-ric-prop">${d.proposte.map(rfRicProposta).join('')}</div>`
          : `<p class="meta" style="margin:0;line-height:1.55">Nessun accostamento da proporre: ${d.buchi.length ? 'i buchi ci sono, ma nessuno di chi aspetta ci starebbe dentro (durata, medico o prestazione).' : 'nei prossimi giorni l’agenda non ha buchi.'}</p>`}
      </div>
      <div class="stack" style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-head"><span class="section-title">Chi aspetta</span><span class="caption">${d.candidati.length}</span></div>
          ${d.candidati.length ? `<div class="rf-ric-el">${d.candidati.slice(0, 12).map((c) => {
            const chiave = `c${c.id}`;
            const alt = RF.ricAlt && RF.ricAlt.chiave === chiave ? RF.ricAlt : null;
            return `<div class="rf-ric-r">
              <div><div class="n">${rfEsc(c.paziente)}</div>
                <div class="s${c.giorniDiRitardo > 0 ? ' tardi' : ''}">${c.tipo === 'da_prenotare' ? 'da prenotare' : (c.giorniDiRitardo > 0 ? `in ritardo di ${c.giorniDiRitardo} giorni` : `entro il ${rfEsc(c.scadenza || '')}`)}${c.prestazione ? ` · ${rfEsc(c.prestazione)}` : ''}${c.medico ? ` · ${rfEsc(rfNomeCorto(c.medico))}` : ''}</div></div>
              <div class="row" style="gap:6px">
                <button class="btn sm" onclick="rfRicAlternative('${chiave}', 'candidato', '${rfEsc(c.id)}')">Dove?</button>
                <button class="btn sm ghost" onclick="rfRicFatto('${rfEsc(c.id)}')" title="Toglilo dalla lista">Fatto</button>
              </div>
              ${alt ? `<div class="rf-ric-alt"><div class="t">Dove potrebbe entrare</div>
                ${alt.lista === null ? '<span class="caption">Guardo…</span>' : (alt.lista.length ? alt.lista.map((x, j) => `<button type="button" class="scelta" onclick="rfRicTelefonata('alt', ${j}, '${chiave}')"><b>${rfEsc(rfRicGiorno(x.buco.giorno))} ${rfRicOra(x.buco.dalle)}</b> · ${rfEsc(rfNomeCorto(x.buco.medico))} <span class="caption">${x.buco.minuti} min</span></button>`).join('') : '<span class="caption">Nessun buco adatto nei prossimi giorni.</span>')}</div>` : ''}
              ${RF.ricTel && RF.ricTel.chiave === chiave ? `<div class="rf-ric-tel">${RF.ricTel.testo ? rfEsc(RF.ricTel.testo).replace(/\n/g, '<br>') : 'Scrivo che cosa dire…'}</div>` : ''}
            </div>`;
          }).join('')}</div>${d.candidati.length > 12 ? `<div class="caption mt-8">e altri ${d.candidati.length - 12}.</div>` : ''}`
            : '<p class="meta" style="margin:0">Nessuno in attesa di essere richiamato.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><span class="section-title">Buchi senza nessuno</span><span class="caption">${senzaProposta.length}</span></div>
          ${senzaProposta.length ? `<div class="rf-ric-el">${senzaProposta.slice(0, 8).map((b) => `<div class="rf-ric-r">
              <div><div class="n">${rfEsc(rfRicGiorno(b.giorno))} ${rfRicOra(b.dalle)}–${rfRicOra(b.alle)}</div>
                <div class="s">${rfEsc(rfNomeCorto(b.medico))} · ${b.minuti} min${b.pausa ? ' · ora di pranzo' : ''}</div></div>
              <div class="row"><button class="btn sm ghost" onclick="rfRicAlternative('b${rfEsc(b.giorno)}${b.dalle}', 'vuoto', '${rfEsc(b.giorno)}|${b.dalle}|${rfEsc(b.medico)}')">Chi?</button></div>
              ${RF.ricAlt && RF.ricAlt.chiave === `b${b.giorno}${b.dalle}` ? `<div class="rf-ric-alt"><div class="t">Chi entrerebbe</div>${RF.ricAlt.lista === null ? '<span class="caption">Guardo…</span>' : (RF.ricAlt.lista.length ? RF.ricAlt.lista.map((x, j) => `<button type="button" class="scelta" onclick="rfRicTelefonata('alt', ${j}, 'b${rfEsc(b.giorno)}${b.dalle}')"><b>${rfEsc(x.candidato.paziente)}</b> <span class="caption">${rfEsc(x.perche.join(' · '))}</span></button>`).join('') : '<span class="caption">Nessuno: o non ci sta, o non è il suo medico.</span>')}</div>` : ''}
            </div>`).join('')}</div>` : '<p class="meta" style="margin:0">Tutti i buchi hanno un nome accanto.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><span class="section-title">Nuovo richiamo</span></div>
          <div class="rf-ric-nuovo">
            <input class="input" id="rf-ric-paz" list="rf-mod-paz-list" placeholder="Cognome Nome…" autocomplete="off">${paz.html || ''}
            <select class="input" id="rf-ric-mesi" style="max-width:130px">${[1, 3, 6, 12, 24].map((m) => `<option value="${m}"${m === 6 ? ' selected' : ''}>fra ${m} ${m === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select>
            <button class="btn primary" onclick="rfRicNuovo()">Crea</button>
          </div>
          <div class="caption mt-8">Nasce come appuntamento da fissare: comparirà qui a sinistra quando sarà il momento, e nei buchi di quei giorni.</div>
        </div>
      </div>
    </div>`;
};

/* ---------- tre schede portate qui dalle pagine vecchie (16.9.2026) ----------
   «Il mio accesso» (la verifica in due passi, che è una cosa propria e non
   dell'amministratore), «Qualità AI» (com'è andata la catena dei referti, ed
   è l'unico posto dove si guarda se sta migliorando) e «Statistiche».
   Stanno nello Studio perché si guardano di rado e insieme al resto della
   configurazione — non meritavano tre voci di menu. */
RF.sic = null;

async function rfSicAzione(corpo) {
  RF.studio.errore = null;
  try {
    const r = await fetch('/api/prototipo/studio', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { RF.studio.errore = j.errore || 'Non riuscito.'; render(); return null; }
    return j;
  } catch { RF.studio.errore = 'Piattaforma non raggiungibile.'; render(); return null; }
}
async function rfSicAvvia() { const j = await rfSicAzione({ azione: '2fa_avvia' }); if (j) { RF.sic = { passo: 'qr', qr: j.qr, segreto: j.segreto, uri: j.uri }; render(); } }
async function rfSicAnnulla() { await rfSicAzione({ azione: '2fa_annulla' }); RF.sic = null; await rfStudioCarica(); }
async function rfSicConferma() {
  const c = (document.getElementById('rf-sic-codice') || {}).value || '';
  const j = await rfSicAzione({ azione: '2fa_conferma', codice: c });
  if (j) { RF.sic = { passo: 'codici', codici: j.codici }; await rfStudioCarica(); }
}
async function rfSicSpegni() {
  const c = (document.getElementById('rf-sic-spegni') || {}).value || '';
  const j = await rfSicAzione({ azione: '2fa_spegni', codice: c });
  if (j) { RF.sic = null; await rfStudioCarica(); }
}

function rfStudioSicurezza(d) {
  const s = d.sicurezza || {};
  const attiva = !!s.attiva;
  const p = RF.sic;
  if (p && p.passo === 'codici') {
    return `<div class="card"><div class="card-head"><span class="section-title">Codici di recupero</span></div>
      <p class="meta" style="margin:0 0 12px;line-height:1.55">La verifica in due passi è <b>attiva</b>. Questi codici servono se perdi il telefono: si vedono <b>una volta sola</b>. Stampali o mettili dove tieni le cose importanti — ognuno vale una volta.</p>
      <div class="rf-codici">${p.codici.map(c => `<code>${rfEsc(c)}</code>`).join('')}</div>
      <div class="row mt-16"><button class="btn primary" onclick="RF.sic=null;render()">Li ho messi al sicuro</button>
        <button class="btn ghost" onclick="rfStampaCodici()">${ICONS.print || ''} Stampa</button></div></div>`;
  }
  if (p && p.passo === 'qr') {
    return `<div class="card"><div class="card-head"><span class="section-title">Attivare la verifica in due passi</span></div>
      <div class="grid grid-2" style="align-items:start;gap:20px">
        <div><p class="meta" style="margin:0 0 10px;line-height:1.55">1. Apri l&rsquo;app di autenticazione (Google Authenticator, 1Password, Aegis…).<br>2. Inquadra il codice, oppure incolla la chiave.<br>3. Scrivi qui il numero di sei cifre che ti mostra.</p>
          <img src="${p.qr}" alt="Codice QR" style="width:200px;height:200px;border:1px solid var(--border);border-radius:10px;background:#fff;padding:6px">
          <div class="caption mt-8">Chiave: <code>${rfEsc(p.segreto)}</code></div>
          <div class="caption mt-8">Dal telefono, <a href="${rfEsc(p.uri)}">tocca qui</a> per aprirla direttamente nell&rsquo;app.</div></div>
        <div><div class="field"><label>Codice dell&rsquo;app</label><input class="input" id="rf-sic-codice" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" style="max-width:180px;font-size:20px;letter-spacing:.2em"></div>
          <div class="row mt-16"><button class="btn primary" onclick="rfSicConferma()">Attiva</button><button class="btn ghost" onclick="rfSicAnnulla()">Annulla</button></div>
          <p class="caption mt-16" style="line-height:1.5">Il segreto è stato creato su questo computer e non è uscito da qui. Finché non arriva un codice giusto, la verifica non è attiva.</p></div>
      </div></div>`;
  }
  return `<div class="card"><div class="card-head"><span class="section-title">Verifica in due passi</span>${attiva ? '<span class="badge success">attiva</span>' : '<span class="badge warning">non attiva</span>'}</div>
    <p class="meta" style="margin:0 0 12px;line-height:1.55">Il tuo accesso è <b>${rfEsc(s.email || '')}</b>. Con la verifica in due passi, chi ruba la password non entra lo stesso: serve anche il codice che cambia ogni 30 secondi sul tuo telefono.${attiva ? ` Attiva dal ${rfEsc((s.attiva || '').slice(0, 10).split('-').reverse().join('.'))}, ${s.codici} codici di recupero ancora buoni.` : ''}</p>
    ${attiva
      ? `<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div class="field" style="margin:0"><label>Per spegnerla, il codice dell&rsquo;app</label><input class="input" id="rf-sic-spegni" inputmode="numeric" placeholder="123456" style="max-width:160px"></div>
          <button class="btn ghost" onclick="rfSicSpegni()">Spegni la verifica</button></div>`
      : `<div class="row"><button class="btn primary" onclick="rfSicAvvia()">Attiva la verifica in due passi</button></div>`}
    <p class="caption mt-16" style="line-height:1.5">È una cosa tua: la accendi e la spegni tu, non l&rsquo;amministratore. Nella scheda «Personale» si vede solo chi ce l&rsquo;ha e chi no.</p></div>`;
}

function rfStudioQualita(d) {
  const q = d.qualita;
  if (!q) { void rfStudioCarica('qualita'); return `<div class="card"><div class="caption">Guardo com&rsquo;è andata la catena…</div></div>`; }
  const totale = q.settimane.reduce((s, r) => s + r.n, 0);
  const num = (v, suff = '') => v == null || v === '' ? '—' : `${Math.round(Number(v) * 10) / 10}${suff}`;
  const barre = (lista, chiave) => lista.length ? `<div class="rf-con-el">${lista.map(x => `<div class="rf-stu-r"><div><div class="n">${rfEsc(x[chiave])}</div></div><div class="num">${x.n}</div></div>`).join('')}</div>` : '<div class="caption">Ancora niente.</div>';
  const diz = (q.dizionario || []).reduce((a, r) => (a[r.stato] = r.n, a), {});
  const bozze = (q.bozze || []).reduce((a, r) => (a[r.stato] = r.n, a), {});
  return `${rfQualitaCorrezioni(q.correzioni)}
    <div class="grid grid-4 mt-16">
      <div class="card tight stat"><span class="label">Referti confermati</span><span class="value num">${bozze.confermata || 0}</span><span class="delta">${bozze.bozza || 0} aperti · ${bozze.scartata || 0} scartati</span></div>
      <div class="card tight stat"><span class="label">Con la revisione misurata</span><span class="value num">${totale}</span><span class="delta">ultime 8 settimane</span></div>
      <div class="card tight stat"><span class="label">Dizionario</span><span class="value num">${diz.confermato || 0}</span><span class="delta">${diz.proposto || 0} da confermare</span></div>
      <div class="card tight stat"><span class="label">Correzioni classificate</span><span class="value num">${q.classi.reduce((s, x) => s + x.n, 0)}</span><span class="delta">${q.classi.filter(x => /^ASR/i.test(x.classe)).reduce((s, x) => s + x.n, 0)} dal riconoscimento</span></div>
    </div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Settimana per settimana</span></div>
      ${q.settimane.length ? `<div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Settimana</th><th class="num">Referti</th><th class="num">Quota modificata</th><th class="num">Tempo di revisione</th><th class="num">Verifiche</th><th class="num">Accettate senza riascolto</th></tr></thead><tbody>
        ${q.settimane.map(r => `<tr><td>${rfEsc(r.settimana)}</td><td class="num">${r.n}</td><td class="num">${num(r.quota_med && Number(r.quota_med) * 100, '%')}</td><td class="num">${num(r.tempo_med, ' s')}</td><td class="num">${r.flag ?? '—'}</td><td class="num">${r.senza ?? '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="caption">Nessun referto confermato con la revisione misurata: i numeri compaiono appena si conferma una bozza.</div>'}
      <div class="caption mt-8" style="line-height:1.5">«Quota modificata» è quanta parte del testo dettato è stata cambiata a mano; se scende, la catena sta migliorando. «Accettate senza riascolto» conta le verifiche chiuse senza riascoltare l&rsquo;audio: se sale troppo, qualcuno sta approvando alla cieca.</div>
    </div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Che cosa si corregge</span></div>${barre(q.classi, 'classe')}
        <div class="caption mt-8">Solo le classi che cominciano per «ASR» alimentano il dizionario: sono gli errori di ascolto, non le scelte di stile.</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Da dove arriva il testo corretto</span></div>${barre(q.origini, 'origine')}</div>
    </div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Chi conferma</span></div>${barre(q.perUtente, 'email')}
      <div class="caption mt-8">Finché in studio si entra con pochi accessi condivisi, questa colonna dice poco: dirà molto quando ogni medico avrà il suo.</div></div>`;
}

function rfStudioStatistiche(d) {
  const s = d.statistiche;
  if (!s) { void rfStudioCarica('statistiche'); return `<div class="card"><div class="caption">Conto…</div></div>`; }
  const max = Math.max(1, ...s.perSettimana.map(x => x.n));
  return `<div class="grid grid-4">
      <div class="card tight stat"><span class="label">Referral ricevute</span><span class="value num">${s.referral}</span><span class="delta">${s.prenotate} prenotate</span></div>
      <div class="card tight stat"><span class="label">Giorni fino alla prenotazione</span><span class="value num">${rfEsc(String(s.giorni))}</span><span class="delta">mediana</span></div>
      <div class="card tight stat"><span class="label">Medici invianti</span><span class="value num">${s.invianti}</span><span class="delta">con almeno una referral</span></div>
      <div class="card tight stat"><span class="label">Appuntamenti, 30 giorni</span><span class="value num">${s.appuntamenti}</span><span class="delta">dall&rsquo;agenda</span></div>
    </div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Referral per settimana</span></div>
        <div class="row" style="align-items:flex-end;gap:6px;height:120px;margin-top:8px">
          ${s.perSettimana.map(x => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px">
            <div style="width:100%;background:var(--accent-soft);border-radius:4px 4px 0 0;height:${Math.round((x.n / max) * 90)}px" title="${x.n}"></div>
            <span class="caption">${rfEsc(x.label)}</span></div>`).join('')}
        </div></div>
      <div class="card"><div class="card-head"><span class="section-title">La catena</span></div>
        <div class="kv"><b>Referti dettati, 30 giorni</b><span class="num">${s.dettature}</span><b>Referti confermati in tutto</b><span class="num">${s.refertiConf}</span><b>Richiami aperti</b><span class="num">${s.richiamiAperti}</span></div>
        <div class="caption mt-8" style="line-height:1.5">Il confronto che conta: ${s.dettature} referti dettati contro ${s.appuntamenti} appuntamenti negli stessi 30 giorni.</div></div>
    </div>`;
}


/* «Statistiche» non è più una pagina a sé: sta nello Studio, con la qualità
   della catena. Il vecchio indirizzo porta lì invece di mostrare i numeri
   finti della demo. */
if (typeof PAGES !== 'undefined' && PAGES.statistics) {
  const rfStatOrig = PAGES.statistics;
  PAGES.statistics = () => {
    if (!RF.live) return rfStatOrig();
    RF.studio.scheda = 'statistiche';
    setTimeout(() => go('#/administration'), 0);
    return '<div class="page"><div class="caption">Le statistiche stanno nello Studio…</div></div>';
  };
}

/* ---------- «Quanto corregge la segretaria» (16.9.2026) ----------
   La funzione della piattaforma vecchia, portata qui: ogni correzione fatta
   a mano su un referto finisce nel registro (`audit.human_edits`), e da lì
   si vede quante ne servono, referto per referto, e se col tempo calano.
   Un punto = un referto. L'altezza = le correzioni della persona sull'ULTIMO
   testo dell'AI: le trasformazioni AI→AI non entrano, e nemmeno le modifiche
   del medico, che sono un'altra domanda. La linea è la media mobile: è quella
   che dice se la catena sta migliorando, non il singolo referto. */
function rfQualitaCorrezioni(c) {
  if (!c || !c.punti || !c.punti.length) {
    return `<div class="card"><div class="card-head"><span class="section-title">Quanto si corregge</span></div>
      <p class="meta" style="margin:0;line-height:1.55">Nessuna correzione registrata. Il conto parte da solo: ogni volta che qualcuno rivede una bozza e la conferma, la differenza rispetto al testo dell&rsquo;AI finisce nel registro e compare qui.</p></div>`;
  }
  const p = c.punti;
  const max = Math.max(1, ...p.map(x => x.edit_count));
  const L = 640, H = 150, passo = L / Math.max(1, p.length);
  const larg = Math.max(2, Math.min(18, passo - 2));
  const y = (v) => H - (v / max) * (H - 12);
  const barre = p.map((x, i) => {
    const alto = H - y(x.edit_count);
    const tit = `${x.edit_count} correzioni · ${Math.round((x.edits_per_100_words || 0) * 10) / 10} ogni 100 parole · ${rfEsc((x.created_at || '').slice(0, 10).split('-').reverse().join('.'))}${x.medico ? ` · ${rfEsc(rfNomeCorto(x.medico))}` : ''}`;
    return `<rect x="${(i * passo + (passo - larg) / 2).toFixed(1)}" y="${y(x.edit_count).toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(1, alto).toFixed(1)}" rx="2" fill="var(--accent)" opacity="${x.edit_count === 0 ? '.25' : '.55'}"><title>${tit}</title></rect>`;
  }).join('');
  const linea = p.map((x, i) => x.media == null ? null : `${(i * passo + passo / 2).toFixed(1)},${y(x.media).toFixed(1)}`).filter(Boolean).join(' ');
  const n = (v, d = 1) => v == null ? '—' : String(Math.round(Number(v) * 10 ** d) / 10 ** d);
  const tempo = c.tempo && c.tempo.mediana != null ? `${Math.round(c.tempo.mediana)} s` : '—';
  return `<div class="card">
    <div class="card-head"><span class="section-title">Quanto si corregge, referto per referto</span><span class="caption">${p.length} referti rivisti · media mobile su ${c.finestra}</span></div>
    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="card tight stat" style="box-shadow:none"><span class="label">Correzioni per referto</span><span class="value num">${n(c.st.mediana, 0)}</span><span class="delta">mediana · media ${n(c.st.media)}</span></div>
      <div class="card tight stat" style="box-shadow:none"><span class="label">Ogni 100 parole</span><span class="value num">${n(c.per100.mediana)}</span><span class="delta">peggiore ${n(c.per100.p90)} (9 su 10 sotto)</span></div>
      <div class="card tight stat" style="box-shadow:none"><span class="label">Referti senza correzioni</span><span class="value num">${c.senzaCorrezioni}</span><span class="delta">su ${p.length}</span></div>
      <div class="card tight stat" style="box-shadow:none"><span class="label">Tempo di revisione</span><span class="value num">${tempo}</span><span class="delta">mediana</span></div>
    </div>
    <div style="overflow-x:auto"><svg viewBox="0 0 ${L} ${H + 16}" style="width:100%;min-width:320px;height:${H + 16}px" role="img" aria-label="Correzioni per referto nel tempo">
      <line x1="0" y1="${H}" x2="${L}" y2="${H}" stroke="var(--border-2)" stroke-width="1"/>
      ${barre}
      ${linea ? `<polyline points="${linea}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` : ''}
    </svg></div>
    <div class="caption" style="line-height:1.5">Da sinistra (il più vecchio) a destra (l&rsquo;ultimo). Le barre sono i singoli referti, la linea è la media mobile: se scende, la catena sta imparando a sbagliare meno. Le correzioni del medico non entrano — qui si misura solo quanto lavoro resta a chi rivede.</div>
    ${c.categorie.length ? `<div class="mt-16"><div class="section-title" style="margin-bottom:8px">Che cosa si corregge</div>
      <div class="row wrap" style="gap:8px">${c.categorie.map(x => `<span class="badge">${rfEsc(x.categoria)} · ${x.n}</span>`).join('')}</div></div>` : ''}
  </div>`;
}

