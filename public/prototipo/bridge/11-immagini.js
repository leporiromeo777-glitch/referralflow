/* =====================================================================
   Immagini diagnostiche (18.9.2026) — [[Piattaforma/Immagini]]
   =====================================================================
   Gli esami per immagini erano l'unica parte della cartella che la
   piattaforma non sapeva tenere: arrivavano su CD e su chiavette, e per
   guardarli bisognava andare al PC dove era installato il visualizzatore.
   Qui diventano una voce del menu come le altre — stesso studio, stesso
   paziente, stessi ruoli, e un registro di chi ha aperto cosa.

   Il DICOM lo apre il server (imaging/leggi-dicom.py) e manda al browser un
   PNG già finestrato: niente libreria da megabyte, funziona sul telefono, e
   il file originale non esce mai da qui. */
if (typeof NAV_META !== 'undefined') NAV_META.imaging = ['Immagini', 'imaging'];
if (typeof NAV !== 'undefined') for (const r of ['secretary', 'assistant', 'doctor', 'org_admin']) {
  const n = NAV[r]; if (n && !n.includes('imaging')) n.splice(n.indexOf('documents') + 1, 0, 'imaging');
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-img-corpo { display:grid; grid-template-columns: 148px 1fr; gap:16px; align-items:start; }
@media (max-width: 900px) { .rf-img-corpo { grid-template-columns: 1fr; } }
.rf-img-serie { display:flex; flex-direction:column; gap:8px; max-height:70vh; overflow:auto; padding-right:4px; }
@media (max-width: 900px) { .rf-img-serie { flex-direction:row; max-height:none; overflow-x:auto; } }
.rf-img-s { border:1px solid var(--border); border-radius:10px; padding:6px; background:var(--surface); cursor:pointer; text-align:left; min-width:132px; }
.rf-img-s.active { border-color:var(--cta); box-shadow:0 0 0 1px var(--cta) inset; }
.rf-img-s img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; background:#000; display:block; }
.rf-img-s .n { font-size:11px; color:var(--muted); margin-top:4px; line-height:1.3; }
.rf-img-vista { background:#000; border-radius:12px; display:flex; align-items:center; justify-content:center; min-height:44vh; overflow:hidden; position:relative; }
.rf-img-vista img { max-width:100%; max-height:70vh; display:block; image-rendering:auto; }
.rf-img-vista .vuoto { color:#888; font-size:13px; padding:40px; text-align:center; }
.rf-img-hud { position:absolute; left:10px; top:8px; color:#bbb; font-size:11px; font-variant-numeric:tabular-nums; pointer-events:none; text-shadow:0 1px 2px #000; }
.rf-img-hud.destra { left:auto; right:10px; text-align:right; }
.rf-img-barra { display:flex; align-items:center; gap:10px; margin-top:10px; flex-wrap:wrap; }
.rf-img-barra input[type=range] { flex:1; min-width:160px; }
.rf-img-drop { border:1.5px dashed var(--border); border-radius:12px; padding:18px; text-align:center; color:var(--muted); font-size:13px; }
.rf-img-drop.sopra { border-color:var(--cta); color:var(--cta); }
.rf-img-limite { font-size:12px; line-height:1.5; color:var(--muted); border-left:3px solid var(--border); padding:2px 0 2px 10px; margin:12px 0 0; }
.rf-img-vista .limite { position:absolute; left:0; right:0; bottom:0; background:rgba(0,0,0,.55); color:#ddd; font-size:11px; padding:5px 10px; text-align:center; pointer-events:none; }
.rf-mis-tela { position:relative; max-width:100%; line-height:0; }
.rf-mis-tela canvas { position:absolute; left:0; top:0; pointer-events:none; touch-action:none; }
.rf-mis-tela.attiva canvas { pointer-events:auto; cursor:crosshair; }
.rf-mis-riga.annullata .name { text-decoration:line-through; color:var(--muted); }
.rf-mis-riga.qui { border-left:3px solid var(--cta); padding-left:9px; }
.rf-mis-ind { display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:3px 9px; border-radius:999px; border:1px solid var(--border); background:var(--surface); }
.rf-mis-ind.st-VALIDATED { color:#0d5c48; border-color:#8fcdb6; }
.rf-mis-ind.st-CAUTION { color:#8a5a00; border-color:#e6c27a; }
.rf-mis-ind.st-NOT_MEASURABLE { color:#8a1f1f; border-color:#e5a3a3; }
.rf-mis-ind button { all:unset; cursor:pointer; text-decoration:underline; font-size:11px; color:var(--muted); }
.rf-mis-motivo { font-size:12px; color:var(--muted); line-height:1.45; }
.rf-mis-str { display:flex; flex-wrap:wrap; gap:4px; }
.rf-mis-str button.attivo { background:var(--cta); color:#fff; border-color:var(--cta); }
.rf-mis-stato { font-size:11px; margin-left:4px; }
.rf-mis-stato.st-CAUTION { color:#8a5a00; } .rf-mis-stato.st-VALIDATED { color:#0d5c48; }
`; document.head.appendChild(st); })();

RF.img = { lista: null, conta: {}, errore: null, lettore: true, aperto: null, dati: null, serie: 0, idx: 0, frame: 0, ww: null, wl: null, carico: false, filtro: '' };
/* Il righello (19.9.2026): è la parte della piattaforma che è un dispositivo
   medico in-house dello studio (docs/legale/dispositivo-in-house/). La
   matematica sta in misura.js, uguale per browser e server; qui c'è solo il
   gesto — due punti trascinati sull'immagine — e il disegno. */
RF.mis = { attiva: false, bozza: null, esito: null, trascina: false, chieste: {}, strumento: 'distanza', cursore: null };
/* Piani ricostruiti (fase 9): null = immagine nativa; altrimenti { tipo, indice } */
RF.mpr = { piano: null, indice: 0 };

async function rfImgCarica(rendi = true) {
  try {
    const r = await fetch('/api/prototipo/imaging', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { RF.img.errore = r.status === 403 ? 'Le immagini le vede chi cura: il tuo ruolo non ci accede.' : `Non riesco a leggere gli esami (${r.status}).`; if (rendi) render(); return; }
    const j = await r.json();
    RF.img.lista = j.esami || []; RF.img.conta = j.conta || {}; RF.img.lettore = j.lettore !== false;
    RF.img.ricezione = j.ricezione || null; RF.img.errore = null;
  } catch { RF.img.errore = 'Piattaforma non raggiungibile.'; }
  if (rendi) render();
}

async function rfImgApri(id) {
  RF.img.aperto = id; RF.img.dati = null; RF.img.serie = 0; RF.img.idx = 0; RF.img.frame = 0; RF.img.ww = null; RF.img.wl = null; RF.mpr.piano = null; RF.mpr.indice = 0;
  render();
  try {
    const r = await fetch(`/api/prototipo/imaging/${id}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { RF.img.errore = `Esame non leggibile (${r.status}).`; render(); return; }
    RF.img.dati = await r.json();
  } catch { RF.img.errore = 'Piattaforma non raggiungibile.'; }
  render();
}
function rfImgChiudi() { RF.img.aperto = null; RF.img.dati = null; render(); void rfImgCarica(); }

function rfImgSerieCorrente() {
  const d = RF.img.dati; if (!d) return null;
  return d.serie[Math.min(RF.img.serie, d.serie.length - 1)] || null;
}
function rfImgVisibili(s) { return (s && s.immagini ? s.immagini.filter(i => i.immagine) : []); }
function rfImgCorrente() {
  const v = rfImgVisibili(rfImgSerieCorrente());
  return v[Math.min(RF.img.idx, v.length - 1)] || null;
}
function rfImgUrl(i, lato, frame) {
  if (!i) return '';
  const q = [`lato=${lato}`, `frame=${frame || 0}`];
  if (RF.img.ww !== null && RF.img.wl !== null) q.push(`ww=${RF.img.ww}`, `wl=${RF.img.wl}`);
  return `/api/prototipo/imaging/immagine/${i.id}?${q.join('&')}`;
}
function rfImgVaiSerie(n) { RF.img.serie = n; RF.img.idx = 0; RF.img.frame = 0; RF.mpr.piano = null; RF.mpr.indice = 0; render(); }
function rfImgScorri(d) {
  const v = rfImgVisibili(rfImgSerieCorrente()); if (!v.length) return;
  const i = rfImgCorrente();
  if (i && i.frame > 1) { RF.img.frame = Math.max(0, Math.min(i.frame - 1, RF.img.frame + d)); render(); return; }
  RF.img.idx = Math.max(0, Math.min(v.length - 1, RF.img.idx + d)); RF.img.frame = 0; render();
}
function rfImgVai(n) { RF.img.idx = Number(n) || 0; RF.img.frame = 0; render(); }
function rfImgFrame(n) { RF.img.frame = Number(n) || 0; render(); }
function rfImgFinestra(ww, wl) { RF.img.ww = ww; RF.img.wl = wl; render(); }

async function rfImgAzione(corpo, messaggio) {
  try {
    const r = await fetch('/api/prototipo/imaging', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.errore || 'Non riuscito'); return false; }
    if (messaggio) toast(messaggio);
    return true;
  } catch { toast('Piattaforma non raggiungibile'); return false; }
}

function rfImgAbbina(id) {
  const paz = (RF.data && RF.data.patients ? RF.data.patients : []).filter(p => rfUuid(p.id));
  const righe = paz.slice(0, 400).map(p => `<option value="${p.id}">${rfEsc(fullName(p))}${p.dob ? ` · ${rfEsc(p.dob)}` : ''}</option>`).join('');
  openModal('A chi è questo esame', `<div class="field"><label>Paziente della cartella</label><select class="input" id="rf-img-paz"><option value="">— scegli —</option>${righe}</select></div>
    <p class="caption mt-8">La piattaforma abbina da sola solo quando nome <b>e</b> data di nascita del file combaciano con una persona sola. Un omonimo non si indovina: lo decide chi guarda.</p>`,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" id="rf-img-ok">Abbina</button>`);
  document.getElementById('rf-img-ok').onclick = async () => {
    const pid = document.getElementById('rf-img-paz').value;
    if (!pid) { toast('Scegli un paziente'); return; }
    if (await rfImgAzione({ azione: 'abbina', id, patient_id: pid }, 'Esame abbinato')) {
      closeModal(); if (RF.img.aperto === id) await rfImgApri(id); else await rfImgCarica();
    }
  };
}

async function rfImgImporta(files) {
  if (!files || !files.length) return;
  RF.img.carico = true; render();
  const fd = new FormData();
  let n = 0;
  for (const f of files) { if (n >= 300) break; fd.append('file', f); n++; }
  try {
    const r = await fetch('/api/prototipo/imaging', { method: 'POST', credentials: 'include', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.errore || 'Importazione non riuscita');
    else toast(`${j.immagini} immagini in ${j.esami} ${j.esami === 1 ? 'esame' : 'esami'}${j.scartati ? ` · ${j.scartati} file non DICOM` : ''}`);
  } catch { toast('Piattaforma non raggiungibile'); }
  RF.img.carico = false;
  await rfImgCarica();
}

function rfImgDrop(e, sopra) { e.preventDefault(); const z = document.getElementById('rf-img-drop'); if (z) z.classList.toggle('sopra', sopra); }
function rfImgDropFile(e) {
  e.preventDefault(); rfImgDrop(e, false);
  const dt = e.dataTransfer; if (!dt) return;
  void rfImgImporta([...dt.files]);
}

const RF_IMG_STATO = { da_verificare: ['warning', 'da verificare'], disponibile: ['success', 'in cartella'], nascosto: ['', 'nascosto'] };

function rfMisPuo() { return ['doctor', 'assistant', 'org_admin'].includes(state.role); }
function rfMisAttiva(sostituisce) {
  if (!rfMisPuo()) { toast('Misura chi cura: il tuo ruolo vede le immagini, non le misura'); return; }
  const st = rfMisStatoImmagine(rfImgCorrente());
  if (!RF.mis.attiva && st && st.stato === 'NOT_MEASURABLE') { toast(st.testi[0] || 'Misurazione non disponibile'); return; }
  RF.mis.attiva = sostituisce ? true : !RF.mis.attiva; RF.mis.bozza = null; RF.mis.esito = null; RF.mis.sostituisce = sostituisce || null; render();
}
// La calibrazione dell'immagine. Quelle entrate dal 19.9.2026 ce l'hanno con
// sé; per le altre si chiede una volta al server, che la legge dal DICOM.
function rfMisCal(i) {
  if (!i) return null;
  if (i.calibrazione !== null && i.calibrazione !== undefined) return i.calibrazione;
  if (!RF.mis.chieste[i.id]) {
    RF.mis.chieste[i.id] = true;
    fetch(`/api/prototipo/imaging/immagine/${i.id}/calibrazione`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(j => { if (j && j.calibrazione) { i.calibrazione = j.calibrazione; i.geometria = j.geometria || i.geometria || null; render(); } }).catch(() => {});
  }
  return null;
}
// Il Validation Gate, lato browser: lo stesso codice del server. Serve per
// l'indicatore (✓ ⚠ ✕) e per decidere se mostrare lo strumento; il giudizio
// che conta lo rifà il server prima di salvare.
function rfMisContesto(i, punti) {
  const d = RF.img.dati || {};
  const geometrie = {};
  for (const sr of (d.serie || [])) for (const im of (sr.immagini || [])) if (im.geometria) geometrie[im.id] = im.geometria;
  const v = rfMprVirtuale();
  if (v) return { cal: v.calibrazione, geometria: v.geometria, frame: 0, frameTotali: 1, punti, algoritmo: RF.mis.strumento || 'distanza', cautionValidati: (d.mse && d.mse.caution_validati) || [], modalita: (d.esame && d.esame.modalita) || null, geometrie };
  return { cal: rfMisCal(i), geometria: i ? (i.geometria || null) : null, frame: RF.img.frame, frameTotali: i ? Math.max(1, i.frame) : 1,
    punti, algoritmo: RF.mis.strumento || 'distanza', cautionValidati: (d.mse && d.mse.caution_validati) || [], modalita: (d.esame && d.esame.modalita) || null, geometrie };
}
/* MPR: la griglia virtuale del piano corrente, come la dichiara il server nel dettaglio (serie.mpr) */
function rfMprVirtuale() {
  if (!RF.mpr.piano) return null;
  const sr = rfImgSerieCorrente(); if (!sr || !sr.mpr || !sr.mpr[RF.mpr.piano]) return null;
  return sr.mpr[RF.mpr.piano];
}
function rfMprVai(piano) { RF.mpr.piano = piano; const v = piano ? rfMprVirtuale() : null; RF.mpr.indice = v ? Math.floor(v.n_indici / 2) : 0; RF.mis.bozza = null; RF.mis.esito = null; render(); }
function rfMprIndice(n) { RF.mpr.indice = Number(n) || 0; RF.mis.bozza = null; RF.mis.esito = null; render(); }
function rfMprUrl(sr) {
  const q = [`piano=${RF.mpr.piano}`, `indice=${RF.mpr.indice}`];
  if (RF.img.ww !== null && RF.img.wl !== null) q.push(`ww=${RF.img.ww}`, `wl=${RF.img.wl}`);
  return `/api/prototipo/imaging/serie/${sr.id}/mpr?${q.join('&')}`;
}
function rfMisStatoImmagine(i) {
  if (!i) return null;
  if (rfMprVirtuale()) return RFMSE.validazione.statoImmagine(rfMisContesto(i));
  if (i.calibrazione === null || i.calibrazione === undefined) return { stato: 'ATTESA', motivi: [], avvisi: [], testi: ['Leggo la calibrazione dal file…'] };
  return RFMSE.validazione.statoImmagine(rfMisContesto(i));
}
function rfMisIndicatore(i) {
  const st = rfMisStatoImmagine(i); if (!st) return '';
  if (st.stato === 'ATTESA') return `<span class="rf-mis-ind">… ${rfEsc(st.testi[0])}</span>`;
  const V = RFMSE.validazione;
  return `<span class="rf-mis-ind st-${st.stato}">${V.SEGNI[st.stato]} ${rfEsc(V.ETICHETTE[st.stato])} <button onclick="rfMisDettagli()">Dettagli calibrazione</button></span>`;
}
function rfMisDettagli() {
  const i = rfImgCorrente(); if (!i) return;
  const V = RFMSE.validazione, G = RFMSE.geometria;
  const st = rfMisStatoImmagine(i) || { stato: 'ATTESA', testi: [], motivi: [], avvisi: [] };
  const cal = rfMisCal(i), g = i.geometria || null;
  const d = RF.img.dati || {};
  const r = (k, v) => `<b>${rfEsc(k)}</b><span>${v}</span>`;
  const n = (x) => (x === null || x === undefined) ? '—' : String(Math.round(Number(x) * 1e6) / 1e6).replace('.', ',');
  const righe = [
    r('Stato', st.stato === 'ATTESA' ? '…' : `${V.SEGNI[st.stato]} ${rfEsc(V.ETICHETTE[st.stato])}`),
    r('Modalità', rfEsc((g && g.identita && g.identita.modalita) || (d.esame && d.esame.modalita) || '—')),
    r('Calibrazione usata', rfEsc(G.descriviCalibrazione(cal))),
    r('Origine del valore', rfEsc(cal && cal.tipo === 'us_regioni' ? 'Sequence of Ultrasound Regions (cm per pixel)' : (g && g.spaziatura && g.spaziatura.fonte) || (cal && cal.spacing && cal.spacing.origine) || 'nessuna')),
    r('Unità', 'mm (dal file: cm per le regioni ecografiche, mm per PixelSpacing)'),
  ];
  if (g && g.spaziatura && g.spaziatura.fonte) righe.push(r('Pixel Spacing dichiarato', `${n(g.spaziatura.dx_mm)} × ${n(g.spaziatura.dy_mm)} mm (colonna × riga)${g.spaziatura.calibrazione_tipo ? ` · tipo ${rfEsc(g.spaziatura.calibrazione_tipo)}` : ''}${g.spaziatura.calibrazione_descrizione ? ` · ${rfEsc(g.spaziatura.calibrazione_descrizione)}` : ''}${g.spaziatura.per_frame ? ' · per fotogramma' : ''}`));
  if (g && g.spaziatura && g.spaziatura.imager_dx_mm) righe.push(r('Imager Pixel Spacing', `${n(g.spaziatura.imager_dx_mm)} × ${n(g.spaziatura.imager_dy_mm)} mm (rivelatore, non paziente)`));
  if (g && g.regioni_us && g.regioni_us.length) righe.push(r('Regioni ecografiche', g.regioni_us.map(x => `${x.indice}: ${rfEsc(x.formato)}/${rfEsc(x.tipo_dati)} · ${rfEsc(x.unita_x)}/${rfEsc(x.unita_y)} · Δ ${n(x.delta_x)} / ${n(x.delta_y)} · [${x.x0},${x.y0}]–[${x.x1},${x.y1}]${x.flags && !x.flags.priorita_alta ? ' · bassa priorità' : ''}`).join('<br>')));
  if (g && g.pixel) righe.push(r('Pixel', `${g.pixel.colonne} × ${g.pixel.righe}${g.pixel.aspect ? ` · aspect ${g.pixel.aspect[0]}:${g.pixel.aspect[1]}` : ''}${g.pixel.rescale ? ` · rescale ${n(g.pixel.rescale.slope)}·x + ${n(g.pixel.rescale.intercept)} ${rfEsc(g.pixel.rescale.tipo || '')}` : ''}`));
  if (g && g.spazio) righe.push(r('Piano nel paziente', `${g.spazio.iop ? 'IOP ' + g.spazio.iop.map(n).join(' ') : 'IOP —'}${g.spazio.ipp ? ' · IPP ' + g.spazio.ipp.map(n).join(' ') : ''}${g.spazio.frame_of_reference ? ' · FoR' : ''}${g.spazio.spessore_mm ? ` · spessore ${n(g.spazio.spessore_mm)} mm` : ''} — non usato per la distanza in piano`));
  if (g) righe.push(r('Tipo immagine', rfEsc((g.image_type || []).join(' / ') || '—') + (g.derivata ? ' · <b>derivata</b>' : '')));
  if (g && g.sha256_file) righe.push(r('Impronta del file', `<code>${rfEsc(g.sha256_file.slice(0, 16))}…</code> (SHA-256)`));
  righe.push(r('Versioni', `geometria ${g ? g.versione : '—'} · calcolo ${RFMSE.misure.ALGORITMI.distanza.versione} · gate ${V.VERSIONE} · software ${rfEsc((d.mse && d.mse.versione_software) || '—')}`));
  const lista = (st.motivi || []).concat(st.avvisi || []);
  openModal('Dettagli calibrazione', `<div class="kv">${righe.join('')}</div>${lista.length ? `<div class="mt-8"><div class="caption" style="text-transform:uppercase;letter-spacing:.04em">${st.stato === 'NOT_MEASURABLE' ? 'Motivi' : 'Avvisi'}</div><ul class="rf-mis-motivo" style="margin:4px 0 0 18px">${lista.map(c => `<li>${rfEsc(V.testo(c))} <span class="caption">(${rfEsc(c)})</span></li>`).join('')}</ul></div>` : '<p class="caption mt-8">Nessun avviso: la calibrazione viene dal file e non ha limitazioni note.</p>'}
    <p class="caption mt-8">Il righello non stima mai: tutto ciò che vedi qui è scritto nel file DICOM dall'apparecchio. Fascicolo: <code>docs/legale/dispositivo-in-house/</code>.</p>`,
    `<button class="btn" data-close>Chiudi</button>`);
}
const RF_MIS_STRUMENTI = [
  ['distanza', 'Distanza'], ['polilinea', 'Polilinea'], ['angolo', 'Angolo'], ['rettangolo', 'Rettangolo'],
  ['ellisse', 'Ellisse'], ['poligono', 'Poligono'], ['perimetro', 'Perimetro'], ['punto', 'Punto'], ['distanza_3d', 'Distanza 3D'],
];
function rfMisAlg() { return RFMSE.misure.ALGORITMI[RF.mis.strumento] || RFMSE.misure.ALGORITMI.distanza; }
function rfMisStrumento(nome) {
  if (!RFMSE.misure.ALGORITMI[nome]) return;
  RF.mis.strumento = nome; RF.mis.bozza = null; RF.mis.esito = null; RF.mis.trascina = false; render();
}
// Il gesto di ogni strumento: «trascina» (due punti, come il righello),
// «punto» (un clic), «punti»/«punti_chiusi» (un clic per vertice; l'angolo si
// chiude da solo al terzo, gli altri con doppio clic, Invio o «Chiudi»).
function rfMisIstruzione() {
  var g = rfMisAlg().gesto;
  if (g === 'trascina') return 'trascina fra due punti';
  if (g === 'punto') return 'tocca un punto';
  if (g === 'punti_3d') return RF.mis.bozza && RF.mis.bozza.punti && RF.mis.bozza.punti.length ? 'ora scorri alla seconda fetta e tocca il secondo punto · Esc annulla' : 'tocca il primo punto, poi scorri a un’altra fetta e tocca il secondo';
  if (RF.mis.strumento === 'angolo') return 'tocca il primo braccio, il vertice, il secondo braccio';
  return 'tocca i vertici; doppio clic, Invio o «Chiudi» per finire · Esc annulla';
}
function rfMisPuntiBozza() {
  var b = RF.mis.bozza; if (!b) return [];
  return b.punti ? b.punti.slice() : [b.p1, b.p2];
}
function rfMisAggiorna(puntiProvvisori) {
  var i = rfImgCorrente(); if (!i) return;
  RF.mis.esito = RFMSE.validazione.valuta(rfMisContesto(i, puntiProvvisori));
  rfMisDisegna();
}
function rfMisChiudi() {
  var b = RF.mis.bozza; if (!b || !b.punti) return;
  var alg = rfMisAlg();
  if (b.punti.length < alg.punti[0]) { toast('Servono almeno ' + alg.punti[0] + ' punti'); return; }
  RF.mis.trascina = false;
  rfMisAggiorna(b.punti);
  var es = RF.mis.esito;
  if (!es || es.stato === 'NOT_MEASURABLE' || !es.ok) { toast((es && es.testi[0]) || 'Misura non possibile'); RF.mis.bozza = null; RF.mis.esito = null; rfMisDisegna(); return; }
  b.p1 = b.punti[0]; b.p2 = b.punti[b.punti.length - 1];
  rfMisSalvaModal();
}
function rfMisAnnullaBozza() { RF.mis.bozza = null; RF.mis.esito = null; RF.mis.trascina = false; rfMisDisegna(); }
window.addEventListener('keydown', function (e) {
  if (!RF.mis.attiva || !RF.mis.bozza || !RF.mis.bozza.punti) return;
  if (e.key === 'Enter') { e.preventDefault(); rfMisChiudi(); }
  if (e.key === 'Escape') { e.preventDefault(); rfMisAnnullaBozza(); }
});
function rfMisPunto(e) {
  const cv = e.currentTarget; const r = cv.getBoundingClientRect();
  const i = rfImgCorrente(); if (!i || !r.width || !r.height) return null;
  const v = rfMprVirtuale();
  const colonne = v ? v.colonne : (i.colonne || 1), righe = v ? v.righe : (i.righe || 1);
  // dallo schermo alla griglia (nativa o virtuale) con una scala per asse: il
  // PNG dell'MPR è ricampionato a pixel isotropi, la griglia no
  const M = RFMSE.geometria.matriceViewer({ scalaX: r.width / colonne, scalaY: r.height / righe });
  const x = Math.max(0, Math.min(r.width, e.clientX - r.left)), y = Math.max(0, Math.min(r.height, e.clientY - r.top));
  const p = RFMSE.geometria.versoImmagine({ x, y }, M);
  if (!p) return null;
  if (v) { p.y = righe - p.y; }           // il PNG dell'MPR è capovolto (prima fetta in basso)
  if (RF.mis.strumento === 'distanza_3d') p.immagine_id = i.id;
  return p;
}
function rfMisGiu(e) {
  if (!RF.mis.attiva) return;
  const i = rfImgCorrente(); const p = rfMisPunto(e); if (!i || !p) return;
  e.preventDefault();
  const alg = rfMisAlg(), g = alg.gesto;
  if (g === 'trascina') {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* niente */ }
    RF.mis.bozza = { immagine_id: i.id, frame: RF.img.frame, p1: p, p2: p }; RF.mis.trascina = true;
    rfMisAggiorna([p, p]); return;
  }
  if (g === 'punto') {
    RF.mis.bozza = { immagine_id: i.id, frame: RF.img.frame, punti: [p], p1: p, p2: p };
    rfMisChiudi(); return;
  }
  if (g === 'punti_3d') {
    if (rfMprVirtuale()) { toast('La distanza 3D si prende sulle immagini native, non sui piani ricostruiti'); return; }
    if (!RF.mis.bozza || !RF.mis.bozza.tridimensionale) RF.mis.bozza = { immagine_id: i.id, frame: RF.img.frame, punti: [], tridimensionale: true };
    RF.mis.bozza.punti.push(p);
    if (RF.mis.bozza.punti.length >= 2) { RF.mis.bozza.p1 = RF.mis.bozza.punti[0]; RF.mis.bozza.p2 = RF.mis.bozza.punti[1]; rfMisChiudi(); return; }
    rfMisAggiorna(RF.mis.bozza.punti); render(); return;
  }
  // un clic per vertice
  if (!RF.mis.bozza || !RF.mis.bozza.punti || RF.mis.bozza.immagine_id !== i.id || RF.mis.bozza.frame !== RF.img.frame) {
    RF.mis.bozza = { immagine_id: i.id, frame: RF.img.frame, punti: [] };
  }
  RF.mis.bozza.punti.push(p); RF.mis.trascina = true; RF.mis.cursore = p;
  if (RF.mis.bozza.punti.length >= alg.punti[1]) { rfMisChiudi(); return; }
  rfMisAggiorna(RF.mis.bozza.punti.length >= alg.punti[0] ? RF.mis.bozza.punti : RF.mis.bozza.punti.concat([p]));
}
function rfMisMuovi(e) {
  if (!RF.mis.trascina || !RF.mis.bozza) return;
  const p = rfMisPunto(e); if (!p) return;
  if (RF.mis.bozza.punti) {
    // il vertice provvisorio segue il puntatore
    RF.mis.cursore = p;
    rfMisAggiorna(RF.mis.bozza.punti.concat([p]));
    return;
  }
  RF.mis.bozza.p2 = p; rfMisAggiorna([RF.mis.bozza.p1, p]);
}
function rfMisSu(e) {
  if (!RF.mis.trascina || !RF.mis.bozza) return;
  if (RF.mis.bozza.punti) return;      // per i vertici il rilascio non chiude: chiude il doppio clic
  RF.mis.trascina = false;
  const b = RF.mis.bozza, es = RF.mis.esito;
  if (!b || !es) return;
  if (es.stato === 'NOT_MEASURABLE' || !es.ok) { toast(es.testi[0] || 'Misura non possibile'); RF.mis.bozza = null; RF.mis.esito = null; rfMisDisegna(); return; }
  rfMisSalvaModal();
}
function rfMisDoppio(e) {
  if (!RF.mis.attiva || !RF.mis.bozza || !RF.mis.bozza.punti) return;
  e.preventDefault();
  // il doppio clic ha aggiunto due volte lo stesso vertice: si toglie l'ultimo
  const pt = RF.mis.bozza.punti;
  if (pt.length >= 2 && pt[pt.length - 1].x === pt[pt.length - 2].x && pt[pt.length - 1].y === pt[pt.length - 2].y) pt.pop();
  rfMisChiudi();
}
// Disegna le misure salvate dell'immagine e del fotogramma correnti, più
// quella in corso. Si richiama a ogni render, al caricamento dell'immagine e
// al ridimensionamento: il canvas segue l'immagine mostrata.
function rfMisDisegna() {
  const img = document.getElementById('rf-img-main'); const cv = document.getElementById('rf-mis-canvas');
  if (!img || !cv) return;
  const w = img.clientWidth, h = img.clientHeight; if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const i = rfImgCorrente(); if (!i) return;
  const vg = rfMprVirtuale();
  const scalaX = (vg ? vg.colonne : (i.colonne || img.naturalWidth || w)) / w, scalaY = (vg ? vg.righe : (i.righe || img.naturalHeight || h)) / h;
  const S = p => ({ x: p.x / scalaX, y: (vg ? (vg.righe - p.y) : p.y) / scalaY });
  const linea = (a, b, testo, colore) => {
    const A = S(a), B = S(b);
    ctx.lineWidth = 2; ctx.strokeStyle = colore; ctx.fillStyle = colore; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    for (const P of [A, B]) { ctx.beginPath(); ctx.arc(P.x, P.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    if (testo) {
      ctx.font = '600 12px -apple-system, "IBM Plex Sans", system-ui, sans-serif';
      const mx = (A.x + B.x) / 2 + 8, my = (A.y + B.y) / 2 - 8;
      const tw = ctx.measureText(testo).width;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(mx - 4, my - 13, tw + 8, 18);
      ctx.fillStyle = colore; ctx.fillText(testo, mx, my);
    }
  };
  const etichetta = (P, testo, colore) => {
    if (!testo) return;
    ctx.font = '600 12px -apple-system, "IBM Plex Sans", system-ui, sans-serif';
    const tw = ctx.measureText(testo).width;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(P.x - 4, P.y - 13, tw + 8, 18);
    ctx.fillStyle = colore; ctx.fillText(testo, P.x, P.y);
  };
  const punto = (P, colore, r) => { ctx.fillStyle = colore; ctx.beginPath(); ctx.arc(P.x, P.y, r || 3.5, 0, Math.PI * 2); ctx.fill(); };
  // una figura qualsiasi: tipo + punti immagine + testo
  const figura = (tipo, pt, testo, colore, aperta) => {
    const P = pt.map(S);
    ctx.lineWidth = 2; ctx.strokeStyle = colore; ctx.fillStyle = colore; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!P.length) return;
    if (tipo === 'punto') {
      ctx.beginPath(); ctx.moveTo(P[0].x - 8, P[0].y); ctx.lineTo(P[0].x + 8, P[0].y); ctx.moveTo(P[0].x, P[0].y - 8); ctx.lineTo(P[0].x, P[0].y + 8); ctx.stroke();
      etichetta({ x: P[0].x + 10, y: P[0].y - 6 }, testo, colore); return;
    }
    if ((tipo === 'rettangolo' || tipo === 'ellisse') && P.length >= 2) {
      const x0 = Math.min(P[0].x, P[1].x), y0 = Math.min(P[0].y, P[1].y), w = Math.abs(P[1].x - P[0].x), h = Math.abs(P[1].y - P[0].y);
      ctx.beginPath();
      if (tipo === 'rettangolo') ctx.rect(x0, y0, w, h); else ctx.ellipse(x0 + w / 2, y0 + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
      ctx.stroke(); for (const Q of [P[0], P[1]]) punto(Q, colore);
      etichetta({ x: x0 + w / 2 + 6, y: y0 - 6 }, testo, colore); return;
    }
    const chiusa = (tipo === 'poligono' || tipo === 'perimetro') && !aperta && P.length > 2;
    ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y);
    for (let k = 1; k < P.length; k++) ctx.lineTo(P[k].x, P[k].y);
    if (chiusa) ctx.closePath();
    ctx.stroke();
    for (const Q of P) punto(Q, colore);
    if (tipo === 'angolo' && P.length === 3) {
      const V = P[1]; const a1 = Math.atan2(P[0].y - V.y, P[0].x - V.x), a2 = Math.atan2(P[2].y - V.y, P[2].x - V.x);
      ctx.beginPath(); ctx.arc(V.x, V.y, 18, a1, a2, ((a2 - a1 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI); ctx.stroke();
      etichetta({ x: V.x + 22, y: V.y - 6 }, testo, colore); return;
    }
    const mid = P.length === 2 ? { x: (P[0].x + P[1].x) / 2 + 8, y: (P[0].y + P[1].y) / 2 - 8 } : { x: P[P.length - 1].x + 8, y: P[P.length - 1].y - 8 };
    etichetta(mid, testo, colore);
  };
  const d = RF.img.dati || {};
  const vmpr = rfMprVirtuale();
  for (const m of (d.misure_manuali || [])) {
    if (m.annullata_at) continue;
    const testo = `${m.etichetta ? m.etichetta + ' ' : ''}${m.valore_mostrato || RFMisura.formattaMm(m.valore)}`;
    if (m.tipo === 'distanza_3d') {
      if (vmpr) continue;
      for (const q of (m.punti || [])) if (q.immagine_id === i.id) { punto(S(q), '#7fd8b6', 5); etichetta({ x: S(q).x + 8, y: S(q).y - 8 }, testo, '#7fd8b6'); }
      continue;
    }
    if (vmpr) {
      if (!m.piano || m.piano.piano !== RF.mpr.piano || m.piano.indice !== RF.mpr.indice) continue;
      const pt = (m.punti || []);
      if (pt.length) figura(m.tipo || 'distanza', pt, testo, '#7fd8b6', false);
      continue;
    }
    if (m.piano || m.immagine_id !== i.id || m.frame !== RF.img.frame) continue;
    const pt = Array.isArray(m.punti) ? m.punti : [];
    if (pt.length) figura(m.tipo || 'distanza', pt, testo, '#7fd8b6', false);
  }
  const b = RF.mis.bozza;
  if (b && b.tridimensionale) {
    for (const q of b.punti) if (q.immagine_id === i.id) punto(S(q), '#ffd166', 5);
  } else if (b && b.immagine_id === i.id && b.frame === RF.img.frame) {
    const es = RF.mis.esito || {};
    const ok = !!es.ok && es.stato !== 'NOT_MEASURABLE';
    const pt = b.punti ? (RF.mis.trascina && RF.mis.cursore && b.punti.length ? b.punti.concat([RF.mis.cursore]) : b.punti) : [b.p1, b.p2];
    const testo = ok ? (es.stato === 'CAUTION' ? '⚠ ' : '') + es.valore_mostrato : (((es.motivi || [])[0] === 'punti_uguali' || (es.motivi || [])[0] === 'punti_non_validi') ? '' : '—');
    figura(RF.mis.strumento, pt, testo, ok ? '#ffd166' : '#ff8a80', !!b.punti && RF.mis.trascina);
  }
}
window.addEventListener('resize', () => { if (RF.img.aperto) rfMisDisegna(); });

function rfMisSalvaModal() {
  const b = RF.mis.bozza, es = RF.mis.esito, d = RF.img.dati || {};
  if (!b || !es || !es.ok || es.stato === 'NOT_MEASURABLE') return;
  const rif = (d.misure || []).map(m => `<option value="${m.id}">${rfEsc(m.gruppo ? m.gruppo + ' · ' : '')}${rfEsc(m.nome)} · ${String(Math.round(Number(m.valore) * 100) / 100).replace('.', ',')}${m.unita ? ' ' + rfEsc(m.unita) : ''}</option>`).join('');
  const V = RFMSE.validazione;
  const extra = es.extra && RF.mis.strumento !== 'punto' ? Object.keys(es.extra).filter(k => /_mm/.test(k) && typeof es.extra[k] === 'number').map(k => `${rfEsc(k.replace(/_mm2?$/, '').replace(/_/g, ' '))} ${rfEsc(/_mm2$/.test(k) ? RFMSE.misure.formattaValore(es.extra[k], 'mm²') : RFMisura.formattaMm(es.extra[k]))}`).join(' · ') : '';
  openModal(`${rfEsc((RF_MIS_STRUMENTI.find(x => x[0] === RF.mis.strumento) || ['', 'Misura'])[1])}: ${rfEsc(es.valore_mostrato)}`, `${extra ? `<p class="caption mb-8">${extra}</p>` : ''}
    <div class="mb-8"><span class="rf-mis-ind st-${es.stato}">${V.SEGNI[es.stato]} ${rfEsc(V.ETICHETTE[es.stato])}</span>${es.avvisi.length ? `<div class="rf-mis-motivo mt-8">${es.avvisi.map(a => rfEsc(V.testo(a))).join('<br>')}</div>` : ''}${RF.mis.sostituisce ? '<div class="caption mt-8">Questa misura sostituisce quella che stai rifacendo: la vecchia viene annullata e legata alla nuova.</div>' : ''}</div>
    <div class="field"><label>Che cosa hai misurato (facoltativo)</label><input class="input" id="rf-mis-et" maxlength="80" placeholder="IVSd, aorta ascendente, diametro VS…"></div>
    ${rif ? `<div class="field mt-8"><label>Confronta con la misura dell'apparecchio (per la validazione)</label><select class="input" id="rf-mis-rif"><option value="">— nessuna —</option>${rif}</select></div>` : ''}
    <p class="caption mt-8">Il numero lo ricalcola il server dagli stessi punti, con la calibrazione scritta nel file dell'apparecchio, e un secondo calcolo indipendente deve coincidere. Resta registrato chi ha misurato e quando; una misura sbagliata si annulla, non si cancella.</p>`,
    `<button class="btn" data-close onclick="rfMisAnnullaBozza()">Scarta</button><button class="btn primary" id="rf-mis-ok">Salva</button>`);
  document.getElementById('rf-mis-ok').onclick = () => { void rfMisSalva(); };
}
async function rfMisSalva() {
  const b = RF.mis.bozza; if (!b) return;
  const et = document.getElementById('rf-mis-et'); const rif = document.getElementById('rf-mis-rif');
  const corpo = { immagine_id: b.immagine_id, frame: b.frame, algoritmo: RF.mis.strumento, punti: b.punti ? b.punti : [b.p1, b.p2], etichetta: et ? et.value : '', riferimento_misura_id: rif && rif.value ? rif.value : null, sostituisce_id: RF.mis.sostituisce || null, piano: RF.mpr.piano ? { tipo: RF.mpr.piano, indice: RF.mpr.indice } : null };
  try {
    const r = await fetch('/api/prototipo/imaging/misure', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.motivo || (j.testi && j.testi[0]) || j.errore || 'Misura non salvata'); return; }
    closeModal(); RF.mis.bozza = null; RF.mis.esito = null; RF.mis.sostituisce = null; RF.mis.trascina = false;
    toast(`Misura salvata: ${j.testo}${j.stato === 'CAUTION' ? ' (con limitazioni)' : ''}`);
    await rfImgRicarica();
  } catch { toast('Piattaforma non raggiungibile'); }
}
async function rfMisAnnulla(id) {
  if (!confirm('Annullare questa misura? Resta nel registro come annullata.')) return;
  try {
    const r = await fetch('/api/prototipo/imaging/misure', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'annulla', id }) });
    if (!r.ok) { toast('Non riuscito'); return; }
    await rfImgRicarica();
  } catch { toast('Piattaforma non raggiungibile'); }
}
async function rfMisRiferimento(id, rifId) {
  try {
    const r = await fetch('/api/prototipo/imaging/misure', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'riferimento', id, riferimento_misura_id: rifId || null }) });
    if (!r.ok) { toast('Non riuscito'); return; }
    await rfImgRicarica();
  } catch { toast('Piattaforma non raggiungibile'); }
}
async function rfMisStoria(id) {
  try {
    const r = await fetch(`/api/prototipo/imaging/misure/${id}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) { toast('Storia non leggibile'); return; }
    const j = await r.json(); const m = j.misura || {}; const V = RFMSE.validazione;
    const n = (x) => (x === null || x === undefined) ? '—' : String(x).replace('.', ',');
    const kv = (k, v) => `<b>${rfEsc(k)}</b><span>${v}</span>`;
    const ver = m.verifica_indipendente || {};
    const righe = [
      kv('Strumento', rfEsc(m.tipo || 'distanza')),
      kv('Valore', `${rfEsc(m.valore_mostrato || '')} <span class="caption">(pieno: ${n(m.valore)} ${rfEsc(m.unita || '')})</span>${m.extra ? ` <span class="caption">· ${rfEsc(Object.entries(m.extra).map(([k, v]) => `${k} ${typeof v === 'number' ? n(Math.round(v * 1000) / 1000) : v}`).join(' · '))}</span>` : ''}`),
      kv('Stato', m.stato_validazione ? `${V.SEGNI[m.stato_validazione]} ${rfEsc(V.ETICHETTE[m.stato_validazione])}` : '—'),
      kv('Punti immagine', (m.punti || []).map(p => `(${n(Math.round(p.x * 100) / 100)}; ${n(Math.round(p.y * 100) / 100)})`).join(' → ')),
      kv('Punti fisici (mm)', (m.punti_fisici || []).map(p => `(${n(Math.round(p.x * 1000) / 1000)}; ${n(Math.round(p.y * 1000) / 1000)})`).join(' → ') || '—'),
      kv('Calibrazione usata', rfEsc(RFMSE.geometria.descriviCalibrazione(m.calibrazione))),
      kv('Doppio controllo', ver.esito ? `${ver.esito === 'ok' ? '✓' : '✕'} B = ${n(ver.valore_b)} · scarto ${ver.scarto === 0 ? '0' : Number(ver.scarto).toExponential(1).replace('.', ',')} ≤ ${Number(ver.tolleranza).toExponential(1).replace('.', ',')} mm` : '—'),
      kv('Algoritmo', `${rfEsc(m.algoritmo || 'distanza')} ${rfEsc(m.versione_algoritmo || '')} · gate ${rfEsc(m.versione_gate || '—')} · software ${rfEsc(m.versione_software || '—')}`),
      kv('Immagine', `SOP ${rfEsc((m.sop_uid || '').slice(-18))} · fotogramma ${(m.frame || 0) + 1}${m.sha256_file ? ` · <code>${rfEsc(m.sha256_file.slice(0, 12))}…</code>` : ''}`),
      kv('Fatta da', `${rfEsc(m.chi || 'qualcuno')} · ${rfEsc(rfModQuando(m.quando))}`),
    ];
    if (m.riferimento_nome) righe.push(kv('Confronto', `${rfEsc(m.riferimento_gruppo ? m.riferimento_gruppo + ' · ' : '')}${rfEsc(m.riferimento_nome)} = ${n(m.riferimento_valore)} ${rfEsc(m.riferimento_unita || '')}`));
    if (m.sostituisce_id) righe.push(kv('Sostituisce', `<code>${rfEsc(m.sostituisce_id.slice(0, 8))}</code>`));
    if (j.sostituita_da && j.sostituita_da.length) righe.push(kv('Sostituita da', j.sostituita_da.map(x => `<code>${rfEsc(x.slice(0, 8))}</code>`).join(', ')));
    if (m.avvisi && m.avvisi.length) righe.push(kv('Avvisi', m.avvisi.map(a => rfEsc(V.testo(a))).join('<br>')));
    const eventi = (j.eventi || []).map(e => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(e.evento)}</div><div class="sub">${rfEsc(e.chi || 'qualcuno')} · ${rfEsc(rfModQuando(e.quando))}${e.prima ? ` · prima: <code>${rfEsc(JSON.stringify(e.prima).slice(0, 80))}</code>` : ''}${e.dopo ? ` · dopo: <code>${rfEsc(JSON.stringify(e.dopo).slice(0, 80))}</code>` : ''}</div></div></div>`).join('');
    openModal('Da dove arriva questo numero', `<div class="kv">${righe.join('')}</div><div class="section-title mt-16">Storia</div><div class="list">${eventi || '<div class="caption">Nessun evento registrato.</div>'}</div>`, `<button class="btn" data-close>Chiudi</button>`);
  } catch { toast('Piattaforma non raggiungibile'); }
}
async function rfMisStatistiche(id) {
  try {
    const r = await fetch('/api/prototipo/imaging/misure', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'statistiche', id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.motivo || j.errore || 'Statistiche non disponibili'); return; }
    await rfImgRicarica();
  } catch { toast('Piattaforma non raggiungibile'); }
}
function rfMisStatTesto(st) {
  if (!st || typeof st.media !== 'number') return '';
  const n = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  return `${n(st.media)} ± ${n(st.deviazione)} ${st.unita} (min ${n(st.min)}, max ${n(st.max)}, n ${st.n})${st.verifica && st.verifica.coincide ? ' ✓' : ''}`;
}
// Volume dai poligoni della serie corrente su fette consecutive (fase 9).
async function rfMisVolume() {
  const d = RF.img.dati || {}; const sr = rfImgSerieCorrente(); if (!sr) return;
  const ids = new Set((sr.immagini || []).map(x => x.id));
  const roi = (d.misure_manuali || []).filter(m => !m.annullata_at && !m.piano && ['poligono', 'ellisse', 'rettangolo'].includes(m.tipo) && ids.has(m.immagine_id));
  if (roi.length < 2) { toast('Servono ROI (poligoni, ellissi o rettangoli) su almeno due fette consecutive di questa serie'); return; }
  const nome = prompt(`Volume da ${roi.length} ROI di questa serie. Nome (facoltativo):`, '');
  if (nome === null) return;
  try {
    const r = await fetch('/api/prototipo/imaging/misure', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'volume', misure: roi.map(m => m.id), etichetta: nome }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.motivo || (j.testi && j.testi[0]) || j.errore || 'Volume non calcolabile'); return; }
    toast(`Volume: ${j.testo}${j.stato === 'CAUTION' ? ' (con limitazioni)' : ''}`);
    await rfImgRicarica();
  } catch { toast('Piattaforma non raggiungibile'); }
}
async function rfMisEtichetta(id, attuale) {
  const nuova = prompt('Che cosa hai misurato?', attuale || '');
  if (nuova === null) return;
  try {
    const r = await fetch('/api/prototipo/imaging/misure', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'etichetta', id, etichetta: nuova }) });
    if (!r.ok) { toast('Non riuscito'); return; }
    await rfImgRicarica();
  } catch { toast('Piattaforma non raggiungibile'); }
}
function rfMisRifai(id) {
  const m = ((RF.img.dati || {}).misure_manuali || []).find(x => x.id === id); if (!m) return;
  // ci si mette sull'immagine e sul fotogramma della misura, poi si misura di nuovo
  const d = RF.img.dati; let trovata = false;
  (d.serie || []).forEach((s, sn) => rfImgVisibili(s).forEach((i, n) => { if (i.id === m.immagine_id) { RF.img.serie = sn; RF.img.idx = n; RF.img.frame = m.frame; trovata = true; } }));
  if (!trovata) { toast('Immagine non trovata'); return; }
  rfMisAttiva(id);
  toast('Traccia la nuova misura: la vecchia sarà annullata e legata alla nuova');
}
// Ricarica l'esame aperto senza perdere serie, immagine e fotogramma.
async function rfImgRicarica() {
  const id = RF.img.aperto; if (!id) return;
  try {
    const r = await fetch(`/api/prototipo/imaging/${id}`, { credentials: 'include', cache: 'no-store' });
    if (r.ok) RF.img.dati = await r.json();
  } catch { /* si resta su quel che c'è */ }
  render();
}
function rfImgMisureManuali(d, i) {
  const tutte = d.misure_manuali || [];
  const puo = rfMisPuo();
  if (!tutte.length && !puo) return '';
  const rif = (d.misure || []);
  const scarto = (m) => {
    if (!m.riferimento_misura_id || m.riferimento_valore === null || m.riferimento_valore === undefined) return '';
    const u = String(m.riferimento_unita || 'mm').toLowerCase();
    const mm = u === 'cm' ? m.riferimento_valore * 10 : u === 'mm' ? m.riferimento_valore : null;
    if (mm === null) return ` · apparecchio ${rfEsc(String(m.riferimento_valore))} ${rfEsc(m.riferimento_unita || '')}`;
    const dlt = m.valore - mm;
    return ` · apparecchio ${RFMisura.formattaMm(mm)} · scarto ${dlt >= 0 ? '+' : '−'}${RFMisura.formattaMm(Math.abs(dlt))}`;
  };
  const confrontate = tutte.filter(m => !m.annullata_at && m.riferimento_misura_id).length;
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Misure col righello</span>
      <span class="caption">${tutte.length} in questo esame${confrontate ? ` · ${confrontate} confrontate con l'apparecchio` : ''} · <a href="/api/prototipo/imaging/misure?formato=csv">validazione (CSV)</a></span></div>
    <div class="list">${tutte.map(m => `<div class="list-item rf-mis-riga ${m.annullata_at ? 'annullata' : ''} ${i && m.immagine_id === i.id && m.frame === RF.img.frame ? 'qui' : ''}">
        <div class="grow"><div class="name">${rfEsc(m.etichetta || (RF_MIS_STRUMENTI.find(x => x[0] === m.tipo) || ['', 'Distanza'])[1])} · ${rfEsc(m.valore_mostrato || RFMisura.formattaMm(m.valore))}${m.tipo && m.tipo !== 'distanza' && m.etichetta ? ` <span class="caption">${rfEsc(m.tipo)}</span>` : ''}${m.stato_validazione ? `<span class="rf-mis-stato st-${m.stato_validazione}" title="${rfEsc(((m.avvisi || []).map(a => RFMSE.validazione.testo(a))).join(' ') || 'Calibrazione verificata')}">${RFMSE.validazione.SEGNI[m.stato_validazione]}</span>` : ''}${m.verifica_ok === false ? ' <span class="rf-mis-stato" style="color:#8a1f1f" title="doppio controllo non riuscito">✕</span>' : ''}${m.sostituisce_id ? ' <span class="caption">(rifatta)</span>' : ''}${m.piano ? ` <span class="caption">${rfEsc(m.piano.piano)} ${m.piano.indice + 1}</span>` : ''}</div>
          <div class="sub">${rfEsc(m.chi || 'qualcuno')} · ${rfEsc(rfModQuando(m.quando))}${m.frame ? ` · fotogramma ${m.frame + 1}` : ''}${m.annullata_at ? ` · <b>annullata</b> da ${rfEsc(m.annullata_da || 'qualcuno')} ${rfEsc(rfModQuando(m.annullata_at))}` : scarto(m)}${m.extra && m.extra.statistiche ? `<br><b>Pixel:</b> ${rfEsc(rfMisStatTesto(m.extra.statistiche))}` : ''}</div></div>
        ${!m.annullata_at && puo ? `<div class="row" style="gap:6px">${rif.length ? `<select class="input sm" onchange="rfMisRiferimento('${m.id}', this.value)" title="Confronta con la misura dell'apparecchio"><option value="">confronta con…</option>${rif.map(r => `<option value="${r.id}" ${m.riferimento_misura_id === r.id ? 'selected' : ''}>${rfEsc(r.gruppo ? r.gruppo + ' · ' : '')}${rfEsc(r.nome)}</option>`).join('')}</select>` : ''}
          ${['rettangolo', 'ellisse', 'poligono'].includes(m.tipo) && ['CT', 'MR'].includes(String((d.esame || {}).modalita || '').toUpperCase()) ? `<button class="btn sm" onclick="rfMisStatistiche('${m.id}')" title="Valori dei pixel dentro la ROI (HU per la TAC)">${String((d.esame || {}).modalita).toUpperCase() === 'CT' ? 'HU' : 'Valori'}</button>` : ''}
          <button class="btn sm" onclick="rfMisEtichetta('${m.id}', ${JSON.stringify(m.etichetta || '')})" title="Cambia il nome">Nome</button>
          <button class="btn sm" onclick="rfMisRifai('${m.id}')" title="Annulla e misura di nuovo">Rifai</button>
          <button class="btn sm" onclick="rfMisAnnulla('${m.id}')">Annulla</button></div>` : ''}
        <button class="btn sm" onclick="rfMisStoria('${m.id}')" title="Da dove arriva questo numero">Storia</button>
      </div>`).join('') || '<div class="caption">Nessuna misura. Premi «Misura» e trascina fra due punti dell’immagine.</div>'}</div>
    <p class="rf-img-limite">Il righello misura <b>distanze</b> con la calibrazione scritta dall'apparecchio nel file DICOM; senza calibrazione non misura. È un dispositivo medico <b>fabbricato e usato dentro lo studio</b> (ODmed art. 9 e 18): il fascicolo, il piano di validazione e la notifica a Swissmedic sono in <code>docs/legale/dispositivo-in-house/</code>. La misura è del medico che la fa; il numero non entra nel referto da solo.</p></div>`;
}

