/* ---------- agenda vera: colonne per medico, giorno per giorno ---------- */
/* La pagina Agenda del prototipo aveva colonne finte (Dr.ssa Bianchi, Dr.
   Ferrari, Sala ECG). Qui le colonne sono i medici che hanno appuntamenti nel
   giorno scelto (nomi dal registro dei medici dell'agenda) più «Senza
   medico», dove il codice del luogo resta visibile. Giorno cambiabile
   nella finestra ±30 giorni caricata da /api/prototipo/dati. */
/* ---------- Agenda: che cosa vuol dire il colore del riquadro ----------
   Nell'agenda della Cassa dei Medici il colore è il tipo di appuntamento.
   Il catalogo è quello dello studio, scritto in [[Piattaforma/Robot agenda
   MediOnline]]: si cambia qui finché non diventa una scheda in Studio.
   Un colore che non è in tabella NON si inventa: si mostra com'è. */
const RF_COLORI_TIPO = {
  '#2ecc40': 'Visite',
  '#01ff70': 'Colloqui telefonici',
  '#0074d9': 'Risonanze',
  '#7fdbff': 'ICCT · emodinamica e CVE',
  '#85144b': 'Interventi',
  '#ff4136': 'Urgenze',
  '#ff851b': 'Ecocardiogrammi',
};
function rfTipoColore(colore) {
  const c = String(colore || '').toLowerCase();
  if (!c) return 'Senza colore';
  return RF_COLORI_TIPO[c] || `Altro · ${c}`;
}

