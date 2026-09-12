/* ReferralFlow prototype - Analytics Agent + Finder Agent
   Principio: l'AI non calcola numeri e non genera SQL. Traduce la domanda in una
   query dichiarativa (metrica registrata + periodo + dimensione, oppure filtri
   d'archivio); il motore deterministico esegue; il modello verbalizza SOLO il
   result set. Ogni risposta porta definizione della metrica, periodo, copertura
   dei dati e un drill-down verso la pagina che mostra gli stessi numeri. */

/* Cosa può essere interrogato da quale ruolo (pre-filtro, non filtro sull'output) */
const AI_ACCESS = {
  secretary: { financial: 'billing', practitioner: false, archive: 'meta', technical: false },
  assistant: { financial: false, practitioner: false, archive: 'clinical', technical: false },
  doctor: { financial: 'own', practitioner: 'own', archive: 'clinical', technical: false },
  org_admin: { financial: true, practitioner: true, archive: 'clinical', technical: 'view' },
  tech_admin: { financial: false, practitioner: false, archive: false, technical: true },
};
const chf = n => 'CHF ' + n.toLocaleString('de-CH', { maximumFractionDigits: 0 });
const aiDeny = (what, why) => `Non posso mostrarti ${what} con il tuo ruolo (${ROLES[state.role].label}).<br><span class="caption">${why}</span><div class="srcs"><span class="src">Permission Engine - pre-filtro</span></div>`;

/* Blocco risposta "metrica": intestazione, righe, definizione, drill-down */
function metricBlock(o) {
  const m = METRICS[o.metric] || {};
  return `<div class="ai-metric">
    <div class="mh"><span class="badge ai">metrica</span><b>${o.title || m.label}</b><span class="caption right">${m.v || ''}</span></div>
    ${o.body}
    <div class="mfoot"><span>${o.period || FINANCE.period}</span><span class="sep">-</span><span>${o.coverage || 'dati completi'}</span>
      <button class="btn sm ghost" data-modal="metricDef" data-arg="${o.metric}">Definizione</button>
      ${o.drill ? `<button class="btn sm" data-go="${o.drill}">Apri i dati</button>` : ''}</div>
  </div>`;
}
const mrows = rows => `<div class="mrows">${rows.map(r => `<div class="mrow"><span class="l">${r[0]}</span><span class="v num">${r[1]}</span>${r[2] ? `<span class="d ${r[3] || ''}">${r[2]}</span>` : ''}</div>`).join('')}</div>`;
const miniBars = (vals, labels, max) => `<div class="mini-bars">${vals.map((v, i) => `<div class="mb"><i style="height:${Math.round(v / max * 100)}%"></i><span>${labels[i]}</span></div>`).join('')}</div>`;