PAGES.imaging = () => {
  if (!RF.live) return '<div class="page"><div class="card"><p class="meta" style="margin:0">Le immagini sono una funzione della piattaforma: qui, fuori, non ci sono dati.</p></div></div>';
  if (RF.img.lista === null && !RF.img.errore) { void rfImgCarica(); return `<div class="page-head"><div><h2 class="page-title">Immagini</h2></div></div><div class="card"><div class="caption">Carico…</div></div>`; }
  if (RF.img.aperto) return rfImgDettaglio();

  const l = RF.img.lista || [];
  const f = RF.img.filtro;
  const mostrati = f === 'verifica' ? l.filter(e => e.stato === 'da_verificare') : f === 'senza' ? l.filter(e => !e.patient_id) : l;
  const riga = (e) => {
    const st = RF_IMG_STATO[e.stato] || ['', e.stato];
    return `<div class="list-item" style="cursor:pointer" onclick="rfImgApri('${e.id}')">
      <div class="grow"><div class="name">${rfEsc(e.descrizione || 'Esame')} <span class="badge">${rfEsc(e.modalita || '—')}</span> ${st[1] ? `<span class="badge ${st[0]}">${st[1]}</span>` : ''}</div>
        <div class="sub">${e.origine === 'rete' ? '<span class="badge">dall’apparecchio</span> ' : ''}${rfEsc(rfImgData(e.data_esame))}${e.ora_esame ? ` ${rfEsc(e.ora_esame.slice(0, 2))}:${rfEsc(e.ora_esame.slice(2, 4))}` : ''} · ${e.n_serie} ${e.n_serie === 1 ? 'serie' : 'serie'} · ${e.n_immagini} immagini · ${rfImgPeso(e.byte)}${e.istituto ? ` · ${rfEsc(e.istituto)}` : ''}</div></div>
      <div style="text-align:right"><div class="name">${e.paziente ? rfEsc(e.paziente) : `<span class="meta">${rfEsc(e.paziente_dicom || 'senza nome')}</span>`}</div>
        <div class="sub">${e.patient_id ? 'in cartella' : 'non abbinato'}</div></div></div>`;
  };
  const c = RF.img.conta || {};
  return `
    <div class="page-head"><div><h2 class="page-title">Immagini</h2><div class="page-sub">${l.length} esami${c.da_verificare ? ` · ${c.da_verificare} da verificare` : ''}${c.senza_paziente ? ` · ${c.senza_paziente} senza paziente` : ''}</div></div>
      <div class="actions"><div class="seg"><button class="${!f ? 'active' : ''}" onclick="RF.img.filtro='';render()">Tutti</button><button class="${f === 'verifica' ? 'active' : ''}" onclick="RF.img.filtro='verifica';render()">Da verificare</button><button class="${f === 'senza' ? 'active' : ''}" onclick="RF.img.filtro='senza';render()">Senza paziente</button></div></div></div>
    ${RF.img.errore ? `<div class="rf-manc mb-16">${rfEsc(RF.img.errore)}</div>` : ''}
    ${RF.img.lettore ? '' : '<div class="rf-manc mb-16">Il lettore DICOM non è installato su questo server: gli esami si vedono, ma non si importano e non si disegnano.</div>'}
    <p class="rf-img-limite">Le immagini si <b>consultano</b> nel contesto della cartella e si <b>misurano</b> (distanze, polilinee, angoli, aree di rettangoli, ellissi e poligoni, perimetri, punti: dalla calibrazione scritta nel file dall'apparecchio). Il righello è un dispositivo medico fabbricato e usato dentro lo studio (ODmed art. 9 e 18): fascicolo, validazione e notifica sono in <code>docs/legale/dispositivo-in-house/</code>. La diagnosi resta del medico, e il referto nasce dal dettato come sempre.</p>
    <div class="card mt-16"><div class="card-head"><span class="section-title">Esami</span><span class="caption">dal più recente</span></div>
      <div class="list">${mostrati.length ? mostrati.map(riga).join('') : '<div class="caption">Nessun esame.</div>'}</div></div>
    ${rfImgRicezione()}
    <div class="card mt-16"><div class="section-title">Portare dentro un esame a mano</div>
      <div id="rf-img-drop" class="rf-img-drop mt-8" ondragover="rfImgDrop(event, true)" ondragleave="rfImgDrop(event, false)" ondrop="rfImgDropFile(event)">
        ${RF.img.carico ? 'Leggo i file…' : 'Trascina qui i file di un CD (anche tutta la cartella), oppure scegli'}<br>
        <div class="row mt-8" style="gap:8px;justify-content:center">
          <label class="btn sm">File… <input type="file" multiple style="display:none" onchange="rfImgImporta(this.files)"></label>
          <label class="btn sm">Cartella… <input type="file" webkitdirectory multiple style="display:none" onchange="rfImgImporta(this.files)"></label>
        </div>
      </div>
      <p class="meta" style="margin:10px 0 0;line-height:1.55">I file restano su questo Mac e non escono mai: il browser riceve un'immagine già pronta, non il DICOM. L'esame si aggancia da solo al paziente quando <b>nome e data di nascita</b> del file combaciano con una persona sola della cartella; se no resta «da verificare», e lo abbina qualcuno.</p></div>`;
};

