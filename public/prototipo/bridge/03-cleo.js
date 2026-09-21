/* ---------- Domanda medica in generale (14.9.2026) ----------
   La domanda del medico resta sul Mac. Il modello LOCALE la riscrive come
   domanda di medicina generale — non pseudonimizzata: proprio senza nessun
   paziente — e la persona la approva prima che parta. Il codice della
   piattaforma la ricontrolla lato server: il modello propone, il codice
   decide. La risposta arriva staccata e non entra in cartella. */
async function rfDomandaMedica(q) {
  state.aiMessages.push({ html: `<div class="ai-msg user">${rfEsc(q)}</div>` });
  state.medica = { originale: q, generale: '', blocchi: [], avvisi: [], stato: 'riformulo' };
  render();
  try {
    const r = await fetch('/api/prototipo/domanda-medica', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'riformula', domanda: q }),
    });
    const j = await r.json().catch(() => ({}));
    if (j && j.non_medica) {
      state.medica = null; state.modoMedico = false;
      state.aiMessages.push({ html: `<div class="ai-msg ai">Questa non sembra una domanda di medicina: la giro a ${rfEsc(RF_AI_NOME)} come al solito.</div>` });
      render(); askAI(q); return;
    }
    if (!r.ok) {
      state.medica = null;
      state.aiMessages.push({ html: `<div class="ai-msg ai">${rfEsc(j.errore || 'Riformulazione non riuscita.')} <span class="caption">La domanda non è uscita da qui.</span></div>` });
      render(); return;
    }
    state.medica = { originale: q, generale: j.generale || '', blocchi: j.blocchi || [], avvisi: j.avvisi || [], stato: 'attesa' };
  } catch {
    state.medica = null;
    state.aiMessages.push({ html: `<div class="ai-msg ai">Piattaforma non raggiungibile. La domanda non è uscita da qui.</div>` });
  }
  render();
}
function rfMedicaModifica(t) {
  const m = state.medica; if (!m) return;
  m.generale = t;
  if (!(m.blocchi || []).length) return;
  // Si riaccende il tasto a mano: un render qui sposterebbe il cursore.
  m.blocchi = [];
  const box = document.querySelector('.rf-med');
  if (!box) return;
  const ok = box.querySelector('.azioni .btn.primary'); if (ok) ok.disabled = false;
  box.querySelectorAll('.segnale.blocco').forEach(e => e.remove());
  const dove = box.querySelector('.dove'); if (dove) dove.textContent = 'La domanda originale resta su questo Mac.';
}
function rfMedicaAnnulla() { state.medica = null; render(); }
async function rfMedicaInvia() {
  const m = state.medica; if (!m) return;
  const area = document.getElementById('rf-med-testo');
  const generale = (area ? area.value : m.generale).trim();
  if (!generale) return;
  state.medica = { ...m, generale, stato: 'invio' };
  render();
  try {
    const r = await fetch('/api/prototipo/domanda-medica', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'chiedi', domanda: m.originale, generale }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // «Non c'è ancora un modello adatto» non è un errore della domanda: la
      // riformulazione è buona, manca il destinatario. Si dice e si chiude.
      if (j.non_collegato) {
        state.medica = null;
        state.aiMessages.push({ html: `<div class="ai-msg ai"><b>La domanda è pronta, ma non parte.</b><br>${rfEsc(j.errore || '')}<div class="caption" style="margin-top:6px">Domanda riscritta: «${rfEsc(generale)}» — puoi copiarla e porla dove vuoi.</div></div>` });
        render(); return;
      }
      state.medica = { ...m, generale, stato: 'attesa', blocchi: j.blocchi || [{ tipo: 'errore', spiega: j.errore || 'non riuscita' }], avvisi: j.avvisi || [] };
      render(); return;
    }
    state.medica = null;
    state.aiMessages.push({ html: `<div class="ai-msg ai rf-gen"><span class="et">Risposta generale · non riferita a un paziente</span><div>${rfEsc(j.risposta || 'Nessuna risposta.').replace(/\n/g, '<br>')}</div><div class="srcs"><span class="src">domanda riscritta: ${rfEsc(generale)}</span><span class="src">${j.dove === 'locale' ? 'modello locale, su questo Mac' : rfEsc(j.dove || '')}</span></div><div class="caption" style="margin-top:6px">Conoscenza generale, non un parere sul tuo paziente: non viene salvata in cartella.</div></div>` });
  } catch {
    state.medica = { ...m, generale, stato: 'attesa', blocchi: [{ tipo: 'errore', spiega: 'piattaforma non raggiungibile' }] };
  }
  render();
}
/* ---------- «Con la cartella»: il pacchetto, e che cosa uscirebbe ---------- */
// Prima fetta della ricerca clinica esterna protetta. Il modello LOCALE legge
// la cartella intera e ne ricava il minimo indispensabile; un controllo cerca
// dentro quel testo gli identificatori VERI di quel paziente. Niente esce da
// questo Mac: il «fuori» non è ancora costruito, e si vede prima di farlo.
async function rfCartellaChiedi(q) {
  const pid = state.patientCtx;
  if (!pid) { state.cartellaCtx = { stato: 'pronto', errore: 'Scegli prima il paziente.' }; render(); return; }
  state.cartellaCtx = { stato: 'lavora', domanda: q, errore: null };
  render();
  try {
    const r = await fetch('/api/prototipo/contesto-clinico', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: pid, domanda: q }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { state.cartellaCtx = { stato: 'pronto', domanda: q, errore: j.errore || 'Non ha funzionato.' }; render(); return; }
    state.cartellaCtx = { stato: 'fatto', domanda: q, esito: j, errore: null };
    render();
  } catch { state.cartellaCtx = { stato: 'pronto', domanda: q, errore: 'La piattaforma non risponde.' }; render(); }
}
function rfCartellaChiudi() { state.cartellaCtx = null; render(); }
function rfCartellaPaziente(id) { state.patientCtx = id || null; render(); const i = document.getElementById('rf-aip-in'); if (i) i.focus(); }
/* La ricerca del paziente: tocca solo la lista, non ridisegna la pagina —
   a ogni lettera si perderebbe il cursore. Al massimo otto nomi: se non basta
   si scrive una lettera in più. */
