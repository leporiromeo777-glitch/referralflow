/* ReferralFlow — dataset della Guided Review (fittizio).
   Audio simulato: il prototipo non carica un file audio, ma un orologio di
   riproduzione con la stessa semantica (durata, posizione, finestra di evidenza,
   velocità). Tutto il resto — span, evidenze, issue, correzioni — è reale. */

const RV_AUDIO = { dur: 402, label: '6:42' }; // secondi

/* Trascrizione: segmenti con inizio/fine in secondi.
   `w` = timing per parola, presente SOLO dove il modello lo fornisce davvero:
   dove manca si evidenzia il segmento, non si finge precisione parola-per-parola. */
const RV_TRANSCRIPT = [
  { id: 's1', s: 0, e: 8, tx: 'Allora, controllo cardiologico del signor Rossi, nove settembre duemilaventisei.' },
  { id: 's2', s: 12, e: 20, tx: 'Il paziente riferisce palpitazioni serali, due o tre volte a settimana, di breve durata.' },
  { id: 's3', s: 24, e: 31, tx: 'Non ha avuto sincopi, non ha avuto lipotimie.' },
  { id: 's4', s: 96, e: 104, tx: 'Ha portato la lettera di dimissione del Cardiocentro, ricovero per fibrillazione atriale ad alta risposta.' },
  {
    id: 's5', s: 160, e: 170, tx: 'Il paziente continua bisoprololo due e mezzo milligrammi una volta al giorno.',
    w: [[160.2, 'Il'], [160.5, 'paziente'], [161.1, 'continua'], [161.9, 'bisoprololo'], [163.0, 'due'], [163.4, 'e'], [163.6, 'mezzo'], [164.2, 'milligrammi'], [165.0, 'una'], [165.3, 'volta'], [165.6, 'al'], [165.8, 'giorno.']],
  },
  { id: 's6', s: 172, e: 181, tx: 'Ramipril dieci milligrammi, apixaban cinque milligrammi due volte al giorno.' },
  {
    id: 's7', s: 198, e: 206, tx: 'Nega dolore toracico, nega dispnea da sforzo.',
    w: [[198.4, 'Nega'], [199.0, 'dolore'], [199.7, 'toracico,'], [200.9, 'nega'], [201.5, 'dispnea'], [202.4, 'da'], [202.7, 'sforzo.']],
  },
  { id: 's8', s: 246, e: 256, tx: "All'ecocardiogramma transtoracico, insufficienza mitralica lieve, atrio sinistro quarantadue millimetri." },
  { id: 's9', s: 258, e: 267, tx: "Frazione d'eiezione cinquantotto per cento, funzione sistolica conservata." },
  {
    id: 's10', s: 308, e: 318, tx: "L'Holter, quello del dodici agosto, mostrava un burden del tre per cento.",
    w: [[308.3, "L'Holter,"], [309.2, 'quello'], [309.6, 'del'], [310.1, 'dodici'], [310.9, 'agosto,'], [312.0, 'mostrava'], [312.8, 'un'], [313.0, 'burden'], [313.9, 'del'], [314.2, 'tre'], [314.6, 'per'], [314.9, 'cento.']],
  },
  { id: 's11', s: 372, e: 382, tx: 'Programmiamo un Holter di controllo e lo rivedo tra sei mesi.' },
  { id: 's12', s: 386, e: 394, tx: 'Mandiamo una copia al medico curante, il dottor Sala.' },
];

/* Marker sulla waveform: pochi, filtrabili, non centinaia */
const RV_MARKERS = [
  { t: 163, k: 'drug', l: 'Bisoprololo' },
  { t: 174, k: 'drug', l: 'Ramipril' },
  { t: 201, k: 'neg', l: 'Negazione' },
  { t: 248, k: 'dx', l: 'Ecocardiogramma' },
  { t: 260, k: 'num', l: 'FE 58 %' },
  { t: 310, k: 'num', l: 'Data Holter' },
  { t: 375, k: 'fup', l: 'Follow-up' },
];
const RV_MARKER_LABEL = { drug: 'Farmaco', num: 'Numero', dx: 'Diagnosi/esame', fup: 'Follow-up', neg: 'Negazione', ai: 'Dubbio AI' };

/* Il referto come sequenza di span: ogni span può avere una fonte e una issue.
   conf = qualità dell'allineamento con l'audio (mai una percentuale inventata). */
