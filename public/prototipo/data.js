// Dati completamente fittizi (dataset demo cardiologico)
const TODAY = '2026-09-09';
const ROLES = {
  secretary: { label: 'Segreteria', name: 'Laura Sassi', initials: 'LS', greet: 'Buongiorno, Laura' },
  assistant: { label: 'Aiuto medico', name: 'Marco Rezzonico', initials: 'MR', greet: 'Buongiorno, Marco' },
  doctor: { label: 'Medico', name: 'Dr.ssa Elena Bianchi', initials: 'EB', greet: 'Buongiorno, Dr.ssa Bianchi' },
  org_admin: { label: 'Admin organizzativo', name: 'Dr. Paolo Ferrari', initials: 'PF', greet: 'Buongiorno, Dr. Ferrari' },
  tech_admin: { label: 'Admin tecnico', name: 'Andrea Vanini', initials: 'AV', greet: 'Ciao, Andrea' },
};
const DOCTORS = { eb: 'Dr.ssa Bianchi', pf: 'Dr. Ferrari' };
const ROOMS = ['Sala 1', 'Sala 2', 'Sala ECG'];

const PATIENTS = [
  { id: 'p1', num: '10231', first: 'Mario', last: 'Rossi', dob: '12.03.1959', age: 67, sex: 'M', phone: '+41 79 412 33 21', email: 'm.rossi@example.ch', doctor: 'eb', flags: ['Allergia: penicillina'], gp: 'Dr. Luigi Sala, Mendrisio',
    problems: [{ l: 'Fibrillazione atriale parossistica', s: 'active', since: '2023' }, { l: 'Ipertensione arteriosa', s: 'active', since: '2015' }, { l: 'Dislipidemia', s: 'active', since: '2018' }, { l: 'Palpitazioni serali', s: 'eval', since: '08.2026' }],
    meds: [{ n: 'Bisoprololo', d: '5 mg', f: '1x/die', s: 'CHANGED', from: '2,5 mg', since: '04.09.2026' }, { n: 'Ramipril', d: '10 mg', f: '1x/die', s: 'CHANGED', from: '5 mg', since: '04.09.2026' }, { n: 'Apixaban', d: '5 mg', f: '2x/die', s: '', since: '2023' }, { n: 'Atorvastatina', d: '20 mg', f: '1x/die', s: '', since: '2018' }],
    exams: [{ t: 'Holter ECG 24h', d: '12.08.2026', r: 'FA parossistica, burden 3 %', k: 'holter' }, { t: 'Ecocardiogramma', d: '04.09.2026', r: 'FE 58 %, AS 42 mm', k: 'echo' }, { t: 'ECG', d: '09.09.2026', r: 'Ritmo sinusale, FC 72', k: 'ecg' }],
    docs: [{ t: 'Lettera di dimissione — Ospedale Regionale', d: '08.09.2026', k: 'discharge', new: true }, { t: 'Referto Holter', d: '12.08.2026', k: 'holter' }, { t: 'Laboratorio', d: '28.08.2026', k: 'lab' }],
    lastVisit: '04.09.2026', next: '09:30 oggi',
  },
  { id: 'p2', num: '10412', first: 'Anna', last: 'Verdi', dob: '05.11.1971', age: 54, sex: 'F', phone: '+41 76 220 18 90', doctor: 'eb', flags: [], problems: [{ l: 'Dolore toracico atipico', s: 'eval', since: '09.2026' }], meds: [], exams: [{ t: 'ECG', d: '09.09.2026', r: 'Normale', k: 'ecg' }], docs: [{ t: 'Laboratorio', d: '09.09.2026', k: 'lab', new: true }], lastVisit: '—', next: '08:30 oggi' },
  { id: 'p3', first: 'Luca', last: 'Neri', num: '10388', dob: '22.06.1964', age: 62, sex: 'M', phone: '+41 79 555 10 02', doctor: 'eb', flags: [], problems: [{ l: 'Cardiopatia ischemica', s: 'active', since: '2020' }], meds: [{ n: 'ASA', d: '100 mg', f: '1x/die', s: '' }, { n: 'Atorvastatina', d: '40 mg', f: '1x/die', s: '' }], exams: [{ t: 'Ecocardiogramma', d: '09.09.2026', r: 'FE 52 %', k: 'echo' }], docs: [], lastVisit: '10.03.2026', next: '09:00 oggi' },
  { id: 'p4', first: 'Giulia', last: 'Conti', num: '10501', dob: '30.01.1988', age: 38, sex: 'F', phone: '+41 78 301 44 12', doctor: 'eb', flags: [], problems: [{ l: 'Palpitazioni', s: 'eval', since: '2026' }], meds: [], exams: [], docs: [], lastVisit: '15.07.2026', next: '10:00 oggi' },
  { id: 'p5', first: 'Elena', last: 'Fabbri', num: '10077', dob: '14.09.1948', age: 77, sex: 'F', phone: '+41 91 640 22 11', doctor: 'eb', flags: ['Pacemaker'], problems: [{ l: 'BAV completo — PM 2019', s: 'active', since: '2019' }, { l: 'Scompenso cardiaco NYHA II', s: 'active', since: '2022' }], meds: [{ n: 'Sacubitril/Valsartan', d: '97/103 mg', f: '2x/die', s: '' }, { n: 'Bisoprololo', d: '2,5 mg', f: '1x/die', s: '' }], exams: [], docs: [{ t: 'Controllo PM', d: '02.09.2026', k: 'report', new: true }], lastVisit: '02.03.2026', next: '10:30 oggi' },
  { id: 'p6', first: 'Paolo', last: 'Gallo', num: '10290', dob: '03.04.1955', age: 71, sex: 'M', phone: '+41 79 110 77 65', doctor: 'pf', flags: [], problems: [{ l: 'Stenosi aortica moderata', s: 'active', since: '2024' }], meds: [], exams: [], docs: [], lastVisit: '20.05.2026', next: '—' },
  { id: 'p7', first: 'Sara', last: 'Riva', num: '10455', dob: '18.12.1979', age: 46, sex: 'F', phone: '+41 76 908 55 40', doctor: 'pf', flags: [], problems: [], meds: [], exams: [], docs: [], lastVisit: '01.09.2026', next: '—' },
  { id: 'p8', first: 'Franco', last: 'Moretti', num: '10133', dob: '27.02.1951', age: 75, sex: 'M', phone: '+41 91 682 40 09', doctor: 'pf', flags: [], problems: [{ l: 'Ipertensione', s: 'active', since: '2010' }], meds: [{ n: 'Amlodipina', d: '10 mg', f: '1x/die', s: '' }], exams: [], docs: [], lastVisit: '11.06.2026', next: '08:30 oggi' },
];
const P = Object.fromEntries(PATIENTS.map(p => [p.id, p]));
const fullName = p => `${p.first} ${p.last}`;