function rfCartellaTrova(q) {
  const t = String(q ?? '').trim().toLowerCase();
  if (t.length < 2) return [];
  const tutti = (typeof PATIENTS !== 'undefined' ? PATIENTS : []);
  return tutti.filter(p => {
    const a = `${p.last ?? ''} ${p.first ?? ''}`.toLowerCase(), b = `${p.first ?? ''} ${p.last ?? ''}`.toLowerCase();
    return a.includes(t) || b.includes(t);
  }).slice(0, 8);
}
function rfCartellaCerca(q) {
  const box = document.getElementById('rf-cart-lista');
  if (!box) return;
  const t = String(q ?? '').trim();
  const trovati = rfCartellaTrova(t);
  box.innerHTML = trovati.length
    ? trovati.map(p => `<button type="button" class="rf-cart-v" onclick="rfCartellaPaziente('${rfEsc(p.id)}')">
        <b>${rfEsc(`${p.last ?? ''} ${p.first ?? ''}`.trim())}</b>${p.dob ? `<span>${rfEsc(p.dob)}</span>` : ''}</button>`).join('')
    : `<span class="caption">${t.length < 2 ? 'Scrivi almeno due lettere.' : 'Nessun paziente con questo nome.'}</span>`;
}
function rfCartellaPrimo() {
  const el = document.getElementById('rf-cart-cerca');
  const trovati = rfCartellaTrova(el ? el.value : '');
  if (trovati.length) rfCartellaPaziente(trovati[0].id);
}
/* Passi 5-7: esce il pacchetto, torna la ricerca, il modello locale la
   rilegge con la cartella davanti. Il testo che parte è quello nei due riquadri
   — il medico può averlo corretto — e la piattaforma lo ricontrolla lo stesso. */
