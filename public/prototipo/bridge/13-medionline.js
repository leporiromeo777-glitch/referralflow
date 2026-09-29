/* ---------- MediOnline via CalDAV: fissare un appuntamento (23.9.2026) ----------
   La scrittura è SPENTA finché sul server non si accende (CALDAV_SCRITTURA=
   attiva nel file delle credenziali, con un utente MediOnline dedicato e
   un'agenda di prova): fino ad allora qui si vedono solo calendari,
   controllo del robot e recupero del passato. Si scrive SOLO su gesto di una persona, dopo
   un'anteprima e una conferma; mai in automatico, mai in serie. L'agenda che
   si vede resta quella del robot (porta colore e stato): l'appuntamento
   fissato da qui ci entra al giro successivo del robot. Da qui si annullano
   solo gli appuntamenti nati qui. Server: /api/prototipo/medionline. */

RF.mol = RF.mol || { dati: null, errore: null, carico: false, controllo: null, lavoro: '', bozza: null, erroreModale: '' };

async function rfMolCarica() {
  RF.mol.carico = true;
  try {
    const r = await fetch('/api/prototipo/medionline', { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { RF.mol.errore = j.errore || `La piattaforma ha risposto ${r.status}.`; RF.mol.dati = null; }
    else { RF.mol.dati = j; RF.mol.errore = null; }
  } catch (e) { RF.mol.errore = 'La piattaforma non risponde.'; }
  RF.mol.carico = false;
  render();
}

async function rfMolPost(corpo) {
  const r = await fetch('/api/prototipo/medionline', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errore === 'non_permesso' ? 'Il tuo ruolo non può farlo.' : (j.errore || `Errore ${r.status}`));
  return j;
}

function rfMolScrivibili() {
  const d = RF.mol.dati;
  return d && d.configurato ? (d.calendari || []).filter(c => c.scrivibile) : [];
}
function rfMolPuo() { const d = RF.mol.dati; return !!(d && d.puoScrivere && rfMolScrivibili().length); }
function rfMolNomeCal(c) { return c.medico || c.nome; }

const rfMolData = (iso) => new Date(iso).toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });
const rfMolOra = (iso) => new Date(iso).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
function rfMolTitoloPaz(p) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.dobIso || '');
  return `${p.last} ${p.first}`.trim() + (d ? ` (${d[3]}.${d[2]}.${d[1]})` : '');
}
function rfMolEtPaz(p) { return `${p.last} ${p.first}${p.dob ? ' · ' + p.dob : ''}`; }

/* ---------- finestra: modulo → anteprima → scrittura ---------- */
function rfMolApri(pid) {
  if (!rfMolPuo()) { toast('Fissare in MediOnline non è disponibile per te o non è configurato.'); return; }
  const paz = pid && P[pid] ? P[pid] : null;
  const cal = rfMolScrivibili();
  RF.mol.bozza = RF.mol.bozza && !pid ? RF.mol.bozza : {
    calendario_id: cal.length === 1 ? cal[0].id : '',
    patient_id: paz ? paz.id : '',
    titolo: paz ? rfMolTitoloPaz(paz) : '',
    data: state.agendaGiorno || rfOggi(), ora: '', durata: 30, note: '',
  };
  RF.mol.erroreModale = '';
  rfMolModulo();
}

