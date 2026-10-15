// Un nome dettato (e scritto da Dragon, a volte storpiato) cercato in un elenco di persone: il medico nella rubrica degli
// invianti, il paziente in cartella (15.10.2026, [[Piattaforma/Dittafono]]). PURO.
//
// Ogni parola dettata deve somigliare a una parola diversa del nome in elenco (stessa parola, o una-due lettere di
// differenza nelle parole lunghe; nelle parole corte nessuna); l'ordine non conta («Rossi Mario» = «Mario Rossi»).
// Vince chi somiglia di più; se due somigliano quasi uguale non si sceglie: si propongono.

const TITOLI = new Set(['dr', 'dott', 'dottor', 'dottore', 'dottoressa', 'dssa', 'drssa', 'med', 'prof', 'professor', 'professore', 'professoressa',
  'sig', 'sigra', 'signor', 'signore', 'signora', 'il', 'la', 'lo', 'collega', 'fmh', 'pd']);

export function paroleNome(s: string): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ')
    .split(/[^a-z]+/).filter((w) => w.length > 1 && !TITOLI.has(w));
}
function distanza(a: string, b: string): number {
  const r: number[] = []; for (let j = 0; j <= b.length; j++) r[j] = j;
  for (let i = 1; i <= a.length; i++) { let su = r[0]; r[0] = i; for (let j = 1; j <= b.length; j++) { const t = r[j]; r[j] = Math.min(r[j] + 1, r[j - 1] + 1, su + (a[i - 1] === b[j - 1] ? 0 : 1)); su = t; } }
  return r[b.length];
}
const soglia = (n: number) => (n <= 4 ? 0 : n <= 7 ? 1 : 2);

// Quanto il nome dettato somiglia a quello in elenco; null = non è lui.
export function somiglianza(dettato: string[], elenco: string[]): number | null {
  if (!dettato.length || !elenco.length) return null;
  let tot = 0; const usate = new Set<number>();
  for (const d of dettato) {
    let migliore = -1, dMin = 99;
    elenco.forEach((c, i) => {
      if (usate.has(i)) return;
      const x = distanza(d, c);
      if (x <= soglia(Math.max(d.length, c.length)) && x < dMin) { migliore = i; dMin = x; }
    });
    if (migliore < 0) return null;
    usate.add(migliore); tot += 1 - dMin / Math.max(d.length, elenco[migliore].length);
  }
  return tot + (dettato.length === elenco.length ? 0.5 : 0);      // detto tutto il nome: vale di più
}

// → { scelta: la persona, se una sola è chiaramente la più simile; alternative: le più simili, quando non si sceglie }
export function cercaSimili<T>(dettato: string, persone: T[], nomeDi: (p: T) => string, max = 4): { scelta: T | null; alternative: T[] } {
  const d = paroleNome(dettato);
  const voti = persone.map((p) => ({ p, v: somiglianza(d, paroleNome(nomeDi(p))) })).filter((x): x is { p: T; v: number } => x.v !== null).sort((a, b) => b.v - a.v);
  if (!voti.length) return { scelta: null, alternative: [] };
  if (voti.length === 1 || voti[0].v - voti[1].v >= 0.45) return { scelta: voti[0].p, alternative: [] };
  return { scelta: null, alternative: voti.filter((x) => voti[0].v - x.v < 0.45).slice(0, max).map((x) => x.p) };
}