const APPTS = [
  { id: 'a1', p: 'p2', doc: 'eb', room: 'Sala 1', start: '08:30', dur: 30, reason: 'Prima visita', type: 'Prima visita', status: 'COMPLETED' },
  { id: 'a2', p: 'p3', doc: 'eb', room: 'Sala 1', start: '09:00', dur: 30, reason: 'Ecocardiogramma', type: 'Eco', status: 'IN_VISIT' },
  { id: 'a3', p: 'p1', doc: 'eb', room: 'Sala 2', start: '09:30', dur: 30, reason: 'Controllo cardiologico', type: 'Controllo', status: 'ARRIVED', ready: true },
  { id: 'a4', p: 'p4', doc: 'eb', room: 'Sala ECG', start: '10:00', dur: 30, reason: 'Holter — posa', type: 'Holter', status: 'SCHEDULED' },
  { id: 'a5', p: 'p5', doc: 'eb', room: 'Sala 1', start: '10:30', dur: 45, reason: 'Controllo scompenso', type: 'Controllo', status: 'SCHEDULED', late: true },
  { id: 'a6', p: 'p8', doc: 'pf', room: 'Sala 2', start: '08:30', dur: 30, reason: 'Ecocardiogramma', type: 'Eco', status: 'COMPLETED' },
  { id: 'a7', p: 'p6', doc: 'pf', room: 'Sala 2', start: '11:30', dur: 30, reason: 'Controllo stenosi aortica', type: 'Controllo', status: 'CONFIRMED' },
  { id: 'a8', p: 'p7', doc: 'pf', room: 'Sala 1', start: '14:00', dur: 30, reason: 'Test ergometrico', type: 'Ergometria', status: 'SCHEDULED' },
  { id: 'a9', p: 'p1', doc: 'eb', room: 'Sala 1', start: '15:00', dur: 30, reason: 'Ecocardiogramma di controllo', type: 'Eco', status: 'CANCELLED' },
];
const STATUS_LABEL = { SCHEDULED: 'Programmato', CONFIRMED: 'Confermato', ARRIVED: 'Arrivato', IN_PREP: 'In preparazione', IN_VISIT: 'In visita', COMPLETED: 'Completato', CANCELLED: 'Annullato', NO_SHOW: 'No-show' };
const STATUS_DOT = { SCHEDULED: '', CONFIRMED: 'accent', ARRIVED: 'success', IN_PREP: 'success', IN_VISIT: 'accent', COMPLETED: 'success', CANCELLED: '', NO_SHOW: 'danger' };

const TASKS = [
  { id: 't1', title: 'Inviare referto Verdi al medico curante', p: 'p2', assignee: 'secretary', prio: 'high', status: 'TODO', due: 'oggi', cat: 'send', src: 'automation' },
  { id: 't2', title: 'Richiamare Paolo Gallo per conferma', p: 'p6', assignee: 'secretary', prio: 'normal', status: 'TODO', due: 'oggi 11:00', cat: 'call', src: 'manual' },
  { id: 't3', title: 'Richiamare Sara Riva (esito lab)', p: 'p7', assignee: 'secretary', prio: 'normal', status: 'TODO', due: 'oggi pom.', cat: 'call', src: 'ai_proposal' },
  { id: 't4', title: 'Preparare Rossi — Sala 2', p: 'p1', assignee: 'assistant', prio: 'high', status: 'IN_PROGRESS', due: '09:25', cat: 'prep', src: 'automation' },
  { id: 't5', title: 'Prenotare Holter di controllo', p: 'p1', assignee: 'secretary', prio: 'normal', status: 'WAITING', due: 'entro 2 sett.', cat: 'followup', src: 'ai_proposal' },
  { id: 't6', title: 'Recuperare referto PM da Cardiocentro', p: 'p5', assignee: 'secretary', prio: 'normal', status: 'TODO', due: 'domani', cat: 'document', src: 'manual' },
  { id: 't7', title: 'Verificare esito laboratorio Verdi', p: 'p2', assignee: 'doctor', prio: 'high', status: 'TODO', due: 'oggi', cat: 'clinical_check', src: 'automation' },
  { id: 't8', title: 'Approvare referto Neri (eco 09.09)', p: 'p3', assignee: 'doctor', prio: 'normal', status: 'TODO', due: 'oggi', cat: 'clinical_check', src: 'automation' },
];
const PRIO_LABEL = { low: 'Bassa', normal: 'Normale', high: 'Alta', urgent: 'Urgente' };
const TSTATUS = { TODO: 'Da fare', IN_PROGRESS: 'In corso', WAITING: 'In attesa', DONE: 'Fatto', CANCELLED: 'Annullato' };

