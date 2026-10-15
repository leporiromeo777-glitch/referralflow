/* LA PEDALIERA della segreteria (15.10.2026, richiesta dello studio: «la segretaria ha una pedaliera con cui fa partire
   e fermare l'audio: fai che funzioni»). Vale nella revisione dei referti, semplice e completa.

   Come per il tasto del microfono nel dittafono, la pagina non deve sapere com'è fatta la pedaliera: la IMPARA.
   «Premi il pedale che fa partire l'audio», poi (facoltativi) quello per tornare indietro e quello per andare avanti.
   Funziona sia con una pedaliera che il browser legge come dispositivo USB (WebHID: Chrome ed Edge, scelta una volta)
   sia con una pedaliera impostata per mandare tasti della tastiera. La scelta resta su quel computer.

   Pedale dell'audio: un colpo avvia, un altro colpo ferma; tenuto premuto, suona finché lo si tiene (come nei
   programmi di trascrizione). Ripartendo torna indietro di un secondo. Indietro e avanti: due secondi a colpo, di
   continuo finché si tengono premuti. */
const RF_PED = 'rf-pedaliera';
const RF_PED_RUOLI = [['play', 'il pedale che fa partire e fermare l’audio'], ['indietro', 'il pedale per tornare indietro'], ['avanti', 'il pedale per andare avanti']];
RF.ped = RF.ped || { giu: {}, aperti: [] };

function rfPedLetta() { try { return JSON.parse(localStorage.getItem(RF_PED) || 'null'); } catch (_) { return null; } }
function rfPedSalva(m) { try { if (m) localStorage.setItem(RF_PED, JSON.stringify(m)); else localStorage.removeItem(RF_PED); } catch (_) { /* resta per questa pagina */ } }
function rfPedNome(x) { return x ? (x.tipo === 'tasto' ? `tasto ${x.key}` : (x.nome || 'pedale')) : ''; }

// La riga che dice com'è collegata, con i link: sotto l'audio nella revisione semplice, nel riquadro della completa.
function rfPedHtml() {
  const m = rfPedLetta();
  if (!m || !m.play) return `<span class="caption">Pedaliera: <a href="javascript:void 0" onclick="rfPedCollega()">collega la pedaliera</a></span>`;
  const altri = [m.indietro ? 'indietro' : '', m.avanti ? 'avanti' : ''].filter(Boolean);
  return `<span class="caption">Pedaliera collegata${altri.length ? ` (avvia/ferma, ${altri.join(', ')})` : ' (avvia/ferma)'} · <a href="javascript:void 0" onclick="rfPedCollega()">rifai</a> · <a href="javascript:void 0" onclick="rfPedScollega()">scollega</a></span>`;
}
function rfPedScollega() { rfPedSalva(null); rfPedRidisegna(); toast('Pedaliera scollegata'); }
function rfPedRidisegna() { document.querySelectorAll('.rf-ped-riga').forEach(el => { el.innerHTML = rfPedHtml(); }); }

// ── imparare ──────────────────────────────────────────────────────────
async function rfPedCollega() {
  RF.ped.impara = { passo: 0, nuova: {}, visti: {} };
  openModal('Collega la pedaliera', `<p id="rf-ped-passo"></p><p class="caption" id="rf-ped-nota"></p>`,
    `<button class="btn" onclick="rfPedSalta()" id="rf-ped-salta">Salta questo pedale</button><button class="btn" data-close onclick="RF.ped.impara=null">Annulla</button>`);
  rfPedPasso();
  if (navigator.hid) {
    try {
      const scelti = await navigator.hid.requestDevice({ filters: [] });
      let aperti = 0; for (const dev of scelti) if (await rfPedApri(dev)) aperti++;
      const n = document.getElementById('rf-ped-nota');
      if (n) n.textContent = scelti.length ? (aperti ? '' : 'Non riesco ad aprire quel dispositivo: forse lo tiene tutto per sé un altro programma (chiudi SpeechExec e riprova).') : 'Nessun dispositivo scelto: va bene anche una pedaliera che manda tasti della tastiera, premi il pedale.';
    } catch (_) { /* finestra chiusa: restano i tasti */ }
  } else { const n = document.getElementById('rf-ped-nota'); if (n) n.textContent = 'Questo browser legge solo i tasti della tastiera (per la pedaliera USB servono Chrome o Edge).'; }
}
function rfPedPasso() {
  const im = RF.ped.impara; if (!im) return;
  const el = document.getElementById('rf-ped-passo'), sl = document.getElementById('rf-ped-salta');
  if (el) el.innerHTML = `<b>Premi ${RF_PED_RUOLI[im.passo][1]}</b>, poi lascialo.`;
  if (sl) sl.style.display = im.passo === 0 ? 'none' : '';
}
function rfPedImparato(x) {
  const im = RF.ped.impara; if (!im) return;
  const ruolo = RF_PED_RUOLI[im.passo][0];
  // lo stesso pedale per due cose no
  if (Object.values(im.nuova).some(y => JSON.stringify({ ...y, nome: '' }) === JSON.stringify({ ...x, nome: '' }))) { const n = document.getElementById('rf-ped-nota'); if (n) n.textContent = 'Questo pedale l’hai già usato: premi l’altro, o «Salta».'; return; }
  im.nuova[ruolo] = x; im.visti = {};
  rfPedAvanti();
}
function rfPedSalta() { if (RF.ped.impara && RF.ped.impara.passo > 0) rfPedAvanti(); }
function rfPedAvanti() {
  const im = RF.ped.impara; im.passo++;
  if (im.passo < RF_PED_RUOLI.length) { rfPedPasso(); return; }
  rfPedSalva(im.nuova); RF.ped.impara = null; RF.ped.giu = {};
  closeModal(); rfPedRidisegna();
  toast('Pedaliera collegata: un colpo avvia, un altro ferma; tenuto premuto suona finché lo tieni');
}

