// Pagine scritte da una persona («12-15, 20», «3–4; 7») → intervalli validi
// per qpdf. Puro: si prova in prove-pagine.test.ts.
export function intervalliPagine(testo: string, totale: number): { qpdf: string; etichetta: string; quante: number } | { errore: string } {
  const pezzi = String(testo || '').replace(/[–—]/g, '-').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!pezzi.length) return { errore: 'Scrivi le pagine da estrarre, per esempio 12-15 oppure 3, 7-9.' };
  if (pezzi.length > 50) return { errore: 'Troppi intervalli: al massimo 50.' };
  const intervalli: [number, number][] = [];
  for (const p of pezzi) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(p);
    if (!m) return { errore: `«${p}» non è una pagina: usa numeri e trattini, per esempio 12-15.` };
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (a < 1 || b < a) return { errore: `«${p}»: l'intervallo va dalla pagina più bassa alla più alta.` };
    if (b > totale) return { errore: `Il documento ha ${totale} pagine: «${p}» va oltre.` };
    intervalli.push([a, b]);
  }
  const quante = intervalli.reduce((n, [a, b]) => n + b - a + 1, 0);
  const s = intervalli.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
  return { qpdf: s.join(','), etichetta: s.join(', ').replace(/-/g, '–'), quante };
}