const REPORTS = [
  { id: 'r1', p: 'p1', doc: 'eb', date: '09.09.2026', type: 'Controllo cardiologico', status: 'READY_FOR_REVIEW', version: 'v1 AI', alerts: 2, queue: '2 min' },
  { id: 'r2', p: 'p3', doc: 'eb', date: '09.09.2026', type: 'Ecocardiogramma', status: 'READY_FOR_REVIEW', version: 'v2 segreteria', alerts: 0, queue: '18 min' },
  { id: 'r3', p: 'p2', doc: 'eb', date: '09.09.2026', type: 'Prima visita', status: 'APPROVED', version: 'FINAL', alerts: 0, queue: '—' },
  { id: 'r4', p: 'p8', doc: 'pf', date: '09.09.2026', type: 'Ecocardiogramma', status: 'TRANSCRIBING', version: '—', alerts: 0, queue: '40 s' },
  { id: 'r5', p: 'p5', doc: 'eb', date: '02.03.2026', type: 'Controllo scompenso', status: 'ARCHIVED', version: 'FINAL', alerts: 0, queue: '—' },
  { id: 'r6', p: 'p1', doc: 'eb', date: '04.09.2026', type: 'Controllo cardiologico', status: 'ARCHIVED', version: 'FINAL', alerts: 0, queue: '—' },
];
const RSTATUS = { RECEIVED: 'Ricevuto', PREPROCESSING: 'Preparazione audio', TRANSCRIBING: 'Trascrizione', UNDERSTANDING: 'Analisi', DRAFTING: 'Bozza', VALIDATING: 'Controllo', READY_FOR_REVIEW: 'Da approvare', READY_FOR_FORMAL_REVIEW: 'Da controllare', APPROVED: 'Approvato', READY_TO_SEND: 'Da inviare', SENT: 'Inviato', ARCHIVED: 'Archiviato', FAILED: 'Errore' };

const REPORT_R1 = {
  sections: [
    { code: 'reason', label: 'Motivo della consultazione', html: 'Controllo aritmologico in paziente con <span class="hl confirmed">fibrillazione atriale parossistica</span> nota dal 2023.' },
    { code: 'history', label: 'Anamnesi', html: 'Dall\'ultimo controllo riferisce <span class="hl document">palpitazioni serali</span>, 2-3 episodi a settimana, di breve durata, senza sincope. Nega dolore toracico e dispnea. <span class="hl document">Recente ricovero</span> per episodio di FA ad alta risposta (lettera di dimissione 08.09.2026).' },
    { code: 'tests', label: 'Esami', html: '<span class="hl confirmed">Holter ECG 12.08.2026</span>: FA parossistica, burden 3 %, nessuna pausa significativa. <span class="hl confirmed">Ecocardiogramma 04.09.2026</span>: FE 58 %, atrio sinistro 42 mm. ECG odierno: ritmo sinusale, FC 72 bpm.' },
    { code: 'assessment', label: 'Valutazione', html: 'Quadro di FA parossistica sintomatica con buon controllo della frequenza. Funzione sistolica ventricolare sinistra conservata.' },
    { code: 'therapy', label: 'Terapia', html: 'Continua <span class="hl confirmed">Bisoprololo 5 mg</span> 1x/die, Ramipril 10 mg 1x/die, Apixaban 5 mg 2x/die, Atorvastatina 20 mg 1x/die.' },
    { code: 'followup', label: 'Follow-up', html: '<span class="hl inferred">Holter di controllo</span> da programmare. <span class="hl inferred">Controllo cardiologico tra 6 mesi</span>. Copia al medico curante.' },
  ],
  alerts: [
    { sev: 'check', title: 'Dosaggio corretto dalla segreteria', body: 'La trascrizione primaria aveva capito "due e mezzo", il verificatore clinico "cinque". La segreteria ha ascoltato il punto e corretto 2,5 → 5 mg, coerente con la terapia attiva dal 04.09.2026. Conferma o riapri.', why: 'Disaccordo fra trascrittore primario e verificatore su un numero relativo a un farmaco (classe: number): la fusione non decide, la persona sì. La correzione umana è tracciata come fonte autorevole.', ts: '01:03' },
    { sev: 'important', title: 'Holter citato, risultato non collegato', body: 'Il referto menziona un Holter di controllo da programmare; l\'ultimo Holter disponibile è del 12.08.2026. Nessun nuovo esame in archivio.', why: 'Regola: esame citato nel follow-up senza documento o task corrispondente.', ts: '02:40' },
  ],
  proposals: [
    { t: 'Conferma terapia: Bisoprololo 5 mg 1x/die', s: 'CONFIRM_THERAPY · fonte: trascrizione 00:12 · richiede conferma', on: true },
    { t: 'Task: prenotare Holter di controllo', s: 'CREATE_TASK · categoria followup · assegnato a Segreteria', on: true },
    { t: 'Follow-up: controllo cardiologico tra 6 mesi', s: 'CREATE_FOLLOWUP_TASK · scadenza ~ marzo 2027', on: true },
    { t: 'Task: inviare copia al medico curante (Dr. Sala)', s: 'CREATE_TASK · categoria send · dopo approvazione', on: true },
  ],
  segments: [
    { ts: '00:12', rel: 'HIGH', tx: '…il paziente continua bisoprololo due e mezzo milligrammi al mattino…' },
    { ts: '00:41', rel: 'NORMAL', tx: '…riferisce palpitazioni la sera, due tre volte a settimana, brevi…' },
    { ts: '01:03', rel: 'CRITICAL', tx: '…due e mezzo… [verifica: "cinque"] …milligrammi, lo teniamo così…' },
    { ts: '01:50', rel: 'NORMAL', tx: '…nega dolore toracico, nega dispnea…' },
    { ts: '02:40', rel: 'HIGH', tx: '…facciamo un Holter di controllo e lo rivedo tra sei mesi…' },
    { ts: '03:05', rel: 'HIGH', tx: '…mandare una copia al curante, il dottor Sala…' },
  ],
  pipeline: [
    ['Received', '10:42:01'], ['Preprocessing', '10:42:02'], ['Whisper Large v3', '10:43:04'], ['Verifier (Voxtral)', '10:43:42'], ['Fusione vincolata', '10:43:45'], ['Extraction (Qwen3)', '10:44:07'], ['Draft (Writer)', '10:44:09'], ['Critic', '10:44:11'], ['Validator', '10:44:12'], ['Ready', '10:44:12'],
  ],
  /* Confronto fra le due trascrizioni. La fusione corregge solo cio' che una
     regola deterministica sa decidere; le classi sensibili non si toccano mai. */
  diffs: [
    { ts: '00:58', cls: 'other', pri: 'dispnoia', ver: 'dispnea', dec: 'RULE', rule: 'La forma primaria non esiste nel dizionario clinico, quella del verificatore si: correzione lessicale deterministica.' },
    { ts: '02:12', cls: 'other', pri: 'atorvastatina venti', ver: 'Atorvastatina 20', dec: 'RULE', rule: 'Stesso valore scritto in lettere e in cifre: normalizzazione, nessuna scelta di merito.' },
    { ts: '01:03', cls: 'number', pri: 'cinque milligrammi', ver: 'due e mezzo milligrammi', dec: 'VERIFY', rule: 'Classe number su un farmaco: la fusione non decide mai. Diventa un punto da verificare con salto all-audio.' },
  ],
  /* Il referto è solo uno degli output della visita */
  outputs: [
    ['Referto', '6 sezioni - v1 AI, in revisione', 'reports'],
    ['Terapia', '1 conferma: Bisoprololo 5 mg 1x/die', 'therapy'],
    ['Task segreteria', '2: prenotare Holter, copia al curante', 'tasks'],
    ['Follow-up', 'controllo cardiologico a 6 mesi (~ marzo 2027)', 'followup'],
    ['Esami', '1 richiesta: Holter di controllo', 'exams'],
    ['Timeline paziente', 'visita, esami e documenti collegati', 'timeline'],
    ['Amministrazione', '1 prestazione proposta da VISIT_COMPLETED', 'billing'],
  ],
};

