// Pages: home (per ruolo), agenda, pazienti, scheda paziente, visit mode
const PAGES = {};
const statusBadge = s => `<span class="status"><i class="dot ${STATUS_DOT[s]}"></i>${STATUS_LABEL[s]}</span>`;
const initials = p => (p.first[0] + p.last[0]).toUpperCase();
const emptyState = (icon, t, s, action = '') => `<div class="empty">${ICONS[icon]}<div class="t">${t}</div><div>${s}</div>${action}</div>`;
const provChip = (k) => ({ confirmed: '<span class="prov confirmed">Confermato</span>', document: '<span class="prov document">Nel documento</span>', inferred: '<span class="prov inferred">Dedotto dall\'AI</span>', verify: '<span class="prov verify">Da verificare</span>', conflict: '<span class="prov conflict">Conflitto</span>' })[k];
const aiTag = () => `<span class="ai-tag">${ICONS.ai} Generato da ReferralFlow AI</span>`;

/* ---------- HOME ---------- */
PAGES.home = () => ({ secretary: homeSecretary, assistant: homeAssistant, doctor: homeDoctor, org_admin: homeOrgAdmin, tech_admin: () => systemOverview(true) })[state.role]();

function homeDoctor() {
  const next = APPTS.find(a => a.id === 'a3'); const p = P[next.p];
  const mine = APPTS.filter(a => a.doc === 'eb').sort((a, b) => a.start.localeCompare(b.start));
  return `
    <div class="page-head"><div><div class="display">${ROLES.doctor.greet}</div><div class="page-sub">Martedì 9 settembre 2026 · 11 pazienti · primo alle 08:30</div></div>
      <div class="actions"><button class="btn" data-go="#/agenda">${ICONS.agenda} Agenda</button><button class="btn ai" data-ai="Riassumi la giornata">${ICONS.ai} Brief AI</button></div></div>
    <div class="grid grid-hero">
      <div class="card hero">
        <div class="row between"><span class="section-title">Prossimo paziente</span><span class="status"><i class="dot success"></i>Pronto in ${next.room}</span></div>
        <div class="row mt-16" style="gap:16px;align-items:flex-start">
          <div class="num" style="font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1">${next.start}</div>
          <div class="grow"><div style="font-size:20px;font-weight:650">${fullName(p)} <span class="meta">· ${p.age} anni · ID ${p.num}</span></div><div class="meta">${next.reason} · ${DOCTORS[next.doc]} · ${next.room}</div>
            <div class="row wrap mt-8"><span class="badge ai">${ICONS.ai} Terapia cambiata</span><span class="badge accent">Holter nuovo</span><span class="badge warning">1 doc. da confermare</span><span class="badge">Parametri ✓ ECG ✓</span></div></div>
        </div>
        <div class="row mt-24"><button class="btn primary lg" data-go="#/visit/p1">${ICONS.play} Apri visita</button><button class="btn lg" data-go="#/patients/p1">Scheda paziente</button><button class="btn ghost lg" data-ai="Cosa è cambiato?">${ICONS.ai} Cosa è cambiato?</button></div>
      </div>
      <div class="stack">
        <div class="card tight clickable stat" data-go="#/agenda"><span class="value num">11</span><span class="label">Pazienti oggi</span><span class="delta">2 prime visite · 3 aritmologici</span></div>
        <div class="card tight clickable stat" data-go="#/reports"><span class="value num">2</span><span class="label">Referti da approvare</span><span class="delta warn">1 con alert da verificare</span></div>
        <div class="card tight clickable stat" data-go="#/documents"><span class="value num">2</span><span class="label">Documenti nuovi</span><span class="delta">1 risultato da verificare</span></div>
      </div>
    </div>
    <div class="grid grid-main-side mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Timeline di oggi</span><button class="btn sm ghost" data-go="#/agenda">Agenda completa ${ICONS.chevR}</button></div>
        <div class="tl">${mine.map(a => `<div class="tl-item ${a.status === 'COMPLETED' ? 'done' : a.id === 'a3' ? 'now' : a.late ? 'warn' : ''} clickable" data-go="#/patients/${a.p}" style="cursor:pointer"><span class="time num">${a.start}</span><div class="body"><div class="t">${fullName(P[a.p])} <span class="meta">· ${a.reason}</span></div><div class="s">${STATUS_LABEL[a.status]}${a.late ? ' · in ritardo 15 min' : ''}${a.id === 'a3' ? ' · prossimo' : ''} · ${a.room}</div></div>${a.status === 'CANCELLED' ? '' : statusBadge(a.status)}</div>`).join('')}</div></div>
      <div class="stack">
        <div class="card ai"><div class="card-head"><span class="section-title">AI insights</span>${aiTag()}</div>
          <div class="list">
            ${[['2 pazienti hanno inviato nuovi esami da ieri', 'Rossi (dimissione), Verdi (lab)', 'document'], ['1 follow-up non ancora programmato', 'Fabbri · controllo scaduto da 3 mesi', 'verify'], ['Nel referto Rossi un Holter è citato ma non trovo il risultato', 'Consistency Agent', 'conflict']].map(([t, s, k]) => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${t}</div><div class="sub">${s} · ${provChip(k)}</div></div><button class="btn sm ghost" data-modal="why" data-arg="${esc(t)}">Perché?</button></div>`).join('')}
          </div></div>
        <div class="card"><div class="card-head"><span class="section-title">Brief del mattino</span><span class="caption">07:50</span></div><p class="meta" style="margin:0;line-height:1.55">11 pazienti oggi, 2 prime visite, 3 controlli aritmologici. Rispetto a ieri non risultano criticità organizzative. Due pazienti hanno inviato nuovi esami; una visita ha documentazione incompleta (Rossi: lettera di dimissione da confermare).</p><div class="row mt-8">${provChip('confirmed')}<span class="caption">Agenda · Documenti · Task</span></div></div>
      </div>
    </div>`;
}

function homeSecretary() {
  const arrivals = APPTS.filter(a => a.status !== 'CANCELLED').sort((a, b) => a.start.localeCompare(b.start));
  const stat = (v, l, go, d = '') => `<div class="card tight clickable stat" data-go="${go}"><span class="value num">${v}</span><span class="label">${l}</span>${d ? `<span class="delta">${d}</span>` : ''}</div>`;
  return `
    <div class="page-head"><div><div class="display">${ROLES.secretary.greet}</div><div class="page-sub">Martedì 9 settembre 2026 · 18 appuntamenti · 2 medici in studio</div></div>
      <div class="actions"><button class="btn" data-sheet="newAppt">${ICONS.plus} Appuntamento <kbd>⌘N</kbd></button><button class="btn" data-sheet="call">${ICONS.phone} Nuova chiamata</button><button class="btn ai" data-ai="Chi devo richiamare oggi?">${ICONS.ai} Chi devo richiamare?</button></div></div>
    <div class="grid grid-5">${stat(18, 'Appuntamenti', '#/agenda', '4 arrivati · 1 in ritardo')}${stat(3, 'Da confermare', '#/agenda', 'domani')}${stat(2, 'Richiami', '#/inbox', 'Gallo 11:00 · Riva pom.')}${stat(4, 'Documenti mancanti', '#/documents')}${stat(1, 'Referti da inviare', '#/reports', 'Verdi → Dr. Ponti')}</div>
    <div class="grid grid-main-side mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Arrivi di oggi</span><div class="seg"><button class="active">Tutti</button><button>Bianchi</button><button>Ferrari</button></div></div>
        <div class="list">${arrivals.map(a => { const p = P[a.p]; const act = a.status === 'SCHEDULED' && !a.late ? `<button class="btn sm" data-toast="${fullName(p)} segnato come arrivato · task di preparazione creato" data-undo>Arrivato</button>` : a.late ? `<button class="btn sm" data-sheet="call" data-arg="${a.p}">${ICONS.phone} Chiama</button><button class="btn sm ghost" data-toast="Segnato no-show · task richiamo creato" data-undo>No-show</button>` : a.status === 'ARRIVED' ? `<span class="caption">In preparazione (Marco)</span>` : ''; return `<div class="list-item clickable" data-sheet="appt" data-arg="${a.id}"><span class="time num">${a.start}</span><div class="avatar-sm">${initials(p)}</div><div class="grow"><div class="name">${fullName(p)}</div><div class="sub">${a.reason} · ${DOCTORS[a.doc]} · ${a.room}</div></div>${a.late ? '<span class="badge warning">In ritardo</span>' : statusBadge(a.status)}<div class="act">${act}</div></div>`; }).join('')}</div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><span class="section-title">Richiami</span><span class="badge count">2</span></div><div class="list">
          <div class="list-item"><div class="avatar-sm">PG</div><div class="grow"><div class="name">Paolo Gallo</div><div class="sub">Conferma 11:30 · nessuna risposta ieri</div></div><button class="btn sm" data-sheet="call" data-arg="p6">${ICONS.phone}</button></div>
          <div class="list-item"><div class="avatar-sm">SR</div><div class="grow"><div class="name">Sara Riva</div><div class="sub">Esito lab · <span class="ai-tag">✦ proposta AI</span></div></div><button class="btn sm" data-sheet="call" data-arg="p7">${ICONS.phone}</button></div></div></div>
        <div class="card"><div class="card-head"><span class="section-title">Da inviare</span></div><div class="list"><div class="list-item"><div class="grow"><div class="name">Referto Anna Verdi</div><div class="sub">Approvato 11:10 · Dr.ssa Bianchi · → Dr. Ponti</div></div><button class="btn sm primary" data-modal="send" data-arg="r3">${ICONS.send} Invia</button></div></div></div>
        <div class="card"><div class="card-head"><span class="section-title">Richieste aperte</span></div><div class="list"><div class="list-item"><div class="grow"><div class="name">Moretti — spostare controllo</div><div class="sub">Telefonata 08:05</div></div><button class="btn sm" data-ai="Trova un posto la prossima settimana">${ICONS.ai} Trova slot</button></div></div></div>
        <div class="card ai"><div class="card-head"><span class="section-title">Brief del mattino</span>${aiTag()}</div><p class="meta" style="margin:0;line-height:1.55">4 pazienti da confermare per domani, 2 richiami, 1 documento da recuperare (Fabbri), 3 referti pronti per l'invio in giornata.</p></div>
      </div>
    </div>`;
}

function homeAssistant() {
  const cols = [['In attesa', ['a4', 'a5']], ['In preparazione', ['a3']], ['Pronto', []], ['In visita', ['a2']], ['Completato', ['a1', 'a6']]];
  const card = (id) => { const a = APPTS.find(x => x.id === id); const p = P[a.p]; const ready = a.id === 'a3'; return `<div class="kcard"><div class="row between"><span class="n">${fullName(p)}</span><span class="caption num">${a.start}</span></div><div class="caption">${a.room} · ${DOCTORS[a.doc]} · ${a.reason}</div><div class="checks"><span class="check ${ready || a.status === 'COMPLETED' || a.status === 'IN_VISIT' ? 'ok' : 'miss'}">Parametri</span><span class="check ${ready || a.status === 'COMPLETED' || a.status === 'IN_VISIT' ? 'ok' : 'miss'}">ECG</span><span class="check ${a.status === 'COMPLETED' ? 'ok' : a.id === 'a3' ? 'miss' : ''}">Documenti</span></div>${a.status === 'SCHEDULED' ? `<div class="row mt-8"><button class="btn sm" data-toast="Preparazione avviata · ${fullName(p)}">Inizia prep</button></div>` : ready ? `<div class="row mt-8"><button class="btn sm primary" data-toast="Rossi segnato pronto · notifica inviata alla Dr.ssa Bianchi" data-undo>Segna pronto</button><button class="btn sm" data-sheet="vitals" data-arg="${a.p}">Parametri</button><button class="btn sm ghost" data-modal="upload">${ICONS.upload}</button></div>` : ''}</div>`; };
  return `
    <div class="page-head"><div><div class="display">${ROLES.assistant.greet}</div><div class="page-sub">Flusso pazienti di oggi · 2 sale attive · Sala ECG libera</div></div>
      <div class="actions"><button class="btn" data-modal="upload">${ICONS.upload} Carica documento</button><button class="btn ai" data-ai="Chi è pronto?">${ICONS.ai} Chi è pronto?</button></div></div>
    <div class="banner ai mb-16">${ICONS.ai}<span><b>1 attività da fare ora:</b> Preparare Mario Rossi in Sala 2 (arrivato 08:25, visita 09:30). Manca la conferma della lettera di dimissione.</span><button class="btn sm right" data-go="#/patients/p1">Apri</button></div>
    <div class="board">${cols.map(([t, ids]) => `<div class="col"><div class="col-head"><span>${t}</span><span class="badge count">${ids.length}</span></div>${ids.length ? ids.map(card).join('') : '<div class="caption" style="padding:8px 6px">Nessuno</div>'}</div>`).join('')}</div>
    <div class="grid grid-3 mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Le mie attività</span></div><div class="list">${TASKS.filter(t => t.assignee === 'assistant').map(t => `<div class="list-item"><input type="checkbox" data-toast="Task completato" style="accent-color:var(--accent)"><div class="grow"><div class="name" style="font-size:13px">${t.title}</div><div class="sub">${t.due} · ${TSTATUS[t.status]}</div></div></div>`).join('')}<div class="list-item"><input type="checkbox" style="accent-color:var(--accent)"><div class="grow"><div class="name" style="font-size:13px">Posare Holter — Conti (10:00)</div><div class="sub">Sala ECG</div></div></div></div></div>
      <div class="card"><div class="card-head"><span class="section-title">Messaggi al medico</span></div><div class="list"><div class="list-item"><div class="grow"><div class="name" style="font-size:13px">Dr.ssa Bianchi</div><div class="sub">"Rossi pronto in Sala 2" — inviato 09:26 ✓ letto</div></div></div></div><div class="row mt-8"><input class="input grow" placeholder="Scrivi al medico…"><button class="btn" data-toast="Messaggio inviato">${ICONS.send}</button></div></div>
      <div class="card"><div class="card-head"><span class="section-title">Documenti arrivati oggi</span><span class="badge count">3</span></div><div class="list">${DOCUMENTS.filter(d => d.date === '09.09.2026').map(d => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${d.t}</div><div class="sub">${DOC_TYPE[d.type]} · ${d.conf}</div></div>${d.status === 'needs_confirmation' ? '<span class="badge warning">Conferma</span>' : '<span class="badge success">OK</span>'}</div>`).join('')}</div></div>
    </div>`;
}

function homeOrgAdmin() {
  return `
    <div class="page-head"><div><div class="display">${ROLES.org_admin.greet}</div><div class="page-sub">Stato dello studio · settembre 2026</div></div><div class="actions"><button class="btn" data-go="#/administration">${ICONS.admin} Amministrazione</button><button class="btn" data-go="#/statistics">${ICONS.stats} Statistiche</button></div></div>
    <div class="grid grid-4">
      <div class="card tight stat"><span class="value num">212</span><span class="label">Visite questo mese</span><span class="delta up">+6 % vs agosto</span></div>
      <div class="card tight stat"><span class="value num">3,1 %</span><span class="label">No-show</span><span class="delta up">−0,8 pt</span></div>
      <div class="card tight stat"><span class="value num">2,4 h</span><span class="label">Tempo medio approvazione referto</span><span class="delta">obiettivo 24 h ✓</span></div>
      <div class="card tight stat"><span class="value num">CHF 4.2k</span><span class="label">Fatture insolute</span><span class="delta warn">3 oltre 60 gg</span></div>
    </div>
    <div class="grid grid-main-side mt-16">
      <div class="card"><div class="card-head"><span class="section-title">Carico medici (settimana)</span></div><div class="bars">${[38, 42, 35, 44, 20, 40, 45, 38, 41, 22].map((v, i) => `<div class="bar ${i % 2 ? '' : 'hi'}" style="height:${v * 2}%" title="${v}"></div>`).join('')}</div><div class="row between mt-8 caption"><span>Bianchi ■ Ferrari □</span><span>lun · mar · mer · gio · ven</span></div></div>
      <div class="stack">
        <div class="card ai"><div class="card-head"><span class="section-title">Qualità AI</span>${aiTag()}</div><div class="stat"><span class="value num">2,4</span><span class="label">correzioni per referto (30 gg)</span><span class="delta up">−62 % da giugno · zero-touch 34 %</span></div><div class="row mt-8"><button class="btn sm" data-go="#/system/ai">Dettagli</button></div></div>
        <div class="card"><div class="card-head"><span class="section-title">Proposte da approvare</span><span class="badge count">${1 + kpPending()}</span></div><div class="list">${KP.list.filter(p => p.status === 'candidate').slice(0, 2).map(p => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${esc(p.to)}</div><div class="sub">${p.id} · dalla tua correzione in Revisione guidata</div></div><button class="btn sm" onclick="kpView('${p.id}')">Vedi</button></div>`).join('')}<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">Aggiornare template "Controllo aritmologico"</div><div class="sub">Pattern rilevato in 34 referti della Dr.ssa Bianchi</div></div><button class="btn sm" data-modal="templateProposal">Vedi</button></div></div></div>
      </div>
    </div>`;
}

/* ---------- AGENDA ---------- */
PAGES.agenda = () => {
  const cols = [['eb', 'Dr.ssa Bianchi'], ['pf', 'Dr. Ferrari'], ['room', 'Sala ECG']];
  const slotH = 44, startH = 8, slots = 20; // 08:00-18:00, 30-min slots
  const top = (t) => { const [h, m] = t.split(':').map(Number); return ((h - startH) * 60 + m) / 30 * slotH; };
  const chip = (a) => { const p = P[a.p]; return `<div class="appt ${a.late ? 'LATE' : a.status}" style="top:${top(a.start) + 2}px;height:${a.dur / 30 * slotH - 4}px" data-sheet="appt" data-arg="${a.id}"><div class="n"><i class="dot ${a.late ? 'warning' : STATUS_DOT[a.status]}"></i>${fullName(p)}</div><div class="r">${a.start} · ${a.reason}${a.late ? ' · in ritardo' : ''}</div></div>`; };
  const colHtml = (key) => { const list = key === 'room' ? APPTS.filter(a => a.room === 'Sala ECG') : APPTS.filter(a => a.doc === key && a.room !== 'Sala ECG'); let extra = ''; if (key === 'pf') extra = `<div class="gap-hint" style="top:${top('10:30') + 2}px;height:${slotH * 2 - 4}px" data-ai="Ci sono conflitti oggi?">${ICONS.ai} Buco 45 min — ✦ suggerimento disponibile</div>`; const lines = Array.from({ length: slots }, (_, i) => `<div class="cal-line ${i % 2 ? 'half' : ''}" style="top:${i * slotH}px"></div>`).join(''); return `<div class="cal-col" style="--slots:${slots};--slot-h:${slotH}px">${lines}<div class="now-line" style="top:${top('09:42')}px"></div>${list.map(chip).join('')}${extra}</div>`; };
  const times = Array.from({ length: slots }, (_, i) => i % 2 === 0 ? `<div class="cal-time num" style="top:${i * slotH}px">${String(startH + i / 2).padStart(2, '0')}:00</div>` : '').join('');
  return `
    <div class="page-head"><div><h2 class="page-title">Agenda</h2><div class="page-sub">Martedì 9 settembre 2026</div></div>
      <div class="actions"><div class="seg"><button class="active">Giorno</button><button data-toast="Vista settimana (prototipo)">Settimana</button><button data-toast="Vista stanza (prototipo)">Stanza</button><button data-toast="Vista tipo (prototipo)">Tipo</button></div><button class="btn">${ICONS.chevL}</button><button class="btn">Oggi</button><button class="btn">${ICONS.chevR}</button><button class="btn ghost">${ICONS.filter} Filtri</button><button class="btn primary" data-sheet="newAppt">${ICONS.plus} Nuovo</button></div></div>
    <div class="banner ai mb-16">${ICONS.ai}<span><b>Suggerimento:</b> se sposti Paolo Gallo (11:30) alle 10:45 elimini un buco di 45 minuti nella colonna del Dr. Ferrari. Nessuna modifica viene applicata senza conferma.</span><button class="btn sm right" data-ai="sposta Gallo alle 10:45">Anteprima</button><button class="btn sm ghost" data-toast="Suggerimento silenziato per oggi">Ignora</button></div>
    <div class="cal" style="--cols:${cols.length}">
      <div class="cal-head"></div>${cols.map(c => `<div class="cal-head">${c[1]}</div>`).join('')}
      <div class="cal-times" style="--slots:${slots};--slot-h:${slotH}px">${times}</div>${cols.map(c => colHtml(c[0])).join('')}
    </div>
    <div class="row mt-16 caption wrap"><span class="status"><i class="dot"></i>Programmato</span><span class="status"><i class="dot accent"></i>Confermato / In visita</span><span class="status"><i class="dot success"></i>Arrivato / Completato</span><span class="status"><i class="dot warning"></i>In ritardo</span><span class="status"><i class="dot danger"></i>No-show</span></div>`;
};

/* ---------- PAZIENTI ---------- */
PAGES.patients = () => {
  const clinical = ['doctor', 'org_admin'].includes(state.role);
  return `
    <div class="page-head"><div><h2 class="page-title">Pazienti</h2><div class="page-sub">${PATIENTS.length} attivi · 0 archiviati</div></div><div class="actions"><button class="btn" data-toast="Vista salvata: Follow-up mancante">${ICONS.pin} Viste salvate</button><button class="btn primary" data-sheet="newPatient">${ICONS.plus} Nuovo paziente</button></div></div>
    <div class="toolbar"><input class="input" placeholder="Cerca nome, telefono, ID, e-mail…"><select class="input" style="min-width:150px"><option>Tutti i medici</option><option>Dr.ssa Bianchi</option><option>Dr. Ferrari</option></select><button class="btn ghost">${ICONS.filter} Filtri</button><button class="btn ai" data-ai="Pazienti senza follow-up programmato">${ICONS.ai} Smart filter</button><span class="right caption">Colonne · Ordina · Selezione ↑↓</span></div>
    <div class="table-wrap"><table><thead><tr><th>Paziente</th><th>Data di nascita</th><th>ID</th><th>Telefono</th><th>Medico</th><th>Ultima visita</th><th>Prossimo</th><th>Indicatori</th><th></th></tr></thead><tbody>
      ${PATIENTS.map(p => `<tr data-go="#/patients/${p.id}"><td><div class="row"><div class="avatar-sm">${initials(p)}</div><b>${fullName(p)}</b></div></td><td class="num">${p.dob} <span class="caption">(${p.age})</span></td><td class="num">${p.num}</td><td class="num">${p.phone}</td><td>${DOCTORS[p.doctor]}</td><td class="num">${p.lastVisit}</td><td>${p.next}</td><td><div class="row">${p.docs.some(d => d.new) ? '<span class="badge accent">Doc. nuovi</span>' : ''}${TASKS.some(t => t.p === p.id && t.status !== 'DONE') ? '<span class="badge">Task</span>' : ''}${clinical && p.flags.length ? `<span class="badge warning">${p.flags[0]}</span>` : ''}</div></td><td><button class="icon-btn" data-sheet="ctx" data-arg="${p.id}">${ICONS.more}</button></td></tr>`).join('')}
    </tbody></table></div>`;
};

/* ---------- SCHEDA PAZIENTE ---------- */
PAGES.patient = () => {
  const p = P[state.params.id]; if (!p) return emptyState('patients', 'Paziente non trovato', '');
  const tab = state.params.tab;
  const clinical = ['doctor', 'org_admin'].includes(state.role);
  const assistant = state.role === 'assistant';
  const tabs = clinical ? ['overview', 'timeline', 'visits', 'reports', 'exams', 'therapy', 'documents', 'communications', 'admin', 'audit'] : assistant ? ['overview', 'exams', 'documents'] : ['overview', 'documents', 'communications', 'admin'];
  const TL = { overview: 'Overview', timeline: 'Timeline', visits: 'Visite', reports: 'Referti', exams: 'Esami', therapy: 'Terapia', documents: 'Documenti', communications: 'Comunicazioni', admin: 'Amministrazione', audit: 'Audit' };
  const head = `
    <div class="row between wrap mb-16" style="align-items:flex-start">
      <div class="row" style="gap:16px"><div class="avatar" style="width:56px;height:56px;font-size:18px">${initials(p)}</div><div><h2 class="page-title">${fullName(p)}</h2><div class="page-sub num">${p.age} anni · ${p.sex} · nato/a il ${p.dob} · ID ${p.num} · ${p.phone} · ${DOCTORS[p.doctor]}</div><div class="row wrap mt-8">${p.flags.map(f => `<span class="badge warning">${ICONS.alert} ${f}</span>`).join('')}${p.docs.some(d => d.new) ? '<span class="badge accent">Documenti nuovi</span>' : ''}</div></div></div>
      <div class="actions">${clinical ? `<button class="btn primary" data-go="#/visit/${p.id}">${ICONS.play} Nuova visita</button>` : ''}<button class="btn" data-modal="upload">${ICONS.upload} Nuovo documento</button><button class="btn" data-sheet="newAppt" data-arg="${p.id}">${ICONS.agenda} Appuntamento</button><button class="btn" data-sheet="ctx" data-arg="${p.id}">${ICONS.more}</button></div>
    </div>
    <div class="tabs">${tabs.map(t => `<button class="tab ${tab === t ? 'active' : ''}" data-go="#/patients/${p.id}/${t}">${TL[t]}</button>`).join('')}</div>`;
  const body = ({ overview: patientOverview, timeline: patientTimeline, therapy: patientTherapy, exams: patientExams, documents: patientDocs, reports: patientReports, visits: patientVisits, communications: patientComms, admin: patientAdmin, audit: patientAudit })[tab] || patientOverview;
  return head + body(p, clinical);
};
function patientOverview(p, clinical) {
  if (!clinical && state.role !== 'assistant') return `<div class="grid grid-3">
    <div class="card"><div class="card-head"><span class="section-title">Prossimo appuntamento</span></div><div style="font-size:18px;font-weight:650">${p.next}</div><div class="meta">${DOCTORS[p.doctor]}</div></div>
    <div class="card"><div class="card-head"><span class="section-title">Attività aperte</span></div><div class="list">${TASKS.filter(t => t.p === p.id).map(t => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${t.title}</div><div class="sub">${t.due}</div></div></div>`).join('') || '<div class="caption">Nessuna</div>'}</div></div>
    <div class="card"><div class="card-head"><span class="section-title">Documenti</span></div><div class="list">${p.docs.map(d => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${DOC_TYPE[d.k] || d.k}</div><div class="sub">${d.d} · solo metadati per il tuo ruolo</div></div></div>`).join('') || '<div class="caption">Nessun documento</div>'}</div></div>
    <div class="card" style="grid-column:1/-1"><div class="banner">${ICONS.lock}<span>Le informazioni cliniche non sono visibili con il ruolo ${ROLES[state.role].label}. Ogni accesso è registrato con la finalità dichiarata.</span></div></div></div>`;
  const isRossi = p.id === 'p1';
  return `<div class="grid grid-main-side">
    <div class="stack">
      ${psCard(p)}
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><span class="section-title">Problem list</span><button class="btn sm ghost">${ICONS.plus}</button></div><div class="list">${p.problems.map(x => `<div class="list-item"><i class="dot ${x.s === 'active' ? 'accent' : 'warning'}"></i><div class="grow"><div class="name" style="font-size:13px">${x.l}</div><div class="sub">${x.s === 'active' ? 'Attiva' : 'In valutazione'} · dal ${x.since}</div></div></div>`).join('') || '<div class="caption">Nessun problema registrato</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Esami recenti</span></div><div class="list">${p.exams.map(e => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${e.t}</div><div class="sub">${e.d} · ${e.r}</div></div></div>`).join('') || '<div class="caption">Nessun esame</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Documenti nuovi</span></div><div class="list">${p.docs.filter(d => d.new).map(d => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${d.t}</div><div class="sub">${d.d}</div></div><span class="badge warning">Conferma</span></div>`).join('') || '<div class="caption">Nessun documento nuovo</div>'}</div></div>
        <div class="card"><div class="card-head"><span class="section-title">Comunicazioni recenti</span></div><div class="list">${COMMS.filter(c => c.p === p.id).map(c => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${c.t}</div><div class="sub">${c.at} · ${c.s}</div></div></div>`).join('') || '<div class="caption">Nessuna</div>'}</div></div>
      </div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><span class="section-title">Terapia attiva</span><span class="caption">${p.meds.length} farmaci</span></div>${p.meds.map(m => `<div class="med"><span class="n">${m.n}</span><span class="d">${m.d} · ${m.f}</span>${m.s ? `<span class="badge ${m.s === 'NEW' ? 'success' : 'accent'} right">${m.s}${m.from ? ' · da ' + m.from : ''}</span>` : ''}</div>`).join('') || '<div class="caption">Nessuna terapia registrata. Aggiungi la prima o importala da un referto.</div>'}</div>
      <div class="card"><div class="card-head"><span class="section-title">Prossimo appuntamento</span></div><div style="font-size:18px;font-weight:650">${p.next}</div><div class="meta">${DOCTORS[p.doctor]}</div></div>
      <div class="card"><div class="card-head"><span class="section-title">Attività aperte</span></div><div class="list">${TASKS.filter(t => t.p === p.id && t.status !== 'DONE').map(t => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${t.title}</div><div class="sub">${t.due} · ${ROLES[t.assignee === 'secretary' ? 'secretary' : t.assignee === 'assistant' ? 'assistant' : 'doctor'].label}</div></div></div>`).join('') || '<div class="caption">Nessuna</div>'}</div></div>
    </div></div>`;
}
function patientTimeline(p) {
  const items = p.id === 'p1' ? [['Oggi', [['09:30', 'Visita — Controllo aritmologico', 'In corso · Dr.ssa Bianchi', 'now'], ['09:26', 'ECG', 'Ritmo sinusale, FC 72 · M. Rezzonico', 'done']]], ['8 settembre 2026', [['17:40', 'Documento — Lettera di dimissione', 'Ospedale Regionale · classificato dall\'AI, da confermare', '']]], ['4 settembre 2026', [['10:15', 'Visita — Controllo cardiologico', 'Dr.ssa Bianchi · referto FINAL inviato 05.09', 'done'], ['10:40', 'Ecocardiogramma', 'FE 58 %, AS 42 mm', 'done'], ['10:55', 'Terapia modificata', 'Ramipril 5 → 10 mg · Bisoprololo 2,5 → 5 mg', 'done']]], ['28 agosto 2026', [['—', 'Laboratorio', 'Creatinina 92 µmol/l · K 4,2 · TSH 1,8', 'done']]], ['12 agosto 2026', [['—', 'Holter ECG 24h', 'FA parossistica, burden 3 %', 'done']]], ['11 febbraio 2025', [['—', 'Visita — Controllo', 'Dr.ssa Bianchi', 'done']]]] : [['—', [['—', 'Ultima visita', p.lastVisit, 'done']]]];
  return `<div class="row wrap mb-16"><span class="chip active">Tutti</span><span class="chip">Visite</span><span class="chip">Esami</span><span class="chip">Terapia</span><span class="chip">Documenti</span><span class="chip">Comunicazioni</span><button class="chip right" data-ai="Mostrami solo gli eventi cardiologici degli ultimi due anni">${ICONS.ai} "solo eventi cardiologici ultimi 2 anni"</button></div>
    <div class="card"><div class="tl">${items.map(([d, ev]) => `<div class="tl-day">${d}</div>${ev.map(([t, a, b, k]) => `<div class="tl-item ${k}"><span class="time num">${t}</span><div class="body"><div class="t">${a}</div><div class="s">${b}</div></div></div>`).join('')}`).join('')}</div></div>`;
}
function patientTherapy(p) {
  return `<div class="card"><div class="card-head"><span class="section-title">Terapia strutturata</span><button class="btn sm primary">${ICONS.plus} Farmaco</button></div>
    <div class="table-wrap flat" style="box-shadow:none"><table class="dense"><thead><tr><th>Farmaco</th><th>Dose</th><th>Frequenza</th><th>Via</th><th>Inizio</th><th>Stato</th><th>Fonte</th></tr></thead><tbody>${p.meds.map(m => `<tr><td><b>${m.n}</b></td><td class="num">${m.d}${m.from ? ` <span class="caption">(era ${m.from})</span>` : ''}</td><td>${m.f}</td><td>os</td><td class="num">${m.since || '—'}</td><td>${m.s ? `<span class="badge ${m.s === 'NEW' ? 'success' : 'accent'}">${m.s}</span>` : '<span class="badge">Attivo</span>'}</td><td><span class="src">Visita 04.09.2026</span></td></tr>`).join('') || '<tr><td colspan="7" class="caption">Nessuna terapia registrata</td></tr>'}</tbody></table></div></div>
    ${p.id === 'p1' ? `<div class="card mt-16"><div class="card-head"><span class="section-title">Timeline modifiche</span></div><div class="tl"><div class="tl-item done"><span class="time num">04.09</span><div class="body"><div class="t">Bisoprololo 2,5 → 5 mg <span class="badge accent">CHANGED</span></div><div class="s">Motivo: controllo frequenza · Dr.ssa Bianchi · evidenza: trascrizione 00:12</div></div></div><div class="tl-item done"><span class="time num">04.09</span><div class="body"><div class="t">Ramipril 5 → 10 mg <span class="badge accent">CHANGED</span></div><div class="s">Motivo: PA non a target</div></div></div><div class="tl-item done"><span class="time num">2023</span><div class="body"><div class="t">Apixaban 5 mg 2x/die <span class="badge success">NEW</span></div><div class="s">Anticoagulazione per FA · CHA₂DS₂-VASc 3</div></div></div></div></div>` : ''}`;
}
function patientExams(p) {
  return `<div class="grid grid-3">${p.exams.map(e => `<div class="card"><div class="card-head"><span class="section-title">${e.t}</span><span class="caption num">${e.d}</span></div><div style="font-weight:600">${e.r}</div>${e.k === 'echo' ? '<div class="kv mt-8" style="grid-template-columns:90px 1fr;font-size:12.5px"><b>FE</b><span>58 %</span><b>AS</b><span>42 mm</span><b>DTD VS</b><span>50 mm</span><b>IM</b><span>lieve</span><b>Pericardio</b><span>nulla</span></div>' : e.k === 'holter' ? '<div class="kv mt-8" style="grid-template-columns:90px 1fr;font-size:12.5px"><b>Durata</b><span>24 h</span><b>FC media</b><span>68</span><b>FA burden</b><span>3 %</span><b>Pause</b><span>nessuna > 2 s</span></div>' : '<div class="kv mt-8" style="grid-template-columns:90px 1fr;font-size:12.5px"><b>Ritmo</b><span>sinusale</span><b>FC</b><span>72</span><b>PR</b><span>160 ms</span><b>QRS</b><span>92 ms</span><b>QTc</b><span>410 ms</span></div>'}<div class="row mt-8"><button class="btn sm ghost">${ICONS.file} Documento</button><button class="btn sm ghost" data-ai="Confronta questi due ecocardiogrammi">${ICONS.ai} Confronta</button></div></div>`).join('') || emptyState('activity', 'Nessun esame registrato', 'Gli esami strumentali compariranno qui appena caricati o refertati.')}</div>`;
}
function patientDocs(p) {
  return `<div class="card"><div class="card-head"><span class="section-title">Documenti</span><button class="btn sm primary" data-modal="upload">${ICONS.upload} Carica</button></div><div class="list">${p.docs.map(d => `<div class="list-item clickable"><div class="avatar-sm">${ICONS.file}</div><div class="grow"><div class="name">${d.t}</div><div class="sub">${DOC_TYPE[d.k] || d.k} · ${d.d}</div></div>${d.new ? '<span class="badge warning">Da confermare</span>' : '<span class="badge success">Archiviato</span>'}<button class="btn sm ghost">${ICONS.eye}</button></div>`).join('') || emptyState('documents', 'Nessun documento', 'Carica il primo documento o attendi la classificazione automatica.')}</div></div>`;
}
function patientReports(p) {
  const rs = REPORTS.filter(r => r.p === p.id);
  return `<div class="card"><div class="card-head"><span class="section-title">Referti</span></div><div class="list">${rs.map(r => `<div class="list-item clickable" data-go="#/reports/${r.id === 'r1' ? 'r1' : 'r1'}"><div class="grow"><div class="name">${r.type} · ${r.date}</div><div class="sub">${DOCTORS[r.doc]} · ${r.version}</div></div><span class="badge ${r.status === 'READY_FOR_REVIEW' ? 'warning' : r.status === 'ARCHIVED' || r.status === 'APPROVED' ? 'success' : ''}">${RSTATUS[r.status]}</span></div>`).join('') || emptyState('reports', 'Nessun referto', '')}</div></div>`;
}
function patientVisits(p) { return `<div class="card"><div class="tl">${['09.09.2026 · Controllo aritmologico · in corso', '04.09.2026 · Controllo cardiologico · referto FINAL', '11.02.2025 · Controllo · referto FINAL', '03.2023 · Prima visita · referto FINAL'].map((v, i) => `<div class="tl-item ${i ? 'done' : 'now'}"><div class="body"><div class="t">${v}</div></div></div>`).join('')}</div></div>`; }
function patientComms(p) { return `<div class="card"><div class="list">${COMMS.filter(c => c.p === p.id).map(c => `<div class="list-item"><div class="avatar-sm">${ICONS[c.k.startsWith('call') ? 'phone' : c.k.startsWith('email') ? 'mail' : 'comms']}</div><div class="grow"><div class="name">${c.t}</div><div class="sub">${c.at} · ${c.s} · ${c.by}</div></div></div>`).join('') || emptyState('comms', 'Nessuna comunicazione', 'Telefonate, e-mail e note collegate compariranno qui.')}</div><div class="row mt-16"><button class="btn" data-sheet="call" data-arg="${p.id}">${ICONS.phone} Nuova chiamata</button><button class="btn">${ICONS.mail} E-mail</button><button class="btn">Nota interna</button></div></div>`; }
function patientAdmin(p) { return `<div class="grid grid-2"><div class="card"><div class="card-head"><span class="section-title">Anagrafica</span><button class="btn sm ghost">Modifica</button></div><div class="kv"><b>Telefono</b><span>${p.phone}</span><b>E-mail</b><span>${p.email || '—'}</span><b>Medico curante</b><span>${p.gp || '—'}</span><b>Assicurazione</b><span>LAMal · base</span><b>Lingua</b><span>Italiano</span></div></div><div class="card"><div class="card-head"><span class="section-title">Consensi</span></div><div class="list"><div class="list-item"><i class="dot success"></i><div class="grow"><div class="name" style="font-size:13px">Privacy / trattamento dati</div><div class="sub">firmato 03.2023</div></div></div><div class="list-item"><i class="dot success"></i><div class="grow"><div class="name" style="font-size:13px">Invio referti via e-mail</div><div class="sub">firmato 03.2023</div></div></div><div class="list-item"><i class="dot"></i><div class="grow"><div class="name" style="font-size:13px">Registrazione visita</div><div class="sub">non richiesto (dettatura post-visita)</div></div></div></div></div><div class="card"><div class="card-head"><span class="section-title">Fatture</span></div><div class="list">${INVOICES.filter(i => i.p === p.id).map(i => `<div class="list-item"><div class="grow"><div class="name" style="font-size:13px">${i.n}</div><div class="sub">${i.date} · ${i.amount}</div></div><span class="badge">${i.status}</span></div>`).join('') || '<div class="caption">Nessuna fattura</div>'}</div></div></div>`; }
function patientAudit(p) { return `<div class="card"><div class="card-head"><span class="section-title">Accessi a questo paziente (autorizzato)</span><button class="btn sm" data-toast="Estratto accessi generato · registrato in audit">${ICONS.file} Estratto per il paziente</button></div><div class="table-wrap" style="box-shadow:none"><table class="dense"><thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Risorsa</th><th>Finalità</th></tr></thead><tbody>${AUDIT.filter(a => a.p.startsWith(p.last)).map(a => `<tr><td class="num">${a.at}</td><td>${a.who} <span class="caption">${a.role}</span></td><td><code>${a.act}</code></td><td>${a.res}</td><td>${a.purpose}</td></tr>`).join('')}</tbody></table></div></div>`; }

/* ---------- VISIT MODE ---------- */
PAGES.visit = () => {
  const p = P[state.params.id] || P.p1;
  const ai = state.aiOpen;
  const sec = (l, v, ph) => `<div class="editor-sec"><label>${l}</label>${v !== undefined ? v : `<textarea class="textarea" placeholder="${ph}"></textarea>`}</div>`;
  return `
    <div class="visit-top" style="margin:-24px -28px 0"><button class="btn ghost" data-go="#/patients/${p.id}">${ICONS.arrowL} ${fullName(p)}</button><span class="meta">Visita — 9 set 2026 · Controllo aritmologico</span><span class="rec"><i class="dot danger"></i>Registrazione 02:14</span><span class="caption right" id="autosave">Salvato · 09:41</span><span class="caption">Laura sta visualizzando</span><button class="btn" onclick="toggleAI()">${ICONS.ai} AI</button><button class="btn primary" data-modal="finishVisit">${ICONS.check} Termina visita</button></div>
    <div class="visit-grid ${ai ? 'no-ai' : 'no-ai'}" style="margin:0 -28px;padding:16px 28px">
      <div class="visit-col card flat" style="padding:16px">
        <div class="section-title mb-16">Contesto</div>
        <div class="card ai tight" style="margin-bottom:12px"><div class="row" style="margin-bottom:6px">${aiTag()}</div><div style="font-size:13px;line-height:1.5"><b>Perché viene:</b> controllo FA parossistica dopo recente ricovero.<br><b>Cosa è cambiato:</b> Ramipril 5→10, Bisoprololo 2,5→5; Holter 12.08 (burden 3 %); palpitazioni serali; lettera di dimissione 08.09.<br><b>Da verificare:</b> prossimo controllo indicato ma non prenotato.</div><div class="row mt-8"><span class="src">Visita 04.09</span><span class="src">Holter</span><span class="src">Doc d1</span></div></div>
        <details class="collapsible" open><summary>${ICONS.pill} Terapia <span class="badge success">✓ ${p.meds.length}</span><span class="chev">${ICONS.chevR}</span></summary><div class="cbody">${p.meds.map(m => `<div>${m.n} ${m.d} · ${m.f}${m.s ? ' <span class="badge accent">' + m.s + '</span>' : ''}</div>`).join('')}</div></details>
        <details class="collapsible"><summary>${ICONS.activity} Esami recenti <span class="badge">${p.exams.length}</span><span class="chev">${ICONS.chevR}</span></summary><div class="cbody">${p.exams.map(e => `<div>${e.t} · ${e.d} · ${e.r}</div>`).join('')}</div></details>
        <details class="collapsible"><summary>${ICONS.heart} Problemi aperti <span class="badge">${p.problems.length}</span><span class="chev">${ICONS.chevR}</span></summary><div class="cbody">${p.problems.map(x => `<div>${x.l} · ${x.s === 'active' ? 'attiva' : 'in valutazione'}</div>`).join('')}</div></details>
        <details class="collapsible"><summary>${ICONS.documents} Documenti nuovi <span class="badge warning">1</span><span class="chev">${ICONS.chevR}</span></summary><div class="cbody">Lettera di dimissione 08.09 — da confermare <button class="btn sm" data-toast="Documento confermato e associato" data-undo>Conferma</button></div></details>
        <details class="collapsible"><summary>${ICONS.alert} Da verificare <span class="badge warning">1</span><span class="chev">${ICONS.chevR}</span></summary><div class="cbody">Prossimo controllo "marzo 2027" senza appuntamento in agenda.</div></details>
      </div>
      <div class="visit-col card" style="padding:20px">
        ${sec('Motivo', undefined, 'Controllo aritmologico…')}
        ${sec('Anamnesi', undefined, 'Riferisce palpitazioni serali…')}
        ${sec('Esame obiettivo', undefined, 'Toni ritmici, non soffi…')}
        ${sec('Parametri', `<div class="vitals"><div class="vital"><div class="v num">135/85</div><div class="l">PA mmHg</div></div><div class="vital"><div class="v num">72</div><div class="l">FC bpm</div></div><div class="vital"><div class="v num">97 %</div><div class="l">SpO₂</div></div><div class="vital"><div class="v num">82 kg</div><div class="l">Peso · BMI 26,1</div></div></div><div class="caption mt-8">Inseriti da M. Rezzonico alle 09:20</div>`)}
        ${sec('Esami', `<div class="row wrap"><span class="chip">ECG 09.09 · sinusale 72</span><span class="chip">Holter 12.08</span><span class="chip">Eco 04.09</span><button class="chip" data-toast="Ordine esame (prototipo)">${ICONS.plus} Ordina</button></div>`)}
        ${sec('Farmaci', `${p.meds.map(m => `<div class="med"><span class="n">${m.n}</span><span class="d">${m.d} · ${m.f}</span><span class="badge success right">✓ conferma</span></div>`).join('')}<div class="row mt-8"><button class="btn sm" data-toast="Aggiungi farmaco (prototipo)">${ICONS.plus} Farmaco</button></div>`)}
        ${sec('Diagnosi', `<div class="row wrap">${p.problems.map(x => `<span class="chip ${x.s === 'active' ? 'active' : ''}">${x.l}</span>`).join('')}<button class="chip">${ICONS.plus}</button></div>`)}
        ${sec('Piano', undefined, 'Holter di controllo, rivalutazione a 6 mesi…')}
        ${sec('Referto', `<div class="row wrap"><button class="btn ai" data-toast="Registrazione in corso · il file verrà elaborato automaticamente a fine visita">${ICONS.mic} Detta referto</button><button class="btn" data-go="#/reports/r1">${ICONS.reports} Bozza AI pronta (10:44)</button><span class="caption">Il referto resta bozza finché non lo approvi.</span></div>`)}
      </div>
    </div>`;
};