// «Dagli apparecchi»: quello che serve al tecnico che installa l'ecografo, e
// nient'altro. Il DICOM è uno standard pubblico dal 1993: l'apparecchio manda
// a chi risponde, e da oggi risponde la piattaforma.
function rfImgRicezione() {
  const r = RF.img.ricezione;
  if (!r || !r.attiva) {
    return `<div class="card mt-16"><div class="section-title">Dagli apparecchi (ecografo, RM, TAC)</div>
      <p class="meta" style="margin:8px 0 0;line-height:1.55">La ricezione diretta non è ancora accesa su questo server. Si accende una volta sola, da Terminale:
      <br><code>bash mac/installa-ricezione-dicom.sh</code><br>Da lì in poi gli apparecchi mandano gli esami qui dentro da soli, senza CD e senza chiavette.</p></div>`;
  }
  const dove = (r.indirizzi || []).length ? r.indirizzi.join(' oppure ') : 'l’indirizzo di questo Mac';
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Dagli apparecchi (ecografo, RM, TAC)</span>
      ${r.in_coda ? `<span class="badge warning">${r.in_coda} in arrivo</span>` : '<span class="badge success">in ascolto</span>'}</div>
    <p class="meta" style="margin:8px 0 10px;line-height:1.55">Sull'apparecchio si registra una destinazione DICOM con questi tre dati, e gli esami arrivano in cartella da soli.</p>
    <div class="kv"><b>AE Title di destinazione</b><span class="num">${rfEsc(r.ae_title)}</span><b>Indirizzo</b><span class="num">${rfEsc(dove)}</span><b>Porta</b><span class="num">${r.porta}</span></div>
    <p class="meta" style="margin:10px 0 0;line-height:1.55">${r.apparecchi.length
      ? `Apparecchi ammessi: <b>${r.apparecchi.map(rfEsc).join(', ')}</b>. Chi non è in elenco viene rifiutato e annotato.`
      : '<b>Nessun apparecchio ammesso</b>: finché l’elenco è vuoto non si accetta niente da nessuno. Gli AE Title si aggiungono in <code>~/referti-imaging/ricezione.conf</code>.'}
      Il tasto «prova connessione» dell'apparecchio (C-ECHO) deve dare esito positivo prima di mandare il primo esame.</p></div>`;
}

