/* REVISIONE SEMPLICE (15.10.2026, richiesta dello studio: «se la lettera viene dettata sul momento dal medico servono
   meno correzioni e suggerimenti: la correzione guidata deve essere molto più pulita e intuitiva; le segretarie
   devono passare dal loro modo a questo, quindi deve essere facile da imparare»).

   Vale per le lettere dettate SUL FOGLIO con Dragon: il medico ha visto il testo mentre lo dettava.
   Dal 20.10.2026 (lo studio: «togli tutte le correzioni guidate; il foglio non bianco ma quello della lettera, col cuore,
   che si aggiorna col nome del paziente o del medico, con le dimensioni del Word, così l'impaginazione è identica»):
   - niente punti da controllare: la lettera e basta;
   - i campi della lettera (dal 21.10.2026 nella colonna di destra, tutti in una schermata senza scorrere): paziente,
     data di nascita, destinatario, medico inviante dalla rubrica, copia per conoscenza, allegati;
   - il FOGLIO è la pagina del Word: A4, margini, intestazione col cuore e il medico, destinatario, «Lugano, data»,
     titolo, paziente, testo, copia, piè di pagina, con le misure dello stampo (modelli/referto-carta-intestata.docx) e
     le parti calcolate dalla stessa funzione del Word (/api/prototipo/referti/<id>/foglio). Si scrive solo il testo;
     il resto si aggiorna da sé quando cambiano i campi. Dove il Word va a pagina nuova c'è una riga tratteggiata;
   - a destra l'audio, i dati della lettera, le note del medico, «Scarica Word» e «Conferma la lettera».
   «Revisione completa» riporta alla revisione di prima, per chi la vuole. */
(function () { const st = document.createElement('style'); st.textContent = `
.sm-testa { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 16px; }
.sm-testa h2 { margin: 0; font-size: 21px; letter-spacing: -.01em; }
.sm-chi { color: var(--text-2); font-size: 13.5px; }
.sm-testa .sm-dx { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.sm-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
@media (max-width: 1100px) { .sm-grid { grid-template-columns: 1fr; } .sm-lato { position: static !important; } }
.sm-carta { position: relative; min-width: 0; }
.sm-campi { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr); gap: 6px 8px; }
.sm-campi .field { margin: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sm-campi .input { width: 100%; min-width: 0 !important; box-sizing: border-box; height: 30px; padding: 0 9px; font-size: 13px; }
.sm-campi select.input { padding-right: 4px; }
.sm-campi label { font-size: 11px; color: var(--text-2); }
.sm-campi .largo { grid-column: 1 / -1; }
.sm-campi .sm-avviso { font-size: 11.5px; color: var(--warning, #9a6200); line-height: 1.35; }
.sm-campi .sm-avviso a, .sm-al a { color: var(--accent); cursor: pointer; }
.sm-al { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; }
.sm-al .chip { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; background: var(--surface-2, var(--surface)); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-tavolo { overflow-x: auto; padding: 4px 0 24px; }
/* La pagina del Word: A4 (210 × 297 mm), margini 50 mm sopra e 20 mm ai lati e sotto, intestazione a 12,5 mm, logo
   170 × 20 mm; corpo Calibri Light 10 pt a interlinea singola, giustificato; intestazione Avenir 8 pt; piè 10 pt. */
.sm-pagina { position: relative; width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 50mm 20mm 20mm; margin: 0 auto; background: #fff; color: #000; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 8px 28px rgba(20,30,70,.1); font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10pt; line-height: 1.22; text-align: justify; }
.sm-pagina .logo { position: absolute; left: 15.27mm; top: 6.43mm; width: 170mm; height: 19.95mm; }
.sm-pagina .int { position: absolute; left: 20mm; right: 20mm; top: 26.6mm; font-family: "Avenir Book", Avenir, "Avenir Next", "Segoe UI", sans-serif; font-size: 8pt; line-height: 1.25; text-align: left; }
.sm-pagina .piede { position: absolute; left: 20mm; right: 20mm; bottom: 9mm; font-size: 10pt; text-align: left; }
.sm-pagina .r { min-height: 1.22em; white-space: pre-wrap; }
.sm-pagina .titolo { text-transform: uppercase; letter-spacing: 1.5pt; margin-left: -1.9mm; }
.sm-pagina .paziente { font-weight: 700; margin-left: -1.9mm; }
.sm-pagina .copia { text-align: left; }
.sm-pagina .salto { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(90,90,200,.55); pointer-events: none; }
.sm-pagina .salto span { position: absolute; right: 6px; top: -9px; font: 10px/1 system-ui, sans-serif; color: rgba(90,90,200,.9); background: #fff; padding: 0 4px; }
#sm-testo { display: block; width: 100%; border: 0; outline: none; background: transparent; color: #000; font: inherit; line-height: inherit; text-align: justify; padding: 0; min-height: 4em; }
#sm-testo::selection { background: rgba(79,110,247,.25); }
.sm-salvato { font-size: 12px; color: var(--text-3); }
.sm-lato { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; max-height: calc(100vh - 92px); overflow-y: auto; }
.sm-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card, 14px); padding: 11px 13px; }
.sm-box h3 { margin: 0 0 6px; font-size: 13.5px; }
.sm-box.sm-note-box { flex: 0 1 auto; min-height: 0; overflow-y: auto; max-height: 150px; }
.sm-audio { display: flex; align-items: center; gap: 10px; }
.sm-audio .btn { flex: none; }
.sm-barra { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--surface-3); cursor: pointer; }
.sm-barra #rv-ph { position: absolute; top: -4px; width: 3px; height: 14px; border-radius: 2px; background: var(--accent); }
.sm-tempo { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sm-fine { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sm-fine .btn { justify-content: center; }
.sm-link { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.sm-link a { color: var(--accent); cursor: pointer; }
.sm-note li { font-size: 12.5px; line-height: 1.45; margin: 3px 0; }
`; document.head.appendChild(st); })();

