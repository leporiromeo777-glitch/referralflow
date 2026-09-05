// Tempo dell'audio in cui una frase viene detta, dai tempi parola-per-parola
// della bozza (stessa logica della revisione guidata, riusabile lato server:
// serve ai chip «riascolta» nelle anteprime della lettera fusa).
export function normalizzaParola(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
}

export function tempoDiFrase(frase: string, parole: [string, number][]): number | null {
  if (!parole.length) return null;
  const paroleNorm = parole.map(([w, s]) => [normalizzaParola(w), s] as [string, number]);
  const cerca = normalizzaParola(frase).split(' ').filter((w) => w.length >= 2).slice(0, 8);
  if (cerca.length < 3) return null;
  let migliore = -1, punteggio = 0;
  for (let i = 0; i <= paroleNorm.length - cerca.length; i++) {
    let m = 0;
    for (let j = 0; j < cerca.length; j++) if (paroleNorm[i + j][0] === cerca[j]) m++;
    if (m > punteggio) { punteggio = m; migliore = i; }
  }
  if (migliore < 0 || punteggio < Math.max(3, Math.ceil(cerca.length * 0.6))) return null;
  return paroleNorm[migliore][1];
}