const DOCUMENTS = [
  { id: 'd1', t: 'Lettera di dimissione — Ospedale Regionale', p: 'p1', type: 'discharge', date: '08.09.2026', status: 'needs_confirmation', conf: 'Paziente: 1 candidato · tipo certo', src: 'E-mail' },
  { id: 'd2', t: 'Laboratorio — Verdi Anna', p: 'p2', type: 'lab', date: '09.09.2026', status: 'confirmed', conf: 'Auto (regola lab attiva)', src: 'Scansione' },
  { id: 'd3', t: 'Referto controllo pacemaker', p: 'p5', type: 'report', date: '02.09.2026', status: 'needs_confirmation', conf: '2 candidati paziente (omonimia)', src: 'Upload' },
  { id: 'd4', t: 'ECG — foto', p: 'p1', type: 'ecg', date: '09.09.2026', status: 'confirmed', conf: 'Confermato da M. Rezzonico', src: 'Tablet' },
  { id: 'd5', t: 'Documento non identificato (PDF 3 pag.)', p: null, type: 'unknown', status: 'needs_confirmation', date: '09.09.2026', conf: 'Nessun candidato', src: 'Scansione' },
  { id: 'd6', t: 'Consenso informato — ergometria', p: 'p7', type: 'consent', date: '01.09.2026', status: 'confirmed', conf: 'Confermato', src: 'Upload' },
];
const DOC_TYPE = { discharge: 'Dimissione', lab: 'Laboratorio', report: 'Referto', ecg: 'ECG', holter: 'Holter', unknown: 'Da classificare', consent: 'Consenso', imaging: 'Imaging', letter: 'Lettera', admin: 'Amministrativo' };

