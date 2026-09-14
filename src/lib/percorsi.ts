// I percorsi diagnostico-terapeutici dello studio (14.9.2026): sequenze
// standard di prestazioni per indicazione clinica. La fonte di verità è la
// pagina wiki `docs/wiki/Medici/Percorsi.md` (un percorso per sezione `##`,
// campi in elenco puntato, prestazioni numerate), letta a runtime dal checkout
// del server e tenuta in cache 5 minuti: si cambia la pagina, non il codice.
// Il parser è puro (`analizzaPercorsi`) e testato; la lettura del file sta in
// `caricaPercorsi`. Nessun dato di paziente: solo criteri generali.
import fs from 'fs';
import path from 'path';

export type PrestazionePercorso = { n: number; nome: string; condizione: string; esterna: boolean };
export type Percorso = {
  id: string; nome: string; indicazione: string; urgenza: string; urgente: boolean; durata: string; dove: string;
  tempi: string; stato: 'proposta' | 'validato'; prestazioni: PrestazionePercorso[]; nota: string; fonti: string;
};

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sezioni(md: string): { titolo: string; corpo: string }[] {
  const out: { titolo: string; corpo: string }[] = [];
  const rx = /^##\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  const idx: { titolo: string; a: number; b: number }[] = [];
  while ((m = rx.exec(md))) idx.push({ titolo: m[1], a: m.index, b: m.index + m[0].length });
  for (let i = 0; i < idx.length; i++) out.push({ titolo: idx[i].titolo, corpo: md.slice(idx[i].b, i + 1 < idx.length ? idx[i + 1].a : md.length) });
  return out;
}

export function analizzaPercorsi(md: string): Percorso[] {
  const out: Percorso[] = [];
  for (const { titolo, corpo } of sezioni(md)) {
    const campi: Record<string, string> = {};
    const prestazioni: PrestazionePercorso[] = [];
    for (const riga of corpo.split('\n')) {
      const c = /^\s*-\s+([A-Za-zÀ-ÿ]+)\s*:\s*(.*)$/.exec(riga);
      if (c) { campi[c[1].toLowerCase()] = c[2].trim(); continue; }
      const p = /^\s+(\d+)\.\s+(.+?)(?:\s+—\s+(.*))?$/.exec(riga);
      if (p) {
        const nome = p[2].trim();
        prestazioni.push({ n: Number(p[1]), nome, condizione: (p[3] ?? '').trim(), esterna: /\(estern[ao]\)/i.test(nome) });
      }
    }
    if (!campi.indicazione && !prestazioni.length) continue; // sezione di testo, non un percorso
    const urgenza = campi.urgenza ?? 'no';
    out.push({
      id: slug(titolo), nome: titolo, indicazione: campi.indicazione ?? '', urgenza, urgente: !/^no\b/i.test(urgenza), durata: campi.durata ?? '', dove: campi.dove ?? '',
      tempi: campi.tempi ?? '', stato: /^validat/i.test(campi.stato ?? '') ? 'validato' : 'proposta', prestazioni, nota: campi.nota ?? '', fonti: campi.fonti ?? '',
    });
  }
  return out;
}

let cache: { at: number; percorsi: Percorso[] } | null = null;
export const PAGINA_PERCORSI = path.join(process.cwd(), 'docs', 'wiki', 'Medici', 'Percorsi.md');

export function caricaPercorsi(): Percorso[] {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.percorsi;
  let percorsi: Percorso[] = [];
  try {
    percorsi = analizzaPercorsi(fs.readFileSync(PAGINA_PERCORSI, 'utf8'));
  } catch (e) {
    console.error(`[percorsi] pagina non leggibile: ${(e as Error)?.message ?? e}`);
  }
  cache = { at: Date.now(), percorsi };
  return percorsi;
}

// Blocco per il prompt del modello locale: nome, indicazione e sequenza in
// una riga per percorso. Il modello cita il percorso, non lo inventa.
export function percorsiPerPrompt(percorsi: Percorso[]): string {
  if (!percorsi.length) return '';
  return percorsi.map((p) => `- ${p.nome} (${p.indicazione}): ${p.prestazioni.map((x) => x.nome).join(' → ')}${p.tempi ? ` · ${p.tempi}` : ''}`).join('\n');
}

// Il percorso che una domanda scritta nomina (per nome o per indicazione), se uno solo.
export function trovaPercorso(percorsi: Percorso[], domanda: string): Percorso | null {
  const q = slug(domanda);
  const hits = percorsi.filter((p) => {
    if (q.includes(p.id)) return true;
    const parole = p.nome.toLowerCase().split(/\s+/).map(slug).filter((w) => w.length > 3);
    return parole.length > 0 && parole.every((w) => q.includes(w));
  });
  return hits.length === 1 ? hits[0] : null;
}
