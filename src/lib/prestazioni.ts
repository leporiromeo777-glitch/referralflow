// Catalogo delle prestazioni (14.9.2026): abbinamento puro tra il motivo di un
// appuntamento dell'agenda e una voce del catalogo (parole chiave, poi il nome),
// tipo stimato dal testo quando il catalogo tace, e proposta di catalogo dalle
// prestazioni dei percorsi della wiki. Nessuna query.
export type TipoPrestazione = 'visita' | 'esame' | 'procedura';
export type VoceCatalogo = { id: string; nome: string; tipo: TipoPrestazione; durata_min: number; sala: string | null; parole_chiave: string[]; attivo: boolean };

export function normalizza(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Tipo stimato dal testo: esami strumentali, procedure, altrimenti visita.
export function tipoDaTesto(testo: string): TipoPrestazione {
  const t = normalizza(testo);
  // Radici (senza confine finale: «ecocardiogramma», «ergometria») e sigle corte (con confine).
  if (/\b(angioplast|ablazion|impianto|cardioversion|coronarograf|stent|pacemaker|defibrillat)|\b(pci|icd)\b/.test(t)) return 'procedura';
  if (/\b(eco|ecocardio|holter|ergometr|sforzo|duplex|doppler|risonanza|scintigraf|laborator|prelievo|telemetr|spirometr)|\b(ett|ete|ecg|abpm|tac|tc|rm|pm)\b/.test(t)) return 'esame';
  return 'visita';
}

// La voce del catalogo che il testo nomina: vince la parola chiave più lunga;
// senza parole chiave si prova il nome intero e le sue parole di 5+ lettere.
export function abbinaPrestazione(catalogo: VoceCatalogo[], testo: string): VoceCatalogo | null {
  const t = ` ${normalizza(testo)} `;
  if (!t.trim()) return null;
  let migliore: { voce: VoceCatalogo; peso: number } | null = null;
  for (const v of catalogo) {
    if (!v.attivo) continue;
    const chiavi = (v.parole_chiave.length ? v.parole_chiave : [v.nome]).map(normalizza).filter(Boolean);
    for (const k of chiavi) {
      if (t.includes(` ${k} `) && (!migliore || k.length > migliore.peso)) migliore = { voce: v, peso: k.length };
    }
    if (!v.parole_chiave.length) {
      const parole = normalizza(v.nome).split(' ').filter((w) => w.length >= 5);
      if (parole.length && parole.every((w) => t.includes(` ${w} `)) && (!migliore || parole.join('').length > migliore.peso)) migliore = { voce: v, peso: parole.join('').length };
    }
  }
  return migliore?.voce ?? null;
}

const DURATA: Record<TipoPrestazione, number> = { visita: 30, esame: 30, procedura: 60 };
// Dalle prestazioni dei percorsi (wiki) alle voci di catalogo: nomi unici,
// esterne escluse, tipo dal testo, durata standard per tipo, parola chiave
// = prima parola significativa del nome.
export function catalogoDaPercorsi(percorsi: { prestazioni: { nome: string; esterna: boolean }[] }[]): Omit<VoceCatalogo, 'id' | 'attivo'>[] {
  const visti = new Set<string>();
  const out: Omit<VoceCatalogo, 'id' | 'attivo'>[] = [];
  for (const p of percorsi) for (const x of p.prestazioni) {
    if (x.esterna) continue;
    const nome = x.nome.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const k = normalizza(nome);
    if (!k || visti.has(k)) continue;
    visti.add(k);
    const tipo = tipoDaTesto(nome);
    const parola = k.split(' ').filter((w) => w.length >= 4 && !['riposo', 'sforzo', 'test', 'derivazioni', 'cardiologica'].includes(w))[0] ?? k.split(' ')[0];
    out.push({ nome, tipo, durata_min: DURATA[tipo], sala: null, parole_chiave: parola ? [parola] : [] });
  }
  return out;
}
