/* =====================================================================
   Monitoraggio remoto multiparametrico (6.10.2026) — [[Piattaforma/Monitoraggio]]
   =====================================================================
   Modulo DIMOSTRATIVO: pazienti, dispositivi e valori sono simulati, e ogni
   schermata lo dice. Il motore (acquisizione, regole, avvisi) gira nel server
   e non dipende da questa pagina: qui si guarda e si agisce.
   La pagina si aggiorna ogni 5 secondi SENZA ridisegnarsi da capo: cambiano
   i pezzi (riepilogo, righe, grafici), l'ordine delle righe resta fermo
   finché non lo si chiede, i campi in cui si sta scrivendo non si toccano. */
if (typeof NAV_META !== 'undefined') NAV_META.monitoraggio = ['Monitoraggio', 'monitoraggio'];
if (typeof ICONS !== 'undefined' && typeof I === 'function' && !ICONS.monitoraggio) ICONS.monitoraggio = I('<path d="M3 12h3.5l2-6 4 12 2.5-8 1.5 2H21"/>');
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin', 'tech_admin']) {
  const n = NAV[r]; if (n && !n.includes('monitoraggio')) n.splice(Math.max(0, n.indexOf('documents')) + 1, 0, 'monitoraggio');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-mon-demo { position:sticky; top:0; z-index:5; margin:0 0 14px; padding:8px 14px; border-radius:12px; font-size:12.5px; font-weight:600; letter-spacing:.02em; text-align:center;
  color:#7a4b00; background:rgba(255,232,178,.90); border:1px solid rgba(190,130,20,.35); }
.rf-mon-tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:14px; }
.rf-mon-tile { border:1px solid var(--border); border-radius:14px; padding:12px 14px; background:color-mix(in srgb, var(--surface) 82%, transparent); }
.rf-mon-tile .n { font-size:26px; font-weight:650; font-variant-numeric:tabular-nums; line-height:1.1; }
.rf-mon-tile .t { font-size:12px; color:var(--text-2); margin-top:2px; }
.rf-mon-tile.alta .n { color:#b3261e; } .rf-mon-tile.att .n { color:#9a6200; } .rf-mon-tile.grigio .n { color:var(--text-2); }
.rf-mon-filtri { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px; }
.rf-mon-filtri .input { height:34px; }
.rf-mon-riga { display:grid; grid-template-columns:minmax(170px, 1.1fr) minmax(360px, 3fr) minmax(170px, 1.2fr) minmax(150px, 1fr); gap:14px; align-items:center; padding:12px 14px; border:1px solid var(--border); border-radius:14px;
  background:var(--surface); margin-bottom:8px; cursor:pointer; transition:border-color .15s var(--ease, ease); }
.rf-mon-riga:hover { border-color:var(--border-2, var(--border)); }
.rf-mon-riga.nuovo { animation:rfMonNuovo 2.4s ease-out 1; }
@keyframes rfMonNuovo { 0% { box-shadow:0 0 0 3px rgba(179,38,30,.35); } 100% { box-shadow:0 0 0 0 rgba(179,38,30,0); } }
@media (max-width: 1100px) { .rf-mon-riga { grid-template-columns:1fr; } }
.rf-mon-chi .name { font-weight:600; } .rf-mon-chi .sub { font-size:12px; color:var(--text-2); line-height:1.45; }
.rf-mon-par { display:grid; grid-template-columns:repeat(5, minmax(64px, 1fr)); gap:8px; }
.rf-mon-p { min-width:0; }
.rf-mon-p .l { font-size:11px; color:var(--text-3); text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
.rf-mon-p .v { font-size:19px; font-weight:600; font-variant-numeric:tabular-nums; line-height:1.15; white-space:nowrap; }
.rf-mon-p .v small { font-size:11px; font-weight:400; color:var(--text-2); margin-left:2px; }
.rf-mon-p .m { font-size:10.5px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rf-mon-p.oltre .v { color:#9a6200; } .rf-mon-p.vecchio .v { color:var(--text-3); } .rf-mon-p.assente .v { font-size:12px; font-weight:400; color:var(--text-3); }
.rf-mon-p svg { display:block; width:100% !important; height:22px !important; margin-top:2px; }
.rf-mon-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:3px 9px; border-radius:999px; border:1px solid var(--border); white-space:nowrap; }
.rf-mon-pill i { width:8px; height:8px; border-radius:50%; background:currentColor; display:inline-block; }
.rf-mon-pill.alta { color:#b3261e; border-color:#e8b4b0; background:rgba(179,38,30,.06); } .rf-mon-pill.att { color:#9a6200; border-color:#e6c27a; background:rgba(230,180,60,.10); }
.rf-mon-pill.ok { color:#0d5c48; border-color:#a9d6c5; } .rf-mon-pill.ins { color:var(--text-2); border-style:dashed; } .rf-mon-pill.fermo { color:var(--text-3); }
.rf-mon-pill.tec { color:#3b5b8a; border-color:#b9c8e0; }
.rf-mon-tec { font-size:12px; color:var(--text-2); line-height:1.6; }
.rf-mon-tec b { font-weight:600; color:var(--text, inherit); }
.rf-mon-ord { display:flex; flex-direction:column; gap:2px; } .rf-mon-ord button { all:unset; cursor:pointer; font-size:11px; color:var(--text-3); padding:0 4px; }
.rf-mon-carte { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.rf-mon-carta { border:1px solid var(--border); border-radius:14px; padding:12px 14px; background:var(--surface); }
.rf-mon-carta .l { font-size:11.5px; color:var(--text-2); } .rf-mon-carta .v { font-size:28px; font-weight:650; font-variant-numeric:tabular-nums; line-height:1.15; }
.rf-mon-carta .v small { font-size:13px; font-weight:400; color:var(--text-2); margin-left:4px; } .rf-mon-carta .m { font-size:11.5px; color:var(--text-3); line-height:1.5; margin-top:2px; }
.rf-mon-carta.oltre { border-color:#e6c27a; } .rf-mon-carta.vecchio .v { color:var(--text-3); }
.rf-mon-graf { position:relative; border-top:1px solid var(--border); padding:8px 0 2px; }
.rf-mon-graf:first-child { border-top:0; }
.rf-mon-graf .tit { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:12.5px; }
.rf-mon-graf .tit b { font-weight:600; } .rf-mon-graf .let { font-variant-numeric:tabular-nums; color:var(--text-2); font-size:12px; }
.rf-mon-graf svg { display:block; width:100% !important; height:120px; overflow:visible; }
.rf-mon-graf text { font-size:10px; fill:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-mon-ecg { background:#fbfaf6; border:1px solid var(--border); border-radius:12px; overflow:hidden; position:relative; }
.rf-mon-ecg canvas { display:block; width:100%; height:190px; }
.rf-mon-ecg .pausa { position:absolute; left:10px; top:8px; font-size:12px; font-weight:600; color:#7a4b00; background:rgba(255,214,120,.9); border-radius:8px; padding:3px 9px; }
.rf-mon-avv { border:1px solid var(--border); border-radius:12px; padding:10px 12px; margin-top:8px; background:var(--surface); }
.rf-mon-avv.chiuso { opacity:.72; }
.rf-mon-avv .tempi { font-size:11.5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.rf-mon-avv .passi { font-size:12px; color:var(--text-2); margin-top:6px; border-left:2px solid var(--border); padding-left:8px; line-height:1.55; }
.rf-mon-ai { white-space:pre-wrap; font-size:13.5px; line-height:1.55; }
.rf-mon-tab { width:100%; border-collapse:collapse; font-size:13px; } .rf-mon-tab th { text-align:left; font-weight:500; color:var(--text-2); font-size:12px; padding:6px 8px; border-bottom:1px solid var(--border); }
.rf-mon-tab td { padding:7px 8px; border-bottom:1px solid var(--border); vertical-align:top; } .rf-mon-tab input.input { height:30px; width:86px !important; min-width:0; }
`; document.head.appendChild(st); })();

RF.mon = { dati: null, errore: null, scheda: 'pazienti', filtri: { q: '', medico: '', stato: '', avvisi: '', conn: '' }, ordine: 'priorita', ordineIds: null, aperto: null, det: null, intervallo: '1h', da: '', a: '',
  visti: null, suoni: false, sfasamento: 0, altri: {}, ai: null, aiCarico: false, cursore: null, ecg: { pezzi: [], fine: 0, pausa: null, vivo: false, ultimoPezzo: 0 } };
try { RF.mon.suoni = localStorage.getItem('rf-mon-suoni') === '1'; RF.mon.manuale = JSON.parse(localStorage.getItem('rf-mon-ordine') || 'null'); } catch { /* niente */ }
const RF_MON_URL = '/api/prototipo/monitoraggio';
const RF_MON_DEMO = '<div class="rf-mon-demo">DEMO — dati simulati, non utilizzabili per decisioni cliniche</div>';

/* ---------- piccoli aiuti ---------- */
const rfMonOra = (d, sec) => (d ? new Date(d).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) }) : '—');
const rfMonGiornoOra = (d) => (d ? new Date(d).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
function rfMonFa(s) { if (s == null) return 'mai'; if (s < 90) return `${Math.max(0, Math.round(s))} s fa`; if (s < 5400) return `${Math.round(s / 60)} min fa`; if (s < 172800) return `${Math.round(s / 3600)} h fa`; return `${Math.round(s / 86400)} g fa`; }
const rfMonNum = (v, dec) => (v == null ? '—' : Number(v).toFixed(dec || 0).replace('.', ','));
const rfMonAdesso = () => Date.now() + RF.mon.sfasamento;
async function rfMonChiama(corpo) {
  try {
    const r = await fetch(RF_MON_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.errore || `Errore ${r.status}`); return null; }
    return j;
  } catch { toast('Piattaforma non raggiungibile'); return null; }
}
const RF_MON_STATO = {
  avviso_alta: ['alta', 'Alta priorità'], avviso_attenzione: ['att', 'Attenzione'], nessun_avviso: ['ok', 'Nessun avviso rilevato'],
  dati_insufficienti: ['ins', 'Dati insufficienti'], interrotto: ['fermo', 'Monitoraggio interrotto'],
};
const RF_MON_CONN = { in_aggiornamento: 'In aggiornamento', in_ritardo: 'Dati in ritardo', interrotta: 'Connessione interrotta', terminato: 'Monitoraggio non attivo' };
function rfMonPillStato(p) {
  const s = RF_MON_STATO[p.stato] || ['', p.stato];
  const testo = p.stato === 'interrotto' ? (p.programma === 'terminato' ? 'Monitoraggio terminato' : 'Monitoraggio in pausa') : s[1];
  return `<span class="rf-mon-pill ${s[0]}"><i></i>${testo}</span>`;
}
function rfMonLivello(a) { return a.categoria === 'tecnico' ? '<span class="rf-mon-pill tec">Tecnico</span>' : a.livello === 2 ? '<span class="rf-mon-pill alta">Livello 2 · alta priorità</span>' : '<span class="rf-mon-pill att">Livello 1 · attenzione</span>'; }
const RF_MON_STATO_AVV = { aperto: 'aperto', in_carico: 'preso in carico', chiuso: 'chiuso' };

/* ---------- caricamento e aggiornamento ---------- */
async function rfMonCarica() {
  try {
    const r = await fetch(RF_MON_URL, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { RF.mon.errore = r.status === 403 ? 'Il monitoraggio non fa parte del tuo ruolo.' : `Non riesco a leggere il monitoraggio (${r.status}).`; return false; }
    const j = await r.json();
    RF.mon.sfasamento = new Date(j.ora).getTime() - Date.now();
    rfMonNovita(j);
    RF.mon.dati = j; RF.mon.errore = null;
    return true;
  } catch { RF.mon.errore = 'Piattaforma non raggiungibile: i dati qui sotto non si stanno aggiornando.'; return false; }
}
// Avvisi comparsi dall'ultimo aggiornamento: richiamo visivo, e sonoro se acceso e il paziente non è silenziato.
function rfMonNovita(j) {
  const adesso = new Set(j.pazienti.filter(p => p.avvisi.prioritario).map(p => p.avvisi.prioritario.id));
  if (RF.mon.visti) {
    RF.mon.nuovi = new Set([...adesso].filter(id => !RF.mon.visti.has(id)));
    const forti = j.pazienti.filter(p => p.avvisi.prioritario && RF.mon.nuovi.has(p.avvisi.prioritario.id) && p.avvisi.prioritario.livello === 2 && !p.silenzio_fino);
    if (forti.length && RF.mon.suoni) rfMonSuono();
  } else RF.mon.nuovi = new Set();
  RF.mon.visti = adesso;
}
function rfMonSuono() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = RF.mon._audio || (RF.mon._audio = new C()), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 660; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.55);
  } catch { /* niente audio */ }
}
function rfMonSuoni(on) { RF.mon.suoni = !!on; try { localStorage.setItem('rf-mon-suoni', on ? '1' : '0'); } catch { /* niente */ } if (on) rfMonSuono(); }

// Il giro della pagina: ogni 5 secondi, solo se la si sta guardando.
async function rfMonGiro() {
  if (state.route !== 'monitoraggio' || document.hidden || !RF.live) return;
  if (RF.mon.aperto) { await rfMonCaricaDet(); rfMonDipingiDet(); return; }
  if (RF.mon.scheda === 'pazienti') { await rfMonCarica(); rfMonDipingiElenco(); }
  else if (RF.mon.scheda === 'avvisi') { await rfMonAltra('avvisi'); const el = document.getElementById('rf-mon-avvisi'); if (el) el.innerHTML = rfMonAvvisiHtml(); }
}
if (!RF.mon._timer) RF.mon._timer = setInterval(() => { void rfMonGiro(); }, 5000);

/* ---------- panoramica ---------- */
function rfMonPeso(p) { return { avviso_alta: 0, avviso_attenzione: 1, dati_insufficienti: 2, nessun_avviso: 3, interrotto: 4 }[p.stato] * 10 + (p.avvisi.tecnici ? 0 : 1); }
function rfMonOrdinati() {
  const d = RF.mon.dati; if (!d) return [];
  const tutti = d.pazienti.slice();
  const m = RF.mon.ordine;
  if (m === 'nome') tutti.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  else if (m === 'ultimo') tutti.sort((a, b) => (a.eta_s == null ? 1e12 : a.eta_s) - (b.eta_s == null ? 1e12 : b.eta_s));
  else {
    // Priorità o manuale: l'ordine è una lista di id che NON cambia da sola.
    const chiave = m === 'manuale' ? 'manuale' : 'ordineIds';
    if (!RF.mon[chiave]) RF.mon[chiave] = tutti.slice().sort((a, b) => rfMonPeso(a) - rfMonPeso(b) || a.codice.localeCompare(b.codice)).map(p => p.id);
    const pos = new Map(RF.mon[chiave].map((id, i) => [id, i]));
    tutti.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e6) - (pos.has(b.id) ? pos.get(b.id) : 1e6));
  }
  const f = RF.mon.filtri, q = f.q.trim().toLowerCase();
  return tutti.filter(p => (!q || `${p.nome} ${p.codice}`.toLowerCase().includes(q)) && (!f.medico || p.medico === f.medico)
    && (!f.stato || p.programma === f.stato)
    && (!f.avvisi || (f.avvisi === 'alta' ? p.stato === 'avviso_alta' : f.avvisi === 'attenzione' ? p.stato === 'avviso_attenzione' : f.avvisi === 'tecnici' ? p.avvisi.tecnici > 0 : f.avvisi === 'nessuno' ? p.avvisi.aperti === 0 : true))
    && (!f.conn || p.connessione === f.conn));
}
// L'ordine di priorità mostrato è ancora quello vero? Se no lo si dice, ma non si sposta niente da soli.
function rfMonOrdineVecchio() {
  const d = RF.mon.dati; if (!d || RF.mon.ordine !== 'priorita' || !RF.mon.ordineIds) return false;
  const vero = d.pazienti.slice().sort((a, b) => rfMonPeso(a) - rfMonPeso(b) || a.codice.localeCompare(b.codice)).map(p => p.id);
  return vero.join() !== RF.mon.ordineIds.join();
}
function rfMonRiordina() { RF.mon.ordineIds = null; rfMonDipingiElenco(); }
function rfMonSposta(id, d) {
  const l = RF.mon.manuale || []; const i = l.indexOf(id), j = i + d;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  try { localStorage.setItem('rf-mon-ordine', JSON.stringify(l)); } catch { /* niente */ }
  rfMonDipingiElenco();
}
function rfMonSpark(punti, oltre) {
  if (!punti || punti.length < 2) return '<svg viewBox="0 0 100 22" preserveAspectRatio="none"></svg>';
  const t0 = rfMonAdesso() - 30 * 60000, t1 = rfMonAdesso();
  const v = punti.map(p => p[1]), lo = Math.min(...v), hi = Math.max(...v), d = Math.max(1, hi - lo);
  let path = '', prima = null;
  for (const [t, y] of punti) {
    const x = ((t - t0) / (t1 - t0)) * 100, yy = 20 - ((y - lo) / d) * 18;
    // Un buco nei dati resta un buco: la linea si interrompe.
    path += `${prima != null && t - prima <= 150000 ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)} `;
    prima = t;
  }
  return `<svg viewBox="0 0 100 22" preserveAspectRatio="none" style="width:100%;height:22px;display:block"><path d="${path}" fill="none" style="stroke:${oltre ? '#9a6200' : 'var(--cta, var(--accent, #0d5c48))'}" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
function rfMonCella(p, codice) {
  const def = { fc: 'FC', spo2: 'SpO₂', fr: 'FR', temp_cutanea: 'T cutanea', pa_sistolica: 'PA' }[codice];
  const v = p.parametri.find(x => x.codice === codice);
  if (!v) return `<div class="rf-mon-p assente"><div class="l">${def}</div><div class="v">non misurato</div></div>`;
  if (RF.mon.dati.vista_tecnica) return `<div class="rf-mon-p assente"><div class="l">${def}</div><div class="v">vista tecnica</div><div class="m">${v.modo === 'intermittente' ? 'a intervalli' : 'continuo'}</div></div>`;
  if (v.valore == null) return `<div class="rf-mon-p assente"><div class="l">${def}</div><div class="v">nessun dato</div></div>`;
  let testo = rfMonNum(v.valore, v.decimali), unita = v.unita;
  if (codice === 'pa_sistolica') { const dia = p.parametri.find(x => x.codice === 'pa_diastolica'); testo = `${rfMonNum(v.valore)}/${dia && dia.valore != null ? rfMonNum(dia.valore) : '—'}`; }
  const meta = v.vecchio ? `non aggiornato · ${rfMonFa(v.eta_s)}` : v.modo === 'intermittente' ? `a intervalli · ${rfMonFa(v.eta_s)}` : rfMonFa(v.eta_s);
  return `<div class="rf-mon-p ${v.oltre ? 'oltre' : ''} ${v.vecchio ? 'vecchio' : ''}" title="${rfEsc(v.nome)} · ${rfEsc(v.dispositivo || '')}${v.fonte ? ` · ${rfEsc(v.fonte)}` : ''}${v.oltre ? ' · oltre una soglia configurata' : ''}">
    <div class="l">${def}</div><div class="v">${testo}<small>${rfEsc(unita)}</small></div><div class="m">${meta}</div>${p.andamenti[codice] ? rfMonSpark(p.andamenti[codice], v.oltre) : ''}</div>`;
}
function rfMonRiga(p) {
  const a = p.avvisi.prioritario;
  const avviso = a ? `<div>${rfMonLivello(a)}</div><div style="font-size:12.5px;margin-top:4px;font-weight:600">${rfEsc(a.nome)}${a.rientrato ? ' <span class="caption">· rientrato</span>' : ''}</div>
      <div class="caption">${RF_MON_STATO_AVV[a.stato]}${a.responsabile ? ` da ${rfEsc(a.responsabile)}` : ''} · dalle ${rfMonOra(a.generato_il)}${p.avvisi.aperti > 1 ? ` · <b>${p.avvisi.aperti} avvisi aperti</b>` : ''}</div>`
    : p.stato === 'dati_insufficienti' ? '<div class="caption">Nessun avviso, ma i dati non bastano per dirlo: non è «tutto bene».</div>'
    : p.stato === 'interrotto' ? '<div class="caption">Non si sta monitorando.</div>' : '<div class="caption">Nessun avviso aperto.</div>';
  const conn = p.connessione === 'in_aggiornamento' ? `In aggiornamento${p.latenza_s != null ? ` · latenza ${p.latenza_s} s` : ''}` : RF_MON_CONN[p.connessione];
  const man = RF.mon.ordine === 'manuale' ? `<span class="rf-mon-ord" onclick="event.stopPropagation()"><button title="Su" onclick="rfMonSposta('${p.id}',-1)">▲</button><button title="Giù" onclick="rfMonSposta('${p.id}',1)">▼</button></span>` : '';
  return `<div class="rf-mon-riga ${RF.mon.nuovi && a && RF.mon.nuovi.has(a.id) ? 'nuovo' : ''}" onclick="rfMonApri('${p.id}')">
    <div class="rf-mon-chi"><div class="row" style="gap:6px;align-items:flex-start">${man}<div><div class="name">${rfEsc(p.nome || p.codice)}</div><div class="sub">${rfEsc(p.codice)} · ${rfEsc(p.medico || 'senza medico')}</div></div></div>
      <div style="margin-top:6px">${rfMonPillStato(p)}</div></div>
    <div class="rf-mon-par">${p.in_riga.map(c => rfMonCella(p, c)).join('')}</div>
    <div>${avviso}${p.silenzio_fino ? `<div class="caption">🔕 richiami silenziati fino alle ${rfMonOra(p.silenzio_fino)}</div>` : ''}</div>
    <div class="rf-mon-tec"><div><b>${conn}</b></div>
      <div>Segnale: ${p.qualita == null ? 'non dichiarato' : `${p.qualita}/100${p.qualita < 45 ? ' · insufficiente' : ''}`}</div>
      <div>Batteria: ${p.batteria == null ? 'non disponibile' : `${p.batteria}%${p.batteria < 15 ? ' · bassa' : ''}`} · ${p.dispositivi.length} ${p.dispositivi.length === 1 ? 'dispositivo' : 'dispositivi'}</div>
      <div>Ultima misura: ${p.ultimo_dato ? `${rfMonOra(p.ultimo_dato, true)} · ${rfMonFa(p.eta_s)}` : 'nessuna'}</div></div></div>`;
}
function rfMonRiepilogoHtml() {
  const d = RF.mon.dati, r = d.riepilogo, m = d.motore;
  const tile = (n, t, cl) => `<div class="rf-mon-tile ${cl || ''}"><div class="n">${n}</div><div class="t">${t}</div></div>`;
  const fermo = !m.attivo ? 'Simulatore spento: non arrivano dati nuovi.' : m.ritardo_s == null || m.ritardo_s > 30 ? `Il motore del server non gira da ${rfMonFa(m.ritardo_s)}: i valori non si stanno aggiornando.` : '';
  return `${fermo ? `<div class="rf-manc mb-16">${fermo}</div>` : ''}${RF.mon.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.mon.errore)}</div>` : ''}
    <div class="rf-mon-tiles">${tile(r.monitorati, `pazienti monitorati su ${r.totale}`)}${tile(r.alta_priorita, 'con avviso di alta priorità (livello 2)', r.alta_priorita ? 'alta' : 'grigio')}${tile(r.attenzione, 'con avviso di attenzione (livello 1)', r.attenzione ? 'att' : 'grigio')}
      ${tile(r.con_avvisi_tecnici, 'con problemi tecnici aperti', 'grigio')}${tile(r.dispositivi_disconnessi, 'dispositivi disconnessi', 'grigio')}${tile(r.dati_insufficienti, 'con dati assenti, vecchi o di qualità insufficiente', 'grigio')}</div>`;
}
function rfMonElencoHtml() {
  const l = rfMonOrdinati();
  const nota = rfMonOrdineVecchio() ? `<div class="row between" style="margin-bottom:8px"><span class="caption">L'ordine di priorità è cambiato da quando hai aperto l'elenco: le righe non si spostano da sole.</span><button class="btn sm" onclick="rfMonRiordina()">Riordina</button></div>` : '';
  return nota + (l.length ? l.map(rfMonRiga).join('') : '<div class="card"><div class="caption">Nessun paziente con questi filtri.</div></div>');
}
function rfMonDipingiElenco() {
  const a = document.getElementById('rf-mon-riepilogo'), b = document.getElementById('rf-mon-elenco');
  if (!a || !b || !RF.mon.dati) return;
  a.innerHTML = rfMonRiepilogoHtml(); b.innerHTML = rfMonElencoHtml();
  const o = document.getElementById('rf-mon-agg'); if (o) o.textContent = `aggiornato alle ${rfMonOra(RF.mon.dati.ora, true)}`;
}
function rfMonFiltro(k, v) { RF.mon.filtri[k] = v; rfMonDipingiElenco(); }
function rfMonSchede() {
  const d = RF.mon.dati, puo = (d && d.puo) || {};
  const voci = [['pazienti', 'Pazienti'], ['avvisi', 'Avvisi'], ...(d && d.vista_tecnica ? [] : [['regole', 'Regole']]), ['dispositivi', 'Dispositivi'], ...(puo.simulatore ? [['simulatore', 'Simulatore']] : []), ['info', 'Che cos\'è']];
  return `<div class="seg" style="margin-bottom:14px">${voci.map(([k, t]) => `<button class="${RF.mon.scheda === k ? 'active' : ''}" onclick="rfMonScheda('${k}')">${t}</button>`).join('')}</div>`;
}
async function rfMonScheda(k) { RF.mon.scheda = k; if (k !== 'pazienti' && k !== 'simulatore' && k !== 'info') await rfMonAltra(k); render(); }
async function rfMonAltra(vista) {
  try { const r = await fetch(`${RF_MON_URL}?vista=${vista}`, { credentials: 'include', cache: 'no-store' }); RF.mon.altri[vista] = r.ok ? await r.json() : { errore: r.status }; }
  catch { RF.mon.altri[vista] = { errore: 'rete' }; }
}

PAGES.monitoraggio = () => {
  if (!RF.live) return `<div class="page">${RF_MON_DEMO}<div class="card"><p class="meta" style="margin:0">Il monitoraggio è una funzione della piattaforma: qui, fuori, non ci sono dati.</p></div></div>`;
  if (!RF.mon.dati && !RF.mon.errore) { void rfMonCarica().then(() => render()); return `${RF_MON_DEMO}<div class="page-head"><div><h2 class="page-title">Monitoraggio</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  if (!RF.mon.dati) return `${RF_MON_DEMO}<div class="page-head"><div><h2 class="page-title">Monitoraggio</h2></div></div><div class="rf-manc">${rfEsc(RF.mon.errore)}</div>`;
  if (RF.mon.aperto) return rfMonDettaglio();
  const d = RF.mon.dati, f = RF.mon.filtri;
  const sel = (k, voci) => `<select class="input" onchange="rfMonFiltro('${k}', this.value)">${voci.map(([v, t]) => `<option value="${rfEsc(v)}" ${f[k] === v ? 'selected' : ''}>${rfEsc(t)}</option>`).join('')}</select>`;
  const testa = `${RF_MON_DEMO}<div class="page-head"><div><h2 class="page-title">Monitoraggio</h2><div class="page-sub">Monitoraggio remoto multiparametrico · <span id="rf-mon-agg">aggiornato alle ${rfMonOra(d.ora, true)}</span></div></div>
    <div class="actions"><label class="caption" style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${RF.mon.suoni ? 'checked' : ''} onchange="rfMonSuoni(this.checked)"> Suono per i nuovi avvisi di livello 2</label></div></div>${rfMonSchede()}`;
  if (RF.mon.scheda === 'avvisi') return `${testa}<div id="rf-mon-avvisi">${rfMonAvvisiHtml()}</div>`;
  if (RF.mon.scheda === 'regole') return testa + rfMonRegoleHtml();
  if (RF.mon.scheda === 'dispositivi') return testa + rfMonDispositiviHtml();
  if (RF.mon.scheda === 'simulatore') return testa + rfMonSimulatoreHtml();
  if (RF.mon.scheda === 'info') return testa + rfMonInfoHtml();
  return `${testa}<div id="rf-mon-riepilogo">${rfMonRiepilogoHtml()}</div>
    <div class="rf-mon-filtri"><input class="input grow" placeholder="Cerca per nome o codice" value="${rfEsc(f.q)}" oninput="rfMonFiltro('q', this.value)" style="min-width:200px">
      ${sel('medico', [['', 'Tutti i medici'], ...d.medici.map(m => [m, m])])}
      ${sel('stato', [['', 'Ogni stato del programma'], ['attivo', 'Monitoraggio attivo'], ['in_pausa', 'In pausa'], ['terminato', 'Terminato']])}
      ${sel('avvisi', [['', 'Ogni livello di avviso'], ['alta', 'Alta priorità (livello 2)'], ['attenzione', 'Attenzione (livello 1)'], ['tecnici', 'Problemi tecnici'], ['nessuno', 'Senza avvisi aperti']])}
      ${sel('conn', [['', 'Ogni connessione'], ['in_aggiornamento', 'In aggiornamento'], ['in_ritardo', 'Dati in ritardo'], ['interrotta', 'Connessione interrotta'], ['terminato', 'Monitoraggio non attivo']])}
      <select class="input" onchange="RF.mon.ordine=this.value;rfMonDipingiElenco()" title="Ordine delle righe">${[['priorita', 'Ordina per priorità'], ['nome', 'Ordina per nome'], ['ultimo', 'Ordina per ultima misura'], ['manuale', 'Ordine manuale']].map(([v, t]) => `<option value="${v}" ${RF.mon.ordine === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div id="rf-mon-elenco">${rfMonElencoHtml()}</div>`;
};

/* ---------- avvisi ---------- */
function rfMonTasti(a, puo) {
  if (!puo || a.stato === 'chiuso') return '';
  return `<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${a.stato === 'aperto' ? `<button class="btn sm primary" onclick="event.stopPropagation();rfMonAvviso('${a.id}','prendi')">Prendi in carico</button>` : ''}
    <button class="btn sm" onclick="event.stopPropagation();rfMonChiudi('${a.id}')">Chiudi…</button><button class="btn sm ghost" onclick="event.stopPropagation();rfMonNota('${a.id}')">Aggiungi una nota…</button></div>`;
}
async function rfMonAvviso(id, cosa, motivazione) {
  const r = await rfMonChiama({ azione: 'avviso', id, cosa, motivazione });
  if (!r) return false;
  toast(cosa === 'prendi' ? 'Avviso preso in carico' : cosa === 'chiudi' ? 'Avviso chiuso' : 'Nota aggiunta');
  await rfMonRicarica(); return true;
}
function rfMonChiudi(id) {
  openModal('Chiudi l\'avviso', `<p class="meta" style="margin:0 0 8px">Chiudere è un atto di chi cura: resta scritto chi, quando e perché. Il rientro del parametro non chiude l'avviso da solo.</p>
    <textarea class="input" id="rf-mon-mot" rows="3" style="width:100%" placeholder="Motivazione (obbligatoria)"></textarea>`,
    `<button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" onclick="rfMonChiudiOk('${id}')">Chiudi l'avviso</button>`);
}
async function rfMonChiudiOk(id) { const m = (document.getElementById('rf-mon-mot') || {}).value || ''; if (await rfMonAvviso(id, 'chiudi', m)) closeModal(); }
function rfMonNota(id) {
  openModal('Nota sull\'avviso', `<textarea class="input" id="rf-mon-mot" rows="3" style="width:100%" placeholder="Che cosa è stato fatto o verificato"></textarea>`,
    `<button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" onclick="rfMonNotaOk('${id}')">Aggiungi</button>`);
}
async function rfMonNotaOk(id) { const m = (document.getElementById('rf-mon-mot') || {}).value || ''; if (await rfMonAvviso(id, 'nota', m)) closeModal(); }
async function rfMonRicarica() {
  if (RF.mon.aperto) { await rfMonCaricaDet(); rfMonDipingiDet(); }
  else if (RF.mon.scheda === 'avvisi') { await rfMonAltra('avvisi'); const el = document.getElementById('rf-mon-avvisi'); if (el) el.innerHTML = rfMonAvvisiHtml(); }
  else { await rfMonCarica(); rfMonDipingiElenco(); }
}
function rfMonAvvisiHtml() {
  const x = RF.mon.altri.avvisi;
  if (!x) return '<div class="card"><div class="caption">Carico…</div></div>';
  if (x.errore) return '<div class="rf-manc">Non riesco a leggere gli avvisi.</div>';
  const riga = (a) => `<div class="rf-mon-avv ${a.stato === 'chiuso' ? 'chiuso' : ''}" style="cursor:pointer" onclick="rfMonApri('${a.paziente_id}')">
    <div class="row between" style="flex-wrap:wrap;gap:6px"><div>${rfMonLivello(a)} <b>${rfEsc(a.nome)}</b> · ${rfEsc(a.paziente || a.codice)} <span class="caption">${rfEsc(a.codice)}</span></div>
      <span class="badge ${a.stato === 'aperto' ? 'warning' : a.stato === 'in_carico' ? 'accent' : ''}">${RF_MON_STATO_AVV[a.stato]}${a.responsabile ? ` · ${rfEsc(a.responsabile)}` : ''}</span></div>
    ${a.spiegazione ? `<div style="font-size:13px;margin-top:4px">${rfEsc(a.spiegazione)}</div>` : ''}
    <div class="tempi">generato ${rfMonGiornoOra(a.generato_il)}${a.rientrato_il ? ` · rientrato ${rfMonOra(a.rientrato_il)}` : ''}${a.chiuso_il ? ` · chiuso ${rfMonOra(a.chiuso_il)}` : ''}${a.episodi > 1 ? ` · ${a.episodi} episodi` : ''} · ${a.notifiche} ${a.notifiche === 1 ? 'notifica interna' : 'notifiche interne'}${a.non_consegnate ? ` · notifica esterna non inviata (demo)` : ''}</div>
    ${rfMonTasti(a, x.puo && x.puo.prendere)}</div>`;
  const aperti = x.avvisi.filter(a => a.stato !== 'chiuso'), chiusi = x.avvisi.filter(a => a.stato === 'chiuso');
  return `<div class="card"><div class="card-head"><span class="section-title">Avvisi aperti e presi in carico</span><span class="badge count">${aperti.length}</span></div>
      <p class="rf-img-limite" style="margin:6px 0 0">Livello 1 = anomalia da verificare; livello 2 = da sottoporre rapidamente a chi è responsabile. Un valore oltre soglia non è una diagnosi né un'emergenza confermata. Le regole della demo sono illustrative.</p>
      ${aperti.length ? aperti.map(riga).join('') : '<div class="caption" style="margin-top:8px">Nessun avviso aperto.</div>'}</div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Chiusi nelle ultime 24 ore</span><span class="badge count">${chiusi.length}</span></div>${chiusi.length ? chiusi.map(riga).join('') : '<div class="caption" style="margin-top:8px">Nessuno.</div>'}</div>`;
}

/* ---------- dettaglio del paziente ---------- */
async function rfMonApri(id) {
  RF.mon.aperto = id; RF.mon.det = null; RF.mon.ai = null; RF.mon.cursore = null; RF.mon.ecg = { pezzi: [], fine: 0, pausa: null, vivo: false, ultimoPezzo: 0 };
  render(); window.scrollTo(0, 0);
  await rfMonCaricaDet(); render();
}
function rfMonChiudiDet() { RF.mon.aperto = null; RF.mon.det = null; RF.mon.ecg.vivo = false; void rfMonCarica().then(() => render()); render(); }
function rfMonQuery() {
  if (RF.mon.intervallo === 'su misura' && RF.mon.da && RF.mon.a) return `da=${encodeURIComponent(new Date(RF.mon.da).toISOString())}&a=${encodeURIComponent(new Date(RF.mon.a).toISOString())}`;
  return `intervallo=${RF.mon.intervallo}`;
}
async function rfMonCaricaDet() {
  const id = RF.mon.aperto; if (!id) return;
  try {
    const r = await fetch(`${RF_MON_URL}/${id}?${rfMonQuery()}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { RF.mon.errore = `Paziente non leggibile (${r.status}).`; return; }
    const j = await r.json();
    if (RF.mon.aperto !== id) return;
    RF.mon.sfasamento = new Date(j.ora).getTime() - Date.now();
    RF.mon.det = j; RF.mon.errore = null;
  } catch { RF.mon.errore = 'Piattaforma non raggiungibile: i dati qui sotto non si stanno aggiornando.'; }
}
function rfMonIntervallo(v) { RF.mon.intervallo = v; if (v !== 'su misura') { void rfMonCaricaDet().then(() => render()); } else render(); }
function rfMonSuMisura() {
  RF.mon.da = (document.getElementById('rf-mon-da') || {}).value || ''; RF.mon.a = (document.getElementById('rf-mon-a') || {}).value || '';
  if (!RF.mon.da || !RF.mon.a || new Date(RF.mon.a) <= new Date(RF.mon.da)) { toast('Scegli un inizio e una fine validi'); return; }
  void rfMonCaricaDet().then(() => render());
}
// Aggiorna i pezzi vivi del dettaglio senza ridisegnare la pagina (né toccare i campi).
function rfMonDipingiDet() {
  const d = RF.mon.det; if (!d) return;
  const pezzi = { 'rf-mon-d-carte': rfMonCarteHtml, 'rf-mon-d-graf': rfMonGraficiHtml, 'rf-mon-d-avv': rfMonRegistroHtml, 'rf-mon-d-disp': rfMonDispDetHtml, 'rf-mon-d-testa': rfMonTestaDetHtml };
  for (const [id, fn] of Object.entries(pezzi)) { const el = document.getElementById(id); if (el) el.innerHTML = fn(); }
  rfMonCursore();
}
function rfMonTestaDetHtml() {
  const d = RF.mon.det, p = d.paziente;
  const stato = p.programma === 'attivo' ? 'Monitoraggio attivo' : p.programma === 'in_pausa' ? 'Monitoraggio in pausa' : `Monitoraggio terminato${p.terminato_il ? ` il ${rfMonGiornoOra(p.terminato_il)}` : ''}`;
  return `<div class="page-sub">${rfEsc(p.codice)} · ${rfEsc(p.medico || 'senza medico responsabile')} · ${stato} · ultima misura ${p.ultimo_dato ? `${rfMonOra(p.ultimo_dato, true)} (${rfMonFa((rfMonAdesso() - new Date(p.ultimo_dato).getTime()) / 1000)})` : 'nessuna'}
    ${d.silenzio_fino ? ` · 🔕 richiami silenziati fino alle ${rfMonOra(d.silenzio_fino)}` : ''}</div>`;
}
function rfMonCarteHtml() {
  const d = RF.mon.det;
  if (d.vista_tecnica) return '<div class="caption">Vista tecnica: lo stato dei dispositivi, non i valori del paziente.</div>';
  if (!d.parametri.length) return '<div class="caption">Nessun dispositivo abbinato: nessun parametro disponibile.</div>';
  return `<div class="rf-mon-carte">${d.parametri.map(v => {
    const val = v.tipo === 'categoria' ? rfEsc(v.testo || '—') : rfMonNum(v.valore, v.decimali);
    return `<div class="rf-mon-carta ${v.oltre ? 'oltre' : ''} ${v.vecchio ? 'vecchio' : ''}"><div class="l">${rfEsc(v.nome)}</div>
      <div class="v">${v.valore == null && !v.testo ? '<span style="font-size:14px;font-weight:400;color:var(--text-3)">nessun dato</span>' : `${val}<small>${rfEsc(v.unita)}</small>`}</div>
      <div class="m">${v.quando ? `${rfMonOra(v.quando, true)} · ${rfMonFa(v.eta_s)}${v.vecchio ? ' · <b>non aggiornato</b>' : ''}` : 'mai misurato'}<br>${v.modo === 'intermittente' ? `a intervalli (ogni ${Math.round(v.intervallo_s / 60)} min)` : 'continuo'} · ${v.qualita == null ? 'qualità non dichiarata' : `qualità ${v.qualita}/100`}
        <br>${rfEsc(v.dispositivo || '')}${v.fonte ? ` · ${rfEsc(v.fonte)}` : ''}${v.recuperata ? ' · dato recuperato dopo una disconnessione' : ''}<br><i>simulato</i>${v.nota ? ` · ${rfEsc(v.nota)}` : ''}</div></div>`;
  }).join('')}</div>`;
}
function rfMonDispDetHtml() {
  const d = RF.mon.det;
  const cap = (c) => `${rfEsc((c.nome || c.parametro))}: ${c.modo === 'continuo' ? 'continuo' : 'a intervalli'}${c.campionamento_hz ? `, ${c.campionamento_hz} Hz` : `, ogni ${c.intervallo_s >= 60 ? `${Math.round(c.intervallo_s / 60)} min` : `${c.intervallo_s} s`}`}, invio ogni ${c.invio_s >= 60 ? `${Math.round(c.invio_s / 60)} min` : `${c.invio_s} s`}${c.memoria ? ', tiene i dati se scollegato' : ''}`;
  return d.dispositivi.length ? d.dispositivi.map(x => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(x.modello)} <span class="badge">${rfEsc(x.tipo)}</span> ${x.connesso ? '<span class="badge success">collegato</span>' : '<span class="badge warning">non collegato</span>'}${x.sensore_applicato === false ? ' <span class="badge warning">sensore non applicato</span>' : ''}</div>
      <div class="sub">${rfEsc(x.seriale)} · adattatore «${rfEsc(x.adattatore)}» · batteria ${x.batteria == null ? 'non disponibile' : `${x.batteria}%`} · ultimo contatto ${x.ultimo_contatto ? rfMonOra(x.ultimo_contatto, true) : 'mai'} · abbinato dal ${rfMonGiornoOra(x.abbinato_dal)}${x.errore ? ` · <b>errore dell'integrazione</b>` : ''}</div>
      <div class="caption">${x.capacita.map(c => cap({ ...c, nome: { ecg: 'ECG', fc: 'FC', spo2: 'SpO₂', fr: 'FR', temp_cutanea: 'T cutanea', attivita: 'attività', postura: 'postura', ritmo: 'ritmo', pa_sistolica: 'PA sistolica', pa_diastolica: 'PA diastolica' }[c.parametro] })).join(' · ')}</div></div></div>`).join('')
    : '<div class="caption">Nessun dispositivo abbinato in questo momento.</div>';
}

/* Grafici storici sincronizzati: stessa scala dei tempi, un cursore solo. */
function rfMonGrafico(s, da, a) {
  const W = 1000, H = 120, mL = 44, mR = 8, mT = 8, mB = 18;
  const p = s.punti, x = (t) => mL + ((t - da) / (a - da)) * (W - mL - mR);
  if (!p.length) return `<div class="rf-mon-graf" data-par="${s.codice}"><div class="tit"><b>${rfEsc(s.nome)}</b><span class="let">nessuna misura in questo intervallo</span></div><svg viewBox="0 0 ${W} 40" preserveAspectRatio="none" style="height:40px"></svg></div>`;
  let lo = Math.min(...p.map(q => q[2])), hi = Math.max(...p.map(q => q[3]));
  // Una soglia vicina ai dati si disegna; una lontana si nomina e basta, se no schiaccerebbe la curva.
  const largo = Math.max(hi - lo, s.decimali ? 1 : 12), vicine = s.soglie.filter(g => g.soglia >= lo - largo && g.soglia <= hi + largo), lontane = s.soglie.filter(g => !vicine.includes(g));
  for (const g of vicine) { lo = Math.min(lo, g.soglia); hi = Math.max(hi, g.soglia); }
  const margine = Math.max((hi - lo) * 0.12, s.decimali ? 0.4 : 2); lo -= margine; hi += margine;
  const y = (v) => mT + (1 - (v - lo) / (hi - lo)) * (H - mT - mB);
  const buco = Math.max(s.passo_s, s.intervallo_s) * 2500;
  let linea = '', punti = '', prima = null;
  for (const q of p) {
    // Dove non ci sono misure la linea si interrompe; le misure a intervalli sono punti, non una linea.
    if (s.modo === 'continuo') linea += `${prima != null && q[0] - prima <= buco ? 'L' : 'M'}${x(q[0]).toFixed(1)} ${y(q[1]).toFixed(1)} `;
    if (s.modo === 'intermittente' || q[5]) punti += `<circle cx="${x(q[0]).toFixed(1)}" cy="${y(q[1]).toFixed(1)}" r="${s.modo === 'intermittente' ? 3 : 2}" style="fill:${q[5] ? 'none' : 'var(--cta, var(--accent, #0d5c48))'};stroke:var(--cta, var(--accent, #0d5c48))" stroke-width="1"/>`;
    prima = q[0];
  }
  // I buchi, resi visibili: una fascia grigia dove il monitoraggio continuo non ha dati.
  let fasce = '';
  if (s.modo === 'continuo') {
    let t = da;
    for (const q of [...p, [a]]) { if (q[0] - t > buco) fasce += `<rect x="${x(t).toFixed(1)}" y="${mT}" width="${(x(q[0]) - x(t)).toFixed(1)}" height="${H - mT - mB}" style="fill:var(--text-3)" opacity=".10"/>`; t = q[0]; }
  }
  const tacche = [lo + margine, (lo + hi) / 2, hi - margine].map(v => `<text x="${mL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${rfMonNum(v, s.decimali)}</text><line x1="${mL}" x2="${W - mR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" style="stroke:var(--border)" stroke-width=".6"/>`).join('');
  const ore = [0, 0.25, 0.5, 0.75, 1].map(f => `<text x="${(mL + f * (W - mL - mR)).toFixed(1)}" y="${H - 4}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${rfMonOra(da + f * (a - da), a - da < 3600000 * 2)}</text>`).join('');
  const soglie = vicine.map(g => `<line x1="${mL}" x2="${W - mR}" y1="${y(g.soglia).toFixed(1)}" y2="${y(g.soglia).toFixed(1)}" stroke="${g.livello === 2 ? '#b3261e' : '#9a6200'}" stroke-width="1" stroke-dasharray="5 4" opacity=".75"/>
    <text x="${W - mR - 2}" y="${(y(g.soglia) - 3).toFixed(1)}" text-anchor="end" style="fill:${g.livello === 2 ? '#b3261e' : '#9a6200'}">${g.verso} ${rfMonNum(g.soglia, s.decimali)} · L${g.livello}${g.personale ? ' · soglia del paziente' : ''}${g.illustrativa ? ' · illustrativa' : ''}</text>`).join('');
  return `<div class="rf-mon-graf" data-par="${s.codice}" id="rf-mon-g-${s.codice}"><div class="tit"><span><b>${rfEsc(s.nome)}</b> <span class="caption">${rfEsc(s.unita)} · ${s.modo === 'continuo' ? 'continuo' : `a intervalli (ogni ${Math.round(s.intervallo_s / 60)} min)`} · simulato${s.passo_s > s.intervallo_s ? ` · media su ${s.passo_s >= 60 ? `${Math.round(s.passo_s / 60)} min` : `${s.passo_s} s`}` : ''}${lontane.length ? ` · soglie fuori scala: ${lontane.map(g => `${g.verso} ${rfMonNum(g.soglia, s.decimali)} (L${g.livello})`).join(', ')}` : ''}</span></span>
      <span class="let" data-let></span>${RF.mon.det.puo.regole && s.soglie.length ? `<button class="btn sm ghost" onclick="rfMonSoglie('${s.codice}')">Soglie del paziente…</button>` : ''}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:120px;display:block" onmousemove="rfMonMuovi(event, this)" onmouseleave="RF.mon.cursore=null;rfMonCursore()">${tacche}${fasce}${soglie}
      <path d="${linea}" fill="none" style="stroke:var(--cta, var(--accent, #0d5c48))" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${punti}${ore}
      <line data-cur x1="0" x2="0" y1="${mT}" y2="${H - mB}" style="stroke:var(--text-2)" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/></svg></div>`;
}
function rfMonGraficiHtml() {
  const d = RF.mon.det;
  if (d.vista_tecnica) return '<div class="caption">Vista tecnica: i grafici dei parametri li vede chi cura.</div>';
  const da = new Date(d.intervallo.da).getTime(), a = new Date(d.intervallo.a).getTime();
  const cat = {};
  for (const c of d.categorie) (cat[c.parametro] ??= { nome: c.nome, fonte: c.fonte, voci: [] }).voci.push(c);
  const colori = { regolare: '#8fcdb6', irregolare: '#e6c27a', supino: '#b9c8e0', seduto: '#cfd8c4', 'in piedi': '#e3d3b0', 'in cammino': '#e0b9a8' };
  const bande = Object.entries(cat).map(([k, c]) => {
    const passo = Math.max(60000, (a - da) / 240);
    const r = c.voci.map(v => { const t = new Date(v.quando).getTime(); return `<rect x="${(44 + ((t - da) / (a - da)) * 948).toFixed(1)}" y="2" width="${Math.max(1.5, (passo / (a - da)) * 948).toFixed(1)}" height="12" fill="${colori[v.testo] || '#ccc'}"><title>${rfEsc(v.testo)} · ${rfMonOra(v.quando, true)}</title></rect>`; }).join('');
    const visti = [...new Set(c.voci.map(v => v.testo))];
    return `<div class="rf-mon-graf"><div class="tit"><span><b>${rfEsc(c.nome)}</b> <span class="caption">${c.fonte ? `fonte: ${rfEsc(c.fonte)}` : ''} · simulato</span></span><span class="caption">${visti.map(v => `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colori[v] || '#ccc'};margin:0 4px 0 8px"></span>${rfEsc(v)}`).join('')}</span></div>
      <svg viewBox="0 0 1000 16" preserveAspectRatio="none" style="height:16px">${r}</svg></div>`;
  }).join('');
  return (d.serie.length ? d.serie.map(s => rfMonGrafico(s, da, a)).join('') : '<div class="caption">Nessun parametro numerico per questo paziente.</div>') + bande
    + '<p class="rf-img-limite">Linea = misure continue; punti = misure a intervalli; fascia grigia = nessuna misura in quel periodo (la linea non la attraversa); cerchi vuoti = dati arrivati dopo, alla riconnessione; linee tratteggiate = soglie delle regole configurate. Tutti i valori sono simulati.</p>';
}
function rfMonMuovi(e, svg) {
  const d = RF.mon.det; if (!d) return;
  const r = svg.getBoundingClientRect(), fx = ((e.clientX - r.left) / r.width) * 1000;
  const da = new Date(d.intervallo.da).getTime(), a = new Date(d.intervallo.a).getTime();
  RF.mon.cursore = da + Math.max(0, Math.min(1, (fx - 44) / 948)) * (a - da);
  rfMonCursore();
}
// Il cursore è uno per tutti i grafici: stesso istante, valori di ogni parametro.
function rfMonCursore() {
  const d = RF.mon.det; if (!d) return;
  const t = RF.mon.cursore, da = new Date(d.intervallo.da).getTime(), a = new Date(d.intervallo.a).getTime();
  for (const s of d.serie) {
    const box = document.getElementById(`rf-mon-g-${s.codice}`); if (!box) continue;
    const cur = box.querySelector('[data-cur]'), let_ = box.querySelector('[data-let]');
    if (t == null) { if (cur) cur.setAttribute('visibility', 'hidden'); if (let_) let_.textContent = ''; continue; }
    const x = 44 + ((t - da) / (a - da)) * 948;
    if (cur) { cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible'); }
    let vicino = null;
    for (const q of s.punti) if (!vicino || Math.abs(q[0] - t) < Math.abs(vicino[0] - t)) vicino = q;
    const lim = Math.max(s.passo_s, s.intervallo_s) * 1500;
    if (let_) let_.textContent = vicino && Math.abs(vicino[0] - t) <= lim ? `${rfMonOra(vicino[0], true)} · ${rfMonNum(vicino[1], s.decimali)} ${s.unita}${vicino[4] != null ? ` · qualità ${vicino[4]}` : ''}` : `${rfMonOra(t, true)} · nessuna misura`;
  }
}

/* ECG: il tracciato scorre con qualche secondo di ritardo (i pezzi arrivano ogni
   5 s). In pausa la VISTA si ferma; l'acquisizione continua e lo si dice. */
const RF_MON_ECG_FINESTRA = 8000, RF_MON_ECG_RITARDO = 11000;
async function rfMonEcgPrendi() {
  const e = RF.mon.ecg, id = RF.mon.aperto;
  if (!id || !RF.mon.det || !RF.mon.det.ecg.disponibile) return;
  const da = new Date(e.fine || (rfMonAdesso() - 30000)).toISOString();
  try {
    const r = await fetch(`${RF_MON_URL}/${id}?ecg=1&da=${encodeURIComponent(da)}&secondi=60`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok || RF.mon.aperto !== id) return;
    const j = await r.json();
    for (const p of j.pezzi) {
      const inizio = new Date(p.inizio).getTime();
      if (e.pezzi.some(x => x.inizio === inizio)) continue;
      const b = atob(p.campioni), n = b.length / 2, v = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = b.charCodeAt(i * 2) | (b.charCodeAt(i * 2 + 1) << 8); if (s > 32767) s -= 65536; v[i] = s * p.mv_per_unita; }
      e.pezzi.push({ inizio, hz: p.hz, v, qualita: p.qualita, derivazione: p.derivazione });
      e.fine = Math.max(e.fine, inizio + (n / p.hz) * 1000); e.ultimoPezzo = Date.now();
    }
    e.pezzi.sort((x, y) => x.inizio - y.inizio);
    while (e.pezzi.length > 60) e.pezzi.shift();   // cinque minuti in memoria, non di più
  } catch { /* al prossimo giro */ }
}
function rfMonEcgAvvia() {
  const e = RF.mon.ecg; if (e.vivo) return;
  e.vivo = true;
  const prendi = async () => { if (!e.vivo || RF.mon.ecg !== e || state.route !== 'monitoraggio' || !RF.mon.aperto) { e.vivo = false; return; } await rfMonEcgPrendi(); setTimeout(prendi, 2500); };
  const disegna = () => { if (!e.vivo || RF.mon.ecg !== e) return; rfMonEcgDisegna(); requestAnimationFrame(disegna); };
  void prendi(); requestAnimationFrame(disegna);
}
function rfMonEcgPausa() {
  const e = RF.mon.ecg;
  e.pausa = e.pausa == null ? rfMonAdesso() - RF_MON_ECG_RITARDO : null;
  const b = document.getElementById('rf-mon-ecg-pausa'); if (b) b.textContent = e.pausa == null ? 'Pausa' : 'Riprendi';
}
function rfMonEcgIndietro(s) { const e = RF.mon.ecg; if (e.pausa != null) e.pausa = Math.min(rfMonAdesso() - RF_MON_ECG_RITARDO, Math.max((e.pezzi[0] ? e.pezzi[0].inizio : e.pausa) + RF_MON_ECG_FINESTRA, e.pausa + s * 1000)); }
function rfMonEcgDisegna() {
  const c = document.getElementById('rf-mon-ecg'); if (!c) return;
  const e = RF.mon.ecg, dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const fine = e.pausa != null ? e.pausa : rfMonAdesso() - RF_MON_ECG_RITARDO, inizio = fine - RF_MON_ECG_FINESTRA;
  const X = (t) => ((t - inizio) / RF_MON_ECG_FINESTRA) * w, mv = 2.4, Y = (v) => h / 2 + 22 - (v / mv) * (h / 2);
  // griglia: 0,2 s in orizzontale, 0,5 mV in verticale
  g.lineWidth = 1;
  for (let t = Math.ceil(inizio / 200) * 200; t < fine; t += 200) { g.strokeStyle = t % 1000 === 0 ? 'rgba(200,120,110,.42)' : 'rgba(200,120,110,.18)'; g.beginPath(); g.moveTo(X(t), 0); g.lineTo(X(t), h); g.stroke(); }
  for (let v = -2; v <= 2.5; v += 0.5) { g.strokeStyle = 'rgba(200,120,110,.22)'; g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke(); }
  let coperto = false, scarso = false;
  g.strokeStyle = getComputedStyle(c).color || '#1d2b26'; g.lineWidth = 1.3; g.lineJoin = 'round';
  for (const p of e.pezzi) {
    const durata = (p.v.length / p.hz) * 1000;
    if (p.inizio + durata < inizio || p.inizio > fine) continue;
    coperto = true; if (p.qualita != null && p.qualita < 45) scarso = true;
    g.beginPath(); let primo = true;
    for (let i = 0; i < p.v.length; i++) { const t = p.inizio + (i / p.hz) * 1000; if (t < inizio || t > fine) continue; if (primo) { g.moveTo(X(t), Y(p.v[i])); primo = false; } else g.lineTo(X(t), Y(p.v[i])); }
    g.stroke();
  }
  // Dove manca un pezzo il tracciato NON si raccorda: resta vuoto, e lo si scrive.
  const inchiostro = getComputedStyle(c).color || '#444';
  g.globalAlpha = 0.7; g.fillStyle = inchiostro; g.font = '11px system-ui';
  if (!coperto) g.fillText(e.pezzi.length ? 'Nessun tracciato in questo intervallo' : 'In attesa del tracciato…', 12, h / 2);
  g.fillText(`${rfMonOra(inizio, true)}`, 6, h - 6); const tf = rfMonOra(fine, true); g.fillText(tf, w - g.measureText(tf).width - 6, h - 6);
  if (scarso) g.fillText('segnale di qualità insufficiente', w / 2 - 80, 14);
  g.globalAlpha = 1;
  const pa = document.getElementById('rf-mon-ecg-stato');
  if (pa) {
    const arrivati = e.pausa != null ? Math.max(0, Math.round((rfMonAdesso() - RF_MON_ECG_RITARDO - e.pausa) / 1000)) : 0;
    pa.style.display = e.pausa != null ? '' : 'none';
    pa.textContent = `VISUALIZZAZIONE IN PAUSA — l'acquisizione continua (+${arrivati} s non mostrati)`;
  }
}
function rfMonEcgHtml() {
  const d = RF.mon.det, e = d.ecg;
  if (!e.disponibile) return `<div class="card mt-16"><div class="section-title">ECG</div><div class="caption mt-8">${d.vista_tecnica ? 'Vista tecnica: il tracciato lo vede chi cura.' : 'Nessuno dei dispositivi di questo paziente registra un tracciato ECG: il parametro non è disponibile.'}</div></div>`;
  setTimeout(rfMonEcgAvvia, 0);
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">ECG · tracciato simulato</span>
      <span><button class="btn sm ghost" onclick="rfMonEcgIndietro(-5)" title="In pausa: 5 secondi indietro">◀ 5 s</button><button class="btn sm ghost" onclick="rfMonEcgIndietro(5)" title="In pausa: 5 secondi avanti">5 s ▶</button>
      <button class="btn sm" id="rf-mon-ecg-pausa" onclick="rfMonEcgPausa()">${RF.mon.ecg.pausa == null ? 'Pausa' : 'Riprendi'}</button></span></div>
    <div class="rf-mon-ecg mt-8"><canvas id="rf-mon-ecg"></canvas><div class="pausa" id="rf-mon-ecg-stato" style="display:none"></div></div>
    <div class="caption" style="margin-top:6px">Derivazione ${rfEsc(e.derivazione || '—')} · campionamento ${e.hz || '—'} Hz · risoluzione ${e.mv_per_unita ? String(e.mv_per_unita * 1000).replace('.', ',') : '—'} µV · griglia 0,2 s × 0,5 mV · finestra di 8 s mostrata con circa 11 s di ritardo sull'acquisizione.</div>
    <p class="rf-img-limite">Solo visualizzazione: questo riquadro non misura intervalli, non riconosce ritmi e non ha funzioni diagnostiche. Una classificazione del ritmo compare solo se la fornisce un algoritmo dedicato, con la sua fonte: qui è quella del simulatore.</p></div>`;
}
function rfMonRegistroHtml() {
  const d = RF.mon.det;
  const passo = (z) => { const nomi = { 'sistema:generato': 'avviso generato', 'sistema:rientrato': 'rientrato', 'sistema:ricaduta': 'anomalia tornata', preso_in_carico: 'preso in carico', chiuso: 'chiuso', nota: 'nota' };
    return `${rfMonOra(z.quando, true)} · <b>${nomi[z.azione] || rfEsc(z.azione)}</b>${z.chi ? ` da ${rfEsc(z.chi)}` : z.azione.startsWith('sistema:') ? ' dal motore delle regole' : ''}${z.motivazione ? ` — ${rfEsc(z.motivazione)}` : ''}`; };
  if (!d.avvisi.length) return '<div class="caption">Nessun avviso per questo paziente nell\'intervallo.</div>';
  return d.avvisi.map(a => {
    const interne = a.notifiche.filter(n => n.canale === 'interna').length, esterne = a.notifiche.filter(n => n.canale === 'esterna');
    return `<div class="rf-mon-avv ${a.stato === 'chiuso' ? 'chiuso' : ''}" id="rf-mon-a-${a.id}"><div class="row between" style="flex-wrap:wrap;gap:6px"><div>${rfMonLivello(a)} <b>${rfEsc(a.nome)}</b></div>
        <span class="badge ${a.stato === 'aperto' ? 'warning' : a.stato === 'in_carico' ? 'accent' : ''}">${RF_MON_STATO_AVV[a.stato]}${a.responsabile ? ` · ${rfEsc(a.responsabile)}` : ''}</span></div>
      ${a.spiegazione ? `<div style="font-size:13px;margin-top:4px">${rfEsc(a.spiegazione)}</div>` : '<div class="caption">Vista tecnica: il dettaglio dei valori lo vede chi cura.</div>'}
      <div class="tempi">misura ${rfMonOra(a.misurato_il, true)} · ricezione ${rfMonOra(a.ricevuto_il, true)} · avviso generato ${rfMonOra(a.generato_il, true)}${a.segmento_da ? ` · segmento ${rfMonOra(a.segmento_da, true)}–${rfMonOra(a.segmento_a, true)}` : ''} · regola «${rfEsc(a.regola_chiave)}» v${a.regola_versione}${a.episodi > 1 ? ` · ${a.episodi} episodi` : ''}</div>
      <div class="tempi">${a.rientrato_il ? `Parametro rientrato alle ${rfMonOra(a.rientrato_il, true)}: l'avviso resta finché una persona non lo chiude. ` : ''}Notifiche: ${interne} ${interne === 1 ? 'interna consegnata' : 'interne consegnate'}${esterne.length ? ` · esterna <b>non inviata</b> (${rfEsc(esterne[0].motivo || 'demo')})` : ''}</div>
      <div class="passi">${a.azioni.map(passo).join('<br>')}</div>${rfMonTasti(a, d.puo.prendere)}</div>`;
  }).join('');
}
async function rfMonSilenzia(min) { const r = await rfMonChiama({ azione: 'silenzia', paziente: RF.mon.aperto, minuti: min }); if (r) { toast(min ? `Richiami silenziati per ${min} minuti: acquisizione e avvisi continuano` : 'Silenzio tolto'); await rfMonRicarica(); } }
function rfMonSoglie(codice) {
  const d = RF.mon.det, s = d.serie.find(x => x.codice === codice); if (!s) return;
  openModal(`Soglie di ${d.paziente.nome || d.paziente.codice} · ${s.nome}`, `<p class="meta" style="margin:0 0 8px">Valgono solo per questo paziente e non toccano la regola di tutti. Ogni modifica finisce nel registro. Nella demo le regole sono illustrative.</p>
    <table class="rf-mon-tab"><tr><th>Regola</th><th>Soglia (${rfEsc(s.unita)})</th><th>Rientro</th><th>Spenta</th></tr>${s.soglie.map(g => `<tr><td>${rfEsc(g.nome)} · L${g.livello} · ${g.verso}</td>
      <td><input class="input" type="number" step="any" id="rf-mon-s-${g.chiave}" value="${g.soglia}"></td><td><input class="input" type="number" step="any" id="rf-mon-r-${g.chiave}" value="${g.rientro == null ? '' : g.rientro}"></td>
      <td><input type="checkbox" id="rf-mon-x-${g.chiave}"></td></tr>`).join('')}</table>`,
    `<button class="btn" onclick="closeModal()">Annulla</button><button class="btn ghost" onclick="rfMonSoglieOk('${codice}', true)">Torna alle soglie di tutti</button><button class="btn primary" onclick="rfMonSoglieOk('${codice}')">Salva</button>`);
}
async function rfMonSoglieOk(codice, togli) {
  const s = RF.mon.det.serie.find(x => x.codice === codice); let ok = true;
  for (const g of s.soglie) {
    const v = (id) => { const e = document.getElementById(`rf-mon-${id}-${g.chiave}`); return e ? (e.type === 'checkbox' ? e.checked : e.value === '' ? null : Number(e.value)) : null; };
    const r = await rfMonChiama({ azione: 'soglia_paziente', paziente: RF.mon.aperto, chiave: g.chiave, ...(togli ? { togli: true } : { soglia: v('s'), rientro: v('r'), spenta: v('x') }) });
    if (!r) { ok = false; break; }
  }
  if (ok) { closeModal(); toast('Soglie del paziente salvate'); await rfMonCaricaDet(); render(); }
}
/* L'assistente: riassume i dati, non decide. Dice sempre da dove viene il testo. */
async function rfMonAi(domanda) {
  const d = RF.mon.det; if (!d || RF.mon.aiCarico) return;
  RF.mon.aiCarico = true; rfMonAiDipingi();
  const r = await rfMonChiama({ azione: 'assistente', paziente: RF.mon.aperto, da: d.intervallo.da, a: d.intervallo.a, domanda: domanda || undefined });
  RF.mon.aiCarico = false; if (r) RF.mon.ai = { ...r, domanda: domanda || null };
  rfMonAiDipingi();
}
function rfMonAiChiedi() { const q = ((document.getElementById('rf-mon-ai-q') || {}).value || '').trim(); if (q) void rfMonAi(q); }
function rfMonVai(tipo, rif) { const el = document.getElementById(tipo === 'avviso' ? `rf-mon-a-${rif}` : `rf-mon-g-${rif}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--cta, var(--accent, #0d5c48))'; setTimeout(() => { el.style.outline = ''; }, 1800); } }
function rfMonAiHtml() {
  const x = RF.mon.ai;
  if (RF.mon.aiCarico) return '<div class="caption">Calcolo i dati dell\'intervallo e scrivo il riassunto… (col modello locale può volerci fino a un minuto)</div>';
  if (!x) return '<div class="caption">Nessun riassunto ancora. Usa i tasti qui sopra: si riassume l\'intervallo mostrato nei grafici.</div>';
  return `${x.domanda ? `<div class="caption">Domanda: «${rfEsc(x.domanda)}»</div>` : ''}<div class="rf-mon-ai">${rfEsc(x.testo)}</div>
    <div class="caption" style="margin-top:8px"><b>${x.fonte === 'modello_locale' ? `Scritto dall'AI locale dello studio (${rfEsc(x.modello || '')}) a partire dai dati calcolati` : 'Composto da un modello fisso, senza AI'}</b>${x.nota ? ` — ${rfEsc(x.nota)}` : ''}</div>
    <div class="caption">Periodo analizzato: dal ${rfEsc(x.periodo.da)} al ${rfEsc(x.periodo.a)} · dati usati: ${x.dati_usati.length ? x.dati_usati.map(p => `${rfEsc(p.nome)} (${p.misure} misure, copre il ${p.copertura_pct}%)`).join(', ') : 'nessuna misura'}</div>
    ${x.collegamenti.length ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${x.collegamenti.map(c => `<button class="btn sm ghost" onclick="rfMonVai('${c.tipo}','${rfEsc(c.riferimento)}')">${rfEsc(c.etichetta)}</button>`).join('')}</div>` : ''}
    ${x.limiti.length ? `<div class="caption" style="margin-top:6px">Limiti dei dati: ${x.limiti.map(rfEsc).join(' ')}</div>` : ''}
    <p class="rf-img-limite">${rfEsc(x.avvertenza)}</p>`;
}
function rfMonAiDipingi() { const el = document.getElementById('rf-mon-ai'); if (el) el.innerHTML = rfMonAiHtml(); }
function rfMonSimPazHtml() {
  const t = (cosa, testo, tipo) => `<button class="btn sm" onclick="rfMonSim('${cosa}', ${tipo ? `'${tipo}'` : 'null'})">${testo}</button>`;
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Simulatore · questo paziente</span><span class="badge">solo demo</span></div>
    <div class="caption mt-8">Provoca uno scenario: i valori cambiano gradualmente e l'avviso illustrativo scatta quando la regola è soddisfatta (di solito 1–3 minuti).</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${t('evento', 'FC alta a riposo', 'tachicardia_riposo')}${t('evento', 'FC molto alta', 'tachicardia')}${t('evento', 'FC bassa', 'bradicardia')}${t('evento', 'Saturazione in discesa', 'desaturazione')}${t('evento', 'Temperatura in salita', 'febbre')}${t('evento', 'Pressione alta', 'ipertensione')}${t('evento', 'Ritmo irregolare', 'ritmo_irregolare')}${t('normalizza', 'Torna alla norma')}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${t('interrompi', 'Interrompi la connessione')}${t('riconnetti', 'Riconnetti (recupera i dati)')}${t('degrada', 'Degrada il segnale')}${t('segnale_buono', 'Segnale buono')}${t('batteria_bassa', 'Batteria bassa')}${t('batteria_carica', 'Batteria carica')}${t('stacca_sensore', 'Stacca il sensore')}${t('riapplica_sensore', 'Riapplica il sensore')}${t('ritarda', 'Ritarda i dati di 5 min')}${t('senza_ritardo', 'Senza ritardo')}</div></div>`;
}
async function rfMonSim(cosa, tipo, paziente) {
  const r = await rfMonChiama({ azione: 'simulatore', cosa, tipo, paziente: paziente || RF.mon.aperto });
  if (r) { toast('Scenario applicato: l\'effetto si vede nei prossimi aggiornamenti'); await rfMonRicarica(); }
}
function rfMonDettaglio() {
  const d = RF.mon.det;
  if (!d) return `${RF_MON_DEMO}<div class="page-head"><div><h2 class="page-title">Monitoraggio</h2></div><div class="actions"><button class="btn" onclick="rfMonChiudiDet()">Indietro</button></div></div><div class="card"><div class="caption">${RF.mon.errore ? rfEsc(RF.mon.errore) : 'Carico…'}</div></div>`;
  const p = d.paziente, iv = RF.mon.intervallo;
  const adessoLocale = (ms) => { const x = new Date(ms - new Date().getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
  return `${RF_MON_DEMO}<div class="page-head"><div><h2 class="page-title">${rfEsc(p.nome || p.codice)}</h2><div id="rf-mon-d-testa">${rfMonTestaDetHtml()}</div></div>
      <div class="actions">${d.puo.prendere ? (d.silenzio_fino ? `<button class="btn" onclick="rfMonSilenzia(0)">Togli il silenzio</button>` : `<select class="input" onchange="if(this.value){rfMonSilenzia(Number(this.value));this.value=''}" title="Tace il richiamo sonoro e visivo; acquisizione, regole e registrazione continuano"><option value="">Silenzia i richiami…</option><option value="15">per 15 minuti</option><option value="30">per 30 minuti</option><option value="60">per 60 minuti</option></select>`) : ''}
        ${p.cartella ? `<button class="btn" data-go="#/patients/${p.cartella}">Cartella del paziente</button>` : '<button class="btn" disabled title="Paziente dimostrativo: non ha una cartella. Coi dati reali qui si apre la cartella, se il tuo ruolo la vede.">Cartella (non in demo)</button>'}
        <button class="btn" onclick="rfMonChiudiDet()">Indietro</button></div></div>
    ${RF.mon.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.mon.errore)}</div>` : ''}
    <div id="rf-mon-d-carte">${rfMonCarteHtml()}</div>
    ${rfMonEcgHtml()}
    <div class="card mt-16"><div class="card-head"><span class="section-title">Andamento</span>
        <div class="seg">${[['15m', '15 min'], ['1h', '1 ora'], ['6h', '6 ore'], ['24h', '24 ore'], ['su misura', 'Periodo…']].map(([v, t]) => `<button class="${iv === v ? 'active' : ''}" onclick="rfMonIntervallo('${v}')">${t}</button>`).join('')}</div></div>
      ${iv === 'su misura' ? `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><input class="input" type="datetime-local" id="rf-mon-da" value="${rfEsc(RF.mon.da || adessoLocale(Date.now() - 7200000))}"><input class="input" type="datetime-local" id="rf-mon-a" value="${rfEsc(RF.mon.a || adessoLocale(Date.now()))}"><button class="btn sm" onclick="rfMonSuMisura()">Mostra</button><span class="caption">Un periodo passato non si aggiorna: sono dati storici.</span></div>` : ''}
      <div id="rf-mon-d-graf" style="margin-top:8px">${rfMonGraficiHtml()}</div></div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Avvisi e azioni</span><span class="caption">registro: chi, quando, perché</span></div><div id="rf-mon-d-avv">${rfMonRegistroHtml()}</div></div>
    ${d.vista_tecnica ? '' : `<div class="card mt-16"><div class="card-head"><span class="section-title">Assistente · riassunto dei dati</span><span class="caption">non decide e non chiude avvisi</span></div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" onclick="rfMonAi()">Riassumi l'intervallo</button><button class="btn sm ghost" onclick="rfMonAi('Che cosa è cambiato fra l\\'inizio e la fine dell\\'intervallo?')">Che cosa è cambiato?</button><button class="btn sm ghost" onclick="rfMonAi('Riassumi gli avvisi e come sono stati gestiti.')">Avvisi e gestione</button></div>
      <div class="row" style="gap:6px;margin-top:8px"><input class="input grow" id="rf-mon-ai-q" placeholder="Una domanda sui dati di questo intervallo" onkeydown="if(event.key==='Enter')rfMonAiChiedi()"><button class="btn sm" onclick="rfMonAiChiedi()">Chiedi</button></div>
      <div id="rf-mon-ai" style="margin-top:10px">${rfMonAiHtml()}</div></div>`}
    <div class="card mt-16"><div class="card-head"><span class="section-title">Dispositivi associati</span><span class="badge count">${d.dispositivi.length}</span></div><div class="list" id="rf-mon-d-disp">${rfMonDispDetHtml()}</div>
      ${d.abbinamenti.length ? `<details style="margin-top:8px"><summary class="caption" style="cursor:pointer">Storico degli abbinamenti</summary>${d.abbinamenti.map(a => `<div class="caption">${rfEsc(a.modello)} (${rfEsc(a.seriale)}): dal ${rfMonGiornoOra(a.dal)} ${a.al ? `al ${rfMonGiornoOra(a.al)}` : '· in corso'}${a.verificato ? ' · verificato' : ''}${a.chi ? ` · ${rfEsc(a.chi)}` : ''}</div>`).join('')}</details>` : ''}</div>
    ${d.puo.simulatore ? rfMonSimPazHtml() : ''}`;
}

/* ---------- regole ---------- */
function rfMonRegoleHtml() {
  const x = RF.mon.altri.regole;
  if (!x) return '<div class="card"><div class="caption">Carico…</div></div>';
  if (x.errore) return '<div class="rf-manc">Le regole le vede chi cura.</div>';
  const puo = x.puo && x.puo.regole, dis = puo ? '' : 'disabled';
  const campo = (r, k, v) => `<input class="input" type="number" step="any" ${dis} id="rf-mon-rg-${r.chiave}-${k}" value="${v == null ? '' : v}">`;
  const par = x.regole.filter(r => r.categoria === 'parametro'), tec = x.regole.filter(r => r.categoria === 'tecnico');
  return `<div class="rf-manc mb-16"><b>Regole illustrative.</b> Servono a mostrare come funziona il motore: non sono soglie cliniche validate. Per i dati reali le regole le scrive e le approva il personale clinico autorizzato, e nessuna regola illustrativa può essere usata fuori dalla demo.</div>
    <div class="card"><div class="card-head"><span class="section-title">Regole sui parametri</span><span class="caption">modificare = scrivere una versione nuova; la vecchia resta</span></div>
      <div style="overflow-x:auto"><table class="rf-mon-tab"><tr><th>Regola</th><th>Livello</th><th>Parametro</th><th>Soglia</th><th>Rientro</th><th>Durata (s)</th><th>Misure valide</th><th>Qualità min.</th><th>Attiva</th><th>Versione</th><th></th></tr>
      ${par.map(r => `<tr><td><b>${rfEsc(r.nome)}</b>${r.sospendi_con_attivita != null ? '<div class="caption">sospesa durante l\'attività</div>' : ''}</td><td>L${r.livello}</td><td>${rfEsc(r.parametro_nome || '')}<div class="caption">${r.verso} · ${rfEsc(r.unita || '')}</div></td>
        <td>${campo(r, 'soglia', r.soglia)}</td><td>${campo(r, 'rientro', r.rientro)}</td><td>${campo(r, 'durata_s', r.durata_s)}</td><td>${campo(r, 'minimo_misure', r.minimo_misure)}</td><td>${campo(r, 'qualita_minima', r.qualita_minima)}</td>
        <td><input type="checkbox" ${dis} id="rf-mon-rg-${r.chiave}-attiva" ${r.attiva ? 'checked' : ''}></td><td>v${r.versione}<div class="caption">${r.versioni} ${r.versioni === 1 ? 'versione' : 'versioni'}${r.chi ? ` · ${rfEsc(r.chi)}` : ''}</div></td>
        <td>${puo ? `<button class="btn sm" onclick="rfMonRegolaSalva('${r.chiave}')">Salva versione</button>` : ''}</td></tr>`).join('')}</table></div></div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Regole sui problemi tecnici</span></div>
      <div style="overflow-x:auto"><table class="rf-mon-tab"><tr><th>Regola</th><th>Attesa (s)</th><th>Limite</th><th>Attiva</th><th>Versione</th><th></th></tr>
      ${tec.map(r => `<tr><td><b>${rfEsc(r.nome)}</b></td><td>${r.attesa_s != null ? campo(r, 'attesa_s', r.attesa_s) : '—'}</td><td>${r.limite != null ? campo(r, 'limite', r.limite) : '—'}</td>
        <td><input type="checkbox" ${dis} id="rf-mon-rg-${r.chiave}-attiva" ${r.attiva ? 'checked' : ''}></td><td>v${r.versione}</td><td>${puo ? `<button class="btn sm" onclick="rfMonRegolaSalva('${r.chiave}')">Salva versione</button>` : ''}</td></tr>`).join('')}</table></div></div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Registro delle modifiche</span><span class="caption">soglie, abbinamenti, simulatore</span></div>
      ${x.registro.length ? x.registro.map(g => `<div class="caption">${rfMonGiornoOra(g.quando)} · <b>${rfEsc(g.azione)}</b>${g.oggetto ? ` · ${rfEsc(g.oggetto)}` : ''}${g.chi ? ` · ${rfEsc(g.chi)}` : ''}${g.dettaglio && g.dettaglio.prima ? ` · ${rfEsc(JSON.stringify(g.dettaglio.prima))} → ${rfEsc(JSON.stringify(g.dettaglio.dopo))}` : ''}</div>`).join('') : '<div class="caption">Nessuna modifica registrata.</div>'}</div>`;
}
async function rfMonRegolaSalva(chiave) {
  const cambi = {};
  for (const k of ['soglia', 'rientro', 'durata_s', 'minimo_misure', 'qualita_minima', 'attesa_s', 'limite']) { const e = document.getElementById(`rf-mon-rg-${chiave}-${k}`); if (e && e.value !== '') cambi[k] = Number(e.value); }
  const a = document.getElementById(`rf-mon-rg-${chiave}-attiva`); if (a) cambi.attiva = a.checked;
  const r = await rfMonChiama({ azione: 'regola', chiave, cambi });
  if (r) { toast(`Regola salvata come versione ${r.versione}`); await rfMonAltra('regole'); render(); }
}

/* ---------- dispositivi ---------- */
function rfMonDispositiviHtml() {
  const x = RF.mon.altri.dispositivi;
  if (!x) return '<div class="card"><div class="caption">Carico…</div></div>';
  if (x.errore) return '<div class="rf-manc">Non riesco a leggere i dispositivi.</div>';
  const puo = x.puo && x.puo.dispositivi;
  return `<div class="card"><div class="card-head"><span class="section-title">Dispositivi</span><span class="badge count">${x.dispositivi.length}</span></div>
      <p class="rf-img-limite" style="margin:6px 0 8px">Ogni dispositivo dichiara che cosa misura e come. I modelli della demo sono inventati e non corrispondono a prodotti in commercio: nessuna compatibilità è promessa.</p>
      <div class="list">${x.dispositivi.map(d => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(d.modello)} <span class="badge">${rfEsc(d.tipo)}</span> ${d.connesso ? '<span class="badge success">collegato</span>' : '<span class="badge">non collegato</span>'}</div>
        <div class="sub">${rfEsc(d.seriale)} · adattatore «${rfEsc(d.adattatore)}» · batteria ${d.batteria == null ? 'non disponibile' : `${d.batteria}%`} · ${d.paziente_codice ? `abbinato a <b>${rfEsc(d.paziente_nome || '')}</b> (${rfEsc(d.paziente_codice)}) dal ${rfMonGiornoOra(d.dal)}${d.verificato ? ' · verificato' : ''}` : '<b>non abbinato</b>'}</div>
        <div class="caption">${d.capacita.map(c => `${rfEsc(c.nome)}: ${c.modo === 'continuo' ? 'continuo' : 'a intervalli'}${c.campionamento_hz ? ` ${c.campionamento_hz} Hz` : ''}, invio ogni ${c.invio_s >= 60 ? `${Math.round(c.invio_s / 60)} min` : `${c.invio_s} s`}`).join(' · ')}</div></div>
        ${puo ? (d.paziente_codice ? `<button class="btn sm" onclick="rfMonStacca('${d.id}')">Stacca</button>` : `<button class="btn sm primary" onclick="rfMonAbbina('${d.id}')">Abbina…</button>`) : ''}</div>`).join('')}</div>
      ${puo ? '' : '<div class="caption" style="margin-top:8px">Abbinare e staccare i dispositivi spetta all\'amministrazione e al tecnico.</div>'}</div>
    <div class="card mt-16"><div class="section-title">Collegare un dispositivo reale</div>
      <p class="meta" style="margin:8px 0 0;line-height:1.6">Oggi l'unico adattatore è il simulatore. Un dispositivo reale si collega scrivendo un <b>adattatore</b> che parla col canale del produttore (gateway, applicazione sul telefono o la sua piattaforma) e consegna misure nel formato comune. Che cosa serve, produttore per produttore: API o SDK documentati e un contratto che ne consenta l'uso; quali parametri e con che frequenza; come arrivano i dati (in tempo quasi reale o a lotti); come si identifica il paziente; dove vengono trattati i dati (nLPD). Il dettaglio è nella wiki, pagina «Monitoraggio».</p></div>`;
}
async function rfMonStacca(id) { if (!confirm('Staccare il dispositivo dal paziente? I dati già raccolti restano del paziente.')) return; const r = await rfMonChiama({ azione: 'dispositivo', cosa: 'stacca', dispositivo: id }); if (r) { toast('Dispositivo staccato'); await rfMonAltra('dispositivi'); render(); } }
function rfMonAbbina(id) {
  const x = RF.mon.altri.dispositivi;
  openModal('Abbina il dispositivo', `<p class="meta" style="margin:0 0 8px">Per evitare un'attribuzione sbagliata, scegli il paziente e <b>riscrivi il suo codice</b>: l'abbinamento parte solo se corrispondono.</p>
    <select class="input" id="rf-mon-ab-p" style="width:100%">${x.pazienti.map(p => `<option value="${p.id}">${rfEsc(p.nome || '')} — ${rfEsc(p.codice)}${p.programma !== 'attivo' ? ` (${p.programma.replace('_', ' ')})` : ''}</option>`).join('')}</select>
    <input class="input" id="rf-mon-ab-c" style="width:100%;margin-top:8px" placeholder="Codice del paziente, es. DEMO-001">`,
    `<button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" onclick="rfMonAbbinaOk('${id}')">Abbina</button>`);
}
async function rfMonAbbinaOk(id) {
  const r = await rfMonChiama({ azione: 'dispositivo', cosa: 'abbina', dispositivo: id, paziente: (document.getElementById('rf-mon-ab-p') || {}).value, conferma: (document.getElementById('rf-mon-ab-c') || {}).value });
  if (r) { closeModal(); toast('Dispositivo abbinato'); await rfMonAltra('dispositivi'); render(); }
}

/* ---------- simulatore (solo demo) ---------- */
function rfMonSimulatoreHtml() {
  const d = RF.mon.dati;
  const riga = (p) => `<tr><td><b>${rfEsc(p.nome)}</b><div class="caption">${rfEsc(p.codice)} · ${RF_MON_STATO[p.stato] ? RF_MON_STATO[p.stato][1] : p.stato}</div></td>
    <td><select class="input" style="width:auto" onchange="if(this.value){const [c,t]=this.value.split('|');rfMonSim(c,t||null,'${p.id}');this.value=''}"><option value="">Scenario…</option>
      <optgroup label="Parametri"><option value="evento|tachicardia_riposo">FC alta a riposo</option><option value="evento|tachicardia">FC molto alta</option><option value="evento|bradicardia">FC bassa</option><option value="evento|desaturazione">Saturazione in discesa</option><option value="evento|febbre">Temperatura in salita</option><option value="evento|ipertensione">Pressione alta</option><option value="evento|ritmo_irregolare">Ritmo irregolare</option><option value="normalizza">Torna alla norma</option></optgroup>
      <optgroup label="Tecnici"><option value="interrompi">Interrompi la connessione</option><option value="riconnetti">Riconnetti (recupera i dati)</option><option value="degrada">Degrada il segnale</option><option value="segnale_buono">Segnale buono</option><option value="batteria_bassa">Batteria bassa</option><option value="batteria_carica">Batteria carica</option><option value="stacca_sensore">Stacca il sensore</option><option value="riapplica_sensore">Riapplica il sensore</option><option value="ritarda">Ritarda i dati di 5 min</option><option value="senza_ritardo">Senza ritardo</option></optgroup></select></td>
    <td><button class="btn sm ghost" onclick="rfMonApri('${p.id}')">Apri</button></td></tr>`;
  return `<div class="card"><div class="card-head"><span class="section-title">Simulatore</span><span class="badge">solo demo</span></div>
      <p class="meta" style="margin:8px 0;line-height:1.6">I pazienti, i dispositivi e i valori di questo modulo sono generati dal simulatore, che gira nel server anche con questa pagina chiusa. Uno scenario cambia i valori <b>gradualmente</b> e in modo coerente (frequenza, saturazione, respiro, tracciato): gli avvisi illustrativi scattano quando la loro regola è soddisfatta, non al clic.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="rfMonRipristina()">Ripristina lo stato iniziale</button>
        ${d.motore.attivo ? `<button class="btn ghost" onclick="rfMonAccendi(false)">Spegni il simulatore</button>` : `<button class="btn primary" onclick="rfMonAccendi(true)">Accendi il simulatore</button>`}
        <span class="caption">Ultimo giro del motore: ${d.motore.ultimo_giro ? rfMonOra(d.motore.ultimo_giro, true) : 'mai'} · misure tenute ${d.motore.conservazione ? d.motore.conservazione.misure_ore : '—'} ore, tracciati ${d.motore.conservazione ? d.motore.conservazione.tracce_min : '—'} minuti</span></div></div>
    <div class="card mt-16"><div class="section-title">Scenari per paziente</div><div style="overflow-x:auto"><table class="rf-mon-tab" style="margin-top:8px">${d.pazienti.map(riga).join('')}</table></div></div>`;
}
async function rfMonRipristina() {
  if (!confirm('Ripristinare lo stato iniziale della demo? Si cancellano i dati simulati, gli avvisi e le modifiche alle regole illustrative.')) return;
  const r = await rfMonChiama({ azione: 'simulatore', cosa: 'ripristina' });
  if (r) { RF.mon.ordineIds = null; RF.mon.visti = null; RF.mon.altri = {}; toast('Demo riportata allo stato iniziale'); await rfMonCarica(); render(); }
}
async function rfMonAccendi(on) { const r = await rfMonChiama({ azione: 'simulatore', cosa: on ? 'accendi' : 'spegni' }); if (r) { await rfMonCarica(); render(); } }

/* ---------- che cos'è ---------- */
function rfMonInfoHtml() {
  return `<div class="card"><div class="section-title">Che cos'è questo modulo, oggi</div>
    <p class="meta" style="margin:8px 0 0;line-height:1.65">Una <b>dimostrazione funzionante</b> del monitoraggio remoto: panoramica dei pazienti, dettaglio con grafici e tracciato, avvisi con presa in carico, regole a versioni, dispositivi e abbinamenti, un assistente che riassume. Tutti i dati sono <b>simulati</b> e separati da quelli reali: un paziente dimostrativo non ha una cartella, e nessun valore sintetico può finire in una cartella vera.</p>
    <p class="meta" style="margin:8px 0 0;line-height:1.65"><b>Che cosa non è.</b> Non è un dispositivo medico certificato, non è un sistema di emergenza, e non va usato per decisioni cliniche. Un valore oltre soglia non è una diagnosi. Le regole sono illustrative. Il visualizzatore del tracciato non ha funzioni diagnostiche.</p>
    <p class="meta" style="margin:8px 0 0;line-height:1.65"><b>Prima di un uso reale</b> servono: i dispositivi e i loro adattatori; regole scritte e approvate da chi cura; la qualificazione regolatoria del software (un sistema che sorveglia parametri vitali e genera allarmi è un dispositivo medico); prove tecniche su ritardi, perdite di dati e notifiche; un protocollo di reperibilità; la valutazione sulla protezione dei dati. L'elenco completo è nella wiki, pagina «Monitoraggio».</p></div>`;
}