const INBOX = [
  { id: 'i1', kind: 'report', t: 'Referto Verdi approvato — pronto per invio', s: 'Segreteria · 11:10', p: 'p2', tags: ['today', 'mine'], acts: ['Invia', 'Assegna'] },
  { id: 'i2', kind: 'ai', t: '10 documenti elaborati stanotte', s: 'ReferralFlow AI · 06:00 · 3 richiedono conferma', tags: ['ai', 'today'], acts: ['Vedi', 'Conferma sicuri'] },
  { id: 'i3', kind: 'ai', t: 'Proposta task: richiamare Sara Riva per esito lab', s: 'Da nota chiamata di ieri · richiede conferma', p: 'p7', tags: ['ai', 'mine'], acts: ['Accetta', 'Rifiuta'] },
  { id: 'i4', kind: 'doc', t: 'Risultato laboratorio Verdi ricevuto', s: 'Documenti · 09:12 · associato automaticamente', p: 'p2', tags: ['today'], acts: ['Apri'] },
  { id: 'i5', kind: 'alert', t: 'Elena Fabbri in ritardo (10:30)', s: 'Agenda · 15 min · nessuna conferma telefonica', p: 'p5', tags: ['urgent', 'today'], acts: ['Chiama', 'Segna no-show'] },
  { id: 'i6', kind: 'task', t: 'Prenotare Holter di controllo — Rossi', s: 'In attesa di approvazione referto', p: 'p1', tags: ['waiting', 'mine'], acts: ['Apri'] },
  { id: 'i7', kind: 'call', t: 'Richiesta paziente: cambio appuntamento Moretti', s: 'Telefonata 08:05 · chiede spostamento a settimana prossima', p: 'p8', tags: ['today', 'mine'], acts: ['Trova slot', 'Chiudi'] },
];

const COMMS = [
  { k: 'call_in', t: 'Franco Moretti', s: 'Chiede di spostare il controllo a settimana prossima', at: '08:05', p: 'p8', by: 'Laura' },
  { k: 'email_in', t: 'Ospedale Regionale — Lettera di dimissione Rossi', s: 'Allegato PDF classificato come dimissione · associato a Mario Rossi (da confermare)', at: 'ieri 17:40', p: 'p1', by: 'AI' },
  { k: 'call_out', t: 'Paolo Gallo', s: 'Nessuna risposta · richiamare alle 11:00', at: 'ieri 16:20', p: 'p6', by: 'Laura' },
  { k: 'internal', t: 'Nota interna — Sala ECG', s: 'Elettrodi in esaurimento, ordinare entro venerdì', at: 'ieri 12:00', p: null, by: 'Marco' },
  { k: 'email_out', t: 'Referto Fabbri → Dr. Ponti', s: 'Inviato con PDF firmato · consegna confermata', at: '02.09', p: 'p5', by: 'Laura' },
];