// La revisione semplice vale per la lettera dettata sul foglio, a meno che per questa bozza si sia chiesta quella completa.
function rfSmVale(m) {
  return !!(m && m.dettato && m.dettato.foglio && typeof m.testo_attuale === 'string' && !((RF.revCompleta || {})[RF.loaded]));
}
function rfSmStato() {
  const id = RF.loaded, m = RF.meta || {};
  // si riparte dalla bozza appena caricata (un'altra finestra può averla cambiata), tranne se qui c'è ancora da salvare
  if (!RF.sm || RF.sm.id !== id || (RF.sm.meta !== m && RF.sm.salvato)) {
    const prima = (m.revisione_prototipo && m.revisione_prototipo.semplice) || {};
    RF.sm = { id, meta: m, testo: m.testo_attuale || '', fatti: Object.assign({}, prima.fatti || {}), ascoltati: new Set(prima.ascoltati || []), inizio: Date.now(), salvato: true };
  }
  return RF.sm;
}

function rfSmHtml() {
  const m = RF.meta || {}, sm = rfSmStato(), id = RF.loaded, conf = m.stato !== 'bozza';
  const quando = m.dettato_il ? new Date(m.dettato_il).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const note = (Array.isArray(m.note_segreteria) ? m.note_segreteria : []).filter(n => typeof n === 'string' && n.trim());
  const c = RF.campi || {};
  const campo = (k, etichetta, ph, classe = '') => `<div class="field ${classe}"><label for="sm-c-${k}">${etichetta}</label><input class="input" id="sm-c-${k}" value="${rfEsc(c[k] || '')}" placeholder="${ph}" ${conf ? 'readonly' : ''} oninput="rfSmCampo('${k}', this.value)" autocomplete="off"></div>`;
  return `<div class="sm-testa">
      <button class="btn sm ghost" onclick="go('#/reports')">${ICONS.arrowL || '←'} Referti</button>
      <div><h2>${rfEsc(m.paziente || 'Paziente non indicato')}</h2><div class="sm-chi">${rfEsc([m.nascita, m.medico ? `lettera di ${m.medico}` : 'lettera', quando ? `dettata il ${quando}` : ''].filter(Boolean).join(' · '))}</div></div>
      <div class="sm-dx">${conf ? '<span class="badge success">Confermata</span>' : `<span class="sm-salvato" id="sm-salvato">${sm.salvato ? 'Salvato' : 'Salvo…'}</span>`}<button class="btn sm ghost" onclick="rfSmCompleta()" title="La revisione con tutti i passi, com'era prima">Revisione completa</button></div>
    </div>
    <div class="sm-grid">
      <div class="sm-carta">
        <div class="sm-tavolo" id="sm-tavolo">${rfSmPaginaHtml(sm, conf)}</div>
      </div>
      <div class="sm-lato">
        <div class="sm-box"><div class="sm-audio"><button class="btn sm" id="rv-play" onclick="rvToggle()">${ICONS.play || ''} Play</button><div class="sm-barra" onclick="rfSmBarra(event, this)"><div id="rv-ph" style="left:0"></div></div><span class="sm-tempo"><span id="rv-t">0:00</span> / ${rfEsc(RV_AUDIO.label || '')}</span></div>${typeof rfPedHtml === 'function' ? `<div class="rf-ped-riga" style="margin-top:8px">${rfPedHtml()}</div>` : ''}</div>
        <div class="sm-box"><h3>Dati della lettera</h3><div class="sm-campi">
          ${campo('nome_paziente', 'Paziente', 'Cognome Nome')}${campo('data_nascita', 'Nascita', 'gg.mm.aaaa')}
          ${rfSmMedicoHtml(conf)}
          ${campo('copia_conoscenza', 'Copia per conoscenza', 'Dr. med. …; Dr. med. …', 'largo')}
          ${rfSmAllegatiHtml()}
        </div></div>
        ${note.length ? `<div class="sm-box sm-note-box"><h3>Note del medico per te</h3><ul class="sm-note" style="margin:6px 0 0;padding-left:18px">${note.map(n => `<li>${rfEsc(n)}</li>`).join('')}</ul></div>` : ''}
        <div class="sm-box sm-fine">
          <button class="btn" onclick="rfSmWord()">${ICONS.file || ''} Scarica Word</button>
          ${conf ? `<button class="btn primary" onclick="rfEmailPrepara('${rfJs(id)}')">${ICONS.mail || ''} Prepara e-mail</button>` : `<button class="btn primary" onclick="rfSmConferma()">${ICONS.check || ''} Conferma la lettera</button>`}
          ${conf ? '' : `<div class="sm-link" style="grid-column:1 / -1"><a onclick="rfEmailPrepara('${rfJs(id)}')">Prepara e-mail</a></div>`}
        </div>
      </div>
    </div>`;
}