const RV_REPORT = [
  {
    code: 'reason', label: 'Motivo della consultazione', parts: [
      { id: 'p1', t: 'Controllo cardiologico programmato in paziente con fibrillazione atriale parossistica nota.', src: 's1', conf: 'matched' },
    ],
  },
  {
    code: 'history', label: 'Anamnesi', parts: [
      { id: 'p2', t: 'Il paziente riferiscono palpitazioni serali, 2-3 episodi a settimana, di breve durata.', src: 's2', conf: 'matched', issue: 'i9' },
      { id: 'p3', t: 'Riferisce dolore toracico durante gli sforzi.', src: 's7', conf: 'matched', issue: 'i2' },
      { id: 'p4', t: 'Riferisce inoltre nicturia.', src: null, conf: 'none', issue: 'i3' },
      { id: 'p5', t: 'Recente ricovero al Cardiocentro per episodio di FA ad alta risposta.', src: 's4', conf: 'matched' },
      { id: 'p6', t: 'Lo rivedo tra sei mesi.', src: 's11', conf: 'likely', issue: 'i8' },
    ],
  },
  {
    code: 'exam', label: 'Esame clinico', parts: [
      { id: 'p7', t: 'Paziente in buone condizioni generali, PA 128/78 mmHg, FC 72 bpm ritmica.', src: null, conf: 'likely' },
    ],
  },
  {
    code: 'tests', label: 'Esami', parts: [
      { id: 'p8', t: "All'ecocardiogramma transesofageo si documenta insufficienza mitralica lieve, atrio sinistro 42 mm.", src: 's8', conf: 'matched', issue: 'i5' },
      { id: 'p9', t: "Frazione d'eiezione 58 %, buona funzione ventricolare.", src: 's9', conf: 'matched', issue: 'i10' },
      { id: 'p10', t: 'Holter ECG del 12.06.2026: FA parossistica, burden 3 %.', src: 's10', conf: 'likely', issue: 'i4' },
    ],
  },
  {
    code: 'assessment', label: 'Valutazione', parts: [
      { id: 'p11', t: 'Quadro di fibrillazione atriale parossistica sintomatica con buon controllo della frequenza.', src: 's9', conf: 'likely' },
      { id: 'p12', t: "Insufficienza mitralica lieve, non emodinamicamente significativa", src: 's8', conf: 'ambiguous', issue: 'i6' },
    ],
  },
  {
    code: 'therapy', label: 'Terapia', parts: [
      { id: 'p13', t: 'Continua Bisoprololo 2,5 mg 1x/die', src: 's5', conf: 'matched', issue: 'i1' },
      { id: 'p14', t: ', Ramipril 10 mg 1x/die, Apixaban 5 mg 2x/die.', src: 's6', conf: 'matched' },
    ],
  },
  {
    code: 'followup', label: 'Follow-up', parts: [
      { id: 'p15', t: 'Copia del referto al medico curante.', src: 's12', conf: 'matched' },
    ],
  },
];

