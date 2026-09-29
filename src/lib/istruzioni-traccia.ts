// Seconda traccia che contiene ISTRUZIONI (29.9.2026, richiesta dello
// studio): il medico spesso registra una seconda traccia non per continuare
// il referto ma per correggerlo — «aggiungi questa frase prima di…», «togli
// la frase…», «al posto di X scrivi Y». Incollarla in fondo era sbagliato.
//
// Qui la parte pura (si prova in prove-istruzioni-traccia.test.ts con
// referti inventati): riconoscere le istruzioni, numerare le frasi del
// referto per il modello, e APPLICARE il piano del modello con il codice —
// il modello indica frasi per numero e cita, non riscrive niente. Guardie:
// il testo da inserire o da mettere al posto deve venire dalla traccia
// dettata; ciò che si sostituisce deve stare davvero nella frase indicata.

export type Modifica =
  | { tipo: 'inserisci'; testo: string; prima_della_frase?: number; dopo_la_frase?: number }
  | { tipo: 'sostituisci'; frase: number; da: string; a: string }
  | { tipo: 'togli'; frase: number };

export type Esito = { modifica: Modifica; ok: boolean; motivo?: string; descrizione: string };

const VERBI = /\b(aggiung\w*|inserisc\w*|inserir\w*|mett\w*|togli\w*|elimin\w*|cancell\w*|sostituisc\w*|sostituir\w*|corregg\w*|correggere|cambi\w*|spost\w*|scriv\w*|riscriv\w*)\b/gi;
const POSIZIONI = /\b(al posto d[ie]|invece d[ie]|prima d(?:i|ella|el|ello|egli|elle)|dopo (?:la|il|lo|l['’])|dove dice|nella frase|la frase)\b/gi;

// La traccia è fatta di istruzioni? Almeno due segnali (un verbo di modifica
// più un'indicazione di posizione, o due verbi), in un testo non lungo.
export function sembraIstruzioni(testo: string): boolean {
  const t = String(testo || '');
  if (!t.trim() || t.length > 3000) return false;
  const verbi = (t.match(VERBI) ?? []).length;
  const posizioni = (t.match(POSIZIONI) ?? []).length;
  return (verbi >= 1 && posizioni >= 1) || verbi >= 2;
}

// Il referto in frasi, con quello che le separa (a capo e paragrafi
// compresi), così si ricompone identico dopo le modifiche.
export type Pezzo = { frase: string; dopo: string };
export function inFrasi(testo: string): Pezzo[] {
  const t = String(testo || '').replace(/\b(dr|dott|prof|med|sig|ca|es)\./gi, '$1․');
  const out: Pezzo[] = [];
  // Una frase finisce al punto, all'a capo (il saluto «Caro Luca,») o alla fine.
  const rx = /[^.!?\n]+(?:[.!?]+|(?=\n)|$)|\n/g;
  let m: RegExpExecArray | null;
  let resto = '';
  const pezzi: string[] = [];
  while ((m = rx.exec(t))) { if (m[0] === '') { rx.lastIndex++; continue; } pezzi.push(m[0]); }
  for (const p of pezzi) {
    if (p === '\n') { if (out.length) out[out.length - 1].dopo += '\n'; else resto += '\n'; continue; }
    const lead = /^\s*/.exec(p)![0];
    if (out.length) out[out.length - 1].dopo += lead; else resto += lead;
    const frase = p.slice(lead.length).replace(/\s+$/, '');
    const coda = p.slice(lead.length + frase.length);
    if (frase) out.push({ frase: frase.replace(/․/g, '.'), dopo: coda });
  }
  if (out.length && resto) out[0].frase = out[0].frase; // l'eventuale spazio iniziale si perde: il testo parte dalla prima frase
  return out;
}
export function ricomponi(pezzi: Pezzo[]): string {
  return pezzi.filter((p) => p.frase).map((p) => p.frase + p.dopo).join('').replace(/[ \t]+\n/g, '\n').trim();
}
export function numerate(pezzi: Pezzo[]): string {
  return pezzi.map((p, i) => `[${i + 1}] ${p.frase}`).join('\n');
}

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Il testo che il modello vuole inserire o mettere al posto deve venire
// dalla traccia: tutte le sue parole, nello stesso ordine, dentro il dettato.
export function vieneDallaTraccia(testo: string, traccia: string): boolean {
  const a = norm(testo), b = ` ${norm(traccia)} `;
  if (!a) return false;
  if (b.includes(` ${a} `)) return true;
  const parole = a.split(' ');
  let i = 0;
  for (const w of b.trim().split(' ')) { if (w === parole[i]) i++; if (i === parole.length) return true; }
  return false;
}

const breve = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

export function applica(testo: string, modifiche: Modifica[], traccia: string): { testo: string; esiti: Esito[] } {
  const pezzi = inFrasi(testo);
  const n = pezzi.length;
  const esiti: Esito[] = [];
  // Si applicano dal fondo, così i numeri delle frasi restano quelli visti
  // dal modello.
  const ordine = modifiche.map((m, i) => ({ m, i, pos: m.tipo === 'inserisci' ? (m.prima_della_frase ?? (m.dopo_la_frase ?? 0) + 0.5) : m.frase }))
    .sort((a, b) => b.pos - a.pos);
  const risultati = new Map<number, Esito>();
  for (const { m, i } of ordine) {
    const no = (motivo: string, descrizione: string) => risultati.set(i, { modifica: m, ok: false, motivo, descrizione });
    if (m.tipo === 'inserisci') {
      const t = String(m.testo || '').trim();
      const dove = m.prima_della_frase != null ? m.prima_della_frase - 1 : m.dopo_la_frase != null ? m.dopo_la_frase : null;
      const desc = `Aggiunta «${breve(t)}»`;
      if (!t) { no('testo vuoto', desc); continue; }
      if (dove == null || dove < 0 || dove > n) { no('posizione non trovata', desc); continue; }
      if (!vieneDallaTraccia(t, traccia)) { no('il testo non è quello dettato', desc); continue; }
      const frase = /[.!?]$/.test(t) ? t : `${t}.`;
      pezzi.splice(dove, 0, { frase: frase[0].toUpperCase() + frase.slice(1), dopo: ' ' });
      risultati.set(i, { modifica: m, ok: true, descrizione: `${desc} ${m.prima_della_frase != null ? `prima della frase ${m.prima_della_frase}` : `dopo la frase ${m.dopo_la_frase}`}` });
    } else if (m.tipo === 'sostituisci') {
      const k = m.frase - 1;
      const desc = `«${breve(String(m.da || ''))}» → «${breve(String(m.a || ''))}»`;
      if (!(k >= 0 && k < n)) { no('frase non trovata', desc); continue; }
      const da = String(m.da || '').trim(), a = String(m.a || '').trim();
      const idx = da ? pezzi[k].frase.toLowerCase().indexOf(da.toLowerCase()) : -1;
      if (idx < 0) { no('il testo da cambiare non è in quella frase', desc); continue; }
      if (!a || !vieneDallaTraccia(a, traccia)) { no('il testo nuovo non è quello dettato', desc); continue; }
      pezzi[k].frase = pezzi[k].frase.slice(0, idx) + a + pezzi[k].frase.slice(idx + da.length);
      risultati.set(i, { modifica: m, ok: true, descrizione: `${desc} nella frase ${m.frase}` });
    } else if (m.tipo === 'togli') {
      const k = m.frase - 1;
      if (!(k >= 0 && k < n)) { no('frase non trovata', `Tolta la frase ${m.frase}`); continue; }
      const desc = `Tolta la frase ${m.frase}: «${breve(pezzi[k].frase)}»`;
      // Il separatore della frase tolta (a capo, paragrafo) passa alla precedente.
      if (k > 0 && /\n/.test(pezzi[k].dopo) && !/\n/.test(pezzi[k - 1].dopo)) pezzi[k - 1].dopo = pezzi[k].dopo;
      pezzi[k] = { frase: '', dopo: '' };
      risultati.set(i, { modifica: m, ok: true, descrizione: desc });
    }
  }
  modifiche.forEach((_, i) => { const e = risultati.get(i); if (e) esiti.push(e); });
  return { testo: ricomponi(pezzi), esiti };
}

// Il piano del modello, letto con sospetto: solo i campi attesi.
export function leggiPiano(grezzo: string): { modifiche: Modifica[]; non_capite: string[] } {
  let d: any = {};
  try { d = JSON.parse(grezzo); } catch { return { modifiche: [], non_capite: [] }; }
  const intero = (x: unknown) => (Number.isInteger(Number(x)) && Number(x) > 0 ? Number(x) : undefined);
  const modifiche: Modifica[] = [];
  for (const m of Array.isArray(d?.modifiche) ? d.modifiche.slice(0, 30) : []) {
    if (m?.tipo === 'inserisci' && typeof m.testo === 'string') modifiche.push({ tipo: 'inserisci', testo: m.testo, prima_della_frase: intero(m.prima_della_frase), dopo_la_frase: intero(m.dopo_la_frase) });
    else if (m?.tipo === 'sostituisci' && intero(m.frase) && typeof m.da === 'string' && typeof m.a === 'string') modifiche.push({ tipo: 'sostituisci', frase: intero(m.frase)!, da: m.da, a: m.a });
    else if (m?.tipo === 'togli' && intero(m.frase)) modifiche.push({ tipo: 'togli', frase: intero(m.frase)! });
  }
  const non_capite = (Array.isArray(d?.non_capite) ? d.non_capite : []).filter((x: unknown): x is string => typeof x === 'string').slice(0, 20);
  return { modifiche, non_capite };
}

export const PROMPT_ISTRUZIONI = `Sei l'assistente di un cardiologo. Il medico ha registrato delle ISTRUZIONI per correggere il suo referto già scritto (per esempio «aggiungi questa frase prima di…», «togli la frase che dice…», «al posto di X scrivi Y»).
Ti do (A) il referto, una frase per riga con il suo numero tra parentesi quadre, e (B) le istruzioni dettate.
NON riscrivere il referto. Rispondi SOLO con un oggetto JSON:
{"modifiche": [
  {"tipo": "inserisci", "testo": "<la frase da aggiungere, copiata dalle istruzioni>", "prima_della_frase": <numero>} oppure con "dopo_la_frase": <numero>,
  {"tipo": "sostituisci", "frase": <numero>, "da": "<parole esatte della frase da cambiare>", "a": "<parole nuove, copiate dalle istruzioni>"},
  {"tipo": "togli", "frase": <numero>}
],
"non_capite": ["<istruzione che non sai applicare, copiata>"]}
Regole: il testo da aggiungere e le parole nuove li COPI dalle istruzioni, parola per parola, senza aggiungere niente; «da» è copiato dalla frase del referto; i numeri sono quelli di (A). Se un'istruzione non è chiara o non trovi la frase, mettila in "non_capite".

(A) REFERTO
{referto}

(B) ISTRUZIONI DETTATE
{istruzioni}`;