// Le misure dell'apparecchio. Non le fa la piattaforma e non le può fare: è
// scritto in destinazione-uso-immagini.md, e la riga sotto la tabella lo dice
// anche a chi guarda — perché un numero senza provenienza è un numero di cui
// qualcuno si prenderà la responsabilità per sbaglio.
function rfImgMisure(misure) {
  if (!misure || !misure.length) return '';
  const gruppi = [];
  for (const m of misure) {
    const g = m.gruppo || 'Misure';
    let riga = gruppi.find(x => x.nome === g);
    if (!riga) { riga = { nome: g, voci: [] }; gruppi.push(riga); }
    riga.voci.push(m);
  }
  const numero = (v) => String(Math.round(Number(v) * 100) / 100).replace('.', ',');
  return `<div class="card mt-16"><div class="card-head"><span class="section-title">Misure dell'apparecchio</span><span class="badge">${misure.length}</span></div>
    ${gruppi.map(g => `<div class="mt-8"><div class="caption" style="text-transform:uppercase;letter-spacing:.04em">${rfEsc(g.nome)}</div>
      <div class="kv">${g.voci.map(v => `<b>${rfEsc(v.nome)}</b><span class="num">${numero(v.valore)}${v.unita ? ` ${rfEsc(v.unita)}` : ''}</span>`).join('')}</div></div>`).join('')}
    <p class="rf-img-limite">Misurate <b>dall'apparecchio</b> al momento dell'esame e lette dal suo referto strutturato: la piattaforma le mostra così come sono. Sono anche il riferimento con cui si confronta il righello nella validazione.</p></div>`;
}

