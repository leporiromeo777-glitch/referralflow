/* ---------- Home sui dati veri (tutti i ruoli) ---------- */
// Cruscotto della giornata (14.9.2026): sei numeri, il prossimo paziente, le
// cose da fare, la timeline, il monitor delle sale (occupazione di oggi dal
// campo «luogo» dell'agenda abbinato alle risorse dello studio), chi ha agenda
// oggi, i referral urgenti e le bozze della catena. Tutto da `dati`.
(function () {
  const st = document.createElement('style');
  st.textContent = `
.grid-6 { grid-template-columns: repeat(6, minmax(0,1fr)); }
@media (max-width: 1199px) { .grid-6 { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 767px) { .grid-6 { grid-template-columns: repeat(2, 1fr); } }
.rf-sala { display:flex; flex-direction:column; gap:6px; padding:8px 6px; }
.rf-sala + .rf-sala { border-top:1px solid var(--border); }
.rf-sala .rf-sala-top { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.rf-sala .rf-sala-top .name { font-size:13px; font-weight:600; }
.rf-sala .rf-sala-top .n { font-size:12px; color:var(--text-2); white-space:nowrap; }
.rf-sala .meter { height:6px; }
.rf-sala .meter.now > i { background: var(--warning); }
.rf-sala .cap { font-size:12px; color:var(--text-3); }
.rf-sala .cap.now { color: var(--warning); font-weight:600; }
.rf-persona { display:flex; align-items:center; gap:8px; padding:6px 6px; font-size:13px; }
.rf-persona i.dot { flex:none; }
`; document.head.appendChild(st);
})();
const rfHomeOrig = PAGES.home;
PAGES.home = () => {
  if (!RF.live) return rfHomeOrig();
  const s = RF.data.stats || {};
  const appts = [...APPTS].sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = appts.find(a => a.status !== 'COMPLETED' && a.start >= hm) || appts.find(a => a.status !== 'COMPLETED');
  const pazNext = next ? P[next.p] : null;
  const stat = (v, l, go, d = '', warn = false) => `<div class="card tight clickable stat" data-go="${go}"><span class="value num">${v}</span><span class="label">${l}</span>${d ? `<span class="delta${warn ? ' warn' : ''}">${d}</span>` : ''}</div>`;
  const data = now.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const mediciOggi = [...new Set(appts.map(a => a.doc).filter(d => d && d !== 'studio'))];
  const nMed = mediciOggi.length;
  const prio = RF.queue.filter(r => r.state === 'priority' && r.status !== 'APPROVED').length;
  const urgenti = TASKS.filter(t => t.prio === 'urgent').slice(0, 6);
  const sale = Array.isArray(RF.data.sale) ? RF.data.sale : [];
  const oreSala = (min) => min >= 60 ? `${(min / 60).toFixed(min % 60 ? 1 : 0).replace('.', ',')} h` : `${min}'`;
  const rigaSala = (x) => {
    const pct = Math.min(100, Math.round(x.minuti / 480 * 100));
    const cap = x.occupataOra ? 'occupata adesso' : x.prossima ? `prossima alle ${x.prossima}` : x.n ? (x.prima ? `finita · prima era alle ${x.prima}` : 'finita per oggi') : 'libera oggi';
    const chi = x.titolare ? `<span class="rf-sala-chi">${rfEsc(x.titolare)}</span>` : (x.perche && x.perche !== 'libera' ? `<span class="rf-sala-chi vuota">${rfEsc(x.perche)}</span>` : '');
    return `<div class="rf-sala"><div class="rf-sala-top"><span class="name">${rfEsc(x.nome)}${chi}${x.tipo === 'apparecchio' ? ' <span class="caption">apparecchio</span>' : x.tipo === 'codice' ? ' <span class="caption">codice agenda</span>' : ''}</span><span class="n num">${x.n ? `${x.n} · ${oreSala(x.minuti)}` : '—'}${x.posti > 1 ? ` <span class="caption">· ${x.posti} posti</span>` : ''}</span></div><div class="meter${x.occupataOra ? ' now' : ''}"><i style="width:${pct}%"></i></div><div class="cap${x.occupataOra ? ' now' : ''}">${cap}</div></div>`;
  };
  // Una home per ruolo (23.9.2026, decisione dello studio): stessi blocchi,
  // composti secondo il lavoro di chi entra. Le caselle e i tasti che portano
  // a una sezione non del ruolo non compaiono (permessi.ts).
  const ruolo = state.role;
  const puoi = (href) => typeof rfRottaPermessa !== 'function' || rfRottaPermessa(String(href).replace(/^#\//, '').split('/')[0]);
  const T = {
    appuntamenti: stat(s.appuntamenti_oggi ?? appts.length, 'Appuntamenti oggi', '#/agenda', s.visti_oggi ? `${s.visti_oggi} già visti` : (next ? `prossimo alle ${next.start}` : '')),
    referti: stat(s.bozze_da_rivedere ?? 0, 'Referti da controllare', '#/reports', prio ? `${prio} prioritari` : '', prio > 0),
    daDettare: stat(s.visti_senza_referto ?? 0, 'Visti senza referto', ruolo === 'doctor' ? '#/dittafono' : '#/agenda', 'oggi, ancora da dettare'),
    urgenti: stat(s.urgenti ?? 0, 'Referral urgenti', '#/inbox', s.da_prenotare ? `${s.da_prenotare} da prenotare` : ''),
    richiami: stat(s.richiami_scaduti ?? 0, 'Richiami scaduti', '#/richiami'),
    ritardo: stat(s.lettere_in_ritardo ?? 0, 'Lettere in ritardo', '#/reports', (s.lettere_in_ritardo ?? 0) > 0 ? 'da sbloccare' : 'nessuna', (s.lettere_in_ritardo ?? 0) > 0),
    visti: stat(s.visti_oggi ?? 0, 'Già visti oggi', '#/agenda', next ? `prossimo alle ${next.start}` : ''),
  };
  const HREF = { appuntamenti: '#/agenda', referti: '#/reports', daDettare: ruolo === 'doctor' ? '#/dittafono' : '#/agenda', urgenti: '#/inbox', richiami: '#/richiami', ritardo: '#/reports', visti: '#/agenda' };
  const caselle = (chiavi) => { const v = chiavi.filter(c => puoi(HREF[c])); return v.length ? `<div class="grid grid-${Math.min(6, Math.max(3, v.length))}">${v.map(c => T[c]).join('')}</div>` : ''; };
  const tasto = (href, icona, testo) => puoi(href) ? `<button class="btn" data-go="${href}">${ICONS[icona] || ''} ${testo}</button>` : '';
  const aiGiornata = `<button class="btn ai" data-ai="Preparazione della giornata">${ICONS.ai} Prepara la giornata</button>`;
  const HERO = `
    ${next ? `<div class="card hero mt-16">
      <div class="row between"><span class="section-title">Prossimo paziente</span><span class="status"><i class="dot ${next.late ? 'danger' : 'success'}"></i>${next.late ? 'In ritardo' : STATUS_LABEL[next.status] || ''}</span></div>
      <div class="row mt-16" style="gap:16px;align-items:flex-start">
        <div class="num" style="font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1">${next.start}</div>
        <div class="grow"><div style="font-size:20px;font-weight:650">${rfEsc(rfNomeAppt(next))}${pazNext && pazNext.age ? ` <span class="meta">· ${pazNext.age} anni</span>` : ''}</div><div class="meta">${rfEsc(next.reason)} · ${rfEsc(DOCTORS[next.doc] || '')}${next.room ? ` · ${rfEsc(next.room)}` : ''}</div>
          <div class="row wrap mt-8">${pazNext && pazNext.docs && pazNext.docs.length ? `<span class="badge accent">${pazNext.docs.length} documenti in cartella</span>` : ''}${pazNext && pazNext.referrals && pazNext.referrals.length ? `<span class="badge">${pazNext.referrals.length} referral</span>` : ''}</div></div>
      </div>
      <div class="row mt-24"><button class="btn primary lg" data-go="#/patients/${next.p}">Scheda paziente</button>${rfUuid(next.p) ? `<button class="btn lg ai" data-ai="Briefing pre-visita di ${rfEsc(rfNomeAppt(next))}">${ICONS.ai} Briefing pre-visita</button>` : ''}<button class="btn lg" data-go="#/agenda">Agenda di oggi</button></div>
    </div>` : ''}
`;
  const TODO = `
        <div class="card"><div class="card-head"><span class="section-title">Da fare adesso</span><button class="btn sm ghost" data-go="#/inbox">Tutte ${ICONS.chevR}</button></div>
          <div class="list">${TASKS.length ? TASKS.slice(0, 12).map(t => `<div class="list-item"><i class="dot ${t.prio === 'urgent' || t.prio === 'high' ? 'danger' : 'accent'}"></i><div class="grow"><div class="name">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('') : '<div class="caption" style="padding:8px 6px">Tutto gestito. Buon lavoro.</div>'}</div></div>
`;
  const SALE = `${rfCardSale(sale, rigaSala, nMed)}`;
  const ACC = `
        ${(() => {
          // L'accoglienza al posto della colonna destra (16.9.2026 sera):
          // gli arrivi di oggi coi tasti, e la frase in italiano.
          const o = RF.orch;
          if (!o) return `<div class="card"><div class="card-head"><span class="section-title">Accoglienza</span></div><div class="caption" style="padding:8px 6px">Carico chi è arrivato…</div></div>`;
          const c = rfOrAccoglienzaCorpo(o, true);
          const arrivati = o.pazienti.filter(p => ['arrivato', 'in_attesa'].includes(p.stato)).length;
          const daChiamare = (o.ingressi || []).filter(i => i.azione === 'chiama').length;
          return `${rfOrMsg()}<div class="card"><div class="card-head"><span class="section-title">Accoglienza</span><span class="caption">${arrivati} in attesa${daChiamare ? ` · <b>${daChiamare} da chiamare</b>` : ''}</span></div>
            ${c.testo}
            <div class="rf-or-acc scorre" style="margin-top:10px">${c.righe}</div></div>`;
        })()}
`;
  const PROFILO = {
    doctor: { occhiello: 'La tua giornata', caselle: ['appuntamenti', 'daDettare', 'referti', 'richiami'], tasti: tasto('#/dittafono', 'mic', 'Dittafono') + tasto('#/agenda', 'agenda', 'Agenda') + aiGiornata, hero: true, sx: [TODO], dx: [SALE] },
    assistant: { occhiello: 'Le sale e i pazienti di oggi', caselle: ['appuntamenti', 'visti', 'richiami'], tasti: tasto('#/agenda', 'agenda', 'Agenda') + tasto('#/sale', 'agenda', 'Sale') + tasto('#/dittafono', 'mic', 'Dittafono'), hero: true, sx: [SALE, TODO], dx: [ACC] },
    secretary: { occhiello: 'La giornata dello studio', caselle: ['appuntamenti', 'referti', 'daDettare', 'urgenti', 'richiami', 'ritardo'], tasti: tasto('#/agenda', 'agenda', 'Agenda') + tasto('#/reports', 'reports', 'Referti') + aiGiornata, hero: true, sx: [TODO, SALE], dx: [ACC] },
    org_admin: { occhiello: 'Lo studio oggi', caselle: ['appuntamenti', 'referti', 'ritardo', 'urgenti', 'richiami', 'daDettare'], tasti: tasto('#/fatturazione', 'stats', 'Da fatturare') + tasto('#/administration', 'admin', 'Amministrazione') + tasto('#/reports', 'reports', 'Referti'), hero: false, sx: [TODO, SALE], dx: [ACC] },
    tech_admin: { occhiello: 'Tutta la piattaforma', caselle: ['appuntamenti', 'referti', 'daDettare', 'urgenti', 'richiami', 'ritardo'], tasti: tasto('#/agenda', 'agenda', 'Agenda') + tasto('#/reports', 'reports', 'Referti') + tasto('#/administration', 'admin', 'Amministrazione') + aiGiornata, hero: true, sx: [TODO, SALE], dx: [ACC] },
  };
  const PR = PROFILO[ruolo] || PROFILO.secretary;
  return `
    <div class="page-head"><div><div class="eyebrow">${PR.occhiello}</div><div class="display">${rfEsc(ROLES[state.role].greet)}</div><div class="page-sub" style="text-transform:none">${data} · ${appts.length} ${appts.length === 1 ? 'appuntamento' : 'appuntamenti'}${nMed ? ` · ${nMed} ${nMed === 1 ? 'medico' : 'medici'} in agenda` : ''} · ${TASKS.length ? `${TASKS.length} ${TASKS.length === 1 ? 'cosa' : 'cose'} da fare` : 'niente in sospeso'}</div></div>
      <div class="actions">${PR.tasti}</div></div>
    ${caselle(PR.caselle)}
    ${PR.hero ? HERO : ''}
    <div class="grid grid-main-side mt-16">
      <div class="stack rf-home-sx">${PR.sx.join('')}</div>
      <div class="stack rf-home-acc">${PR.dx.join('')}</div>
    </div>`;
};

/* ---------- Percorsi diagnostico-terapeutici (14.9.2026) ---------- */
// Sequenze standard per indicazione dalla pagina wiki «Medici/Percorsi»,
// via GET /api/prototipo/percorsi. Ricerca in pagina senza ricaricare; stato
// «proposta» finché il medico non valida la pagina.
if (typeof NAV_META !== 'undefined') NAV_META.percorsi = ['Percorsi', 'flow'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('percorsi')) n.splice(n.indexOf('patients') + 1, 0, 'percorsi'); }
RF.percorsi = null;
async function rfCaricaPercorsi() {
  try {
    const r = await fetch('/api/prototipo/percorsi', { credentials: 'include' });
    const j = r.ok ? await r.json() : {};
    RF.percorsi = Array.isArray(j.percorsi) ? j.percorsi : [];
  } catch { RF.percorsi = []; }
  if (state.route === 'percorsi') render();
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'rf-perc-q') return;
  const q = e.target.value.trim().toLowerCase();
  let n = 0;
  document.querySelectorAll('[data-percorso]').forEach((el) => { const ok = !q || el.getAttribute('data-percorso').includes(q); el.hidden = !ok; if (ok) n++; });
  const c = document.getElementById('rf-perc-n'); if (c) c.textContent = `${n} ${n === 1 ? 'percorso' : 'percorsi'}`;
});
PAGES.percorsi = () => {
  if (!RF.live) return rfPaginaPiattaforma('Percorsi', 'Sequenze standard di prestazioni per indicazione');
  if (RF.percorsi === null) { void rfCaricaPercorsi(); return `<div class="page-head"><div><h2 class="page-title">Percorsi diagnostico-terapeutici</h2><div class="page-sub">Sequenze standard di prestazioni per indicazione</div></div></div><div class="card"><p class="meta" style="margin:0">Leggo la pagina wiki…</p></div>`; }
  const lista = RF.percorsi;
  const proposte = lista.filter(p => p.stato !== 'validato').length;
  const card = (p) => `<div class="card" data-percorso="${rfEsc(`${p.nome} ${p.indicazione} ${p.prestazioni.map(x => x.nome).join(' ')}`.toLowerCase())}">
      <div class="card-head" style="align-items:flex-start"><div><div class="caption" style="letter-spacing:.04em;text-transform:uppercase">${rfEsc(p.indicazione)}</div><div class="section-title" style="font-size:16px;margin-top:2px">${rfEsc(p.nome)}</div></div>
        <div class="row wrap" style="justify-content:flex-end;gap:6px">${p.urgente ? '<span class="badge danger">Urgenza</span>' : ''}<span class="badge ${p.stato === 'validato' ? 'success' : 'warning'}">${p.stato === 'validato' ? 'Validato' : 'Proposta'}</span></div></div>
      <div class="row wrap mt-8" style="gap:6px">${p.durata ? `<span class="badge">${ICONS.clock} ${rfEsc(p.durata)}</span>` : ''}${p.dove ? `<span class="badge">${ICONS.door} ${rfEsc(p.dove)}</span>` : ''}<span class="badge accent">${p.prestazioni.length} prestazioni</span></div>
      <div class="list mt-8">${p.prestazioni.map(x => `<div class="list-item" style="padding:6px 6px"><span class="num" style="width:22px;color:var(--text-3);font-size:12px">${x.n}</span><div class="grow"><div class="name" style="font-size:13px">${rfEsc(x.nome)}${x.esterna ? ' <span class="badge" style="font-size:10px">fuori studio</span>' : ''}</div>${x.condizione ? `<div class="sub">${rfEsc(x.condizione)}</div>` : ''}</div></div>`).join('')}</div>
      ${p.tempi ? `<div class="kv mt-8"><b>Tempi</b><span>${rfEsc(p.tempi)}</span></div>` : ''}
      ${p.urgente && p.urgenza ? `<div class="kv"><b>Urgenza</b><span>${rfEsc(p.urgenza)}</span></div>` : ''}
      ${p.nota ? `<p class="meta mt-8" style="margin:0;line-height:1.5;font-style:italic">${rfEsc(p.nota)}</p>` : ''}
      ${p.fonti ? `<div class="caption mt-8">Fonti: ${rfEsc(p.fonti)}</div>` : ''}
    </div>`;
  return `<div class="page-head"><div><h2 class="page-title">Percorsi diagnostico-terapeutici</h2><div class="page-sub">Sequenze standard di prestazioni per indicazione · <span id="rf-perc-n">${lista.length} ${lista.length === 1 ? 'percorso' : 'percorsi'}</span></div></div>
      <div class="actions"><input class="input" id="rf-perc-q" placeholder="Cerca indicazione o prestazione…" autocomplete="off"><button class="btn ai" data-ai="Quale percorso per un paziente con palpitazioni?">${ICONS.ai} Chiedi a Cleo</button></div></div>
    ${proposte ? `<div class="card" style="border-left:3px solid var(--warning)"><p class="meta" style="margin:0;line-height:1.55"><b>${proposte} ${proposte === 1 ? 'percorso è una proposta' : 'percorsi sono proposte'}</b> scritte dalle linee guida per uno studio ambulatoriale: durate, tempi e criteri li valida il cardiologo. Si correggono nella pagina wiki <code>Medici/Percorsi</code> (SilverBullet sulla rete dello studio, porta 3400); alla riga «Stato» si scrive <code>validato</code>. La piattaforma rilegge la pagina entro 5 minuti.</p></div>` : ''}
    <div class="grid grid-2 mt-16">${lista.length ? lista.map(card).join('') : '<div class="card"><p class="meta" style="margin:0">Nessun percorso nella pagina wiki.</p></div>'}</div>`;
};

/* ---------- Moduli dello studio (14.9.2026) ---------- */
// Definizioni dalla pagina wiki «Piattaforma/Moduli» via GET /api/prototipo/moduli;
// compilazioni salvate nel dossier (POST), aperte e stampate dal dettaglio.
// Le risposte viaggiano solo dentro la sessione; qui non finiscono in log.
if (typeof NAV_META !== 'undefined') NAV_META.moduli = ['Moduli', 'file'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('moduli')) n.splice(n.indexOf('documents') + 1, 0, 'moduli'); }
(function () { const st = document.createElement('style'); st.textContent = `
.rf-mod-campo { display:flex; flex-direction:column; gap:4px; margin-top:10px; }
.rf-mod-campo label { font-size:12.5px; color:var(--text-2); }
.rf-mod-campo label b { color:var(--danger); font-weight:600; }
.rf-mod-campo .input, .rf-mod-campo textarea, .rf-mod-campo select { width:100%; min-width:0; }
.rf-mod-campo textarea { min-height:72px; padding:8px 12px; border-radius:var(--r-input); border:1px solid var(--border); background:var(--surface); font:inherit; resize:vertical; }
.rf-mod-campo .err { font-size:12px; color:var(--danger); }
.rf-mod-sino { display:flex; gap:6px; }
.rf-mod-sino button.active { background:var(--accent-soft); border-color:var(--accent); color:var(--accent-text); }
#rf-print { display:none; }
@media print { body.rf-stampa > *:not(#rf-print) { display:none !important; } body.rf-stampa #rf-print { display:block; font:12pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color:#000; padding:0; } #rf-print h1 { font-size:16pt; margin:0 0 2pt; } #rf-print .meta { color:#333; font-size:10.5pt; margin-bottom:12pt; } #rf-print table { width:100%; border-collapse:collapse; } #rf-print td { border-bottom:1px solid #999; padding:6pt 4pt; vertical-align:top; } #rf-print td:first-child { width:38%; color:#333; } #rf-print .firma { margin-top:28pt; display:flex; justify-content:space-between; } #rf-print .firma span { border-top:1px solid #000; padding-top:4pt; width:40%; font-size:10pt; } #rf-print .rf-docp h2 { font-size:12pt; margin:14pt 0 4pt; border-bottom:1px solid #999; padding-bottom:2pt; } #rf-print .rf-docp h2 span { font-weight:400; color:#333; } #rf-print .rf-docp h3 { font-size:10pt; margin:8pt 0 2pt; text-transform:uppercase; letter-spacing:.04em; color:#333; } #rf-print .rf-docp ul { margin:0 0 4pt; padding-left:14pt; } #rf-print .rf-docp li { margin:1.5pt 0; } #rf-print .rf-docp .num { font-size:11pt; } #rf-print .rf-docp .sch { break-inside:avoid; } #rf-print .rf-docp table.griglia th { text-align:left; font-size:9.5pt; border-bottom:1px solid #000; padding:3pt 4pt; } #rf-print .rf-docp table.griglia td { width:auto; color:#000; padding:4pt; } }
`; document.head.appendChild(st); })();
RF.moduli = null;
async function rfCaricaModuli(rendi = true) {
  try {
    const r = await fetch('/api/prototipo/moduli', { credentials: 'include' });
    const j = r.ok ? await r.json() : {};
    RF.moduli = { moduli: Array.isArray(j.moduli) ? j.moduli : [], compilazioni: Array.isArray(j.compilazioni) ? j.compilazioni : [] };
  } catch { RF.moduli = { moduli: [], compilazioni: [] }; }
  if (rendi && ['moduli', 'patient'].includes(state.route)) render();
}
function rfModQuando(iso) { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function rfModRigaComp(c, conPaziente = true) {
  return `<div class="list-item"><i class="dot ${c.completo ? 'success' : 'warning'}"></i><div class="grow"><div class="name" style="font-size:13px">${conPaziente ? `${rfEsc(c.paziente || 'senza paziente')} · ` : ''}${rfEsc(c.codice)} ${rfEsc(c.titolo)}</div><div class="sub">${rfModQuando(c.updated_at)}${c.da ? ` · ${rfEsc(c.da)}` : ''}${c.completo ? '' : ' · incompleto'}</div></div><button class="btn sm" onclick="rfModuloApri('${c.id}')">Apri</button></div>`;
}
PAGES.moduli = () => {
  if (!RF.live) return rfPaginaPiattaforma('Moduli', 'I moduli dello studio in versione digitale');
  if (RF.moduli === null) { void rfCaricaModuli(); return `<div class="page-head"><div><h2 class="page-title">Moduli</h2><div class="page-sub">I moduli dello studio in versione digitale</div></div></div><div class="card"><p class="meta" style="margin:0">Leggo la pagina wiki…</p></div>`; }
  const { moduli, compilazioni } = RF.moduli;
  return `<div class="page-head"><div><h2 class="page-title">Moduli</h2><div class="page-sub">I moduli dello studio in versione digitale: compilabili, stampabili, nel dossier del paziente · ${compilazioni.length} compilazioni</div></div></div>
    <div class="grid grid-main-side">
      <div class="card"><div class="card-head"><span class="section-title">Moduli</span><span class="caption">dalla pagina wiki Piattaforma/Moduli</span></div>
        <div class="list">${moduli.length ? moduli.map(m => `<div class="list-item" style="align-items:flex-start"><div class="grow"><div class="name">${rfEsc(m.codice)} — ${rfEsc(m.titolo)}</div><div class="sub">${rfEsc(m.chi)}${m.quando ? ` · ${rfEsc(m.quando)}` : ''} · ${m.campi.length} campi</div>${m.nota ? `<div class="caption mt-8" style="line-height:1.45">${rfEsc(m.nota)}</div>` : ''}</div><button class="btn sm primary" onclick="rfModuloCompila('${m.id}')">${ICONS.plus} Compila</button></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun modulo nella pagina wiki.</div>'}</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Compilazioni</span><span class="badge count">${compilazioni.length}</span></div>
        <div class="list">${compilazioni.length ? compilazioni.slice(0, 60).map(c => rfModRigaComp(c)).join('') : '<div class="caption" style="padding:8px 6px">Nessuna compilazione: inizia da un modulo a sinistra.</div>'}</div></div>
    </div>`;
};
function rfModCampoHtml(c, v, err) {
  const id = `rf-mod-${c.chiave}`; const val = v == null ? '' : String(v);
  let inp;
  if (c.tipo === 'testo_lungo') inp = `<textarea id="${id}" data-chiave="${c.chiave}">${rfEsc(val)}</textarea>`;
  else if (c.tipo === 'numero') inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" inputmode="decimal" value="${rfEsc(val)}" style="max-width:160px">`;
  else if (c.tipo === 'data') inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" type="date" value="${rfEsc(val)}" style="max-width:180px">`;
  else if (c.tipo === 'si_no') inp = `<div class="rf-mod-sino"><input type="hidden" id="${id}" data-chiave="${c.chiave}" value="${rfEsc(val)}"><button type="button" class="btn sm ${val === 'sì' ? 'active' : ''}" onclick="rfModSiNo('${id}','sì',this)">Sì</button><button type="button" class="btn sm ${val === 'no' ? 'active' : ''}" onclick="rfModSiNo('${id}','no',this)">No</button></div>`;
  else if (c.tipo === 'scelta') inp = `<select class="input" id="${id}" data-chiave="${c.chiave}"><option value="">—</option>${c.opzioni.map(o => `<option ${o === val ? 'selected' : ''}>${rfEsc(o)}</option>`).join('')}</select>`;
  else if (/^apparecchio/i.test(c.etichetta) && RF.data && Array.isArray(RF.data.risorse) && RF.data.risorse.some(r => r.tipo === 'apparecchio')) inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" list="rf-mod-app" value="${rfEsc(val)}"><datalist id="rf-mod-app">${RF.data.risorse.filter(r => r.tipo === 'apparecchio').map(r => `<option value="${rfEsc(r.nome)}">`).join('')}</datalist>`;
  else inp = `<input class="input" id="${id}" data-chiave="${c.chiave}" value="${rfEsc(val)}">`;
  return `<div class="rf-mod-campo"><label for="${id}">${c.n}. ${rfEsc(c.etichetta)}${c.obbligatorio ? ' <b>*</b>' : ''}</label>${inp}${err ? `<div class="err">${rfEsc(err)}</div>` : ''}</div>`;
}
function rfModSiNo(id, v, btn) { const h = document.getElementById(id); if (h) h.value = v; btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn)); }
function rfModRaccogli() { const dati = {}; document.querySelectorAll('#modal [data-chiave]').forEach(el => { dati[el.dataset.chiave] = el.value; }); return dati; }
function rfModPazienti() {
  const lista = ((RF.data && RF.data.patients) || []).filter(p => rfUuid(p.id));
  const mappa = new Map(); const opts = [];
  for (const p of lista) { const et = `${p.last} ${p.first}${p.dob ? ` · ${p.dob}` : ''}`; mappa.set(et, p.id); opts.push(`<option value="${rfEsc(et)}">`); }
  return { mappa, html: `<datalist id="rf-mod-paz-list">${opts.join('')}</datalist>` };
}
function rfModuloCompila(moduloId, pazienteId = null) {
  const m = RF.moduli && RF.moduli.moduli.find(x => x.id === moduloId); if (!m) return;
  const paz = rfModPazienti();
  const pre = pazienteId && P[pazienteId] ? `${P[pazienteId].last} ${P[pazienteId].first}${P[pazienteId].dob ? ` · ${P[pazienteId].dob}` : ''}` : '';
  const corpo = `<div class="caption">${rfEsc(m.chi)}${m.quando ? ` · ${rfEsc(m.quando)}` : ''}</div>
    <div class="rf-mod-campo"><label for="rf-mod-paz">Paziente (dalla cartella; vuoto se il modulo non riguarda un paziente)</label><input class="input" id="rf-mod-paz" list="rf-mod-paz-list" placeholder="Cognome Nome…" value="${rfEsc(pre)}" autocomplete="off">${paz.html}</div>
    <div id="rf-mod-campi">${m.campi.map(c => rfModCampoHtml(c, '', '')).join('')}</div><div class="caption mt-8">* obbligatorio. Si può salvare anche incompleto e finire dopo.</div>`;
  openModal(`${m.codice} — ${m.titolo}`, corpo, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-mod-salva">Salva</button>`);
  document.getElementById('rf-mod-salva').onclick = async () => {
    const et = (document.getElementById('rf-mod-paz').value || '').trim();
    const pid = et ? (paz.mappa.get(et) || null) : null;
    if (et && !pid) { toast('Scegli il paziente dall’elenco della cartella'); return; }
    try {
      const r = await fetch('/api/prototipo/moduli', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo: m.id, patient_id: pid, dati: rfModRaccogli() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.errore || 'Salvataggio non riuscito'); return; }
      const dati = rfModRaccogli();
      if (j.errori && Object.keys(j.errori).length) { document.getElementById('rf-mod-campi').innerHTML = m.campi.map(c => rfModCampoHtml(c, dati[c.chiave], j.errori[c.chiave])).join(''); toast('Salvato incompleto: mancano alcuni campi'); }
      else toast('Modulo salvato');
      closeModal(); void rfCaricaModuli();
    } catch { toast('Piattaforma non raggiungibile'); }
  };
}
async function rfModuloApri(id) {
  let j;
  try { const r = await fetch(`/api/prototipo/moduli/${id}`, { credentials: 'include' }); if (!r.ok) throw 0; j = await r.json(); } catch { toast('Compilazione non trovata'); return; }
  const c = j.compilazione, m = j.modulo;
  const campi = m ? m.campi : Object.keys(c.dati || {}).map((k, i) => ({ chiave: k, n: i + 1, etichetta: k, tipo: 'testo', opzioni: [], obbligatorio: false }));
  const corpo = `<div class="caption">${rfEsc(c.paziente || 'senza paziente')}${c.nascita ? ` · nato/a ${rfEsc(c.nascita)}` : ''} · creato ${rfModQuando(c.created_at)}${c.da ? ` da ${rfEsc(c.da)}` : ''}${c.updated_at !== c.created_at ? ` · modificato ${rfModQuando(c.updated_at)}` : ''}</div>
    ${m ? '' : '<div class="caption mt-8">Il modulo non è più nella pagina wiki: si legge e si stampa, non si modifica.</div>'}
    <div id="rf-mod-campi">${campi.map(x => rfModCampoHtml(x, (c.dati || {})[x.chiave], '')).join('')}</div>
    <details class="mt-16"><summary class="caption">Chi l'ha aperto (${(j.accessi || []).length})</summary><div class="caption" style="line-height:1.6">${(j.accessi || []).map(a => `${rfModQuando(a.at)} · ${rfEsc(a.azione)}${a.da ? ` · ${rfEsc(a.da)}` : ''}`).join('<br>')}</div></details>`;
  openModal(`${c.codice} — ${c.titolo}`, corpo, `<button class="btn" data-close>Chiudi</button><button class="btn" id="rf-mod-stampa">${ICONS.print} Stampa</button>${m ? '<button class="btn primary" id="rf-mod-salva">Salva</button>' : ''}`);
  document.getElementById('rf-mod-stampa').onclick = () => rfModuloStampa(c, campi, rfModRaccogli());
  const salva = document.getElementById('rf-mod-salva');
  if (salva) salva.onclick = async () => {
    try {
      const r = await fetch(`/api/prototipo/moduli/${c.id}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dati: rfModRaccogli() }) });
      const k = await r.json().catch(() => ({}));
      if (!r.ok) { toast(k.errore || 'Salvataggio non riuscito'); return; }
      if (k.errori && Object.keys(k.errori).length) { const dati = rfModRaccogli(); document.getElementById('rf-mod-campi').innerHTML = campi.map(x => rfModCampoHtml(x, dati[x.chiave], k.errori[x.chiave])).join(''); toast('Salvato incompleto: mancano alcuni campi'); return; }
      toast('Modulo salvato'); closeModal(); void rfCaricaModuli();
    } catch { toast('Piattaforma non raggiungibile'); }
  };
}
// I codici di recupero su carta. Prima questo pulsante chiamava window.print()
// e usciva un foglio bianco: la regola di stampa dei moduli nasconde tutto
// quello che non è il foglio nascosto, e i codici non ci sono mai entrati.
function rfStampaCodici() {
  const p = RF.sic; if (!p || !p.codici) return;
  let box = document.getElementById('rf-print'); if (!box) { box = document.createElement('div'); box.id = 'rf-print'; document.body.appendChild(box); }
  const studio = (RF.data && RF.data.utente && RF.data.utente.studio) || 'ReferralFlow';
  const chi = (RF.data && RF.data.utente && RF.data.utente.name) || '';
  box.innerHTML = `<h1>Codici di recupero</h1><div class="meta">${rfEsc(studio)}${chi ? ` · ${rfEsc(chi)}` : ''} · ${rfEsc(new Date().toLocaleDateString('it-CH'))}</div>
    <table>${p.codici.map((c, i) => `<tr><td>${i + 1}.</td><td>${rfEsc(c)}</td></tr>`).join('')}</table>
    <div class="meta" style="margin-top:12pt">Ognuno vale una volta sola. Tienili dove tieni le cose importanti.</div>`;
  document.body.classList.add('rf-stampa');
  const pulisci = () => { document.body.classList.remove('rf-stampa'); box.innerHTML = ''; window.removeEventListener('afterprint', pulisci); };
  window.addEventListener('afterprint', pulisci);
  setTimeout(() => { window.print(); setTimeout(pulisci, 2000); }, 50);
}
function rfModuloStampa(c, campi, dati) {
  let box = document.getElementById('rf-print'); if (!box) { box = document.createElement('div'); box.id = 'rf-print'; document.body.appendChild(box); }
  const studio = (RF.data && RF.data.utente && RF.data.utente.studio) || 'ReferralFlow';
  box.innerHTML = `<h1>${rfEsc(c.codice)} — ${rfEsc(c.titolo)}</h1><div class="meta">${rfEsc(studio)} · ${rfEsc(c.paziente || 'senza paziente')}${c.nascita ? ` · nato/a ${rfEsc(c.nascita)}` : ''} · ${rfModQuando(c.updated_at || c.created_at)}</div>
    <table>${campi.map(x => `<tr><td>${x.n}. ${rfEsc(x.etichetta)}</td><td>${rfEsc(dati[x.chiave] || '')}</td></tr>`).join('')}</table>
    <div class="firma"><span>Data</span><span>Firma</span></div>`;
  fetch(`/api/prototipo/moduli/${c.id}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'stampa' }) }).catch(() => {});
  // Il foglio nascosto resta nel documento finché non si stampa, e va svuotato
  // subito dopo: se no la stampa successiva — anche un Cmd-P qualunque, anche
  // dei codici di recupero — rifà uscire il modulo di quel paziente.
  document.body.classList.add('rf-stampa');
  const pulisci = () => { document.body.classList.remove('rf-stampa'); box.innerHTML = ''; window.removeEventListener('afterprint', pulisci); };
  window.addEventListener('afterprint', pulisci);
  setTimeout(() => { window.print(); setTimeout(pulisci, 2000); }, 50);
}
// Scheda paziente → Documenti: i moduli compilati per questo paziente.
const rfPatientDocsOrig = typeof patientDocs === 'function' ? patientDocs : null;
if (rfPatientDocsOrig) patientDocs = function (p) {
  const base = rfPatientDocsOrig(p);
  if (!RF.live || !rfUuid(p.id)) return base;
  if (RF.moduli === null) { void rfCaricaModuli(); return base; }
  const mie = RF.moduli.compilazioni.filter(c => c.patient_id === p.id);
  const scelta = RF.moduli.moduli.map(m => `<option value="${m.id}">${rfEsc(m.codice)} — ${rfEsc(m.titolo)}</option>`).join('');
  return base + `<div class="card mt-16"><div class="card-head"><span class="section-title">Moduli compilati</span><span class="badge count">${mie.length}</span></div>
    <div class="list">${mie.length ? mie.map(c => rfModRigaComp(c, false)).join('') : '<div class="caption" style="padding:8px 6px">Nessun modulo per questo paziente.</div>'}</div>
    ${scelta ? `<div class="row mt-16" style="gap:8px"><select class="input sm" id="rf-mod-scelta-${p.id}">${scelta}</select><button class="btn sm" onclick="rfModuloCompila(document.getElementById('rf-mod-scelta-${p.id}').value, '${p.id}')">${ICONS.plus} Compila</button></div>` : ''}</div>`;
};

/* ---------- Da fatturare (14.9.2026) ---------- */
// La piattaforma non fattura: mostra le prestazioni erogate del mese e le
// esporta in CSV per il gestionale di fatturazione dello studio, segnando
// che cosa è già uscito. Segreteria e amministratore; il medico non la vede.
if (typeof NAV_META !== 'undefined') NAV_META.fatturazione = ['Da fatturare', 'file'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'org_admin']) { const n = NAV[r]; if (n && !n.includes('fatturazione')) n.splice(n.indexOf('administration'), 0, 'fatturazione'); }
RF.fatt = null;
async function rfCaricaFatt(mese) {
  try {
    const r = await fetch(`/api/prototipo/fatturazione?mese=${encodeURIComponent(mese)}`, { credentials: 'include' });
    const j = r.ok ? await r.json() : { righe: [], riepilogo: {}, esportazioni: [] };
    RF.fatt = { mese, ...j };
  } catch { RF.fatt = { mese, righe: [], riepilogo: {}, esportazioni: [], errore: true }; }
  if (state.route === 'fatturazione') render();
}
async function rfFattEsporta() {
  const mese = state.fattMese; const includi = !!(document.getElementById('rf-fatt-incl') || {}).checked;
  if (RF.fattIn) return; RF.fattIn = true; toast('Preparo il CSV…');
  try {
    const r = await fetch('/api/prototipo/fatturazione', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mese, includi_esportate: includi }) });
    if (r.status === 401) { toast('Sessione scaduta: rientra e riprova'); RF.nonAutorizzato = true; RF.caricato = false; render(); return; }
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.errore || `Esportazione non riuscita (${r.status})`); return; }
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || ''; const m = cd.match(/filename="?([^";]+)"?/);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m ? m[1] : `prestazioni_${mese}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('CSV scaricato: aprilo nel gestionale di fatturazione'); void rfCaricaFatt(mese);
  } catch { toast('Piattaforma non raggiungibile'); } finally { RF.fattIn = false; }
}
PAGES.fatturazione = () => {
  if (!RF.live) return rfPaginaPiattaforma('Da fatturare', 'Prestazioni erogate e loro stato nella Cassa dei Medici');
  const oggi = (RF.data && RF.data.today) || rfOggi();
  if (!state.fattMese) state.fattMese = oggi.slice(0, 7);
  const mese = state.fattMese;
  if (!RF.fatt || RF.fatt.mese !== mese) { void rfCaricaFatt(mese); return `<div class="page-head"><div><h2 class="page-title">Da fatturare</h2><div class="page-sub">Prestazioni erogate e loro stato nella Cassa dei Medici</div></div></div><div class="card"><p class="meta" style="margin:0">Raccolgo le prestazioni del mese…</p></div>`; }
  const f = RF.fatt; const s = f.riepilogo || {}; const righe = f.righe || []; const c = f.controllo || { in_sospeso: [], senza_stato: [], giorni: 7 };
  const sospese = c.in_sospeso || []; const mute = c.senza_stato || [];
  const stat = (v, l, warn = false) => `<div class="card tight stat"><span class="value num">${v ?? 0}</span><span class="label">${l}</span>${warn && v ? '<span class="delta warn">da controllare</span>' : ''}</div>`;
  const etMese = new Date(`${mese}-01T12:00:00`).toLocaleDateString('it-CH', { month: 'long', year: 'numeric' });
  const nomeDi = (r) => `${r.cognome} ${r.nome}`.trim() || '—';
  return `<div class="page-head"><div><h2 class="page-title">Da fatturare</h2><div class="page-sub" style="text-transform:none">${rfEsc(etMese)} · ${righe.length} prestazioni erogate · lo stato arriva dall'agenda della Cassa dei Medici: la fattura la fa MediOnline</div></div>
      <div class="actions"><input type="month" class="input sm" value="${mese}" onchange="state.fattMese=this.value;render()" style="max-width:170px">${f.puo_esportare ? `<label class="caption" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="rf-fatt-incl"> includi già esportate</label><button class="btn primary" onclick="rfFattEsporta()">${ICONS.upload} Esporta CSV</button>` : ''}</div></div>
    ${sospese.length ? `<div class="card mt-16" style="border-left:3px solid var(--warning, #b8860b)"><div class="card-head"><span class="section-title">Rimaste indietro</span><span class="badge count">${sospese.length}</span></div>
      <p class="meta" style="margin:2px 0 10px;line-height:1.5">Fatte da ${c.giorni} giorni o più e in agenda portano ancora la <b>moneta</b>: in MediOnline non sono state ancora passate alla fatturazione.</p>
      <div class="list">${sospese.slice(0, 12).map(r => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(nomeDi(r))} · ${rfEsc(r.prestazione)}</div><div class="sub">${rfEsc(r.data)} ${rfEsc(r.ora)}${r.medico ? ` · ${rfEsc(r.medico)}` : ''}${r.luogo ? ` · ${rfEsc(r.luogo)}` : ''}</div></div></div>`).join('')}${sospese.length > 12 ? `<div class="caption" style="padding:8px 6px">…e altre ${sospese.length - 12}, nella tabella qui sotto.</div>` : ''}</div></div>` : ''}
    <div class="grid grid-5 mt-16">${stat(s.totale, 'Prestazioni nel mese')}${stat(s.fatturate, 'Fatturate')}${stat(s.da_fatturare, 'Ancora da fatturare')}${stat(sospese.length, `Indietro da ${c.giorni} giorni o più`, true)}${stat(s.senza_referto, 'Senza referto confermato', true)}</div>
    <div class="card mt-16"><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Data</th><th>Ora</th><th>Paziente</th><th>Nascita</th><th>Medico</th><th>Prestazione</th><th>Luogo</th><th>Stato in agenda</th><th>Fatta</th><th>Referto</th><th>Esportata</th></tr></thead>
      <tbody>${righe.length ? righe.map(r => `<tr${r.esportato_il ? ' style="opacity:.6"' : ''}><td class="num">${rfEsc(r.data)}</td><td class="num">${rfEsc(r.ora)}</td><td>${rfEsc(nomeDi(r))}${r.in_cartella ? '' : ' <span class="caption">solo agenda</span>'}</td><td class="num">${rfEsc(r.nascita)}</td><td>${rfEsc(r.medico)}</td><td>${rfEsc(r.prestazione)}</td><td>${rfEsc(r.luogo)}</td><td>${rfStatoPill(r.stato)}</td><td>${r.fatta ? '<i class="dot success"></i>' : '<i class="dot"></i>'}</td><td>${r.referto ? '<i class="dot success"></i>' : '<i class="dot warning"></i>'}</td><td class="num">${rfEsc(r.esportato_il || '—')}</td></tr>`).join('') : `<tr><td colspan="11" class="caption">Nessuna prestazione erogata in ${rfEsc(etMese)}${f.errore ? ' (piattaforma non raggiungibile)' : ''}.</td></tr>`}</tbody></table></div></div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="section-title">Come funziona</div><p class="meta" style="margin:6px 0 0;line-height:1.55">Lo studio fattura con la <b>Cassa dei Medici</b> (MediOnline). Nell'agenda ogni appuntamento porta in alto a destra un'icona che ne dice lo stato: la <b>moneta</b> = ancora da fatturare, il <b>visto con la «F»</b> = fatturato, la sedia = arrivato, lo stetoscopio = in corso. Il robot dell'agenda la legge, <b>in sola lettura</b>, insieme al resto: questa pagina confronta ciò che avete fatto con ciò che là risulta fatturato, e segnala le prestazioni rimaste indietro. La piattaforma non scrive mai in MediOnline e non emette fatture. Il CSV (separatore «;», apribile in Excel) porta paziente con AVS e numero assicurato, medico con GLN e RCC, prestazione con la posizione tariffaria: <b>niente testo clinico</b>.${mute.length ? ` <span class="caption">(${mute.length} prestazioni del mese sono più vecchie della lettura dello stato: per quelle l'agenda non dice nulla.)</span>` : ''}</p></div>
      <div class="card"><div class="card-head"><span class="section-title">Esportazioni</span><span class="badge count">${(f.esportazioni || []).length}</span></div><p class="caption" style="margin:0 0 8px">${s.nuove ?? 0} nuove · ${s.esportate ?? 0} già esportate</p><div class="list">${(f.esportazioni || []).length ? f.esportazioni.map(e => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(e.dal)} → ${rfEsc(e.al)} · ${e.righe} righe</div><div class="sub">${rfModQuando(e.at)}${e.da ? ` · ${rfEsc(e.da)}` : ''}</div></div></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessuna esportazione ancora.</div>'}</div></div>
    </div>`;
};

