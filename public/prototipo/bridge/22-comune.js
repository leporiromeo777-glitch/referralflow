/* =====================================================================
   Cartella comune (22.10.2026) — [[Piattaforma/Cartella comune]]
   =====================================================================
   Le lettere della cartella comune dello studio (CentroCardio/Pazienti,
   una cartella per paziente) vanno da sole nei documenti del paziente:
   un controllo ogni notte, e a lotti finché resta lavoro. Qui: se la
   cartella è collegata, gli ultimi controlli, le lettere arrivate negli
   ultimi sette giorni, le cartelle che aspettano una persona. */
if (typeof NAV_META !== 'undefined') NAV_META.comune = ['Cartella comune', 'comune'];
if (typeof ICONS !== 'undefined' && typeof I === 'function' && !ICONS.comune) ICONS.comune = I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5"/><path d="M9.5 13.5 12 11l2.5 2.5"/>');
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin', 'tech_admin']) {
  const n = NAV[r]; if (n && !n.includes('comune')) n.splice(Math.max(0, n.indexOf('dividi')) + 1, 0, 'comune');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-com-tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.rf-com-tile { border:1px solid var(--border); border-radius:16px; padding:12px 14px; background:var(--surface); }
.rf-com-tile .n { font-size:24px; font-weight:650; font-variant-numeric:tabular-nums; line-height:1.15; }
.rf-com-tile .t { font-size:12px; color:var(--text-2); margin-top:2px; }
.rf-com-tab { width:100%; border-collapse:collapse; font-size:13px; }
.rf-com-tab th { text-align:left; font-weight:600; font-size:11.5px; color:var(--text-2); padding:6px 8px; border-bottom:1px solid var(--border); white-space:nowrap; }
.rf-com-tab td { padding:7px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
.rf-com-tab td.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
.rf-com-tab tr.clic { cursor:pointer; } .rf-com-tab tr.clic:hover td { background:var(--surface-2, rgba(0,0,0,.03)); }
.rf-com-scroll { overflow-x:auto; }
.rf-com-arr { display:flex; flex-direction:column; gap:6px; padding:10px 0; border-top:1px solid var(--border); }
.rf-com-arr:first-of-type { border-top:0; }
.rf-com-arr .input { min-width:0 !important; height:32px; }
.rf-com-perc { font-size:11.5px; color:var(--text-2); word-break:break-all; }
`; document.head.appendChild(st); })();

RF.com = { dati: null, errore: null, scelte: {}, filtro: '', medico: '', quanti: 50, lavora: false };
const RF_COM_URL = '/api/prototipo/comune';
const RF_COM_MOTIVO = {
  nessuno: 'in ReferralFlow non c’è un paziente con questo nome',
  nascita_non_trovata: 'c’è un paziente con questo nome, ma nelle lettere non trovo la sua data di nascita',
  nascita_diversa: 'c’è un paziente con questo nome, ma con un’altra data di nascita',
  omonimi: 'più pazienti con questo nome: quale?',
  senza_nome: 'dal nome della cartella non si capisce chi è',
};
const rfComGiorno = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '—');
const rfComQuando = (s) => (s ? `${rfComGiorno(s)} ${s.slice(11, 16)}` : '—');
const rfComN = (x) => Number(x || 0).toLocaleString('it-CH');

async function rfComChiedi(corpo) {
  try {
    const r = await fetch(RF_COM_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { errore: j.errore || `Non riuscito (${r.status}).` };
  } catch { return { errore: 'Piattaforma non raggiungibile.' }; }
}
async function rfComCarica(rendi = true) {
  try {
    const r = await fetch(RF_COM_URL, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) RF.com.errore = j.errore || `Non riesco a leggere lo stato della cartella comune (${r.status}).`;
    else { RF.com.dati = j; RF.com.errore = null; }
  } catch { RF.com.errore = 'Piattaforma non raggiungibile.'; }
  if (rendi) render();
}
async function rfComControlla() {
  if (RF.com.lavora) return;
  RF.com.lavora = true; render();
  const j = await rfComChiedi({ azione: 'controlla' });
  RF.com.lavora = false;
  if (j.errore) toast(j.errore);
  else if (j.gia_in_corso) toast('Un controllo è già in corso: tra poco i numeri si aggiornano');
  else toast(`${j.caricati} ${j.caricati === 1 ? 'lettera caricata' : 'lettere caricate'}${j.in_attesa ? ` · ${j.in_attesa} in cartelle da assegnare` : ''}${j.restano ? ' · ne restano: si continua da soli ogni due minuti' : ''}`);
  await rfComCarica();
}

/* ---------- da assegnare ---------- */
function rfComCerca(id, v) { (RF.com.scelte[id] = RF.com.scelte[id] || {}).cerca = v; render(); const e = document.getElementById(`rf-com-ac-${id}`); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }
function rfComScegli(id, pid) { const p = (RF.data.patients || []).find(x => x.id === pid); RF.com.scelte[id] = { pid, nome: p ? `${fullName(p)}${p.dob ? ` · ${p.dob}` : ''}` : '' }; render(); }
function rfComNuova(id) {
  const x = ((RF.com.dati && RF.com.dati.attesa) || []).find(a => a.id === id) || {};
  const [cg, ...nn] = String(x.nome_letto || '').split(' ');
  RF.com.scelte[id] = { nuova: true, cognome: cg || '', nome: nn.join(' '), nascita: x.nascita_proposta ? rfComGiorno(x.nascita_proposta) : '' }; render();
}
async function rfComFatto(j, msg) { if (j.errore) { toast(j.errore); return; } toast(msg); await rfComCarica(); }
async function rfComAssegna(id) {
  const s = RF.com.scelte[id]; if (!s || !s.pid) { toast('Scegli il paziente'); return; }
  const j = await rfComChiedi({ azione: 'assegna', id, patient_id: s.pid });
  if (!j.errore) delete RF.com.scelte[id];
  await rfComFatto(j, 'Cartella assegnata: le sue lettere entrano adesso');
}
async function rfComCrea(id) {
  const s = RF.com.scelte[id]; if (!s || !s.nuova) return;
  if (!s.cognome.trim() || !s.nome.trim() || !s.nascita.trim()) { toast('Servono cognome, nome e data di nascita'); return; }
  const j = await rfComChiedi({ azione: 'crea_cartella', id, cognome: s.cognome, nome: s.nome, data_nascita: s.nascita });
  if (!j.errore) { delete RF.com.scelte[id]; void rfCaricaDati(); }
  await rfComFatto(j, j.nuova ? 'Paziente creato: le sue lettere entrano adesso' : 'Il paziente c’era già: le sue lettere entrano adesso');
}
async function rfComScarta(id) {
  if (!confirm('Non caricare le lettere di questa cartella? Restano sulla cartella comune, non vengono toccate.')) return;
  await rfComFatto(await rfComChiedi({ azione: 'scarta', id }), 'Cartella lasciata fuori');
}
// Pazienti col cognome scritto nel nome della cartella: i primi da proporre.
function rfComSimili(nome) {
  const parole = String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(w => w.length >= 3);
  if (!parole.length) return [];
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (RF.data.patients || []).filter(p => rfUuid(p.id) && parole.includes(norm(p.last).split(/[^a-z]+/).filter(Boolean)[0] || '#'))
    .map(p => ({ p, punti: parole.filter(w => norm(`${p.last} ${p.first}`).includes(w)).length })).sort((a, b) => b.punti - a.punti).slice(0, 4).map(x => x.p);
}
function rfComAttesaHtml() {
  const d = RF.com.dati || {}, tutte = d.attesa || [];
  if (!tutte.length) return '';
  const puo = d.puo && d.puo.assegnare;
  const q = RF.com.filtro.trim().toLowerCase();
  const l = tutte.filter(x => (!RF.com.medico || x.medico === RF.com.medico) && (!q || `${x.nome_letto} ${x.percorso}`.toLowerCase().includes(q)));
  const medici = [...new Set(tutte.map(x => x.medico))].sort();
  const riga = (x) => {
    const s = RF.com.scelte[x.id] || {}, qq = (s.cerca || '').trim().toLowerCase();
    const trovati = qq.length >= 2 ? (RF.data.patients || []).filter(p => rfUuid(p.id) && fullName(p).toLowerCase().includes(qq)).slice(0, 6) : rfComSimili(x.nome_letto);
    return `<div class="rf-com-arr">
      <div><b>${rfEsc(x.nome_letto || 'Cartella')}</b> · ${x.lettere} ${x.lettere === 1 ? 'lettera' : 'lettere'}${x.nascita_proposta ? ` · nelle lettere: nato/a il ${rfComGiorno(x.nascita_proposta)}` : ''}</div>
      <div class="rf-com-perc">${rfEsc(x.percorso)}</div>
      <div class="caption">${rfEsc(RF_COM_MOTIVO[x.motivo] || 'da assegnare')}.</div>
      ${puo ? `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        ${s.nuova ? `<input class="input" style="width:150px" placeholder="Cognome" value="${rfEsc(s.cognome)}" oninput="RF.com.scelte['${x.id}'].cognome=this.value"><input class="input" style="width:150px" placeholder="Nome" value="${rfEsc(s.nome)}" oninput="RF.com.scelte['${x.id}'].nome=this.value"><input class="input" style="width:120px" placeholder="31.12.1950" value="${rfEsc(s.nascita)}" oninput="RF.com.scelte['${x.id}'].nascita=this.value"><button class="btn sm primary" onclick="rfComCrea('${x.id}')">Crea il paziente e carica</button><button class="btn sm ghost" onclick="delete RF.com.scelte['${x.id}'];render()">Annulla</button>`
          : s.pid ? `<span class="badge accent">${rfEsc(s.nome)}</span><button class="btn sm ghost" onclick="delete RF.com.scelte['${x.id}'];render()">Cambia</button><button class="btn sm primary" onclick="rfComAssegna('${x.id}')">Carica nella sua cartella</button>`
          : `<input class="input" id="rf-com-ac-${x.id}" style="width:220px" placeholder="Di chi è? Scrivi il cognome" value="${rfEsc(s.cerca || '')}" oninput="rfComCerca('${x.id}', this.value)">${trovati.map(p => `<button class="btn sm" onclick="rfComScegli('${x.id}','${p.id}')">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</button>`).join('')}<button class="btn sm" onclick="rfComNuova('${x.id}')">Non è in ReferralFlow: crealo</button>`}
        <span class="grow"></span><button class="btn sm ghost" onclick="rfComScarta('${x.id}')">Non caricare</button></div>` : '<div class="caption">Il tuo ruolo non assegna le cartelle.</div>'}</div>`;
  };
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Cartelle da assegnare</span><span class="badge warning">${rfComN(tutte.length)}</span></div>
    <p class="meta" style="margin:0 0 8px;line-height:1.5">Il paziente si riconosce da solo quando il nome della cartella e la data di nascita scritta nelle lettere combaciano con una persona sola. Queste aspettano: le lettere entrano appena scegli il paziente.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><input class="input" id="rf-com-filtro" style="min-width:0;width:260px" placeholder="Cerca nel nome della cartella…" value="${rfEsc(RF.com.filtro)}" oninput="RF.com.filtro=this.value;RF.com.quanti=50;render();const e=document.getElementById('rf-com-filtro');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}">
      <select class="input" style="min-width:0;width:auto" onchange="RF.com.medico=this.value;RF.com.quanti=50;render()"><option value="">Tutte le cartelle dei medici</option>${medici.map(m => `<option value="${rfEsc(m)}"${m === RF.com.medico ? ' selected' : ''}>${rfEsc(m.replace(/_/g, ' '))}</option>`).join('')}</select>
      <span class="caption" style="align-self:center">${rfComN(l.length)} ${l.length === 1 ? 'cartella' : 'cartelle'}</span></div>
    ${l.slice(0, RF.com.quanti).map(riga).join('')}
    ${l.length > RF.com.quanti ? `<button class="btn sm mt-8" onclick="RF.com.quanti+=50;render()">Mostra altre 50</button>` : ''}</div>`;
}

