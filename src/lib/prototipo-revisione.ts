// Ponte tra la catena dei referti e il prototipo «referralflow-stack»
// (13.9.2026): traduce una bozza VERA (testo, parole con i tempi, payload
// della catena) nel modello dati della Guided Review del prototipo
// (trascrizione a segmenti, referto a span con fonte, issue con evidenza
// audio, marker, riga della coda). Logica pura, testabile, nessun accesso al
// DB. Mai contenuti nei log.

export type Parola = [string, number];

export type Segmento = { id: string; s: number; e: number; tx: string; w: [number, string][] };
export type Parte = { id: string; t: string; src: string | null; conf: 'matched' | 'likely' | 'ambiguous' | 'none'; issue?: string };
export type Sezione = { code: string; label: string; parts: Parte[] };
export type Evidenza = { s: number; e: number; focus: number } | null;
export type Opzione = { l: string; apply: string | null; note: string };
export type Issue = {
  id: string;
  cat: 'MEDICATION' | 'NEGATION' | 'NO_SOURCE' | 'NUMERIC' | 'TERM' | 'CLINICAL' | 'OMISSION' | 'STRUCTURE' | 'LANGUAGE';
  sev: 'critical' | 'verify' | 'uncertain' | 'suggestion' | 'language';
  title: string;
  span: string | null;
  now: string | null;
  ev: Evidenza;
  conf: 'matched' | 'likely' | 'ambiguous' | 'none';
  why: string;
  tr?: { primary: string; clinical: string };
  opts: Opzione[];
  preroll: number;
  audioTx?: string;
  add?: { section: string; text: string };
  doctorOnly?: boolean;
};
export type Marker = { t: number; k: 'drug' | 'num' | 'dx' | 'fup' | 'neg' | 'ai'; l: string };

export type Revisione = {
  audio: { dur: number; label: string; url: string | null };
  transcript: Segmento[];
  markers: Marker[];
  report: Sezione[];
  issues: Issue[];
  riepilogo: { issues: number; crit: number; state: 'priority' | 'advised' | 'some' | 'clean'; note: string; est: string };
};

const NEGAZIONI = new Set(['non', 'nega', 'negato', 'negata', 'senza', 'assenza', 'assente', 'mai', 'negativo', 'negativa', 'nessun', 'nessuna', 'nessuno']);