async function rfCartellaManda() {
  const c = state.cartellaCtx; if (!c || !c.esito || !c.esito.ricerca_id) return;
  const ctx = document.getElementById('rf-cart-ctx'), dom = document.getElementById('rf-cart-dom');
  const corpo = {
    azione: 'manda', ricerca_id: c.esito.ricerca_id,
    contesto: ctx ? ctx.value : c.esito.contesto,
    domanda_generale: dom ? dom.value : c.esito.domanda_generale,
  };
  state.cartellaCtx = { ...c, stato: 'cerca', errore: null };
  render();
  try {
    const r = await fetch('/api/prototipo/contesto-clinico', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.errore) { state.cartellaCtx = { ...c, stato: 'fatto', erroreInvio: j.errore || 'Non ha funzionato.' }; render(); return; }
    state.cartellaCtx = { ...c, stato: 'risposta', ricerca: j, errore: null };
  } catch { state.cartellaCtx = { ...c, stato: 'fatto', erroreInvio: 'La piattaforma non risponde.' }; }
  render();
}
/* Passo 8: che cosa ne ha fatto il medico. Resta scritto accanto a tutto il
   resto, perché di una consulenza si deve poter dire mesi dopo com'è finita. */
async function rfCartellaConferma(scelta) {
  const c = state.cartellaCtx; if (!c || !c.ricerca) return;
  state.cartellaCtx = { ...c, conferma: scelta };
  render();
  try {
    await fetch('/api/prototipo/contesto-clinico', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'conferma', ricerca_id: c.ricerca.ricerca_id, conferma: scelta }),
    });
  } catch {}
}
const RF_SEZIONI = [
  ['sintesi', 'Sintesi'],
  ['evidenze', 'Evidenze trovate'],
  ['pertinenti', 'Per questo paziente'],
  ['attenzioni', 'Attenzioni'],
  ['mancanti', 'Informazioni mancanti'],
];
function rfCartellaRisposta(c, paz) {
  const j = c.ricerca || {}, sez = j.sezioni || {};
  const righe = RF_SEZIONI.filter(([k]) => (sez[k] || '').trim())
    .map(([k, titolo]) => `<div class="rf-cart-p"><b>${titolo}</b><div>${rfEsc(sez[k]).replace(/\n/g, '<br>')}</div></div>`).join('');
  const fonti = (j.fonti || []);
  const dubbie = (j.da_verificare || []);
  const cert = j.certezza ? `<span class="rf-cert ${rfEsc(j.certezza)}">certezza ${rfEsc(j.certezza)}</span>` : '';
  return `<div class="rf-med">
    <div class="t">${ICONS.book || ICONS.ai} La ricerca, riletta sulla cartella di ${rfEsc(paz.last)} ${cert}</div>
    ${righe || `<p class="caption" style="margin:0 0 8px">Il modello non ha risposto nella forma attesa.</p>`}
    <div class="rf-cart-p"><b>Fonti · citate a memoria, da verificare</b><div>${
      fonti.length ? fonti.map(f => rfEsc(f)).join('<br>') : 'Nessuna fonte sicura indicata.'
    }</div></div>
    <div class="segnali">
      ${dubbie.length ? `<div class="segnale blocco">${ICONS.alert}<span>Ci sono ${dubbie.length} fra link e codici: il modello esterno non naviga, quindi non li ha verificati. Non fidartene senza aprirli.</span></div>` : ''}
      <div class="segnale">${ICONS.info}<span>Supporto alla decisione: non cambia terapie, non fa diagnosi. Decide il medico.</span></div>
    </div>
    <div class="azioni">
      ${c.conferma
        ? `<span class="caption">Segnata come ${c.conferma === 'usata' ? 'usata' : 'scartata'}.</span>`
        : `<button class="btn primary" onclick="rfCartellaConferma('usata')">${ICONS.check} L'ho usata</button>
           <button class="btn" onclick="rfCartellaConferma('scartata')">Non mi serve</button>`}
      <button class="btn" onclick="rfCartellaChiudi()">Chiudi</button>
      <span class="dove">Sono usciti ${(j.uscito && j.uscito.contesto) || 0}+${(j.uscito && j.uscito.domanda) || 0} caratteri verso ${rfEsc(j.dove || '')} · ${rfEsc(j.modello_esterno || '')} in ${(((j.ms_esterno || 0)) / 1000).toFixed(1)} s, riletti qui da ${rfEsc(j.modello_locale || '')} in ${(((j.ms_finale || 0)) / 1000).toFixed(1)} s. La cartella non è uscita.</span>
    </div>
  </div>`;
}
function rfCartellaRiquadro() {
  if (!state.modoCartella && !state.cartellaCtx) return '';
  const c = state.cartellaCtx;
  const paz = state.patientCtx && P[state.patientCtx] ? P[state.patientCtx] : null;
  // Senza paziente non si può fare niente: si sceglie qui.
  if (!paz) {
    // Si cerca scrivendo: con qualche migliaio di pazienti un elenco a tendina
    // non si scorre. La lista si aggiorna da sola senza ridisegnare la pagina,
    // altrimenti a ogni lettera si perderebbe il cursore.
    return `<div class="rf-med"><div class="t">${ICONS.patients || ICONS.file} Quale paziente</div>
      <p class="caption" style="margin:0 0 8px">La domanda parte dalla sua cartella. La cartella resta su questo Mac.</p>
      <input class="input" id="rf-cart-cerca" placeholder="Cerca per cognome o nome…" autocomplete="off"
        oninput="rfCartellaCerca(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();rfCartellaPrimo();}">
      <div class="rf-cart-lista" id="rf-cart-lista"><span class="caption">Scrivi almeno due lettere.</span></div></div>`;
  }
  if (c && c.stato === 'lavora') {
    return `<div class="rf-med"><div class="t">${ICONS.activity} Leggo la cartella di ${rfEsc(paz.last)} e preparo il minimo indispensabile</div>
      <p class="caption" style="margin:0">Lo fa il modello su questo Mac. Su una cartella lunga ci mette una ventina di secondi.</p></div>`;
  }
  if (c && c.errore) {
    return `<div class="rf-med"><div class="t">${ICONS.alert} Non ha funzionato</div>
      <p class="caption" style="margin:0 0 8px">${rfEsc(c.errore)}</p>
      <div class="azioni"><button class="btn" onclick="rfCartellaChiudi()">Chiudi</button></div></div>`;
  }
  if (c && c.stato === 'fatto') {
    const e = c.esito, k = e.controllo || {};
    const male = [
      ...(k.fughe || []).map(x => `nel testo compare «${x}»`),
      ...(k.deittici || []).map(x => `la domanda dice «${x}»: non vale per chiunque`),
      ...(k.etaEsatta ? [`c'è l'età esatta («${k.etaEsatta}»)`] : []),
      ...(k.vuoto ? ['il modello non ha prodotto un contesto utile'] : []),
    ];
    const puo = male.length === 0;
    return `<div class="rf-med">
      <div class="t">${ICONS.shield || ICONS.activity} Questo è ciò che uscirebbe${puo ? '' : ' — e così non esce'}</div>
      <p class="caption" style="margin:0 0 8px">Dalla cartella di ${rfEsc(paz.last)} (${e.cartella_caratteri} caratteri) il modello locale ha tenuto ${(e.contesto || '').length + (e.domanda_generale || '').length} caratteri. Puoi correggerli prima di mandarli: il controllo si rifà dall'altra parte.</p>
      <div class="rf-cart-p"><b>Contesto</b><textarea class="rf-cart-t" id="rf-cart-ctx" rows="4">${rfEsc(e.contesto || '')}</textarea></div>
      <div class="rf-cart-p"><b>Domanda</b><textarea class="rf-cart-t" id="rf-cart-dom" rows="3">${rfEsc(e.domanda_generale || '')}</textarea></div>
      <div class="segnali">
        ${c.erroreInvio ? `<div class="segnale blocco">${ICONS.alert}<span>${rfEsc(c.erroreInvio)}</span></div>` : ''}
        ${male.length
          ? male.map(x => `<div class="segnale blocco">${ICONS.alert}<span>${rfEsc(x)}</span></div>`).join('')
          : `<div class="segnale"><span>Nessun dato che identifichi ${rfEsc(paz.last)}, domanda valida per chiunque, nessuna età esatta.</span></div>`}
      </div>
      <div class="azioni">
        ${puo && e.collegato !== false
          ? `<button class="btn primary" onclick="rfCartellaManda()">${ICONS.send} Manda fuori la ricerca</button>`
          : ''}
        <button class="btn" onclick="rfCartellaChiudi()">Chiudi</button>
        <span class="dove">${rfEsc(e.modello || '')} · ${((e.ms || 0) / 1000).toFixed(1)} s · ${puo
          ? (e.collegato === false
            ? '<b>non è collegato nessun fornitore autorizzato</b>: il pacchetto è pronto e resta qui.'
            : 'esce solo quello che vedi qui sopra, verso Infomaniak · Ginevra.')
          : '<b>niente è uscito</b>: finché c\'è un segnale rosso non parte.'}</span>
      </div>
    </div>`;
  }
  if (c && c.stato === 'cerca') {
    return `<div class="rf-med"><div class="t">${ICONS.activity} Cerco fuori, poi rileggo con la cartella</div>
      <p class="caption" style="margin:0">Il pacchetto è uscito verso Infomaniak (Ginevra). Quando torna, il modello di questo Mac lo rimette accanto alla cartella di ${rfEsc(paz.last)}: è l'unico che conosce tutti e due i lati. Un minuto circa.</p></div>`;
  }
  if (c && c.stato === 'risposta') return rfCartellaRisposta(c, paz);
  return `<div class="rf-med"><div class="t">${ICONS.file || ICONS.patients} Con la cartella di ${rfEsc(paz.last)}</div>
    <p class="caption" style="margin:0">Scrivi la domanda come ti viene. Il modello locale legge la cartella intera e prepara il minimo che servirebbe a chi non conosce il paziente: lo vedi prima, e per ora non esce da qui.</p>
    <div class="azioni"><button class="btn sm ghost" onclick="rfCartellaPaziente('')">Cambia paziente</button></div></div>`;
}

