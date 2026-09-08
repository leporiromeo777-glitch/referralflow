// Motore di confronto tra due versioni di un referto (9.9.2026, audit trail).
// PURO: nessun accesso a DB o rete, così è testabile e riusabile. Produce le
// operazioni INSERT / DELETE / REPLACE a livello di parola, con categoria e
// severità, e le metriche per referto. Prima del confronto una
// normalizzazione toglie le differenze puramente tecniche (spazi, a capo,
// apostrofi tipografici): un referto reimpaginato non conta come corretto.

import fs from 'fs';
import os from 'os';
import path from 'path';

export type TipoOperazione = 'INSERT' | 'DELETE' | 'REPLACE';
export type Categoria =
  | 'punctuation' | 'formatting' | 'spelling' | 'grammar' | 'drug' | 'dose'
  | 'measurement' | 'date' | 'patient_information' | 'medical_terminology'
  | 'clinical_meaning' | 'other';
export type Severita = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Operazione = {
  kind: TipoOperazione;
  from: string;        // testo prima (vuoto per INSERT)
  to: string;          // testo dopo (vuoto per DELETE)
  posizione: number;   // indice della parola nel testo di partenza
  contesto: string;    // qualche parola attorno, per la lettura umana
  categoria: Categoria;
  severita: Severita;
};

export type Metriche = {
  edit_count: number;
  insertions: number;
  deletions: number;
  replacements: number;
  characters_changed: number;
  words_changed: number;
  words_total: number;
  edits_per_100_words: number;
  severity_max: Severita | null;
  categories: Partial<Record<Categoria, number>>;
};

export type Confronto = { operazioni: Operazione[]; metriche: Metriche };