function rfImgData(iso) {
  if (!iso) return 'data ignota';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function rfImgPeso(b) {
  const n = Number(b) || 0;
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`;
  if (n > 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} kB`;
}

function rfImgDettaglio() {
  const d = RF.img.dati;
  if (!d) return `<div class="page-head"><div><h2 class="page-title">Immagini</h2></div><div class="actions"><button class="btn" onclick="rfImgChiudi()">Indietro</button></div></div><div class="card"><div class="caption">Apro l'esame…</div></div>`;
  const e = d.esame;
  const s = rfImgSerieCorrente();
  const visibili = rfImgVisibili(s);
  const i = rfImgCorrente();
  const nonImmagini = (s && s.immagini ? s.immagini.length - visibili.length : 0);
  const finestre = d.finestre || [];
  const cal = rfMisCal(i);
  setTimeout(rfMisDisegna, 0);
  const anteprima = (ser) => {
    const prima = (ser.immagini || []).find(x => x.immagine);
    return prima ? `<img src="/api/prototipo/imaging/immagine/${prima.id}?anteprima=1" alt="" loading="lazy">` : `<div style="aspect-ratio:1;border-radius:6px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px">nessuna<br>immagine</div>`;
  };
  return `
    <div class="page-head"><div><h2 class="page-title">${rfEsc(e.descrizione || 'Esame')}</h2>
      <div class="page-sub">${rfEsc(rfImgData(e.data_esame))} · ${rfEsc(e.modalita || '—')} · ${e.n_serie} serie · ${e.n_immagini} immagini${e.istituto ? ` · ${rfEsc(e.istituto)}` : ''}</div></div>
      <div class="actions">
        ${e.patient_id ? `<button class="btn" data-go="#/patients/${e.patient_id}">Cartella di ${rfEsc(e.paziente || '')}</button>` : `<button class="btn primary" onclick="rfImgAbbina('${e.id}')">Abbina a un paziente</button>`}
        <button class="btn" onclick="rfImgChiudi()">Indietro</button></div></div>

    ${e.patient_id ? '' : `<div class="rf-manc mb-16"><b>Non abbinato a nessuno.</b> Nel file c'è scritto «${rfEsc(e.paziente_dicom || 'niente')}»${e.paziente_nascita ? `, nato/a ${rfEsc(rfImgData(e.paziente_nascita))}` : ''}: non basta per riconoscerlo senza indovinare.</div>`}

    <div class="rf-img-corpo">
      <div class="rf-img-serie">
        ${(d.serie || []).map((x, n) => `<button class="rf-img-s ${n === RF.img.serie ? 'active' : ''}" onclick="rfImgVaiSerie(${n})">
          ${anteprima(x)}<div class="n"><b>${x.numero || n + 1}</b> · ${rfEsc(x.modalita || '')}<br>${rfEsc((x.descrizione || '').slice(0, 30) || '—')}<br>${x.n_immagini} img</div></button>`).join('')}
      </div>
      <div>
        <div class="rf-img-vista" onwheel="event.preventDefault(); rfImgScorri(event.deltaY > 0 ? 1 : -1)">
          ${i ? `<div class="rf-mis-tela ${RF.mis.attiva ? 'attiva' : ''}"><img id="rf-img-main" src="${RF.mpr.piano && rfMprVirtuale() ? rfMprUrl(s) : rfImgUrl(i, 1024, RF.img.frame)}" alt="Immagine ${RF.img.idx + 1}" onload="rfMisDisegna()" draggable="false">
              <canvas id="rf-mis-canvas" onpointerdown="rfMisGiu(event)" onpointermove="rfMisMuovi(event)" onpointerup="rfMisSu(event)" onpointercancel="rfMisSu(event)" ondblclick="rfMisDoppio(event)"></canvas></div>
            <div class="rf-img-hud">${rfEsc(s.descrizione || s.modalita || '')}<br>${RF.mpr.piano && rfMprVirtuale() ? `${rfEsc(RF.mpr.piano)} ${RF.mpr.indice + 1} / ${rfMprVirtuale().n_indici} · griglia ${rfMprVirtuale().colonne}×${rfMprVirtuale().righe} · ${String(rfMprVirtuale().sp_x).replace('.', ',')} × ${String(Math.round(rfMprVirtuale().sp_y * 1000) / 1000).replace('.', ',')} mm/px · ricostruita` : `${i.colonne || '?'}×${i.righe || '?'}<br>${rfEsc(cal === null ? 'calibrazione: leggo…' : RFMSE.geometria.descriviCalibrazione(cal))}`}${s.geometria && s.geometria.stato === 'ok' ? `<br>serie ${rfEsc(s.geometria.orientamento || '')} · ${s.geometria.n} fette${s.geometria.distanza_media_mm ? ` · passo ${String(Math.round(s.geometria.distanza_media_mm * 100) / 100).replace('.', ',')} mm${s.geometria.uniforme ? '' : ' (non uniforme)'}` : ''}` : ''}</div>
            <div class="rf-img-hud destra">${RF.img.idx + 1} / ${visibili.length}${i.frame > 1 ? `<br>fotogramma ${RF.img.frame + 1} / ${i.frame}` : ''}${RF.img.ww !== null ? `<br>W ${RF.img.ww} / L ${RF.img.wl}` : ''}</div>
            <div class="limite">${RF.mis.attiva ? `${rfEsc((RF_MIS_STRUMENTI.find(x => x[0] === RF.mis.strumento) || ['', ''])[1])}: ${rfEsc(rfMisIstruzione())}` : 'Consultazione e misure — la diagnosi è del medico'}</div>`
            : `<div class="vuoto">Questa serie non contiene immagini da disegnare${nonImmagini ? ` (${nonImmagini} ${nonImmagini === 1 ? 'oggetto DICOM non grafico' : 'oggetti DICOM non grafici'}: referti strutturati, PDF o modelli)` : ''}.</div>`}
        </div>
        ${i ? `<div class="rf-img-barra">
          ${(() => { const st = rfMisStatoImmagine(i); if (!rfMisPuo() || !st) return ''; if (st.stato === 'NOT_MEASURABLE') return `<span class="rf-mis-motivo"><b>Misurazione non disponibile.</b> ${rfEsc(st.testi[0] || '')}</span>`; if (st.stato === 'ATTESA') return ''; return `<button class="btn sm ${RF.mis.attiva ? 'primary' : ''}" onclick="rfMisAttiva()" title="Misura una distanza fra due punti">Misura</button>`; })()}
          ${rfMisIndicatore(i)}
          ${s && s.mpr ? `<span class="seg"><button class="${!RF.mpr.piano ? 'active' : ''}" onclick="rfMprVai(null)">Nativo</button><button class="${RF.mpr.piano === 'sagittale' ? 'active' : ''}" onclick="rfMprVai('sagittale')">Sagittale</button><button class="${RF.mpr.piano === 'coronale' ? 'active' : ''}" onclick="rfMprVai('coronale')">Coronale</button></span>` : ''}
          ${rfMisPuo() && s && s.geometria && s.geometria.volume_possibile && !RF.mpr.piano ? `<button class="btn sm" onclick="rfMisVolume()" title="Volume dalle ROI su fette consecutive">Volume</button>` : ''}
          ${RF.mis.attiva && rfMisPuo() ? `<span class="rf-mis-str">${RF_MIS_STRUMENTI.map(([k, n]) => `<button class="btn sm ${RF.mis.strumento === k ? 'attivo' : ''}" onclick="rfMisStrumento('${k}')">${n}</button>`).join('')}${rfMisAlg().gesto === 'punti_chiusi' || rfMisAlg().gesto === 'punti' ? `<button class="btn sm" onclick="rfMisChiudi()" title="Termina la figura">Chiudi</button>` : ''}</span>` : ''}
          <button class="btn sm" onclick="rfImgScorri(-1)">‹</button>
          <input type="range" min="0" max="${Math.max(0, visibili.length - 1)}" value="${RF.img.idx}" oninput="rfImgVai(this.value)" aria-label="Immagine della serie">
          <button class="btn sm" onclick="rfImgScorri(1)">›</button>
        </div>
        ${i.frame > 1 ? `<div class="rf-img-barra"><span class="caption">fotogrammi</span><input type="range" min="0" max="${i.frame - 1}" value="${RF.img.frame}" oninput="rfImgFrame(this.value)" aria-label="Fotogramma"></div>` : ''}
        ${RF.mpr.piano && rfMprVirtuale() ? `<div class="rf-img-barra"><span class="caption">${rfEsc(RF.mpr.piano)}</span><input type="range" min="0" max="${rfMprVirtuale().n_indici - 1}" value="${RF.mpr.indice}" oninput="rfMprIndice(this.value)" aria-label="Piano ricostruito"></div>` : ''}
        ${finestre.length ? `<div class="row wrap mt-8" style="gap:6px"><span class="caption" style="align-self:center">finestra</span>
          <button class="btn sm ${RF.img.ww === null ? 'primary' : ''}" onclick="rfImgFinestra(null, null)">Del file</button>
          ${finestre.map(f => `<button class="btn sm ${RF.img.ww === f.ww && RF.img.wl === f.wl ? 'primary' : ''}" onclick="rfImgFinestra(${f.ww}, ${f.wl})">${rfEsc(f.nome)}</button>`).join('')}</div>` : ''}` : ''}
      </div>
    </div>

    ${rfImgMisureManuali(d, i)}
    ${rfImgMisure(d.misure)}

    <div class="card mt-16"><div class="card-head"><span class="section-title">Chi ha aperto questo esame</span><span class="caption">ultimi 20</span></div>
      <div class="list">${(d.accessi || []).map(a => `<div class="list-item"><div class="grow"><div class="name">${rfEsc(a.chi || 'qualcuno')}</div><div class="sub">${rfEsc(a.azione)}</div></div><div class="caption">${rfEsc(rfModQuando(a.quando))}</div></div>`).join('') || '<div class="caption">Nessun accesso registrato.</div>'}</div></div>`;
}

/* Gli esami per immagini nella scheda del paziente: stanno con gli altri
   documenti, perché è lì che chi cura li cerca — non in una pagina a parte. */
RF.imgPaz = {};
async function rfImgDelPaziente(pid) {
  if (RF.imgPaz[pid] !== undefined) return;
  RF.imgPaz[pid] = null;
  try {
    const r = await fetch(`/api/prototipo/imaging?paziente=${encodeURIComponent(pid)}`, { credentials: 'include', cache: 'no-store' });
    RF.imgPaz[pid] = r.ok ? ((await r.json()).esami || []) : [];
  } catch { RF.imgPaz[pid] = []; }
  render();
}
const rfPatientDocsImg = typeof patientDocs === 'function' ? patientDocs : null;
if (rfPatientDocsImg) patientDocs = function (p) {
  const base = rfPatientDocsImg(p);
  if (!RF.live || !rfUuid(p.id)) return base;
  const mie = RF.imgPaz[p.id];
  if (mie === undefined) { void rfImgDelPaziente(p.id); return base; }
  if (mie === null) return base + '<div class="card mt-16"><div class="section-title">Immagini</div><div class="caption mt-8">Carico…</div></div>';
  return base + `<div class="card mt-16"><div class="card-head"><span class="section-title">Immagini</span><span class="badge count">${mie.length}</span></div>
    <div class="list">${mie.length ? mie.map(e => `<div class="list-item" style="cursor:pointer" onclick="go('#/imaging');rfImgApri('${e.id}')">
      <div class="grow"><div class="name">${rfEsc(e.descrizione || 'Esame')} <span class="badge">${rfEsc(e.modalita || '—')}</span></div>
        <div class="sub">${rfEsc(rfImgData(e.data_esame))} · ${e.n_immagini} immagini${e.istituto ? ` · ${rfEsc(e.istituto)}` : ''}</div></div>
      <button class="btn sm ghost">Apri</button></div>`).join('') : '<div class="caption" style="padding:8px 6px">Nessun esame per immagini in cartella.</div>'}</div></div>`;
};


/* =====================================================================
   Converti audio (19.9.2026)
   =====================================================================
   Il dittafono Philips scrive .dss e .ds2, e quelli non li apre niente: né
   un telefono, né un player, né un collega. Qui un file entra e torna un
   MP3, convertito sul Mac dello studio con lo stesso decoder della catena.
   Niente si salva: il file va al server, il risultato torna al browser, i
   file di lavoro spariscono subito. Il download è locale, sul dispositivo
   di chi lo chiede. */
if (typeof NAV_META !== 'undefined') NAV_META.converti = ['Converti audio', 'mic'];
(function () { const st = document.createElement('style'); st.textContent = `
.rf-cv-drop { border:1.5px dashed var(--border); border-radius:12px; padding:26px 18px; text-align:center; color:var(--muted); font-size:13px; }
.rf-cv-drop.sopra { border-color:var(--cta); color:var(--cta); }
.rf-cv-riga { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
.rf-cv-riga:last-child { border-bottom:0; }
.rf-cv-riga .nome { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rf-cv-riga .stato { font-size:12px; color:var(--muted); white-space:nowrap; }
`; document.head.appendChild(st); })();

RF.cv = { file: [] };
const RF_CV_ESTENSIONI = ['.dss', '.ds2', '.wav', '.m4a', '.mp3', '.aac', '.ogg', '.opus', '.flac', '.wma', '.aiff', '.aif', '.amr', '.3gp', '.mp4', '.mov', '.webm'];

function rfCvPeso(b) { return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} kB`; }

async function rfCvConverti(files) {
  for (const f of files || []) {
    const ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const voce = { nome: f.name, byte: f.size, stato: RF_CV_ESTENSIONI.includes(ext) ? 'in coda' : 'formato non riconosciuto', url: null, errore: !RF_CV_ESTENSIONI.includes(ext), file: f };
    RF.cv.file.unshift(voce);
  }
  render();
  // Uno alla volta: il decoder dei .ds2 vuole tempo (4 s per minuto) e
  // due decodifiche insieme si rubano la memoria.
  for (const v of [...RF.cv.file].reverse()) {
    if (v.stato !== 'in coda') continue;
    v.stato = 'converto…'; render();
    try {
      const fd = new FormData(); fd.append('file', v.file);
      const r = await fetch('/api/prototipo/converti-audio', { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) { const j = await r.json().catch(() => ({})); v.stato = j.errore || `non riuscita (${r.status})`; v.errore = true; }
      else {
        const blob = await r.blob();
        v.url = URL.createObjectURL(blob); v.mp3 = blob.size; v.stato = 'pronto';
        v.mp3nome = v.nome.replace(/\.[^.]+$/, '') + '.mp3';
      }
    } catch { v.stato = 'piattaforma non raggiungibile'; v.errore = true; }
    v.file = null; render();
  }
}
function rfCvDrop(e, sopra) { e.preventDefault(); const z = document.getElementById('rf-cv-drop'); if (z) z.classList.toggle('sopra', sopra); }
function rfCvDropFile(e) { e.preventDefault(); rfCvDrop(e, false); if (e.dataTransfer) void rfCvConverti([...e.dataTransfer.files]); }
function rfCvSvuota() { for (const v of RF.cv.file) if (v.url) URL.revokeObjectURL(v.url); RF.cv.file = []; render(); }

PAGES.converti = () => {
  if (!RF.live) return rfPaginaPiattaforma('Converti audio', 'Dal dittafono a un MP3 che si apre ovunque');
  const righe = RF.cv.file.map(v => `<div class="rf-cv-riga">
      <span class="nome" title="${rfEsc(v.nome)}">${rfEsc(v.nome)} <span class="caption">${rfCvPeso(v.byte)}</span></span>
      <span class="stato ${v.errore ? 'danger' : ''}">${rfEsc(v.stato)}${v.mp3 ? ` · ${rfCvPeso(v.mp3)}` : ''}</span>
      ${v.url ? `<a class="btn sm primary" href="${v.url}" download="${rfEsc(v.mp3nome)}">Scarica MP3</a>` : v.stato === 'converto…' ? '<span class="spinner"></span>' : ''}
    </div>`).join('');
  return `
    <div class="page-head"><div><h2 class="page-title">Converti audio</h2><div class="page-sub">Dal dittafono (.dss, .ds2) a un MP3 che si apre ovunque</div></div>
      ${RF.cv.file.length ? `<div class="actions"><button class="btn" onclick="rfCvSvuota()">Svuota l'elenco</button></div>` : ''}</div>
    <div class="card">
      <div id="rf-cv-drop" class="rf-cv-drop" ondragover="rfCvDrop(event, true)" ondragleave="rfCvDrop(event, false)" ondrop="rfCvDropFile(event)">
        Trascina qui i file del dittafono, oppure<br>
        <div class="row mt-8" style="justify-content:center"><label class="btn sm">Scegli i file… <input type="file" multiple accept="${RF_CV_ESTENSIONI.join(',')}" style="display:none" onchange="rfCvConverti(this.files); this.value=''"></label></div>
      </div>
      ${righe ? `<div class="mt-16">${righe}</div>` : ''}
      <p class="meta" style="margin:14px 0 0;line-height:1.55">La conversione avviene <b>sul Mac dello studio</b>, con lo stesso decoder che usa la catena dei referti: il file non esce da qui e non viene conservato — entra, si converte, torna a te come MP3 e i file di lavoro spariscono. Va bene anche per wav, m4a, ogg e gli altri formati comuni. Un .ds2 cifrato con password non si lascia aprire.</p>
      <p class="rf-img-limite">Un dettato è un dato sanitario: l'MP3 che scarichi finisce sul tuo dispositivo, e da lì la responsabilità di dove va è tua — non mandarlo per e-mail o chat.</p>
    </div>`;
};