// ── dispositivi USB (WebHID) ─────────────────────────────────────────
async function rfPedApri(dev) {
  try {
    if (!dev.opened) await dev.open();
    if (!RF.ped.aperti.includes(dev)) { dev.addEventListener('inputreport', rfPedRapporto); RF.ped.aperti.push(dev); }
    return true;
  } catch (_) { return false; }
}
// Un messaggio dalla pedaliera. Mentre si impara: il pedale è il primo bit che si accende e poi si spegne (premuto, lasciato).
function rfPedRapporto(e) {
  const b = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), dev = e.device, im = RF.ped.impara;
  if (im) {
    const k = `${dev.vendorId}:${dev.productId}:${e.reportId}`, ora = Date.now(), accesi = im.visti[k] || (im.visti[k] = {});
    for (let i = 0; i < b.length; i++) for (let bit = 1; bit < 256; bit <<= 1) {
      const chi = `${i}:${bit}`;
      if (b[i] & bit) { if (!accesi[chi]) accesi[chi] = ora; continue; }
      if (!accesi[chi]) continue;
      const tenuto = ora - accesi[chi]; delete accesi[chi];
      if (tenuto < 60) continue;      // rimbalzi
      // sui dispositivi Philips il primo byte può dire il tipo di messaggio: se il pedale non sta lì, si guardano solo quelli dello stesso tipo
      rfPedImparato({ tipo: 'hid', vid: dev.vendorId, pid: dev.productId, rid: e.reportId, i, maschera: bit, ...(i > 0 && b.length > 1 ? { tipo0: b[0] } : {}), nome: dev.productName || 'pedaliera' });
      return;
    }
    return;
  }
  const m = rfPedLetta(); if (!m) return;
  for (const [ruolo] of RF_PED_RUOLI) {
    const x = m[ruolo];
    if (!x || x.tipo !== 'hid' || x.vid !== dev.vendorId || x.pid !== dev.productId || x.rid !== e.reportId || x.i >= b.length) continue;
    if (typeof x.tipo0 === 'number' && b[0] !== x.tipo0) continue;
    rfPedStato(ruolo, (b[x.i] & x.maschera) !== 0);
  }
}
// Le pedaliere già scelte una volta si riaprono da sole, anche dopo averle staccate e riattaccate.
async function rfPedRiapri() {
  if (!navigator.hid) return;
  const m = rfPedLetta(); if (!m) return;
  const vogliamo = Object.values(m).filter(x => x && x.tipo === 'hid');
  if (!vogliamo.length) return;
  try { for (const dev of await navigator.hid.getDevices()) if (vogliamo.some(x => x.vid === dev.vendorId && x.pid === dev.productId)) await rfPedApri(dev); } catch (_) { /* niente */ }
}
if (navigator.hid) { navigator.hid.addEventListener('connect', () => void rfPedRiapri()); void rfPedRiapri(); }

// ── pedaliere che mandano tasti ──────────────────────────────────────
// Solo tasti che non scrivono (F1…F24, frecce, tasti multimediali…): una lettera servirebbe per scrivere la lettera.
function rfPedTasto(e, giu) {
  if (e.key && e.key.length === 1) return;
  const im = RF.ped.impara;
  if (im) {
    if (!giu || ['Escape', 'Tab', 'Enter', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    rfPedImparato({ tipo: 'tasto', code: e.code, key: e.key });
    return;
  }
  const m = rfPedLetta(); if (!m || state.route !== 'review') return;
  for (const [ruolo] of RF_PED_RUOLI) {
    const x = m[ruolo];
    if (x && x.tipo === 'tasto' && x.code === e.code) { e.preventDefault(); e.stopPropagation(); if (!(giu && e.repeat)) rfPedStato(ruolo, giu); return; }
  }
}
document.addEventListener('keydown', (e) => rfPedTasto(e, true), true);
document.addEventListener('keyup', (e) => rfPedTasto(e, false), true);

// ── che cosa fa ogni pedale ──────────────────────────────────────────
function rfPedStato(ruolo, giu) {
  const P = RF.ped; if (!!P.giu[ruolo] === giu) return;
  P.giu[ruolo] = giu;
  if (state.route !== 'review' || typeof rvPlay !== 'function') return;
  if (ruolo === 'play') {
    if (giu) {
      if (RV.playing) { rvPause(); P.tenendo = false; return; }
      rvPlay(Math.max(0, (RV.t || 0) - 1)); P.tenendo = true; P.giuIl = Date.now();
    } else if (P.tenendo) { P.tenendo = false; if (Date.now() - P.giuIl >= 600) rvPause(); }
    return;
  }
  clearInterval(P.giro);
  if (!giu) return;
  const verso = ruolo === 'indietro' ? -1 : 1;
  const passo = () => rvSeek(Math.max(0, Math.min(RV_AUDIO.dur || Infinity, (RV.t || 0) + verso * 2)), RV.playing);
  passo(); P.giro = setInterval(passo, 350);
}

// Nella revisione completa la riga della pedaliera sta in testa, sopra la griglia.
(function () {
  const prima = PAGES.review;
  PAGES.review = () => {
    let html = prima();
    if (RF.live && html.includes('<div class="rv-grid')) html = html.replace('<div class="rv-grid', `<div class="rf-ped-riga" style="margin:0 0 8px">${rfPedHtml()}</div><div class="rv-grid`);
    return html;
  };
})();
