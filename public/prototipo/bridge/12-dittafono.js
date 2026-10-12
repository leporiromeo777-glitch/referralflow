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
.rf-dit-testo { width: 100%; min-height: 240px; height: auto; padding: 12px 14px; line-height: 1.55; font-size: 15px; resize: vertical; }
.rf-foglio { background: #fff; color: #1b1b1f; border: 1px solid var(--border); border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06); padding: 26px clamp(18px, 6vw, 56px) 40px; font: 14.5px/1.55 Calibri, "Helvetica Neue", Arial, sans-serif; }
.rf-foglio-logo { display: block; width: 100%; height: auto; margin-bottom: 4px; }
.rf-foglio-int { font-size: 11.5px; line-height: 1.45; color: #4a4a55; margin-bottom: 26px; }
.rf-foglio-int b { color: #1b1b1f; font-size: 12.5px; }
.rf-fg { display: block; width: 100%; box-sizing: border-box; border: 0; outline: 1px dashed transparent; outline-offset: 3px; border-radius: 3px; background: transparent; color: inherit; font: inherit; padding: 0; margin: 0; resize: none; overflow: hidden; }
.rf-fg:hover { outline-color: rgba(90,90,200,.35); }
.rf-fg:focus { outline: 1px dashed rgba(90,90,200,.7); background: rgba(90,90,200,.04); }
.rf-fg::placeholder { color: #9a9aa6; }
.rf-fg-data { display: flex; align-items: baseline; gap: 5px; margin: 26px 0 18px; }
.rf-fg-data .rf-fg { width: 12ch; }
.rf-fg-titolo { font-weight: 700; margin-bottom: 10px; }
.rf-fg-paziente { font-weight: 700; margin-bottom: 18px; }
.rf-fg-corpo { min-height: 300px; margin: 12px 0; }
.rf-fg-copia { margin-top: 22px; font-size: 12.5px; color: #4a4a55; }
.rf-dit.con-foglio { max-width: none; }
.rf-dit-due { display: grid; grid-template-columns: minmax(270px, 330px) minmax(0, 1fr); gap: 18px; align-items: start; }
.rf-dit-lato { position: sticky; top: 4px; }
.rf-dit-lato .rf-dit-campi { grid-template-columns: 1fr; }
.rf-dit-lato .rf-dit-centro { padding-top: 12px; }
.rf-dit-carta .rf-foglio { margin-top: 0; min-height: 78vh; }
.rf-dit-due.con-fonte { grid-template-columns: minmax(230px, 280px) minmax(0, 1fr) minmax(0, 1fr); }
.rf-dit-fonte { display: none; position: sticky; top: 4px; max-height: calc(100vh - 20px); flex-direction: column; background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.rf-dit-due.con-fonte .rf-dit-fonte { display: flex; }
.rf-dit-fonte-bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.rf-dit-fonte-bar .rf-dit-fonte-nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.rf-dit-fonte-corpo { flex: 1; min-height: 60vh; overflow: auto; padding: 8px; background: var(--surface-2, #eef0ec); }
.rf-dit-fonte-corpo canvas { display: block; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12); margin: 0 auto 8px; }
.rf-dit-fonte-testo { background: #fff; color: #1b1b1f; padding: 22px 26px; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.55 Arial, Helvetica, sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.rf-zoom { display: inline-flex; gap: 4px; align-items: center; flex: 0 0 auto; }
.rf-zoom .btn { min-width: 30px; padding-left: 8px; padding-right: 8px; }
.rf-dit-carta-bar { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-bottom: 6px; }
.rf-dit-carta { min-width: 0; }
@media (max-width: 1150px) { .rf-dit-due.con-fonte { grid-template-columns: minmax(230px, 280px) minmax(0, 1fr); } .rf-dit-fonte { grid-column: 1 / -1; position: static; max-height: none; } }
@media (max-width: 900px) { .rf-dit-due, .rf-dit-due.con-fonte { grid-template-columns: 1fr; } .rf-dit-lato { position: static; } }
.rf-dit-nota { font-size: 12px; line-height: 1.5; color: var(--muted); border-left: 3px solid var(--border); padding: 2px 0 2px 10px; }
`;
  document.head.appendChild(st);
})();

RF.dit = { stato: 'pronto', pcm: new Int16Array(0), nuovi: [], modo: 'aggiungi', punto: 0, livello: 0, medico: '', tipo: 'referto', errore: '', recupero: null, url: null, invio: false, flusso: null, ctx: null, nodo: null, blocco: null, orologio: null, salvataggio: null, rilascio: null, iniziata: 0, testo: '', tempi: [], picco: 0, testoInizio: 0, microfoni: null, foglio: null, foglioToccato: {}, foglioPer: null, impara: null, tastoGiu: false, daTasto: false, tastoPronto: false, hid: [], prima: null, primaIl: 0, fermataIl: 0, tastoErrore: '' };

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
    db.transaction('bozza', 'readwrite').objectStore('bozza').put({ pcm: tutto.buffer.slice(tutto.byteOffset, tutto.byteOffset + tutto.byteLength), medico: d.medico, tipo: d.tipo, quando: Date.now(), testo: d.testo || '', tempi: d.tempi || [], foglio: d.foglio || null, foglioToccato: d.foglioToccato || {}, paziente: d.paziente || '' }, 'corrente');
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
  RF.dit.pcm = new Int16Array(v.pcm); RF.dit.medico = v.medico || RF.dit.medico; RF.dit.tipo = v.tipo || 'referto'; RF.dit.testo = v.testo || ''; RF.dit.tempi = Array.isArray(v.tempi) ? v.tempi : []; if (v.foglio) { RF.dit.foglio = v.foglio; RF.dit.foglioToccato = v.foglioToccato || {}; RF.dit.paziente = v.paziente || RF.dit.paziente; RF.dit.foglioPer = rfFoglioChiave(); } RF.dit.recupero = null; RF.dit.stato = 'pausa'; rfDitAudio(); render();
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
/* Il tasto delle cuffie (8.10.2026): con le cuffie col filo, il tasto al centro
   del telecomando mette in pausa e riprende la dettatura. Quel tasto, per il
   sistema, è «play/pausa» di chi sta suonando: perché arrivi a questa pagina
   mentre si registra, si tiene in ciclo un secondo di SILENZIO e ci si
   dichiara al sistema come lettore (Media Session). È un'opzione da accendere,
   per dispositivo, e spenta di serie: far suonare qualcosa — anche il silenzio —
   mentre si registra è una cosa che ogni telefono tratta a modo suo. */
const RF_DIT_CUFFIE = 'rf-dit-cuffie';
function rfDitCuffiePossibile() { return 'mediaSession' in navigator && typeof Audio === 'function'; }
function rfDitCuffieAcceso() { try { return rfDitCuffiePossibile() && localStorage.getItem(RF_DIT_CUFFIE) === '1'; } catch (_) { return false; } }
function rfDitCuffieImposta(si) { try { localStorage.setItem(RF_DIT_CUFFIE, si ? '1' : '0'); } catch (_) { /* resta per questa pagina */ } if (!si) rfDitCuffieFerma(); render(); }
function rfDitSilenzio() {
  if (RF.dit.silenzio) return RF.dit.silenzio;
  const n = 8000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const scrivi = (o, testo) => { for (let i = 0; i < testo.length; i++) b[o + i] = testo.charCodeAt(i); };
  scrivi(0, 'RIFF'); v.setUint32(4, 36 + n, true); scrivi(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); scrivi(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  const a = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' }))); a.loop = true; a.preload = 'auto';
  RF.dit.silenzio = a; return a;
}
// Va chiamata DENTRO il gesto di chi tocca «Registra»: fuori da un gesto il browser non fa partire niente.
function rfDitCuffieAvvia() {
  if (!rfDitCuffieAcceso()) return;
  try {
    const p = rfDitSilenzio().play(); if (p && p.catch) p.catch(() => {});
    if (typeof MediaMetadata === 'function') navigator.mediaSession.metadata = new MediaMetadata({ title: 'Dittafono', artist: 'ReferralFlow' });
    navigator.mediaSession.setActionHandler('pause', rfDitCuffieTasto);
    navigator.mediaSession.setActionHandler('play', rfDitCuffieTasto);
    // Doppio e triplo clic (brano dopo, brano prima) non devono fare niente.
    for (const x of ['nexttrack', 'previoustrack', 'seekbackward', 'seekforward', 'stop']) { try { navigator.mediaSession.setActionHandler(x, () => {}); } catch (_) { /* azione non prevista da questo browser */ } }
  } catch (_) { /* senza Media Session il dittafono funziona come sempre */ }
}
function rfDitCuffieTasto() {
  const d = RF.dit, lettore = document.getElementById('rf-dit-audio');
  // Se si sta riascoltando, il tasto ferma l'ascolto e basta: non fa partire una registrazione per sbaglio.
  if (lettore && !lettore.paused) { lettore.pause(); return; }
  if (d.invio) return;
  if (d.stato === 'registra') rfDitPausa(); else void rfDitRegistra('aggiungi');
}
// Il silenzio suona solo mentre si registra, e il sistema lo sa: così il tasto dopo vuol dire «riprendi».
function rfDitCuffieStato() {
  const a = RF.dit.silenzio; if (!a || !rfDitCuffieAcceso()) return;
  const rec = RF.dit.stato === 'registra';
  try { if (rec) { const p = a.play(); if (p && p.catch) p.catch(() => {}); } else a.pause(); navigator.mediaSession.playbackState = rec ? 'playing' : 'paused'; } catch (_) { /* niente */ }
}
function rfDitCuffieFerma() {
  try {
    if (RF.dit.silenzio) RF.dit.silenzio.pause();
    if ('mediaSession' in navigator) { for (const x of ['play', 'pause']) navigator.mediaSession.setActionHandler(x, null); navigator.mediaSession.playbackState = 'none'; }
  } catch (_) { /* niente */ }
}
/* Dettare con un programma di dettatura (Dragon) MENTRE la pagina registra (11.10.2026). Il programma scrive nella
   casella come in qualunque campo di testo: qui non c'è nessun collegamento con lui. La pagina fa tre cose: registra
   la voce dallo stesso microfono, segna a che secondo dell'audio il testo è arrivato a quale lunghezza, e manda testo
   e audio insieme. Poi la catena del Mac trascrive l'audio per conto suo e in revisione i due testi si confrontano.
   È un'opzione da accendere, per dispositivo. */
const RF_DIT_DETT = 'rf-dit-dettatura', RF_DIT_MIC = 'rf-dit-mic';
function rfDitDettatura() { try { return localStorage.getItem(RF_DIT_DETT) === '1'; } catch (_) { return false; } }
function rfDitDettaturaImposta(si) { try { localStorage.setItem(RF_DIT_DETT, si ? '1' : '0'); } catch (_) { /* resta per questa pagina */ } render(); }
function rfDitMicScelto() { try { return localStorage.getItem(RF_DIT_MIC) || ''; } catch (_) { return ''; } }
function rfDitMicImposta(id) { try { localStorage.setItem(RF_DIT_MIC, id || ''); } catch (_) { /* niente */ } if (RF.dit.stato !== 'registra') rfDitRilasciaMicrofono(); }
// A che secondo dell'audio si è adesso (per segnare quando è arrivato il testo).
function rfDitSecondi() {
  const d = RF.dit, campioni = d.nuovi.reduce((n, p) => n + p.length, 0);
  return (d.stato === 'registra' ? (d.modo === 'aggiungi' ? d.pcm.length : d.punto) + campioni : d.pcm.length) / RFDittafono.FREQUENZA;
}
function rfDitTesto(el) {
  const d = RF.dit; d.testo = el.value; d.cursore = el.selectionStart;
  const s = Math.round(rfDitSecondi() * 10) / 10, u = d.tempi[d.tempi.length - 1];
  if (u && u[0] === s) u[1] = d.testo.length; else if (d.tempi.length < 5000) d.tempi.push([s, d.testo.length]);
  // Il testo arriva ma il microfono non sente niente: di solito è il programma di dettatura che lo tiene tutto per sé.
  const sordo = document.getElementById('rf-dit-sordo');
  if (sordo) sordo.style.display = d.stato === 'registra' && Date.now() - d.iniziata > 6000 && d.testo.length - d.testoInizio >= 15 && d.picco < 0.01 ? '' : 'none';
  const fermo = document.getElementById('rf-dit-fermo');
  if (d.stato !== 'registra' && Date.now() - (d.fermataIl || 0) < 8000) d.testoInizio = d.testo.length;      // l'ultima frase arriva un attimo dopo aver lasciato il tasto: non è «dettare a registrazione ferma»
  if (fermo) fermo.style.display = d.stato !== 'registra' && d.testo.length - d.testoInizio >= 15 ? '' : 'none';
  d.testoIl = Date.now(); rfDitComandoProgramma();
}
/* I COMANDI A VOCE (12.10.2026, richiesta dello studio): chi detta può dare un'istruzione alla piattaforma. La parola
   d'ordine è «per favore» (scelta dello studio): «per favore, inserisci la lettera più recente», «per favore, inserisci
   la terapia dell'ultima lettera», «per favore annulla». Il programma di dettatura scrive la frase nel foglio; la pagina
   la riconosce (dittafono-comandi.js), la toglie e mette al suo posto ciò che è stato chiesto, preso dalla cartella del
   paziente. Si aspetta che il tasto sia lasciato e che il testo sia fermo da un attimo: mentre il programma di
   dettatura scrive, il foglio non si tocca. Ciò che entra è detto in una riga, con «Annulla». */
function rfDitComandoStato(html) { RF.dit.cmdStato = html || ''; const el = document.getElementById('rf-dit-cmd-stato'); if (el) el.innerHTML = RF.dit.cmdStato; }
function rfDitComandoProgramma() {
  const d = RF.dit; clearTimeout(d.cmdAttesa);
  if (!rfDitDettatura() || typeof RFComandi === 'undefined' || !/per\s*favore/i.test(d.testo || '')) return;
  d.cmdAttesa = setTimeout(rfDitComandoCerca, 1500);
}
// Un programma di dettatura non sempre avvisa la pagina quando scrive (a volte cambia il testo senza l'evento che la
// pagina ascolta): ogni secondo si guarda se il foglio è cambiato, così né il testo né un comando vanno persi.
setInterval(() => {
  if (typeof state === 'undefined' || state.route !== 'dittafono' || !rfDitDettatura()) return;
  const el = document.getElementById('rf-dit-testo'); if (el && el.value !== (RF.dit.testo || '')) { rfDitTesto(el); rfFoglioAlto(el); }
}, 1000);
// Mette nel foglio il testo nuovo senza ricreare la casella, col cursore dove serve.
function rfDitTestoMetti(testo, cursore) {
  const d = RF.dit, el = document.getElementById('rf-dit-testo'); if (!el) return;
  el.value = testo; d.testo = testo; d.cursore = cursore; d.testoInizio = testo.length;
  try { el.setSelectionRange(cursore, cursore); } catch (_) { /* niente */ }
  const s = Math.round(rfDitSecondi() * 10) / 10; if (d.tempi.length < 5000) d.tempi.push([s, testo.length]);
  rfFoglioAlto(el); void rfDitSalva();
}
async function rfDitComandoCerca() {
  const d = RF.dit, el = document.getElementById('rf-dit-testo');
  if (!el || state.route !== 'dittafono' || !rfDitDettatura() || d.cmdInCorso || d.invio) return;
  // il tasto è giù, o l'ultima frase sta ancora arrivando: si riprova fra poco
  // …ma se il testo è fermo da quattro secondi nessuno sta più scrivendo, anche se il rilascio del tasto non è arrivato
  const fermoDa = Date.now() - (d.testoIl || 0);
  if (fermoDa < 1400 || (fermoDa < 4000 && (d.tastoGiu || d.stato === 'registra' && d.daTasto))) { clearTimeout(d.cmdAttesa); d.cmdAttesa = setTimeout(rfDitComandoCerca, 700); return; }
  const salta = (x) => (d.cmdFallito && d.cmdFallito === x.frase) || (d.cmdIgnora || []).includes(x.frase.trim());      // già fallito (aspetta «Riprova») o dichiarato «non era un comando»
  let c = RFComandi.trova(el.value, 0);
  while (c && salta(c)) c = RFComandi.trova(el.value, c.a);
  if (!c) {
    // Non capito: si mostra che cosa c'era scritto dopo «per favore», così si vede come l'ha scritto il programma di dettatura.
    const letto = RFComandi.letto(el.value);
    if (letto !== null && letto !== d.cmdNonCapito) {
      // al server va solo la forma (verbo sì/no, parti nominate), mai le parole: serve a capire che cosa non viene riconosciuto
      try { void fetch('/api/prototipo/dittafono/comando', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comando: 'non_capito', forma: RFComandi.forma(letto) }) }).catch(() => {}); } catch (_) { /* niente */ }
    }
    if (letto !== null && letto !== d.cmdNonCapito) { d.cmdNonCapito = letto; rfDitComandoStato(`Dopo «per favore» ho letto <b>«${rfEsc(letto)}»</b>: non è un comando che conosco, il testo resta com’è.`); }
    return;
  }
  if (c.comando === 'annulla') { const t = RFComandi.sostituisci(el.value, c.da, c.a, ''); const sposta = c.a <= (d.cmdUltimo ? d.cmdUltimo.inizio : -1) ? el.value.length - t.testo.length : 0; rfDitTestoMetti(t.testo, t.inizio); if (d.cmdUltimo && sposta) { d.cmdUltimo.inizio -= sposta; d.cmdUltimo.fine -= sposta; } rfDitComandoAnnulla(); }
  else await rfDitComandoEsegui(c.comando, c.da, c.a, c.frase, c.parti);
  if (RFComandi.trova(el.value, 0)) rfDitComandoProgramma();      // ce n'è un altro
}
// Chiede il pezzo al server e lo mette al posto della frase (o, dal tasto, dove sta il cursore).
async function rfDitComandoEsegui(comando, da, a, frase, parti) {
  const d = RF.dit, paz = rfFoglioPazId(), cosa = comando === 'parti' ? 'quella parte della lettera' : 'la lettera';
  const riprova = ' <a href="javascript:void 0" onclick="rfDitComandoRiprova()">Riprova</a>';
  const fallito = (perche) => { d.cmdFallito = frase || ''; rfDitComandoStato(`<span style="color:#b3261e">${rfEsc(perche)}</span>${frase ? riprova : ''}`); };
  if (!paz) { fallito('Per inserire ' + cosa + ' scegli prima il paziente.'); return; }
  d.cmdInCorso = true; rfDitComandoStato('Cerco ' + cosa + ' nella cartella del paziente…');
  try {
    const r = await fetch('/api/prototipo/dittafono/comando', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comando, parti: parti || [], paziente: paz }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.testo) { fallito(j.errore || 'Non riesco a prendere ' + cosa + '.'); return; }
    const el = document.getElementById('rf-dit-testo'); if (!el) return;
    // intanto il testo può essere cambiato: la frase si ritrova, se no non si tocca niente
    if (frase && el.value.slice(da, a) !== frase) { const i = el.value.indexOf(frase); if (i < 0) { fallito('Il testo è cambiato mentre cercavo: ripeti il comando.'); return; } da = i; a = i + frase.length; }
    if (!frase) { da = Math.min(da, el.value.length); a = da; }
    const originale = el.value, s = RFComandi.sostituisci(originale, da, a, j.testo);
    d.cmdUltimo = { inizio: s.inizio, fine: s.fine, pezzo: s.testo.slice(s.inizio, s.fine), frase: frase || '', originale, risultato: s.testo, dopoFrase: a }; d.cmdFallito = '';
    rfDitTestoMetti(s.testo, s.fine);
    if (j.apri) rfDitFonteApri(j.apri, `${j.fonte || 'lettera'} · ${j.data || ''}`);
    rfDitComandoStato(`Inserito dalla lettera del ${rfEsc(j.data || '')}: <b>${rfEsc(j.cosa || cosa)}</b> (${rfEsc(j.fonte || '')}) — ${s.fine - s.inizio} caratteri che non hai dettato tu, da rileggere.${(j.mancanti || []).length ? ` <span style="color:#b3261e">In quella lettera non trovo: ${rfEsc(j.mancanti.join(', '))}.</span>` : ''} <a href="javascript:void 0" onclick="rfDitComandoAnnulla()">Annulla</a>${frase ? ' · <a href="javascript:void 0" onclick="rfDitComandoAnnulla(true)">Non era un comando: rimetti la frase</a>' : ''}`);
  } catch (_) { fallito('Il server non risponde: riprova.'); }
  finally { d.cmdInCorso = false; }
}
/* ACCANTO AL FOGLIO (12.10.2026, richiesta dello studio): ogni cosa chiesta con un comando si apre da sola di fianco —
   la lettera da cui viene il pezzo, com'è: le sue pagine se è una scansione, il suo testo se è un referto della
   piattaforma o un Word. Con lo ZOOM (− 100% +), che c'è anche per il foglio; la scelta resta su quel computer. I tasti
   non tolgono il cursore dal foglio (il programma di dettatura continua a scriverci). */
const RF_DIT_ZOOM = 'rf-dit-zoom';
function rfDitZoomLetto() { try { const z = JSON.parse(localStorage.getItem(RF_DIT_ZOOM) || '{}'); return z && typeof z === 'object' ? z : {}; } catch (_) { return {}; } }
function rfDitZoomDi(chi) { const v = Number(rfDitZoomLetto()[chi]); return v >= 0.5 && v <= 3 ? v : 1; }
function rfDitZoomHtml(chi) {
  const fermo = 'onmousedown="event.preventDefault()"';
  return `<span class="rf-zoom"><button class="btn sm" ${fermo} onclick="rfDitZoom('${chi}', -1)" aria-label="Rimpicciolisci" title="Rimpicciolisci">−</button><button class="btn sm" ${fermo} onclick="rfDitZoom('${chi}', 0)" title="Torna al 100%" id="rf-zoom-${chi}">${Math.round(rfDitZoomDi(chi) * 100)}%</button><button class="btn sm" ${fermo} onclick="rfDitZoom('${chi}', 1)" aria-label="Ingrandisci" title="Ingrandisci">+</button></span>`;
}
function rfDitZoom(chi, verso) {
  const z = rfDitZoomLetto(); z[chi] = verso === 0 ? 1 : Math.min(3, Math.max(0.5, Math.round((rfDitZoomDi(chi) + verso * 0.1) * 10) / 10));
  try { localStorage.setItem(RF_DIT_ZOOM, JSON.stringify(z)); } catch (_) { /* resta per questa pagina */ }
  const et = document.getElementById(`rf-zoom-${chi}`); if (et) et.textContent = `${Math.round(z[chi] * 100)}%`;
  if (chi === 'foglio') { rfDitZoomFoglio(); rfFoglioRiempi(); } else void rfDitFonteDisegna();
}
// Il foglio ingrandito resta largo quanto la sua colonna: cresce ciò che c'è scritto, non il foglio.
function rfDitZoomFoglio() {
  const f = document.getElementById('rf-foglio'), z = rfDitZoomDi('foglio'); if (!f) return;
  f.style.zoom = z === 1 ? '' : String(z); f.style.width = z === 1 ? '' : `calc(100% / ${z})`;
}
function rfDitFonteHtml() {
  const f = RF.dit.fonte; if (!f) return '';
  return `<div class="rf-dit-fonte-bar"><b class="rf-dit-fonte-nome" title="${rfEsc(f.titolo || '')}">${rfEsc(f.titolo || 'Lettera')}</b>${rfDitZoomHtml('fonte')}<button class="btn sm" onmousedown="event.preventDefault()" onclick="rfDitFonteChiudi()" aria-label="Chiudi" title="Chiudi">✕</button></div><div class="rf-dit-fonte-corpo" id="rf-dit-fonte-corpo"></div>`;
}
function rfDitFonteApri(apri, titolo) {
  const d = RF.dit, stessa = d.fonte && d.fonte.id === apri.id && d.fonte.tipo === apri.tipo;
  d.fonte = { ...apri, titolo, pdfDoc: stessa ? d.fonte.pdfDoc : null };
  const g = document.getElementById('rf-dit-due'), el = document.getElementById('rf-dit-fonte');
  if (g) g.classList.add('con-fonte'); if (el) el.innerHTML = rfDitFonteHtml();
  rfFoglioRiempi(); void rfDitFonteDisegna();
}
function rfDitFonteChiudi() {
  RF.dit.fonte = null;
  const g = document.getElementById('rf-dit-due'), el = document.getElementById('rf-dit-fonte');
  if (g) g.classList.remove('con-fonte'); if (el) el.innerHTML = '';
  rfFoglioRiempi();
}
async function rfDitFonteDisegna() {
  const d = RF.dit, f = d.fonte, box = document.getElementById('rf-dit-fonte-corpo'); if (!f || !box) return;
  const z = rfDitZoomDi('fonte'), chiave = `${f.tipo}:${f.id}:${f.da || 0}:${z}:${box.clientWidth}`;
  if (box.dataset.fatto === chiave) return;      // già disegnata così: non si rifà a ogni ridisegno della pagina
  box.dataset.fatto = chiave;
  const testo = () => { box.innerHTML = `<div class="rf-dit-fonte-testo" style="font-size:${Math.round(13 * z)}px">${rfEsc(f.testo || '')}</div>`; };
  if (!f.pdf || typeof rfPdfJs !== 'function') { testo(); return; }
  try {
    if (!f.pdfDoc) {
      box.innerHTML = '<div class="caption" style="padding:14px">Apro la lettera…</div>';
      const lib = await rfPdfJs(), r = await fetch(`/api/documents/${encodeURIComponent(f.id)}`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      f.pdfDoc = await lib.getDocument({ data: new Uint8Array(await r.arrayBuffer()), isEvalSupported: false, wasmUrl: '/prototipo/vendor/pdfjs/wasm/', standardFontDataUrl: '/prototipo/vendor/pdfjs/standard_fonts/' }).promise;
    }
    const attuale = () => RF.dit.fonte === f && box.dataset.fatto === chiave && box.isConnected;
    if (!attuale()) return;
    // le pagine della lettera (in una cartella scansionata solo le sue); un file intero fino a dodici pagine
    const n = f.pdfDoc.numPages, da = Math.min(n, Math.max(1, f.da || 1)), a = Math.min(n, Math.max(da, f.da ? (f.a || f.da) : 12));
    const larga = Math.max(200, box.clientWidth - 16) * z, dpr = Math.min(2, window.devicePixelRatio || 1), tele = [];
    for (let i = da; i <= a; i++) {
      const p = await f.pdfDoc.getPage(i), v1 = p.getViewport({ scale: 1 }), v = p.getViewport({ scale: larga / v1.width * dpr }), c = document.createElement('canvas');
      c.width = Math.floor(v.width); c.height = Math.floor(v.height); c.style.width = `${Math.floor(v.width / dpr)}px`; c.style.height = `${Math.floor(v.height / dpr)}px`;
      await p.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: v }).promise;
      if (!attuale()) return;
      tele.push(c);
    }
    box.innerHTML = ''; tele.forEach(c => box.appendChild(c));
  } catch (_) { if (RF.dit.fonte === f) testo(); }      // il file non si apre qui: resta il testo della lettera
}
function rfDitComandoRiprova() { RF.dit.cmdFallito = ''; RF.dit.testoIl = 0; void rfDitComandoCerca(); }
// Dal tasto accanto al foglio: stesso comando, nel punto del cursore.
function rfDitComandoTasto(comando, parte) {
  const d = RF.dit, el = document.getElementById('rf-dit-testo'); if (!el || d.cmdInCorso || d.stato === 'registra') return;
  const qui = typeof d.cursore === 'number' && d.cursore <= el.value.length ? d.cursore : el.value.length;
  void rfDitComandoEsegui(comando, qui, qui, '', parte ? [parte] : []);
}
// `rimetti`: la frase tolta era testo della lettera («per favore prendi la terapia regolarmente»): torna dov'era, e non
// viene più presa per un comando.
function rfDitComandoAnnulla(rimetti) {
  const d = RF.dit, el = document.getElementById('rf-dit-testo'), u = d.cmdUltimo; if (!el) return;
  if (!u) { rfDitComandoStato('Non c’è niente da annullare.'); return; }
  let da = u.inizio; if (el.value.slice(u.inizio, u.fine) !== u.pezzo) da = el.value.indexOf(u.pezzo);
  if (da < 0) { rfDitComandoStato('Il testo inserito è stato modificato: non lo tolgo da solo.'); return; }
  const t = RFComandi.sostituisci(el.value, da, da + u.pezzo.length, '');
  d.cmdUltimo = null;
  if (rimetti && u.frase) {
    const frase = u.frase.trim(), prima = t.testo.slice(0, t.inizio), dopo = t.testo.slice(t.inizio), spazio = prima && !/\s$/.test(prima) ? ' ' : '';
    d.cmdIgnora = (d.cmdIgnora || []).concat(frase).slice(-20);
    // se da allora il foglio non è cambiato torna esattamente com'era; se no la frase torna al posto del pezzo
    if (el.value === u.risultato) rfDitTestoMetti(u.originale, u.dopoFrase);
    else rfDitTestoMetti(prima + spazio + frase + (dopo && !/^\s/.test(dopo) ? ' ' : '') + dopo, prima.length + spazio.length + frase.length);
    rfDitComandoStato('Frase rimessa nel testo: non la prendo più per un comando.'); return;
  }
  rfDitTestoMetti(t.testo, t.inizio); rfDitComandoStato('Tolto ciò che era stato inserito.');
}
/* Il FOGLIO (12.10.2026, richiesta dello studio): chi detta non scrive in una casella ma sulla lettera — carta
   intestata, destinatario, data, titolo, paziente, saluto, e in fondo saluti e firma sono già scritti (dagli stessi
   ingredienti del Word: profilo del medico, cartella del paziente) e si correggono cliccandoci; il corpo è dove
   scrive il programma di dettatura. Quel che c'è sul foglio è la lettera che arriva in revisione. */
const RF_FOGLIO_PARTI = ['destinatario', 'data', 'titolo', 'paziente', 'saluto', 'chiusura', 'copia'];
function rfFoglioPazId() { const d = RF.dit; return (d.paziente || '').trim() && typeof rfPazIdDa === 'function' ? (rfPazIdDa(d.paziente) || '') : ''; }
function rfFoglioChiave() { return `${RF.dit.medico || ''}|${rfFoglioPazId()}`; }
function rfFoglioAlto(el) { if (!el || el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; }
function rfFoglioCampo(k, el) { const d = RF.dit; if (!d.foglio) d.foglio = {}; d.foglio[k] = el.value; d.foglioToccato[k] = true; rfFoglioAlto(el); }
// Mette nel foglio a schermo ciò che c'è in memoria, senza ricreare niente (il corpo non si tocca mai).
function rfFoglioRiempi() {
  const f = RF.dit.foglio; if (!f) return;
  const m = document.getElementById('rf-fg-medico'), i = document.getElementById('rf-fg-int');
  if (m) m.textContent = f.medico || ''; if (i) i.innerHTML = (f.intestazione || []).map(rfEsc).join('<br>');
  for (const k of RF_FOGLIO_PARTI) { const el = document.getElementById(`rf-fg-${k}`); if (el && el.value !== (f[k] || '')) el.value = f[k] || ''; rfFoglioAlto(el); }
  rfFoglioAlto(document.getElementById('rf-dit-testo'));
}
// Le parti già scritte vengono dal server quando cambia il medico o il paziente; quelle corrette a mano restano com'erano.
async function rfFoglioCarica() {
  const d = RF.dit; if (!rfDitDettatura()) return;
  const chiave = rfFoglioChiave(); if (d.foglioPer === chiave) return;
  d.foglioPer = chiave;
  try {
    const r = await fetch(`/api/prototipo/dittafono/foglio?medico=${encodeURIComponent(d.medico || '')}&paziente=${encodeURIComponent(rfFoglioPazId())}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok || d.foglioPer !== chiave) return;
    const j = await r.json(), prima = d.foglio || {};
    d.foglio = { ...j }; for (const k of RF_FOGLIO_PARTI) if (d.foglioToccato[k]) d.foglio[k] = prima[k] || '';
    rfFoglioRiempi();
  } catch (_) { d.foglioPer = null; }
}
function rfFoglioHtml() {
  const d = RF.dit, f = d.foglio || {};
  const area = (k, righe, ph, classe = '') => `<textarea class="rf-fg ${classe}" id="rf-fg-${k}" rows="${righe}" spellcheck="false" placeholder="${ph}" oninput="rfFoglioCampo('${k}', this)">${rfEsc(f[k] || '')}</textarea>`;
  const riga = (k, ph, classe = '') => `<input class="rf-fg ${classe}" id="rf-fg-${k}" spellcheck="false" placeholder="${ph}" value="${rfEsc(f[k] || '')}" oninput="rfFoglioCampo('${k}', this)">`;
  return `<div class="rf-foglio mt-8" id="rf-foglio">
    <img class="rf-foglio-logo" src="carta-intestata.png" alt="">
    <div class="rf-foglio-int"><b id="rf-fg-medico">${rfEsc(f.medico || '')}</b><div id="rf-fg-int">${(f.intestazione || []).map(rfEsc).join('<br>')}</div></div>
    ${area('destinatario', 4, 'Destinatario')}
    <div class="rf-fg-data"><span>Lugano,</span>${riga('data', 'data')}</div>
    ${riga('titolo', 'Titolo', 'rf-fg-titolo')}
    ${area('paziente', 2, 'Paziente', 'rf-fg-paziente')}
    ${riga('saluto', 'Saluto (Caro collega,)')}
    <textarea class="rf-fg rf-fg-corpo" id="rf-dit-testo" spellcheck="false" placeholder="Tieni premuto il tasto del microfono e detta: il testo compare qui." oninput="rfDitTesto(this); rfFoglioAlto(this)" onblur="RF.dit.cursore=this.selectionStart" onkeyup="RF.dit.cursore=this.selectionStart" onclick="RF.dit.cursore=this.selectionStart">${rfEsc(d.testo || '')}</textarea>
    ${area('chiusura', 4, 'Saluti e firma')}
    ${riga('copia', 'Copia: …', 'rf-fg-copia')}
  </div>`;
}
// In dettatura la casella del testo NON si ricrea mai: il programma di dettatura ci sta scrivendo, e ricrearla gli toglie
// il campo da sotto (12.10.2026). Si ridisegnano solo i pezzi attorno: campi, tasto, lettore.
function rfDitRidisegna() {
  if (state.route !== 'dittafono' || !rfDitDettatura() || !document.getElementById('rf-dit-testo')) { render(); return; }
  const nuovo = document.createElement('div'); nuovo.innerHTML = PAGES.dittafono();
  for (const id of ['rf-dit-campi', 'rf-dit-centro', 'rf-dit-opz', 'rf-dit-micsel', 'rf-dit-tasto', 'rf-dit-sotto']) {
    const a = document.getElementById(id), b = nuovo.querySelector('#' + id);
    if (a) a.innerHTML = b ? b.innerHTML : '';
  }
}
/* Il tasto del microfono (12.10.2026, richiesta dello studio): chi detta tiene premuto UN tasto — quello che fa ascoltare
   il programma di dettatura — e la pagina registra finché è premuto. Il tasto può essere un tasto della tastiera o un
   tasto del microfono da dettatura (un dispositivo che il browser legge con WebHID, in Chrome ed Edge, dopo che lo si è
   scelto una volta). Non serve sapere com'è fatto il dispositivo: la pagina lo IMPARA — «tieni premuto il tasto, poi
   lascialo» — guardando quale bit cambia. La scelta resta su questo computer. */
const RF_DIT_TASTO = 'rf-dit-tasto';
// I microfoni Philips (SpeechMike) mandano sullo stesso canale più TIPI di messaggio, distinti dal primo byte: i tasti,
// ma anche il sensore di movimento (preso in mano, appoggiato). Di quei dispositivi si guardano solo i messaggi dello
// stesso tipo di quello imparato — se no muovere il microfono «premeva» il tasto (12.10.2026, visto dallo studio).
// Quale tipo porti i tasti NON si dà per scontato (averlo fatto ha lasciato lo studio senza registrazione, 12.10.2026):
// si scarta solo il tipo che la documentazione dà per il movimento, e il tasto si riconosce dal gesto (acceso, poi spento).
const RF_DIT_PHILIPS = 0x0911, RF_DIT_PHILIPS_MOTO = 0x9e;
function rfDitTastoLetto() {
  try {
    const t = JSON.parse(localStorage.getItem(RF_DIT_TASTO) || 'null');
    // Un collegamento imparato prima di questa correzione, su un Philips, non sa di che tipo era il messaggio: va rifatto.
    if (t && t.tipo === 'hid' && t.vid === RF_DIT_PHILIPS && (typeof t.tipo0 !== 'number' || t.tipo0 === RF_DIT_PHILIPS_MOTO)) { localStorage.removeItem(RF_DIT_TASTO); RF.dit.tastoErrore = 'da ricollegare'; return null; }
    return t;
  } catch (_) { return null; }
}
function rfDitTastoHtml() {
  const d = RF.dit, t = rfDitTastoLetto();
  if (d.impara) return `<b>Tieni premuto il tasto con cui detti, poi lascialo.</b> ${d.impara.nota || ''} <a href="javascript:void 0" onclick="rfDitTastoAnnulla()">Annulla</a>`;
  if (t) return `Tasto del microfono: <b>${rfEsc(t.nome || 'collegato')}</b> — finché lo tieni premuto la pagina registra${RF.dit.tastoGiu ? ' · <b style="color:#b3261e">premuto</b>' : ''}. Se registra quando NON lo premi, scollegalo e ricollegalo. <a href="javascript:void 0" onclick="rfDitTastoScollega()">Scollega</a>${d.tastoErrore ? ` · <span style="color:#b3261e">${rfEsc(d.tastoErrore)}</span>` : ''}`;
  return `${d.tastoErrore === 'da ricollegare' ? '<b style="color:#b3261e">Il tasto va ricollegato</b> (prima la pagina scambiava il movimento del microfono per il tasto). ' : ''}<a href="javascript:void 0" onclick="rfDitTastoCollega()">Collega il tasto con cui detti</a>: tenendolo premuto partono insieme il programma di dettatura e la registrazione, lasciandolo si fermano. Mentre lo colleghi tieni il microfono fermo in mano.`;
}
function rfDitTastoDisegna() { const el = document.getElementById('rf-dit-tasto'); if (el) el.innerHTML = rfDitTastoHtml(); const sp = document.getElementById('rf-dit-spia'); if (sp) sp.textContent = rfDitHidSpia(); const c = document.getElementById('rf-dit-centro'); if (c && RF.dit.stato !== 'registra') rfDitRidisegna(); }
async function rfDitHidApri(dev) {
  try { if (!dev.opened) await dev.open(); dev.oninputreport = rfDitHidRapporto; RF.dit.hid = (RF.dit.hid || []).filter(x => x !== dev).concat(dev); return true; }
  catch (_) { return false; }
}
async function rfDitTastoCollega() {
  const d = RF.dit; if (d.stato === 'registra') return;
  d.impara = { visti: {}, nota: '' }; d.tastoErrore = ''; rfDitTastoDisegna();
  const t = document.getElementById('rf-dit-testo'); if (t) t.blur();
  // Un microfono da dettatura: il browser chiede quale dispositivo, e da lì se ne leggono i tasti. Chi usa un tasto della tastiera chiude la finestra e basta.
  if (navigator.hid) {
    try {
      const scelti = await navigator.hid.requestDevice({ filters: [] });
      let aperti = 0; for (const dev of scelti) if (await rfDitHidApri(dev)) aperti++;
      if (d.impara) { d.impara.nota = scelti.length ? (aperti ? '' : 'Non riesco ad aprire quel dispositivo: forse lo tiene tutto per sé il programma di dettatura. Prova con un tasto della tastiera.') : 'Nessun dispositivo scelto: va bene anche un tasto della tastiera.'; rfDitTastoDisegna(); }
    } catch (_) { /* finestra chiusa: resta la tastiera */ }
  } else if (d.impara) { d.impara.nota = 'Questo browser legge solo i tasti della tastiera (per i tasti del microfono servono Chrome o Edge).'; rfDitTastoDisegna(); }
}
function rfDitTastoAnnulla() { RF.dit.impara = null; rfDitTastoDisegna(); }
function rfDitTastoScollega() { try { localStorage.removeItem(RF_DIT_TASTO); } catch (_) { /* niente */ } RF.dit.tastoPronto = false; RF.dit.tastoErrore = ''; if (RF.dit.stato !== 'registra') rfDitRilasciaMicrofono(); rfDitTastoDisegna(); }
function rfDitTastoImparato(t) {
  try { localStorage.setItem(RF_DIT_TASTO, JSON.stringify(t)); } catch (_) { /* resta per questa pagina */ }
  RF.dit.impara = null; RF.dit.tastoGiu = false; rfDitTastoDisegna(); rfDitTastoPronto();
  toast('Tasto collegato: tienilo premuto per dettare');
}
// Che cosa arriva dal microfono, in numeri: quanti messaggi per tipo. Si mostra sotto il collegamento del tasto, così
// dallo studio si vede (e si può fotografare) se il tasto arriva alla pagina oppure no.
function rfDitHidConta(dev, b) {
  const d = RF.dit, v = d.hidVisti || (d.hidVisti = { n: 0, tipi: {} });
  const k = dev.vendorId === RF_DIT_PHILIPS && b.length > 1 ? b[0].toString(16).padStart(2, '0') : 'dati';
  v.n++; v.tipi[k] = (v.tipi[k] || 0) + 1;
  if (v.n <= 20 || v.n % 10 === 0) { const el = document.getElementById('rf-dit-spia'); if (el) el.textContent = rfDitHidSpia(); }
}
function rfDitHidSpia() {
  const v = RF.dit.hidVisti; if (!v || !v.n) return (RF.dit.hid || []).length ? 'Dal microfono non è ancora arrivato nessun messaggio.' : '';
  return `Messaggi arrivati dal microfono: ${v.n} (${Object.keys(v.tipi).sort().map(k => `tipo ${k}: ${v.tipi[k]}`).join(', ')}).`;
}
// Un rapporto dal dispositivo. Mentre si impara, il tasto è il primo bit che si ACCENDE e, dopo almeno un attimo, si
// SPEGNE: è il gesto «tieni premuto, poi lascia». Un tasto a riposo vale zero, quindi premuto = bit acceso (imparato al
// contrario, la pagina registrava a tasto rilasciato). Prendere in mano il microfono accende il bit del movimento ma non
// lo spegne finché non lo si riappoggia: non viene preso per il tasto.
function rfDitHidRapporto(e) {
  const d = RF.dit, b = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), dev = e.device;
  rfDitHidConta(dev, b);
  if (d.impara) {
    const colTipo = dev.vendorId === RF_DIT_PHILIPS && b.length > 1;      // sui Philips il primo byte dice il tipo di messaggio
    if (colTipo && b[0] === RF_DIT_PHILIPS_MOTO) return;
    const k = `${dev.vendorId}:${dev.productId}:${e.reportId}${colTipo ? `:${b[0]}` : ''}`, ora = Date.now();
    const accesi = d.impara.visti[k] || (d.impara.visti[k] = {});
    for (let i = colTipo ? 1 : 0; i < b.length; i++) for (let bit = 1; bit < 256; bit <<= 1) {
      const chi = `${i}:${bit}`;
      if (b[i] & bit) { if (!accesi[chi]) accesi[chi] = ora; continue; }
      if (!accesi[chi]) continue;
      const tenuto = ora - accesi[chi]; delete accesi[chi];
      if (tenuto < 150) continue;      // rimbalzi e rotelle
      rfDitTastoImparato({ tipo: 'hid', vid: dev.vendorId, pid: dev.productId, rid: e.reportId, i, maschera: bit, premuto: bit, ...(colTipo ? { tipo0: b[0] } : {}), nome: dev.productName || 'microfono da dettatura' });
      return;
    }
    return;
  }
  const t = rfDitTastoLetto();
  if (!t || t.tipo !== 'hid' || t.vid !== dev.vendorId || t.pid !== dev.productId || t.rid !== e.reportId || t.i >= b.length) return;
  if (typeof t.tipo0 === 'number' && b[0] !== t.tipo0) return;      // un altro tipo di messaggio (movimento, stato): non è il tasto
  rfDitTastoStato((b[t.i] & t.maschera) === t.premuto);
}
function rfDitTastoStato(giu) {
  const d = RF.dit;
  if (state.route !== 'dittafono' || !rfDitDettatura() || d.invio || giu === !!d.tastoGiu) return;
  d.tastoGiu = giu;
  if (giu) { if (d.stato !== 'registra') { d.daTasto = true; void rfDitRegistra('aggiungi'); } }
  else if (d.stato === 'registra' && d.daTasto) rfDitPausa();
}
// La tastiera: mentre si impara, il primo tasto tenuto premuto; poi quel tasto fa da «premi per dettare» finché si è nella pagina.
window.addEventListener('keydown', (e) => {
  const d = RF.dit; if (state.route !== 'dittafono') return;
  if (d.impara) { if (e.repeat || ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(e.key)) return; e.preventDefault(); d.impara.tasto = e.code; return; }
  const t = rfDitTastoLetto(); if (!t || t.tipo !== 'tasto' || e.code !== t.code || !rfDitDettatura()) return;
  e.preventDefault(); if (!e.repeat) rfDitTastoStato(true);
}, true);
window.addEventListener('keyup', (e) => {
  const d = RF.dit; if (state.route !== 'dittafono') return;
  if (d.impara) { if (d.impara.tasto && e.code === d.impara.tasto) { e.preventDefault(); rfDitTastoImparato({ tipo: 'tasto', code: e.code, nome: `tasto ${e.key.length === 1 ? e.key.toUpperCase() : e.key}` }); } return; }
  const t = rfDitTastoLetto(); if (!t || t.tipo !== 'tasto' || e.code !== t.code || !rfDitDettatura()) return;
  e.preventDefault(); rfDitTastoStato(false);
}, true);
// Con un tasto della TASTIERA, se la finestra perde il fuoco col tasto giù il rilascio non arriverebbe più: ci si ferma. (Il tasto del microfono si legge anche senza fuoco.)
window.addEventListener('blur', () => { const t = rfDitTastoLetto(); if (RF.dit.tastoGiu && t && t.tipo === 'tasto') rfDitTastoStato(false); });
// All'apertura della pagina: si riapre il dispositivo già scelto (senza chiedere di nuovo) e si tiene pronto il microfono,
// se il permesso c'è già — così la pressione del tasto registra subito.
function rfDitTastoPronto() {
  const d = RF.dit, t = rfDitTastoLetto();
  if (!t || !rfDitDettatura() || d.tastoPronto) return;
  d.tastoPronto = true;
  if (t.tipo === 'hid') {
    if (!navigator.hid) { d.tastoErrore = 'questo browser non legge il microfono da dettatura'; return; }
    navigator.hid.getDevices().then(async (l) => {
      const miei = l.filter(x => x.vendorId === t.vid && x.productId === t.pid);
      let aperti = 0; for (const dev of miei) if (await rfDitHidApri(dev)) aperti++;
      d.tastoErrore = aperti ? '' : 'il dispositivo non risponde: ricollegalo';
      const el = document.getElementById('rf-dit-tasto'); if (el) el.innerHTML = rfDitTastoHtml();
    }).catch(() => {});
  }
  const pronto = () => { if (d.stato !== 'registra' && state.route === 'dittafono') void rfDitMicrofono(); };
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'microphone' }).then(p => { if (p.state === 'granted') pronto(); }).catch(() => {});
}
// Mentre si detta o si registra la pagina non va ridisegnata dal ricarico periodico dei dati (ogni due minuti): la casella
// verrebbe ricreata e il cursore ne uscirebbe — il programma di dettatura smetterebbe di scriverci (12.10.2026).
function rfDitOccupato() {
  if (state.route !== 'dittafono') return false;
  const t = document.getElementById('rf-dit-testo'), a = document.getElementById('rf-dit-audio');
  return RF.dit.stato === 'registra' || (t && document.activeElement === t) || (a && !a.paused);
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
    const base = { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }, scelto = rfDitMicScelto();
    try { d.flusso = await navigator.mediaDevices.getUserMedia({ audio: scelto ? { ...base, deviceId: { exact: scelto } } : base }); }
    catch (e) { if (!scelto || !e || (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError')) throw e; d.flusso = await navigator.mediaDevices.getUserMedia({ audio: base }); }      // il microfono scelto non c'è più: quello di serie
    // Dopo il permesso il browser dice i nomi dei microfoni: servono a scegliere lo stesso che usa il programma di dettatura.
    try { d.microfoni = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'audioinput' && x.deviceId).map(x => ({ id: x.deviceId, nome: x.label || 'Microfono' })); } catch (_) { d.microfoni = []; }
  } catch (e) {
    d.errore = e && e.name === 'NotAllowedError' ? 'Il browser non ha il permesso di usare il microfono: concedilo dalle impostazioni del sito e riprova.' : e && e.name === 'NotFoundError' ? 'Nessun microfono trovato su questo dispositivo.' : 'Non riesco ad aprire il microfono.';
    return false;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  try { d.ctx = new Ctx({ sampleRate: RFDittafono.FREQUENZA }); } catch (_) { d.ctx = new Ctx(); }
  const sorgente = d.ctx.createMediaStreamSource(d.flusso);
  d.nodo = d.ctx.createScriptProcessor(4096, 1, 1);
  d.nodo.onaudioprocess = (ev) => {
    const f = ev.inputBuffer.getChannelData(0);
    if (RF.dit.stato !== 'registra') { if (RF.dit.tastoPronto) { RF.dit.prima = RFDittafono.aInt16(RFDittafono.riduci(f, RF.dit.ctx.sampleRate, RFDittafono.FREQUENZA)); RF.dit.primaIl = Date.now(); } return; }
    RF.dit.livello = RFDittafono.picco(f); if (RF.dit.livello > RF.dit.picco) RF.dit.picco = RF.dit.livello;
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
  rfDitCuffieAvvia();   // prima di ogni attesa: deve stare dentro il gesto
  const lettore = document.getElementById('rf-dit-audio');
  const pos = lettore && isFinite(lettore.currentTime) ? lettore.currentTime : 0;
  if (lettore) lettore.pause();
  if (!(await rfDitMicrofono())) { d.daTasto = false; rfDitCuffieStato(); rfDitRidisegna(); return; }
  d.modo = modo || 'aggiungi';
  d.punto = d.modo === 'aggiungi' ? d.pcm.length : Math.round(pos * RFDittafono.FREQUENZA);
  // Partendo dal tasto del microfono si tiene anche il quarto di secondo prima: la prima sillaba non si perde.
  d.nuovi = d.daTasto && d.modo === 'aggiungi' && d.prima && Date.now() - d.primaIl < 600 ? [d.prima] : []; d.prima = null;
  d.stato = 'registra'; d.iniziata = Date.now(); d.picco = 0; d.testoInizio = (d.testo || '').length;
  try { if (navigator.wakeLock) d.blocco = await navigator.wakeLock.request('screen'); } catch (_) { /* lo schermo può spegnersi: si registra lo stesso */ }
  rfDitCuffieStato();
  const giaDentro = document.activeElement && document.activeElement.id === 'rf-dit-testo';
  rfDitRidisegna();
  // In dettatura il cursore va nella casella: è lì che il programma di dettatura scrive.
  if (rfDitDettatura() && !giaDentro) setTimeout(() => { const t = document.getElementById('rf-dit-testo'); if (t) { t.focus(); const c = typeof d.cursore === 'number' && d.cursore <= t.value.length ? d.cursore : t.value.length; try { t.setSelectionRange(c, c); } catch (_) { /* niente */ } } }, 0);      // il cursore torna dov'era: per aggiungere un pezzo in mezzo lo si mette lì prima di registrare
  d.orologio = setInterval(rfDitAggiorna, 100);
  d.salvataggio = setInterval(() => void rfDitSalva(), 15000);
  if (d.daTasto && !d.tastoGiu) rfDitPausa();      // il tasto è stato lasciato mentre il microfono si apriva
}
function rfDitPausa() {
  const d = RF.dit; if (d.stato !== 'registra') return;
  d.pcm = rfDitComponi(); d.nuovi = []; d.modo = 'aggiungi'; d.stato = 'pausa'; d.livello = 0; d.fermataIl = Date.now(); d.daTasto = false;
  clearInterval(d.orologio); clearInterval(d.salvataggio);
  try { if (d.blocco) void d.blocco.release(); } catch (_) { /* niente */ } d.blocco = null;
  // il microfono resta pronto due minuti per riprendere subito, poi si rilascia da solo; col tasto del microfono collegato
  // resta pronto finché si sta nella pagina (se no ogni pressione perderebbe l'inizio)
  if (!(rfDitDettatura() && rfDitTastoLetto())) d.rilascio = setTimeout(rfDitRilasciaMicrofono, 120000);
  rfDitAudio(); void rfDitSalva(); rfDitCuffieStato(); rfDitRidisegna();
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
  const d = RF.dit; d.pcm = new Int16Array(0); d.nuovi = []; d.stato = 'pronto'; d.errore = ''; d.testo = ''; d.tempi = []; d.foglio = null; d.foglioToccato = {}; d.foglioPer = null; d.cmdUltimo = null; d.cmdStato = ''; d.cmdFallito = ''; d.cmdNonCapito = null; d.cmdIgnora = []; d.fonte = null;
  rfDitAudio(); rfDitRilasciaMicrofono(); rfDitCuffieFerma(); void rfDitSvuota(); render();
}
async function rfDitInvia() {
  const d = RF.dit; if (d.invio || !d.pcm.length) return;
  const medico = (document.getElementById('rf-dit-medico') || {}).value || d.medico;
  const tipo = (document.getElementById('rf-dit-tipo') || {}).value || d.tipo;
  // il medico è obbligatorio solo se lo studio ha un elenco di medici per la dettatura (la stessa regola del server)
  if (!medico && (RF.medici || []).length) { d.errore = 'Scegli il medico che ha dettato.'; render(); return; }
  if ((d.paziente || '').trim() && typeof rfPazIdDa === 'function' && !rfPazIdDa(d.paziente)) { d.errore = 'Scegli il paziente dall’elenco, o lascia il campo vuoto.'; render(); return; }
  d.medico = medico; d.tipo = tipo; d.invio = true; d.errore = ''; render();
  try {
    const fd = new FormData();
    fd.append('audio', new File([RFDittafono.wav(d.pcm, RFDittafono.FREQUENZA)], RFDittafono.nomeFile(new Date()), { type: 'audio/wav' }));
    fd.append('medico', medico); fd.append('tipo', tipo);
    const pazId = typeof rfPazIdDa === 'function' ? rfPazIdDa(d.paziente) : null;
    if (pazId) fd.append('patient_id', pazId);
    const dettato = rfDitDettatura() ? (d.testo || '').trim() : '';
    if (dettato) { fd.append('dettato_testo', dettato); fd.append('dettato_tempi', JSON.stringify(d.tempi || [])); fd.append('dettato_fonte', 'dragon'); if (d.foglio) fd.append('dettato_foglio', JSON.stringify(Object.fromEntries(RF_FOGLIO_PARTI.map(k => [k, d.foglio[k] || ''])))); }
    const r = await fetch('/api/referti/upload', { method: 'POST', body: fd, credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { d.errore = j.errore === 'medico_mancante' ? 'Scegli il medico che ha dettato.' : j.errore === 'troppo_grande' ? 'Registrazione troppo lunga per un invio solo.' : 'Invio non riuscito: la registrazione resta qui, riprova.'; d.invio = false; render(); return; }
    d.pcm = new Int16Array(0); d.stato = 'pronto'; d.invio = false; d.paziente = ''; d.testo = ''; d.tempi = []; d.cursore = null; d.foglio = null; d.foglioToccato = {}; d.foglioPer = null; d.cmdUltimo = null; d.cmdStato = ''; d.cmdFallito = ''; d.cmdNonCapito = null; d.cmdIgnora = []; d.fonte = null; rfDitAudio(); rfDitRilasciaMicrofono(); rfDitCuffieFerma(); void rfDitSvuota();
    toast(dettato ? 'Lettera e audio inviati: arriva tra i referti in pochi minuti, quando il Mac ha finito il controllo con l’audio' : 'Dettato in coda: la bozza arriva tra i referti in pochi minuti');
    render(); setTimeout(rfCaricaDati, 3000);
  } catch (_) { d.errore = 'Piattaforma non raggiungibile: la registrazione resta su questo dispositivo, riprova.'; d.invio = false; render(); }
}
// Cambiare pagina mentre si registra non perde niente: si mette in pausa e si salva.
window.addEventListener('hashchange', () => { if (/^#\/dittafono/.test(location.hash)) return; if (RF.dit.stato === 'registra') rfDitPausa(); if (RF.dit.tastoPronto) { RF.dit.tastoPronto = false; rfDitRilasciaMicrofono(); } });
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
  rfDitTastoPronto();
  const durata = RFDittafono.formatta(RFDittafono.durata(d.pcm));
  const rec = d.stato === 'registra';
  const medici = (RF.medici || []).map(m => `<option value="${rfEsc(m.id)}" ${m.id === d.medico ? 'selected' : ''}>${rfEsc(m.nome)}</option>`).join('');
  const mic = ICONS.mic || '', pausa = ICONS.pause || '';
  if (rfDitDettatura()) { void rfFoglioCarica(); setTimeout(() => { rfDitZoomFoglio(); rfFoglioRiempi(); void rfDitFonteDisegna(); }, 0); }
  return `<div class="rf-dit ${rfDitDettatura() ? 'con-foglio' : ''}">
    <div class="page-head"><div><h2 class="page-title">Dittafono</h2><div class="page-sub">Detta qui: l'audio va nella coda dei referti, come un file trascinato nella pagina Referti</div></div>
      <div class="actions"><button class="btn" data-go="#/reports">Referti</button></div></div>
    ${d.recupero ? `<div class="rf-manc"><b>C'è una registrazione non inviata</b> di ${RFDittafono.formatta(d.recupero.pcm.byteLength / 2 / RFDittafono.FREQUENZA)}, rimasta su questo dispositivo.
      <div class="row mt-8" style="gap:8px"><button class="btn primary sm" onclick="rfDitRiprendiRecupero()">Riprendila</button><button class="btn sm" onclick="rfDitScartaRecupero()">Scartala</button></div></div>` : ''}
    ${rfDitDettatura() ? `<div class="rf-dit-due ${d.fonte ? 'con-fonte' : ''}" id="rf-dit-due">` : ''}<div class="card ${rfDitDettatura() ? 'rf-dit-lato' : ''}">
      <div class="rf-dit-campi" id="rf-dit-campi">
        <div class="field"><label for="rf-dit-medico">Chi detta</label><select class="input" id="rf-dit-medico" ${rec ? 'disabled' : ''} onchange="RF.dit.medico=this.value;rfFoglioCarica()"><option value="">${(RF.medici || []).length ? '— scegli il medico —' : 'nessun medico configurato'}</option>${medici}</select></div>
        <div class="field"><label for="rf-dit-tipo">Che cosa</label><select class="input" id="rf-dit-tipo" ${rec ? 'disabled' : ''} onchange="RF.dit.tipo=this.value"><option value="referto" ${d.tipo === 'referto' ? 'selected' : ''}>Referto</option><option value="visita" ${d.tipo === 'visita' ? 'selected' : ''}>Visita registrata</option></select></div>
        <div class="field"><label for="rf-dit-paz">Paziente <span class="caption">(facoltativo)</span></label><input class="input" id="rf-dit-paz" list="rf-paz-elenco" placeholder="Cognome Nome" autocomplete="off" value="${rfEsc(d.paziente || '')}" ${rec ? 'disabled' : ''} oninput="RF.dit.paziente=this.value;rfFoglioCarica()">${typeof rfPazElenco === 'function' ? rfPazElenco() : ''}</div>
      </div>
      <div class="rf-dit-centro" id="rf-dit-centro">
        <div class="rf-dit-tempo" id="rf-dit-tempo">${durata}</div>
        <div class="rf-dit-stato ${rec ? 'rec' : ''}">${rec ? (d.modo === 'inserisci' ? 'Registro: inserisco nel punto scelto' : d.modo === 'sovrascrivi' ? 'Registro: sovrascrivo da lì in poi' : 'Registro') : d.stato === 'pausa' ? 'In pausa' : 'Pronto'}</div>
        <div class="rf-dit-livello" aria-hidden="true"><i id="rf-dit-liv"></i></div>
        <button class="rf-dit-rec ${rec ? 'attivo' : ''}" onclick="${rec ? 'rfDitPausa()' : "rfDitRegistra('aggiungi')"}" aria-label="${rec ? 'Metti in pausa' : d.pcm.length ? 'Riprendi in coda' : 'Registra'}" title="${rec ? 'Pausa' : d.pcm.length ? 'Riprendi in coda' : 'Registra'}">${rec ? pausa : mic}</button>
        <div class="caption">${rec ? (d.daTasto ? 'lascia il tasto per fermare' : 'tocca per la pausa') : rfDitDettatura() && rfDitTastoLetto() ? 'tieni premuto il tasto del microfono per dettare' : d.pcm.length ? 'tocca per riprendere in coda' : 'tocca per registrare'}</div>
        ${rfDitCuffiePossibile() ? `<label class="caption" style="display:flex;gap:8px;align-items:center;margin-top:10px;cursor:pointer"><input type="checkbox" ${rfDitCuffieAcceso() ? 'checked' : ''} ${rec ? 'disabled' : ''} onchange="rfDitCuffieImposta(this.checked)"> Pausa e ripresa col tasto delle cuffie <span title="In prova. Con le cuffie col filo, il tasto al centro mette in pausa e riprende. Se la registrazione ha problemi, spegnilo.">(in prova)</span></label>` : ''}
      </div>
      <label class="caption" id="rf-dit-opz" style="display:flex;gap:8px;align-items:center;justify-content:center;cursor:pointer"><input type="checkbox" ${rfDitDettatura() ? 'checked' : ''} ${rec ? 'disabled' : ''} onchange="rfDitDettaturaImposta(this.checked)"> Detto con Dragon (o un altro programma di dettatura): mostra la casella del testo</label>
      ${rfDitDettatura() ? `<div class="mt-16">
        <div class="row" style="justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="section-title">Dettatura</span>
          <span id="rf-dit-micsel">${(d.microfoni || []).length > 1 ? `<span class="caption">Microfono <select class="input sm" style="max-width:260px" ${rec ? 'disabled' : ''} onchange="rfDitMicImposta(this.value)" aria-label="Microfono da registrare"><option value="">quello di serie</option>${d.microfoni.map(x => `<option value="${rfEsc(x.id)}" ${x.id === rfDitMicScelto() ? 'selected' : ''}>${rfEsc(x.nome)}</option>`).join('')}</select></span>` : ''}</span></div>
        <div id="rf-dit-tasto" class="caption mt-8">${rfDitTastoHtml()}</div>
        <div id="rf-dit-spia" class="caption" style="opacity:.7">${rfDitHidSpia()}</div>
        <div class="caption mt-8">Comandi a voce: detta <b>«per favore, inserisci la lettera più recente»</b>, oppure solo una parte — <b>«per favore, inserisci l’anamnesi»</b>, «…FRCV e comorbidità», «…l’ECG», «…la conclusione», «…la terapia» — poi lascia il tasto; <b>«per favore annulla»</b> toglie ciò che è entrato. Anche da qui, nel punto del cursore: <a href="javascript:void 0" onclick="rfDitComandoTasto('lettera_recente')">lettera intera</a>${[['anamnesi', 'anamnesi'], ['frcv', 'FRCV'], ['comorbidita', 'comorbidità'], ['conclusione', 'conclusione'], ['terapia', 'terapia']].map(([k, n]) => ` · <a href="javascript:void 0" onclick="rfDitComandoTasto('parti', '${k}')">${n}</a>`).join('')}</div>
        <div id="rf-dit-cmd-stato" class="caption" style="margin-top:4px">${RF.dit.cmdStato || ''}</div>
        <div id="rf-dit-sordo" class="rf-manc mt-8" style="display:none"><b>Il testo arriva ma il microfono non sente niente.</b> Di solito il programma di dettatura tiene il microfono tutto per sé, oppure qui è scelto un altro microfono: metti in pausa e scegli sopra lo stesso che usa lui. Senza audio non c'è né riascolto né confronto.</div>
        <div id="rf-dit-fermo" class="rf-manc mt-8" style="display:none"><b>Stai dettando ma la registrazione è ferma.</b> Tocca il tasto per registrare: senza audio non c'è né riascolto né confronto.</div>
        <p class="rf-dit-nota mt-8">Quel che vedi sul foglio è la lettera che arriva in revisione: intestazione, destinatario, data, paziente, saluti e firma sono già scritti e si correggono cliccandoci; il corpo lo scrive il programma di dettatura. La registrazione resta sul dispositivo e poi sul Mac dello studio, che la trascrive per controllo.</p></div>` : ''}
      <div id="rf-dit-sotto">${d.errore ? `<div class="rf-manc mt-8">${rfEsc(d.errore)}</div>` : ''}
      ${!rec && d.pcm.length ? `<div class="mt-16">
        <audio id="rf-dit-audio" controls preload="metadata" src="${d.url || ''}"></audio>
        <div class="rf-dit-azioni mt-8">
          <button class="btn sm" onclick="rfDitRegistra('inserisci')" title="Registra un pezzo nuovo nel punto in cui è il cursore; il resto scivola avanti">Inserisci qui</button>
          <button class="btn sm" onclick="rfDitRegistra('sovrascrivi')" title="Dal punto in cui è il cursore, butta ciò che c'era e registra di nuovo">Sovrascrivi da qui</button>
          <button class="btn sm" onclick="rfDitScarta()">Scarta</button>
          <button class="btn primary" onclick="rfDitInvia()" ${d.invio ? 'disabled' : ''}>${d.invio ? 'Invio…' : 'Invia alla trascrizione'}</button>
        </div>
        <p class="rf-dit-nota mt-8">Riascolta e ferma il cursore dove vuoi: <b>Inserisci qui</b> aggiunge un pezzo in quel punto, <b>Sovrascrivi da qui</b> rifà la dettatura da lì in avanti.</p></div>` : ''}</div>
    </div>${rfDitDettatura() ? `<div class="rf-dit-carta"><div class="rf-dit-carta-bar"><span class="caption">Foglio</span>${rfDitZoomHtml('foglio')}</div>${rfFoglioHtml()}</div><div class="rf-dit-fonte" id="rf-dit-fonte">${rfDitFonteHtml()}</div></div>` : ''}
    ${rfDitRecenti()}
    <p class="rf-dit-nota">L'audio resta su questo dispositivo finché non premi «Invia»; se la pagina si chiude lo ritrovi qui. Una volta inviato segue la stessa strada di ogni dettato: trascrizione sul Mac dello studio, bozza nella pagina Referti.</p>
  </div>`;
};
// La vecchia applicazione incorporata aveva registrato un suo service worker: si toglie.
if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
  navigator.serviceWorker.getRegistrations().then(rr => rr.forEach(r => { if (/\/prototipo\/dittafono\//.test(r.scope)) void r.unregister(); })).catch(() => {});
}