// Il medico della lettera: inviante e destinatario sono quasi sempre la stessa persona (21.10.2026, dallo studio: «basta
// solo uno dei due»), quindi un campo solo che scrive tutti e due. Si scrive a mano o si sceglie dalla rubrica; scelto
// dalla rubrica, la lettera si collega a lui (lo stesso legame della revisione completa: rfAttornoInviante), e il Word
// prende da lì specialità ed e-mail. Se il nome non è in rubrica lo dice, con «Aggiungi».
function rfSmMedicoHtml(conf) {
  if (RF.attornoPer !== RF.loaded) void rfCaricaAttorno();
  const a = RF.attornoPer === RF.loaded ? RF.attorno : null, c = RF.campi || {};
  const inv = (a && a.inviante) || {};
  const valore = c.medico_destinatario || c.medico_inviante || (inv.scelto && inv.scelto.nome) || '';
  const stato = !a ? '' : inv.scelto ? `<div class="caption">✓ collegato alla rubrica${inv.scelto.email ? ` · ${rfEsc(inv.scelto.email)}` : ''}</div>`
    : inv.stato === 'nuovo' ? `<div class="sm-avviso">${rfEsc(inv.nome || '')} non è nella rubrica.${conf ? '' : ' <a onclick="rfAttornoAggiungi()">Aggiungi</a>'}</div>`
    : inv.stato === 'ambiguo' ? `<div class="sm-avviso">Il dettato dice ${rfEsc(inv.nome || '')}: sceglilo dall’elenco.</div>` : '';
  return `<div class="field largo"><label for="sm-c-medico">Medico inviante e destinatario</label><input class="input" id="sm-c-medico" list="sm-rubrica" value="${rfEsc(valore)}" placeholder="Dr. med. … (scrivi o scegli dalla rubrica)" ${conf ? 'readonly' : ''} oninput="rfSmMedico(this.value)" onchange="rfSmMedicoScelto(this.value)" autocomplete="off">
    <datalist id="sm-rubrica">${((a && a.rubrica) || []).map(x => `<option value="${rfEsc(x.nome)}">${rfEsc(x.localita || '')}</option>`).join('')}</datalist>${stato}</div>`;
}
function rfSmMedico(v) {
  rfSmCampo('medico_destinatario', v);
  RF.campi.medico_inviante = v; RF.sm.campiToccati.add('medico_inviante');
}
// Un nome che è nella rubrica, scelto o scritto per intero: la lettera si collega a quel medico.
function rfSmMedicoScelto(v) {
  const a = RF.attorno || {}, scelto = ((a.inviante || {}).scelto || {}).id;
  const r = (a.rubrica || []).find(x => x.nome.toLowerCase() === String(v || '').trim().toLowerCase());
  if (r && r.id !== scelto) void rfAttornoInviante(r.id);
}
// Gli allegati che partono col Word e con la mail: i nomi in breve e «Gestisci» (la finestra di sempre).
function rfSmAllegatiHtml() {
  const a = RF.attornoPer === RF.loaded ? RF.attorno : null;
  const al = (a && a.allegati) || [];
  const ecg = a && a.ecg && a.ecg.citato && !a.ecg.trovato ? '<div class="sm-avviso">Il medico parla di un ECG, ma nella cartella non c’è.</div>' : '';
  return `<div class="field largo"><label>Allegati</label><div class="sm-al">${al.length ? al.map(x => `<span class="chip" title="${rfEsc(x.etichetta)}">${rfEsc(x.etichetta)}</span>`).join('') : '<span class="caption">nessuno</span>'}<a onclick="rfAllegati()">Gestisci</a></div>${ecg}</div>`;
}