/* ---------- Analytics Agent (dominio economico e gestionale) ---------- */
function aiFinance(ql) {
  const acc = AI_ACCESS[state.role] || {};
  const fin = acc.financial;
  const money = /fatturat|ricav|incass|bilanc|economic|margin|utile|costi|spes|insolut|credit|scadut|redditiz|profittevol|tariff|previsione|chiuderemo|quanto abbiamo|quanto ha/.test(ql);
  const compare = /profittevol|redditiz|rende di piu|piu produttiv|classifica|quale medico|confronto tra medic|chi fattura/.test(ql);
  if (!money && !compare) return null;
  if (state.visitMode) return `Durante la visita il dominio economico è disattivato: in modalità visita l'AI risponde solo su dati clinici e organizzativi del paziente aperto.<br><span class="caption">Regola deterministica, non una preferenza del modello: evita che un dato economico entri nel ragionamento clinico.</span><div class="srcs"><span class="src">Policy: no financial reasoning in clinical context</span></div>`;
  if (state.role === 'tech_admin') return aiDeny('dati economici', 'Il ruolo tecnico vede metriche di sistema, non dati clinici né finanziari. E\' una separazione voluta: chi amministra le macchine non deve poter leggere i conti dello studio.');
  if (state.role === 'assistant') return aiDeny('dati economici', 'Il ruolo clinico di supporto non ha la classe dato financial. Puoi chiedermi agenda, preparazione, documenti ed esami.');

  /* Confronto tra medici: la domanda più delicata dell'intero dominio */
  if (compare) {
    if (acc.practitioner === true) {
      const d = [...FINANCE.byDoctor].sort((a, b) => b.contribution - a.contribution);
      return `"Più profittevole" non è una metrica sola: cambia la risposta a seconda di come la definisci. Te le mostro tutte e tre.
      ${metricBlock({ metric: 'contribution_practitioner', title: 'Contributo (fatturato meno costi diretti)', body: mrows(d.map((x, i) => [`${i + 1}. ${x.name}`, chf(x.contribution), x.mix])), drill: '#/administration/practitioners' })}
      ${metricBlock({ metric: 'revenue_per_hour', title: 'Fatturato per ora di agenda', body: mrows([...FINANCE.byDoctor].sort((a, b) => b.revPerHour - a.revPerHour).map((x, i) => [`${i + 1}. ${x.name}`, chf(x.revPerHour) + '/h', x.days])), drill: '#/administration/practitioners' })}
      <b>Perché le due classifiche non coincidono</b><br>
      Gandolfi è primo per fatturato/ora ma ultimo per contributo: lavora due giorni e ha una retrocessione del 60 %. Bianchi ha il contributo più alto perché ha più ore di agenda, non perché sia più efficiente per ora.<br>
      <span class="prov verify">Da leggere con cautela</span> Il contributo non include i costi di struttura ripartiti, e il mix di prestazioni non è scelto liberamente dal medico: chi fa più prime visite e casi complessi ha per costruzione un valore/ora più basso.
      <div class="caption mt-8">Questa richiesta è registrata nell'audit come PRACTITIONER_COMPARISON_VIEWED con il testo originale. L'AI non produce da sola classifiche del personale né le usa in altri contesti.</div>
      <div class="srcs"><span class="src">metric registry - 2 metriche</span><span class="src">fatture 01-09.2026</span><span class="src">agenda - ore aperte</span></div>`;
    }
    if (acc.practitioner === 'own') {
      const me = FINANCE.byDoctor[0];
      return `Ti mostro i tuoi numeri. La classifica tra colleghi non è disponibile con il tuo ruolo: i confronti di produttività tra medici richiedono il ruolo di amministratore organizzativo e sono tracciati singolarmente.
      ${metricBlock({ metric: 'contribution_practitioner', title: 'I tuoi numeri - Dr.ssa Bianchi', body: mrows([['Visite erogate', me.visits], ['Fatturato attribuito', chf(me.revenue)], ['Fatturato per ora di agenda', chf(me.revPerHour) + '/h'], ['Contributo', chf(me.contribution)], ['Valore medio visita', chf(me.avgVisit)]]), drill: '#/statistics' })}
      <div class="srcs"><span class="src">scope: own</span><span class="src">fatture attribuite</span></div>`;
    }
    return aiDeny('il confronto economico tra medici', 'E\' una valutazione del personale: richiede il permesso view_practitioner_performance (amministratore organizzativo) e viene registrata in audit ogni volta.');
  }

  /* Crediti aperti e insoluti: operativi, quindi anche per la segreteria */
  if (/insolut|credit|scadut|non pagat|sollecit|da incassare/.test(ql)) {
    if (fin !== true && fin !== 'billing') return aiDeny('i crediti aperti dello studio', fin === 'own' ? 'Il tuo scope arriva ai numeri attribuiti a te: la posizione crediti dello studio e amministrativa.' : 'Classe dato financial non accessibile al tuo ruolo.');
    const tot = FINANCE.aging.reduce((s, a) => s + a[1], 0);
    return metricBlock({
      metric: 'open_receivables', title: 'Crediti aperti per fascia di scadenza',
      body: mrows(FINANCE.aging.map(a => [a[0], chf(a[1]), a[0] === 'oltre 90 gg' ? 'sollecito 3 inviato' : '', a[0] === 'oltre 90 gg' ? 'warn' : ''])) +
        `<div class="mrow tot"><span class="l"><b>Totale aperto</b></span><span class="v num"><b>${chf(tot)}</b></span></div>
         <div class="caption mt-8">1 posizione oltre 90 gg: Sara Riva, fattura 2026-0371, CHF 285. Posso preparare un sollecito, l'invio resta manuale.</div>
         <div class="row mt-8"><button class="btn sm" data-toast="Bozza di sollecito preparata - invio manuale">Prepara sollecito</button></div>`,
      period: 'al 09.09.2026', drill: '#/administration/invoices',
    }) + `<div class="srcs"><span class="src">invoices - 34 aperte</span><span class="src">pagamenti - ultimi 90 gg</span></div>`;
  }

  /* Costi e margine: solo direzione */
  if (/cost|margin|utile|spes|quanto ci costa/.test(ql)) {
    if (fin !== true) return aiDeny('costi e marginalità', 'Sono dati di direzione (permesso view_financial completo).' + (fin === 'billing' ? ' Con il tuo ruolo posso vedere fatture, incassi e crediti aperti.' : ' Con il tuo ruolo posso mostrarti i numeri attribuiti a te.'));
    const tot = FINANCE.costs.reduce((s, c) => s + c[1], 0);
    return metricBlock({
      metric: 'revenue_issued', title: 'Conto economico semplificato',
      body: mrows([['Fatturato emesso', FINANCE.kpi.issued], ['Costi totali', chf(tot)], ...FINANCE.costs.map(c => ['   ' + c[0], chf(c[1]), Math.round(c[1] / tot * 100) + ' %']), ['Margine', FINANCE.kpi.margin, FINANCE.kpi.marginPct]]),
      coverage: 'settembre parziale (9 gg su 30)', drill: '#/administration/costs',
    }) + `<span class="prov verify">Attenzione al periodo</span> Settembre è parziale: il margine dell'anno non è proiettabile moltiplicando questo dato.<div class="srcs"><span class="src">fatture</span><span class="src">registro costi</span><span class="src">metric registry v3</span></div>`;
  }

  /* Prestazioni: quanto rende ciascun tipo di prestazione */
  if (/prestazion|quale esame|tariff|servizi|mix/.test(ql)) {
    if (fin !== true) {
      if (fin === 'billing' || fin === 'own') return metricBlock({ metric: 'visits_count', title: 'Volumi per prestazione', body: mrows(FINANCE.byService.map(s => [s.s, s.n + ' erogate'])), drill: '#/statistics' }) + `<div class="caption mt-8">Con il tuo ruolo vedi i volumi, non i ricavi per prestazione.</div>`;
      return aiDeny('i ricavi per prestazione', 'Classe dato financial.');
    }
    return metricBlock({
      metric: 'revenue_issued', title: 'Ricavo per tipo di prestazione',
      body: mrows(FINANCE.byService.map(s => [s.s, chf(s.rev), `${s.n} x ${chf(s.avg)}`])),
      drill: '#/administration/services',
    }) + `<span class="prov inferred">Osservazione</span> L'ecocardiogramma è il 24 % dei volumi ma il 31 % dei ricavi. Non è un consiglio clinico: la scelta della prestazione resta del medico.<div class="srcs"><span class="src">fatture per riga</span><span class="src">catalogo prestazioni</span></div>`;
  }

  /* Previsione: non è una metrica certificata, e va detto */
  if (/previsione|proiezione|chiuderemo|fine anno|stima/.test(ql)) {
    if (fin !== true) return aiDeny('le proiezioni economiche', 'Classe dato financial completa.');
    return `<span class="prov inferred">Stima, non una metrica</span> Questa non è una voce del metric registry: è un calcolo con ipotesi esplicite, quindi non va usato per decisioni contrattuali senza controllo dell'amministrazione.
    ${metricBlock({ metric: 'revenue_issued', title: 'Proiezione fatturato 2026', body: mrows([['Consuntivo gen-ago', chf(355000)], ['Settembre (9 gg, in corso)', chf(18400)], ['Proiezione set-dic', chf(168000), 'ipotesi'], ['Totale stimato 2026', chf(541400), '+7,2 % vs 2025']]), coverage: 'ipotesi: stessa apertura di agenda del 2025, nessuna assenza prolungata, tariffe invariate' })}
    <div class="caption">Le ipotesi sono parte della risposta: se ne cambi una il numero cambia. Chiedimi "e se Gandolfi non rinnova?" per rifare il calcolo.</div>
    <div class="srcs"><span class="src">consuntivo 2026</span><span class="src">stagionalita' 2024-2025</span></div>`;
  }

  /* Quadro economico generale */
  if (fin === 'own') {
    const me = FINANCE.byDoctor[0];
    return `Ti mostro la tua parte. I conti complessivi dello studio richiedono il permesso view_financial (amministrazione).
    ${metricBlock({ metric: 'revenue_issued', title: 'Fatturato attribuito a te', body: mrows([['Gen-Set 2026', chf(me.revenue)], ['Visite erogate', me.visits], ['Valore medio visita', chf(me.avgVisit)], ['Fatturato per ora di agenda', chf(me.revPerHour) + '/h']]), drill: '#/statistics' })}
    <div class="srcs"><span class="src">scope: own</span></div>`;
  }
  if (!fin) return aiDeny('i dati economici', 'Classe dato financial non prevista per il tuo ruolo.');
  const max = Math.max(...FINANCE.months.map(m => m.issued));
  const body = mrows([
    ['Fatturato emesso', FINANCE.kpi.issued, '+6,4 % vs 2025', 'up'],
    ['Incassato', FINANCE.kpi.collected, ''],
    ['Aperto', FINANCE.kpi.open, 'di cui ' + FINANCE.kpi.overdue + ' scaduto', 'warn'],
    ['Giorni medi di incasso', FINANCE.kpi.dso, '-4 gg', 'up'],
    ['Visite erogate', FINANCE.kpi.visits, chf(251) + ' per visita'],
  ]) + miniBars(FINANCE.months.map(m => m.issued), FINANCE.months.map(m => m.m), max);
  return metricBlock({ metric: 'revenue_issued', title: 'Quadro economico ' + FINANCE.period, body, coverage: 'settembre parziale: 9 giorni su 30', drill: '#/administration/invoices' })
    + `Agosto basso è stagionale (chiusura due settimane), non un calo: nello stesso mese del 2025 il valore era ${chf(26900)}.
    ${fin === 'billing' ? '<div class="caption mt-8">Con il tuo ruolo vedi fatturato, incassi e crediti. Costi, margini e numeri per medico non sono accessibili.</div>' : ''}
    <div class="srcs"><span class="src">invoices - 1642 righe</span><span class="src">pagamenti</span><span class="src">metric registry v3</span></div>`;
}

