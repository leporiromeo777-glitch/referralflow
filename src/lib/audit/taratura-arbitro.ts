// Taratura delle decisioni dell'arbitro (23.9.2026). La catena scrive in
// OMBRA, su ogni punto dell'arbitro, la probabilità che abbia ragione la B
// (`p_b`, decisioni_tarate in pipeline.py) e la scelta dell'arbitro di oggi
// (`scelta_arbitro`). Qui si guarda che cosa ha tenuto la persona: la B, la A
// o nessuna delle due (frase riscritta). Serve a decidere la soglia sulle
// scelte vere e non sul banco sintetico. PURO; solo conteggi in uscita.
export type Divergenza = {
  versione_a?: string; versione_b?: string; contesto_prima?: string; contesto_dopo?: string;
  p_b?: number; p_incerto?: number | null; scelta_arbitro?: string; pesanti?: string[];
};
export type EsitoPunto = { p_b: number; scelta_arbitro: string | null; persona: 'a' | 'b' | null; pesante: boolean };

const norma = (s: string) => ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Quale versione c'è nel testo della persona, con la parola di contesto
// accanto (così «lieve» non si trova in un'altra frase).
function tenuta(d: Divergenza, persona: string): 'a' | 'b' | null {
  const prima = (d.contesto_prima ?? '').split(/\s+/).filter(Boolean).slice(-2).join(' ');
  const dopo = (d.contesto_dopo ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
  const forma = (v: string) => norma([prima, v, dopo].filter(Boolean).join(' ')).trim();
  const fa = forma(d.versione_a ?? ''), fb = forma(d.versione_b ?? '');
  if (!fa || !fb || fa === fb) return null;
  const ha = persona.includes(` ${fa} `), hb = persona.includes(` ${fb} `);
  return ha === hb ? null : hb ? 'b' : 'a';
}

export function esitiPunti(divergenze: unknown, testoPersona: string): EsitoPunto[] {
  if (!Array.isArray(divergenze)) return [];
  const persona = norma(testoPersona);
  return (divergenze as Divergenza[])
    .filter((d) => d && typeof d.p_b === 'number')
    .map((d) => ({
      p_b: d.p_b as number, scelta_arbitro: typeof d.scelta_arbitro === 'string' ? d.scelta_arbitro : null,
      persona: tenuta(d, persona), pesante: Array.isArray(d.pesanti) && d.pesanti.length > 0,
    }));
}

export type FasciaTaratura = { fascia: string; punti: number; giuste: number; quota: number | null };
export type Taratura = {
  punti: number; con_esito: number; giuste_probabilita: number; giuste_arbitro: number; arbitro_valutate: number;
  fasce: FasciaTaratura[];
  // Punti con parole pesanti (negazioni, lateralità…) che il metodo dava per
  // sicuri (≥ 0,9) e su cui la persona ha scelto l'altra versione: il caso da
  // non nascondere mai.
  pesanti_sicuri_sbagliati: number;
};

export function taratura(perReferto: EsitoPunto[][]): Taratura {
  const tutti = perReferto.flat();
  const valutati = tutti.filter((e) => e.persona !== null);
  const sicurezza = (p: number) => Math.max(p, 1 - p);
  const giusta = (e: EsitoPunto) => (e.p_b > 0.5 ? 'b' : 'a') === e.persona;
  const limiti: [string, number, number][] = [['0,5–0,7', 0.5, 0.7], ['0,7–0,9', 0.7, 0.9], ['0,9–0,99', 0.9, 0.99], ['≥ 0,99', 0.99, 1.01]];
  const fasce = limiti.map(([fascia, da, a]) => {
    const dentro = valutati.filter((e) => sicurezza(e.p_b) >= da && sicurezza(e.p_b) < a);
    const g = dentro.filter(giusta).length;
    return { fascia, punti: dentro.length, giuste: g, quota: dentro.length ? Math.round((100 * g) / dentro.length) : null };
  });
  const conArbitro = valutati.filter((e) => e.scelta_arbitro === 'a' || e.scelta_arbitro === 'b');
  return {
    punti: tutti.length, con_esito: valutati.length,
    giuste_probabilita: valutati.filter(giusta).length,
    giuste_arbitro: conArbitro.filter((e) => e.scelta_arbitro === e.persona).length, arbitro_valutate: conArbitro.length,
    fasce,
    pesanti_sicuri_sbagliati: valutati.filter((e) => e.pesante && sicurezza(e.p_b) >= 0.9 && !giusta(e)).length,
  };
}
