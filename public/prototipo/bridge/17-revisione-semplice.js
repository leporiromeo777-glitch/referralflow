/* REVISIONE SEMPLICE (15.10.2026, richiesta dello studio: «se la lettera viene dettata sul momento dal medico servono
   meno correzioni e suggerimenti: la correzione guidata deve essere molto più pulita e intuitiva; le segretarie
   devono passare dal loro modo a questo, quindi deve essere facile da imparare»).

   Vale per le lettere dettate SUL FOGLIO con Dragon: il medico ha visto il testo mentre lo dettava. I passi della
   correzione guidata qui non servono (sono calcolati sul testo che il Mac ha ricavato dall'audio, non su questo).
   La pagina è fatta come il lavoro di sempre della segreteria:
   - la LETTERA, come un documento: ci si clicca e si scrive (correttore ortografico del browser acceso);
   - a destra l'AUDIO e i soli PUNTI DA CONTROLLARE — dove Dragon e il Mac hanno capito cose diverse — con i numeri
     per primi; per ognuno «Ascolta», «Va bene così», «Metti …»;
   - in fondo «Scarica Word» e «Conferma la lettera».
   «Revisione completa» riporta alla revisione di prima, per chi la vuole. */
(function () { const st = document.createElement('style'); st.textContent = `
.sm-testa { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 16px; }
.sm-testa h2 { margin: 0; font-size: 21px; letter-spacing: -.01em; }
.sm-chi { color: var(--text-2); font-size: 13.5px; }
.sm-testa .sm-dx { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.sm-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
@media (max-width: 1100px) { .sm-grid { grid-template-columns: 1fr; } .sm-lato { position: static !important; } }
.sm-carta { background: #fff; color: #1b1b1f; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 28px rgba(20,30,70,.08); padding: 44px 56px 56px; max-width: 820px; margin: 0 auto; width: 100%; box-sizing: border-box; }
@media (max-width: 700px) { .sm-carta { padding: 22px 18px 30px; } }
.sm-a { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; font: 14px/1.5 Arial, Helvetica, sans-serif; color: #555; }
.sm-a input { flex: 1; border: 0; border-bottom: 1px dashed #c9cdd8; background: transparent; font: inherit; color: #1b1b1f; padding: 2px 0; outline: none; }
.sm-a input:focus { border-bottom-color: var(--accent); }
.sm-a + .sm-a + * { margin-top: 18px; }
.sm-a span { min-width: 46px; }
#sm-testo { display: block; width: 100%; border: 0; outline: none; background: transparent; color: #1b1b1f; font: 15px/1.7 Arial, Helvetica, sans-serif; padding: 0; min-height: 360px; }
#sm-testo::selection { background: rgba(79,110,247,.25); }
.sm-salvato { font-size: 12px; color: var(--text-3); }
.sm-lato { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 14px; }
.sm-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-card, 14px); padding: 14px 16px; }
.sm-box h3 { margin: 0 0 4px; font-size: 14.5px; }
.sm-audio { display: flex; align-items: center; gap: 10px; }
.sm-audio .btn { flex: none; }
.sm-barra { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--surface-3); cursor: pointer; }
.sm-barra #rv-ph { position: absolute; top: -4px; width: 3px; height: 14px; border-radius: 2px; background: var(--accent); }
.sm-tempo { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sm-p { border-top: 1px solid var(--border); padding: 11px 0 10px; }
.sm-p:first-of-type { border-top: 0; }
.sm-p-frase { font-size: 13.5px; line-height: 1.55; cursor: pointer; color: var(--text-2); }
.sm-p-frase mark { background: rgba(214,92,42,.18); color: var(--text); border-radius: 4px; padding: 0 3px; font-weight: 600; }
.sm-p-mac { font-size: 12.5px; color: var(--text-3); margin-top: 3px; }
.sm-p-mac b { color: var(--text); }
.sm-p-az { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
.sm-p.fatto { padding: 7px 0; }
.sm-p.fatto .sm-p-frase { font-size: 12.5px; color: var(--text-3); }
.sm-num { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #b3261e; margin-bottom: 2px; }
.sm-vuoto { font-size: 13px; color: var(--text-2); }
.sm-fine { display: flex; flex-direction: column; gap: 8px; }
.sm-fine .btn { justify-content: center; }
.sm-link { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.sm-link a { color: var(--accent); cursor: pointer; }
.sm-note li { font-size: 13px; line-height: 1.5; margin: 4px 0; }
.sm-altri summary { cursor: pointer; font-size: 13px; color: var(--text-2); padding-top: 8px; }
`; document.head.appendChild(st); })();

