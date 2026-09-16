// La previsione delle durate (16.9.2026, §9).
//
// Statistica, e lo resta finché non ci sono dati per fare di meglio: la
// mediana per (prestazione, medico) quando ce ne sono abbastanza, altrimenti
// quella della prestazione più lo scarto del medico, altrimenti il catalogo.
// Niente si addestra da solo: quel che lo studio fissa a mano vince sulla
// misura, e il fattore d'ora si accende solo con dati abbastanza.

export type Osservazione = { prestazione: string; medico: string; ora: number; minuti: number; primaVisita?: boolean; mobilitaRidotta?: boolean };
export type Fissata = { prestazione: string; medico: string; minuti: number };   // medico '' = tutti

export const MIN_CASI = 8;
export const MIN_CASI_ORA = 30;

export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type Stima = { minuti: number; fonte: 'fissata' | 'mediana_medico' | 'mediana_prestazione' | 'catalogo'; casi: number; fattoreOra: number };

export function stimaDurata(opz: {
  prestazione: string; medico: string; ora: number;
  primaVisita?: boolean; mobilitaRidotta?: boolean;
  catalogo: number;
  osservate: Osservazione[]; fissate?: Fissata[];
  /* per la fase 5: il fattore d'ora si applica solo se `conOra` è vero */
  conOra?: boolean;
}): Stima {
  const fissata = (opz.fissate ?? []).find((f) => eq(f.prestazione, opz.prestazione) && (eq(f.medico, opz.medico) || f.medico === ''));
  if (fissata) return { minuti: fissata.minuti, fonte: 'fissata', casi: 0, fattoreOra: 1 };

  const dellaPrest = opz.osservate.filter((o) => eq(o.prestazione, opz.prestazione));
  const delMedico = dellaPrest.filter((o) => eq(o.medico, opz.medico));
  let minuti: number, fonte: Stima['fonte'], casi: number;
  if (delMedico.length >= MIN_CASI) {
    minuti = mediana(delMedico.map((o) => o.minuti))!; fonte = 'mediana_medico'; casi = delMedico.length;
  } else if (dellaPrest.length >= MIN_CASI) {
    minuti = mediana(dellaPrest.map((o) => o.minuti))! + scartoMedico(opz.medico, opz.osservate); fonte = 'mediana_prestazione'; casi = dellaPrest.length;
  } else {
    minuti = opz.catalogo; fonte = 'catalogo'; casi = dellaPrest.length;
  }
  let fattoreOra = 1;
  if (opz.conOra) {
    const fascia = dellaPrest.filter((o) => Math.floor(o.ora / 60) === Math.floor(opz.ora / 60));
    if (fascia.length >= MIN_CASI_ORA && dellaPrest.length >= MIN_CASI_ORA) {
      const mf = mediana(fascia.map((o) => o.minuti))!, mt = mediana(dellaPrest.map((o) => o.minuti))!;
      if (mt > 0) fattoreOra = Math.round((mf / mt) * 100) / 100;
    }
  }
  minuti = Math.round(minuti * fattoreOra);
  // La prima visita è più lunga finché non è misurato: +5, come nel progetto.
  if (opz.primaVisita) {
    const prime = delMedico.filter((o) => o.primaVisita);
    minuti += prime.length >= MIN_CASI ? Math.max(0, mediana(prime.map((o) => o.minuti))! - minuti) : 5;
  }
  return { minuti: Math.max(5, minuti), fonte, casi, fattoreOra };
}

// La mediana delle differenze fra le durate reali di quel medico e la
// mediana della prestazione, su tutte le prestazioni. Zero se non c'è
// abbastanza da dire.
export function scartoMedico(medico: string, osservate: Osservazione[]): number {
  const perPrest = new Map<string, number[]>();
  for (const o of osservate) {
    const k = o.prestazione.trim().toLowerCase();
    perPrest.set(k, [...(perPrest.get(k) ?? []), o.minuti]);
  }
  const diff: number[] = [];
  for (const o of osservate) {
    if (!eq(o.medico, medico)) continue;
    const m = mediana(perPrest.get(o.prestazione.trim().toLowerCase()) ?? []);
    if (m != null) diff.push(o.minuti - m);
  }
  return diff.length >= MIN_CASI ? (mediana(diff) ?? 0) : 0;
}

// Il riepilogo per la pagina «Durate misurate»: prestazione × medico, casi e mediana.
export function riepilogoDurate(osservate: Osservazione[]): { prestazione: string; medico: string; casi: number; mediana: number }[] {
  const m = new Map<string, { prestazione: string; medico: string; v: number[] }>();
  for (const o of osservate) {
    const k = `${o.prestazione.trim().toLowerCase()}|${o.medico.trim().toLowerCase()}`;
    if (!m.has(k)) m.set(k, { prestazione: o.prestazione, medico: o.medico, v: [] });
    m.get(k)!.v.push(o.minuti);
  }
  return [...m.values()].map((x) => ({ prestazione: x.prestazione, medico: x.medico, casi: x.v.length, mediana: mediana(x.v)! }))
    .sort((a, b) => a.prestazione.localeCompare(b.prestazione) || a.medico.localeCompare(b.medico));
}
