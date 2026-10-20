// Grassetto, corsivo e sottolineato messi a mano nella revisione (20.10.2026, richiesta dello studio: «per le correzioni
// dei referti una barra per mettere in grassetto, corsivo… ciò che ho evidenziato»). PURO.
//
// Il testo della lettera resta testo semplice (è quello che la catena, l'audit e le prove conoscono): la formattazione
// sta a parte, in `payload.formattazione`, come elenco di pezzi — il testo del pezzo e QUALE delle sue comparse è
// («la seconda volta che compare "fibrillazione atriale"»). Così resiste alle correzioni fatte prima e dopo nel testo,
// e se il pezzo non c'è più semplicemente non si applica. Il confronto non bada agli spazi e agli a capo (il Word ricompone
// i paragrafi), sì a maiuscole e accenti: è il testo che la persona ha selezionato.
// La stessa logica è nella pagina (bridge/19-formattazione.js): le due vanno tenute uguali.

// `s`: la dimensione del carattere in punti (20.10.2026: «metti anche il font che puoi ingrandire»); senza, quella del Word (12).
export type Voce = { testo: string; n: number; b?: boolean; i?: boolean; u?: boolean; s?: number };
export type Pezzo = { t: string; b: boolean; i?: boolean; u?: boolean; s?: number };
export const B = 1, I = 2, U = 4;
export const DIMENSIONI = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28];
// Per ogni carattere un numero: i tre stili nei primi tre bit, la dimensione dal quarto in su (0 = quella del Word).
export const stileDi = (v: number) => ({ f: v & 7, s: v >> 3 });

const MAX_VOCI = 400;

// Le voci mandate dalla pagina: solo testo, numero della comparsa e i tre sì/no. Undefined = non valide.
export function vociValide(v: unknown): Voce[] | undefined {
  if (!Array.isArray(v) || v.length > MAX_VOCI) return undefined;
  const out: Voce[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') return undefined;
    const r = x as Record<string, unknown>;
    const testo = typeof r.testo === 'string' ? r.testo.replace(/\s+/g, ' ').trim() : '';
    const n = r.n;
    if (!testo || testo.length > 2000 || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 5000) return undefined;
    for (const k of ['b', 'i', 'u']) if (r[k] !== undefined && typeof r[k] !== 'boolean') return undefined;
    if (r.s !== undefined && !DIMENSIONI.includes(r.s as number)) return undefined;
    if (!r.b && !r.i && !r.u && !r.s) continue;
    out.push({ testo, n, ...(r.b ? { b: true } : {}), ...(r.i ? { i: true } : {}), ...(r.u ? { u: true } : {}), ...(r.s ? { s: r.s as number } : {}) });
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function modello(testo: string): RegExp | null {
  const parole = testo.split(/\s+/).filter(Boolean);
  return parole.length ? new RegExp(parole.map(esc).join('\\s+'), 'g') : null;
}

// Dove sta la n-esima comparsa (contando da 0) del pezzo nel testo: [da, a), o null.
export function trovaVoce(testo: string, v: Voce): [number, number] | null {
  const rx = modello(v.testo); if (!rx) return null;
  let m: RegExpExecArray | null, k = 0;
  while ((m = rx.exec(testo))) {
    if (!m[0].length) { rx.lastIndex++; continue; }
    if (k++ === v.n) return [m.index, m.index + m[0].length];
  }
  return null;
}

// Per ogni carattere del testo: B, I, U accesi e la dimensione (stileDi).
export function segniDi(testo: string, voci: Voce[]): Uint16Array {
  const segni = new Uint16Array(testo.length);
  for (const v of voci) {
    const r = trovaVoce(testo, v); if (!r) continue;
    const f = (v.b ? B : 0) | (v.i ? I : 0) | (v.u ? U : 0);
    for (let k = r[0]; k < r[1]; k++) segni[k] = (segni[k] | f) & 7 | (v.s ? v.s << 3 : segni[k] & ~7);
  }
  return segni;
}

// Dai segni alle voci: ogni tratto con gli stessi segni diventa un pezzo (gli spazi ai bordi restano fuori).
export function vociDai(testo: string, segni: ArrayLike<number>): Voce[] {
  const out: Voce[] = [];
  let k = 0;
  while (k < testo.length) {
    const f = segni[k] ?? 0;
    if (!f) { k++; continue; }
    let j = k; while (j < testo.length && (segni[j] ?? 0) === f) j++;
    let da = k, a = j;
    while (da < a && /\s/.test(testo[da])) da++;
    while (a > da && /\s/.test(testo[a - 1])) a--;
    if (a > da) {
      const pezzo = testo.slice(da, a), rx = modello(pezzo)!;
      let n = 0, m: RegExpExecArray | null;
      while ((m = rx.exec(testo)) && m.index < da) { if (!m[0].length) { rx.lastIndex++; continue; } n++; }
      out.push({ testo: pezzo.replace(/\s+/g, ' '), n, ...(f & B ? { b: true } : {}), ...(f & I ? { i: true } : {}), ...(f & U ? { u: true } : {}), ...(f >> 3 ? { s: f >> 3 } : {}) });
    }
    k = j;
  }
  return out;
}

// Le righe del testo del Word in pezzi con il loro stile: la formattazione messa a mano più il grassetto ripreso dalla
// lettera vecchia (già diviso per riga da `grassettoDi`).
export function righeFormattate(valore: string, voci: Voce[], grassettoDi?: (riga: string) => Pezzo[]): Pezzo[][] {
  const righe = valore.split('\n');
  const segni = voci.length ? segniDi(valore, voci) : null;
  let inizio = 0;
  return righe.map((riga) => {
    const da = inizio; inizio += riga.length + 1;
    const f = new Uint16Array(riga.length);
    if (segni) for (let k = 0; k < riga.length; k++) f[k] = segni[da + k];
    if (grassettoDi) { let p = 0; for (const z of grassettoDi(riga)) { if (z.b) for (let k = p; k < p + z.t.length && k < f.length; k++) f[k] |= B; p += z.t.length; } }
    const pezzi: Pezzo[] = [];
    let k = 0;
    while (k < riga.length) {
      let j = k; while (j < riga.length && f[j] === f[k]) j++;
      pezzi.push({ t: riga.slice(k, j), b: !!(f[k] & B), ...(f[k] & I ? { i: true } : {}), ...(f[k] & U ? { u: true } : {}), ...(f[k] >> 3 ? { s: f[k] >> 3 } : {}) });
      k = j;
    }
    return pezzi.length ? pezzi : [{ t: '', b: false }];
  });
}