/* Stato dell'appuntamento come lo segna l'agenda della Cassa dei Medici. */
const RF_STATI = {
  bloccato: ['Bloccato', 'muto'],
  fissato: ['Fissato', 'muto'],
  arrivato: ['Arrivato', 'attesa'],
  in_corso: ['In corso', 'attesa'],
  da_fatturare: ['Da fatturare', 'moneta'],
  trattato: ['Trattato', 'fatto'],
  fatturato: ['Fatturato', 'fatto'],
  scusato: ['Scusato', 'muto'],
  annullato: ['Annullato', 'muto'],
};
function rfStatoPill(stato) {
  const v = RF_STATI[stato];
  if (!v) return '<span class="caption">—</span>';
  return `<span class="rf-stato ${v[1]}">${rfEsc(v[0])}</span>`;
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-stato { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11.5px; font-weight:600; white-space:nowrap; border:1px solid var(--border); color:var(--text-2); }
.rf-stato.moneta { border-color:#c9a227; background:rgba(201,162,39,.12); color:#8a6d0b; }
.rf-stato.fatto { border-color:var(--cta, #0d5c48); background:rgba(13,92,72,.10); color:var(--cta, #0d5c48); }
.rf-stato.attesa { border-color:#2b6cb0; background:rgba(43,108,176,.10); color:#2b6cb0; }
.rf-stato.muto { color:var(--text-3); }
`; document.head.appendChild(st); })();

/* ---------- Pazienti: anagrafica completa, nuovo, import CSV, scheda (14.9.2026) ---------- */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-paz-form { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 14px; }
.rf-paz-form .field label { display:block; font-size:12px; font-weight:600; color:var(--text-2); margin-bottom:5px; }
.rf-paz-form .input { width:100%; min-width:0; }
.rf-paz-form .err { font-size:12px; color:var(--danger); margin-top:3px; }
.rf-paz-form .full { grid-column: 1 / -1; }
.rf-imp-area { width:100%; min-height:120px; padding:10px 12px; border-radius:var(--r-input); border:1px solid var(--border); background:var(--surface); font:12.5px/1.45 var(--font-mono, monospace); resize:vertical; }
.rf-imp-tab td { font-size:12.5px; }
.rf-imp-tab tr.errore td { color: var(--danger); }
.rf-imp-tab tr.esiste td, .rf-imp-tab tr.doppione td { color: var(--text-3); }
.rf-terapia li { padding:5px 0; border-top:1px solid var(--border); font-size:13px; }
.rf-terapia li:first-child { border-top:0; }
@media (max-width: 767px) { .rf-paz-form { grid-template-columns: 1fr; } }
`; document.head.appendChild(st); })();
const RF_SESSO = { F: 'F', M: 'M' };
function rfPazCampo(id, label, val, opts = {}) {
  const inp = opts.select ? `<select class="input" id="${id}">${opts.select.map(o => `<option value="${rfEsc(o[0])}" ${String(val) === o[0] ? 'selected' : ''}>${rfEsc(o[1])}</option>`).join('')}</select>`
    : `<input class="input" id="${id}" type="${opts.type || 'text'}" value="${rfEsc(val || '')}" ${opts.list ? `list="${opts.list}"` : ''} ${opts.ph ? `placeholder="${rfEsc(opts.ph)}"` : ''} autocomplete="off">`;
  return `<div class="field ${opts.full ? 'full' : ''}"><label for="${id}">${label}${opts.obbl ? ' <b style="color:var(--danger)">*</b>' : ''}</label>${inp}<div class="err" id="${id}-err"></div></div>`;
}
function rfPazForm(p) {
  const perc = (RF.percorsi || []);
  if (RF.percorsi === null) void rfCaricaPercorsi();
  const nomePerc = perc.find(x => x.id === (p && p.percorso))?.nome || (p && p.percorso) || '';
  return `<div class="rf-paz-form">
    ${rfPazCampo('rf-pz-cognome', 'Cognome', p && p.last, { obbl: true })}${rfPazCampo('rf-pz-nome', 'Nome', p && p.first, { obbl: true })}
    ${rfPazCampo('rf-pz-nascita', 'Data di nascita', p && p.dobIso, { type: 'date' })}${rfPazCampo('rf-pz-sesso', 'Sesso', p && p.sex, { select: [['', '—'], ['F', 'F'], ['M', 'M']] })}
    ${rfPazCampo('rf-pz-telefono', 'Telefono', p && p.phone, { type: 'tel' })}${rfPazCampo('rf-pz-email', 'E-mail', p && p.email, { type: 'email' })}
    ${rfPazCampo('rf-pz-via', 'Via', p && p.via, { full: true })}${rfPazCampo('rf-pz-npa', 'NPA', p && p.npa, { ph: '6900' })}${rfPazCampo('rf-pz-localita', 'Località', p && p.localita)}
    ${rfPazCampo('rf-pz-avs', 'Numero AVS', p && p.avs, { ph: '756.1234.5678.97' })}${rfPazCampo('rf-pz-cassa', 'Cassa malati', p && p.assicurazione)}${rfPazCampo('rf-pz-assicurato', 'Numero assicurato (tessera)', p && p.n_assicurato)}
    ${rfPazCampo('rf-pz-indicazione', 'Indicazione clinica', p && p.indicazione, { ph: 'es. fibrillazione atriale' })}${rfPazCampo('rf-pz-percorso', 'Percorso', nomePerc, { list: 'rf-pz-perc-list', ph: 'dalla pagina Percorsi' })}
    <datalist id="rf-pz-perc-list">${perc.map(x => `<option value="${rfEsc(x.nome)}">`).join('')}</datalist>
  </div>`;
}
function rfPazRaccogli() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  const perc = (RF.percorsi || []).find(x => x.nome === v('rf-pz-percorso'));
  return { cognome: v('rf-pz-cognome'), nome: v('rf-pz-nome'), data_nascita: v('rf-pz-nascita'), sesso: v('rf-pz-sesso'), telefono: v('rf-pz-telefono'), email: v('rf-pz-email'), via: v('rf-pz-via'), npa: v('rf-pz-npa'), localita: v('rf-pz-localita'), avs: v('rf-pz-avs'), assicurazione: v('rf-pz-cassa'), n_assicurato: v('rf-pz-assicurato'), indicazione: v('rf-pz-indicazione'), percorso_id: perc ? perc.id : v('rf-pz-percorso') };
}
function rfPazErrori(errori) {
  const mappa = { cognome: 'rf-pz-cognome', nome: 'rf-pz-nome', data_nascita: 'rf-pz-nascita', sesso: 'rf-pz-sesso', email: 'rf-pz-email', npa: 'rf-pz-npa', avs: 'rf-pz-avs' };
  document.querySelectorAll('#modal .rf-paz-form .err').forEach(e => e.textContent = '');
  for (const [k, m] of Object.entries(errori || {})) { const e = document.getElementById(`${mappa[k] || ''}-err`); if (e) e.textContent = m; }
}
/* «Crea cartella» dall'agenda (22.9.2026): il server propone cognome, nome e
   nascita leggendo il titolo dell'appuntamento; chi salva conferma o corregge.
   Alla creazione la cartella si prende da sola i suoi appuntamenti e referti. */
async function rfCartellaDaAgenda(titolo) {
  let prop = { cognome: '', nome: '', data_nascita: '' };
  try {
    const r = await fetch('/api/prototipo/pazienti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'proponi', titolo }) });
    if (r.ok) prop = (await r.json()).proposta || prop;
  } catch { /* si compila a mano */ }
  openModal('Crea la cartella', `<p class="meta" style="margin:0 0 10px;line-height:1.5">Proposta letta dall'agenda: <b>controlla cognome e nome</b> prima di salvare. La cartella si collega da sola ai suoi appuntamenti e ai referti confermati con lo stesso nome (e la stessa data di nascita, se c'è).</p>${rfPazForm({ last: prop.cognome, first: prop.nome, dobIso: prop.data_nascita })}`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pz-ok">Crea la cartella</button>`);
  document.getElementById('rf-pz-ok').onclick = () => rfPazienteSalva(null);
}
async function rfPazienteSalva(id) {
  const corpo = Object.assign({ azione: id ? 'aggiorna' : 'crea', id }, rfPazRaccogli());
  try {
    const r = await fetch('/api/prototipo/pazienti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 400 && j.errori) { rfPazErrori(j.errori); toast('Controlla i campi segnati'); return; }
    if (!r.ok) { toast(j.errore || 'Salvataggio non riuscito'); return; }
    const ab = j.abbinati || {};
    const collegati = (ab.appuntamenti || ab.referti) ? ` · collegati ${ab.appuntamenti || 0} appuntament${ab.appuntamenti === 1 ? 'o' : 'i'} e ${ab.referti || 0} refert${ab.referti === 1 ? 'o' : 'i'}` : '';
    closeModal(); toast((id ? 'Anagrafica salvata' : 'Paziente creato') + collegati);
    await rfCaricaDati();
    if (!id && j.id) go(`#/patients/${j.id}`);
  } catch { toast('Piattaforma non raggiungibile'); }
}
function rfPazienteModifica(id) {
  const p = id ? P[id] : null;
  openModal(p ? 'Anagrafica' : 'Nuovo paziente', rfPazForm(p), `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pz-ok">Salva</button>`);
  document.getElementById('rf-pz-ok').onclick = () => rfPazienteSalva(p ? p.id : null);
}
function rfPazientiImporta() {
  openModal('Importa pazienti da CSV', `<p class="meta" style="margin:0 0 10px;line-height:1.5">Prima riga = intestazione: <code>cognome; nome; data di nascita; telefono; e-mail; via; npa; località; avs; cassa; n. assicurato; sesso</code> (bastano cognome e nome; l'ordine non conta; separatore ; , o tabulazione; date 31.12.1950). Le righe già in cartella (stesso cognome, nome e nascita) non si duplicano.</p>
    <input type="file" id="rf-imp-file" accept=".csv,.txt,text/csv" class="mb-16"><textarea class="rf-imp-area" id="rf-imp-testo" placeholder="oppure incolla qui il CSV…"></textarea>
    <div id="rf-imp-esito" class="mt-16"></div>`, `<button class="btn" data-close>Chiudi</button><button class="btn" id="rf-imp-anteprima">Anteprima</button><button class="btn primary" id="rf-imp-conferma" disabled>Importa</button>`);
  const file = document.getElementById('rf-imp-file'); file.onchange = () => { const f = file.files && file.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { document.getElementById('rf-imp-testo').value = String(rd.result || ''); }; rd.readAsText(f); };
  const manda = async (azione) => {
    const csv = document.getElementById('rf-imp-testo').value; if (!csv.trim()) { toast('Incolla o carica un CSV'); return null; }
    const r = await fetch('/api/prototipo/pazienti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione, csv }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.errore || 'Lettura non riuscita'); return null; } return j;
  };
  document.getElementById('rf-imp-anteprima').onclick = async () => {
    const j = await manda('importa'); if (!j) return;
    const et = { nuovo: 'nuovo', esiste: 'già in cartella', errore: 'errore', doppione: 'doppione nel file' };
    document.getElementById('rf-imp-esito').innerHTML = `<div class="row wrap" style="gap:6px"><span class="badge success">${j.riepilogo.nuovi} nuovi</span><span class="badge">${j.riepilogo.esistenti} già in cartella</span>${j.riepilogo.errori ? `<span class="badge danger">${j.riepilogo.errori} con errori</span>` : ''}${j.riepilogo.doppioni ? `<span class="badge warning">${j.riepilogo.doppioni} doppioni</span>` : ''}${j.ignorate.length ? `<span class="caption">colonne ignorate: ${rfEsc(j.ignorate.join(', '))}</span>` : ''}</div>
      <div class="table-wrap mt-8" style="max-height:260px;box-shadow:none"><table class="dense rf-imp-tab"><thead><tr><th>#</th><th>Cognome</th><th>Nome</th><th>Nascita</th><th>AVS</th><th>Esito</th></tr></thead><tbody>${j.righe.map(r => `<tr class="${r.stato}"><td class="num">${r.n}</td><td>${rfEsc(r.dati.cognome)}</td><td>${rfEsc(r.dati.nome)}</td><td class="num">${rfEsc(r.dati.data_nascita || '')}</td><td class="num">${rfEsc(r.dati.avs || '')}</td><td>${et[r.stato]}${r.stato === 'errore' ? ': ' + rfEsc(Object.values(r.errori).join(' ')) : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const b = document.getElementById('rf-imp-conferma'); b.disabled = !j.riepilogo.nuovi; b.textContent = `Importa ${j.riepilogo.nuovi} nuovi`;
  };
  document.getElementById('rf-imp-conferma').onclick = async () => { const j = await manda('importa_conferma'); if (!j) return; toast(`${j.inseriti} pazienti importati`); closeModal(); void rfCaricaDati(); };
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'rf-paz-q') return;
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('tr[data-paz]').forEach((tr) => { const ok = !q || tr.getAttribute('data-paz').includes(q); tr.hidden = !ok; if (ok) n++; });
  const c = document.getElementById('rf-paz-n'); if (c) c.textContent = `${n} ${n === 1 ? 'paziente' : 'pazienti'}`;
});
const rfPatientsOrig = PAGES.patients;
PAGES.patients = () => {
  if (!RF.live) return rfPatientsOrig();
  const inCartella = PATIENTS.filter(p => rfUuid(p.id));
  const soloAgenda = PATIENTS.length - inCartella.length;
  const riga = (p) => `<tr data-go="#/patients/${p.id}" data-paz="${rfEsc(`${p.last} ${p.first} ${p.avs || ''} ${p.phone || ''} ${p.email || ''} ${p.indicazione || ''}`.toLowerCase())}"><td><div class="row"><div class="avatar-sm">${initials(p)}</div><b>${rfEsc(fullName(p))}</b>${rfUuid(p.id) ? '' : ' <span class="caption">solo agenda</span>'}</div></td><td class="num">${p.dob ? `${p.dob} <span class="caption">(${p.age})</span>` : '—'}</td><td class="num">${rfEsc(p.avs || '—')}</td><td class="num">${rfEsc(p.phone || '—')}</td><td>${rfEsc(p.assicurazione || '—')}</td><td>${rfEsc(p.indicazione || '—')}</td><td class="num">${p.lastVisit || '—'}</td><td class="num">${p.next || '—'}</td><td><div class="row">${p.docs.some(d => d.new) ? '<span class="badge accent">Doc. nuovi</span>' : ''}${TASKS.some(t => t.p === p.id && t.status !== 'DONE') ? '<span class="badge">Task</span>' : ''}${p.flags.length ? `<span class="badge warning">${rfEsc(p.flags[0])}</span>` : ''}</div></td></tr>`;
  return `
    <div class="page-head"><div><h2 class="page-title">Pazienti</h2><div class="page-sub"><span id="rf-paz-n">${inCartella.length} in cartella</span>${soloAgenda ? ` · ${soloAgenda} solo in agenda` : ''}</div></div>
      <div class="actions"><button class="btn" onclick="rfPazientiImporta()">${ICONS.upload} Importa CSV</button><button class="btn primary" onclick="rfPazienteModifica(null)">${ICONS.plus} Nuovo paziente</button></div></div>
    <div class="toolbar"><input class="input" id="rf-paz-q" placeholder="Cerca cognome, nome, AVS, telefono, e-mail, indicazione…" autocomplete="off" style="min-width:320px"><button class="btn ai" data-ai="Pazienti con richiamo scaduto">${ICONS.ai} Chiedi a Cleo</button></div>
    <div class="table-wrap"><table><thead><tr><th>Paziente</th><th>Nascita</th><th>AVS</th><th>Telefono</th><th>Cassa</th><th>Indicazione</th><th>Ultima visita</th><th>Prossimo</th><th>Indicatori</th></tr></thead><tbody>
      ${PATIENTS.length ? [...inCartella, ...PATIENTS.filter(p => !rfUuid(p.id))].map(riga).join('') : '<tr><td colspan="9" class="caption">Nessun paziente in cartella: «Nuovo paziente» o «Importa CSV».</td></tr>'}
    </tbody></table></div>`;
};
// Scheda paziente → Overview: tessere, terapia derivata dai referti, fatti del grafo.
const rfOverviewOrig = typeof patientOverview === 'function' ? patientOverview : null;
if (rfOverviewOrig) patientOverview = function (p, clinical) {
  if (!RF.live || !rfUuid(p.id)) return rfOverviewOrig(p, clinical);
  const perc = (RF.percorsi || []).find(x => x.id === p.percorso);
  if (RF.percorsi === null) void rfCaricaPercorsi();
  const visiteFatte = (p.visits || []).filter(v => v.fatta).length;
  const referti = RF.queue.filter(r => r.p === p.id);
  const confermati = referti.filter(r => r.status === 'APPROVED').length;
  const fcMax = p.age ? 220 - Number(p.age) : null;
  const tile = (l, v, s, go) => `<div class="card tight stat ${go ? 'clickable' : ''}" ${go ? `data-go="${go}"` : ''}><span class="label">${l}</span><span class="value" style="font-size:${String(v).length > 12 ? 15 : 24}px;line-height:1.2">${v}</span>${s ? `<span class="delta">${s}</span>` : ''}</div>`;
  return `<div class="grid grid-4">
      ${tile('Indicazione', rfEsc(p.indicazione || '—'), perc ? `percorso: ${rfEsc(perc.nome)}` : (p.percorso ? rfEsc(p.percorso) : ''), '#/percorsi')}
      ${tile('Visite fatte', visiteFatte, p.lastVisit ? `ultima ${p.lastVisit}` : 'dall\'agenda')}
      ${tile('Referti confermati', confermati, referti.length - confermati ? `${referti.length - confermati} in lavorazione` : '', '#/reports')}
      ${tile('Cassa malati', rfEsc(p.assicurazione || '—'), p.n_assicurato ? `n. ${rfEsc(p.n_assicurato)}` : (p.avs ? `AVS ${rfEsc(p.avs)}` : ''))}
    </div>
    <div class="grid grid-main-side mt-16">
      <div class="stack">
        ${clinical ? `<div class="card"><div class="card-head"><span class="section-title">Terapia in corso</span><span class="caption">${p.terapia.length ? `dall'ultimo referto confermato${p.terapiaDa ? ` del ${p.terapiaDa}` : ''}` : 'nessun referto confermato con terapia'}</span></div>
          ${p.terapia.length ? `<ul class="rf-terapia" style="list-style:none;margin:0;padding:0">${p.terapia.map(r => `<li>${rfEsc(r)}</li>`).join('')}</ul>` : '<div class="caption">La terapia si ricava dal blocco «Terapia» del referto confermato: niente da ridigitare.</div>'}</div>` : ''}
        <div class="card"><div class="card-head"><span class="section-title">Quesiti e referral</span><span class="badge count">${p.problems.length}</span></div><div class="list">${p.problems.map(x => `<div class="list-item"><i class="dot ${x.s === 'resolved' ? '' : 'accent'}"></i><div class="grow"><div class="name" style="font-size:13px">${rfEsc(x.l)}</div><div class="sub">${x.s === 'resolved' ? 'chiusa' : 'aperta'} · ${x.since}</div></div></div>`).join('') || '<div class="caption">Nessuna referral</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Esami recenti</span><button class="btn sm ghost" data-go="#/patients/${p.id}/exams">Tutti ${ICONS.chevR}</button></div><div class="list">${p.exams.slice(0, 6).map(e => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(e.t)}</div><div class="sub">${e.d} · ${rfEsc(e.r)}</div></div></div>`).join('') || '<div class="caption">Nessun esame in cartella</div>'}</div></div>
        ${p.fatti && p.fatti.length ? `<div class="card"><div class="card-head"><span class="section-title">Fatti registrati</span><span class="caption">dal grafo della piattaforma</span></div><div class="list">${p.fatti.map(f => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(f.oggetto)}</div><div class="sub">${rfEsc(f.relazione.replace(/_/g, ' '))}${f.data ? ` · ${f.data}` : ''} · ${rfEsc(f.fonte)}</div></div></div>`).join('')}</div></div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><span class="section-title">Prossimo appuntamento</span></div><div style="font-size:18px;font-weight:600">${p.next || '—'}</div><div class="meta">${(p.visits || []).filter(v => v.futura)[0] ? rfEsc((p.visits || []).filter(v => v.futura)[0].motivo || '') : 'nessuno in agenda'}</div></div>
        ${fcMax ? `<div class="card"><div class="card-head"><span class="section-title">FC massimale teorica</span></div><div class="num" style="font-size:18px;font-weight:600">${fcMax} bpm</div><div class="meta">220 − età · 85 % = ${Math.round(fcMax * 0.85)} bpm</div></div>` : ''}
        <div class="card"><div class="card-head"><span class="section-title">Attività aperte</span></div><div class="list">${TASKS.filter(t => t.p === p.id && t.status !== 'DONE').map(t => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(t.title)}</div><div class="sub">${rfEsc(t.due)}</div></div><a class="btn sm" href="${t.href}">Apri</a></div>`).join('') || '<div class="caption">Nessuna</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Anagrafica</span><button class="btn sm ghost" onclick="rfPazienteModifica('${p.id}')">Modifica</button></div><div class="kv"><b>Nascita</b><span>${p.dob || '—'}${p.sex ? ` · ${p.sex}` : ''}</span><b>Telefono</b><span>${rfEsc(p.phone || '—')}</span><b>E-mail</b><span>${rfEsc(p.email || '—')}</span><b>Indirizzo</b><span>${rfEsc([p.via, [p.npa, p.localita].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—')}</span><b>Medico inviante</b><span>${rfEsc(p.gp || '—')}</span></div></div>
      </div>
    </div>`;
};

/* ---------- Prestazioni: tutti gli appuntamenti con filtri (14.9.2026) ---------- */
if (typeof NAV_META !== 'undefined') NAV_META.prestazioni = ['Prestazioni', 'activity'];
document.addEventListener('change', (e) => { if (e.target && e.target.id && e.target.id.startsWith('rf-pf-')) { state.prestFiltri = state.prestFiltri || {}; state.prestFiltri[e.target.id.slice(6)] = e.target.value; render(); } });
PAGES.prestazioni = () => {
  if (!RF.live) return rfPaginaPiattaforma('Prestazioni', 'Tutte le prestazioni a calendario');
  const f = state.prestFiltri || {};
  const oggi = (RF.data && RF.data.today) || rfOggi();
  const tutte = (RF.agenda || []).slice().sort((a, b) => (b.d + b.start).localeCompare(a.d + a.start));
  const settimana = (() => { const d = new Date(`${oggi}T12:00:00`); const a = new Date(d); a.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const b = new Date(a); b.setDate(a.getDate() + 6); return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)]; })();
  const periodo = f.periodo || 'settimana';
  const inPeriodo = (a) => periodo === 'oggi' ? a.d === oggi : periodo === 'settimana' ? (a.d >= settimana[0] && a.d <= settimana[1]) : periodo === 'mese' ? a.d.slice(0, 7) === oggi.slice(0, 7) : true;
  const statoDi = (a) => a.status === 'COMPLETED' ? 'completata' : a.status === 'CANCELLED' ? 'annullata' : (a.d < oggi || (a.d === oggi && a.late)) ? 'passata' : 'programmata';
  const lista = tutte.filter(a => inPeriodo(a) && (!f.tipo || a.tipoPrest === f.tipo) && (!f.stato || statoDi(a) === f.stato) && (!f.sala || (a.room || '') === f.sala) && (!f.medico || a.doc === f.medico));
  const sale = [...new Set(tutte.map(a => a.room).filter(Boolean))].sort();
  const medici = [...new Set(tutte.map(a => a.doc).filter(d => d && d !== 'studio'))];
  const ET = { visita: 'Visita', esame: 'Esame', procedura: 'Procedura' }; const ES = { completata: 'success', annullata: '', passata: 'warning', programmata: 'accent' };
  const conta = (t) => lista.filter(a => a.tipoPrest === t).length;
  const sel = (id, val, opts, primo) => `<select class="input sm" id="rf-pf-${id}"><option value="">${primo}</option>${opts.map(o => `<option value="${rfEsc(o[0])}" ${val === o[0] ? 'selected' : ''}>${rfEsc(o[1])}</option>`).join('')}</select>`;
  // Nel riquadro solo il nome: data di nascita, numero paziente e sigla
  // dell'agenda stanno nella scheda che si apre cliccando, non addosso al
  // riquadro dove non ci stanno e coprono tutto.
  const nomeDi = (a) => (a.p && P[a.p]) ? fullName(P[a.p]) : (a.nomeBreve || a.nome || 'Paziente');
  return `<div class="page-head"><div><div class="eyebrow">Attività clinica</div><h2 class="page-title">Prestazioni</h2><div class="page-sub">${lista.length} nel periodo · ${conta('visita')} visite · ${conta('esame')} esami · ${conta('procedura')} procedure · dall'agenda MediOnline (±30 giorni)</div></div>
      <div class="actions"><button class="btn" data-go="#/administration">${ICONS.settings} Catalogo</button></div></div>
    <div class="toolbar">${sel('periodo', periodo, [['oggi', 'Oggi'], ['settimana', 'Questa settimana'], ['mese', 'Questo mese'], ['tutto', 'Tutto (±30 gg)']], 'Periodo')}${sel('tipo', f.tipo || '', [['visita', 'Visite'], ['esame', 'Esami'], ['procedura', 'Procedure']], 'Tutti i tipi')}${sel('stato', f.stato || '', [['programmata', 'Programmate'], ['passata', 'Passate, non segnate'], ['completata', 'Completate'], ['annullata', 'Annullate']], 'Tutti gli stati')}${sale.length ? sel('sala', f.sala || '', sale.map(x => [x, x]), 'Tutte le sale') : ''}${medici.length ? sel('medico', f.medico || '', medici.map(m => [m, DOCTORS[m] || m]), 'Tutti i medici') : ''}</div>
    <div class="card"><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Data</th><th>Ora</th><th>Paziente</th><th>Prestazione</th><th>Tipo</th><th>Medico</th><th>Sala</th><th>Durata</th><th>Stato</th></tr></thead><tbody>
      ${lista.length ? lista.slice(0, 400).map(a => { const st = statoDi(a); return `<tr ${a.p ? `data-go="#/patients/${a.p}"` : ''}><td class="num">${rfEsc(a.d.split('-').reverse().join('.'))}</td><td class="num">${a.start}</td><td><b>${rfEsc(nomeDi(a))}</b></td><td>${rfEsc(a.prestazione || a.reason || '')}${a.prestazione && a.reason && a.prestazione !== a.reason ? `<div class="caption">${rfEsc(a.reason)}</div>` : ''}</td><td><span class="badge">${ET[a.tipoPrest] || '—'}</span></td><td>${rfEsc(DOCTORS[a.doc] || '—')}</td><td>${rfEsc(a.room || '—')}</td><td class="num">${a.dur}'</td><td><span class="badge ${ES[st]}">${st}</span></td></tr>`; }).join('') : '<tr><td colspan="9" class="caption">Nessuna prestazione con questi filtri.</td></tr>'}
    </tbody></table></div>${lista.length > 400 ? '<div class="caption mt-8">Mostrate le prime 400: restringi il periodo.</div>' : ''}</div>
    ${!(RF.data && RF.data.catalogo && RF.data.catalogo.length) ? `<div class="card mt-16" style="border-left:3px solid var(--warning)"><p class="meta" style="margin:0;line-height:1.55"><b>Catalogo vuoto</b>: il tipo è stimato dal testo dell'agenda. In Studio → Prestazioni si crea il catalogo (anche in un clic dalle prestazioni dei percorsi) e si scrivono le parole chiave con cui ogni voce compare in agenda.</p></div>` : ''}`;
};

/* ---------- Chiamate di preparazione e Medici invianti (14.9.2026) ---------- */
async function rfChiamata(appointmentId, patientId) {
  const sel = document.getElementById(`rf-ch-${appointmentId}`); const esito = sel ? sel.value : 'raggiunto';
  try {
    const r = await fetch('/api/prototipo/chiamate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_id: appointmentId, patient_id: rfUuid(patientId) ? patientId : null, esito }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.errore || 'Non registrata'); return; }
    toast('Chiamata registrata'); void rfCaricaDati();
  } catch { toast('Piattaforma non raggiungibile'); }
}
if (typeof NAV_META !== 'undefined') NAV_META.invianti = ['Medici invianti', 'users'];
RF.invianti = null;
async function rfCaricaInvianti() {
  try { const r = await fetch('/api/prototipo/invianti', { credentials: 'include' }); const j = r.ok ? await r.json() : {}; RF.invianti = { lista: Array.isArray(j.invianti) ? j.invianti : [], referral_12m: j.referral_12m || 0 }; }
  catch { RF.invianti = { lista: [], referral_12m: 0 }; }
  if (state.route === 'invianti') render();
}
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id !== 'rf-inv-q') return;
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('tr[data-inv]').forEach((tr) => { const ok = !q || tr.getAttribute('data-inv').includes(q); tr.hidden = !ok; if (ok) n++; });
  const c = document.getElementById('rf-inv-n'); if (c) c.textContent = `${n} invianti`;
});
function rfInvianteApri(id) {
  const d = (RF.invianti && RF.invianti.lista.find(x => x.id === id)); if (!d) return;
  const ST = { ricevuta: 'ricevuta', triage: 'triage', da_prenotare: 'da prenotare', prenotata: 'prenotata', vista: 'vista', chiusa: 'chiusa' };
  openSheet(rfEsc(d.nome), `<div class="kv"><b>Studio</b><span>${rfEsc(d.studio || '—')}</span><b>Telefono</b><span>${rfEsc(d.telefono || '—')}</span><b>E-mail</b><span>${rfEsc(d.email || '—')}</span><b>HIN</b><span>${rfEsc(d.hin || '—')}</span><b>Referral</b><span>${d.n_12m} negli ultimi 12 mesi · ${d.n_tot} in totale${d.ultimo ? ` · ultima ${d.ultimo}` : ''}</span></div>
    <div class="section-title mt-16">Ultime referral</div><div class="list">${(d.referral || []).map(r => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${rfEsc(r.paziente)}</div><div class="sub">${r.data} · ${ST[r.stato] || r.stato}${r.quesito ? ` · ${rfEsc(r.quesito)}` : ''}</div></div><a class="btn sm" href="/referral/${r.id}">Apri</a></div>`).join('') || '<div class="caption">Nessuna referral.</div>'}</div>`);
}
function rfInvianteNuovo() {
  openModal('Nuovo medico inviante', `<div class="field"><label>Nome (Dr. med. …)</label><input class="input" id="rf-inv-nome"></div><div class="field mt-8"><label>Studio</label><input class="input" id="rf-inv-studio"></div><div class="grid grid-2 mt-8"><div class="field"><label>Telefono</label><input class="input" id="rf-inv-tel"></div><div class="field"><label>E-mail</label><input class="input" id="rf-inv-email" type="email"></div></div>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-inv-ok">Aggiungi</button>`);
  document.getElementById('rf-inv-ok').onclick = async () => {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    try { const r = await fetch('/api/prototipo/invianti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: v('rf-inv-nome'), studio: v('rf-inv-studio'), telefono: v('rf-inv-tel'), email: v('rf-inv-email') }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.errore || 'Non salvato'); return; } closeModal(); toast('Inviante aggiunto'); void rfCaricaInvianti(); } catch { toast('Piattaforma non raggiungibile'); }
  };
}
PAGES.invianti = () => {
  if (!RF.live) return rfPaginaPiattaforma('Medici invianti', 'Chi manda i pazienti allo studio');
  if (RF.invianti === null) { void rfCaricaInvianti(); return `<div class="page-head"><div><h2 class="page-title">Medici invianti</h2></div></div><div class="card"><p class="meta" style="margin:0">Carico…</p></div>`; }
  const lista = RF.invianti.lista;
  return `<div class="page-head"><div><div class="eyebrow">${rfEsc((RF.data.utente || {}).studio || '')}</div><h2 class="page-title">Medici invianti</h2><div class="page-sub"><span id="rf-inv-n">${lista.length} invianti</span> · ${RF.invianti.referral_12m} referral negli ultimi 12 mesi</div></div>
      <div class="actions"><input class="input" id="rf-inv-q" placeholder="Cerca nome, studio, città…" autocomplete="off"><button class="btn primary" onclick="rfInvianteNuovo()">${ICONS.plus} Nuovo inviante</button></div></div>
    <div class="card"><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Medico</th><th>Studio</th><th>Telefono</th><th>E-mail</th><th class="num">Referral 12 mesi</th><th class="num">Totale</th><th>Ultima</th></tr></thead><tbody>
      ${lista.length ? lista.map(d => `<tr data-inv="${rfEsc(`${d.nome} ${d.studio || ''} ${d.email || ''}`.toLowerCase())}" onclick="rfInvianteApri('${d.id}')" style="cursor:pointer"><td><b>${rfEsc(d.nome)}</b></td><td>${rfEsc(d.studio || '—')}</td><td class="num">${rfEsc(d.telefono || '—')}</td><td>${rfEsc(d.email || '—')}</td><td class="num"><b>${d.n_12m}</b></td><td class="num">${d.n_tot}</td><td class="num">${d.ultimo || '—'}</td></tr>`).join('') : '<tr><td colspan="7" class="caption">Nessun medico inviante: si aggiungono qui o arrivano da soli con la prima referral.</td></tr>'}
    </tbody></table></div></div>`;
};

/* ---------- Suggerisci una modifica (14.9.2026) ---------- */
RF.sugg = null;
async function rfCaricaSuggerimenti() {
  try { const r = await fetch('/api/prototipo/suggerimenti', { credentials: 'include' }); const j = r.ok ? await r.json() : {}; RF.sugg = Array.isArray(j.suggerimenti) ? j.suggerimenti : []; } catch { RF.sugg = []; }
  if (state.route === 'administration') render();
}
function rfSuggerisci() {
  const pagina = (NAV_META[state.route] || [state.route])[0];
  openModal('Suggerisci una modifica', `<p class="meta" style="margin:0 0 10px;line-height:1.5">Un campo che manca, una schermata da semplificare, una parola che da voi si dice in un altro modo. La richiesta resta nella piattaforma (Studio → Suggerimenti); lo sviluppatore riceve un avviso e la vede lì. <b>Non scrivere nomi di pazienti né dati clinici.</b></p><div class="caption">Pagina: ${rfEsc(pagina)}</div><textarea class="rf-imp-area mt-8" id="rf-sug-testo" placeholder="Vorrei che…" style="font-family:var(--font);min-height:110px"></textarea>`, `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-sug-ok">Invia</button>`);
  document.getElementById('rf-sug-ok').onclick = async () => {
    const testo = (document.getElementById('rf-sug-testo').value || '').trim();
    try { const r = await fetch('/api/prototipo/suggerimenti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'crea', pagina, testo }) }); const j = await r.json().catch(() => ({})); if (!r.ok) { toast(j.errore || 'Non inviato'); return; } closeModal(); toast('Grazie: suggerimento registrato'); RF.sugg = null; } catch { toast('Piattaforma non raggiungibile'); }
  };
}
async function rfSuggStato(id, stato) {
  const risposta = stato === 'no' ? (prompt('Una riga di risposta (facoltativa):') || '') : '';
  try { const r = await fetch('/api/prototipo/suggerimenti', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'stato', id, stato, risposta }) }); if (!r.ok) { toast('Non aggiornato'); return; } toast('Aggiornato'); RF.sugg = null; render(); } catch { toast('Piattaforma non raggiungibile'); }
}

/* ---------- pagine senza backing vero → alla piattaforma ---------- */
function rfPaginaPiattaforma(titolo, testo) {
  return `<div class="page-head"><div><h2 class="page-title">${titolo}</h2><div class="page-sub">${testo}</div></div></div>
    <div class="card"><p class="meta" style="margin:0;line-height:1.55">Questa sezione non è ancora disponibile in questa interfaccia.</p></div>`;
}
const rfOrig = {};
for (const [k, titolo, testo, href] of [

  ['system', 'Sistema', 'Utenti, sicurezza, modelli', '/impostazioni/utenti'],
  ['communications', 'Comunicazioni', 'Telefonate ed e-mail', '/comunicazioni'],
  ['visits', 'Visite', 'Visite registrate', '/visite'],
  ['knowledge', 'Knowledge', 'La conoscenza degli agenti sta nella wiki', '/referti/qualita'],
]) {
  rfOrig[k] = PAGES[k];
  PAGES[k] = () => (RF.live ? rfPaginaPiattaforma(titolo, testo) : rfOrig[k] ? rfOrig[k]() : '');
}
// Pagina AI (14.9.2026, richiesta utente): la STESSA conversazione del pannello
// laterale, a tutto schermo. Stesso `state.aiMessages`, stesso `askAI` (codice
// che decide, procedure con traccia, modello locale per la sintesi): non è una
// seconda chat. Quando si è su questa pagina il pannello laterale resta chiuso.
const RF_AI_NOME = 'Cleo';
(function () { const st = document.createElement('style'); st.textContent = `
.rf-aip { display:flex; flex-direction:column; height: calc(100vh - var(--topbar-h) - 150px); min-height: 420px; }
.rf-aip .ai-body { flex:1; overflow:auto; padding: 18px 22px; gap: 14px; }
.rf-aip .ai-msg { font-size: 14px; line-height: 1.55; max-width: 780px; }
.rf-aip .ai-msg.user { max-width: 70%; }
.rf-aip .ai-input { padding: 12px 18px; }
.rf-aip .ai-input input { height: 42px; font-size: 14px; }
.rf-aip-chips { display:flex; flex-wrap:wrap; gap:6px; padding: 0 22px 12px; }
/* Cleo a tutto schermo: la pagina esce dal riquadro e diventa una chat.
   La forma è quella che tutti conoscono (colonna stretta al centro, campo a
   pastiglia in basso); la sostanza no — vedi la riga di chiusura. */
.rf-gpt { display:flex; flex-direction:column; height:100%; }
.rf-gpt-top { flex:none; display:flex; align-items:center; gap:10px; padding:10px 24px; border-bottom:1px solid var(--border); }
/* Il segno di Cleo: la stella di ICONS.ai, la stessa della voce nel menu.
   Ferma quando è in attesa, pulsante mentre lavora — così dice qualcosa
   invece di essere un ornamento. */
.rf-segno { display:inline-flex; vertical-align:-2px; margin-right:6px; color:var(--accent); }
.rf-segno svg { width:15px; height:15px; }
.rf-segno.viva { animation: pulse 1.4s infinite; }
/* Agenda: colonne dei tipi (quel che non è di un medico), staccate dalle
   colonne dei medici da una linea più marcata. */
.cal-head.rf-tipo { background: var(--surface-3); color: var(--text-2); }
.cal-head.rf-tipo:first-of-type { box-shadow: inset 2px 0 0 var(--border-2); }
/* Sovrapposti: quando si dividono la colonna il testo si stringe. */
.appt.rf-stretta { padding: 4px 5px; font-size: 11px; border-radius: 7px; }
.appt.rf-stretta .n { gap: 4px; font-size: 11px; }
.appt.rf-stretta .s { font-size: 10px; }
.appt.rf-stretta .dot { width: 6px; height: 6px; }
/* Di chi è la stanza, accanto al nome nel riquadro «Sale oggi». */
.rf-sala-chi { display:block; font-size:11.5px; font-weight:400; color:var(--accent); margin-top:1px; }
.rf-sala-chi.vuota { color:var(--text-3); font-style:italic; }
/* Piano delle sale: preparato dal cron prima che qualcuno lo chieda. */
.rf-piano { display:flex; flex-direction:column; }
.rf-piano-prop { margin-top:10px; padding:10px 12px; border-radius:var(--r-card,10px); background:var(--accent-soft); }
.rf-piano-prop .t { display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:650; text-transform:uppercase; letter-spacing:.03em; color:var(--accent-text); margin-bottom:6px; }
.rf-piano-prop .t svg { width:13px; height:13px; }
.rf-piano-prop .c { font-size:12.5px; line-height:1.5; }
/* Con medici + tipi le colonne diventano tante: la griglia scorre dentro il
   suo riquadro invece di essere tagliata (.cal ha overflow:hidden). */
.rf-cal-scorre { overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; }
.rf-cal-scorre .cal { min-width: min-content; }
.rf-gpt-top .actions { margin-left:auto; }
/* «modello locale, su questo Mac» sta accanto al nome nella barra in alto:
   è la stessa informazione, detta una volta sola e nel posto più visibile. */
.topbar .title .rf-sotto { font-weight:400; font-size:12px; color:var(--text-3); }
@media (max-width: 900px) { .topbar .title .rf-sotto { display:none; } }
.rf-gpt-scroll { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
.rf-gpt-scroll.vuota { justify-content:center; }
.rf-gpt-col { width:100%; max-width:760px; margin:0 auto; padding:0 24px; }
.rf-gpt-thread { display:flex; flex-direction:column; gap:24px; padding:30px 0 10px; }
.rf-gpt-foot { flex:none; padding:10px 0 34px; }
/* I messaggi li scrive askAI: qui si rivestono, non si riscrivono. */
.rf-gpt .ai-msg { max-width:none; padding:0; border:0; border-radius:0; background:none; font-size:15px; line-height:1.65; color:var(--text); }
.rf-gpt .ai-msg.user { align-self:flex-end; max-width:78%; padding:10px 16px; border-radius:20px; background:var(--surface-3); color:var(--text); }
.rf-gpt .ai-msg .srcs { margin-top:10px; }
.rf-gpt .ai-thinking, .rf-gpt .ai-steps { font-size:13.5px; }
/* Campo a pastiglia. */
.rf-gpt-comp { display:flex; align-items:center; gap:8px; padding:6px 6px 6px 18px; border:1px solid var(--border); border-radius:26px; background:var(--surface); box-shadow:var(--shadow-1); }
.rf-gpt-comp:focus-within { border-color:var(--accent); }
.rf-gpt-comp input { flex:1; min-width:0; height:38px; border:0; background:none; outline:none; font:inherit; font-size:15px; color:var(--text); }
/* Solo il tondo d'invio: se il selettore prende tutti i bottoni schiaccia
   anche le pillole dei modi (è più specifico di .rf-modo). */
.rf-gpt-comp > button.invia { flex:none; width:34px; height:34px; padding:0; border:0; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.rf-gpt-comp > button.invia svg { width:16px; height:16px; }
.rf-gpt-nota { margin:9px 0 0; text-align:center; font-size:11.5px; line-height:1.5; color:var(--text-3); }
/* Modi dentro il campo, come i tasti «ricerca approfondita» o «crea immagine». */
.rf-gpt-comp { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:10px 10px 9px 18px; }
.rf-gpt-comp input { grid-column:1 / -1; height:30px; }
.rf-gpt-modi { grid-column:1; display:flex; gap:6px; flex-wrap:wrap; margin-left:-12px; }
.rf-gpt-comp > button.invia { grid-column:2; }
.rf-modo { display:inline-flex; flex:none; align-items:center; gap:6px; height:30px; padding:0 12px; white-space:nowrap; border:1px solid var(--border); border-radius:999px; background:transparent; font:inherit; font-size:12.5px; color:var(--text-2); cursor:pointer; }
.rf-modo svg { width:14px; height:14px; }
.rf-modo:hover { border-color:var(--border-2); }
.rf-modo[aria-pressed="true"] { border-color:var(--accent); background:var(--accent-soft); color:var(--accent-text); font-weight:600; }
/* Il momento che rende sicura tutta la faccenda: si vede prima di partire. */
.rf-med { border:1px solid var(--accent); border-radius:var(--r-card,10px); background:var(--surface); padding:14px 18px; margin-bottom:10px; }
.rf-med .t { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:650; text-transform:uppercase; letter-spacing:.03em; color:var(--text-3); margin-bottom:9px; }
.rf-med .t svg { width:14px; height:14px; }
.rf-cart-lista { display:flex; flex-direction:column; gap:4px; margin-top:8px; max-height:220px; overflow:auto; }
.rf-cart-v { display:flex; align-items:baseline; gap:8px; width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer;
  border:1px solid var(--border); background:var(--surface); border-radius:9px; padding:7px 10px; font-size:12.5px; transition:.14s var(--ease); }
.rf-cart-v:hover { border-color:var(--accent); background:var(--accent-soft); }
.rf-cart-v b { font-weight:600; }
.rf-cart-v span { color:var(--text-3); font-size:11.5px; margin-left:auto; }
.rf-cart-p { margin:8px 0; padding:9px 11px; border-radius:10px; background:var(--surface-2); font-size:12.5px; line-height:1.55; }
.rf-cart-t { width:100%; box-sizing:border-box; margin-top:4px; padding:7px 9px; border:1px solid var(--border); border-radius:8px;
  font:inherit; font-size:12.5px; line-height:1.5; color:var(--text-1); background:var(--surface-1); resize:vertical; }
.rf-cart-t:focus { outline:none; border-color:var(--accent); }
.rf-cert { margin-left:auto; font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.04em;
  padding:2px 7px; border-radius:999px; background:var(--surface-2); color:var(--text-3); }
.rf-cert.alta { background:#e8f3ee; color:#0d5c48; }
.rf-cert.bassa { background:#fdf0e6; color:#8a4b12; }
.rf-cart-p b { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-3); margin-bottom:3px; }
.rf-med textarea { width:100%; min-height:62px; padding:9px 11px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2); font:inherit; font-size:14px; line-height:1.5; color:var(--text); resize:vertical; }
.rf-med .segnali { margin:9px 0 0; display:flex; flex-direction:column; gap:4px; }
.rf-med .segnale { font-size:12.5px; display:flex; align-items:flex-start; gap:6px; }
.rf-med .segnale.blocco { color:var(--danger); }
.rf-med .segnale.avviso { color:var(--warning); }
.rf-med .azioni { display:flex; align-items:center; gap:8px; margin-top:12px; }
.rf-med .dove { margin-left:auto; font-size:11.5px; color:var(--text-3); text-align:right; }
.rf-gen { border-left:3px solid var(--accent); padding-left:14px; }
.rf-gen .et { display:inline-block; font-size:11px; font-weight:650; text-transform:uppercase; letter-spacing:.03em; color:var(--text-3); margin-bottom:6px; }
/* Apertura: saluto, campo al centro, e le domande che sappiamo rispondere. */
.rf-gpt-w { padding:24px 0; }
.rf-gpt-w h3 { margin:0 0 18px; font-size:25px; font-weight:650; letter-spacing:-0.015em; text-align:center; }
.rf-gpt-w .sotto { margin:14px 0 22px; font-size:13px; line-height:1.55; color:var(--text-2); text-align:center; }
.rf-aiw-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px 20px; }
.rf-aiw-g > .t { display:flex; align-items:center; gap:7px; font-size:11.5px; font-weight:650; letter-spacing:.03em; text-transform:uppercase; color:var(--text-3); margin:0 0 4px; }
.rf-aiw-g > .t svg { width:13px; height:13px; }
.rf-aiw-g button { display:block; width:100%; text-align:left; border:0; background:none; padding:6px 10px; margin:0 -10px; border-radius:8px; font:inherit; font-size:13.5px; color:var(--text); cursor:pointer; }
.rf-aiw-g button:hover { background:var(--surface-2); }
.rf-aiw-g .da { display:block; font-size:11.5px; color:var(--text-3); margin-top:1px; }
/* Fuori dal riquadro: niente margini del contenuto, niente pannello laterale
   dell'AI (sarebbe la stessa chat due volte). La barra di sicurezza RESTA:
   quando c'è un contesto paziente dice che l'AI è isolata su quel paziente,
   ed è qui che conta. */
#app.ai-mode .ai-panel { display:none; }
#app.ai-mode .content { padding:0; overflow:hidden; }
#app.ai-mode .content > .page { max-width:none; height:100%; animation:none; }
#app.ai-mode.with-ai { grid-template-columns: var(--sidebar-w) 1fr; }
#app.ai-mode.with-ai.sidebar-collapsed { grid-template-columns: var(--sidebar-c) 1fr; }
/* Agenda a tutta larghezza: le colonne sono tante e nessuno vuole scorrere di
   lato per vedere la propria. Si toglie il limite di 1440 px e si stringono i
   margini; le colonne si restringono fino a --cal-min, calcolato su quante
   sono, e solo se proprio non ci stanno la griglia scorre. */
#app.agenda-larga .content > .page { max-width: none; }
#app.agenda-larga .content { padding-left: 14px; padding-right: 14px; }
/* Le sale stanno in mezzo: più larghe della pagina normale (1440), non senza
   limite come l'agenda — oltre una certa larghezza le colonne diventano
   lenzuola e l'occhio deve viaggiare per niente. */
#app.sale-larga .content > .page { max-width: 1760px; }
#app.sale-larga .content { padding-left: 20px; padding-right: 20px; }
.cal { grid-template-columns: 52px repeat(var(--cols, 3), minmax(var(--cal-min, 180px), 1fr)); }
.cal-head { padding: 9px 10px; }
.cal.rf-fitta .cal-head { padding: 8px 7px; font-size: 12px; }
.cal.rf-fitta .appt { padding: 4px 6px; font-size: 11.5px; border-radius: 8px; }
.cal.rf-fitta .appt .n { font-size: 11.5px; gap: 5px; }
.cal.rf-fitta .appt .s { font-size: 10.5px; }
.cal.rf-fitta .appt .dot { width: 6px; height: 6px; }
@media (max-width: 767px) { .rf-aip { height: calc(100vh - var(--topbar-h) - 190px); } .rf-aip .ai-body { padding: 12px; } .rf-aip .ai-msg.user { max-width: 88%; }
  .rf-gpt-col { padding:0 16px; } .rf-gpt-top { padding:8px 16px; } .rf-gpt-w h3 { font-size:21px; } .rf-aiw-grid { grid-template-columns:1fr; gap:14px; } .rf-gpt-foot { padding-bottom:78px; } }
`; document.head.appendChild(st); })();
function rfAiPaginaInvia() {
  const el = document.getElementById('rf-aip-in'); const v = el ? el.value.trim() : '';
  if (!v) return; el.value = '';
  if (state.modoMedico && rfPuoDomandaMedica()) { void rfDomandaMedica(v); return; }
  if (state.modoCartella && rfPuoDomandaMedica()) { void rfCartellaChiedi(v); return; }
  askAI(v);
}
// Domanda avviata ma non mandata: quelle che finiscono con un nome le scrive
// la persona, non le indoviniamo noi.
function rfAiPrecompila(inizio) {
  const el = document.getElementById('rf-aip-in');
  if (!el) return;
  el.value = inizio;
  el.focus();
  el.setSelectionRange(inizio.length, inizio.length);
}
// Campo della domanda: nella schermata vuota sta al centro sotto il saluto,
// a conversazione iniziata in fondo. È lo stesso pezzo, spostato.
// Il modo «domanda medica» lo può accendere chi fa medicina: la segreteria no.
function rfPuoDomandaMedica() { return ['doctor', 'org_admin'].includes(state.role); }
function rfModoMedico() { state.modoMedico = !state.modoMedico; if (state.modoMedico) state.modoCartella = false; render(); const i = document.getElementById('rf-aip-in'); if (i) i.focus(); }
/* «Con la cartella»: il modello locale legge la cartella intera e prepara il
   contesto minimo che servirebbe a chi non conosce il paziente. In questa
   fetta NON esce niente — si mostra che cosa uscirebbe. */
function rfModoCartella() { state.modoCartella = !state.modoCartella; if (state.modoCartella) state.modoMedico = false; render(); const i = document.getElementById('rf-aip-in'); if (i) i.focus(); }
function rfAiCampo() {
  const paz = state.patientCtx && P[state.patientCtx] ? P[state.patientCtx] : null;
  const med = !!state.modoMedico;
  const ph = med
    ? 'Scrivi la domanda come ti viene, col paziente dentro: non esce da qui'
    : state.modoCartella
      ? (paz ? `Chiedi guardando la cartella di ${rfEsc(paz.first)}…` : 'Scegli un paziente qui sotto, poi scrivi la domanda…')
      : (paz ? 'Chiedi qualcosa su ' + rfEsc(paz.first) + '…' : 'Scrivi una domanda…');
  return `<div class="rf-gpt-comp">
    <input id="rf-aip-in" placeholder="${ph}" autocomplete="off" onkeydown="if(event.key==='Enter'){rfAiPaginaInvia();}">
    <div class="rf-gpt-modi">${rfPuoDomandaMedica() ? `<button type="button" class="rf-modo" aria-pressed="${med}" onclick="rfModoMedico()" title="La domanda viene riscritta in forma generale dal modello locale, e la approvi tu prima che parta">${ICONS.activity} Domanda medica</button>
      <button type="button" class="rf-modo" aria-pressed="${!!state.modoCartella}" onclick="rfModoCartella()" title="Il modello locale legge la cartella intera e prepara il minimo che servirebbe a chi non conosce il paziente. In questa versione non esce niente: si guarda e basta.">${ICONS.file || ICONS.patients} Con la cartella</button>` : ''}</div>
    <button type="button" class="invia" title="Invia" onclick="rfAiPaginaInvia()">${ICONS.send}</button>
  </div>`;
}
function rfAiNota() {
  return `<p class="rf-gpt-nota">${rfEsc(RF_AI_NOME)} non dà consigli clinici e non fa diagnosi. Sotto ogni risposta c'è «Da dove viene»; se un dato non c'è lo dice invece di inventarlo. Nessuna domanda esce da questo Mac.</p>`;
}
// Schermata d'apertura: quattro gruppi di domande che sappiamo rispondere,
// ognuna con scritto DA DOVE arriverà la risposta.
function rfAiBenvenuto() {
  const paz = state.patientCtx && P[state.patientCtx] ? P[state.patientCtx] : null;
  const nomePaz = paz ? `${paz.last} ${paz.first}`.trim() : '';
  const gruppi = [
    { t: 'La giornata', icona: ICONS.clock, voci: [
      ['prepara la giornata', 'dal codice, subito'],
      ['chi arriva domani', 'dall\'agenda della Cassa dei Medici'],
      ['di chi è la Sala 3 oggi pomeriggio', 'dalle regole delle sale'],
      ['dove mettiamo un\'urgenza alle 15', 'proposta, non decisione'],
    ] },
    { t: 'Rimasto indietro', icona: ICONS.alert, voci: [
      ['lettere in ritardo', 'dalle referral e dai referti'],
      ['prestazioni ancora da fatturare', 'dallo stato in agenda'],
      ['referti da confermare', 'dalle bozze della catena'],
    ] },
    { t: 'Come si fa', icona: ICONS.book, voci: [
      ['come si fa la chiusura mensile', 'dalla procedura scritta'],
      ['chi si occupa dei richiami', 'dall\'organizzazione dello studio'],
      ['quale percorso per le palpitazioni', 'dai percorsi validati'],
    ] },
    { t: 'Un paziente', icona: ICONS.patients, voci: [
      [nomePaz ? `cosa è cambiato per ${nomePaz}` : 'cosa è cambiato per ', 'dai referti confermati', !nomePaz],
      [nomePaz ? `che esami ha fatto ${nomePaz}` : 'che esami ha fatto ', 'dai documenti della cartella', !nomePaz],
      [nomePaz ? `documenti di ${nomePaz}` : 'documenti di ', 'dalla cartella', !nomePaz],
    ] },
  ];
  const voce = ([testo, da, precompila]) => precompila
    ? `<button type="button" onclick="rfAiPrecompila(${JSON.stringify(testo).replace(/"/g, '&quot;')})">${rfEsc(testo)}…<span class="da">${rfEsc(da)}</span></button>`
    : `<button type="button" data-ai="${rfEsc(testo)}">${rfEsc(testo)}<span class="da">${rfEsc(da)}</span></button>`;
  return `<div class="rf-gpt-w">
    <h3>Che cosa ti serve sapere?</h3>
    ${rfCartellaRiquadro()}${rfAiCampo()}
    <p class="sotto">${rfEsc(RF_AI_NOME)} legge quello che c'è qui dentro — agenda, attività, referti, documenti, cartelle, procedure dello studio — e niente altro. Le risposte immediate le calcola il codice; quelle di sintesi il modello che gira su questo Mac.</p>
    <div class="rf-aiw-grid">${gruppi.map(g => `<div class="rf-aiw-g"><div class="t">${g.icona}${rfEsc(g.t)}</div>${g.voci.map(voce).join('')}</div>`).join('')}</div>
    ${rfAiNota()}
  </div>`;
}