// ——— Normalizzazione (§18): via ciò che non è una correzione ———
export function normalizza(testo: string): string {
  return (testo ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ——— Parole ———
// Un numero con decimali, una data, una pressione «135/105», una posologia
// «1-0-0-0» o «dell'anamnesi» restano UNA parola; i segni sciolti sono parole
// a sé, così «mg.» contro «mg» è una differenza di punteggiatura.
const RX_TOKEN = /[\p{L}\p{N}]+(?:[.,'’/\-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;

export function parole(testo: string): string[] {
  return normalizza(testo).match(RX_TOKEN) ?? [];
}

const ePunteggiatura = (t: string) => !/[\p{L}\p{N}]/u.test(t);
const chiave = (t: string) => t.toLowerCase();

// ——— Liste di dominio (facoltative: senza file le classi restano generiche) ———
let farmaci: Set<string> | null = null;
function caricaFarmaci(): Set<string> {
  if (farmaci) return farmaci;
  farmaci = new Set();
  try {
    const p = process.env.REFERTI_FARMACI_JSON || path.join(os.homedir(), 'referti-pipeline', 'dati', 'farmaci-ch.json');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const k of Object.keys(d?.nomi ?? {})) if (!k.includes(' ')) farmaci.add(k.toLowerCase());
    for (const k of Object.keys(d?.principi ?? {})) if (!k.includes(' ')) farmaci.add(k.toLowerCase());
  } catch { /* senza indice: niente classe farmaco */ }
  return farmaci;
}
let terminiMedici: Set<string> | null = null;
function caricaTermini(): Set<string> {
  if (terminiMedici) return terminiMedici;
  terminiMedici = new Set();
  const base = process.env.REFERTI_PIPELINE_DIR || path.join(os.homedir(), 'referti-pipeline');
  for (const nome of ['vocabolario.txt', 'vocabolario-locali.txt']) {
    try {
      for (const riga of fs.readFileSync(path.join(base, nome), 'utf8').split('\n')) {
        const t = riga.trim().toLowerCase();
        if (t && !t.startsWith('#')) for (const w of t.split(/[\s,]+/)) if (w.length >= 4) terminiMedici.add(w);
      }
    } catch { /* facoltativo */ }
  }
  return terminiMedici;
}
export function _impostaListeDiProva(f: string[], t: string[]): void {
  farmaci = new Set(f.map((x) => x.toLowerCase()));
  terminiMedici = new Set(t.map((x) => x.toLowerCase()));
}

const UNITA = /^(mg|mcg|µg|g|kg|ml|l|mmhg|bpm|%|cm|mm|m|ms|min|h|w|watt|ui|mmol\/l|ng\/l|u\/l|kg\/m2|kg\/m²|anni|mesi|settimane|giorni|ore|volte)$/i;
const NEGAZIONE = /^(non|nessun[ao]?|senza|assenz[ae]|assent[ei]|negativ[oaie]|esclus[oaie]|né)$/i;
const LATERALITA = /^(destr[oaie]|sinistr[oaie]|dx|sx|sn|bilateral[ei])$/i;
const QUALIFICATORE = /^(diminuit[oaie]|ridott[oaie]|aumentat[oaie]|elevat[oaie]|peggiorat[oaie]|migliorat[oaie]|stabil[ei]|invariat[oaie]|present[ei]|lieve|moderat[oaie]|sever[oaie]|grave|sospes[oaie]|interrott[oaie]|ripres[oaie]|reintrodott[oaie]|urgent[ei]|acut[oaie]|cronic[oaie])$/i;
const DATA = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)$/i;
const NUMERO = /\d/;
const PAZIENTE = /^(signor|signora|sig\.?|sig\.?ra|paziente|nat[oa]|nascita)$/i;

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function classifica(from: string[], to: string[], primaCtx: string[], dopoCtx: string[]): Categoria {
  const f = from.map(chiave), t = to.map(chiave);
  const soloPunt = [...from, ...to].every(ePunteggiatura);
  if (soloPunt) return 'punctuation';
  const fParole = f.filter((x) => !ePunteggiatura(x)), tParole = t.filter((x) => !ePunteggiatura(x));
  if (fParole.join(' ') === tParole.join(' ')) return fParole.length ? 'formatting' : 'punctuation';
  const farm = caricaFarmaci();
  const attorno = [...primaCtx, ...dopoCtx].map(chiave);
  const numeriF = fParole.filter((x) => NUMERO.test(x)), numeriT = tParole.filter((x) => NUMERO.test(x));
  if (numeriF.join('|') !== numeriT.join('|')) {
    // Stessa data scritta diversamente («12-8-2025» → «12.08.2025»): formato.
    const canonica = (x: string) => x.split(/[./-]/).map((s) => String(Number(s))).join('.');
    if (numeriF.length === numeriT.length && numeriF.every((x, k) => DATA.test(x) && DATA.test(numeriT[k]) && canonica(x) === canonica(numeriT[k]))) return 'formatting';
    if ([...fParole, ...tParole].some((x) => DATA.test(x))) return 'date';
    const conUnita = [...fParole, ...tParole, ...dopoCtx.slice(0, 1)].some((x) => UNITA.test(x));
    const conFarmaco = [...attorno, ...fParole, ...tParole].some((x) => farm.has(x));
    if (conUnita && conFarmaco) return 'dose';
    if (attorno.some((x) => PAZIENTE.test(x))) return 'patient_information';
    return 'measurement';
  }
  const farmF = fParole.filter((x) => farm.has(x)), farmT = tParole.filter((x) => farm.has(x));
  if (farmF.join() !== farmT.join()) return 'drug';
  const seg = (lista: string[], rx: RegExp) => lista.filter((x) => rx.test(x)).join();
  if (seg(fParole, NEGAZIONE) !== seg(tParole, NEGAZIONE)) return 'clinical_meaning';
  if (seg(fParole, LATERALITA) !== seg(tParole, LATERALITA)) return 'clinical_meaning';
  if (seg(fParole, QUALIFICATORE) !== seg(tParole, QUALIFICATORE)) return 'clinical_meaning';
  if (attorno.some((x) => PAZIENTE.test(x)) && (fParole.length <= 3 && tParole.length <= 3)) return 'patient_information';
  const termini = caricaTermini();
  if ([...fParole, ...tParole].some((x) => termini.has(x))) return 'medical_terminology';
  if (fParole.length === 1 && tParole.length === 1) {
    const a = fParole[0], b = tParole[0];
    const radice = (w: string) => w.slice(0, Math.max(4, w.length - 2));
    if (a.length > 5 && b.length > 5 && radice(a) === radice(b)) return 'grammar';
    if (levenshtein(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 4))) return 'spelling';
  }
  return 'other';
}

function severita(c: Categoria): Severita {
  switch (c) {
    case 'dose': return 'CRITICAL';
    case 'drug': case 'clinical_meaning': case 'measurement': case 'date': case 'patient_information': return 'HIGH';
    case 'punctuation': case 'formatting': return 'LOW';
    default: return 'MEDIUM';
  }
}
const PESO: Record<Severita, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

// ——— Diff a parole (LCS) ———
type Blocco = { i: number; prima: string[]; dopo: string[] };

function blocchi(a: string[], b: string[]): Blocco[] {
  const n = Math.min(a.length, 4000), m = Math.min(b.length, 4000);
  const ka = a.slice(0, n).map(chiave), kb = b.slice(0, m).map(chiave);
  const dp: Uint16Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Blocco[] = [];
  let i = 0, j = 0, cur: Blocco | null = null;
  const chiudi = () => { if (cur && (cur.prima.length || cur.dopo.length)) out.push(cur); cur = null; };
  const apri = () => { if (!cur) cur = { i, prima: [], dopo: [] }; };
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      if (a[i] !== b[j]) { apri(); cur!.prima.push(a[i]); cur!.dopo.push(b[j]); } // solo maiuscole
      else chiudi();
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) { apri(); cur!.prima.push(a[i]); i++; }
    else { apri(); cur!.dopo.push(b[j]); j++; }
  }
  while (i < n) { apri(); cur!.prima.push(a[i++]); }
  while (j < m) { apri(); cur!.dopo.push(b[j++]); }
  chiudi();
  return out;
}