function rfMedicaRiquadro() {
  const m = state.medica; if (!m) return '';
  if (m.stato === 'riformulo') return `<div class="rf-med"><div class="t">${ICONS.activity} Riscrivo la domanda in forma generale</div><p class="caption" style="margin:0">Lo fa il modello su questo Mac. La tua domanda non è uscita.</p></div>`;
  const bloccata = (m.blocchi || []).length > 0;
  const seg = (arr, cls) => (arr || []).map(x => `<div class="segnale ${cls}">${cls === 'blocco' ? ICONS.alert : ICONS.info}<span>${rfEsc(x.spiega)}</span></div>`).join('');
  return `<div class="rf-med">
    <div class="t">${ICONS.activity} Parte questa, non la tua — controllala</div>
    <textarea id="rf-med-testo" oninput="rfMedicaModifica(this.value)" ${m.stato === 'invio' ? 'disabled' : ''}>${rfEsc(m.generale)}</textarea>
    ${bloccata || (m.avvisi || []).length ? `<div class="segnali">${seg(m.blocchi, 'blocco')}${seg(m.avvisi, 'avviso')}</div>` : ''}
    <div class="azioni">
      <button class="btn primary" onclick="rfMedicaInvia()" ${m.stato === 'invio' || bloccata ? 'disabled' : ''}>${m.stato === 'invio' ? 'Chiedo…' : 'Chiedi così'}</button>
      <button class="btn" onclick="rfMedicaAnnulla()">Annulla</button>
      <span class="dove">${bloccata ? 'Correggi la riga qui sopra e il tasto si riaccende.' : 'La domanda originale resta su questo Mac.'}</span>
    </div>
  </div>`;
}