function norma(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9àèéìòù'\s/.,-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function gettoni(s: string): string[] {
  return (norma(s).match(/[a-z0-9][a-z0-9'.,/-]*/g) ?? []).map((w) => w.replace(/^[.,'/-]+|[.,'/-]+$/g, '')).filter((w) => w.length >= 3);
}
function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Segmenti di trascrizione dai tempi parola per parola: si chiude a fine
// frase, dopo una pausa lunga o oltre le 28 parole. Solo dove i tempi ci sono.
export function segmentiDaParole(parole: Parola[]): Segmento[] {
  const out: Segmento[] = [];
  let cur: [number, string][] = [];
  const chiudi = () => {
    if (!cur.length) return;
    out.push({
      id: `s${out.length + 1}`, s: Math.max(0, cur[0][0]), e: cur[cur.length - 1][0] + 0.7,
      tx: cur.map((x) => x[1]).join(' '), w: cur,
    });
    cur = [];
  };
  for (const p of parole) {
    if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'number') continue;
    const [parola, t] = p;
    if (cur.length && t - cur[cur.length - 1][0] > 1.4) chiudi();
    cur.push([t, parola]);
    if (/[.!?;]$/.test(parola) || cur.length >= 28) chiudi();
  }
  chiudi();
  return out;
}

// Il referto a sezioni (paragrafi) e span (frasi).
const ABBR = /(?:^|\s)(?:dr|dott|prof|sig|med|ssa|ecc|es|ca|art|tel|n|p|pag|vs)\.$/i;
export function sezioniDaTesto(testo: string): Sezione[] {
  const paragrafi = testo.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sezioni: Sezione[] = [];
  let k = 0;
  paragrafi.forEach((par, i) => {
    const prima = par.split('\n')[0];
    const etichetta = /^[A-ZÀ-Ü][^:\n]{1,40}:\s*$/.test(prima) ? prima.replace(/:\s*$/, '') : /^terapia\b/i.test(prima) ? 'Terapia' : /^(caro|cara|gentile|egregi)/i.test(prima) ? 'Apertura' : /^(cordiali|con i migliori|distinti)/i.test(prima) ? 'Chiusura' : `Paragrafo ${i + 1}`;
    const parts: Parte[] = [];
    for (const riga of par.split('\n')) {
      if (!riga.trim()) continue;
      let corrente = '';
      for (const f of riga.split(/(?<=[.!?;])\s+/)) {
        corrente = corrente ? `${corrente} ${f}` : f;
        if (/[.!?;]["»)]?$/.test(f.trim()) && !ABBR.test(f.trim())) {
          parts.push({ id: `p${++k}`, t: corrente, src: null, conf: 'none' });
          corrente = '';
        }
      }
      if (corrente.trim()) parts.push({ id: `p${++k}`, t: corrente, src: null, conf: 'none' });
    }
    if (parts.length) sezioni.push({ code: `sec${i + 1}`, label: etichetta, parts });
  });
  return sezioni;
}

type Aggancio = { seg: Segmento | null; punteggio: number; ev: Evidenza };
function aggancia(testo: string, segmenti: Segmento[]): Aggancio {
  const tok = gettoni(testo);
  if (!tok.length || !segmenti.length) return { seg: null, punteggio: 0, ev: null };
  const set = new Set(tok);
  let best: Segmento | null = null; let bestP = 0;
  for (const s of segmenti) {
    const ts = new Set(gettoni(s.tx));
    let comuni = 0;
    for (const w of set) if (ts.has(w)) comuni++;
    const p = comuni / set.size;
    if (p > bestP) { bestP = p; best = s; }
  }
  if (!best) return { seg: null, punteggio: 0, ev: null };
  const tempi = best.w.filter(([, w]) => set.has(gettoni(w)[0] ?? '')).map(([t]) => t);
  const ev: Evidenza = tempi.length ? { s: Math.max(0, tempi[0] - 0.3), e: tempi[tempi.length - 1] + 1.2, focus: tempi[0] } : { s: best.s, e: best.e, focus: best.s };
  return { seg: best, punteggio: bestP, ev };
}
function confDa(p: number): Parte['conf'] { return p >= 0.6 ? 'matched' : p >= 0.35 ? 'likely' : p >= 0.2 ? 'ambiguous' : 'none'; }

const RANGO_SEV = { critical: 0, verify: 1, uncertain: 2, suggestion: 3, language: 4 };
const RANGO_CAT = { MEDICATION: 0, NEGATION: 0, NO_SOURCE: 1, NUMERIC: 2, CLINICAL: 2, OMISSION: 3, TERM: 4, STRUCTURE: 5, LANGUAGE: 6 };

export function costruisciRevisione(ingresso: {
  testo: string; parole: Parola[]; payload: Record<string, unknown>; audioUrl?: string | null;
}): Revisione {
  const p = ingresso.payload ?? {};
  const transcript = segmentiDaParole(Array.isArray(ingresso.parole) ? ingresso.parole : []);
  const dur = transcript.length ? transcript[transcript.length - 1].e + 1 : 0;
  const report = sezioniDaTesto(ingresso.testo);
  const parti = report.flatMap((s) => s.parts);
  const evParte = new Map<string, Evidenza>();
  for (const parte of parti) {
    const a = aggancia(parte.t, transcript);
    parte.src = a.seg && a.punteggio >= 0.2 ? a.seg.id : null;
    parte.conf = confDa(a.punteggio);
    evParte.set(parte.id, parte.src ? a.ev : null);
  }
  const trovaParte = (frase: string | null | undefined): Parte | null => {
    if (!frase) return null;
    const nf = norma(frase);
    if (!nf) return null;
    const diretta = parti.find((x) => norma(x.t).includes(nf) || nf.includes(norma(x.t)));
    if (diretta) return diretta;
    const tok = new Set(gettoni(frase));
    if (!tok.size) return null;
    let best: Parte | null = null; let bp = 0;
    for (const x of parti) {
      const tx = new Set(gettoni(x.t));
      let c = 0; for (const w of tok) if (tx.has(w)) c++;
      const s = c / tok.size;
      if (s > bp) { bp = s; best = x; }
    }
    return bp >= 0.5 ? best : null;
  };
  const evDa = (parte: Parte | null, secondo?: number | null): Evidenza => {
    if (typeof secondo === 'number' && secondo >= 0) return { s: Math.max(0, secondo - 1), e: secondo + 3, focus: secondo };
    return parte ? evParte.get(parte.id) ?? null : null;
  };
  const sostituisci = (t: string, da: string, a: string) => (da && t.includes(da) ? t.replace(da, a) : t);

  const issues: Issue[] = [];
  let n = 0;
  const nuovo = (i: Omit<Issue, 'id'>) => { issues.push({ id: `i${++n}`, ...i }); };
  const lista = <T,>(k: string): T[] => (Array.isArray(p[k]) ? (p[k] as T[]) : []);

  for (const d of lista<{ contesto?: string; versione_a?: string; versione_b?: string; pesanti?: string[] }>('divergenze')) {
    if (!Array.isArray(d.pesanti) || !d.pesanti.length) continue;
    const a = String(d.versione_a ?? ''); const b = String(d.versione_b ?? '');
    const parte = trovaParte(a) ?? trovaParte(d.contesto);
    const neg = d.pesanti.some((w) => NEGAZIONI.has(norma(String(w))));
    const num = d.pesanti.some((w) => /\d/.test(String(w)));
    nuovo({
      cat: neg ? 'NEGATION' : num ? 'NUMERIC' : 'TERM', sev: neg ? 'critical' : 'verify',
      title: neg ? 'Negazione sentita da un solo motore' : 'I due motori non concordano',
      span: parte?.id ?? null, now: a || null, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: `Motore 1: «${a}» · Motore 2: «${b}». Parole che cambiano il senso: ${d.pesanti.join(', ')}. Riascolta e scegli.`,
      tr: { primary: a, clinical: b },
      opts: parte ? [
        { l: b || '(vuoto)', apply: sostituisci(parte.t, a, b), note: 'versione del secondo motore' },
        { l: `Mantieni «${a}»`, apply: parte.t, note: 'versione del primo motore' },
      ] : [],
      preroll: 2,
    });
  }
  for (const r of lista<{ da: string; a: string }>('riparazioni_applicate')) {
    const parte = trovaParte(r.a);
    nuovo({
      cat: 'TERM', sev: 'suggestion', title: 'Correzione automatica',
      span: parte?.id ?? null, now: r.a, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: `La catena ha corretto «${r.da}» in «${r.a}». Le guardie hanno controllato suono e numeri; se è sbagliata, annulla.`,
      tr: { primary: r.da, clinical: r.a },
      opts: parte ? [
        { l: `Annulla: torna «${r.da}»`, apply: sostituisci(parte.t, r.a, r.da), note: 'parola dettata' },
        { l: 'Mantieni la correzione', apply: parte.t, note: '' },
      ] : [],
      preroll: 1.5,
    });
  }
  for (const f of lista<{ frase: string; motivo: string }>('frasi_non_supportate')) {
    const parte = trovaParte(f.frase);
    nuovo({
      cat: 'NO_SOURCE', sev: 'critical', title: 'Frase non sostenuta dal dettato',
      span: parte?.id ?? null, now: f.frase, ev: evDa(parte), conf: parte ? parte.conf : 'none',
      why: f.motivo || 'Il verificatore non trova questa frase nel dettato.',
      opts: parte ? [
        { l: 'Non è nel dettato: elimina', apply: '', note: 'registrata come frase inventata' },
        { l: 'Mantieni', apply: parte.t, note: 'richiede una motivazione' },
      ] : [],
      preroll: 2,
    });
  }
  for (const f of lista<{ frase: string; proposta: string }>('frasi_da_chiarire')) {
    const parte = trovaParte(f.frase);
    nuovo({
      cat: 'TERM', sev: 'uncertain', title: 'Frase da chiarire',
      span: parte?.id ?? null, now: f.frase, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: f.proposta ? `La frase non torna; la catena propone: «${f.proposta}».` : 'La frase non torna e la catena non ha una proposta: riascolta.',
      opts: parte ? [
        ...(f.proposta ? [{ l: f.proposta, apply: sostituisci(parte.t, f.frase, f.proposta), note: 'proposta della catena' }] : []),
        { l: 'Mantieni', apply: parte.t, note: '' },
      ] : [],
      preroll: 2,
    });
  }
  for (const nn of lista<{ valore: string; unita?: string; secondo?: number | null; confermato?: boolean | null }>('numeri')) {
    if (nn.confermato !== false) continue;
    const parte = trovaParte(String(nn.valore));
    nuovo({
      cat: 'NUMERIC', sev: 'verify', title: 'Numero non confermato dal riascolto',
      span: parte?.id ?? null, now: `${nn.valore}${nn.unita ? ' ' + nn.unita : ''}`, ev: evDa(parte, nn.secondo), conf: parte?.conf ?? 'none',
      why: 'Il secondo ascolto non ha ritrovato questo numero nell’audio: riascolta il punto.',
      opts: parte ? [{ l: 'Confermo il numero', apply: parte.t, note: 'dopo il riascolto' }] : [],
      preroll: 1.5,
    });
  }
  for (const a of lista<{ campo?: string; valore?: unknown; stato?: string }>('allarmi_numerici')) {
    const parte = trovaParte(String(a.valore ?? ''));
    nuovo({
      cat: 'NUMERIC', sev: 'critical', title: `Allarme numerico${a.campo ? `: ${String(a.campo).replaceAll('_', ' ')}` : ''}`,
      span: parte?.id ?? null, now: a.valore != null ? String(a.valore) : null, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: a.stato === 'fuori' ? 'Numero insolito per questo campo, spesso una cifra sentita male.' : a.stato === 'limite' ? 'Numero raro per questo campo: vale un riascolto.' : 'Numero da controllare.',
      opts: parte ? [{ l: 'Confermo dopo il riascolto', apply: parte.t, note: '' }] : [],
      preroll: 2,
    });
  }
  const ultimaSezione = report.length ? report[report.length - 1].code : 'sec1';
  for (const o of lista<{ frase: string; pulita?: string; secondo?: number | null; cifre?: boolean; farmaco?: boolean; motivo?: string; simile?: string; fonte?: string }>('frasi_omesse')) {
    const testo = o.pulita || o.frase;
    nuovo({
      cat: 'OMISSION', sev: o.cifre || o.farmaco ? 'critical' : 'verify',
      title: o.cifre ? 'Omissione con numeri' : o.farmaco ? 'Omissione con un farmaco' : 'Possibile omissione',
      span: null, now: null, ev: evDa(null, o.secondo) ?? aggancia(testo, transcript).ev, conf: typeof o.secondo === 'number' ? 'matched' : 'likely',
      why: `${o.motivo || 'Detto nell’audio, non trovato nel referto.'}${o.simile ? ` Forse è già nel referto come: «${o.simile}».` : ''}${o.fonte === 'modello' ? ' (vista dal modello)' : ''}`,
      audioTx: testo,
      add: { section: ultimaSezione, text: testo },
      opts: [{ l: 'Aggiungi al referto', apply: null, note: 'in fondo, poi sposta' }, { l: 'Ignora', apply: null, note: 'resta solo nell’audio' }],
      preroll: 2,
    });
  }
  for (const c of lista<{ passaggio_a: string; passaggio_b: string; motivo: string }>('incoerenze')) {
    const parte = trovaParte(c.passaggio_a);
    nuovo({
      cat: 'CLINICAL', sev: 'verify', title: 'Contraddizione interna',
      span: parte?.id ?? null, now: c.passaggio_a, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: `${c.motivo} — In conflitto con: «${c.passaggio_b}». Decide il medico.`,
      opts: [], doctorOnly: true, preroll: 2,
    });
  }
  for (const d of lista<{ frase: string; simile_a: string; motivo: string }>('doppioni_dubbi')) {
    const parte = trovaParte(d.frase);
    nuovo({
      cat: 'STRUCTURE', sev: 'suggestion', title: 'Possibile doppione',
      span: parte?.id ?? null, now: d.frase, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: `Somiglia a «${d.simile_a}». ${d.motivo}`,
      opts: parte ? [{ l: 'Togli', apply: '', note: '' }, { l: 'Mantieni', apply: parte.t, note: '' }] : [],
      preroll: 1.5,
    });
  }
  for (const d of lista<{ tolta: string; tenuta: string; motivo: string }>('doppioni_tolti')) {
    const parte = trovaParte(d.tenuta);
    nuovo({
      cat: 'STRUCTURE', sev: 'suggestion', title: 'Tolto come doppione',
      span: parte?.id ?? null, now: d.tolta, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: `La catena ha tolto «${d.tolta}» (${d.motivo}); resta «${d.tenuta}».`,
      opts: parte ? [{ l: 'Rimetti', apply: `${parte.t} ${d.tolta}`, note: 'accanto alla frase tenuta' }, { l: 'Lascia tolta', apply: parte.t, note: '' }] : [],
      preroll: 1.5,
    });
  }
  const terapia = p.terapia && typeof p.terapia === 'object' ? (p.terapia as { dubbi?: { riga: string; motivo: string }[] }) : null;
  for (const d of terapia?.dubbi ?? []) {
    const parte = trovaParte(d.riga);
    nuovo({
      cat: 'MEDICATION', sev: 'verify', title: 'Terapia da verificare',
      span: parte?.id ?? null, now: d.riga, ev: evDa(parte), conf: parte?.conf ?? 'none',
      why: d.motivo, opts: [], preroll: 2,
    });
  }

  issues.sort((a, b) => RANGO_SEV[a.sev] - RANGO_SEV[b.sev] || RANGO_CAT[a.cat] - RANGO_CAT[b.cat]);
  issues.forEach((i, k) => { i.id = `i${k + 1}`; });
  // Una issue per span (la più grave): il prototipo evidenzia lo span con la sua issue.
  const presi = new Set<string>();
  for (const i of issues) {
    if (i.span && !presi.has(i.span)) {
      const parte = parti.find((x) => x.id === i.span);
      if (parte) { parte.issue = i.id; presi.add(i.span); }
    }
  }

  const markers: Marker[] = [];
  for (const nn of lista<{ valore: string; unita?: string; secondo?: number | null }>('numeri')) {
    if (typeof nn.secondo === 'number') markers.push({ t: nn.secondo, k: 'num', l: `${nn.valore}${nn.unita ? ' ' + nn.unita : ''}` });
  }
  for (const i of issues) if (i.cat === 'OMISSION' && i.ev) markers.push({ t: i.ev.focus, k: 'ai', l: 'Omissione' });
  for (const i of issues) if (i.cat === 'NEGATION' && i.ev) markers.push({ t: i.ev.focus, k: 'neg', l: 'Negazione' });
  markers.sort((a, b) => a.t - b.t);

  const crit = issues.filter((i) => i.sev === 'critical' || i.cat === 'NO_SOURCE').length;
  const fiducia = p.fiducia && typeof p.fiducia === 'object' ? (p.fiducia as { punteggio?: number; livello?: string; motivi?: string[] }) : null;
  const state: Revisione['riepilogo']['state'] = crit > 0 ? 'priority' : fiducia?.livello === 'bassa' ? 'advised' : issues.length > 0 ? 'some' : 'clean';
  const note = fiducia?.motivi?.[0] ?? (typeof fiducia?.punteggio === 'number' ? `fiducia ${fiducia.punteggio}/100` : issues.length ? `${issues.length} verifiche` : 'nessuna anomalia specifica rilevata');
  return {
    audio: { dur, label: fmt(dur), url: ingresso.audioUrl ?? null },
    transcript, markers, report, issues,
    riepilogo: { issues: issues.length, crit, state, note, est: `${Math.max(1, Math.round(issues.length * 0.6))} min` },
  };
}