/* Review Path: le issue in ordine di priorità clinica, non di posizione nel testo */
const RV_ISSUES = [
  {
    id: 'i1', cat: 'MEDICATION', sev: 'critical', title: 'Dosaggio da verificare',
    span: 'p13', now: 'Bisoprololo 2,5 mg', ev: { s: 160.5, e: 167, focus: 163 }, conf: 'matched',
    why: 'La trascrizione primaria ha capito "due e mezzo" e la bozza ha seguito lei; il verificatore clinico ha capito "cinque". È una divergenza di classe number su un farmaco, quindi la fusione non ha deciso. La terapia attiva in cartella registra Bisoprololo 5 mg dal 04.09.2026.',
    tr: { primary: 'bisoprololo due e mezzo milligrammi', clinical: 'bisoprololo cinque milligrammi' },
    opts: [
      { l: '5 mg', apply: 'Continua Bisoprololo 5 mg 1x/die', note: 'coerente con la terapia attiva' },
      { l: '2,5 mg', apply: 'Continua Bisoprololo 2,5 mg 1x/die', note: 'in conflitto con la terapia attiva' },
    ],
    preroll: 3,
  },
  {
    id: 'i2', cat: 'NEGATION', sev: 'critical', title: 'Possibile negazione invertita',
    span: 'p3', now: 'Riferisce dolore toracico durante gli sforzi.', ev: { s: 197, e: 207, focus: 199 }, conf: 'matched',
    why: "Nell'audio la frase è in forma negativa (\"nega dolore toracico\") mentre il referto la riporta in forma affermativa. Le negazioni invertite sono l'errore più pericoloso di un referto: cambiano il significato clinico senza rendere il testo sospetto.",
    tr: { primary: 'Nega dolore toracico, nega dispnea da sforzo.', clinical: 'Nega dolore toracico, nega dispnea da sforzo.' },
    opts: [
      { l: 'Nega dolore toracico e dispnea da sforzo.', apply: 'Nega dolore toracico e dispnea da sforzo.', note: "come nell'audio" },
      { l: 'Mantieni il testo attuale', apply: 'Riferisce dolore toracico durante gli sforzi.', note: 'richiede una motivazione' },
    ],
    preroll: 4,
  },
  {
    id: 'i3', cat: 'NO_SOURCE', sev: 'verify', title: 'Fonte non individuata',
    span: 'p4', now: 'Riferisce inoltre nicturia.', ev: null, conf: 'none',
    why: "Questa frase del referto non ha un'evidenza nell'audio né nei dati strutturati. Non invento un timestamp: se non trovo la fonte lo dichiaro, perché è così che si riconosce una frase inventata dal modello.",
    opts: [
      { l: 'Non presente nell’audio — elimina', apply: '', note: 'registrata come possibile allucinazione' },
      { l: 'Cerca nell’audio', apply: null, note: 'ricerca testuale sul termine' },
    ],
    preroll: 0,
  },
  {
    id: 'i4', cat: 'NUMERIC', sev: 'verify', title: 'Data da verificare',
    span: 'p10', now: 'Holter ECG del 12.06.2026: FA parossistica, burden 3 %.', ev: { s: 308.5, e: 316, focus: 310.1 }, conf: 'likely',
    why: "Nell'audio si sente \"dodici agosto\"; il referto riporta 12.06. In archivio esiste un Holter del 12.08.2026 e nessuno del 12.06.",
    tr: { primary: 'quello del dodici agosto', clinical: 'quello del dodici agosto' },
    opts: [
      { l: '12.08.2026', apply: 'Holter ECG del 12.08.2026: FA parossistica, burden 3 %.', note: "corrisponde all'esame in archivio" },
      { l: '12.06.2026', apply: 'Holter ECG del 12.06.2026: FA parossistica, burden 3 %.', note: 'nessun esame corrispondente' },
    ],
    preroll: 2,
  },
  {
    id: 'i5', cat: 'TERM', sev: 'uncertain', title: 'Termine da verificare',
    span: 'p8', now: "All'ecocardiogramma transesofageo si documenta insufficienza mitralica lieve, atrio sinistro 42 mm.", ev: { s: 245, e: 254, focus: 246.5 }, conf: 'matched',
    why: "Il referto dice \"transesofageo\", l'audio dice \"transtoracico\". Sono due esami diversi: è una correzione di trascrizione verificabile direttamente ascoltando.",
    tr: { primary: "All'ecocardiogramma transtoracico", clinical: "All'ecocardiogramma transtoracico" },
    opts: [
      { l: 'transtoracico', apply: "All'ecocardiogramma transtoracico si documenta insufficienza mitralica lieve, atrio sinistro 42 mm.", note: "come nell'audio" },
      { l: 'transesofageo', apply: "All'ecocardiogramma transesofageo si documenta insufficienza mitralica lieve, atrio sinistro 42 mm.", note: 'mantiene il testo attuale' },
    ],
    preroll: 2,
  },
  {
    id: 'i6', cat: 'CLINICAL', sev: 'verify', title: 'Ambiguità clinica — non decidere',
    span: 'p12', now: 'Insufficienza mitralica lieve, non emodinamicamente significativa', ev: { s: 249, e: 256, focus: 250 }, conf: 'ambiguous',
    why: "L'audio è poco chiaro fra \"lieve\" e \"lieve-moderata\", e la frase sulla significatività emodinamica non compare nell'audio: è una valutazione clinica. Non è una correzione di trascrizione, quindi non tocca alla segreteria.",
    tr: { primary: 'insufficienza mitralica lieve', clinical: 'insufficienza mitralica lieve-moderata' },
    opts: [],
    doctorOnly: true,
    preroll: 3,
  },
  {
    id: 'i7', cat: 'OMISSION', sev: 'verify', title: 'Possibile omissione',
    span: null, now: null, ev: { s: 371, e: 383, focus: 373 }, conf: 'matched',
    why: "Nell'audio il medico programma un Holter di controllo; nel referto non trovo questa informazione in nessuna sezione.",
    audioTx: 'Programmiamo un Holter di controllo e lo rivedo tra sei mesi.',
    add: { section: 'followup', text: 'Si programma monitoraggio ECG Holter di controllo. Controllo cardiologico tra 6 mesi.' },
    opts: [
      { l: 'Aggiungi al referto', apply: null, note: 'sezione proposta: Follow-up' },
      { l: 'Ignora', apply: null, note: "l'informazione resta solo nell'audio" },
    ],
    preroll: 2,
  },
  {
    id: 'i8', cat: 'STRUCTURE', sev: 'suggestion', title: 'Informazione nella sezione sbagliata',
    span: 'p6', now: 'Lo rivedo tra sei mesi.', ev: { s: 376, e: 382, focus: 377 }, conf: 'likely',
    why: 'Una programmazione di controllo si trova in Anamnesi. Il template dello studio la colloca in Follow-up.',
    opts: [
      { l: 'Sposta in Follow-up', apply: null, note: 'testo invariato, cambia solo la sezione' },
      { l: 'Lascia dov’è', apply: null, note: '' },
    ],
    preroll: 2,
  },
  {
    id: 'i9', cat: 'LANGUAGE', sev: 'language', title: 'Concordanza verbale',
    span: 'p2', now: 'Il paziente riferiscono palpitazioni serali, 2-3 episodi a settimana, di breve durata.', ev: { s: 12, e: 20, focus: 13 }, conf: 'matched',
    why: 'Errore di concordanza fra soggetto e verbo. Classe GRAMMAR: nessun impatto sul contenuto clinico.',
    opts: [
      { l: 'riferisce', apply: 'Il paziente riferisce palpitazioni serali, 2-3 episodi a settimana, di breve durata.', note: 'correzione grammaticale' },
    ],
    preroll: 1.5,
  },
  {
    id: 'i10', cat: 'LANGUAGE', sev: 'language', title: 'Preferenza di terminologia',
    span: 'p9', now: "Frazione d'eiezione 58 %, buona funzione ventricolare.", ev: { s: 258, e: 267, focus: 259 }, conf: 'matched',
    why: 'La Dr.ssa Bianchi ha sostituito "buona funzione ventricolare" con la formula estesa 27 volte negli ultimi 90 giorni. È una preferenza di stile, non un errore: viene proposta, non applicata.',
    opts: [
      { l: 'funzione sistolica ventricolare sinistra conservata', apply: "Frazione d'eiezione 58 %, funzione sistolica ventricolare sinistra conservata.", note: 'formula preferita dal medico (27 volte)' },
      { l: 'Mantieni', apply: "Frazione d'eiezione 58 %, buona funzione ventricolare.", note: '' },
    ],
    preroll: 1.5,
  },
];

