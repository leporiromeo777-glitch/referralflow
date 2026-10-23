/* =====================================================================
   Note degli aiuti medici (23.10.2026) — [[Piattaforma/Accessi e ruoli]]
   =====================================================================
   Dallo studio: «nella home dell'aiuto medico una sezione note che vedono
   tutte tra di loro». Una bacheca per studio: chi scrive, quando, «Fatta».
   Si ridisegna solo la lista (mai la pagina): chi scrive non perde il
   testo e la pagina non salta. */
(function () { const st = document.createElement('style'); st.textContent = `
.rf-note-form { display:flex; flex-direction:column; gap:8px; }
.rf-note-form textarea { min-height:64px; resize:vertical; font:inherit; }
.rf-note-form .row { justify-content:space-between; align-items:center; }
.rf-nota { display:flex; flex-direction:column; gap:4px; padding:10px 6px; border-top:1px solid var(--border); }
.rf-nota .t { font-size:13.5px; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
.rf-nota .sotto { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
.rf-nota .chi { font-size:12px; color:var(--text-3); }
.rf-nota .tasti { display:flex; gap:6px; }
.rf-nota.fatta .t { color:var(--text-3); text-decoration:line-through; }
.rf-note-fatte > summary { cursor:pointer; font-size:12.5px; color:var(--text-2); padding:10px 6px 4px; border-top:1px solid var(--border); }
`; document.head.appendChild(st); })();

RF.note = { lista: null, errore: null, bozza: '', il: 0, lavora: false };
const RF_NOTE_URL = '/api/prototipo/note';

function rfNotaQuando(s) {
  const d = new Date(s); const ora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const g = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((g(new Date()) - g(d)) / 86400000);
  return diff === 0 ? `oggi ${ora}` : diff === 1 ? `ieri ${ora}` : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. ${ora}`;
}

function rfNotaRiga(n) {
  return `<div class="rf-nota${n.fatta_il ? ' fatta' : ''}"><div class="t">${rfEsc(n.testo)}</div>
    <div class="sotto"><span class="chi">${rfEsc(n.autore)} · ${rfNotaQuando(n.creata_il)}${n.fatta_il ? ` · fatta da ${rfEsc(n.fatta_da || '')} ${rfNotaQuando(n.fatta_il)}` : ''}</span>
      <span class="tasti"><button class="btn sm" data-nota="fatta" data-id="${n.id}" data-fatta="${n.fatta_il ? '0' : '1'}">${n.fatta_il ? 'Riapri' : 'Fatta'}</button>${n.mia ? `<button class="btn sm ghost" data-nota="togli" data-id="${n.id}">Togli</button>` : ''}</span></div></div>`;
}

function rfNoteLista() {
  const N = RF.note;
  if (N.lista === null) return `<div class="caption" style="padding:8px 6px">${N.errore ? rfEsc(N.errore) : 'Carico le note…'}</div>`;
  const aperte = N.lista.filter((n) => !n.fatta_il), fatte = N.lista.filter((n) => n.fatta_il);
  return `${N.errore ? `<div class="caption" style="padding:6px;color:var(--danger)">${rfEsc(N.errore)}</div>` : ''}
    ${aperte.length ? aperte.map(rfNotaRiga).join('') : '<div class="caption" style="padding:10px 6px">Nessuna nota aperta.</div>'}
    ${fatte.length ? `<details class="rf-note-fatte"><summary>Fatte negli ultimi sette giorni (${fatte.length})</summary>${fatte.map(rfNotaRiga).join('')}</details>` : ''}`;
}

function rfNoteCard() {
  if (!RF.live) return '';
  if (RF.note.lista === null || Date.now() - RF.note.il > 30000) void rfNoteCarica();
  const aperte = (RF.note.lista || []).filter((n) => !n.fatta_il).length;
  return `<div class="card" id="rf-note"><div class="card-head"><span class="section-title">Note</span><span class="caption" id="rf-note-n">${aperte ? `${aperte} ${aperte === 1 ? 'aperta' : 'aperte'} · ` : ''}le vedono tutti gli aiuti medici</span></div>
    <div class="rf-note-form"><textarea class="input" id="rf-note-testo" maxlength="2000" placeholder="Scrivi una nota per le colleghe…">${rfEsc(RF.note.bozza)}</textarea>
      <div class="row"><span class="caption">⌘/Ctrl + Invio per aggiungere</span><button class="btn primary sm" data-nota="aggiungi">Aggiungi nota</button></div></div>
    <div id="rf-note-lista" style="margin-top:8px">${rfNoteLista()}</div></div>`;
}

function rfNoteRidisegna() {
  const el = document.getElementById('rf-note-lista'); if (el) el.innerHTML = rfNoteLista();
  const n = document.getElementById('rf-note-n');
  const aperte = (RF.note.lista || []).filter((x) => !x.fatta_il).length;
  if (n) n.textContent = `${aperte ? `${aperte} ${aperte === 1 ? 'aperta' : 'aperte'} · ` : ''}le vedono tutti gli aiuti medici`;
}

async function rfNoteCarica() {
  if (RF.note.lavora) return;
  RF.note.lavora = true; RF.note.il = Date.now();
  try {
    const r = await fetch(RF_NOTE_URL, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { RF.note.lista = j.note || []; RF.note.errore = null; } else RF.note.errore = j.errore || 'Non riesco a leggere le note.';
  } catch { RF.note.errore = 'Non riesco a leggere le note: controlla la connessione.'; }
  RF.note.lavora = false;
  rfNoteRidisegna();
}

async function rfNoteAzione(corpo) {
  try {
    const r = await fetch(RF_NOTE_URL, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.note.errore = j.errore || 'Non riesco a salvare.'; rfNoteRidisegna(); return false; }
    RF.note.lista = j.note || []; RF.note.errore = null; RF.note.il = Date.now(); rfNoteRidisegna(); return true;
  } catch { RF.note.errore = 'Non riesco a salvare: controlla la connessione.'; rfNoteRidisegna(); return false; }
}

async function rfNoteAggiungi() {
  const ta = document.getElementById('rf-note-testo'); if (!ta) return;
  const testo = ta.value.trim(); if (!testo) { ta.focus(); return; }
  ta.disabled = true;
  if (await rfNoteAzione({ azione: 'aggiungi', testo })) { ta.value = ''; RF.note.bozza = ''; }
  ta.disabled = false; ta.focus();
}

document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest && e.target.closest('[data-nota]'); if (!b) return;
  e.preventDefault();
  const a = b.getAttribute('data-nota');
  if (a === 'aggiungi') return void rfNoteAggiungi();
  if (a === 'togli' && !confirm('Togliere questa nota per tutti?')) return;
  b.disabled = true;
  void rfNoteAzione(a === 'fatta' ? { azione: 'fatta', id: b.dataset.id, fatta: b.dataset.fatta === '1' } : { azione: 'togli', id: b.dataset.id });
});
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'rf-note-testo') RF.note.bozza = e.target.value; });
document.addEventListener('keydown', (e) => { if (e.target && e.target.id === 'rf-note-testo' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void rfNoteAggiungi(); } });
// le note delle colleghe arrivano da sole: ogni 30 secondi, solo con la home aperta e visibile
setInterval(() => { if (RF.live && !document.hidden && document.getElementById('rf-note')) void rfNoteCarica(); }, 30000);