/* ── la pagina del Word ── */
// Le parti attorno al testo, come le mette il Word (stessa funzione sul server). Si chiedono all'apertura, dopo che
// cambiano i campi e, ogni tanto, dopo che cambia il testo (il saluto può decidere il destinatario).
function rfSmRighe(t, classe = '') { return String(t || '').split('\n').map(r => `<div class="r ${classe}">${rfEsc(r)}</div>`).join(''); }
function rfSmPartiHtml(f) {
  if (!f) return { testa: '', sotto: '', int: '', piede: '' };
  const vuoti = '<div class="r"></div>'.repeat(Math.max(0, f.vuoti || 0));
  const testa = `<div class="r"></div>${rfSmRighe(f.destinatario)}${f.via && f.via.trim() ? rfSmRighe(f.via) : ''}${vuoti}<div class="r">Lugano, ${rfEsc(f.data || '')}</div><div class="r"></div>${f.titolo && f.titolo.trim() ? rfSmRighe(f.titolo, 'titolo') : ''}${f.paziente && f.paziente.trim() ? rfSmRighe(f.paziente, 'paziente') : ''}<div class="r"></div>`;
  return { testa, sotto: f.copia && f.copia.trim() ? rfSmRighe(f.copia, 'copia') : '', int: `<b>${rfEsc(f.medico || '')}</b>${f.intestazione ? `<br>${String(f.intestazione).split('\n').map(rfEsc).join('<br>')}` : ''}`, piede: rfEsc(f.piede || '') };
}
function rfSmPaginaHtml(sm, conf) {
  const p = rfSmPartiHtml(RF.smFoglio && RF.smFoglio.id === sm.id ? RF.smFoglio.parti : null);
  return `<div class="sm-pagina" id="sm-pagina">
      <img class="logo" src="carta-intestata-word.png" alt="">
      <div class="int" id="sm-int">${p.int}</div>
      <div id="sm-testa">${p.testa}</div>
      <div id="sm-testo" lang="it" spellcheck="true" role="textbox" aria-multiline="true" contenteditable="${conf ? 'false' : 'plaintext-only'}" oninput="rfSmScrive(this)" aria-label="Testo della lettera">${rfEsc(sm.testo)}</div>
      <div id="sm-sotto">${p.sotto}</div>
      <div class="piede" id="sm-piede">${p.piede}</div>
    </div>`;
}
async function rfSmFoglioCarica(forza) {
  const id = RF.loaded; if (!id) return;
  if (!forza && RF.smFoglio && RF.smFoglio.id === id && Date.now() - RF.smFoglio.il < 8000) return;
  RF.smFoglio = Object.assign(RF.smFoglio && RF.smFoglio.id === id ? RF.smFoglio : { id }, { il: Date.now() });
  try {
    const r = await fetch(`/api/prototipo/referti/${id}/foglio`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok || RF.loaded !== id) return;
    RF.smFoglio = { id, il: Date.now(), parti: await r.json() };
    const p = rfSmPartiHtml(RF.smFoglio.parti);
    const metti = (k, h) => { const el = document.getElementById(k); if (el && el.innerHTML !== h) el.innerHTML = h; };
    metti('sm-int', p.int); metti('sm-testa', p.testa); metti('sm-sotto', p.sotto); metti('sm-piede', p.piede);
    rfSmPagine();
  } catch (_) { /* resta quello di prima */ }
}
// Dove il Word va a pagina nuova: ogni 227 mm di contenuto (297 − 50 sopra − 20 sotto), una riga tratteggiata.
function rfSmPagine() {
  const pg = document.getElementById('sm-pagina'); if (!pg) return;
  pg.querySelectorAll('.salto').forEach(x => x.remove());
  const mm = pg.offsetWidth / 210, alto = pg.scrollHeight;
  for (let k = 1; 50 * mm + 227 * mm * k < alto - 20 * mm; k++) {
    const d = document.createElement('div'); d.className = 'salto'; d.style.top = `${Math.round((50 + 227 * k) * mm)}px`;
    d.innerHTML = `<span>nel Word qui comincia la pagina ${k + 1}</span>`; pg.appendChild(d);
  }
}
// Il foglio largo 210 mm: se la colonna è più stretta, si rimpicciolisce tutto insieme (le righe vanno a capo come nel Word).
function rfSmScala() {
  const t = document.getElementById('sm-tavolo'), pg = document.getElementById('sm-pagina'); if (!t || !pg) return;
  pg.style.zoom = ''; const z = Math.min(1, (t.clientWidth - 2) / pg.offsetWidth);
  if (z < 1) pg.style.zoom = String(Math.max(0.4, z));
}
window.addEventListener('resize', () => { if (document.getElementById('sm-pagina')) { rfSmScala(); rfSmPagine(); } });