const RV_CAT = {
  MEDICATION: ['Farmaco / dosaggio', 1, 4],
  NEGATION: ['Negazione', 1, 5],
  NO_SOURCE: ['Fonte assente', 1, 5],
  NUMERIC: ['Dato numerico', 2, 3],
  TERM: ['Termine clinico', 3, 1],
  CLINICAL: ['Valutazione clinica', 1, 5],
  OMISSION: ['Omissione', 4, 5],
  STRUCTURE: ['Struttura', 5, 0.5],
  LANGUAGE: ['Lingua e stile', 6, 0.5],
};
const RV_SEV = {
  critical: ['Critico', 'danger'],
  verify: ['Da verificare', 'warning'],
  uncertain: ['Incerto', 'warning'],
  suggestion: ['Suggerimento', 'accent'],
  language: ['Forma', ''],
};
const RV_CONF = {
  matched: ['Fonte individuata', 'success'],
  likely: ['Fonte probabile', 'accent'],
  ambiguous: ['Fonte ambigua', 'warning'],
  none: ['Fonte non individuata', 'danger'],
};

/* Coda "Referti da controllare": stati, non percentuali di confidenza */
const RV_QUEUE = [
  { id: 'r1', p: 'p1', doc: 'eb', type: 'Controllo cardiologico', at: '09.09 · 14:30', audio: '6:42', issues: 10, crit: 2, est: '4 min', state: 'priority', note: '2 possibili incongruenze su farmaco e negazione' },
  { id: 'r4', p: 'p4', doc: 'pf', type: 'Ecocardiogramma', at: '09.09 · 11:10', audio: '3:18', issues: 3, crit: 0, est: '2 min', state: 'some', note: '1 data da verificare' },
  { id: 'r5', p: 'p7', doc: 'eb', type: 'Controllo pacemaker', at: '09.09 · 09:50', audio: '2:04', issues: 0, crit: 0, est: '1 min', state: 'clean', note: 'nessuna anomalia specifica rilevata' },
  { id: 'r6', p: 'p6', doc: 'pf', type: 'Prima visita', at: '08.09 · 16:20', audio: '11:26', issues: 6, crit: 0, est: '6 min', state: 'advised', note: 'audio lungo, 3 termini incerti', blocked: true },
];
const RV_QSTATE = {
  clean: ['Nessuna anomalia evidente', 'success'],
  some: ['Alcuni punti da verificare', 'accent'],
  advised: ['Revisione consigliata', 'warning'],
  priority: ['Revisione prioritaria', 'danger'],
};
