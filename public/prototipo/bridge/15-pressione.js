/* =====================================================================
   Pressione (7.10.2026) — [[Piattaforma/Pressione]]
   =====================================================================
   Il profilo pressorio delle 24 ore di un paziente con SOPRA la terapia che
   prendeva: per ogni farmaco, quando è stato preso e quando «sta lavorando»
   (la finestra d'azione, dai quattro numeri della tabella dei farmaci).
   Tutti i numeri arrivano già calcolati dal server (src/lib/pressione/
   calcolo.ts): qui si disegna e si scrive, non si conta.
   Le proposte di orario sono un dispositivo medico interno dello studio e
   restano SPENTE finché non sono validate: la pagina lo dice. */
if (typeof NAV_META !== 'undefined') NAV_META.pressione = ['Pressione', 'pressione'];
if (typeof ICONS !== 'undefined' && typeof I === 'function' && !ICONS.pressione) ICONS.pressione = I('<path d="M12 21a8 8 0 1 0-8-8"/><path d="M12 13l4-5"/><path d="M3 21h6"/>');
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin', 'tech_admin']) {
  const n = NAV[r]; if (n && !n.includes('pressione')) n.splice(Math.max(0, n.indexOf('monitoraggio')) + 1, 0, 'pressione');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-pa-tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; }