PAGES.comune = () => {
  if (!RF.live) return '<div class="page"><div class="card"><p class="meta" style="margin:0">La cartella comune è una funzione della piattaforma: qui, fuori, non ci sono dati.</p></div></div>';
  if (!RF.com.dati && !RF.com.errore) { void rfComCarica(); return `<div class="page-head"><div><h2 class="page-title">Cartella comune</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  const d = RF.com.dati || {}, c = d.conti || {}, g = (d.giri || [])[0];
  const ultimoFinito = (d.giri || []).find(x => x.finito && !x.errore);
  const inCorsoPrima = g && g.restano;
  const tile = (n, t) => `<div class="rf-com-tile"><div class="n">${rfComN(n)}</div><div class="t">${t}</div></div>`;
  const recenti = d.recenti || [];
  return `<div class="page-head"><div><h2 class="page-title">Cartella comune</h2><div class="page-sub">Le lettere della cartella comune dello studio vanno da sole nei documenti del paziente · un controllo ogni notte alle 2</div></div>
      <div class="actions"><button class="btn primary" onclick="rfComControlla()" ${RF.com.lavora ? 'disabled' : ''}>${RF.com.lavora ? 'Controllo…' : 'Controlla adesso'}</button></div></div>
    ${RF.com.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.com.errore)}</div>` : ''}
    <div class="card">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">${d.collegata ? '<span class="badge success">Collegata</span>' : '<span class="badge danger">Non collegata</span>'}<span class="rf-com-perc">${rfEsc(d.radice || '')}</span></div>
      ${d.collegata ? '' : '<p class="meta" style="margin:8px 0 0;line-height:1.5">Il Mac dello studio non vede la cartella comune: aprila dal Finder (Vai → Connessione al server) e il controllo riprende da solo.</p>'}
      <p class="meta" style="margin:8px 0 0;line-height:1.5">${ultimoFinito ? `Ultimo controllo ${rfComQuando(ultimoFinito.finito)}: ${rfComN(ultimoFinito.nuovi)} ${ultimoFinito.nuovi === 1 ? 'lettera nuova' : 'lettere nuove'}, ${rfComN(ultimoFinito.caricati)} caricate${ultimoFinito.in_attesa ? `, ${rfComN(ultimoFinito.in_attesa)} in cartelle da assegnare` : ''}${ultimoFinito.doppioni ? `, ${rfComN(ultimoFinito.doppioni)} doppioni saltati` : ''}.` : 'Ancora nessun controllo.'}
      ${inCorsoPrima ? ' <b>Caricamento in corso</b>: la prima volta sono migliaia di lettere, un lotto ogni due minuti finché non sono finite.' : ''}</p>
    </div>
    <div class="rf-com-tiles mt-16">${tile(c.caricati, 'lettere caricate')}${tile(c.abbinate, 'cartelle di pazienti riconosciute')}${tile(c.creati, 'pazienti creati dalla cartella')}${tile(c.quasi, 'col nome quasi uguale e la stessa nascita')}${tile(c.in_attesa, 'cartelle da assegnare')}${tile(c.doppioni, 'doppioni saltati (anche il PDF di un Word)')}${tile(c.scartate, 'cartelle lasciate fuori')}</div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Arrivate negli ultimi sette giorni</span><span class="badge">${rfComN(recenti.length)}</span></div>
      ${recenti.length ? `<div class="rf-com-scroll"><table class="rf-com-tab"><thead><tr><th>Paziente</th><th>Lettera</th><th>Data della lettera</th><th>Caricata</th></tr></thead><tbody>${recenti.map(x => `<tr class="clic" onclick="location.hash='#/patients/${x.patient_id}'"><td><b>${rfEsc(`${x.cognome} ${x.nome}`)}</b></td><td>${rfEsc(x.filename)}</td><td class="num">${rfComGiorno(x.data_lettera)}</td><td class="num">${rfComQuando(x.quando)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="caption">Nessuna lettera nuova negli ultimi sette giorni.</div>'}</div>
    ${rfComAttesaHtml()}
    ${(d.non_pazienti || []).length ? `<div class="card mt-16"><div class="card-head"><span class="section-title">Lasciate fuori: archivi</span><span class="badge">${(d.non_pazienti || []).length}</span></div><p class="meta" style="margin:0 0 6px;line-height:1.5">Cartelle con centinaia di lettere che non portano il nome di un paziente (lettere nominate con un codice): non si caricano.</p>${d.non_pazienti.map(x => `<div class="rf-com-perc">${rfEsc(x.percorso)}</div>`).join('')}</div>` : ''}
    ${ultimoFinito && ultimoFinito.sciolte ? `<p class="caption mt-8">${rfComN(ultimoFinito.sciolte)} lettere stanno fuori da una cartella di paziente (cartelle per giorno o per anno): per ora non si caricano.</p>` : ''}`;
};