/* ---------- Finder Agent (archivio storico) ----------
   Traduce la domanda in filtri strutturati; la ricerca semantica interviene solo
   dopo il pre-filtro su paziente e permessi. Restituisce SEMPRE una lista di
   documenti apribili, mai un riassunto che sostituisce il documento originale. */
const dmy = s => s.split('-').reverse().join('.');
const ARCH_TYPES = [
  [/ecocardio|\beco\b|ecocardiogramm/, ['echo'], 'ecocardiogrammi'],
  [/holter/, ['holter'], 'Holter'],
  [/\becg\b|elettrocardio/, ['ecg'], 'ECG'],
  [/ergometr|prova da sforzo|sforzo/, ['ergo'], 'test ergometrici'],
  [/laborator|sangue|analisi|esami del|chimica|lipid/, ['lab'], 'esami di laboratorio'],
  [/dimission|lettera|ricover|ospedal/, ['discharge'], 'lettere e dimissioni'],
  [/refert|visita|controllo/, ['visit'], 'referti di visita'],
  [/pacemaker|\bpm\b/, ['pm'], 'controlli pacemaker'],
];
function archScope(ql) {
  if (state.patientCtx) return state.patientCtx;
  const hit = PATIENTS.find(p => ql.includes(p.last.toLowerCase()) || ql.includes(fullName(p).toLowerCase()));
  return hit ? hit.id : null;
}
function archRows(items, meta) {
  return `<div class="ai-res">${items.map(a => {
    const t = ARCH_TEXT[a.text];
    const vals = !meta && a.vals ? Object.entries(a.vals).map(([k, v]) => `${k} ${v}`).join(' - ') : '';
    return `<div class="r" data-doc="${a.id}" title="Apri accanto">
      <span class="d num">${dmy(a.date)}</span>
      <div class="t"><b>${esc(a.title)}</b><span class="s">${ARCH_KIND[a.kind]} - ${esc(a.by)} - ${a.origin === 'internal' ? 'interno' : 'esterno'}${vals ? ' - ' + esc(vals) : ''}</span></div>
      <span class="badge ${t[1]}">${t[0]}</span></div>`;
  }).join('')}</div>`;
}