// Il segno accanto al nome: la stessa stella che la voce «Cleo» ha nel menu.
// Pulsa mentre Cleo lavora, così il nome dice se sta pensando.
function rfSegnoCleo() {
  const viva = state.aiState && state.aiState !== 'idle';
  const spiega = viva ? `${RF_AI_NOME} sta lavorando` : `${RF_AI_NOME} è pronta · modello locale su questo Mac`;
  return `<span class="rf-segno${viva ? ' viva' : ''}" title="${rfEsc(spiega)}">${ICONS.ai}</span>`;
}

const rfAiPageOrig = PAGES.ai;
PAGES.ai = () => {
  if (!RF.live) return rfAiPageOrig();
  const vuota = !state.aiMessages.length;
  return `<div class="rf-gpt">
      ${vuota ? '' : `<div class="rf-gpt-top"><span class="actions"><button class="btn sm" onclick="state.aiMessages=[];render()">${ICONS.x} Nuova conversazione</button></span></div>`}
      <div class="rf-gpt-scroll ${vuota ? 'vuota' : ''}" id="rf-aip-body">
        <div class="rf-gpt-col">${vuota ? rfAiBenvenuto() : `<div class="rf-gpt-thread">${state.aiMessages.map(m => m.html).join('')}</div>`}</div>
      </div>
      ${vuota ? '' : `<div class="rf-gpt-foot"><div class="rf-gpt-col">${rfMedicaRiquadro()}${rfCartellaRiquadro()}${rfAiCampo()}${rfAiNota()}</div></div>`}
    </div>`;
};
// Il titolo nella barra in alto: sulla pagina di Cleo porta la stessa lucina.
const rfPageTitleOrig = pageTitle;
pageTitle = function () {
  if (RF.live && state.route === 'ai') {
    return `${rfSegnoCleo()}${rfEsc(RF_AI_NOME)}<span class="rf-sotto">modello locale, su questo Mac</span>`;
  }
  return rfPageTitleOrig.apply(this, arguments);
};

