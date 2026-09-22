// Precisione delle segnalazioni (22.9.2026): per ogni segnalazione che la
// revisione ha mostrato, la persona ha poi cambiato quel punto oppure no?
// Misurato sui referti veri: 87 flag critici in 11 referti, 71 superati con
// la presa d'atto. Se un tipo di segnalazione non porta quasi mai a una
// correzione, abitua a cliccare «ho visto» anche sui rossi veri: va declassato
// o tolto. PURO: stesse segnalazioni della revisione (costruisciRevisione sul
// testo della catena), confrontate col testo dopo la revisione della persona.
// Solo conteggi in uscita, mai contenuti.
import { costruisciRevisione, type Issue } from '../prototipo-revisione';

export type EsitoFlag = {
  tipo: string;
  critico: boolean;
  // toccata: la frase segnalata non c'è più uguale nel testo della persona;
  // intatta: c'è ancora, identica; inserita / non_inserita: per le omissioni
  // e le frasi tolte dalla catena, se la persona le ha rimesse nel testo;
  // senza_aggancio: la segnalazione non era legata a una frase.
  esito: 'toccata' | 'intatta' | 'inserita' | 'non_inserita' | 'senza_aggancio';
};

export type PrecisioneTipo = {
  tipo: string; flag: number; critici: number; utili: number; inutili: number; senza_aggancio: number;
  quota_utili: number | null;
};

// Nome stabile del tipo, dal titolo e dalla categoria della segnalazione.
export function tipoFlag(i: Pick<Issue, 'title' | 'cat' | 'sev'>): string {
  const t = i.title;
  if (t.startsWith('Negazione sentita')) return 'motori: negazione';
  if (t.startsWith('I due motori')) return i.cat === 'NUMERIC' ? 'motori: numero' : 'motori: parola';
  if (t === 'Correzione automatica') return 'correzione automatica';
  if (i.cat === 'NO_SOURCE') return 'frase non sostenuta';
  if (t === 'Frase da chiarire') return 'frase da chiarire';
  if (t.startsWith('Numero non confermato')) return 'numero non confermato';
  if (t.startsWith('Allarme numerico')) return 'allarme numerico';
  if (t.startsWith('Cambiamento grande')) return 'cambiamento dalla visita precedente';
  if (i.cat === 'OMISSION') return i.sev === 'critical' ? 'omissione grave' : 'omissione';
  if (i.cat === 'CLINICAL') return 'contraddizione';
  if (t === 'Possibile doppione') return 'doppione dubbio';
  if (t === 'Tolto come doppione') return 'doppione tolto';
  if (t.startsWith('Tolta dalla catena')) return 'frase tolta dalla catena';
  if (i.cat === 'MEDICATION') return 'terapia';
  return 'altro';
}

function norma(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function parole(s: string): string[] {
  return norma(s).split(' ').filter((w) => w.length >= 3);
}
function copertura(frase: string, testoNorm: Set<string>): number {
  const p = parole(frase);
  return p.length ? p.filter((w) => testoNorm.has(w)).length / p.length : 0;
}

export function esitiFlag(testoCatena: string, payload: Record<string, unknown>, testoPersona: string): EsitoFlag[] {
  const rev = costruisciRevisione({ testo: testoCatena, parole: [], payload });
  const parti = new Map(rev.report.flatMap((s) => s.parts).map((p) => [p.id, p.t]));
  const persona = ` ${norma(testoPersona)} `;
  const paroleCatena = new Set(parole(testoCatena));
  const parolePersona = new Set(parole(testoPersona));
  return rev.issues.map((i) => {
    const tipo = tipoFlag(i);
    const critico = i.sev === 'critical' || i.cat === 'NO_SOURCE';
    const frase = i.span ? parti.get(i.span) : undefined;
    if (frase && norma(frase)) {
      return { tipo, critico, esito: persona.includes(` ${norma(frase)} `) ? 'intatta' : 'toccata' };
    }
    const daMettere = i.add?.text ?? null;
    if (daMettere && parole(daMettere).length >= 2) {
      // Rimessa: la persona ha portato nel testo parole che la catena non aveva.
      const nuove = parole(daMettere).filter((w) => !paroleCatena.has(w));
      const rimessa = nuove.length > 0
        ? nuove.filter((w) => parolePersona.has(w)).length / nuove.length >= 0.6
        : copertura(daMettere, parolePersona) >= 0.8 && copertura(daMettere, paroleCatena) < 0.8;
      return { tipo, critico, esito: rimessa ? 'inserita' : 'non_inserita' };
    }
    return { tipo, critico, esito: 'senza_aggancio' };
  });
}

// «Utile» = la segnalazione ha portato a un cambiamento in quel punto. È un
// tetto: la frase può essere stata cambiata per un altro motivo.
export function precisione(perReferto: EsitoFlag[][]): PrecisioneTipo[] {
  const acc = new Map<string, PrecisioneTipo>();
  for (const esiti of perReferto) {
    for (const e of esiti) {
      const a = acc.get(e.tipo) ?? { tipo: e.tipo, flag: 0, critici: 0, utili: 0, inutili: 0, senza_aggancio: 0, quota_utili: null };
      a.flag++;
      if (e.critico) a.critici++;
      if (e.esito === 'toccata' || e.esito === 'inserita') a.utili++;
      else if (e.esito === 'senza_aggancio') a.senza_aggancio++;
      else a.inutili++;
      acc.set(e.tipo, a);
    }
  }
  for (const a of acc.values()) {
    const valutate = a.utili + a.inutili;
    a.quota_utili = valutate ? Math.round((100 * a.utili) / valutate) : null;
  }
  return [...acc.values()].sort((x, y) => y.critici - x.critici || y.flag - x.flag);
}

// Tipi che non portano quasi mai a una correzione: candidati a scendere di
// gravità (se critici) o a sparire. Soglie prudenti per pochi referti.
export function daDeclassare(righe: PrecisioneTipo[], minimo = 8, quota = 15): PrecisioneTipo[] {
  return righe.filter((r) => r.utili + r.inutili >= minimo && (r.quota_utili ?? 100) <= quota);
}
