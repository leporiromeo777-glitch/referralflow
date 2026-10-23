// La conoscenza di Cleo sul software (23.10.2026, dallo studio: «Cleo deve sapere tutto del software, letteralmente
// tutto: come funziona, dove sono i tasti, cosa fanno, dove si trovano le funzioni — così in studio chiedono a lei»).
// Le pagine della wiki si tagliano in pezzi (una sezione «## …», spezzata se è lunga); a ogni domanda si scelgono i pezzi
// che c'entrano (parole in comune, pesate come BM25, col titolo e la riga «Parole:» che contano di più) e vanno nel
// prompt. La guida d'uso (`docs/wiki/Guida/`) vale più della documentazione tecnica. PURO: niente file, niente rete.

export type Pezzo = { fonte: string; pagina: string; titolo: string; testo: string; peso: number };

const MAX_PEZZO = 1400;
// Una pagina in pezzi: il titolo «# …», poi una sezione per «## …» (le «### …» restano dentro), spezzata a capoversi
// se supera MAX_PEZZO. Il frontmatter e i collegamenti [[…]] si puliscono.
export function pezziDaPagina(fonte: string, md: string, peso: number): Pezzo[] {
  const testo = String(md ?? '').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a);
  const pagina = testo.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fonte.replace(/\.md$/, '').split('/').pop() ?? fonte;
  const parti = testo.split(/^##\s+/m);
  const out: Pezzo[] = [];
  const metti = (titolo: string, corpo: string) => {
    const pulito = corpo.trim();
    if (pulito.replace(/\s+/g, '').length < 40) return;
    if (pulito.length <= MAX_PEZZO) { out.push({ fonte, pagina, titolo, testo: pulito, peso }); return; }
    let cur = '';
    for (const par of pulito.split(/\n{2,}/)) {
      if (cur && (cur.length + par.length) > MAX_PEZZO) { out.push({ fonte, pagina, titolo, testo: cur.trim(), peso }); cur = ''; }
      cur += `${par}\n\n`;
      while (cur.length > MAX_PEZZO * 1.6) { out.push({ fonte, pagina, titolo, testo: cur.slice(0, MAX_PEZZO).trim(), peso }); cur = cur.slice(MAX_PEZZO); }
    }
    if (cur.trim()) out.push({ fonte, pagina, titolo, testo: cur.trim(), peso });
  };
  // l'introduzione (prima della prima «##»)
  metti(pagina, parti[0].replace(/^#\s+.+$/m, ''));
  for (const p of parti.slice(1)) {
    const a = p.indexOf('\n');
    metti((a < 0 ? p : p.slice(0, a)).trim(), a < 0 ? '' : p.slice(a + 1));
  }
  return out;
}

// Le parole che contano: minuscole, senza accenti, senza le parole vuote, accorciate alla radice (le prime 6 lettere:
// «caricare», «carico», «caricato» diventano la stessa).
const VUOTE = new Set('il lo la i gli le un uno una di da in con su per tra fra a e o ma se che chi cui come dove quando quale quali quanto quanti cosa perche perché non si mi ti ci vi ne del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi è e sono era essere ho ha hanno fare faccio fa può puo posso devo deve voglio vorrei questo questa quello quella c anche più piu già gia poi solo ogni tutto tutti molto referralflow software programma piattaforma vedo vedere vede vedi trovo trovare trova trovi guardo guardare serve servono usare uso posso possiamo riesco riuscire'.split(' '));
export function radici(testo: string): string[] {
  return String(testo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !VUOTE.has(w)).map((w) => w.slice(0, 6));
}

export type Indice = { pezzi: Pezzo[]; titoli: Set<string>[]; parole: Set<string>[]; corpi: Map<string, number>[]; lunghezze: number[]; media: number; df: Map<string, number> };
export function indicizza(pezzi: Pezzo[]): Indice {
  const df = new Map<string, number>();
  const titoli: Set<string>[] = [], parole: Set<string>[] = [], corpi: Map<string, number>[] = [], lunghezze: number[] = [];
  for (const p of pezzi) {
    const riga = p.testo.match(/^Parole:\s*(.+)$/im)?.[1] ?? '';
    const t = new Set(radici(`${p.titolo} ${p.pagina}`)), w = new Set(radici(riga)), c = new Map<string, number>();
    for (const r of radici(p.testo)) c.set(r, (c.get(r) ?? 0) + 1);
    for (const r of new Set([...t, ...w, ...c.keys()])) df.set(r, (df.get(r) ?? 0) + 1);
    titoli.push(t); parole.push(w); corpi.push(c); lunghezze.push([...c.values()].reduce((a, b) => a + b, 0));
  }
  return { pezzi, titoli, parole, corpi, lunghezze, media: lunghezze.reduce((a, b) => a + b, 0) / Math.max(1, lunghezze.length), df };
}

// I pezzi più vicini alla domanda: BM25 sul corpo, più il titolo (×2.5) e la riga «Parole:» (×1.5), per il peso della fonte.
export function scegliPezzi(ix: Indice, domanda: string, quanti = 5, maxCaratteri = 5200): { pezzo: Pezzo; punti: number }[] {
  // una parola corta («eco», «ecg», «tac») vale anche per le parole che cominciano così («ecografo», «ecografia»)
  const base = [...new Set(radici(domanda))];
  const q = [...new Set(base.flatMap((r) => (r.length <= 4 ? [r, ...[...ix.df.keys()].filter((k) => k !== r && k.startsWith(r)).slice(0, 6)] : [r])))];
  if (!q.length) return [];
  const N = ix.pezzi.length, k1 = 1.2, b = 0.75;
  const punti = ix.pezzi.map((p, i) => {
    let s = 0;
    for (const r of q) {
      const n = ix.df.get(r) ?? 0;
      if (!n) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const f = ix.corpi[i].get(r) ?? 0;
      if (f) s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * ix.lunghezze[i] / ix.media));
      if (ix.titoli[i].has(r)) s += idf * 2.5;
      if (ix.parole[i].has(r)) s += idf * 1.5;
    }
    return { pezzo: p, punti: s * p.peso };
  }).filter((x) => x.punti > 0).sort((a, b) => b.punti - a.punti);
  const scelti: { pezzo: Pezzo; punti: number }[] = [];
  let tot = 0;
  for (const x of punti) {
    if (scelti.length >= quanti) break;
    if (x.punti < punti[0].punti * 0.35) break;              // troppo lontani dal migliore: rumore
    if (tot + x.pezzo.testo.length > maxCaratteri && scelti.length) continue;
    scelti.push(x); tot += x.pezzo.testo.length;
  }
  return scelti;
}

export function guidaPerPrompt(scelti: { pezzo: Pezzo }[]): string {
  return scelti.map(({ pezzo: p }) => `[${p.peso >= 1 ? 'Guida' : 'Documentazione'} · ${p.pagina} › ${p.titolo}]\n${p.testo.replace(/^Parole:.*$/gim, '').trim()}`).join('\n\n');
}

// Le domande su come si usa il software vanno al modello con la guida, non alle risposte rapide del codice.
export const RX_DOMANDA_GUIDA = /\b(come (faccio|si fa|si |posso|devo|funziona|mai)|dove (trovo|si trova|sono|è|e'|metto|vedo|clicco|schiaccio)|dov'?è|a cosa serv|cosa (fa|serve|significa|vuol dire)|che cos'?è|non (funziona|riesco|trovo|vedo|parte|si apre|arriva|carica|va)|si può|è possibile|e' possibile|tast[oi]|pulsant[ei]|bottone|menu|pagina|spiegami|istruzion|guida|aiuto|help|impostazion|configur|perché non|perche non|errore|bloccat)/i;