const MODELS = [
  { n: 'Whisper Large v3', prov: 'mlx-whisper', ver: 'v3', q: 'fp16', hw: 'Mac mini', ctx: '—', spec: 'speech_to_text', status: 'online', loaded: true, mem: '3,1 GB', perf: 'RTF 0,18', test: 'ok · 08.09' },
  { n: 'Voxtral Small 24B', prov: 'vLLM', ver: '2507', q: 'FP8', hw: 'DGX Spark #1', ctx: '32k', spec: 'clinical_transcription', status: 'online', loaded: false, mem: '—', perf: 'RTF 0,25', test: 'ok · 01.09' },
  { n: 'Qwen3 32B', prov: 'vLLM', ver: '3.0', q: 'AWQ 4-bit', hw: 'DGX Spark #1', ctx: '32k', spec: 'extraction · report · reasoning', status: 'online', loaded: true, mem: '19 GB', perf: '41 tok/s', test: 'ok · 08.09' },
  { n: 'Qwen3 8B', prov: 'MLX', ver: '3.0', q: '4-bit', hw: 'Mac mini', ctx: '32k', spec: 'classification · intent · fallback', status: 'online', loaded: true, mem: '5,2 GB', perf: '28 tok/s', test: 'ok · 08.09' },
  { n: 'Qwen3-Embedding 4B', prov: 'TEI', ver: '1.0', q: 'fp16', hw: 'DGX Spark #1', ctx: '8k', spec: 'embedding', status: 'online', loaded: true, mem: '8 GB', perf: '900 chunk/s', test: 'ok · 07.09' },
  { n: 'Qwen3-Reranker 0.6B', prov: 'TEI', ver: '1.0', q: 'fp16', hw: 'DGX Spark #1', ctx: '8k', spec: 'rerank', status: 'degraded', loaded: true, mem: '1,4 GB', perf: 'p95 210 ms', test: 'warn · 09.09' },
];
const AIJOBS = [
  { id: 'j1', kind: 'report_pipeline', p: 'Rossi M.', status: 'done', started: '10:42:01', lat: '2 m 11 s', model: 'Whisper v3 · Voxtral · Qwen3 32B', prompt: 'extract_v14 · report_v9' },
  { id: 'j2', kind: 'report_pipeline', p: 'Moretti F.', status: 'running', started: '11:31:20', lat: '—', model: 'Whisper v3', prompt: '—' },
  { id: 'j3', kind: 'classify_document', p: '[redacted]', status: 'done', started: '09:12:04', lat: '3,4 s', model: 'Qwen3 8B', prompt: 'classify_v6' },
  { id: 'j4', kind: 'query', p: '[redacted]', status: 'done', started: '09:41:10', lat: '1,9 s', model: 'Qwen3 32B', prompt: 'visit_diff_v3' },
  { id: 'j5', kind: 'nightly_embeddings', p: '—', status: 'done', started: '02:10:00', lat: '41 m', model: 'Qwen3-Embedding', prompt: '—' },
  { id: 'j6', kind: 'morning_brief', p: '—', status: 'done', started: '07:50:00', lat: '12 s', model: 'Qwen3 8B', prompt: 'brief_v4' },
];
const PROMPTS = [
  { id: 'extract', n: 'Clinical extraction', v: 'v14', status: 'production', model: 'Qwen3 32B', perf: 'omissioni 1,8 % · alluc. 0,3 %', by: 'A. Vanini', at: '28.08' },
  { id: 'extract15', n: 'Clinical extraction', v: 'v15', status: 'test', model: 'Qwen3 32B', perf: 'omissioni 1,4 % · alluc. 0,3 %', by: 'A. Vanini', at: '07.09' },
  { id: 'report', n: 'Report generation', v: 'v9', status: 'production', model: 'Qwen3 32B', perf: 'correzioni 3,2/ref', by: 'A. Vanini', at: '20.08' },
  { id: 'consist', n: 'Consistency check', v: 'v5', status: 'production', model: 'Qwen3 32B', perf: 'precisione alert 84 %', by: 'A. Vanini', at: '12.08' },
  { id: 'classify', n: 'Document classification', v: 'v6', status: 'production', model: 'Qwen3 8B', perf: 'tipo 96 % · paziente 91 %', by: 'A. Vanini', at: '30.07' },
  { id: 'brief', n: 'Morning brief', v: 'v4', status: 'production', model: 'Qwen3 8B', perf: '—', by: 'A. Vanini', at: '15.07' },
];
const QUALITY = [21, 18, 19, 16, 15, 17, 13, 12, 12, 10, 11, 9, 8, 9, 7, 6, 7, 5, 5, 4, 4, 5, 3, 4, 3, 3, 2, 3, 2, 2];
const AUDIT = [
  { at: '11:12:40', who: 'L. Sassi', role: 'Segreteria', act: 'REPORT_VIEWED', res: 'Referto r3', p: 'Verdi A.', purpose: 'send' },
  { at: '11:10:02', who: 'E. Bianchi', role: 'Medico', act: 'REPORT_APPROVED', res: 'Referto r3 · v3 FINAL', p: 'Verdi A.', purpose: 'visit' },
  { at: '10:44:12', who: 'system', role: 'System', act: 'AI_JOB_COMPLETED', res: 'job j1 · extract_v14', p: 'Rossi M.', purpose: 'pipeline' },
  { at: '09:41:10', who: 'E. Bianchi', role: 'Medico', act: 'AI_QUERY', res: 'visit_diff · 4 fonti', p: 'Rossi M.', purpose: 'visit' },
  { at: '09:26:30', who: 'M. Rezzonico', role: 'Aiuto medico', act: 'DOCUMENT_CLASSIFIED', res: 'd4 ECG · conferma', p: 'Rossi M.', purpose: 'preparation' },
  { at: '08:25:11', who: 'L. Sassi', role: 'Segreteria', act: 'APPOINTMENT_STATUS', res: 'a3 SCHEDULED → ARRIVED', p: 'Rossi M.', purpose: 'admin' },
  { at: '07:58:03', who: 'L. Sassi', role: 'Segreteria', act: 'LOGIN', res: 'passkey · Mac reception', p: '—', purpose: '—' },
  { at: '02:10:44', who: 'system', role: 'System', act: 'BACKUP_VERIFIED', res: 'L2 · restore test ok', p: '—', purpose: '—' },
];
const KNOWLEDGE = [
  { t: 'Procedura accoglienza paziente', path: '/Studio/Segreteria', owner: 'L. Sassi', rev: '01.07.2026', tags: ['segreteria', 'accoglienza'] },
  { t: 'Template referto controllo aritmologico — Dr.ssa Bianchi', path: '/Refertazione/Medici', owner: 'E. Bianchi', rev: '20.08.2026', tags: ['template', 'aritmologia'] },
  { t: 'Preparazione paziente per Holter', path: '/Cardiologia/Procedure', owner: 'M. Rezzonico', rev: '15.05.2026', tags: ['holter', 'preparazione'] },
  { t: 'Frasi standard: funzione ventricolare', path: '/Refertazione', owner: 'E. Bianchi', rev: '02.09.2026', tags: ['terminologia'] },
  { t: 'Backup e ripristino — runbook', path: '/Software/AI', owner: 'A. Vanini', rev: '30.08.2026', tags: ['backup', 'tecnico'] },
];
const INVOICES = [
  { n: '2026-0412', p: 'p2', date: '09.09.2026', amount: 'CHF 285.00', status: 'draft' },
  { n: '2026-0411', p: 'p8', date: '09.09.2026', amount: 'CHF 320.00', status: 'draft' },
  { n: '2026-0398', p: 'p5', date: '02.09.2026', amount: 'CHF 410.00', status: 'issued' },
  { n: '2026-0371', p: 'p6', date: '20.05.2026', amount: 'CHF 285.00', status: 'overdue' },
  { n: '2026-0390', p: 'p7', date: '01.09.2026', amount: 'CHF 190.00', status: 'paid' },
];

/* ================= DOMINIO ECONOMICO =================
   Classe dato: financial. Separata dal clinico: nessun record contiene
   diagnosi o note. I numeri vengono da metriche registrate (METRICS):
   l'AI non calcola, esegue una metrica e ne cita la definizione. */
