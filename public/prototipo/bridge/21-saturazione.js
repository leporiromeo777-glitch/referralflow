/* =====================================================================
   Saturazione notturna (22.10.2026) — [[Piattaforma/Saturazione notturna]]
   =====================================================================
   Le notti dell'anello O2Ring arrivano dal generatore dei referti dello studio
   (scheda «Sonno · O2Ring»), già calcolate: qui si mostrano, non si conta.
   Elenco delle registrazioni, invii «da assegnare», dettaglio con i totali,
   la tabella notte per notte, le curve di saturazione e frequenza cardiaca,
   le cadute e l'istogramma. I numeri sono quelli del rapporto confermato. */
if (typeof NAV_META !== 'undefined') NAV_META.saturazione = ['Saturazione notturna', 'saturazione'];
if (typeof ICONS !== 'undefined' && typeof I === 'function' && !ICONS.saturazione) ICONS.saturazione = I('<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/><path d="M9 15h2l1-2 1 3 1-1h1"/>');
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin', 'tech_admin']) {
  const n = NAV[r]; if (n && !n.includes('saturazione')) n.splice(Math.max(0, n.indexOf('pressione')) + 1, 0, 'saturazione');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-sat-tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.rf-sat-tile { border:1px solid var(--border); border-radius:16px; padding:12px 14px; background:var(--surface); }