function aiArchive(ql) {
  const acc = AI_ACCESS[state.role] || {};
  const typeHit = ARCH_TYPES.find(t => t[0].test(ql));
  const finderVerb = /trova|cerca|mostrami|recupera|archivio|vecch|precedent|storic|passat|anni fa|prima del|dopo il|ultim|tutti|tutte|quando/.test(ql);
  const series = /valori|andamento|evoluzione|serie|come è cambiat|come e cambiat/.test(ql);
  const par = [[/\bfe\b|frazione|eiezione/, 'FE'], [/creatinin/, 'Creatinina'], [/ldl|colesterol/, 'LDL'], [/probnp|bnp/, 'NT-proBNP'], [/atrio|\bas\b/, 'AS']].find(x => x[0].test(ql));
  if (!finderVerb && !(series && (typeHit || par))) return null;
  if (/posto|slot|disponibil|prenot|agenda|conflitt|buco|richiam/.test(ql)) return null;
  if (!acc.archive) return aiDeny('l\'archivio clinico', 'Il ruolo tecnico non accede ai contenuti clinici, nemmeno storici. Puoi chiedermi metriche di sistema, job e storage.');
  const pid = archScope(ql);
  const meta = acc.archive === 'meta';

  /* Serie di un parametro nel tempo */
  if (series && par && pid && !meta) {
    const pts = ARCHIVE.filter(a => a.p === pid && a.vals && a.vals[par[1]]).sort((a, b) => a.date.localeCompare(b.date));
    if (!pts.length) return `Non trovo valori di ${par[1]} per ${fullName(P[pid])} nei documenti con testo estratto.<div class="srcs"><span class="src">archivio - 0 risultati</span></div>`;
    const img = ARCHIVE.filter(a => a.p === pid && a.text === 'image_only').length;
    return `<b>${par[1]} nel tempo - ${esc(fullName(P[pid]))}</b>
      ${archRows(pts)}
      <div class="caption mt-8">${pts.map(a => `${a.date.slice(0, 4)}: ${a.vals[par[1]]}`).join('  |  ')}</div>
      <span class="prov verify">Da verificare</span> I valori 2021 vengono da OCR di un referto esterno non confermato da una persona: apri il documento prima di usarli.
      ${img ? `<br><span class="prov conflict">Copertura incompleta</span> ${img} documenti (2018) sono scansioni senza testo estratto: se contengono valori di ${par[1]}, io non li vedo.` : ''}
      <div class="srcs"><span class="src">archivio - ${pts.length} documenti</span><span class="src">estrazione valori</span></div>`;
  }

  /* Ricerca per tipo e periodo */
  let items = ARCHIVE.slice();
  if (pid) items = items.filter(a => a.p === pid);
  if (typeHit) items = items.filter(a => typeHit[1].includes(a.type));
  let periodo = 'tutto l\'archivio';
  const yr = ql.match(/(19|20)\d{2}/);
  const ago = ql.match(/(\d+)\s*anni fa/);
  if (yr) { items = items.filter(a => a.date.startsWith(yr[0])); periodo = 'anno ' + yr[0]; }
  else if (ago) { const y = String(2026 - (+ago[1])); items = items.filter(a => a.date.startsWith(y)); periodo = 'anno ' + y; }
  else if (/prima del|precedenti al/.test(ql)) { const b = ql.match(/prima del (?:\d+\s+\w+\s+)?((19|20)\d{2})/); if (b) { items = items.filter(a => a.date < b[1]); periodo = 'prima del ' + b[1]; } }
  else if (/vecch|più vecchi|piu vecchi|storic|passat/.test(ql)) { items = items.filter(a => a.date < '2025-01-01'); periodo = 'prima del 2025'; }
  items.sort((a, b) => b.date.localeCompare(a.date));
  const last = /ultim/.test(ql);
  if (last) items = items.slice(0, 1);

  const who = pid ? esc(fullName(P[pid])) : 'tutti i pazienti che puoi vedere';
  const what = typeHit ? typeHit[2] : 'documenti';
  if (!items.length) return `Nessun risultato: ${what} di ${who}, ${periodo}.<br>Posso allargare la ricerca a tutto l'archivio o a un altro tipo di documento.
    <div class="row mt-8"><button class="btn sm" data-sheet="findDocs">Ricerca avanzata</button></div>
    <div class="srcs"><span class="src">filtri: ${esc(what)} / ${esc(periodo)}</span></div>`;
  const pool = pid ? ARCHIVE.filter(a => a.p === pid) : ARCHIVE;
  window.__lastArchiveItems = meta ? [] : items.slice(); window.__lastArchiveCount = items.length;
  const img = pool.filter(a => a.text === 'image_only').length;
  const ocr = items.filter(a => a.text === 'ocr_unverified').length;
  return `<b>${items.length} ${items.length === 1 ? 'risultato' : 'risultati'}</b> - ${what}, ${who}, ${periodo}, dal più recente.
    ${archRows(items, meta)}
    ${meta ? '<div class="caption mt-8">Con il tuo ruolo vedi che il documento esiste (data, tipo, autore) ma non il contenuto clinico: serve per ritrovare e inoltrare un documento senza leggerlo.</div>' : ''}
    ${ocr ? `<br><span class="prov verify">Da verificare</span> ${ocr} ${ocr === 1 ? 'documento proviene' : 'documenti provengono'} da OCR non confermato.` : ''}
    ${img ? `<br><span class="prov conflict">Copertura incompleta</span> Nell'archivio di questo paziente ci sono ${img} scansioni senza testo estratto (2018): compaiono per data ma non sono ricercabili per contenuto.` : ''}
    <div class="row mt-8"><button class="btn sm" data-sheet="findDocs">Affina la ricerca</button>${pid ? `<button class="btn sm ghost" data-go="#/patients/${pid}/exams">Apri archivio paziente</button>` : ''}</div>
    <div class="srcs"><span class="src">pre-filtro: ${pid ? 'paziente ' + esc(who) : 'pazienti autorizzati'}</span><span class="src">filtri strutturati + full-text</span><span class="src">accesso registrato</span></div>`;
}

/* ---------- Domande generali su cio' che è già nelle pagine ----------
   Stessa fonte della UI: se l'AI e la pagina mostrassero numeri diversi
   sarebbe un problema di fiducia, quindi entrambe leggono le stesse metriche. */
function aiOps(ql) {
  if (!/quante visite|quanti pazienti|quanti referti|no.?show|tempo di approvazione|statistic|attesa media|durata media|andamento visite/.test(ql)) return null;
  if (state.role === 'tech_admin') return metricBlock({ metric: 'report_turnaround', title: 'Metriche operative (aggregate)', body: mrows([['Referti prodotti (mese)', 186], ['Tempo mediano di approvazione', '2,4 h'], ['Job AI falliti', '0']]), drill: '#/system/ai' }) + `<div class="caption mt-8">Il ruolo tecnico vede volumi e tempi, mai contenuti o nomi.</div>`;
  return metricBlock({
    metric: 'visits_count', title: 'Attività dello studio',
    body: mrows([['Visite erogate', 212, '+6 % vs agosto', 'up'], ['Tasso di no-show', '3,1 %', '-0,8 pt', 'up'], ['Attesa media in sala', '11 min', '-2 min', 'up'], ['Durata media visita', '34 min', '='], ['Referti prodotti', 186, '+9 %', 'up'], ['Tempo mediano di approvazione', '2,4 h', '-40 %', 'up']]),
    period: 'Settembre 2026', coverage: 'aggiornato stanotte alle 02:40', drill: '#/statistics',
  }) + `<div class="caption">Sono le stesse metriche della pagina Statistiche: una sola definizione, due modi di leggerla.</div><div class="srcs"><span class="src">metric registry</span><span class="src">agenda + referti</span></div>`;
}
