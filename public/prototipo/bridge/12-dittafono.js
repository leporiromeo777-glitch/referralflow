/* ---------- Dittafono: una pagina della piattaforma, non un programma a parte (23.9.2026) ---------- */
/* Prima qui c'era una cornice con dentro un'altra applicazione (React, con il
   suo stile, il suo archivio e nessun legame con la coda dei referti). Ora il
   dittafono è una pagina come le altre: stessa grafica, il medico scelto
   dall'elenco dello studio, e «Invia» mette l'audio nella stessa coda in cui
   finiscono i file trascinati nella pagina Referti. Si registra col microfono
   del dispositivo; pausa e ripresa fanno un audio solo; riascoltando si può
   INSERIRE in un punto o SOVRASCRIVERE da lì, come su un dittafono vero.
   Finché non si invia, l'audio resta su questo dispositivo (IndexedDB) e si
   ritrova se la pagina si chiude. La matematica è in dittafono-audio.js. */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.rf-dit { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.rf-dit-campi { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.rf-dit-centro { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 0 6px; }
.rf-dit-tempo { font-size: 44px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1; }
.rf-dit-stato { font-size: 12.5px; color: var(--muted); min-height: 18px; text-align: center; }
.rf-dit-stato.rec { color: #b3261e; font-weight: 600; }
.rf-dit-rec { width: 92px; height: 92px; border-radius: 50%; border: 0; cursor: pointer; background: var(--cta); color: #fff; display: grid; place-items: center; box-shadow: var(--shadow-1); transition: transform .12s; }
.rf-dit-rec:active { transform: scale(.96); }
.rf-dit-rec svg { width: 34px; height: 34px; }
.rf-dit-rec.attivo { background: #b3261e; animation: rf-dit-pulsa 1.6s ease-in-out infinite; }
@keyframes rf-dit-pulsa { 0%,100% { box-shadow: 0 0 0 0 rgba(179,38,30,.35); } 50% { box-shadow: 0 0 0 14px rgba(179,38,30,0); } }
@media (prefers-reduced-motion: reduce) { .rf-dit-rec.attivo { animation: none; } }
.rf-dit-livello { width: min(320px, 80%); height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.rf-dit-livello i { display: block; height: 100%; width: 0; background: var(--cta); transition: width .08s linear; }
.rf-dit-livello i.alto { background: #d65c2a; }
.rf-dit-azioni { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.rf-dit audio { width: 100%; }
.rf-dit-nota { font-size: 12px; line-height: 1.5; color: var(--muted); border-left: 3px solid var(--border); padding: 2px 0 2px 10px; }
`;
  document.head.appendChild(st);
})();

RF.dit = { stato: 'pronto', pcm: new Int16Array(0), nuovi: [], modo: 'aggiungi', punto: 0, livello: 0, medico: '', tipo: 'referto', errore: '', recupero: null, url: null, invio: false, flusso: null, ctx: null, nodo: null, blocco: null, orologio: null, salvataggio: null, rilascio: null, iniziata: 0 };

/* ── su questo dispositivo finché non si invia ── */
function rfDitDb() {
  return new Promise((ok, no) => {
    if (!window.indexedDB) { no(new Error('senza archivio')); return; }
    const r = indexedDB.open('rf-dittafono', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('bozza');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function rfDitSalva() {
  const d = RF.dit; if (!d.pcm.length && !d.nuovi.length) return;
  try {
    const db = await rfDitDb();
    const tutto = d.nuovi.length ? rfDitComponi() : d.pcm;
    db.transaction('bozza', 'readwrite').objectStore('bozza').put({ pcm: tutto.buffer.slice(tutto.byteOffset, tutto.byteOffset + tutto.byteLength), medico: d.medico, tipo: d.tipo, quando: Date.now() }, 'corrente');
  } catch (_) { /* senza archivio si registra lo stesso: si perde solo il recupero */ }
}
async function rfDitSvuota() { try { const db = await rfDitDb(); db.transaction('bozza', 'readwrite').objectStore('bozza').delete('corrente'); } catch (_) { /* niente */ } }
async function rfDitCercaRecupero() {
  if (RF.dit.cercato) return; RF.dit.cercato = true;
  try {
    const db = await rfDitDb();
    const r = db.transaction('bozza').objectStore('bozza').get('corrente');
    r.onsuccess = () => { const v = r.result; if (v && v.pcm && v.pcm.byteLength > 3200 && RF.dit.stato === 'pronto' && !RF.dit.pcm.length) { RF.dit.recupero = v; if (state.route === 'dittafono') render(); } };
  } catch (_) { /* niente */ }
}
function rfDitRiprendiRecupero() {
  const v = RF.dit.recupero; if (!v) return;
  RF.dit.pcm = new Int16Array(v.pcm); RF.dit.medico = v.medico || RF.dit.medico; RF.dit.tipo = v.tipo || 'referto'; RF.dit.recupero = null; RF.dit.stato = 'pausa'; rfDitAudio(); render();
}
function rfDitScartaRecupero() { RF.dit.recupero = null; void rfDitSvuota(); render(); }

/* ── registrare ── */
// L'audio com'è adesso: ciò che c'era più ciò che si sta registrando, secondo il modo.
function rfDitComponi() {
  const d = RF.dit, nuovo = RFDittafono.unisci(d.nuovi);
  if (d.modo === 'inserisci') return RFDittafono.inserisci(d.pcm, d.punto, nuovo);
  if (d.modo === 'sovrascrivi') return RFDittafono.sovrascrivi(d.pcm, d.punto, nuovo);
  return RFDittafono.unisci([d.pcm, nuovo]);
}
function rfDitAudio() {
  const d = RF.dit; if (d.url) { URL.revokeObjectURL(d.url); d.url = null; }
  if (d.pcm.length) d.url = URL.createObjectURL(new Blob([RFDittafono.wav(d.pcm, RFDittafono.FREQUENZA)], { type: 'audio/wav' }));
}
async function rfDitMicrofono() {
  const d = RF.dit;
  if (d.rilascio) { clearTimeout(d.rilascio); d.rilascio = null; }
  if (d.flusso && d.ctx && d.ctx.state !== 'closed') { if (d.ctx.state === 'suspended') await d.ctx.resume(); return true; }
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    d.errore = 'Il microfono funziona solo sull’indirizzo sicuro dello studio (https). Da questo indirizzo il browser non lo concede.'; return false;
  }
  try {
    d.flusso = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    d.errore = e && e.name === 'NotAllowedError' ? 'Il browser non ha il permesso di usare il microfono: concedilo dalle impostazioni del sito e riprova.' : e && e.name === 'NotFoundError' ? 'Nessun microfono trovato su questo dispositivo.' : 'Non riesco ad aprire il microfono.';
    return false;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  try { d.ctx = new Ctx({ sampleRate: RFDittafono.FREQUENZA }); } catch (_) { d.ctx = new Ctx(); }
  const sorgente = d.ctx.createMediaStreamSource(d.flusso);
  d.nodo = d.ctx.createScriptProcessor(4096, 1, 1);
  d.nodo.onaudioprocess = (ev) => {
    if (RF.dit.stato !== 'registra') return;
    const f = ev.inputBuffer.getChannelData(0);
    RF.dit.livello = RFDittafono.picco(f);
    RF.dit.nuovi.push(RFDittafono.aInt16(RFDittafono.riduci(f, RF.dit.ctx.sampleRate, RFDittafono.FREQUENZA)));
  };
  sorgente.connect(d.nodo); d.nodo.connect(d.ctx.destination);   // l'uscita resta muta: non si copia l'ingresso
  return true;
}
function rfDitRilasciaMicrofono() {
  const d = RF.dit;
  try { if (d.nodo) { d.nodo.disconnect(); d.nodo.onaudioprocess = null; } } catch (_) { /* niente */ }
  try { if (d.flusso) d.flusso.getTracks().forEach(t => t.stop()); } catch (_) { /* niente */ }
  try { if (d.ctx && d.ctx.state !== 'closed') void d.ctx.close(); } catch (_) { /* niente */ }
  d.nodo = null; d.flusso = null; d.ctx = null;
}
async function rfDitRegistra(modo) {
  const d = RF.dit; if (d.stato === 'registra' || d.invio) return;
  d.errore = '';
  const lettore = document.getElementById('rf-dit-audio');
  const pos = lettore && isFinite(lettore.currentTime) ? lettore.currentTime : 0;
  if (lettore) lettore.pause();
  if (!(await rfDitMicrofono())) { render(); return; }
  d.modo = modo || 'aggiungi';
  d.punto = d.modo === 'aggiungi' ? d.pcm.length : Math.round(pos * RFDittafono.FREQUENZA);
  d.nuovi = []; d.stato = 'registra'; d.iniziata = Date.now();
  try { if (navigator.wakeLock) d.blocco = await navigator.wakeLock.request('screen'); } catch (_) { /* lo schermo può spegnersi: si registra lo stesso */ }
  render();
  d.orologio = setInterval(rfDitAggiorna, 100);
  d.salvataggio = setInterval(() => void rfDitSalva(), 15000);
}
function rfDitPausa() {
  const d = RF.dit; if (d.stato !== 'registra') return;
  d.pcm = rfDitComponi(); d.nuovi = []; d.modo = 'aggiungi'; d.stato = 'pausa'; d.livello = 0;
  clearInterval(d.orologio); clearInterval(d.salvataggio);
  try { if (d.blocco) void d.blocco.release(); } catch (_) { /* niente */ } d.blocco = null;
  // il microfono resta pronto due minuti per riprendere subito, poi si rilascia da solo
  d.rilascio = setTimeout(rfDitRilasciaMicrofono, 120000);
  rfDitAudio(); void rfDitSalva(); render();
}
function rfDitAggiorna() {
  const d = RF.dit; if (d.stato !== 'registra') return;
  const t = document.getElementById('rf-dit-tempo'), l = document.getElementById('rf-dit-liv');
  const campioni = d.nuovi.reduce((n, p) => n + p.length, 0);
  const totale = d.modo === 'sovrascrivi' ? d.punto + campioni : d.pcm.length + campioni;
  if (t) t.textContent = RFDittafono.formatta(totale / RFDittafono.FREQUENZA);
  if (l) { l.style.width = `${Math.min(100, Math.round(Math.sqrt(d.livello) * 100))}%`; l.classList.toggle('alto', d.livello > 0.95); }
}
function rfDitScarta() {
  if (!confirm('Scartare questa registrazione? Non si può recuperare.')) return;
  const d = RF.dit; d.pcm = new Int16Array(0); d.nuovi = []; d.stato = 'pronto'; d.errore = '';
  rfDitAudio(); rfDitRilasciaMicrofono(); void rfDitSvuota(); render();
}
async function rfDitInvia() {
  const d = RF.dit; if (d.invio || !d.pcm.length) return;
  const medico = (document.getElementById('rf-dit-medico') || {}).value || d.medico;
  const tipo = (document.getElementById('rf-dit-tipo') || {}).value || d.tipo;
  // il medico è obbligatorio solo se lo studio ha un elenco di medici per la dettatura (la stessa regola del server)
  if (!medico && (RF.medici || []).length) { d.errore = 'Scegli il medico che ha dettato.'; render(); return; }
  d.medico = medico; d.tipo = tipo; d.invio = true; d.errore = ''; render();
  try {
    const fd = new FormData();
    fd.append('audio', new File([RFDittafono.wav(d.pcm, RFDittafono.FREQUENZA)], RFDittafono.nomeFile(new Date()), { type: 'audio/wav' }));
    fd.append('medico', medico); fd.append('tipo', tipo);
    const r = await fetch('/api/referti/upload', { method: 'POST', body: fd, credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { d.errore = j.errore === 'medico_mancante' ? 'Scegli il medico che ha dettato.' : j.errore === 'troppo_grande' ? 'Registrazione troppo lunga per un invio solo.' : 'Invio non riuscito: la registrazione resta qui, riprova.'; d.invio = false; render(); return; }
    d.pcm = new Int16Array(0); d.stato = 'pronto'; d.invio = false; rfDitAudio(); rfDitRilasciaMicrofono(); void rfDitSvuota();
    toast('Dettato in coda: la bozza arriva tra i referti in pochi minuti');
    render(); setTimeout(rfCaricaDati, 3000);
  } catch (_) { d.errore = 'Piattaforma non raggiungibile: la registrazione resta su questo dispositivo, riprova.'; d.invio = false; render(); }
}
// Cambiare pagina mentre si registra non perde niente: si mette in pausa e si salva.
window.addEventListener('hashchange', () => { if (RF.dit.stato === 'registra' && !/^#\/dittafono/.test(location.hash)) rfDitPausa(); });
window.addEventListener('beforeunload', (e) => { if (RF.dit.stato === 'registra') rfDitPausa(); if (RF.dit.pcm.length) { void rfDitSalva(); e.preventDefault(); e.returnValue = ''; } });

/* ── la pagina ── */
function rfDitRecenti() {
  const lista = (typeof AUDIO_INBOX !== 'undefined' ? AUDIO_INBOX : []).slice(0, 6);
  if (!lista.length) return '';
  const stato = (a) => a.state === 'ready' ? ['success', 'bozza pronta'] : a.state === 'failed' ? ['danger', 'da guardare'] : a.state === 'duplicate' ? ['warning', 'già dettato'] : ['', 'in lavorazione'];
  return `<div class="card"><div class="card-head"><span class="section-title">Dettati recenti</span><span class="caption">la bozza si apre dai Referti</span></div>
    <div class="list">${lista.map(a => { const s = stato(a); return `<div class="list-item" ${a.bozza ? `style="cursor:pointer" data-go="#/review/${rfEsc(a.bozza)}"` : ''}>
      <div class="grow"><div class="name">${rfEsc(a.paziente || 'Dettato')}${a.at ? ` <span class="caption">· ${rfEsc(a.at)}</span>` : ''}</div>
        <div class="sub">${rfEsc(a.medico ? (DOCTORS[a.medico] || ((RF.medici || []).find(m => m.id === a.medico) || {}).nome || a.medico) : '')}${a.state === 'processing' && a.fase ? ` · ${rfEsc(String(a.fase).replace(/_/g, ' '))}` : ''}</div></div>
      <span class="badge ${s[0]}">${s[1]}</span></div>`; }).join('')}</div></div>`;
}
PAGES.dittafono = () => {
  const d = RF.dit;
  if (!RF.live) return '<div class="page"><div class="card"><p class="meta" style="margin:0">Il dittafono è una funzione della piattaforma: qui, fuori, non registra.</p></div></div>';
  if (!(RF.medici || []).length && typeof rfCaricaMedici === 'function' && !d.mediciChiesti) { d.mediciChiesti = true; void rfCaricaMedici().then(() => { if (state.route === 'dittafono') render(); }); }
  void rfDitCercaRecupero();
  const durata = RFDittafono.formatta(RFDittafono.durata(d.pcm));
  const rec = d.stato === 'registra';
  const medici = (RF.medici || []).map(m => `<option value="${rfEsc(m.id)}" ${m.id === d.medico ? 'selected' : ''}>${rfEsc(m.nome)}</option>`).join('');
  const mic = ICONS.mic || '', pausa = ICONS.pause || '';
  return `<div class="rf-dit">
    <div class="page-head"><div><h2 class="page-title">Dittafono</h2><div class="page-sub">Detta qui: l'audio va nella coda dei referti, come un file trascinato nella pagina Referti</div></div>
      <div class="actions"><button class="btn" data-go="#/reports">Referti</button></div></div>
    ${d.recupero ? `<div class="rf-manc"><b>C'è una registrazione non inviata</b> di ${RFDittafono.formatta(d.recupero.pcm.byteLength / 2 / RFDittafono.FREQUENZA)}, rimasta su questo dispositivo.
      <div class="row mt-8" style="gap:8px"><button class="btn primary sm" onclick="rfDitRiprendiRecupero()">Riprendila</button><button class="btn sm" onclick="rfDitScartaRecupero()">Scartala</button></div></div>` : ''}
    <div class="card">
      <div class="rf-dit-campi">
        <div class="field"><label for="rf-dit-medico">Chi detta</label><select class="input" id="rf-dit-medico" ${rec ? 'disabled' : ''} onchange="RF.dit.medico=this.value"><option value="">${(RF.medici || []).length ? '— scegli il medico —' : 'nessun medico configurato'}</option>${medici}</select></div>
        <div class="field"><label for="rf-dit-tipo">Che cosa</label><select class="input" id="rf-dit-tipo" ${rec ? 'disabled' : ''} onchange="RF.dit.tipo=this.value"><option value="referto" ${d.tipo === 'referto' ? 'selected' : ''}>Referto</option><option value="visita" ${d.tipo === 'visita' ? 'selected' : ''}>Visita registrata</option></select></div>
      </div>
      <div class="rf-dit-centro">
        <div class="rf-dit-tempo" id="rf-dit-tempo">${durata}</div>
        <div class="rf-dit-stato ${rec ? 'rec' : ''}">${rec ? (d.modo === 'inserisci' ? 'Registro: inserisco nel punto scelto' : d.modo === 'sovrascrivi' ? 'Registro: sovrascrivo da lì in poi' : 'Registro') : d.stato === 'pausa' ? 'In pausa' : 'Pronto'}</div>
        <div class="rf-dit-livello" aria-hidden="true"><i id="rf-dit-liv"></i></div>
        <button class="rf-dit-rec ${rec ? 'attivo' : ''}" onclick="${rec ? 'rfDitPausa()' : "rfDitRegistra('aggiungi')"}" aria-label="${rec ? 'Metti in pausa' : d.pcm.length ? 'Riprendi in coda' : 'Registra'}" title="${rec ? 'Pausa' : d.pcm.length ? 'Riprendi in coda' : 'Registra'}">${rec ? pausa : mic}</button>
        <div class="caption">${rec ? 'tocca per la pausa' : d.pcm.length ? 'tocca per riprendere in coda' : 'tocca per registrare'}</div>
      </div>
      ${d.errore ? `<div class="rf-manc mt-8">${rfEsc(d.errore)}</div>` : ''}
      ${!rec && d.pcm.length ? `<div class="mt-16">
        <audio id="rf-dit-audio" controls preload="metadata" src="${d.url || ''}"></audio>
        <div class="rf-dit-azioni mt-8">
          <button class="btn sm" onclick="rfDitRegistra('inserisci')" title="Registra un pezzo nuovo nel punto in cui è il cursore; il resto scivola avanti">Inserisci qui</button>
          <button class="btn sm" onclick="rfDitRegistra('sovrascrivi')" title="Dal punto in cui è il cursore, butta ciò che c'era e registra di nuovo">Sovrascrivi da qui</button>
          <button class="btn sm" onclick="rfDitScarta()">Scarta</button>
          <button class="btn primary" onclick="rfDitInvia()" ${d.invio ? 'disabled' : ''}>${d.invio ? 'Invio…' : 'Invia alla trascrizione'}</button>
        </div>
        <p class="rf-dit-nota mt-8">Riascolta e ferma il cursore dove vuoi: <b>Inserisci qui</b> aggiunge un pezzo in quel punto, <b>Sovrascrivi da qui</b> rifà la dettatura da lì in avanti.</p></div>` : ''}
    </div>
    ${rfDitRecenti()}
    <p class="rf-dit-nota">L'audio resta su questo dispositivo finché non premi «Invia»; se la pagina si chiude lo ritrovi qui. Una volta inviato segue la stessa strada di ogni dettato: trascrizione sul Mac dello studio, bozza nella pagina Referti.</p>
  </div>`;
};
// La vecchia applicazione incorporata aveva registrato un suo service worker: si toglie.
if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
  navigator.serviceWorker.getRegistrations().then(rr => rr.forEach(r => { if (/\/prototipo\/dittafono\//.test(r.scope)) void r.unregister(); })).catch(() => {});
}
