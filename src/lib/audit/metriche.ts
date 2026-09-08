// Metriche di qualità (§21-§35): parte PURA (media mobile, percentili,
// outlier) testabile, e caricatori SQL per la dashboard. La metrica
// principale è il numero di correzioni della SEGRETARIA per referto; il
// medico è tenuto separato; i referti mai revisionati non entrano.

export function mediaMobile(valori: number[], finestra: number): (number | null)[] {
  const f = Math.max(1, Math.floor(finestra));
  return valori.map((_, i) => {
    if (i + 1 < Math.min(f, 3)) return null;
    const da = Math.max(0, i + 1 - f);
    const fetta = valori.slice(da, i + 1);
    return Math.round((fetta.reduce((s, v) => s + v, 0) / fetta.length) * 100) / 100;
  });
}

export function percentile(ordinati: number[], p: number): number | null {
  if (!ordinati.length) return null;
  const pos = (ordinati.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round((ordinati[lo] + (ordinati[hi] - ordinati[lo]) * (pos - lo)) * 100) / 100;
}

export type Statistiche = {
  n: number; media: number | null; mediana: number | null; p50: number | null; p75: number | null;
  p90: number | null; p95: number | null; min: number | null; max: number | null; deviazione: number | null;
};

export function statistiche(valori: number[]): Statistiche {
  const v = [...valori].sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0, media: null, mediana: null, p50: null, p75: null, p90: null, p95: null, min: null, max: null, deviazione: null };
  const media = v.reduce((s, x) => s + x, 0) / n;
  const dev = Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / n);
  return {
    n, media: Math.round(media * 100) / 100, mediana: percentile(v, 0.5), p50: percentile(v, 0.5), p75: percentile(v, 0.75),
    p90: percentile(v, 0.9), p95: percentile(v, 0.95), min: v[0], max: v[n - 1], deviazione: Math.round(dev * 100) / 100,
  };
}

// Outlier (§30): scarto dalla mediana oltre 3 MAD (robusto) e comunque
// almeno 5 correzioni sopra la mediana — con pochi dati nessun allarme.
export function outlier(valori: number[]): boolean[] {
  if (valori.length < 8) return valori.map(() => false);
  const v = [...valori].sort((a, b) => a - b);
  const med = percentile(v, 0.5) ?? 0;
  const mad = percentile(v.map((x) => Math.abs(x - med)).sort((a, b) => a - b), 0.5) ?? 0;
  const soglia = Math.max(med + 3 * 1.4826 * mad, med + 5);
  return valori.map((x) => x > soglia);
}

// Punteggio derivato e SPIEGABILE (§23): 100 − 10 × correzioni/100 parole,
// mai sotto 0. Non sostituisce i conteggi reali.
export function punteggioQualita(editsPer100: number): number {
  return Math.max(0, Math.round(100 - editsPer100 * 10));
}