.rf-sat-tile .n { font-size:24px; font-weight:650; font-variant-numeric:tabular-nums; line-height:1.15; }
.rf-sat-tile .t { font-size:12px; color:var(--text-2); margin-top:2px; }
.rf-sat-tile .s { font-size:11.5px; color:var(--text-3, var(--text-2)); margin-top:4px; }
.rf-sat-tab { width:100%; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums; }
.rf-sat-tab th { text-align:left; font-weight:600; font-size:11.5px; color:var(--text-2); padding:6px 8px; border-bottom:1px solid var(--border); white-space:nowrap; }
.rf-sat-tab td { padding:7px 8px; border-bottom:1px solid var(--border); white-space:nowrap; }
.rf-sat-tab tr.tot td { font-weight:650; border-bottom:0; }
.rf-sat-tab tr.clic { cursor:pointer; } .rf-sat-tab tr.clic:hover td { background:var(--surface-2, rgba(0,0,0,.03)); }
.rf-sat-scroll { overflow-x:auto; }
.rf-sat-notte { margin-top:14px; }
.rf-sat-notte svg, .rf-sat-isto svg { display:block; width:100% !important; height:auto !important; }
.rf-sat-leg { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--text-2); margin-top:6px; }
.rf-sat-arr { display:flex; flex-direction:column; gap:6px; padding:10px 0; border-top:1px solid var(--border); }
.rf-sat-arr:first-of-type { border-top:0; }
.badge.liv-norma { background:var(--success-soft, rgba(26,127,75,.12)); color:var(--success, #1a7f4b); }
.badge.liv-lieve { background:var(--warning-soft, rgba(190,130,20,.15)); color:#8a5a00; }
.badge.liv-moderato { background:rgba(214,99,24,.15); color:#a8470c; }
.badge.liv-marcato { background:var(--danger-soft, rgba(179,38,30,.12)); color:var(--danger, #b3261e); }
`; document.head.appendChild(st); })();

RF.sat = { lista: null, arrivi: [], puo: {}, aperto: null, dati: null, errore: null, scelte: {} };
const RF_SAT_URL = '/api/prototipo/saturazione';
const RF_SAT_MOTIVO = { nessuno: 'in ReferralFlow non c’è un paziente con questo nome', nascita_diversa: 'c’è un paziente con questo nome ma con un’altra data di nascita', omonimi: 'più pazienti con questo nome e questa data di nascita', senza_nome: 'manca il nome del paziente' };
const RF_SAT_LIV = { norma: 'nella norma', lieve: 'lieve', moderato: 'moderato', marcato: 'marcato' };
// ODI 4%, come il rapporto del generatore (indicativo): <5 norma, 5–15 lieve, 15–30 moderato, >30 marcato.
const rfSatLiv = (odi) => (odi == null ? null : odi < 5 ? 'norma' : odi < 15 ? 'lieve' : odi < 30 ? 'moderato' : 'marcato');
const rfSatN = (x, dec = 0) => (x === null || x === undefined || !isFinite(x) ? '—' : Number(x).toFixed(dec).replace('.', ','));
const rfSatHm = (min) => { const m = Math.round(min || 0); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const rfSatGiorno = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '—');
const rfSatOra = (t) => { const d = new Date(t); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const rfSatNotteNome = (t) => { const d = new Date(t); return `${d.toLocaleDateString('it-CH', { weekday: 'short', timeZone: 'UTC' })} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`; };
const rfSatBadge = (odi) => { const l = rfSatLiv(odi); return l ? `<span class="badge liv-${l}">${RF_SAT_LIV[l]}</span>` : ''; };

async function rfSatChiedi(corpo) {
  try {
    const r = await fetch(RF_SAT_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { errore: j.errore || `Non riuscito (${r.status}).` };
  } catch { return { errore: 'Piattaforma non raggiungibile.' }; }
}
async function rfSatCarica(rendi = true) {
  try {
    const r = await fetch(RF_SAT_URL, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) RF.sat.errore = j.errore || `Non riesco a leggere le registrazioni (${r.status}).`;
    else { RF.sat.lista = j.registrazioni || []; RF.sat.arrivi = j.arrivi || []; RF.sat.puo = j.puo || {}; RF.sat.errore = null; }
  } catch { RF.sat.errore = 'Piattaforma non raggiungibile.'; }
  if (RF.sat.lista === null) RF.sat.lista = [];
  if (rendi) render();
}
async function rfSatApri(id) {
  RF.sat.aperto = id; RF.sat.dati = null; render();
  try {
    const r = await fetch(`${RF_SAT_URL}/${id}`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.sat.aperto = null; toast(j.errore || 'Registrazione non leggibile'); }
    else RF.sat.dati = j;
  } catch { RF.sat.aperto = null; toast('Piattaforma non raggiungibile'); }
  render();
}
function rfSatChiudi() { RF.sat.aperto = null; RF.sat.dati = null; render(); void rfSatCarica(); }

/* ---------- da assegnare ---------- */
function rfSatCerca(id, v) { (RF.sat.scelte[id] = RF.sat.scelte[id] || {}).cerca = v; render(); const e = document.getElementById(`rf-sat-ac-${id}`); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }
function rfSatScegli(id, pid) { const p = (RF.data.patients || []).find(x => x.id === pid); RF.sat.scelte[id] = { pid, nome: p ? `${fullName(p)}${p.dob ? ` · ${p.dob}` : ''}` : '' }; render(); }
function rfSatNuova(id) { const x = (RF.sat.arrivi || []).find(a => a.id === id) || {}; const [cg, ...nn] = String(x.nome_letto || '').split(' '); RF.sat.scelte[id] = { nuova: true, cognome: cg || '', nome: nn.join(' '), nascita: rfSatGiorno(x.nascita_letta) }; render(); }
async function rfSatFatto(j, msg) { if (j.errore) { toast(j.errore); return; } toast(msg); await rfSatCarica(); }
async function rfSatAssegna(id) { const s = RF.sat.scelte[id]; if (!s || !s.pid) { toast('Scegli il paziente'); return; } const j = await rfSatChiedi({ azione: 'assegna', id, patient_id: s.pid }); if (!j.errore) delete RF.sat.scelte[id]; await rfSatFatto(j, 'Messo nella cartella del paziente'); }
async function rfSatCrea(id) {
  const s = RF.sat.scelte[id]; if (!s || !s.nuova) return;
  if (!s.cognome.trim() || !s.nome.trim() || !s.nascita.trim()) { toast('Servono cognome, nome e data di nascita'); return; }
  const j = await rfSatChiedi({ azione: 'crea_cartella', id, cognome: s.cognome, nome: s.nome, data_nascita: s.nascita });
  if (!j.errore) { delete RF.sat.scelte[id]; void rfCaricaDati(); }
  await rfSatFatto(j, j.nuova ? 'Cartella creata, registrazione dentro' : 'La cartella c’era già: registrazione dentro');
}
async function rfSatScarta(id) { if (!confirm('Scartare questo invio? Nel generatore il rapporto resta: da lì si può rimandare.')) return; await rfSatFatto(await rfSatChiedi({ azione: 'scarta', id }), 'Invio scartato'); }
function rfSatArriviHtml() {
  const a = RF.sat.arrivi || []; if (!a.length) return '';
  const puo = RF.sat.puo && RF.sat.puo.assegnare;
  const riga = (x) => {
    const s = RF.sat.scelte[x.id] || {}, q = (s.cerca || '').trim().toLowerCase(), t = x.totale || {};
    const trovati = q.length >= 2 ? (RF.data.patients || []).filter(p => rfUuid(p.id) && fullName(p).toLowerCase().includes(q)).slice(0, 6) : [];
    return `<div class="rf-sat-arr">
      <div><b>${rfEsc(x.nome_letto || 'Paziente')}</b>${x.nascita_letta ? `, ${rfSatGiorno(x.nascita_letta)}` : ''} · ${t.notti || 0} ${t.notti === 1 ? 'notte' : 'notti'} dal ${rfSatGiorno(x.inizio)} · SpO₂ media ${rfSatN(t.media, 1)}% · ODI 4% ${rfSatN(t.odi4, 1)}/h${x.referto_nome ? ` · <a href="${RF_SAT_URL}/${x.id}?referto=1" target="_blank" rel="noopener">apri il rapporto</a>` : ''}</div>
      <div class="caption">Non agganciato da solo: ${rfEsc(RF_SAT_MOTIVO[x.motivo] || 'da assegnare')}.</div>
      ${puo ? `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        ${s.nuova ? `<input class="input" style="width:150px;height:32px;min-width:0" placeholder="Cognome" value="${rfEsc(s.cognome)}" oninput="RF.sat.scelte['${x.id}'].cognome=this.value"><input class="input" style="width:150px;height:32px;min-width:0" placeholder="Nome" value="${rfEsc(s.nome)}" oninput="RF.sat.scelte['${x.id}'].nome=this.value"><input class="input" style="width:120px;height:32px;min-width:0" placeholder="31.12.1950" value="${rfEsc(s.nascita)}" oninput="RF.sat.scelte['${x.id}'].nascita=this.value"><button class="btn sm primary" onclick="rfSatCrea('${x.id}')">Crea la cartella</button><button class="btn sm ghost" onclick="delete RF.sat.scelte['${x.id}'];render()">Annulla</button>`
          : s.pid ? `<span class="badge accent">${rfEsc(s.nome)}</span><button class="btn sm ghost" onclick="delete RF.sat.scelte['${x.id}'];render()">Cambia</button><button class="btn sm primary" onclick="rfSatAssegna('${x.id}')">Metti nella sua cartella</button>`
          : `<input class="input" id="rf-sat-ac-${x.id}" style="width:220px;height:32px;min-width:0" placeholder="Di chi è? Scrivi il cognome" value="${rfEsc(s.cerca || '')}" oninput="rfSatCerca('${x.id}', this.value)">${trovati.map(p => `<button class="btn sm" onclick="rfSatScegli('${x.id}','${p.id}')">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</button>`).join('')}<button class="btn sm" onclick="rfSatNuova('${x.id}')">Non ha ancora la cartella: creala</button>`}
        <span class="grow"></span><button class="btn sm ghost" onclick="rfSatScarta('${x.id}')">Scarta</button></div>` : '<div class="caption">Il tuo ruolo non assegna gli invii.</div>'}</div>`;
  };
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Arrivati dal generatore, da assegnare</span><span class="badge warning">${a.length}</span></div>${a.map(riga).join('')}</div>`;
}

/* ---------- i grafici ---------- */
// Una notte: saturazione sopra (70–100%, il 90% tratteggiato, le cadute ≥4% come triangoli) e frequenza cardiaca sotto.
function rfSatNotteSvg(n) {
  const W = 760, sx = 40, dx = 10, h1 = 120, h2 = 70, gap = 26, top = 8, H = top + h1 + gap + h2 + 22;
  const tot = Math.max(1, (n.fine - n.inizio) / 60000), w = W - sx - dx;
  const X = (m) => sx + (m / tot) * w;
  const Ys = (v) => top + (1 - (Math.max(70, Math.min(100, v)) - 70) / 30) * h1;
  const yF0 = top + h1 + gap, Yf = (v) => yF0 + (1 - (Math.max(40, Math.min(120, v)) - 40) / 80) * h2;
  const linea = (punti, Y, campo) => { let d = '', su = false; for (const p of punti) { const v = p[campo]; if (v == null) { su = false; continue; } d += `${su ? 'L' : 'M'}${X(p.m).toFixed(1)},${Y(v).toFixed(1)}`; su = true; } return d; };
  const ore = []; const h0 = new Date(n.inizio); const primo = 60 - h0.getUTCMinutes();
  for (let m = primo % 60; m <= tot; m += 60) ore.push(m);
  const tick = ore.map(m => `<line x1="${X(m)}" x2="${X(m)}" y1="${top}" y2="${yF0 + h2}" stroke="var(--border)" stroke-width="1"/><text x="${X(m)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--text-2)">${rfSatOra(n.inizio + m * 60000)}</text>`).join('');
  const assiS = [100, 90, 80, 70].map(v => `<text x="${sx - 6}" y="${Ys(v) + 3}" font-size="10" text-anchor="end" fill="var(--text-2)">${v}</text>`).join('');
  const assiF = [120, 80, 40].map(v => `<text x="${sx - 6}" y="${Yf(v) + 3}" font-size="10" text-anchor="end" fill="var(--text-2)">${v}</text>`).join('');
  const cad = (n.eventi4 || []).map(m => `<path d="M${X(m).toFixed(1)},${top + h1 + 3} l-3,5 h6 z" fill="#c1272d" opacity=".8"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saturazione e frequenza cardiaca nella notte">
    ${tick}${assiS}${assiF}
    <line x1="${sx}" x2="${W - dx}" y1="${Ys(90)}" y2="${Ys(90)}" stroke="#c1272d" stroke-dasharray="4 4" stroke-width="1" opacity=".7"/>
    <path d="${linea(n.serie || [], Ys, 's')}" fill="none" stroke="var(--accent)" stroke-width="1.3" stroke-linejoin="round"/>
    ${cad}
    <path d="${linea(n.serie || [], Yf, 'f')}" fill="none" stroke="#c1272d" stroke-width="1.1" opacity=".75" stroke-linejoin="round"/>
    <text x="${sx}" y="${top - 1}" font-size="10" fill="var(--text-2)" dy="-1">SpO₂ (%)</text><text x="${sx}" y="${yF0 - 4}" font-size="10" fill="var(--text-2)">FC (bpm)</text>
  </svg>`;
}
// Quanto tempo a ogni livello di saturazione, tutte le notti insieme: una barra per punto percentuale, 100 → 80 (sotto, insieme).
function rfSatIstoSvg(hist) {
  const tot = Object.values(hist || {}).reduce((a, b) => a + b, 0); if (!tot) return '';
  const val = []; for (let v = 100; v >= 81; v--) val.push([String(v), (hist[v] || 0) / tot]);
  let sotto = 0; for (const [k, c] of Object.entries(hist)) if (+k <= 80) sotto += c; val.push(['≤80', sotto / tot]);
  const W = 760, H = 150, sx = 30, b = (W - sx - 10) / val.length, max = Math.max(...val.map(x => x[1]), 0.01);
  const barre = val.map(([k, f], i) => { const h = (f / max) * (H - 40); const x = sx + i * b; return `<rect x="${(x + 2).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${(b - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${+k < 90 || k === '≤80' ? '#c1272d' : 'var(--accent)'}" opacity="${+k < 90 || k === '≤80' ? .75 : .85}"/>${f >= 0.005 ? `<text x="${(x + b / 2).toFixed(1)}" y="${(H - 26 - h).toFixed(1)}" font-size="9.5" text-anchor="middle" fill="var(--text-2)">${Math.round(f * 100)}</text>` : ''}<text x="${(x + b / 2).toFixed(1)}" y="${H - 8}" font-size="9.5" text-anchor="middle" fill="var(--text-2)">${k}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Parte del sonno a ogni livello di saturazione">${barre}</svg>`;
}

/* ---------- il dettaglio ---------- */
function rfSatDettaglio() {
  const d = RF.sat.dati;
  if (!d) return `<div class="page-head"><div><h2 class="page-title">Saturazione notturna</h2><div class="page-sub">Carico…</div></div></div>`;
  const t = d.totale || {}, notti = d.notti || [], chi = d.cognome ? `${d.cognome} ${d.nome}` : (d.nome_letto || 'Paziente');
  const tiles = `<div class="rf-sat-tiles">
    <div class="rf-sat-tile"><div class="n">${rfSatN(t.media, 1)}%</div><div class="t">Saturazione media</div><div class="s">su ${t.notti} ${t.notti === 1 ? 'notte' : 'notti'} · massima ${rfSatN(t.max)}%</div></div>
    <div class="rf-sat-tile"><div class="n">${rfSatN(t.min)}%</div><div class="t">Saturazione minima</div><div class="s">il valore più basso</div></div>
    <div class="rf-sat-tile"><div class="n">${rfSatN(t.t90)} <small style="font-size:13px;color:var(--text-2)">min</small></div><div class="t">Tempo sotto il 90%</div><div class="s">${rfSatN(t.t90pct, 1)}% del sonno</div></div>
    <div class="rf-sat-tile"><div class="n">${rfSatN(t.odi4, 1)}<small style="font-size:13px;color:var(--text-2)">/h</small></div><div class="t">Cadute all’ora (ODI 4%)</div><div class="s">${t.cad4} cadute ≥4% · ODI 3%: ${rfSatN(t.odi3, 1)}/h ${rfSatBadge(t.odi4)}</div></div>
    <div class="rf-sat-tile"><div class="n">${rfSatN(t.fcmedia)} <small style="font-size:13px;color:var(--text-2)">bpm</small></div><div class="t">Frequenza cardiaca media</div><div class="s">${rfSatN(t.fcmin)}–${rfSatN(t.fcmax)} bpm</div></div>
  </div>`;
  const righe = notti.map(n => `<tr><td>${rfSatNotteNome(n.inizio)}</td><td>${rfSatOra(n.inizio)}–${rfSatOra(n.fine)}</td><td>${rfSatHm(n.durata)}</td><td>${rfSatN(n.spo2.media, 1)}</td><td>${rfSatN(n.spo2.min)}</td><td>${rfSatN(n.t90)} min</td><td>${n.cad3} · ${rfSatN(n.odi3, 1)}/h</td><td>${n.cad4} · ${rfSatN(n.odi4, 1)}/h ${rfSatBadge(n.odi4)}</td><td>${rfSatN(n.fc.media)} (${rfSatN(n.fc.min)}–${rfSatN(n.fc.max)})</td></tr>`).join('');
  const tabella = `<div class="card mt-16"><div class="section-title">Notte per notte</div><div class="rf-sat-scroll mt-8"><table class="rf-sat-tab"><thead><tr><th>Notte</th><th>Dalle – alle</th><th>Durata</th><th>SpO₂ media</th><th>min</th><th>&lt; 90%</th><th>Cadute ≥3%</th><th>Cadute ≥4%</th><th>FC media (min–max)</th></tr></thead><tbody>${righe}
    ${notti.length > 1 ? `<tr class="tot"><td>Tutte</td><td></td><td>${rfSatHm(t.durata)}</td><td>${rfSatN(t.media, 1)}</td><td>${rfSatN(t.min)}</td><td>${rfSatN(t.t90)} min</td><td>${t.cad3} · ${rfSatN(t.odi3, 1)}/h</td><td>${t.cad4} · ${rfSatN(t.odi4, 1)}/h</td><td>${rfSatN(t.fcmedia)} (${rfSatN(t.fcmin)}–${rfSatN(t.fcmax)})</td></tr>` : ''}</tbody></table></div>
    <p class="caption mt-8">Cadute = abbassamenti della saturazione di almeno 3 o 4 punti rispetto ai 2 minuti precedenti, per almeno 10 secondi. ODI 4% indicativo: meno di 5 all’ora nella norma, 5–15 lieve, 15–30 moderato, oltre 30 marcato. L’anello è uno strumento di screening: la valutazione è del medico.</p></div>`;
  const grafici = notti.map(n => `<div class="rf-sat-notte"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><b>Notte di ${rfSatNotteNome(n.inizio)}</b><span class="caption">${rfSatOra(n.inizio)}–${rfSatOra(n.fine)} · ${rfSatHm(n.durata)} · SpO₂ ${rfSatN(n.spo2.media, 1)}% (min ${rfSatN(n.spo2.min)}%) · sotto il 90%: ${rfSatN(n.t90)} min · cadute ≥4%: ${n.cad4} (${rfSatN(n.odi4, 1)}/h)</span></div>${rfSatNotteSvg(n)}</div>`).join('');
  const altre = (d.altre || []).length ? `<div class="card mt-16"><div class="section-title">Altre registrazioni di ${rfEsc(chi)}</div><div class="rf-sat-scroll mt-8"><table class="rf-sat-tab"><tbody>${d.altre.map(a => `<tr class="clic" onclick="rfSatApri('${a.id}')"><td>dal ${rfSatGiorno(a.inizio)}</td><td>${a.totale.notti} ${a.totale.notti === 1 ? 'notte' : 'notti'}</td><td>SpO₂ ${rfSatN(a.totale.media, 1)}%</td><td>min ${rfSatN(a.totale.min)}%</td><td>&lt;90%: ${rfSatN(a.totale.t90)} min</td><td>ODI 4% ${rfSatN(a.totale.odi4, 1)}/h ${rfSatBadge(a.totale.odi4)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  return `<div class="page-head"><div><button class="btn sm ghost" onclick="rfSatChiudi()">${ICONS.arrowL || '←'} Saturazione notturna</button>
      <h2 class="page-title mt-8">${d.patient_id ? `<a onclick="go('#/patients/${rfEsc(d.patient_id)}')" style="cursor:pointer">${rfEsc(chi)}</a>` : rfEsc(chi)}</h2>
      <div class="page-sub">${d.data_nascita ? `nato il ${rfSatGiorno(d.data_nascita)} · ` : ''}${rfEsc(d.apparecchio)} · ${t.notti} ${t.notti === 1 ? 'notte' : 'notti'}, dal ${rfSatGiorno(d.inizio)} al ${rfSatGiorno(d.fine)}</div></div>
      <div class="actions">${d.documento_id ? `<a class="btn" href="/api/documents/${rfEsc(d.documento_id)}" target="_blank" rel="noopener">${ICONS.file || ''} Apri il rapporto</a>` : ''}</div></div>
    ${tiles}${tabella}
    <div class="card mt-16"><div class="section-title">Ogni notte: saturazione e frequenza cardiaca</div>${grafici}
      <div class="rf-sat-leg"><span><b style="color:var(--accent)">—</b> saturazione (minimo ogni 30 s)</span><span><b style="color:#c1272d">- -</b> 90%</span><span><b style="color:#c1272d">▲</b> caduta di almeno 4 punti</span><span><b style="color:#c1272d">—</b> frequenza cardiaca</span></div></div>
    <div class="card mt-16 rf-sat-isto"><div class="section-title">Quanto tempo a ogni livello di saturazione</div>${rfSatIstoSvg(t.hist)}<p class="caption mt-8">Percentuale del sonno a ogni valore di saturazione, tutte le notti insieme; in rosso sotto il 90%.</p></div>
    ${d.nota || d.valutazione ? `<div class="card mt-16">${d.nota ? `<div class="section-title">Nota</div><p style="margin:6px 0 0;white-space:pre-wrap">${rfEsc(d.nota)}</p>` : ''}${d.valutazione ? `<div class="section-title mt-16">Valutazione del medico</div><p style="margin:6px 0 0;white-space:pre-wrap">${rfEsc(d.valutazione)}</p>` : ''}</div>` : ''}
    ${altre}`;
}

/* ---------- la pagina ---------- */
PAGES.saturazione = () => {
  if (!RF.live) return '<div class="page"><div class="card"><p class="meta" style="margin:0">La saturazione notturna è una funzione della piattaforma: qui, fuori, non ci sono dati.</p></div></div>';
  if (RF.sat.aperto) return rfSatDettaglio();
  if (RF.sat.lista === null && !RF.sat.errore) { void rfSatCarica(); return `<div class="page-head"><div><h2 class="page-title">Saturazione notturna</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  const l = RF.sat.lista || [];
  const righe = l.map(x => { const t = x.totale || {}; return `<tr class="clic" onclick="rfSatApri('${x.id}')"><td><b>${rfEsc(x.cognome ? `${x.cognome} ${x.nome}` : (x.nome_letto || '—'))}</b>${x.data_nascita ? `<div class="caption">${rfSatGiorno(x.data_nascita)}</div>` : ''}</td><td>${rfSatGiorno(x.inizio)}${x.fine && x.fine.slice(0, 10) !== x.inizio.slice(0, 10) ? ` – ${rfSatGiorno(x.fine)}` : ''}</td><td>${t.notti || 0}</td><td>${rfSatN(t.media, 1)}%</td><td>${rfSatN(t.min)}%</td><td>${rfSatN(t.t90)} min</td><td>${rfSatN(t.odi4, 1)}/h ${rfSatBadge(t.odi4)}</td><td>${x.documento_id ? `<a href="/api/documents/${rfEsc(x.documento_id)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">rapporto</a>` : ''}</td></tr>`; }).join('');
  return `<div class="page-head"><div><h2 class="page-title">Saturazione notturna</h2><div class="page-sub">${l.length} ${l.length === 1 ? 'registrazione' : 'registrazioni'} dell’anello O2Ring · arrivano dal generatore dei referti, scheda «Sonno · O2Ring», dopo la conferma</div></div></div>
    ${RF.sat.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.sat.errore)}</div>` : ''}
    ${rfSatArriviHtml()}
    <div class="card mt-16">${l.length ? `<div class="rf-sat-scroll"><table class="rf-sat-tab"><thead><tr><th>Paziente</th><th>Notti</th><th>N.</th><th>SpO₂ media</th><th>Minima</th><th>&lt; 90%</th><th>ODI 4%</th><th></th></tr></thead><tbody>${righe}</tbody></table></div>`
      : `<div class="caption">Ancora nessuna registrazione. Nel generatore dei referti, scheda «Sonno · O2Ring»: carica le notti, controlla il rapporto, conferma e invia — col «Collegamento ReferralFlow» della pressione, la stessa chiave.</div>`}</div>`;
};