// La revisione semplice vale per la lettera dettata sul foglio, a meno che per questa bozza si sia chiesta quella completa.
function rfSmVale(m) {
  return !!(m && m.dettato && m.dettato.foglio && typeof m.testo_attuale === 'string' && !((RF.revCompleta || {})[RF.loaded]));
}
// I punti da controllare: dove il testo di Dragon e la trascrizione del Mac non coincidono. Con le parole attorno
// (per ritrovarli nella lettera e per farli capire a chi legge); fuori solo quelli che differiscono per spazi o punteggiatura.
function rfSmPunti(m) {
  const pz = (m.dettato && m.dettato.pezzi) || [], out = [];
  const parole = (s) => String(s || '').split(/\s+/).filter(Boolean);
  const osso = (s) => String(s || '').toLowerCase().replace(/[^a-zà-ÿ0-9%]/gi, '');
  pz.forEach((p, k) => {
    if (p.uguale) return;
    if (p.t && p.mac && osso(p.t) === osso(p.mac)) return;
    const prima = k > 0 && pz[k - 1].uguale ? parole(pz[k - 1].t).slice(-5).join(' ') : '';
    const dopo = pz[k + 1] && pz[k + 1].uguale ? parole(pz[k + 1].t).slice(0, 4).join(' ') : '';
    out.push({ k, t: p.t || '', mac: p.mac || '', s: p.s, prima, dopo, numero: /\d/.test(`${p.t || ''} ${p.mac || ''}`) });
  });
  return out;
}
// Dove sta un punto nella lettera di adesso (che può essere stata corretta): le parole di Dragon dopo il loro contesto.
// → { da, a } (da === a: il punto in cui il Mac ha sentito una parola che Dragon non ha scritto), o null.
function rfSmTrova(testo, p) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = (s) => String(s).split(/\s+/).filter(Boolean).map(esc).join('\\s+');
  const prima = p.prima ? re(p.prima) : '', cosa = p.t ? re(p.t) : '', dopo = p.dopo ? re(p.dopo) : '';
  for (const [a, b] of [[prima, dopo], [prima, ''], ['', dopo]]) {
    if (!cosa && !a) continue;
    if (!a && !b) continue;
    const m = new RegExp(`(${a})(\\s*)(${cosa})${b ? `(?=\\s*${b})` : ''}`, 'i').exec(testo);
    if (m) { const da = m.index + m[1].length + (cosa ? m[2].length : 0); return { da, a: da + (cosa ? m[3].length : 0) }; }
  }
  if (cosa) { const m = new RegExp(cosa, 'i').exec(testo); if (m) return { da: m.index, a: m.index + m[0].length }; }
  return null;
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
  const punti = rfSmPunti(m), numeri = punti.filter(p => p.numero), altri = punti.filter(p => !p.numero);
  const daFare = (l) => l.filter(p => !sm.fatti[p.k]).length;
  const quando = m.dettato_il ? new Date(m.dettato_il).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const punto = (p) => {
    const fatto = sm.fatti[p.k];
    const frase = `${p.prima ? `…${rfEsc(p.prima)} ` : ''}<mark>${p.t ? rfEsc(p.t) : '∅'}</mark>${p.dopo ? ` ${rfEsc(p.dopo)}…` : ''}`;
    if (fatto) return `<div class="sm-p fatto"><div class="sm-p-frase" onclick="rfSmMostra(${p.k})">✓ ${fatto === 'cambiato' ? `Messo «${rfEsc(p.mac)}»` : `Lasciato «${rfEsc(p.t || '—')}»`} · <a onclick="event.stopPropagation();rfSmRiapri(${p.k})" style="color:var(--accent);cursor:pointer">riapri</a></div></div>`;
    const mac = p.t ? (p.mac ? `Il Mac ha sentito: <b>${rfEsc(p.mac)}</b>` : 'Il Mac qui non ha sentito niente') : `Il Mac ha sentito anche: <b>${rfEsc(p.mac)}</b>`;
    return `<div class="sm-p" id="sm-p-${p.k}">${p.numero ? '<span class="sm-num">Numero</span>' : ''}<div class="sm-p-frase" onclick="rfSmMostra(${p.k})" title="Mostralo nella lettera">${frase}</div><div class="sm-p-mac">${mac}</div>
      <div class="sm-p-az">${p.s != null ? `<button class="btn sm" onclick="rfSmAscolta(${p.k})">${ICONS.play || ''} Ascolta</button>` : ''}${conf ? '' : `<button class="btn sm" onclick="rfSmFatto(${p.k}, 'tenuto')">Va bene così</button>${p.mac ? `<button class="btn sm" onclick="rfSmMetti(${p.k})">${p.t ? 'Metti' : 'Aggiungi'} «${rfEsc(p.mac.length > 24 ? p.mac.slice(0, 24) + '…' : p.mac)}»</button>` : ''}`}</div></div>`;
  };
  const restano = daFare(punti);
  const attesa = !!(m.dettato && m.dettato.in_attesa);
  const riassunto = attesa ? '<div class="sm-vuoto">⏳ <b>Controllo con l’audio in corso.</b> I punti da controllare arrivano fra un paio di minuti; intanto la lettera si può già leggere e correggere.</div>'
    : !punti.length ? '<div class="sm-vuoto">Niente da controllare: Dragon e il Mac hanno capito le stesse parole.</div>'
    : !restano ? '<div class="sm-vuoto">✓ Tutto controllato.</div>'
    : `<div class="caption" style="margin-bottom:6px">Dove Dragon e il Mac hanno capito cose diverse. Ascolta e scegli; se va bene, «Va bene così».</div>`;
  const note = (Array.isArray(m.note_segreteria) ? m.note_segreteria : []).filter(n => typeof n === 'string' && n.trim());
  const dest = (RF.campi && RF.campi.medico_destinatario) || '';
  return `<div class="sm-testa">
      <button class="btn sm ghost" onclick="go('#/reports')">${ICONS.arrowL || '←'} Referti</button>
      <div><h2>${rfEsc(m.paziente || 'Paziente non indicato')}</h2><div class="sm-chi">${rfEsc([m.nascita, m.medico ? `lettera di ${m.medico}` : 'lettera', quando ? `dettata il ${quando}` : ''].filter(Boolean).join(' · '))}</div></div>
      <div class="sm-dx">${conf ? '<span class="badge success">Confermata</span>' : `<span class="sm-salvato" id="sm-salvato">${sm.salvato ? 'Salvato' : 'Salvo…'}</span>`}<button class="btn sm ghost" onclick="rfSmCompleta()" title="La revisione con tutti i passi, com'era prima">Revisione completa</button></div>
    </div>
    <div class="sm-grid">
      <div class="sm-carta">
        <div class="sm-a"><span>A:</span><input id="sm-dest" value="${rfEsc(dest)}" placeholder="Destinatario (Dr. med. …)" ${conf ? 'readonly' : ''} oninput="rfSmDest(this.value)" aria-label="Destinatario"></div>
        <div class="sm-a"><span>Copia:</span><input id="sm-cc" value="${rfEsc((RF.campi && RF.campi.copia_conoscenza) || '')}" placeholder="Copia per conoscenza (Dr. med. …; Dr. med. …)" ${conf ? 'readonly' : ''} oninput="rfSmCc(this.value)" aria-label="Copia per conoscenza" title="Uno o più medici, separati da «;»: nel Word escono sotto «Copia per conoscenza:» col loro indirizzo della rubrica"></div>
        <div id="sm-testo" lang="it" spellcheck="true" role="textbox" aria-multiline="true" contenteditable="${conf ? 'false' : 'plaintext-only'}" oninput="rfSmScrive(this)" aria-label="Testo della lettera">${rfEsc(sm.testo)}</div>
      </div>
      <div class="sm-lato">
        <div class="sm-box"><div class="sm-audio"><button class="btn sm" id="rv-play" onclick="rvToggle()">${ICONS.play || ''} Play</button><div class="sm-barra" onclick="rfSmBarra(event, this)"><div id="rv-ph" style="left:0"></div></div><span class="sm-tempo"><span id="rv-t">0:00</span> / ${rfEsc(RV_AUDIO.label || '')}</span></div>${typeof rfPedHtml === 'function' ? `<div class="rf-ped-riga" style="margin-top:8px">${rfPedHtml()}</div>` : ''}</div>
        <div class="sm-box"><h3>Da controllare${restano ? ` · ${restano}` : ''}</h3>${riassunto}
          ${numeri.map(punto).join('')}
          ${altri.length ? (numeri.length ? `<details class="sm-altri" ${daFare(numeri) ? '' : 'open'}><summary>Altre parole (${daFare(altri)} da guardare)</summary>${altri.map(punto).join('')}</details>` : altri.map(punto).join('')) : ''}
        </div>
        ${note.length ? `<div class="sm-box"><h3>Note del medico per te</h3><ul class="sm-note" style="margin:6px 0 0;padding-left:18px">${note.map(n => `<li>${rfEsc(n)}</li>`).join('')}</ul></div>` : ''}
        <div class="sm-box sm-fine">
          <button class="btn" onclick="rfSmWord()">${ICONS.file || ''} Scarica Word</button>
          ${conf ? `<button class="btn primary" onclick="rfEmailPrepara('${rfJs(id)}')">${ICONS.mail || ''} Prepara e-mail</button>` : `<button class="btn primary" onclick="rfSmConferma()">${ICONS.check || ''} Conferma la lettera</button>`}
          <div class="sm-link"><a onclick="rfAllegati()">Allegati</a>${conf ? '' : `<a onclick="rfEmailPrepara('${rfJs(id)}')">Prepara e-mail</a>`}</div>
        </div>
      </div>
    </div>`;
}