// Scheda dell'appuntamento: si apre cliccando il riquadro in agenda. Mostra
// quel che il riquadro non ha spazio di dire — data di nascita, numero di
// paziente di MediOnline, stato della fatturazione, sigla dell'agenda — e
// porta alla cartella quando il paziente è abbinato. Sola lettura: qui non si
// modifica niente, l'agenda resta della Cassa dei Medici.
function rfApptScheda(id) {
  const a = (RF.agenda || []).find(x => x.id === id);
  if (!a) return;
  const inCartella = a.p && rfUuid(a.p);
  const paz = a.p && P[a.p] ? P[a.p] : null;
  const riga = (et, val) => val ? `<div class="rf-ap-riga"><span class="e">${et}</span><span class="v">${val}</span></div>` : '';
  const fine = (() => { const [h, m] = a.start.split(':').map(Number); const t = h * 60 + m + a.dur; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
  const et = new Date(`${a.d}T12:00:00`).toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const corpo = `
    <div class="rf-ap">
      ${riga('Quando', `${rfEsc(et)} · <b>${a.start} – ${fine}</b> <span class="caption">(${a.dur} min)</span>`)}
      ${riga('Paziente', rfEsc(a.nomeBreve || a.nome))}
      ${riga('Nato il', rfEsc(a.nascita))}
      ${riga('N° paziente', a.nPaziente ? `<code>${rfEsc(a.nPaziente)}</code> <span class="caption">in MediOnline</span>` : '')}
      ${riga(rfRuoloDi(a.doc) ? 'Eseguito da' : 'Medico', a.doc && a.doc !== 'studio' ? rfEsc(DOCTORS[a.doc] || a.doc) + rfEtichettaRuolo(a.doc) : `<span class="caption">non abbinato</span>`)}
      ${riga('Agenda', a.sigla ? `<code>${rfEsc(a.sigla)}</code>` : (a.room ? `<code>${rfEsc(a.room)}</code>` : ''))}
      ${riga('Tipo', a.colore ? `<span class="status"><i class="dot" style="background:${rfEsc(a.colore)}"></i>${rfEsc(rfTipoColore(a.colore))}</span>` : '')}
      ${riga('Prestazione', a.prestazione || a.motivoVero
        ? rfEsc(a.prestazione || a.motivoVero)
        : `<span class="caption">MediOnline nel riquadro non scrive la prestazione. Il tipo qui sopra viene dal colore; per avere il nome della prestazione si riempie il catalogo in Studio → Prestazioni.</span>`)}
      ${riga('In MediOnline', a.statoMol ? rfStatoPill(a.statoMol) : '<span class="caption">non ancora letto</span>')}
      ${riga('Nella piattaforma', inCartella ? '<span class="status"><i class="dot success"></i>paziente in cartella</span>' : '<span class="status"><i class="dot warning"></i>solo in agenda, non in cartella</span>')}
      <div class="rf-ap-grezzo"><span class="caption">Come sta scritto nell'agenda</span><div>${rfEsc(a.nome)}</div></div>
    </div>`;
  const azioni = `<button class="btn" data-close>Chiudi</button>` +
    // Dall'agenda si apre la visita: è la via più corta per chi sta guardando
    // il programma del giorno (16.9.2026).
    (inCartella ? `<button class="btn" onclick="closeModal();go('#/patients/${rfEsc(a.p)}')">Apri la cartella</button>`
      : (RF.live && /^[A-Za-zÀ-ÿ]/.test(a.nomeBreve || a.nome || '') && ['secretary', 'assistant', 'doctor', 'org_admin'].includes(state.role) ? `<button class="btn primary" onclick="closeModal();rfCartellaDaAgenda(${rfEsc(JSON.stringify(a.nome || ''))})">Crea la cartella</button>` : '')) +
    `<button class="btn ai" onclick="closeModal();askAI('Briefing pre-visita di ${rfEsc((a.nomeBreve || a.nome).replace(/'/g, ' '))}')">${ICONS.ai} Briefing</button>`;
  openModal('Appuntamento', corpo, azioni);
}
(function () { const st = document.createElement('style'); st.textContent = `
.rf-ap { display:flex; flex-direction:column; gap:1px; }
.rf-ap-riga { display:grid; grid-template-columns: 130px minmax(0,1fr); gap:10px; padding:7px 0; border-top:1px solid var(--border); font-size:13.5px; align-items:baseline; }
.rf-ap-riga:first-child { border-top:0; }
.rf-ap-riga .e { color:var(--text-3); font-size:12.5px; }
.rf-ap-riga .v code { font-family:var(--font-mono, ui-monospace, monospace); font-size:12.5px; background:var(--surface-2); padding:1px 5px; border-radius:4px; }
.rf-ap-grezzo { margin-top:10px; padding-top:9px; border-top:1px solid var(--border); }
.rf-ap-grezzo div { font-size:12.5px; color:var(--text-2); margin-top:3px; }
@media (max-width: 600px) { .rf-ap-riga { grid-template-columns: 1fr; gap:2px; } }
`; document.head.appendChild(st); })();

// Chi tiene un'agenda senza essere medico (l'ecografista, per esempio): il
// nome si mostra, ma con scritto che cos'è — non lo si chiama medico.
function rfRuoloDi(id) { return (RF.data && RF.data.ruoliMedici && RF.data.ruoliMedici[id]) || ''; }
function rfEtichettaRuolo(id) { const r = rfRuoloDi(id); return r ? ` <span class="caption">${rfEsc(r)}</span>` : ''; }

const rfAgendaOrig = PAGES.agenda;
PAGES.agenda = () => {
  if (!RF.live) return rfAgendaOrig();
  const oggi = (RF.data && RF.data.today) || rfOggi();
  // Il giorno scelto resta finché non lo si cambia — ma «oggi» a un certo
  // punto diventa domani. Se la pagina è rimasta aperta oltre la mezzanotte
  // (17.9.2026: l'agenda mostrava ancora il giorno prima), chi era fermo sul
  // giorno corrente si ritrova sul nuovo; chi si era spostato a mano no,
  // altrimenti gli si sposterebbe l'agenda sotto le mani.
  if (!state.agendaGiorno || (state.agendaOggi && state.agendaOggi !== oggi && state.agendaGiorno === state.agendaOggi)) state.agendaGiorno = oggi;
  state.agendaOggi = oggi;
  const giorno = state.agendaGiorno;
  const filtroTipo = state.agendaTipo || '';
  const periodo = state.agendaPeriodo === 'settimana' ? 'settimana' : 'giorno';
  const passaTipo = (a) => !filtroTipo || a.tipoPrest === filtroTipo;
  const lista = (RF.agenda || []).filter(a => a.d === giorno && passaTipo(a)).sort((a, b) => a.start.localeCompare(b.start));
  const nomeDi = (a) => (a.p && P[a.p]) ? fullName(P[a.p]) : (a.nome || 'Paziente');
  // Le colonne sono di chi TIENE un'agenda, non di chi ha appuntamenti quel
  // giorno (16.9.2026): prima Moschovitis spariva il mercoledì perché non
  // aveva visite, e l'agenda cambiava forma da un giorno all'altro. Una
  // colonna vuota dice «nessun appuntamento» e resta al suo posto.
  const medici = [...new Set((RF.agenda || []).filter(a => a.doc && a.doc !== 'studio').map(a => a.doc))].sort((x, y) => (DOCTORS[x] || '').localeCompare(DOCTORS[y] || ''));
  const minuti = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Vista per sala (14.9.2026): colonne = luoghi dell'agenda del giorno
  // abbinati alle risorse dello studio (più le sale registrate senza
  // appuntamenti); sovrapposizioni oltre i posti della sala segnalate.
  const vista = state.agendaVista === 'sale' ? 'sale' : 'medici';
  const risorse = (RF.data && Array.isArray(RF.data.risorse)) ? RF.data.risorse : [];
  const risorsaDi = (codice) => risorse.find(r => r.nome.toLowerCase() === String(codice || '').trim().toLowerCase()) || null;
  const chiaveSala = (a) => String(a.room || '').trim().toLowerCase();
  const sovra = new Set(); const avvisi = [];
  let cols;
  if (vista === 'sale') {
    const viste = new Map();
    for (const a of lista) { const k = chiaveSala(a); if (!k) continue; if (!viste.has(k)) { const r = risorsaDi(a.room); viste.set(k, { k, nome: r ? r.nome : a.room.trim(), posti: r ? (r.posti || 1) : null, tipo: r ? r.tipo : 'codice' }); } }
    for (const r of risorse) if (r.tipo === 'sala' && !viste.has(r.nome.toLowerCase())) viste.set(r.nome.toLowerCase(), { k: r.nome.toLowerCase(), nome: r.nome, posti: r.posti || 1, tipo: 'sala' });
    const ordinate = [...viste.values()].sort((x, y) => x.nome.localeCompare(y.nome));
    cols = ordinate.map(c => ({ k: c.k, et: `${c.nome}${c.posti ? ` · ${c.posti} ${c.posti === 1 ? 'posto' : 'posti'}` : ''}${c.tipo === 'apparecchio' ? ' · apparecchio' : c.tipo === 'codice' ? ' · codice' : ''}`, colore: '', test: (a) => chiaveSala(a) === c.k }));
    if (lista.some(a => !chiaveSala(a))) cols.push({ k: '', et: 'Senza luogo', colore: '', test: (a) => !chiaveSala(a) });
    for (const c of ordinate) {
      if (!c.posti) continue;
      const inSala = lista.filter(a => chiaveSala(a) === c.k && a.status !== 'CANCELLED');
      for (const a of inSala) {
        const ini = minuti(a.start), fine = ini + a.dur;
        const conc = inSala.filter(b => minuti(b.start) < fine && minuti(b.start) + b.dur > ini).length;
        if (conc > c.posti) { sovra.add(a.id); const t = `${c.nome} alle ${a.start} (${conc} su ${c.posti})`; if (!avvisi.includes(t)) avvisi.push(t); }
      }
    }
  } else {
    cols = medici.map(k => ({ k, et: (DOCTORS[k] || k) + (rfRuoloDi(k) ? ` · ${rfRuoloDi(k)}` : ''), colore: (RF.data && RF.data.coloriMedici && RF.data.coloriMedici[k]) || '', test: (a) => a.doc === k }));
    // Quel che non è di un medico non finisce più in una colonna sola dove si
    // copre a vicenda: si divide per COLORE del riquadro nell'agenda
    // originale, che nello studio vuol dire il tipo di appuntamento
    // (catalogo in [[Piattaforma/Robot agenda MediOnline]]).
    const orfani = lista.filter(a => !a.doc || a.doc === 'studio');
    const gruppi = new Map();
    for (const a of orfani) {
      const c = String(a.colore || '').toLowerCase();
      if (!gruppi.has(c)) gruppi.set(c, { c, n: 0 });
      gruppi.get(c).n++;
    }
    for (const g of [...gruppi.values()].sort((x, y) => y.n - x.n)) {
      cols.push({ k: `col:${g.c}`, et: rfTipoColore(g.c), colore: g.c, test: (a) => (!a.doc || a.doc === 'studio') && String(a.colore || '').toLowerCase() === g.c });
    }
  }
  const startH = lista.length ? Math.max(6, Math.min(8, Math.floor(Math.min(...lista.map(a => minuti(a.start))) / 60))) : 8;
  const endH = lista.length ? Math.min(21, Math.max(18, Math.ceil(Math.max(...lista.map(a => minuti(a.start) + a.dur)) / 60))) : 18;
  const slotH = 44, slots = (endH - startH) * 2;
  const top = (t) => (minuti(t) - startH * 60) / 30 * slotH;
  // Sovrapposizioni: gli appuntamenti che si accavallano si dividono la
  // larghezza della colonna invece di coprirsi a vicenda (era illeggibile).
  // Algoritmo classico da calendario: si raggruppano quelli legati a catena e
  // dentro il gruppo si assegna la prima corsia libera.
  const disponi = (app) => {
    const ord = [...app].sort((a, b) => minuti(a.start) - minuti(b.start) || b.dur - a.dur);
    const pos = new Map();
    let gruppo = [], fine = -1;
    const chiudi = () => {
      if (!gruppo.length) return;
      const corsie = [];
      for (const a of gruppo) {
        let i = 0;
        while (corsie[i] !== undefined && corsie[i] > minuti(a.start)) i++;
        corsie[i] = minuti(a.start) + a.dur;
        pos.set(a.id, { c: i, n: 1 });
      }
      for (const a of gruppo) pos.get(a.id).n = corsie.length;
      gruppo = []; fine = -1;
    };
    for (const a of ord) {
      const ini = minuti(a.start);
      if (gruppo.length && ini >= fine) chiudi();
      gruppo.push(a);
      fine = Math.max(fine, ini + a.dur);
    }
    chiudi();
    return pos;
  };
  const chip = (a, p) => {
    const n = Math.max(1, (p && p.n) || 1), c = (p && p.c) || 0;
    const larg = 100 / n;
    const geo = n > 1
      ? `left:calc(${(c * larg).toFixed(3)}% + 3px);width:calc(${larg.toFixed(3)}% - 6px);right:auto`
      : 'left:6px;right:6px';
    return `<div class="appt ${a.late ? 'LATE' : a.status}${sovra.has(a.id) ? ' rf-over' : ''}${n > 2 ? ' rf-stretta' : ''}" style="${geo};top:${top(a.start) + 2}px;height:${Math.max(24, a.dur / 30 * slotH - 4)}px${a.colore ? `;border-left:4px solid ${rfEsc(a.colore)};background:${rfEsc(a.colore)}1a` : (RF.data && RF.data.coloriMedici && RF.data.coloriMedici[a.doc] ? `;border-left:4px solid ${rfEsc(RF.data.coloriMedici[a.doc])}` : '')}" onclick="rfApptScheda('${rfEsc(a.id)}')" title="${rfEsc(nomeDi(a))} · ${a.start}${a.prestazione || a.motivoVero ? ' · ' + rfEsc(a.prestazione || a.motivoVero) : (a.colore ? ' · ' + rfEsc(rfTipoColore(a.colore)) : '')}${a.room ? ' · ' + rfEsc(a.room) : ''} — clicca per la scheda"><div class="n"><i class="dot ${a.late ? 'warning' : a.status === 'COMPLETED' ? 'success' : 'accent'}"></i>${rfEsc(nomeDi(a))}</div><div class="s">${a.start}${n > 2 ? '' : `${(() => { const d = a.prestazione || a.motivoVero || (a.colore ? rfTipoColore(a.colore) : ''); return d && !String(d).startsWith('Altro · ') ? ` · ${rfEsc(d)}` : ''; })()}${a.room ? ` · <b>${rfEsc(a.room)}</b>` : ''}`}</div></div>`;
  };
  const colHtml = (col) => {
    const dentro = lista.filter(col.test);
    const pos = disponi(dentro);
    return `<div class="cal-col" style="height:${slots * slotH}px">${Array.from({ length: slots }, (_, i) => `<div class="cal-line ${i % 2 ? 'half' : ''}" style="top:${i * slotH}px"></div>`).join('')}${dentro.map(a => chip(a, pos.get(a.id))).join('')}</div>`;
  };
  const times = Array.from({ length: slots }, (_, i) => i % 2 === 0 ? `<div class="cal-time num" style="top:${i * slotH}px">${String(startH + i / 2).padStart(2, '0')}:00</div>` : '').join('');
  const d = new Date(`${giorno}T12:00:00`);
  const etichetta = d.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sposta = (n) => { const x = new Date(`${giorno}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const senza = lista.filter(a => !a.doc || a.doc === 'studio').length;
  if (periodo === 'settimana') {
    // Settimana (14.9.2026, punto 6): sette colonne, ogni appuntamento in una
    // riga compatta; per sala mostra la sala, per medico il medico col colore.
    const lun = new Date(`${giorno}T12:00:00`); lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
    const giorni = Array.from({ length: 7 }, (_, i) => { const x = new Date(lun); x.setDate(lun.getDate() + i); return x.toISOString().slice(0, 10); });
    const sett = (RF.agenda || []).filter(a => a.d >= giorni[0] && a.d <= giorni[6] && passaTipo(a)).sort((a, b) => (a.d + a.start).localeCompare(b.d + b.start));
    const col = (a) => a.colore || (RF.data && RF.data.coloriMedici && RF.data.coloriMedici[a.doc]) || '';
    const et = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-CH', { weekday: 'short', day: 'numeric' });
    const etSett = `${new Date(`${giorni[0]}T12:00:00`).toLocaleDateString('it-CH', { day: 'numeric', month: 'short' })} – ${new Date(`${giorni[6]}T12:00:00`).toLocaleDateString('it-CH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `
    <div class="page-head"><div><h2 class="page-title">Agenda</h2><div class="page-sub">Settimana ${rfEsc(etSett)} · ${sett.length} appuntamenti${filtroTipo ? ` · solo ${filtroTipo === 'visita' ? 'visite' : filtroTipo === 'esame' ? 'esami' : 'procedure'}` : ''}</div></div>
      <div class="actions"><div class="seg"><button onclick="state.agendaPeriodo='giorno';render()">Giorno</button><button class="active">Settimana</button></div><div class="seg"><button class="${!filtroTipo ? 'active' : ''}" onclick="state.agendaTipo='';render()">Tutto</button><button class="${filtroTipo === 'visita' ? 'active' : ''}" onclick="state.agendaTipo='visita';render()">Visite</button><button class="${filtroTipo === 'esame' ? 'active' : ''}" onclick="state.agendaTipo='esame';render()">Esami</button><button class="${filtroTipo === 'procedura' ? 'active' : ''}" onclick="state.agendaTipo='procedura';render()">Procedure</button></div><div class="seg"><button class="${vista === 'medici' ? 'active' : ''}" onclick="state.agendaVista='medici';render()">Per medico</button><button class="${vista === 'sale' ? 'active' : ''}" onclick="state.agendaVista='sale';render()">Per sala</button></div><div class="seg"><button onclick="state.agendaGiorno='${sposta(-7)}';render()">‹</button><button class="${giorni.includes(oggi) ? 'active' : ''}" onclick="state.agendaGiorno='${oggi}';render()">Oggi</button><button onclick="state.agendaGiorno='${sposta(7)}';render()">›</button></div></div></div>
    <div class="rf-week">${giorni.map(g => { const del = sett.filter(a => a.d === g); return `<div class="rf-week-col ${g === oggi ? 'oggi' : ''}"><div class="rf-week-head"><span>${rfEsc(et(g))}</span><span class="caption">${del.length || ''}</span></div>${del.map(a => `<div class="rf-week-item ${a.status === 'COMPLETED' ? 'done' : ''}" ${a.p && rfUuid(a.p) ? `data-go="#/patients/${a.p}"` : ''} style="${col(a) ? `border-left-color:${rfEsc(col(a))}` : ''}" title="${rfEsc(nomeDi(a))} · ${rfEsc(a.reason || '')}"><span class="num">${a.start}</span> <b>${rfEsc(nomeDi(a))}</b><div class="caption">${rfEsc(a.prestazione || a.reason || '')}${vista === 'sale' ? (a.room ? ` · ${rfEsc(a.room)}` : '') : (DOCTORS[a.doc] ? ` · ${rfEsc(DOCTORS[a.doc])}` : '')}</div></div>`).join('') || '<div class="caption" style="padding:8px">—</div>'}</div>`; }).join('')}</div>
    <div class="row mt-16 caption wrap"><span class="caption">Dal robot MediOnline, in sola lettura; clic su un appuntamento apre la scheda del paziente in cartella.</span></div>`;
  }
  return `
    <div class="page-head"><div><h2 class="page-title">Agenda</h2><div class="page-sub">${rfEsc(etichetta)} · ${lista.length} appuntamenti${medici.length ? ` · ${medici.length} medici` : ''}${senza ? ` · ${senza} senza medico` : ''}</div></div>
      <div class="actions"><div class="seg"><button class="${periodo === 'giorno' ? 'active' : ''}" onclick="state.agendaPeriodo='giorno';render()">Giorno</button><button class="${periodo === 'settimana' ? 'active' : ''}" onclick="state.agendaPeriodo='settimana';render()">Settimana</button></div><div class="seg"><button class="${!filtroTipo ? 'active' : ''}" onclick="state.agendaTipo='';render()">Tutto</button><button class="${filtroTipo === 'visita' ? 'active' : ''}" onclick="state.agendaTipo='visita';render()">Visite</button><button class="${filtroTipo === 'esame' ? 'active' : ''}" onclick="state.agendaTipo='esame';render()">Esami</button><button class="${filtroTipo === 'procedura' ? 'active' : ''}" onclick="state.agendaTipo='procedura';render()">Procedure</button></div>${rfTelefono() ? '' : `<div class="seg"><button class="${vista === 'medici' ? 'active' : ''}" onclick="state.agendaVista='medici';render()">Per medico</button><button class="${vista === 'sale' ? 'active' : ''}" onclick="state.agendaVista='sale';render()">Per sala</button></div>`}<div class="seg"><button onclick="state.agendaGiorno='${sposta(periodo === 'settimana' ? -7 : -1)}';render()">‹</button><button class="${giorno === oggi ? 'active' : ''}" onclick="state.agendaGiorno='${oggi}';render()">Oggi</button><button onclick="state.agendaGiorno='${sposta(periodo === 'settimana' ? 7 : 1)}';render()">›</button></div><input type="date" class="input sm" value="${giorno}" onchange="state.agendaGiorno=this.value;render()" style="max-width:160px">${rfTelefono() ? '' : `<button class="btn ai" data-ai="Preparazione della giornata">${ICONS.ai} Prepara la giornata</button>`}</div></div>
    ${avvisi.length ? `<div class="card mb-16" style="border-left:3px solid var(--danger)"><b>Più pazienti dei posti della sala</b>: ${avvisi.map(rfEsc).join(' · ')}. I posti si impostano in Studio → Sale.</div>` : ''}
    ${vista === 'sale' && cols.length && !risorse.some(r => r.tipo === 'sala') ? `<div class="caption mb-16">Nessuna sala registrata: le colonne sono i codici del campo «luogo» dell'agenda. In Studio → Sale si registrano le sale con i posti; in Medici agenda → Codici dell'agenda un codice diventa una sala.</div>` : ''}
    ${senza && vista === 'medici' ? `<div class="caption mb-16">Le colonne a destra della linea sono gli appuntamenti <b>non abbinati a un medico</b>, divisi per colore dell'agenda originale, cioè per tipo. I codici del luogo non abbinati sono ${[...new Set(lista.filter(a => !a.doc || a.doc === 'studio').map(a => a.room).filter(Boolean))].map(rfEsc).join(', ') || 'vuoti'}: si abbinano in Studio → Medici agenda → Codici dell'agenda, e allora tornano nella colonna del medico.</div>` : ''}
    ${lista.length ? (rfTelefono() ? rfAgendaListaHtml(lista, vista) : (() => {
      // Larghezza disponibile stimata: finestra meno barra laterale, margini e
      // colonna delle ore. Le colonne si dividono quello che resta, con un
      // minimo sotto il quale diventano illeggibili.
      const disponibile = Math.max(520, (typeof window !== 'undefined' ? window.innerWidth : 1440) - (state.sidebarCollapsed ? 72 : 240) - 28 - 52 - 24);
      const min = Math.max(104, Math.min(190, Math.floor(disponibile / Math.max(1, cols.length))));
      return `<div class="rf-cal-scorre"><div class="cal${min < 150 ? ' rf-fitta' : ''}" style="--cols:${cols.length};--cal-min:${min}px">`;
    })() + `
      <div class="cal-head"></div>${cols.map(c => `<div class="cal-head${String(c.k).startsWith('col:') ? ' rf-tipo' : ''}">${c.colore ? `<i class="dot" style="background:${rfEsc(c.colore)};margin-right:6px"></i>` : ''}${rfEsc(c.et)}</div>`).join('')}
      <div class="cal-times" style="--slots:${slots};--slot-h:${slotH}px">${times}</div>${cols.map(colHtml).join('')}
    </div></div>`) : `<div class="card"><div class="caption">Nessun appuntamento in agenda per questo giorno${Math.abs((d - new Date(`${oggi}T12:00:00`)) / 86400000) > 30 ? ' (la piattaforma carica ±30 giorni da oggi)' : ''}.</div></div>`}
    ${(() => { const c = {}; for (const a of lista) if (a.colore) c[a.colore] = (c[a.colore] || 0) + 1; const voci = Object.entries(c).sort((x, y) => y[1] - x[1]); return voci.length ? `<div class="row mt-16 caption wrap" style="gap:10px"><span>Colori dell'agenda originale:</span>${voci.map(([col, n]) => `<span class="status"><i class="dot" style="background:${rfEsc(col)}"></i>${n}</span>`).join('')}</div>` : ''; })()}
    <div class="row mt-16 caption wrap"><span class="status"><i class="dot accent"></i>Programmato</span><span class="status"><i class="dot success"></i>Completato</span><span class="status"><i class="dot warning"></i>In ritardo</span><span class="caption">Dal robot MediOnline, in sola lettura; si aggiorna ogni ora.</span></div>`;
};

/* ---------- avvio: dentro la piattaforma niente demo, mai ---------- */
function rfPaginaCarico() {
  // Se il primo caricamento fallisce (riavvio del server, un blip di rete, un
  // 500) prima si restava su «Carico…» per sempre: il ritentativo periodico
  // era dietro `RF.live`, che diventa vero solo dopo il primo successo.
  const c = document.getElementById('content');
  const err = RF.erroreCarico;
  if (c) c.innerHTML = `<div class="page"><div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2 class="page-title">ReferralFlow</h2>${err
    ? `<p class="meta">${rfEsc(err)}</p><div class="row mt-16" style="justify-content:center"><button class="btn primary" onclick="RF.erroreCarico=null;rfPaginaCarico();void rfCaricaDati()">Riprova</button></div>`
    : '<p class="meta">Carico i dati della piattaforma…</p>'}</div></div>`;
  const sb = document.getElementById('sidebar'); if (sb) sb.innerHTML = '';
}
if (rfDentro()) {
  const rfRenderVero = render;
  render = function () {
    if (RF.nonAutorizzato) return rfPaginaAccesso();
    if (!RF.caricato) return rfPaginaCarico();
    if (state.route === 'ai') state.aiOpen = false;
    const out = rfRenderVero();
    // La pagina di Cleo scende in fondo SOLO se c'è una conversazione: col
    // benvenuto scendere significava saltare titolo e campo. E sul telefono
    // non si prende il fuoco da sola: la tastiera coprirebbe mezza pagina
    // appena si apre.
    const aip = document.getElementById('rf-aip-body');
    if (aip) {
      aip.scrollTop = state.aiMessages.length ? 1e6 : 0;
      const inp = document.getElementById('rf-aip-in');
      if (inp && !rfTelefono() && !document.activeElement?.closest('#modal')) setTimeout(() => inp.focus({ preventScroll: true }), 0);
    }
    rfRicordaPagina();
    rfTastoIndietro();
    document.querySelectorAll('[data-prefirma]').forEach(el => { el.onclick = (e) => { e.stopPropagation(); if (!state.aiOpen) state.aiOpen = true; state.aiMessages.push({ html: `<div class="ai-msg user">Controllo prima della firma</div>` }); rfProcedura({ nome: 'controllo_prefirma', bozza_id: el.dataset.prefirma }, 'Controllo la bozza prima della firma…'); }; });
    return out;
  };
  rfPaginaCarico();
}
window.addEventListener('load', () => {
  if (!rfDentro()) return;
  void rfCaricaMedici();
  void rfCaricaProcedure();
  void rfCaricaDati();
  // Anche quando il primo caricamento non è mai riuscito: se no chi ha aperto
  // la pagina nel momento sbagliato resta bloccato finché non ricarica a mano.
  setInterval(() => { if (RF.nonAutorizzato) return; if ((RF.live || RF.erroreCarico) && state.route !== 'review') void rfCaricaDati(); }, 120000);
});