// A tutto schermo solo sulla pagina di Cleo: il riquadro, la barra di sicurezza
// e il pannello laterale dell'AI se ne vanno finché si è lì.
// La larghezza delle colonne si calcola al disegno: se la finestra cambia,
// l'agenda va ridisegnata, altrimenti resta con le misure di prima.
(function () {
  let attesa = null;
  const grandi = ['agenda', 'sale'];   // l'altezza del calendario delle sale viene dalla finestra
  window.addEventListener('resize', () => {
    if (!grandi.includes(state.route)) return;
    clearTimeout(attesa);
    attesa = setTimeout(() => { if (grandi.includes(state.route)) render(); }, 180);
  });
})();

const rfRenderOrigAi = render;
render = function () {
  rfRenderOrigAi.apply(this, arguments);
  const app = document.getElementById('app');
  if (app) {
    app.classList.toggle('ai-mode', state.route === 'ai');
    app.classList.toggle('agenda-larga', state.route === 'agenda');
    app.classList.toggle('sale-larga', state.route === 'sale');
    // La visita si prende tutta la finestra: niente margini della pagina, la
    // barra laterale stretta a icone (senza toccare la scelta dell'utente:
    // uscendo dalla visita torna com'era) e il pannello AI globale spento,
    // perché Cleo è già lì dentro nella sua colonna.
    let inVisita = false;
    try { inVisita = state.route === 'visite' && !!RF.orch && !!rfVAperta(); } catch { inVisita = false; }
    app.classList.toggle('visita-larga', inVisita);
    if (inVisita) app.classList.add('sidebar-collapsed');
  }
};