.rf-pa-tile { border:1px solid var(--border); border-radius:16px; padding:12px 14px; background:var(--surface); }
.rf-pa-tile .n { font-size:24px; font-weight:650; font-variant-numeric:tabular-nums; line-height:1.15; }
.rf-pa-tile .n small { font-size:13px; font-weight:500; color:var(--text-2); }
.rf-pa-tile .t { font-size:12px; color:var(--text-2); margin-top:2px; }
.rf-pa-tile .s { font-size:11.5px; color:var(--text-3, var(--text-2)); margin-top:3px; }
.rf-pa-tile.att .n { color:#9a6200; } .rf-pa-tile.alta .n { color:#b3261e; } .rf-pa-tile.bene .n { color:#1a7f4b; }
.rf-pa-graf { width:100%; overflow-x:auto; }
.rf-pa-graf svg { display:block; width:100% !important; min-width:640px; height:auto !important; }
.rf-pa-leg { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--text-2); margin-top:8px; }
.rf-pa-leg i { display:inline-block; width:14px; height:3px; border-radius:2px; vertical-align:middle; margin-right:5px; }
.rf-pa-tab { width:100%; border-collapse:collapse; font-size:13.5px; }
.rf-pa-tab th { text-align:left; font-weight:600; font-size:12px; color:var(--text-2); padding:6px 8px; border-bottom:1px solid var(--border); white-space:nowrap; }
.rf-pa-tab td { padding:7px 8px; border-bottom:1px solid var(--border); vertical-align:middle; }
.rf-pa-tab tr:last-child td { border-bottom:0; }
.rf-pa-tab input.input { height:32px; padding:0 8px; font-size:13px; }
.input.rf-pa-st, .rf-pa-tab input.input { min-width:0 !important; }
.rf-pa-tab input.rf-pa-num { width:72px !important; text-align:right; font-variant-numeric:tabular-nums; }
.rf-pa-scroll { overflow-x:auto; }
.rf-pa-fascia { display:flex; gap:10px; align-items:baseline; padding:8px 0; border-bottom:1px solid var(--border); font-size:13.5px; }
.rf-pa-fascia:last-child { border-bottom:0; }
.rf-pa-fascia b { font-variant-numeric:tabular-nums; white-space:nowrap; }
.rf-pa-avviso { border:1px solid rgba(190,130,20,.4); background:rgba(255,236,190,.55); color:#6b4300; border-radius:12px; padding:10px 14px; font-size:13.5px; line-height:1.5; }
:root[data-theme="dark"] .rf-pa-avviso { background:rgba(120,84,10,.28); color:#f3d089; }
.rf-pa-trova { position:relative; }
.rf-pa-trova .esiti { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
`; document.head.appendChild(st); })();

RF.pa = { vista: 'profili', lista: null, farmaci: null, aperto: null, dati: null, errore: null, info: null,
  nuovo: { pid: '', nome: '', cerca: '', testo: '', data: '', apparecchio: '', carico: false, errore: null },
  terapia: null, imp: null, mostraPrec: true };
const RF_PA_URL = '/api/prototipo/pressione';
const RF_PA_CALO = { normale: 'normale', ridotto: 'ridotto', assente: 'assente', eccessivo: 'eccessivo', inverso: 'inverso (più alta di notte)' };
const RF_PA_CLASSE = { ace_inibitore: 'ACE-inibitori', sartano: 'Sartani', calcioantagonista: 'Calcioantagonisti', diuretico: 'Diuretici', betabloccante: 'Betabloccanti', alfabloccante: 'Alfabloccanti', centrale: 'Ad azione centrale', antialdosteronico: 'Antialdosteronici', altro: 'Altri' };

const rfPaQuando = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)} ${s.slice(11, 16)}` : '—');
const rfPaGiorno = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '—');
const rfPaN = (x, dec = 0) => (x === null || x === undefined ? '—' : Number(x).toFixed(dec).replace('.', ','));
const rfPaOra = (h) => `${String(h % 24).padStart(2, '0')}:00`;

async function rfPaChiedi(corpo) {
  try {
    const r = await fetch(RF_PA_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { errore: j.errore === 'proposte_spente' ? 'Le proposte di orario sono spente.' : (j.errore || `Non riuscito (${r.status}).`) };
    return j;
  } catch { return { errore: 'Piattaforma non raggiungibile.' }; }
}
async function rfPaCarica(rendi = true) {
  try {
    const r = await fetch(RF_PA_URL, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) RF.pa.errore = j.errore && r.status === 403 ? j.errore : `Non riesco a leggere i profili (${r.status}).`;
    else { RF.pa.lista = j.profili || []; RF.pa.info = { farmaci: j.farmaci || {}, proposte_accese: !!j.proposte_accese, puo: j.puo || {} }; RF.pa.errore = null; }
  } catch { RF.pa.errore = 'Piattaforma non raggiungibile.'; }
  if (RF.pa.lista === null) RF.pa.lista = [];
  if (rendi) render();
}
async function rfPaCaricaFarmaci(rendi = true) {
  try {
    const r = await fetch(`${RF_PA_URL}?vista=farmaci`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) RF.pa.farmaci = j; else RF.pa.errore = j.errore || `Non riesco a leggere la tabella (${r.status}).`;
  } catch { RF.pa.errore = 'Piattaforma non raggiungibile.'; }
  if (rendi) render();
}
async function rfPaApri(id, rendi = true) {
  RF.pa.aperto = id; RF.pa.terapia = null; RF.pa.imp = null;
  if (rendi) { RF.pa.dati = null; render(); }
  try {
    const r = await fetch(`${RF_PA_URL}/${id}`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.pa.errore = j.errore || `Profilo non leggibile (${r.status}).`; RF.pa.aperto = null; }
    else { RF.pa.dati = j; RF.pa.errore = null; }
  } catch { RF.pa.errore = 'Piattaforma non raggiungibile.'; RF.pa.aperto = null; }
  render();
}
function rfPaChiudi() { RF.pa.aperto = null; RF.pa.dati = null; RF.pa.terapia = null; RF.pa.imp = null; render(); void rfPaCarica(); }
function rfPaVista(v) { RF.pa.vista = v; RF.pa.errore = null; if (v === 'farmaci' && !RF.pa.farmaci) void rfPaCaricaFarmaci(); render(); }

/* ---------- nuovo profilo ---------- */
function rfPaTrovaPazienti() {
  const q = (RF.pa.nuovo.cerca || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const paz = (RF.data && RF.data.patients ? RF.data.patients : []).filter(p => rfUuid(p.id));
  return paz.filter(p => fullName(p).toLowerCase().includes(q)).slice(0, 8);
}
function rfPaScegli(id) {
  const p = (RF.data.patients || []).find(x => x.id === id);
  RF.pa.nuovo.pid = id; RF.pa.nuovo.nome = p ? `${fullName(p)}${p.dob ? ` · ${p.dob}` : ''}` : ''; RF.pa.nuovo.cerca = ''; render();
}
function rfPaFile(files) {
  const f = files && files[0]; if (!f) return;
  if (f.size > 400000) { RF.pa.nuovo.errore = 'Il file è troppo grande per essere un profilo delle 24 ore.'; render(); return; }
  const lettore = new FileReader();
  lettore.onload = () => { RF.pa.nuovo.testo = String(lettore.result || ''); RF.pa.nuovo.errore = null; render(); };
  lettore.onerror = () => { RF.pa.nuovo.errore = 'Non riesco a leggere il file.'; render(); };
  lettore.readAsText(f);
}
async function rfPaInvia() {
  const n = RF.pa.nuovo;
  if (!n.pid) { n.errore = 'Scegli il paziente.'; render(); return; }
  if (!n.testo.trim()) { n.errore = 'Scegli il file delle misure, o incollale.'; render(); return; }
  n.carico = true; n.errore = null; render();
  const j = await rfPaChiedi({ azione: 'carica', patient_id: n.pid, testo: n.testo, data_inizio: n.data || undefined, apparecchio: n.apparecchio || undefined });
  n.carico = false;
  if (j.errore) { n.errore = j.errore; render(); return; }
  RF.pa.nuovo = { pid: '', nome: '', cerca: '', testo: '', data: '', apparecchio: '', carico: false, errore: null };
  toast(`Profilo caricato: ${j.misure} misure${j.scartate ? `, ${j.scartate} righe scartate` : ''}`);
  RF.pa.lista = null; await rfPaApri(j.id);
}

/* ---------- terapia e impostazioni ---------- */
function rfPaTerapiaModifica() {
  const d = RF.pa.dati; if (!d) return;
  RF.pa.terapia = d.terapie.length ? d.terapie.map(t => ({ nome: t.nome, dose: t.dose || '', orari: (t.orari || []).join(', ') })) : [{ nome: '', dose: '', orari: '' }];
  render();
}
function rfPaTerapiaRiga(i, campo, v) { if (RF.pa.terapia && RF.pa.terapia[i]) RF.pa.terapia[i][campo] = v; }
function rfPaTerapiaPiu() { RF.pa.terapia.push({ nome: '', dose: '', orari: '' }); render(); }
function rfPaTerapiaVia(i) { RF.pa.terapia.splice(i, 1); if (!RF.pa.terapia.length) RF.pa.terapia.push({ nome: '', dose: '', orari: '' }); render(); }
async function rfPaTerapiaSalva() {
  const righe = RF.pa.terapia.filter(r => r.nome.trim()).map(r => ({ nome: r.nome, dose: r.dose, orari: r.orari }));
  const j = await rfPaChiedi({ azione: 'terapia', id: RF.pa.aperto, righe });
  if (j.errore) { toast(j.errore); return; }
  toast(j.non_riconosciuti ? `Terapia salvata. ${j.non_riconosciuti} ${j.non_riconosciuti === 1 ? 'farmaco non è' : 'farmaci non sono'} in tabella: senza finestra d'azione` : 'Terapia salvata');
  await rfPaApri(RF.pa.aperto, false);
}
function rfPaImpModifica() {
  const i = RF.pa.dati.impostazioni; RF.pa.imp = { sveglia: i.sveglia, sonno: i.sonno, ...i.soglie }; render();
}
async function rfPaImpSalva() {
  const m = RF.pa.imp, d = RF.pa.dati;
  const corpo = { azione: 'impostazioni', id: RF.pa.aperto, sveglia: m.sveglia, sonno: m.sonno };
  if (d.puo.decidere) corpo.soglie = { giorno_sis: +m.giorno_sis, giorno_dia: +m.giorno_dia, notte_sis: +m.notte_sis, notte_dia: +m.notte_dia, basso_giorno: +m.basso_giorno, basso_notte: +m.basso_notte };
  const j = await rfPaChiedi(corpo);
  if (j.errore) { toast(j.errore); return; }
  toast('Impostazioni salvate'); await rfPaApri(RF.pa.aperto, false);
}
function rfPaElimina() {
  openModal('Eliminare questo profilo?', '<p class="meta" style="margin:0;line-height:1.55">Si tolgono le misure, la terapia scritta per questo profilo e le eventuali proposte. Non si può annullare.</p>',
    '<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-pa-via">Elimina</button>');
  document.getElementById('rf-pa-via').onclick = async () => {
    const j = await rfPaChiedi({ azione: 'elimina', id: RF.pa.aperto });
    if (j.errore) { toast(j.errore); return; }
    closeModal(); toast('Profilo eliminato'); RF.pa.lista = null; rfPaChiudi();
  };
}

/* ---------- proposte (solo se accese) ---------- */
async function rfPaProponi() {
  const j = await rfPaChiedi({ azione: 'proponi', id: RF.pa.aperto });
  if (j.errore) { toast(j.errore); return; }
  toast(j.proposte ? `${j.proposte} ${j.proposte === 1 ? 'proposta' : 'proposte'}` : (j.motivo_nessuna || 'Nessuna proposta'));
  await rfPaApri(RF.pa.aperto, false);
}
async function rfPaDecidi(id, stato) {
  let orario;
  if (stato === 'modificata') { orario = (document.getElementById(`rf-pa-or-${id}`) || {}).value || ''; }
  const j = await rfPaChiedi({ azione: 'decidi', id, stato, orario });
  if (j.errore) { toast(j.errore); return; }
  toast(stato === 'accettata' ? 'Proposta accettata' : stato === 'modificata' ? 'Orario scelto dal medico registrato' : 'Proposta scartata');
  await rfPaApri(RF.pa.aperto, false);
}

/* ---------- tabella dei farmaci ---------- */
async function rfPaFarmaco(principio, conferma) {
  const v = (c) => Number(String((document.getElementById(`rf-pa-f-${principio}-${c}`) || {}).value || '').replace(',', '.'));
  const j = await rfPaChiedi({ azione: 'farmaco', principio, inizio_h: v('inizio_h'), picco_h: v('picco_h'), durata_h: v('durata_h'), emivita_h: v('emivita_h'), conferma });
  if (j.errore) { toast(j.errore); return; }
  toast(conferma ? `${principio}: confermato` : `${principio}: salvato, da confermare`);
  await rfPaCaricaFarmaci();
}
async function rfPaFarmacoTogli(principio) {
  const j = await rfPaChiedi({ azione: 'farmaco_togli', principio });
  if (j.errore) { toast(j.errore); return; }
  toast(`${principio}: conferma tolta`); await rfPaCaricaFarmaci();
}

/* ---------- il grafico ---------- */
function rfPaGrafico(d) {
  const m = d.misure, imp = d.impostazioni, s = imp.soglie;
  if (!m.length) return '';
  const t = (q) => Date.parse(`${q}:00Z`);
  const t0 = Math.floor(t(m[0].quando) / 3600000) * 3600000, t1 = Math.ceil(t(m[m.length - 1].quando) / 3600000) * 3600000;
  const durata = Math.max(3600000, t1 - t0);
  const W = 980, SX = 46, DX = 14, larg = W - SX - DX;
  const buone = m.filter(x => x.valida);
  const tutte = buone.length ? buone : m;
  // La scala comprende anche il profilo precedente, se lo si mostra: una linea che esce dal grafico non dice niente.
  const prima = RF.pa.mostraPrec && d.precedente ? d.precedente.orarie.filter(o => o.sis !== null).map(o => o.sis) : [];
  const yMin = Math.max(30, Math.floor((Math.min(...tutte.map(x => x.dia), s.notte_dia) - 12) / 10) * 10), yMax = Math.ceil((Math.max(...tutte.map(x => x.sis), s.giorno_sis, ...prima) + 12) / 10) * 10;
  const ALT = 250, SU = 14;
  const x = (ms) => SX + ((ms - t0) / durata) * larg;
  const y = (v) => SU + (1 - (v - yMin) / (yMax - yMin)) * ALT;
  const oraOrologio = (ms) => new Date(ms).getUTCHours();
  const sv = Number(imp.sveglia.slice(0, 2)) + Number(imp.sveglia.slice(3, 5)) / 60, so = Number(imp.sonno.slice(0, 2)) + Number(imp.sonno.slice(3, 5)) / 60;
  const notte = (h) => (so > sv ? (h >= so || h < sv) : (h >= so && h < sv));
  let g = '';
  // Le ore, una per una: fondo della notte, soglie del giorno o della notte, fasce.
  const statoOra = {}; (d.fasce || []).forEach(f => { for (let k = 0; k < f.ore; k++) statoOra[(f.da + k) % 24] = f; });
  for (let ms = t0; ms < t1; ms += 3600000) {
    const h = oraOrologio(ms), n = notte(h + 0.5), xa = x(ms), xb = x(ms + 3600000);
    if (n) g += `<rect x="${xa}" y="${SU}" width="${xb - xa + 0.5}" height="${ALT}" style="fill:var(--text);opacity:.045"/>`;
    const f = statoOra[h];
    if (f) g += `<rect x="${xa}" y="${SU}" width="${xb - xa + 0.5}" height="5" style="fill:${f.stato === 'alta' ? '#c0392b' : '#2c6fbb'};opacity:${f.stato === 'alta' && f.scoperta ? 0.95 : 0.5}"/>`;
    g += `<line x1="${xa}" x2="${xb}" y1="${y(n ? s.notte_sis : s.giorno_sis)}" y2="${y(n ? s.notte_sis : s.giorno_sis)}" style="stroke:#c0392b;stroke-width:1;stroke-dasharray:4 3;opacity:.55"/>`;
    g += `<line x1="${xa}" x2="${xb}" y1="${y(n ? s.notte_dia : s.giorno_dia)}" y2="${y(n ? s.notte_dia : s.giorno_dia)}" style="stroke:#c0392b;stroke-width:1;stroke-dasharray:2 4;opacity:.4"/>`;
  }
  // Griglia e assi.
  for (let v = yMin; v <= yMax; v += 20) g += `<line x1="${SX}" x2="${W - DX}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--border);stroke-width:1"/><text x="${SX - 8}" y="${y(v) + 4}" text-anchor="end" style="fill:var(--text-2);font-size:11px">${v}</text>`;
  const passo = durata > 30 * 3600000 ? 6 : 3;
  for (let ms = t0; ms <= t1; ms += 3600000) {
    const h = oraOrologio(ms);
    if (h % passo === 0) g += `<line x1="${x(ms)}" x2="${x(ms)}" y1="${SU + ALT}" y2="${SU + ALT + 5}" style="stroke:var(--text-2);stroke-width:1"/><text x="${x(ms)}" y="${SU + ALT + 18}" text-anchor="middle" style="fill:var(--text-2);font-size:11px">${String(h).padStart(2, '0')}:00</text>`;
  }
  // Il profilo precedente, ora per ora, tratteggiato.
  if (RF.pa.mostraPrec && d.precedente) {
    const pr = {}; d.precedente.orarie.forEach(o => { pr[o.ora] = o; });
    let dp = '';
    for (let ms = t0; ms < t1; ms += 3600000) { const o = pr[oraOrologio(ms)]; if (o && o.sis !== null) dp += `${dp ? 'L' : 'M'}${x(ms + 1800000).toFixed(1)} ${y(o.sis).toFixed(1)} `; }
    if (dp) g += `<path d="${dp}" style="fill:none;stroke:var(--text-2);stroke-width:1.5;stroke-dasharray:5 4;opacity:.7"/>`;
  }
  // Sistolica e diastolica.
  const linea = (campo, colore) => {
    let p = ''; buone.forEach((q, i) => { p += `${i ? 'L' : 'M'}${x(t(q.quando)).toFixed(1)} ${y(q[campo]).toFixed(1)} `; });
    return `<path d="${p}" style="fill:none;stroke:${colore};stroke-width:2;stroke-linejoin:round"/>` + buone.map(q => `<circle cx="${x(t(q.quando)).toFixed(1)}" cy="${y(q[campo]).toFixed(1)}" r="2.6" style="fill:${colore}"><title>${q.quando.slice(11, 16)} · ${q.sis}/${q.dia}${q.fc ? ` · ${q.fc}/min` : ''}</title></circle>`).join('');
  };
  g += linea('sis', 'var(--accent)') + linea('dia', 'var(--accent-2, #8b6cf6)');
  m.filter(q => !q.valida).forEach(q => { g += `<text x="${x(t(q.quando)).toFixed(1)}" y="${SU + ALT - 4}" text-anchor="middle" style="fill:var(--text-2);font-size:10px">×<title>${q.quando.slice(11, 16)} · misura non valida</title></text>`; });
  // Sotto, sulla stessa scala del tempo: una riga per farmaco con la sua finestra d'azione.
  let yy = SU + ALT + 46; let righe = '';
  (d.copertura || []).forEach((c) => {
    righe += `<text x="${SX}" y="${yy - 6}" style="fill:var(--text);font-size:11.5px;font-weight:600">${rfEsc(c.principio)} <tspan style="font-weight:400;fill:var(--text-2)">· ${rfEsc(c.nome)} · ${c.orari.join(', ')}</tspan></text>`;
    for (let ms = t0; ms < t1; ms += 3600000) {
      const liv = c.livelli[oraOrologio(ms)];
      if (liv > 0) righe += `<rect x="${x(ms)}" y="${yy}" width="${x(ms + 3600000) - x(ms) + 0.5}" height="12" style="fill:var(--accent);opacity:${(0.12 + liv * 0.78).toFixed(2)}"><title>${String(oraOrologio(ms)).padStart(2, '0')}:00 · ${Math.round(liv * 100)}% dell'effetto</title></rect>`;
    }
    righe += `<rect x="${SX}" y="${yy}" width="${larg}" height="12" rx="3" style="fill:none;stroke:var(--border);stroke-width:1"/>`;
    // Le prese: un segno a ogni giorno in cui cadono dentro la registrazione.
    c.orari.forEach((o) => {
      const hh = Number(o.slice(0, 2)), mm = Number(o.slice(3, 5));
      for (let giorno = Math.floor(t0 / 86400000) * 86400000 - 86400000; giorno <= t1; giorno += 86400000) {
        const ms = giorno + hh * 3600000 + mm * 60000;
        if (ms >= t0 && ms <= t1) righe += `<line x1="${x(ms)}" x2="${x(ms)}" y1="${yy - 2}" y2="${yy + 14}" style="stroke:var(--text);stroke-width:1.5"/><path d="M${x(ms) - 5} ${yy + 21} L${x(ms) + 5} ${yy + 21} L${x(ms)} ${yy + 14} Z" style="fill:var(--text)"><title>presa alle ${o}</title></path>`;
      }
    });
    yy += 44;
  });
  const H = yy - 14;
  return `<div class="rf-pa-graf"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Profilo pressorio delle 24 ore con le finestre d'azione dei farmaci">${g}${righe}</svg></div>
    <div class="rf-pa-leg"><span><i style="background:var(--accent)"></i>sistolica</span><span><i style="background:var(--accent-2, #8b6cf6)"></i>diastolica</span>
      <span><i style="background:#c0392b;opacity:.6"></i>soglie (giorno ${s.giorno_sis}/${s.giorno_dia}, notte ${s.notte_sis}/${s.notte_dia})</span>
      <span><i style="background:#c0392b;height:5px"></i>fascia sopra soglia (piena = nessun farmaco a metà effetto)</span>
      ${(d.fasce || []).some(f => f.stato === 'bassa') ? '<span><i style="background:#2c6fbb;height:5px"></i>fascia troppo bassa</span>' : ''}
      <span><i style="background:var(--text);opacity:.2;height:9px"></i>notte (${rfEsc(imp.sonno)}–${rfEsc(imp.sveglia)})</span>
      ${d.precedente ? `<span><i style="background:var(--text-2)"></i>profilo precedente (${rfPaGiorno(d.precedente.inizio)}) <a href="javascript:void 0" onclick="RF.pa.mostraPrec=!RF.pa.mostraPrec;render()">${RF.pa.mostraPrec ? 'nascondi' : 'mostra'}</a></span>` : ''}</div>`;
}

/* ---------- la pagina di un profilo ---------- */
function rfPaDettaglio() {
  const d = RF.pa.dati;
  if (!d) return `<div class="page-head"><div><h2 class="page-title">Pressione</h2></div></div><div class="card"><div class="caption">Carico il profilo…</div></div>`;
  const st = d.statistiche, p = d.punteggio, imp = d.impostazioni, s = imp.soglie;
  const tile = (n, t, sotto = '', cls = '') => `<div class="rf-pa-tile ${cls}"><div class="n">${n}</div><div class="t">${t}</div>${sotto ? `<div class="s">${sotto}</div>` : ''}</div>`;
  const sopra = (r, a, b) => (r.sis !== null && (r.sis >= a || r.dia >= b) ? 'alta' : '');
  const calo = st.calo_notturno === null ? '—' : `${rfPaN(st.calo_notturno, 1)}<small>%</small>`;
  const tiles = `<div class="rf-pa-tiles">
    ${tile(`${rfPaN(st.tutte.sis)}<small>/${rfPaN(st.tutte.dia)}</small>`, 'media delle 24 ore', st.tutte.fc !== null ? `frequenza ${rfPaN(st.tutte.fc)}/min` : '')}
    ${tile(`${rfPaN(st.giorno.sis)}<small>/${rfPaN(st.giorno.dia)}</small>`, 'media di giorno', `soglia ${s.giorno_sis}/${s.giorno_dia} · ${st.giorno.n} misure`, sopra(st.giorno, s.giorno_sis, s.giorno_dia))}
    ${tile(`${rfPaN(st.notte.sis)}<small>/${rfPaN(st.notte.dia)}</small>`, 'media di notte', `soglia ${s.notte_sis}/${s.notte_dia} · ${st.notte.n} misure`, sopra(st.notte, s.notte_sis, s.notte_dia))}
    ${tile(calo, 'calo notturno', st.calo_tipo ? `${RF_PA_CALO[st.calo_tipo]} · atteso 10–20%` : '', st.calo_tipo === 'normale' ? 'bene' : st.calo_tipo ? 'att' : '')}
    ${tile(st.picco_mattino === null ? '—' : `${rfPaN(st.picco_mattino)}<small> mmHg</small>`, 'picco del mattino', 'sistolica: dopo la sveglia meno il minimo notturno', st.picco_mattino !== null && st.picco_mattino > 35 ? 'att' : '')}
    ${tile(`${st.percento_valide}<small>%</small>`, 'misure valide', `${st.valide} su ${st.misure}`, st.qualita.affidabile ? '' : 'att')}
    ${tile(p ? `${p.totale}<small>/100</small>` : '—', 'punteggio del profilo', p ? `${p.ore_in_bersaglio} ore su ${p.ore_misurate} in bersaglio` : 'troppe ore senza misure')}
  </div>`;

  const qualita = st.qualita.affidabile ? '' : `<div class="rf-pa-avviso mt-16"><b>Registrazione non affidabile</b>: ${st.qualita.motivi.map(rfEsc).join('; ')}. I numeri si mostrano, ma non reggono una conclusione.</div>`;

  // Le fasce.
  const fasce = (d.fasce || []).map(f => {
    const dove = `${rfPaOra(f.da)}–${rfPaOra(f.a)}`;
    const cosa = f.stato === 'alta' ? 'sopra soglia' : 'troppo bassa';
    let farm = '';
    if (f.stato === 'alta' && (d.copertura || []).length) farm = f.scoperta ? ` · <b>nessun farmaco è almeno a metà del suo effetto</b>${(f.al_minimo || []).length ? ` (sotto metà: ${f.al_minimo.map(rfEsc).join(', ')})` : ''}` : ` · almeno un farmaco è a metà effetto o più`;
    return `<div class="rf-pa-fascia"><b>${dove}</b><span><span class="badge ${f.stato === 'alta' ? 'danger' : 'accent'}">${cosa}</span> ${f.notte ? 'notte' : 'giorno'} · media ${f.sis}/${f.dia} mmHg · ${f.ore} ${f.ore === 1 ? 'ora' : 'ore'}${farm}</span></div>`;
  }).join('');

  // La terapia.
  const stFarm = (t) => {
    if (!t.farmaci.length) return '<span class="badge warning">non in tabella</span> <span class="caption">senza finestra d’azione</span>';
    return t.farmaci.map(f => `<span class="badge ${f.confermato && f.orario_rilevante ? 'success' : ''}">${rfEsc(f.principio)}</span>${!f.orario_rilevante ? ' <span class="caption">senza finestra oraria</span>' : !f.confermato ? ' <span class="caption">numeri da confermare</span>' : ''}`).join(' ');
  };
  let terapia;
  if (RF.pa.terapia) {
    terapia = `<div class="rf-pa-scroll"><table class="rf-pa-tab"><thead><tr><th>Farmaco (come lo scrivete)</th><th>Dose</th><th>Orari delle prese</th><th></th></tr></thead><tbody>
      ${RF.pa.terapia.map((r, i) => `<tr><td><input class="input rf-pa-st" style="min-width:200px;width:100%" value="${rfEsc(r.nome)}" placeholder="es. Coversum 5 mg" oninput="rfPaTerapiaRiga(${i},'nome',this.value)"></td>
        <td><input class="input rf-pa-st" style="width:110px" value="${rfEsc(r.dose)}" placeholder="1 cpr" oninput="rfPaTerapiaRiga(${i},'dose',this.value)"></td>
        <td><input class="input rf-pa-st" style="width:150px" value="${rfEsc(r.orari)}" placeholder="08:00, 20:00" oninput="rfPaTerapiaRiga(${i},'orari',this.value)"></td>
        <td><button class="btn sm ghost" onclick="rfPaTerapiaVia(${i})">Togli</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row mt-8" style="gap:8px"><button class="btn sm ghost" onclick="rfPaTerapiaPiu()">Aggiungi un farmaco</button><span class="grow"></span><button class="btn sm" onclick="RF.pa.terapia=null;render()">Annulla</button><button class="btn sm primary" onclick="rfPaTerapiaSalva()">Salva la terapia</button></div>
      <p class="caption mt-8">Gli antipertensivi con l’orario a cui il paziente li prende davvero. Gli altri farmaci si possono scrivere: restano in elenco senza finestra d’azione.</p>`;
  } else {
    terapia = d.terapie.length ? `<div class="rf-pa-scroll"><table class="rf-pa-tab"><thead><tr><th>Farmaco</th><th>Dose</th><th>Orari</th><th>Principio attivo</th></tr></thead><tbody>
      ${d.terapie.map(t => `<tr><td><b>${rfEsc(t.nome)}</b></td><td>${rfEsc(t.dose || '—')}</td><td class="num">${(t.orari || []).length ? t.orari.map(rfEsc).join(', ') : '<span class="caption">orario non scritto</span>'}</td><td>${stFarm(t)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="caption">Nessuna terapia scritta per questo profilo: senza, il grafico mostra solo la pressione.</div>`;
  }

  // Prima e dopo.
  let conf = '';
  if (d.precedente) {
    const c = d.precedente.confronto, segno = (v, dec = 0, unita = '') => (v === null ? '—' : `${v > 0 ? '+' : ''}${rfPaN(v, dec)}${unita}`);
    conf = `<div class="card mt-16"><div class="card-head"><span class="section-title">Rispetto al profilo precedente</span><span class="caption">${rfPaGiorno(d.precedente.inizio)} <button class="btn sm ghost" onclick="rfPaApri('${d.precedente.id}')">Apri</button></span></div>
      <div class="kv"><b>Punteggio</b><span class="num">${segno(c.punteggio)} punti</span><b>Media 24 ore</b><span class="num">${segno(c.sis_24, 1)}/${segno(c.dia_24, 1)} mmHg</span><b>Calo notturno</b><span class="num">${segno(c.calo, 1)} punti %</span><b>Ore in bersaglio</b><span class="num">${segno(c.ore_in_bersaglio)}</span></div>
      <p class="caption mt-8">Terapia di allora: ${d.precedente.terapie.length ? d.precedente.terapie.map(t => `${rfEsc(t.nome)}${(t.orari || []).length ? ` (${t.orari.join(', ')})` : ''}`).join(' · ') : 'non scritta'}.</p></div>`;
  }

  // Le proposte.
  let prop;
  if (!d.proposte_accese) {
    prop = `<p class="meta" style="margin:0;line-height:1.55">Le <b>proposte di orario</b> sono spente. Sono un dispositivo medico fabbricato e usato dentro lo studio: si accendono solo dopo la validazione sui vostri profili e la notifica, come scritto nel fascicolo. Fino ad allora la pagina mostra e il medico decide guardando.</p>`;
  } else {
    const righe = (d.proposte || []).map(pr => {
      const c = pr.contenuto || {};
      const fatta = pr.stato !== 'aperta';
      return `<div class="rf-pa-fascia" style="flex-direction:column;gap:6px;align-items:stretch">
        <div><b>${rfEsc(c.nome || '')}</b> (${rfEsc(c.principio || '')}): dalle <b>${rfEsc(c.da || '')}</b> alle <b>${rfEsc(c.a || '')}</b> · punteggio stimato ${c.punteggio_ora} → ${c.punteggio_previsto}
          ${fatta ? ` <span class="badge ${pr.stato === 'scartata' ? '' : 'success'}">${pr.stato}${pr.orario_scelto ? ` · ${rfEsc(pr.orario_scelto)}` : ''}</span> <span class="caption">${rfEsc(pr.decisa_da || '')}</span>` : ' <span class="badge warning">proposta</span>'}</div>
        <ul class="meta" style="margin:0;padding-left:18px;line-height:1.5">${(c.perche || []).map(x => `<li>${rfEsc(x)}</li>`).join('')}</ul>
        <div class="caption">${rfEsc(c.ipotesi || '')} Regole ${rfEsc(pr.versione)}.</div>
        ${!fatta && d.puo.decidere ? `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm primary" onclick="rfPaDecidi('${pr.id}','accettata')">Accetta</button>
          <input class="input rf-pa-st" id="rf-pa-or-${pr.id}" style="width:90px;height:32px" placeholder="20:00"><button class="btn sm" onclick="rfPaDecidi('${pr.id}','modificata')">Scelgo un altro orario</button>
          <button class="btn sm ghost" onclick="rfPaDecidi('${pr.id}','scartata')">Scarta</button></div>` : ''}</div>`;
    }).join('');
    prop = `${d.avviso ? `<div class="rf-pa-avviso mb-8">${rfEsc(d.avviso)}</div>` : ''}
      ${righe || '<div class="caption">Nessuna proposta calcolata per questo profilo.</div>'}
      ${d.puo.decidere ? `<div class="row mt-8"><button class="btn sm" onclick="rfPaProponi()">${(d.proposte || []).length ? 'Ricalcola le proposte' : 'Calcola le proposte di orario'}</button></div>` : ''}
      <p class="caption mt-8">Il software propone solo l’<b>orario</b> di farmaci già prescritti. Non propone farmaci, dosi, aggiunte o sospensioni. Ogni proposta è una stima: la conferma è un nuovo monitoraggio.</p>`;
  }

  // Giorno, notte, soglie.
  let impo;
  if (RF.pa.imp) {
    const m = RF.pa.imp, campo = (k, et, w = 76) => `<label class="caption" style="display:flex;flex-direction:column;gap:3px">${et}<input class="input rf-pa-st" style="width:${w}px;height:32px" value="${rfEsc(m[k])}" oninput="RF.pa.imp.${k}=this.value"></label>`;
    impo = `<div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end">${campo('sveglia', 'Sveglia')}${campo('sonno', 'A letto')}
      ${d.puo.decidere ? `${campo('giorno_sis', 'Giorno sist.')}${campo('giorno_dia', 'Giorno diast.')}${campo('notte_sis', 'Notte sist.')}${campo('notte_dia', 'Notte diast.')}${campo('basso_giorno', 'Bassa di giorno sotto')}${campo('basso_notte', 'Bassa di notte sotto')}` : ''}
      <span class="grow"></span><button class="btn sm" onclick="RF.pa.imp=null;render()">Annulla</button><button class="btn sm primary" onclick="rfPaImpSalva()">Salva</button></div>
      ${d.puo.decidere ? '' : '<p class="caption mt-8">Le soglie le cambia il medico.</p>'}`;
  } else {
    impo = `<div class="kv"><b>Notte del paziente</b><span class="num">dalle ${rfEsc(imp.sonno)} alle ${rfEsc(imp.sveglia)}</span><b>Soglie di giorno</b><span class="num">${s.giorno_sis}/${s.giorno_dia} mmHg</span><b>Soglie di notte</b><span class="num">${s.notte_sis}/${s.notte_dia} mmHg</span><b>Troppo bassa sotto</b><span class="num">${s.basso_giorno} di giorno · ${s.basso_notte} di notte (sistolica)</span></div>`;
  }

  return `
    <div class="page-head"><div><div class="eyebrow"><a href="javascript:void 0" onclick="rfPaChiudi()">← Pressione</a></div><h2 class="page-title">${rfEsc(d.profilo.paziente)}</h2>
      <div class="page-sub">Profilo dal ${rfPaQuando(d.profilo.inizio)} al ${rfPaQuando(d.profilo.fine)}${d.profilo.apparecchio ? ` · ${rfEsc(d.profilo.apparecchio)}` : ''}</div></div>
      <div class="actions">${d.puo.terapia ? '<button class="btn sm ghost" onclick="rfPaElimina()">Elimina il profilo</button>' : ''}</div></div>
    ${RF.pa.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.pa.errore)}</div>` : ''}
    ${tiles}${qualita}
    <div class="card mt-16"><div class="card-head"><span class="section-title">Profilo delle 24 ore e finestre d’azione dei farmaci</span></div>
      ${rfPaGrafico(d)}
      ${(d.copertura || []).length ? '<p class="caption mt-8">La barra di ogni farmaco è più piena quando, secondo la tabella confermata dallo studio, il farmaco è al massimo dell’effetto. È un disegno dei numeri della tabella, non una misura su questo paziente.</p>' : (d.terapie.length ? '<p class="caption mt-8">Nessuna finestra d’azione disegnata: i farmaci scritti non hanno ancora i numeri confermati, non hanno un orario, o non sono in tabella.</p>' : '')}</div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Dove la pressione esce dai valori</span></div>
      ${fasce || '<div class="caption">Nessuna fascia sopra soglia né troppo bassa.</div>'}</div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Terapia al momento del profilo</span>${!RF.pa.terapia && d.puo.terapia ? '<button class="btn sm ghost" onclick="rfPaTerapiaModifica()">Modifica</button>' : ''}</div>
      ${terapia}</div>
    ${conf}
    <div class="card mt-16"><div class="card-head"><span class="section-title">Proposte di orario</span></div>${prop}</div>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Giorno, notte e soglie</span>${!RF.pa.imp && d.puo.terapia ? '<button class="btn sm ghost" onclick="rfPaImpModifica()">Modifica</button>' : ''}</div>
      ${impo}</div>
    ${p ? `<div class="card mt-16"><div class="section-title">Come nasce il punteggio</div>
      <div class="kv mt-8"><b>Ore dentro i valori bersaglio</b><span class="num">${rfPaN(p.in_bersaglio, 1)} su 55</span><b>Calo notturno (pieno fra 10 e 20%)</b><span class="num">${rfPaN(p.calo, 1)} su 15</span><b>Picco del mattino (pieno fino a 35 mmHg)</b><span class="num">${rfPaN(p.mattino, 1)} su 15</span><b>Nessuna ora troppo bassa</b><span class="num">${rfPaN(p.basse, 1)} su 15</span></div>
      <p class="caption mt-8">Il punteggio serve a confrontare due profili dello stesso paziente. «Regolare» non vuol dire piatto: di notte la pressione deve scendere.</p></div>` : ''}`;
}

/* ---------- la tabella dei farmaci ---------- */
function rfPaFarmaciHtml() {
  const f = RF.pa.farmaci;
  if (!f) return '<div class="card"><div class="caption">Carico la tabella…</div></div>';
  const puo = f.puo && f.puo.decidere;
  const gruppi = {}; f.farmaci.forEach(x => { (gruppi[x.classe] = gruppi[x.classe] || []).push(x); });
  const scritto = (v) => String(v).replace('.', ',');
  const num = (x, c) => (puo ? `<input class="input rf-pa-num" id="rf-pa-f-${x.principio}-${c}" value="${scritto(x[c])}">` : `<span class="num">${scritto(x[c])}</span>`);
  const sez = Object.keys(RF_PA_CLASSE).filter(k => gruppi[k]).map(k => `
    <tr><th colspan="7" style="padding-top:14px;border-bottom:0;color:var(--text)">${RF_PA_CLASSE[k]}</th></tr>
    ${gruppi[k].map(x => `<tr><td><b>${rfEsc(x.principio)}</b>${x.orario_rilevante ? '' : '<div class="caption">senza finestra oraria</div>'}${x.nota ? `<div class="caption">${rfEsc(x.nota)}</div>` : ''}</td>
      <td>${num(x, 'inizio_h')}</td><td>${num(x, 'picco_h')}</td><td>${num(x, 'durata_h')}</td><td>${num(x, 'emivita_h')}</td>
      <td>${x.confermato ? `<span class="badge success">confermato</span><div class="caption">${rfEsc(x.confermato_da || '')} · ${rfPaGiorno((x.confermato_il || '').replace(' ', 'T'))}</div>` : '<span class="badge warning">da confermare</span>'}</td>
      <td style="white-space:nowrap">${puo ? (x.confermato ? `<button class="btn sm ghost" onclick="rfPaFarmacoTogli('${x.principio}')">Togli conferma</button>` : `<button class="btn sm primary" onclick="rfPaFarmaco('${x.principio}', true)">Conferma</button>`) + ` <button class="btn sm ghost" onclick="rfPaFarmaco('${x.principio}', false)">Salva</button>` : ''}</td></tr>`).join('')}`).join('');
  return `<div class="rf-pa-avviso mb-16"><b>${f.confermati} su ${f.totale} confermati.</b> Questi numeri sono una <b>bozza</b> presa dalla farmacologia generale, non letta sull’informazione professionale di ogni prodotto. La pagina disegna la finestra d’azione di un farmaco <b>solo dopo</b> che un medico dello studio ha controllato i suoi quattro numeri sul testo ufficiale (swissmedicinfo.ch) e l’ha confermato. Cambiare un numero toglie la conferma.</div>
    <div class="card"><div class="rf-pa-scroll"><table class="rf-pa-tab"><thead><tr><th>Principio attivo</th><th>Inizio (ore)</th><th>Picco (ore)</th><th>Durata (ore)</th><th>Emivita (ore)</th><th>Stato</th><th></th></tr></thead><tbody>${sez}</tbody></table></div>
    <p class="caption mt-8">Ore dalla presa. Inizio: quando comincia l’effetto sulla pressione. Picco: quando è al massimo. Durata: fin quando l’effetto è dichiarato. ${puo ? '«Conferma» salva i numeri scritti nella riga e li dichiara controllati da te.' : 'La tabella la conferma il medico.'}</p></div>`;
}

PAGES.pressione = () => {
  if (!RF.live) return '<div class="page"><div class="card"><p class="meta" style="margin:0">La pressione è una funzione della piattaforma: qui, fuori, non ci sono dati.</p></div></div>';
  if (RF.pa.aperto) return rfPaDettaglio();
  if (RF.pa.lista === null && !RF.pa.errore) { void rfPaCarica(); return `<div class="page-head"><div><h2 class="page-title">Pressione</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  const l = RF.pa.lista || [], info = RF.pa.info || { farmaci: {}, puo: {} }, n = RF.pa.nuovo;
  const testa = `<div class="page-head"><div><h2 class="page-title">Pressione</h2><div class="page-sub">${l.length} ${l.length === 1 ? 'profilo' : 'profili'} delle 24 ore · tabella dei farmaci: ${info.farmaci.confermati ?? 0} confermati su ${info.farmaci.totale ?? 0}</div></div>
    <div class="actions"><div class="seg"><button class="${RF.pa.vista === 'profili' ? 'active' : ''}" onclick="rfPaVista('profili')">Profili</button><button class="${RF.pa.vista === 'farmaci' ? 'active' : ''}" onclick="rfPaVista('farmaci')">Tabella dei farmaci</button></div></div></div>
    ${RF.pa.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.pa.errore)}</div>` : ''}`;
  if (RF.pa.vista === 'farmaci') return testa + rfPaFarmaciHtml();
  const riga = (p) => `<div class="list-item" style="cursor:pointer" onclick="rfPaApri('${p.id}')">
      <div class="grow"><div class="name">${rfEsc(p.paziente)}</div><div class="sub">${rfPaQuando(p.inizio)} · ${p.valide} misure valide su ${p.misure}${p.affidabile ? '' : ' · <span class="badge warning">non affidabile</span>'}</div></div>
      <div style="text-align:right"><div class="name num">${rfPaN(p.sis)}/${rfPaN(p.dia)}</div><div class="sub">${p.calo_tipo ? `calo ${RF_PA_CALO[p.calo_tipo]}` : ''}${p.punteggio !== null ? ` · ${p.punteggio}/100` : ''}</div></div></div>`;
  const trovati = rfPaTrovaPazienti();
  const nuovo = info.puo.caricare ? `<div class="card mt-16"><div class="section-title">Nuovo profilo</div>
      <div class="field mt-8 rf-pa-trova"><label>Paziente</label>
        ${n.pid ? `<div class="row" style="gap:8px"><span class="badge accent">${rfEsc(n.nome)}</span><button class="btn sm ghost" onclick="RF.pa.nuovo.pid='';RF.pa.nuovo.nome='';render()">Cambia</button></div>`
          : `<input class="input" id="rf-pa-cerca" placeholder="Scrivi il cognome" value="${rfEsc(n.cerca)}" oninput="RF.pa.nuovo.cerca=this.value;render();const e=document.getElementById('rf-pa-cerca');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}">
             <div class="esiti">${trovati.map(p => `<button class="btn sm" onclick="rfPaScegli('${p.id}')">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</button>`).join('')}</div>`}</div>
      <div class="field mt-8"><label>Misure esportate dal programma dell’apparecchio</label>
        <div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn sm">Scegli il file… <input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="display:none" onchange="rfPaFile(this.files)"></label>
          <span class="caption">${n.testo ? `${n.testo.split('\n').filter(x => x.trim()).length} righe pronte` : 'CSV o testo, una riga per misura: data, ora, sistolica, diastolica, frequenza'}</span></div>
        <textarea class="input mt-8" style="width:100%;min-height:86px;font-family:ui-monospace,Menlo,monospace;font-size:12px" placeholder="…oppure incolla qui le righe" oninput="RF.pa.nuovo.testo=this.value">${rfEsc(n.testo)}</textarea></div>
      <div class="row mt-8" style="gap:12px;flex-wrap:wrap;align-items:flex-end">
        <label class="caption" style="display:flex;flex-direction:column;gap:3px">Giorno d’inizio (solo se nel file manca la data)<input class="input rf-pa-st" type="date" style="height:32px" value="${rfEsc(n.data)}" oninput="RF.pa.nuovo.data=this.value"></label>
        <label class="caption" style="display:flex;flex-direction:column;gap:3px">Apparecchio (facoltativo)<input class="input rf-pa-st" style="height:32px;width:200px" value="${rfEsc(n.apparecchio)}" oninput="RF.pa.nuovo.apparecchio=this.value"></label>
        <span class="grow"></span><button class="btn primary" onclick="rfPaInvia()" ${n.carico ? 'disabled' : ''}>${n.carico ? 'Carico…' : 'Carica il profilo'}</button></div>
      ${n.errore ? `<div class="rf-manc mt-8">${rfEsc(n.errore)}</div>` : ''}
      <p class="caption mt-8">Da Excel: «Salva con nome» → CSV. Con la riga d’intestazione le colonne si riconoscono dal nome, in qualunque ordine. Le misure restano su questo server.</p></div>` : '';
  return `${testa}
    <div class="card"><div class="card-head"><span class="section-title">Profili</span><span class="caption">dal più recente</span></div>
      <div class="list">${l.length ? l.map(riga).join('') : '<div class="caption">Nessun profilo caricato.</div>'}</div></div>
    ${nuovo}
    <p class="rf-img-limite mt-16">La pagina <b>mostra</b>: il profilo delle 24 ore, la terapia e quando ogni farmaco è al massimo dell’effetto secondo la tabella confermata dallo studio. Non sceglie farmaci né dosi. ${info.proposte_accese ? 'Le proposte di orario sono accese: sono stime, le decide il medico.' : 'Le proposte di orario sono spente finché non sono validate.'}</p>`;
};