function unisci(t: string[]): string {
  return t.reduce((s, w) => (s && !ePunteggiatura(w) ? `${s} ${w}` : s + w), '');
}

// Il confronto: `prima` è l'ultimo output dell'AI, `dopo` la versione della
// persona. Le parole totali sono quelle di `prima` (si normalizza sul testo
// che la persona ha ricevuto).
export function confronta(prima: string, dopo: string): Confronto {
  const a = parole(prima), b = parole(dopo);
  const ops: Operazione[] = [];
  for (const bl of blocchi(a, b)) {
    let from = bl.prima, to = bl.dopo;
    const fineBlocco = bl.i + bl.prima.length;
    const primaCtx = a.slice(Math.max(0, bl.i - 3), bl.i);
    const dopoCtx = a.slice(fineBlocco, fineBlocco + 3);
    // «2.5 mg → 5 mg»: se cambia un numero e subito dopo c'è l'unità, l'unità
    // entra nella lettura dell'operazione (non nel conteggio).
    const ultimoF = from[from.length - 1], ultimoT = to[to.length - 1];
    if (dopoCtx[0] && UNITA.test(dopoCtx[0]) && ((ultimoF && NUMERO.test(ultimoF)) || (ultimoT && NUMERO.test(ultimoT)))) {
      if (from.length) from = [...from, dopoCtx[0]];
      if (to.length) to = [...to, dopoCtx[0]];
    }
    const kind: TipoOperazione = bl.prima.length && bl.dopo.length ? 'REPLACE' : bl.prima.length ? 'DELETE' : 'INSERT';
    const categoria = classifica(bl.prima, bl.dopo, primaCtx, dopoCtx);
    ops.push({
      kind, from: unisci(from), to: unisci(to), posizione: bl.i,
      contesto: unisci([...primaCtx, ...(bl.prima.length ? bl.prima : ['⟨…⟩']), ...dopoCtx]),
      categoria, severita: severita(categoria),
    });
  }
  const wordsTotal = a.filter((t) => !ePunteggiatura(t)).length;
  const m: Metriche = {
    edit_count: ops.length,
    insertions: ops.filter((o) => o.kind === 'INSERT').length,
    deletions: ops.filter((o) => o.kind === 'DELETE').length,
    replacements: ops.filter((o) => o.kind === 'REPLACE').length,
    characters_changed: ops.reduce((s, o) => s + Math.max(o.from.length, o.to.length), 0),
    words_changed: ops.reduce((s, o) => s + Math.max(parole(o.from).filter((t) => !ePunteggiatura(t)).length, parole(o.to).filter((t) => !ePunteggiatura(t)).length), 0),
    words_total: wordsTotal,
    edits_per_100_words: wordsTotal ? Math.round((ops.length / wordsTotal) * 100 * 1000) / 1000 : 0,
    severity_max: ops.length ? ops.reduce<Severita>((mx, o) => (PESO[o.severita] > PESO[mx] ? o.severita : mx), 'LOW') : null,
    categories: {},
  };
  for (const o of ops) m.categories[o.categoria] = (m.categories[o.categoria] ?? 0) + 1;
  return { operazioni: ops, metriche: m };
}

// Vista in linea per la pagina del referto: pezzi uguali, tolti, aggiunti.
export type Pezzo = { tipo: 'uguale' | 'tolto' | 'aggiunto'; testo: string };
export function pezziInLinea(prima: string, dopo: string): Pezzo[] {
  const a = parole(prima), b = parole(dopo);
  const out: Pezzo[] = [];
  let cursore = 0;
  const spingi = (tipo: Pezzo['tipo'], t: string[]) => { if (t.length) out.push({ tipo, testo: unisci(t) }); };
  for (const bl of blocchi(a, b)) {
    spingi('uguale', a.slice(cursore, bl.i));
    spingi('tolto', bl.prima);
    spingi('aggiunto', bl.dopo);
    cursore = bl.i + bl.prima.length;
  }
  spingi('uguale', a.slice(cursore));
  return out;
}