function rfMolModulo() {
  const b = RF.mol.bozza;
  const cal = rfMolScrivibili();
  const pz = PATIENTS.filter(p => rfUuid(p.id)).sort((x, y) => rfMolEtPaz(x).localeCompare(rfMolEtPaz(y)));
  const scelto = b.patient_id && P[b.patient_id] ? rfMolEtPaz(P[b.patient_id]) : '';
  const corpo = `
    ${RF.mol.erroreModale ? `<div class="rf-manc mb-16">${rfEsc(RF.mol.erroreModale)}</div>` : ''}
    <div class="grid grid-2">
      <div class="field"><label>Agenda in MediOnline</label><select class="input" id="rf-mol-cal"><option value="">Scegli…</option>${cal.map(c => `<option value="${rfEsc(c.id)}" ${c.id === b.calendario_id ? 'selected' : ''}>${rfEsc(rfMolNomeCal(c))}</option>`).join('')}</select></div>
      <div class="field"><label>Paziente in cartella <span class="caption">(facoltativo)</span></label><input class="input" id="rf-mol-paz" list="rf-mol-pazl" value="${rfEsc(scelto)}" placeholder="Cerca per cognome" autocomplete="off"><datalist id="rf-mol-pazl">${pz.map(p => `<option value="${rfEsc(rfMolEtPaz(p))}"></option>`).join('')}</datalist></div>
      <div class="field" style="grid-column:1/-1"><label>Titolo in agenda</label><input class="input" id="rf-mol-tit" value="${rfEsc(b.titolo)}" maxlength="120" placeholder="Cognome Nome (gg.mm.aaaa)"><div class="caption mt-4">Come in MediOnline: cognome, nome e data di nascita. Così il robot lo riconosce e lo lega alla cartella.</div></div>
      <div class="field"><label>Giorno</label><input class="input" type="date" id="rf-mol-data" value="${rfEsc(b.data)}"></div>
      <div class="field"><label>Ora</label><input class="input" type="time" id="rf-mol-ora" value="${rfEsc(b.ora)}" step="300"></div>
      <div class="field"><label>Durata</label><select class="input" id="rf-mol-dur">${[10, 15, 20, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${+b.durata === n ? 'selected' : ''}>${n} minuti</option>`).join('')}</select></div>
      <div class="field"><label>Nota <span class="caption">(facoltativa)</span></label><input class="input" id="rf-mol-note" value="${rfEsc(b.note)}" maxlength="500"></div>
    </div>`;
  openModal('Fissa un appuntamento in MediOnline', corpo,
    `<button class="btn" data-close>Annulla</button><button class="btn primary" onclick="rfMolAnteprima()">Controlla</button>`);
  const inp = document.getElementById('rf-mol-paz');
  if (inp) inp.addEventListener('change', () => {
    const p = pz.find(x => rfMolEtPaz(x) === inp.value.trim());
    const tit = document.getElementById('rf-mol-tit');
    RF.mol.bozza.patient_id = p ? p.id : '';
    if (p && tit) tit.value = rfMolTitoloPaz(p);
  });
}

function rfMolLeggi() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  const b = RF.mol.bozza;
  b.calendario_id = v('rf-mol-cal'); b.titolo = v('rf-mol-tit').trim(); b.data = v('rf-mol-data');
  b.ora = v('rf-mol-ora'); b.durata = +v('rf-mol-dur') || 30; b.note = v('rf-mol-note').trim();
  const paz = v('rf-mol-paz').trim();
  if (!paz) b.patient_id = '';
  return b;
}

function rfMolAnteprima() {
  const b = rfMolLeggi();
  const manca = !b.calendario_id ? "l'agenda" : !b.titolo ? 'il titolo' : !b.data ? 'il giorno' : !b.ora ? "l'ora" : '';
  if (manca) { RF.mol.erroreModale = `Manca ${manca}.`; return rfMolModulo(); }
  RF.mol.erroreModale = '';
  const cal = rfMolScrivibili().find(c => c.id === b.calendario_id);
  const [h, m] = b.ora.split(':').map(Number); const t = h * 60 + m + b.durata;
  const fine = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const giorno = new Date(`${b.data}T12:00:00`).toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const corpo = `
    <div class="rf-mol-ante">
      <div class="caption">Sto per scrivere nell'agenda vera di MediOnline:</div>
      <div class="rf-ap mt-8">
        <div class="rf-ap-riga"><span class="e">Agenda</span><span class="v"><b>${rfEsc(rfMolNomeCal(cal || {}))}</b></span></div>
        <div class="rf-ap-riga"><span class="e">Quando</span><span class="v">${rfEsc(giorno)} · <b>${rfEsc(b.ora)} – ${fine}</b></span></div>
        <div class="rf-ap-riga"><span class="e">Titolo</span><span class="v">${rfEsc(b.titolo)}</span></div>
        ${b.note ? `<div class="rf-ap-riga"><span class="e">Nota</span><span class="v">${rfEsc(b.note)}</span></div>` : ''}
      </div>
      <ul class="caption mt-8 rf-mol-lista">
        <li>Prima di scrivere controllo che in MediOnline quell'orario sia libero.</li>
        <li>In MediOnline l'appuntamento arriva <b>senza colore</b>: se serve, lo colora chi lo apre lì.</li>
        <li>Nell'agenda di ReferralFlow compare al prossimo giro del robot, entro un quarto d'ora.</li>
        <li>Risulterà creato con l'account MediOnline dello studio; in ReferralFlow resta scritto chi l'ha fissato.</li>
      </ul>
    </div>`;
  openModal('Confermi?', corpo,
    `<button class="btn" onclick="rfMolModulo()">Indietro</button><button class="btn primary" id="rf-mol-vai" onclick="rfMolScrivi()">Scrivi in MediOnline</button>`);
}

async function rfMolScrivi() {
  const b = RF.mol.bozza;
  const bt = document.getElementById('rf-mol-vai');
  if (bt) { bt.disabled = true; bt.textContent = 'Scrivo…'; }
  try {
    await rfMolPost({ azione: 'scrivi', conferma: true, calendario_id: b.calendario_id, patient_id: b.patient_id || null, titolo: b.titolo, data: b.data, ora: b.ora, durata: b.durata, note: b.note });
    RF.mol.bozza = null;
    closeModal();
    toast('Scritto in MediOnline. In agenda qui compare al prossimo giro del robot.');
    void rfMolCarica();
  } catch (e) {
    RF.mol.erroreModale = e.message;
    rfMolModulo();
  }
}

function rfMolAnnulla(id) {
  const s = ((RF.mol.dati && RF.mol.dati.scritture) || []).find(x => x.id === id);
  if (!s) return;
  openModal('Togliere da MediOnline?', `<div class="caption">Tolgo dall'agenda vera di MediOnline l'appuntamento di <b>${rfEsc(rfMolData(s.inizio))}</b> alle <b>${rfMolOra(s.inizio)}</b> (${rfEsc(s.calendario)}): «${rfEsc(s.titolo)}».</div>`,
    `<button class="btn" data-close>No</button><button class="btn danger" id="rf-mol-togli">Togli da MediOnline</button>`);
  document.getElementById('rf-mol-togli').onclick = async () => {
    closeModal();
    try { const r = await rfMolPost({ azione: 'annulla', id }); toast(r.gia_tolto ? 'Era già stato tolto in MediOnline.' : 'Tolto da MediOnline.'); }
    catch (e) { toast(e.message); }
    void rfMolCarica();
  };
}

/* ---------- configurazione (amministrazione e tecnico) ---------- */
async function rfMolAzione(azione, conferma) {
  if (conferma && !window.confirm(conferma)) return;
  RF.mol.lavoro = azione; render();
  try {
    const r = await rfMolPost({ azione });
    if (azione === 'aggiorna') toast(`${r.calendari} calendari, ${r.abbinati} abbinati a un medico, ${r.scrivibili} scrivibili.`);
    if (azione === 'controllo') RF.mol.controllo = r;
    if (azione === 'recupera') { toast(`Recuperati ${r.totale} appuntamenti passati.`); RF.mol.recupero = r; }
  } catch (e) { toast(e.message); }
  RF.mol.lavoro = '';
  void rfMolCarica();
}
async function rfMolAbbina(calId, providerId) {
  try { await rfMolPost({ azione: 'abbina', calendario_id: calId, provider_id: providerId || null }); } catch (e) { toast(e.message); }
  void rfMolCarica();
}

function rfMolSezione() {
  const d = RF.mol.dati;
  if (RF.mol.errore) return `<div class="card mt-16"><div class="section-title">MediOnline</div><div class="caption">${rfEsc(RF.mol.errore)}</div></div>`;
  if (!d) return '';
  if (!d.configurato && !d.puoConfigurare) return '';
  const adesso = Date.now();
  const future = (d.scritture || []).filter(s => new Date(s.fine).getTime() >= adesso);
  const riga = (s) => `<div class="rf-mol-riga${s.annullato_at ? ' tolto' : ''}"><span class="num">${rfEsc(new Date(s.inizio).toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Zurich' }))} ${rfMolOra(s.inizio)}</span><span class="t">${rfEsc(s.titolo)}</span><span class="caption">${rfEsc(s.calendario)}${s.da ? ` · da ${rfEsc(String(s.da).split('@')[0])}` : ''}</span>${s.annullato_at ? '<span class="caption">tolto</span>' : (d.puoScrivere ? `<button class="btn sm" onclick="rfMolAnnulla('${rfEsc(s.id)}')">Togli</button>` : '')}</div>`;
  let conf = '';
  if (d.puoConfigurare) {
    const lav = RF.mol.lavoro;
    const opz = (sel) => `<option value="">— nessun medico —</option>${(d.medici || []).map(m => `<option value="${rfEsc(m.id)}" ${m.id === sel ? 'selected' : ''}>${rfEsc(m.nome)}</option>`).join('')}`;
    const ctl = RF.mol.controllo;
    conf = `
      <div class="rf-mol-conf mt-16">
        <div class="row wrap" style="gap:8px"><b>Collegamento</b>${d.configurato ? '<span class="status"><i class="dot success"></i>configurato</span>' : '<span class="status"><i class="dot warning"></i>manca il file delle credenziali CalDAV sul server</span>'}</div>
        ${d.configurato ? `
        <div class="row wrap mt-8" style="gap:8px">
          <button class="btn sm" ${lav ? 'disabled' : ''} onclick="rfMolAzione('aggiorna')">${lav === 'aggiorna' ? 'Leggo…' : 'Aggiorna i calendari'}</button>
          <button class="btn sm" ${lav || !(d.calendari || []).some(c => c.provider_id) ? 'disabled' : ''} onclick="rfMolAzione('controllo')">${lav === 'controllo' ? 'Confronto…' : 'Controlla il robot'}</button>
          <button class="btn sm" ${lav || !(d.calendari || []).some(c => c.provider_id) ? 'disabled' : ''} onclick="rfMolAzione('recupera', 'Importo dal CalDAV gli appuntamenti PRIMA dell\\'inizio del robot, per i medici abbinati. Si può ripetere senza doppioni. Procedo?')">${lav === 'recupera' ? 'Recupero… (può durare qualche minuto)' : 'Recupera il passato'}</button>
        </div>
        ${(d.calendari || []).length ? `<div class="rf-mol-cal mt-8">${d.calendari.map(c => `<div class="rf-mol-riga"><span class="t">${rfEsc(c.nome)}</span><select class="input sm" onchange="rfMolAbbina('${rfEsc(c.id)}', this.value)">${opz(c.provider_id)}</select><span class="caption">${c.scrivibile ? 'lettura e scrittura' : 'sola lettura'}</span></div>`).join('')}</div>` : '<div class="caption mt-8">Nessun calendario letto: «Aggiorna i calendari».</div>'}
        ${ctl ? `<div class="mt-8"><b>Controllo del robot</b> <span class="caption">(${rfEsc(new Date(ctl.da).toLocaleDateString('it-CH'))} – ${rfEsc(new Date(ctl.a).toLocaleDateString('it-CH'))})</span>${ctl.medici.map(m => `<div class="rf-mol-riga"><span class="t">${rfEsc(m.medico)}</span><span class="caption">CalDAV ${m.caldav} · robot ${m.robot}</span><span class="caption">${m.differenze.length ? m.differenze.map(x => `${rfEsc(x.giorno.slice(8, 10))}.${rfEsc(x.giorno.slice(5, 7))}: ${x.caldav} contro ${x.robot}`).join(' · ') : 'uguali'}</span></div>`).join('')}</div>` : ''}
        ${RF.mol.recupero ? `<div class="mt-8 caption">Passato recuperato: ${RF.mol.recupero.medici.map(m => `${rfEsc(m.medico)} ${m.nuovi} nuovi su ${m.letti}`).join(' · ')}</div>` : ''}` : ''}
      </div>`;
  }
  return `
    <div class="card mt-16 rf-mol">
      <div class="row wrap" style="justify-content:space-between;gap:8px"><div class="section-title" style="margin:0">Fissati da ReferralFlow in MediOnline</div>${rfMolPuo() ? `<button class="btn primary sm" onclick="rfMolApri()">Fissa in MediOnline</button>` : ''}</div>
      ${d.configurato && d.scrittura !== 'attiva' ? '<div class="caption mt-8">La scrittura in MediOnline è spenta: si accende quando lo studio avrà un utente MediOnline dedicato e un&rsquo;agenda di prova. Intanto da qui si leggono i calendari, si controlla il robot e si recupera il passato.</div>' : ''}
      ${future.length ? `<div class="mt-8">${future.map(riga).join('')}</div>` : (d.scrittura === 'attiva' ? '<div class="caption mt-8">Nessun appuntamento fissato da qui nei prossimi giorni.</div>' : '')}
      ${conf}
    </div>`;
}

(function () { const st = document.createElement('style'); st.textContent = `
.rf-mol-riga { display:grid; grid-template-columns: auto minmax(0,1fr) auto auto; gap:10px; align-items:center; padding:7px 0; border-top:1px solid var(--border); font-size:13.5px; }
.rf-mol-riga:first-child { border-top:0; }
.rf-mol-riga .t { overflow-wrap:anywhere; }
.rf-mol-riga.tolto .t { text-decoration:line-through; color:var(--text-3); }
.rf-mol-cal .rf-mol-riga, .rf-mol-conf .rf-mol-riga { grid-template-columns: minmax(0,1fr) minmax(0,220px) auto; }
.rf-mol-conf { border-top:1px solid var(--border); padding-top:12px; }
.rf-mol-lista { margin:8px 0 0 18px; padding:0; display:flex; flex-direction:column; gap:3px; }
@media (max-width: 600px) { .rf-mol-riga, .rf-mol-cal .rf-mol-riga, .rf-mol-conf .rf-mol-riga { grid-template-columns: 1fr; gap:3px; } }
`; document.head.appendChild(st); })();

/* ---------- dove compare: agenda e scheda del paziente ---------- */
function rfMolTasto(pid) {
  return rfMolPuo() ? `<button class="btn" onclick="rfMolApri(${pid ? `'${rfEsc(pid)}'` : ''})">Fissa in MediOnline</button>` : '';
}
function rfMolCaricaSeServe() { if (RF.live && !RF.mol.dati && !RF.mol.errore && !RF.mol.carico) void rfMolCarica(); }

const rfAgendaPrimaMol = PAGES.agenda;
PAGES.agenda = () => {
  const html = rfAgendaPrimaMol();
  if (!RF.live) return html;
  rfMolCaricaSeServe();
  return html.replace('<div class="actions">', `<div class="actions">${rfTelefono() ? '' : rfMolTasto()}`) + rfMolSezione();
};

const rfPazientePrimaMol = PAGES.patient;
PAGES.patient = () => {
  const html = rfPazientePrimaMol();
  const id = state.params && state.params.id;
  if (!RF.live || !rfUuid(id)) return html;
  rfMolCaricaSeServe();
  return html.replace('<div class="actions">', `<div class="actions">${rfMolTasto(id)}`);
};