// Dopo ogni disegno: altezza del foglio, e il cursore torna dov'era se si stava scrivendo.
function rfSmDopo(cursore) {
  const el = document.getElementById('sm-testo'); if (!el) return;
  rfSmAttendi();
  if (typeof rfFmtDopoDisegno === 'function') rfFmtDopoDisegno();      // grassetto, corsivo, sottolineato (20.10.2026)
  if (cursore) { try { el.focus({ preventScroll: true }); rfSmSeleziona(el, cursore[0], cursore[1]); } catch (_) { /* niente */ } }
  if (typeof rvTick === 'function') rvTick();
}
// La lettera del foglio è in revisione da subito (19.10.2026); il controllo con l'audio arriva dalla catena dopo un
// paio di minuti. Finché non c'è, la pagina chiede ogni 20 secondi; quando arriva aggiunge i punti — la lettera non si tocca.
function rfSmAttendi() {
  const m = RF.meta || {}, id = RF.loaded;
  if (!(m.dettato && m.dettato.in_attesa) || RF.smAttesa === id) return;
  RF.smAttesa = id;
  const giro = async () => {
    if (RF.loaded !== id || state.route !== 'review') { RF.smAttesa = null; return; }
    try {
      const r = await fetch(`/api/prototipo/referti/${id}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (r.ok && j.dettato && !j.dettato.in_attesa && RF.loaded === id) {
        Object.assign(RF.meta, { dettato: j.dettato, note_segreteria: j.note_segreteria, livello_verifica: j.livello_verifica, catena_leggera: j.catena_leggera, richiamo_proposto: j.richiamo_proposto });
        if (j.audio && j.audio.dur) { RV_AUDIO.dur = j.audio.dur; RV_AUDIO.label = j.audio.label; }
        RF.smAttesa = null; rfSmRidisegna();
        const n = rfSmPunti(RF.meta).length;
        toast(n ? `Controllo con l’audio arrivato: ${n === 1 ? 'un punto' : `${n} punti`} da guardare` : 'Controllo con l’audio arrivato: niente da controllare');
        return;
      }
    } catch (_) { /* si riprova */ }
    setTimeout(giro, 20000);
  };
  setTimeout(giro, 20000);
}
// Il foglio è un testo modificabile (dal 20.10.2026, per mostrare grassetto e corsivo; prima una casella di testo):
// il suo valore e la selezione si leggono e si mettono per posizione nel testo.
function rfSmValore(el) { return rfFmtLeggi({ parti: [el] }).testo; }
function rfSmSeleziona(el, da, a) { return rfFmtSeleziona({ root: el, parti: [el] }, da, a); }
function rfSmCursore(el) { const f = { root: el, parti: [el] }; return rfFmtSelezione(f, rfFmtLeggi(f)); }
function rfSmScrive(el) { RF.sm.testo = rfSmValore(el); rfSmProgramma(); }
function rfSmDest(v) { RF.campi = RF.campi || {}; RF.campi.medico_destinatario = v; RF.sm.campiCambiati = true; rfSmProgramma(); }
// La copia per conoscenza (20.10.2026, dallo studio: «non viene salvata»): anche qui, salvata come il destinatario.
function rfSmCc(v) { RF.campi = RF.campi || {}; RF.campi.copia_conoscenza = v; RF.sm.campiCambiati = true; rfSmProgramma(); }
function rfSmBarra(e, el) { const r = el.getBoundingClientRect(); rvSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (RV_AUDIO.dur || 0), true); }

// Mostra un punto nella lettera: lo seleziona e porta la pagina lì.
function rfSmMostra(k) {
  const p = rfSmPunti(RF.meta || {}).find(x => x.k === k), el = document.getElementById('sm-testo'); if (!p || !el) return null;
  const dove = rfSmTrova(rfSmValore(el), p);
  if (!dove) { toast('Questo punto nella lettera non c’è più: è già stato corretto'); return null; }
  try { el.focus({ preventScroll: true }); } catch (_) { /* niente */ }
  const r = rfSmSeleziona(el, dove.da, dove.a);
  if (r) { const q = r.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, q.top + window.scrollY - window.innerHeight / 3), behavior: 'smooth' }); }
  return dove;
}
function rfSmAscolta(k) {
  const p = rfSmPunti(RF.meta || {}).find(x => x.k === k); if (!p || p.s == null) return;
  RF.sm.ascoltati.add(k); rfSmMostra(k);
  rvPlay(Math.max(0, p.s - 1.5), p.s + 3);
}
function rfSmFatto(k, come) { RF.sm.fatti[k] = come; rfSmProgramma(); rfSmRidisegna(); }
function rfSmRiapri(k) { delete RF.sm.fatti[k]; rfSmProgramma(); rfSmRidisegna(); }
function rfSmMetti(k) {
  const p = rfSmPunti(RF.meta || {}).find(x => x.k === k), el = document.getElementById('sm-testo'); if (!p || !el || !p.mac) return;
  const valore = rfSmValore(el), dove = rfSmTrova(valore, p);
  if (!dove) { toast('Non ritrovo il punto nella lettera: correggilo a mano'); return; }
  let prima = valore.slice(0, dove.da), dopo = valore.slice(dove.a);
  // «toracico.» + «oggi.» → «toracico oggi.»: la parola entra prima del punto, se il Mac ce l'ha dopo
  const punto = !p.t && /[.,;:!?]$/.exec(prima.trimEnd());
  if (punto && p.mac.endsWith(punto[0])) { prima = prima.trimEnd().slice(0, -1); dove.da = prima.length; }
  const nuovo = p.t ? p.mac : `${/\s$/.test(prima) ? '' : ' '}${p.mac}${/^\s|^$/.test(dopo) ? '' : ' '}`;
  // si scrive dentro il foglio come farebbe la persona: la formattazione attorno resta, e ⌘Z lo annulla
  el.focus({ preventScroll: true }); rfSmSeleziona(el, prima.length, valore.length - dopo.length);
  if (!document.execCommand('insertText', false, nuovo)) { el.textContent = prima + nuovo + dopo; }
  RF.sm.testo = rfSmValore(el);
  RF.sm.fatti[k] = 'cambiato'; rfSmProgramma(); rfSmRidisegna();
  try { rfSmSeleziona(el, dove.da, dove.da + nuovo.length); } catch (_) { /* niente */ }
}
// Ridisegna solo la colonna di destra (il foglio non si ricrea: si perderebbe il cursore).
function rfSmRidisegna() {
  const vecchia = document.querySelector('.sm-lato'); if (!vecchia) { render(); return; }
  const tmp = document.createElement('div'); tmp.innerHTML = rfSmHtml();
  const nuova = tmp.querySelector('.sm-lato'); if (nuova) vecchia.replaceWith(nuova);
  if (typeof rvTick === 'function') rvTick();
}

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
      body: JSON.stringify({ testo: sm.testo, base: RF.base, stato, campi: sm.campiCambiati ? { medico_destinatario: (RF.campi || {}).medico_destinatario || '', ...((RF.campi || {}).copia_conoscenza !== undefined ? { copia_conoscenza: RF.campi.copia_conoscenza } : {}) } : undefined }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.errore === 'cambiata') {
      openModal('La lettera è cambiata', '<p>Nel frattempo la lettera è stata salvata in un\'altra versione (da un\'altra finestra o da un altro computer). Per non sovrascriverla ricarico quella salvata: le ultime modifiche di questa pagina non sono state salvate.</p>', '<button class="btn primary" data-close>Va bene</button>');
      RF.sm = null; RF.loaded = null; render(); return false;
    }
    if (!r.ok) throw new Error(String(r.status));
    if (j.impronta) RF.base = j.impronta;
    sm.campiCambiati = false; sm.salvato = true;
    const e = document.getElementById('sm-salvato'); if (e) e.textContent = 'Salvato';
    return true;
  } catch (_) { const e = document.getElementById('sm-salvato'); if (e) e.textContent = 'Non salvato: riprovo'; sm.timer = setTimeout(() => void rfSmSalva(), 5000); return false; }
}
async function rfSmWord() { if (RF.meta && RF.meta.stato === 'bozza' && !(await rfSmSalva())) { toast('Prima salvo la lettera: riprova fra un attimo'); return; } void rfWord(RF.loaded); }
function rfSmCompleta() {
  void rfSmSalva().then(() => { RF.revCompleta = RF.revCompleta || {}; RF.revCompleta[RF.sm ? RF.sm.id : RF.loaded] = true; RF.sm = null; RF.loaded = null; render(); });
}
function rfSmSemplice() { const id = RF.loaded; RF.revCompleta = RF.revCompleta || {}; delete RF.revCompleta[id]; RF.sm = null; RF.loaded = null; render(); }

// Conferma: se restano numeri da controllare lo dice e chiede di prenderne atto (lo stesso cancello della revisione completa).
async function rfSmConferma() {
  const m = RF.meta || {}, sm = RF.sm, id = sm.id;
  if (!(await rfSmSalva())) { toast('La lettera non si è salvata: riprova'); return; }
  const punti = rfSmPunti(m), numeri = punti.filter(p => p.numero), aperti = numeri.filter(p => !sm.fatti[p.k]);
  const parziale = m.livello_verifica && m.livello_verifica !== 'pieno';
  const attesa = !!(m.dettato && m.dettato.in_attesa);
  const presa = aperti.length || parziale || attesa;
  const altriAperti = punti.filter(p => !p.numero && !sm.fatti[p.k]).length;
  openModal('Conferma la lettera', `<p>La lettera viene chiusa: da qui si scarica il Word e si prepara la mail.</p>
    ${altriAperti ? `<p class="caption">${altriAperti === 1 ? 'Una parola' : `${altriAperti} parole`} dove Dragon e il Mac hanno capito diverso ${altriAperti === 1 ? 'non è stata guardata' : 'non sono state guardate'}: resta com'è nella lettera.</p>` : ''}
    ${m.richiamo_proposto && !m.richiamo ? `<label class="row mt-16" style="gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="sm-richiamo" checked style="margin-top:3px"><span>Crea anche il <b>richiamo fra ${m.richiamo_proposto.mesi} mesi</b> (dal dettato)</span></label>` : ''}
    ${presa ? `<label class="row mt-16" style="gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="sm-presa" style="margin-top:3px"><span>${aperti.length ? `<b>${aperti.length === 1 ? 'Un numero' : `${aperti.length} numeri`} non ancora controllat${aperti.length === 1 ? 'o' : 'i'}</b>: confermo lo stesso.` : ''}${parziale ? ' La trascrizione di controllo del Mac è parziale: confermo lo stesso.' : ''}${attesa ? ' <b>Il controllo con l’audio non è ancora arrivato</b>: confermo lo stesso.' : ''}</span></label>` : ''}`,
    `<button class="btn" data-close>Continua a correggere</button><button class="btn primary" id="sm-conferma">Conferma</button>`);
  document.getElementById('sm-conferma').onclick = async () => {
    const pa = document.getElementById('sm-presa');
    if (presa && !(pa && pa.checked)) { toast('Spunta la casella per confermare con numeri non controllati'); return; }
    const b = document.getElementById('sm-conferma'); b.disabled = true; b.textContent = 'Confermo…';
    try {
      const fatti = punti.filter(p => sm.fatti[p.k]);
      const r = await fetch(`/api/prototipo/referti/${id}/conferma`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        testo: sm.testo, campi: RF.campi || {}, presa_atto: !!(pa && pa.checked), flag_totali: punti.length,
        flag_accettati_senza_riascolto: fatti.filter(p => !sm.ascoltati.has(p.k)).length,
        flag_critici_totali: numeri.length, flag_critici_chiusi: numeri.length - aperti.length,
        tempo_revisione_s: Math.round((Date.now() - sm.inizio) / 1000), revisione_iniziata_at: new Date(sm.inizio).toISOString(),
      }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.errore || String(r.status)); }
      let nota = '';
      const chk = document.getElementById('sm-richiamo');
      if (chk && chk.checked) {
        try {
          const rr = await fetch(`/api/prototipo/referti/${id}/richiamo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesi: m.richiamo_proposto.mesi }) });
          nota = rr.ok ? `<p>Richiamo creato fra ${m.richiamo_proposto.mesi} mesi.</p>` : '<p class="caption">Il richiamo non si è creato: fallo dalla scheda del paziente.</p>';
        } catch (_) { nota = '<p class="caption">Il richiamo non si è creato: piattaforma non raggiungibile.</p>'; }
      }
      closeModal();
      openModal('Lettera confermata', `<p>Fatto. Ora puoi scaricare il Word o preparare la mail per il medico.</p>${nota}`,
        `<button class="btn" onclick="rfWord('${rfJs(id)}')">${ICONS.file || ''} Scarica Word</button><button class="btn" onclick="rfEmailPrepara('${rfJs(id)}')">${ICONS.mail || ''} Prepara e-mail</button><button class="btn primary" data-close onclick="RF.sm=null;RF.loaded=null;go('#/reports');void rfCaricaDati()">Torna ai referti</button>`);
    } catch (e) {
      b.disabled = false; b.textContent = 'Conferma';
      toast(e.message === 'critici' ? 'Serve la spunta per confermare' : e.message === 'non_bozza' ? 'La lettera è già confermata' : 'Conferma non riuscita');
    }
  };
}

// Dentro la pagina della revisione: se vale, la semplice al posto di quella completa; nella completa di una lettera
// dettata sul foglio, un tasto per tornare alla semplice.
(function () {
  const completa = PAGES.review;
  PAGES.review = () => {
    const id = state.params && state.params.id;
    if (RF.live && id && RF.loaded === id && rfSmVale(RF.meta)) {
      const a = document.activeElement, cursore = a && a.id === 'sm-testo' ? rfSmCursore(a) : null;
      const html = rfSmHtml();
      setTimeout(() => rfSmDopo(cursore), 0);
      return html;
    }
    let html = completa();
    const m = RF.meta || {};
    if (RF.live && id && RF.loaded === id && m.dettato && m.dettato.foglio && (RF.revCompleta || {})[id]) {
      html = html.replace('<div class="rv-top-r">', `<div class="rv-top-r"><button class="btn sm primary" onclick="rfSmSemplice()" title="La lettera, l'audio e solo i punti da controllare">Revisione semplice</button>`);
    }
    return html;
  };
  // uscendo dalla pagina col testo non ancora salvato, si salva subito
  window.addEventListener('pagehide', () => { if (RF.sm && !RF.sm.salvato) void rfSmSalva(); });
})();