const FINANCE = {
  period: 'Gen-Set 2026',
  kpi: {
    issued: 'CHF 412 800', collected: 'CHF 381 450', open: 'CHF 31 350',
    overdue: 'CHF 12 900', dso: '38 gg', margin: 'CHF 128 400', marginPct: '31,1 %',
    costs: 'CHF 284 400', visits: 1642, revPerVisit: 'CHF 251',
  },
  months: [
    { m: 'Gen', issued: 44.1, collected: 42.8 }, { m: 'Feb', issued: 46.9, collected: 45.1 },
    { m: 'Mar', issued: 51.2, collected: 49.6 }, { m: 'Apr', issued: 43.8, collected: 42.2 },
    { m: 'Mag', issued: 48.6, collected: 46.9 }, { m: 'Giu', issued: 52.4, collected: 50.8 },
    { m: 'Lug', issued: 39.2, collected: 38.4 }, { m: 'Ago', issued: 28.4, collected: 27.9 },
    { m: 'Set', issued: 18.4, collected: 9.2, partial: true },
  ],
  months2025: [41.0, 44.2, 47.1, 42.6, 45.9, 49.7, 37.8, 26.9, 43.2],
  aging: [['0-30 gg', 18450], ['31-60 gg', 8620], ['61-90 gg', 2850], ['oltre 90 gg', 1430]],
  payers: [['Assicurazione base (LAMal)', 58], ['Complementare', 21], ['Privato/autopagante', 16], ['Terzi (LAINF/AI)', 5]],
  costs: [['Personale', 168200], ['Affitto e utenze', 42600], ['Materiale e manutenzione', 31400], ['Assicurazioni e amministrazione', 22800], ['IT e infrastruttura', 19400]],
};
FINANCE.byDoctor = [
  { id: 'eb', name: 'Dr.ssa Bianchi', visits: 742, revenue: 198400, hours: 1180, revPerHour: 168, directCosts: 61200, contribution: 137200, mix: 'controlli 46 % / eco 27 % / prime visite 15 %', avgVisit: 267, days: '5 gg/sett' },
  { id: 'pf', name: 'Dr. Ferrari', visits: 681, revenue: 172900, hours: 1120, revPerHour: 154, directCosts: 58900, contribution: 114000, mix: 'controlli 39 % / ergometrie 21 % / Holter 18 %', avgVisit: 254, days: '5 gg/sett' },
  { id: 'gc', name: 'Dr. Gandolfi (consulente)', visits: 219, revenue: 41500, hours: 236, revPerHour: 176, directCosts: 24900, contribution: 16600, mix: 'eco 71 % / seconde opinioni 29 %', avgVisit: 189, days: '2 gg/sett, retrocessione 60 %' },
];
FINANCE.byService = [
  { s: 'Controllo cardiologico', n: 688, avg: 210, rev: 144480 },
  { s: 'Ecocardiogramma', n: 394, avg: 320, rev: 126080 },
  { s: 'Prima visita', n: 186, avg: 285, rev: 53010 },
  { s: 'Holter 24 h', n: 178, avg: 240, rev: 42720 },
  { s: 'Ergometria', n: 141, avg: 265, rev: 37365 },
  { s: 'Controllo pacemaker', n: 55, avg: 168, rev: 9240 },
];

/* Metric registry: ogni numero mostrato dall'AI proviene da qui. Senza una
   metrica registrata l'AI non risponde: propone di crearla all'amministratore. */
const METRICS = {
  revenue_issued: { label: 'Fatturato emesso', def: 'Somma degli importi delle fatture con stato EMESSA o successivo, per data di emissione. Esclude bozze e note di credito.', unit: 'CHF', cls: 'financial', perm: 'view_financial', owner: 'Amministrazione', v: 'v3 - 12.01.2026' },
  revenue_collected: { label: 'Incassato', def: 'Somma dei pagamenti registrati per data valuta. Non coincide con il fatturato dello stesso mese.', unit: 'CHF', cls: 'financial', perm: 'view_financial', owner: 'Amministrazione', v: 'v3 - 12.01.2026' },
  contribution_practitioner: { label: 'Contributo per medico', def: 'Fatturato attribuito al medico esecutore meno i costi diretti attribuibili (retrocessioni, materiale, tempo assistente dedicato). Non include i costi di struttura ripartiti.', unit: 'CHF', cls: 'financial', perm: 'view_practitioner_performance', owner: 'Amministrazione', v: 'v2 - 03.06.2026' },
  revenue_per_hour: { label: 'Fatturato per ora di agenda', def: 'Fatturato attribuito diviso le ore di agenda aperte (non le ore lavorate). Molto sensibile al mix di prestazioni.', unit: 'CHF/h', cls: 'financial', perm: 'view_practitioner_performance', owner: 'Amministrazione', v: 'v2 - 03.06.2026' },
  dso: { label: 'Giorni medi di incasso (DSO)', def: 'Media ponderata dei giorni tra emissione e pagamento sulle fatture chiuse negli ultimi 90 giorni.', unit: 'giorni', cls: 'financial', perm: 'view_financial', owner: 'Amministrazione', v: 'v1 - 08.02.2026' },
  open_receivables: { label: 'Crediti aperti', def: 'Fatture emesse non ancora saldate alla data odierna, per fascia di scadenza.', unit: 'CHF', cls: 'financial', perm: 'view_billing_operational', owner: 'Amministrazione', v: 'v2 - 08.02.2026' },
  visits_count: { label: 'Visite erogate', def: 'Appuntamenti con stato COMPLETATO nel periodo. Esclude no-show e annullati.', unit: 'n', cls: 'operational', perm: 'view_practice_stats', owner: 'Direzione', v: 'v4 - 12.01.2026' },
  no_show_rate: { label: 'Tasso di no-show', def: 'No-show diviso (completati + no-show). Esclude annullamenti con oltre 24 h di preavviso.', unit: '%', cls: 'operational', perm: 'view_practice_stats', owner: 'Direzione', v: 'v4 - 12.01.2026' },
  report_turnaround: { label: 'Tempo di approvazione referto', def: 'Mediana tra fine visita e stato APPROVATO. Esclude i referti mai approvati.', unit: 'ore', cls: 'operational', perm: 'view_practice_stats', owner: 'Direzione', v: 'v2 - 20.04.2026' },
};