// Dopo ogni disegno: il cursore torna dov'era se si stava scrivendo; le parti del Word e i salti di pagina.
function rfSmDopo(cursore) {
  const el = document.getElementById('sm-testo'); if (!el) return;
  if (typeof rfFmtDopoDisegno === 'function') rfFmtDopoDisegno();      // grassetto, corsivo, sottolineato (20.10.2026)
  if (cursore) { try { el.focus({ preventScroll: true }); rfSmSeleziona(el, cursore[0], cursore[1]); } catch (_) { /* niente */ } }
  rfSmScala(); rfSmPagine(); void rfSmFoglioCarica();
  if (typeof rvTick === 'function') rvTick();
}
// Il foglio è un testo modificabile (dal 20.10.2026, per mostrare grassetto e corsivo; prima una casella di testo):
// il suo valore e la selezione si leggono e si mettono per posizione nel testo.
function rfSmValore(el) { return rfFmtLeggi({ parti: [el] }).testo; }
function rfSmSeleziona(el, da, a) { return rfFmtSeleziona({ root: el, parti: [el] }, da, a); }
function rfSmCursore(el) { const f = { root: el, parti: [el] }; return rfFmtSelezione(f, rfFmtLeggi(f)); }
function rfSmScrive(el) { RF.sm.testo = rfSmValore(el); rfSmProgramma(); rfSmPagine(); }
// I campi della lettera (paziente, nascita, destinatario, copia per conoscenza): si salvano con la lettera e il foglio si
// aggiorna appena salvati.
function rfSmCampo(k, v) { RF.campi = RF.campi || {}; RF.campi[k] = v; (RF.sm.campiToccati = RF.sm.campiToccati || new Set()).add(k); RF.sm.campiCambiati = true; rfSmProgramma(); }
function rfSmBarra(e, el) { const r = el.getBoundingClientRect(); rvSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (RV_AUDIO.dur || 0), true); }

