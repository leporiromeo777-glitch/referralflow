import 'server-only';
import { formaDaRighe, formaDaTesto, type Forma, type RigaPosta } from './tagli';

// Le pagine di un PDF per «Dividi cartella»: il testo di ognuna e la sua FORMA (titolo in alto, blocco in alto a
// destra, nome del medico o saluti in fondo — vedi tagli.ts). La forma viene dalla posizione delle righe, che il
// testo da solo non dice: la dà pdf.js, lo stesso documento che pdf-parse ha già aperto (il suo campo interno
// `doc`; se un giorno la libreria cambia e non c'è più, la forma si ricava dal solo testo, senza il blocco a destra).
export async function leggiPagine(dati: Buffer): Promise<{ testi: string[]; forme: Forma[] } | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser: any = new PDFParse({ data: dati });
    const r: any = await parser.getText();
    const n: number = typeof r?.total === 'number' ? r.total : Array.isArray(r?.pages) ? r.pages.length : 0;
    if (!n) { try { await parser.destroy(); } catch { /* ignora */ } return null; }
    const testi: string[] = Array.from({ length: n }, () => '');
    for (const p of Array.isArray(r?.pages) ? r.pages : []) { const k = Number(p?.num ?? 0); if (k >= 1 && k <= n) testi[k - 1] = String(p?.text ?? ''); }
    const forme: Forma[] = testi.map(formaDaTesto);
    const doc = parser.doc;
    if (doc && typeof doc.getPage === 'function') {
      for (let i = 1; i <= n; i++) {
        try {
          const pagina = await doc.getPage(i), vista = pagina.getViewport({ scale: 1 }), contenuto = await pagina.getTextContent();
          // Le parole si raccolgono in righe per altezza (a passi di 6 punti); di ogni riga serve dove comincia e a che altezza sta.
          const righe = new Map<number, RigaPosta>();
          for (const it of (contenuto.items ?? []) as any[]) {
            if (!String(it?.str ?? '').trim() || !Array.isArray(it.transform)) continue;
            const x = it.transform[4] / vista.width, y = (vista.height - it.transform[5]) / vista.height, k = Math.round((vista.height - it.transform[5]) / 6);
            const riga = righe.get(k) ?? { t: '', x, y };
            riga.x = Math.min(riga.x, x); riga.t += ` ${it.str}`; righe.set(k, riga);
          }
          if (righe.size >= 3) forme[i - 1] = formaDaRighe([...righe.values()]);
        } catch { /* quella pagina resta con la forma dal testo */ }
      }
    }
    try { await parser.destroy(); } catch { /* ignora */ }
    return { testi, forme };
  } catch { return null; }
}