/* ================= ARCHIVIO STORICO =================
   Alimenta le domande "trovami referti/analisi vecchi". Ogni voce dichiara
   origine e stato del testo: image_only = scansione senza testo estratto,
   quindi l'archivio non è interamente ricercabile e va detto all'utente. */
const ARCHIVE = [
  { id: 'h1', p: 'p1', kind: 'exam', type: 'echo', date: '2026-09-04', title: 'Ecocardiogramma transtoracico', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text', vals: { FE: '58 %', AS: '42 mm' } },
  { id: 'h2', p: 'p1', kind: 'report', type: 'visit', date: '2026-09-04', title: 'Controllo aritmologico', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text' },
  { id: 'h3', p: 'p1', kind: 'exam', type: 'holter', date: '2026-08-12', title: 'Holter ECG 24 h', by: 'Dr. Ferrari', origin: 'internal', text: 'text', vals: { 'FA burden': '3 %' } },
  { id: 'h4', p: 'p1', kind: 'letter', type: 'discharge', date: '2026-09-08', title: 'Lettera di dimissione - Cardiocentro', by: 'Dr. Ponti', origin: 'external', text: 'ocr_unverified' },
  { id: 'h5', p: 'p1', kind: 'exam', type: 'echo', date: '2025-02-11', title: 'Ecocardiogramma di controllo', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text', vals: { FE: '60 %', AS: '40 mm' } },
  { id: 'h6', p: 'p1', kind: 'lab', type: 'lab', date: '2025-02-10', title: 'Chimica clinica + NT-proBNP', by: 'Lab Viganello', origin: 'external', text: 'text', vals: { 'NT-proBNP': '288 ng/l', Creatinina: '92 µmol/l' } },
  { id: 'h7', p: 'p1', kind: 'report', type: 'visit', date: '2025-02-11', title: 'Controllo annuale', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text' },
  { id: 'h8', p: 'p1', kind: 'exam', type: 'echo', date: '2023-03-16', title: 'Ecocardiogramma', by: 'Dr. Ferrari', origin: 'internal', text: 'text', vals: { FE: '55 %', AS: '39 mm' } },
  { id: 'h9', p: 'p1', kind: 'exam', type: 'ergo', date: '2023-03-16', title: 'Test ergometrico', by: 'Dr. Ferrari', origin: 'internal', text: 'text', vals: { Carico: '150 W', Durata: '9 min' } },
  { id: 'h10', p: 'p1', kind: 'exam', type: 'echo', date: '2021-06-02', title: 'Ecocardiogramma (studio esterno)', by: 'Dr. Weber, Lucerna', origin: 'external', text: 'ocr_unverified', vals: { FE: '62 %' } },
  { id: 'h11', p: 'p1', kind: 'lab', type: 'lab', date: '2021-05-28', title: 'Profilo lipidico', by: 'Lab Sant\'Anna', origin: 'external', text: 'ocr_unverified', vals: { LDL: '3.9 mmol/l' } },
  { id: 'h12', p: 'p1', kind: 'letter', type: 'discharge', date: '2018-11-04', title: 'Ricovero per FA - lettera di dimissione', by: 'Ospedale Civico', origin: 'external', text: 'image_only' },
  { id: 'h13', p: 'p1', kind: 'exam', type: 'ecg', date: '2018-11-02', title: 'ECG a 12 derivazioni (fax)', by: 'Ospedale Civico', origin: 'external', text: 'image_only' },
  { id: 'h14', p: 'p1', kind: 'report', type: 'visit', date: '2017-04-20', title: 'Prima visita cardiologica', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text' },
  { id: 'h15', p: 'p5', kind: 'exam', type: 'echo', date: '2026-03-02', title: 'Ecocardiogramma - scompenso', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text', vals: { FE: '38 %' } },
  { id: 'h16', p: 'p5', kind: 'exam', type: 'echo', date: '2024-09-19', title: 'Ecocardiogramma', by: 'Dr.ssa Bianchi', origin: 'internal', text: 'text', vals: { FE: '42 %' } },
  { id: 'h17', p: 'p8', kind: 'exam', type: 'pm', date: '2026-09-02', title: 'Controllo pacemaker', by: 'Dr. Ferrari', origin: 'internal', text: 'text' },
];
const ARCH_KIND = { report: 'Referto', exam: 'Esame', lab: 'Laboratorio', letter: 'Lettera' };
const ARCH_TEXT = { text: ['Testo indicizzato', 'success'], ocr_unverified: ['OCR non verificato', 'warning'], image_only: ['Solo immagine, non ricercabile', 'danger'] };

/* Ingresso audio: il watcher su ~/referti/ingresso/{codice_medico}/ */
const AUDIO_INBOX = [
  { f: '20260909-0941-10231.m4a', doc: 'eb', dur: "3'12", state: 'processing', note: 'associato per regola nome file → Mario Rossi, visita 09:30', tech: 'associato per regola nome file → [redacted]' },
  { f: 'memo-4.m4a', doc: 'pf', dur: "1'48", state: 'needs_match', note: '2 visite compatibili nello stesso orario: nessuna auto-associazione, task creato', tech: '2 candidati: nessuna auto-associazione, task creato' },
  { f: '20260909-0815-10188.m4a', doc: 'eb', dur: "4'05", state: 'done', note: 'referto Anna Verdi · inviato 11:20', tech: 'job completato · 2 m 04 s' },
];
const AUDIO_STATE = { processing: ['In elaborazione', 'accent'], needs_match: ['Da associare', 'warning'], done: ['Completato', 'success'] };