// Ridisegna solo la colonna di destra (il foglio non si ricrea: si perderebbe il cursore).
function rfSmRidisegna() {
  const vecchia = document.querySelector('.sm-lato'); if (!vecchia) { render(); return; }
  const f = rfSmFuoco();
  const tmp = document.createElement('div'); tmp.innerHTML = rfSmHtml();
  const nuova = tmp.querySelector('.sm-lato'); if (nuova) vecchia.replaceWith(nuova);
  rfSmRidaiFuoco(f);
  if (typeof rvTick === 'function') rvTick();
}
// Chi sta scrivendo in un campo della colonna non perde il punto in cui scriveva quando la colonna si ridisegna.
function rfSmFuoco() { const a = document.activeElement; return a && a.id && a.id.startsWith('sm-c-') && a.tagName === 'INPUT' ? { id: a.id, da: a.selectionStart, a: a.selectionEnd } : null; }
function rfSmRidaiFuoco(f) { if (!f) return; const el = document.getElementById(f.id); if (!el) return; el.focus(); try { el.setSelectionRange(f.da, f.a); } catch { /* ignora */ } }

// Si salva da solo, un secondo e mezzo dopo l'ultima modifica: il testo nella bozza, e a che punto si è.
function rfSmProgramma() {
  const sm = RF.sm; sm.salvato = false; const e = document.getElementById('sm-salvato'); if (e) e.textContent = 'Salvo…';
  clearTimeout(sm.timer); sm.timer = setTimeout(() => void rfSmSalva(), 1500);
}
async function rfSmSalva() {
  const sm = RF.sm, id = sm && sm.id; if (!sm || !id || (RF.meta && RF.meta.stato !== 'bozza')) return true;
  clearTimeout(sm.timer);
  try {
    const stato = { semplice: { fatti: sm.fatti, ascoltati: [...sm.ascoltati] } };
    const r = await fetch(`/api/prototipo/referti/${id}/testo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ testo: sm.testo, base: RF.base, stato, campi: sm.campiCambiati ? Object.fromEntries([...(sm.campiToccati || [])].map(k => [k, String((RF.campi || {})[k] ?? '')])) : undefined }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.errore === 'cambiata') {
      openModal('La lettera è cambiata', '<p>Nel frattempo la lettera è stata salvata in un\'altra versione (da un\'altra finestra o da un altro computer). Per non sovrascriverla ricarico quella salvata: le ultime modifiche di questa pagina non sono state salvate.</p>', '<button class="btn primary" data-close>Va bene</button>');
      RF.sm = null; RF.loaded = null; render(); return false;
    }
    if (!r.ok) throw new Error(String(r.status));
    if (j.impronta) RF.base = j.impronta;
    const campi = sm.campiCambiati; sm.campiCambiati = false; sm.salvato = true;
    const e = document.getElementById('sm-salvato'); if (e) e.textContent = 'Salvato';
    void rfSmFoglioCarica(campi);      // il foglio come lo farà il Word (subito se sono cambiati i campi)
    return true;
  } catch (_) { const e = document.getElementById('sm-salvato'); if (e) e.textContent = 'Non salvato: riprovo'; sm.timer = setTimeout(() => void rfSmSalva(), 5000); return false; }
}
async function rfSmWord() { if (RF.meta && RF.meta.stato === 'bozza' && !(await rfSmSalva())) { toast('Prima salvo la lettera: riprova fra un attimo'); return; } void rfWord(RF.loaded); }
function rfSmCompleta() {
  void rfSmSalva().then(() => { RF.revCompleta = RF.revCompleta || {}; RF.revCompleta[RF.sm ? RF.sm.id : RF.loaded] = true; RF.sm = null; RF.loaded = null; render(); });
}
function rfSmSemplice() { const id = RF.loaded; RF.revCompleta = RF.revCompleta || {}; delete RF.revCompleta[id]; RF.sm = null; RF.loaded = null; render(); }

// Conferma (20.10.2026: senza i punti da controllare, tolti dalla revisione semplice).
async function rfSmConferma() {
  // Un clic e la lettera è confermata (21.10.2026, dallo studio: «se schiaccia conferma, glielo confermi e basta, senza
  // nessuna conferma o cose così»): niente finestra prima né dopo. Il richiamo proposto dal referto, che prima era una
  // casella già spuntata, si crea come allora.
  const m = RF.meta || {}, sm = RF.sm, id = sm.id;
  const b = document.querySelector('.sm-fine .btn.primary'); if (b) { b.disabled = true; b.textContent = 'Confermo…'; }
  const riarma = (t) => { const x = document.querySelector('.sm-fine .btn.primary'); if (x) { x.disabled = false; x.innerHTML = `${ICONS.check || ''} Conferma la lettera`; } toast(t); };
  if (!(await rfSmSalva())) { riarma('La lettera non si è salvata: riprova'); return; }
  try {
    const r = await fetch(`/api/prototipo/referti/${id}/conferma`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      testo: sm.testo, campi: RF.campi || {}, presa_atto: true, flag_totali: 0, flag_accettati_senza_riascolto: 0, flag_critici_totali: 0, flag_critici_chiusi: 0,
      tempo_revisione_s: Math.round((Date.now() - sm.inizio) / 1000), revisione_iniziata_at: new Date(sm.inizio).toISOString(),
    }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.errore || String(r.status)); }
    let nota = '';
    if (m.richiamo_proposto && !m.richiamo) {
      try {
        const rr = await fetch(`/api/prototipo/referti/${id}/richiamo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesi: m.richiamo_proposto.mesi }) });
        nota = rr.ok ? ` · richiamo fra ${m.richiamo_proposto.mesi} mesi creato` : ' · il richiamo non si è creato: fallo dalla scheda del paziente';
      } catch (_) { nota = ' · il richiamo non si è creato'; }
    }
    toast(`Lettera confermata${nota}`);
    RF.sm = null; RF.loaded = null; render(); void rfCaricaDati();      // la pagina si riapre confermata: Word e e-mail a destra
  } catch (e) {
    riarma(e.message === 'non_bozza' ? 'La lettera è già confermata' : 'Conferma non riuscita');
  }
}

