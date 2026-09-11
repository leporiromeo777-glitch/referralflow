// Proposte di dizionario dalle correzioni umane (11.9.2026, fase 5 del giro
// dei prompt). PURO: dalle operazioni REPLACE registrate in audit.human_edits
// (segretaria) alle coppie «sbagliato → giusto» ricorrenti per medico. Sono
// PROPOSTE: le conferma una persona nel cruscotto; niente entra da solo nel
// dizionario della catena. Regole della catena rispettate qui: mai cifre,
// frasi corte. Escluse le categorie che non sono errori d'ascolto stabili
// (misure, dosi, date, dati del paziente, punteggiatura, forma, senso clinico).
import type { Operazione } from './diff';

export type ModificaUmana = { medico: string | null; bozza_id: string; created_at: string; diff: unknown };
export type Proposta = {
  medico: string; da: string; a: string; occorrenze: number; bozze: number; ultima: string;
  alternative: string[]; categoria: string;
};

const ESCLUSE = new Set(['measurement', 'dose', 'date', 'patient_information', 'punctuation', 'formatting', 'clinical_meaning']);
const BORDO = /^[\s,.;:!?«»"'()]+|[\s,.;:!?«»"'()]+$/g;

export function normaVoce(s: string): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(BORDO, '').trim();
}

// Solo accordo grammaticale («diminuito» → «diminuiti»): non è una voce di
// dizionario, cambierebbe anche le frasi in cui l'originale è giusto.
function soloDesinenza(da: string, a: string): boolean {
  if (da.includes(' ') || a.includes(' ')) return false;
  if (Math.abs(da.length - a.length) > 1) return false;
  const n = Math.min(da.length, a.length) - 1;
  return n >= 4 && da.slice(0, n) === a.slice(0, n);
}

export function candidata(op: Operazione): boolean {
  if (op.kind !== 'REPLACE') return false;
  const da = normaVoce(op.from), a = normaVoce(op.to);
  if (!da || !a || da === a) return false;
  if (/\d/.test(da) || /\d/.test(a)) return false;
  if (da.split(' ').length > 4 || a.split(' ').length > 4) return false;
  if (da.replace(/[^\p{L}]/gu, '').length < 3) return false;
  if (ESCLUSE.has(op.categoria)) return false;
  if (soloDesinenza(da, a)) return false;
  return true;
}

export function proposteDizionario(modifiche: ModificaUmana[], max = 100): Proposta[] {
  const gruppi = new Map<string, { medico: string; da: string; per_a: Map<string, { a: string; n: number }>; bozze: Set<string>; ultima: string; categoria: string }>();
  for (const m of modifiche) {
    const medico = (m.medico ?? '').trim();
    if (!medico || !Array.isArray(m.diff)) continue;
    for (const op of m.diff as Operazione[]) {
      if (!op || typeof op !== 'object' || !candidata(op)) continue;
      const da = normaVoce(op.from), a = normaVoce(op.to);
      const k = `${medico} ${da}`;
      const g = gruppi.get(k) ?? { medico, da, per_a: new Map(), bozze: new Set(), ultima: '', categoria: op.categoria };
      const va = g.per_a.get(a) ?? { a, n: 0 };
      va.n += 1; g.per_a.set(a, va);
      g.bozze.add(m.bozza_id);
      if (m.created_at > g.ultima) g.ultima = m.created_at;
      gruppi.set(k, g);
    }
  }
  const fuori: Proposta[] = [];
  for (const g of gruppi.values()) {
    const alternative = [...g.per_a.values()].sort((x, y) => y.n - x.n || x.a.localeCompare(y.a));
    const occorrenze = alternative.reduce((s, v) => s + v.n, 0);
    fuori.push({ medico: g.medico, da: g.da, a: alternative[0].a, occorrenze, bozze: g.bozze.size, ultima: g.ultima, alternative: alternative.slice(1).map((v) => v.a), categoria: g.categoria });
  }
  return fuori.sort((x, y) => y.occorrenze - x.occorrenze || y.bozze - x.bozze || x.da.localeCompare(y.da)).slice(0, max);
}
