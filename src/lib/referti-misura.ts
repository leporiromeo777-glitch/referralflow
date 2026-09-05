// Misura della revisione (2026-09-05): quanto il medico ha corretto la
// catena, come distanza di edit a livello di PAROLE fra l'uscita della
// catena e il testo firmato. Reale, gratuita, per ogni referto: la base per
// vedere se la catena migliora davvero. Solo numeri, mai testo.
function parole(t: string): string[] {
  return t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}

function distanzaParole(a: string[], b: string[]): number {
  // Levenshtein classico con due righe; ~2000×2000 parole = pochi ms.
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, j) => j);
  let cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export function misuraRevisione(catena: string, finale: string) {
  const pa = parole(catena);
  const pb = parole(finale);
  const distanza = distanzaParole(pa, pb);
  const base = Math.max(pa.length, pb.length, 1);
  return {
    parole_catena: pa.length,
    parole_finali: pb.length,
    distanza_parole: distanza,
    quota_modificata: Math.round((1000 * distanza) / base) / 10, // percento, 1 decimale
    misurata_at: new Date().toISOString(),
  };
}