// Dentro la pagina della revisione: se vale, la semplice al posto di quella completa; nella completa di una lettera
// dettata sul foglio, un tasto per tornare alla semplice.
(function () {
  const completa = PAGES.review;
  PAGES.review = () => {
    const id = state.params && state.params.id;
    if (RF.live && id && RF.loaded === id && rfSmVale(RF.meta)) {
      const a = document.activeElement, cursore = a && a.id === 'sm-testo' ? rfSmCursore(a) : null, fuoco = rfSmFuoco();
      const html = rfSmHtml();
      setTimeout(() => { rfSmDopo(cursore); rfSmRidaiFuoco(fuoco); }, 0);
      return html;
    }
    let html = completa();
    const m = RF.meta || {};
    if (RF.live && id && RF.loaded === id && m.dettato && m.dettato.foglio && (RF.revCompleta || {})[id]) {
      html = html.replace('<div class="rv-top-r">', `<div class="rv-top-r"><button class="btn sm primary" onclick="rfSmSemplice()" title="La lettera sulla sua pagina del Word, con l'audio">Revisione semplice</button>`);
    }
    return html;
  };
  // uscendo dalla pagina col testo non ancora salvato, si salva subito
  window.addEventListener('pagehide', () => { if (RF.sm && !RF.sm.salvato) void rfSmSalva(); });
})();
