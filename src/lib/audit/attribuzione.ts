// Attribuzione per tappa (11.9.2026): quale tappa della catena avvicina il
// testo a ciò che la segretaria ha confermato, e quale lo allontana. PURO:
// dalle versioni immutabili di audit.artifacts (una per tappa, in ordine di
// version_no) e dal testo confermato, la distanza di ogni tappa dal finale
// (parole cambiate, stesso diff delle metriche) e il delta rispetto alla
// tappa prima: positivo = avvicina, negativo = allontana. I banchi sono
// sintetici; questa è la misura in produzione. Mai contenuti nei log.
import { confronta } from './diff';

export type Versione = { label: string; version_no: number; testo: string; producer_type?: string };
export type Passo = { label: string; producer: string; distanza: number; delta: number | null };
export type Riepilogo = {
  label: string; producer: string; referti: number; avvicina: number; allontana: number; neutro: number;
  delta_medio: number; distanza_media: number;
};

// Testimoni e copie che non stanno sulla linea del testo: la B è parallela
// alla A, l'audio non è testo, la versione confermata è il traguardo.
const FUORI_LINEA = new Set(['audio', 'grezzo_b', 'confermato_segretaria', 'confermato_medico']);

export const NOMI_TAPPE: Record<string, string> = {
  grezzo_a: 'trascrizione (motore 1)', grezzo_a_recuperato: 'trascrizione recuperata senza VAD', base_promossa: 'base dal secondo motore',
  dopo_dizionario: 'dizionario', dopo_arbitro: 'arbitro', dopo_correzione: 'correzione AI', dopo_bella_copia: 'bella copia',
  dopo_doppioni: 'doppioni', catena_finale: 'uscita della catena', testo_strutturato: 'riorganizzazione (rapporto)',
  ingresso_impaginazione_lettera: 'revisione guidata (persona)', impaginazione_lettera: 'impaginazione lettera (AI)',
};

export function distanza(testo: string, finale: string): number {
  return confronta(testo, finale).metriche.edit_count;
}

export function attribuisci(versioni: Versione[], finale: string): Passo[] {
  const linea = versioni
    .filter((v) => v && typeof v.testo === 'string' && v.testo.trim() && !FUORI_LINEA.has(v.label))
    .sort((a, b) => a.version_no - b.version_no);
  const passi: Passo[] = [];
  let prima: number | null = null;
  for (const v of linea) {
    const d = distanza(v.testo, finale);
    passi.push({ label: v.label, producer: v.producer_type ?? 'AI', distanza: d, delta: prima === null ? null : prima - d });
    prima = d;
  }
  return passi;
}

export function riepilogo(perReferto: Passo[][]): Riepilogo[] {
  const acc = new Map<string, { producer: string; deltas: number[]; distanze: number[] }>();
  for (const passi of perReferto) {
    for (const p of passi) {
      const a = acc.get(p.label) ?? { producer: p.producer, deltas: [], distanze: [] };
      a.distanze.push(p.distanza);
      if (p.delta !== null) a.deltas.push(p.delta);
      acc.set(p.label, a);
    }
  }
  const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
  return [...acc.entries()].map(([label, a]) => ({
    label, producer: a.producer, referti: a.distanze.length,
    avvicina: a.deltas.filter((d) => d > 0).length, allontana: a.deltas.filter((d) => d < 0).length, neutro: a.deltas.filter((d) => d === 0).length,
    delta_medio: Math.round(media(a.deltas) * 10) / 10, distanza_media: Math.round(media(a.distanze) * 10) / 10,
  })).sort((x, y) => y.referti - x.referti || y.delta_medio - x.delta_medio);
}
