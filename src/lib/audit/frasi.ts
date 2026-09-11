// Frasi fisse proposte dalle lettere confermate (11.9.2026, fase 4 del
// secondo giro): le frasi che un medico ripete uguali in molte lettere
// sono le sue formule, e messe nella pagina Agenti/<medico> della wiki
// («Frasi fisse») aiutano il correttore a riconoscerle anche storpiate.
// PURO: dalle lettere confermate (testo_finale) alle frasi candidate,
// contate per lettere distinte. Guardie: niente cifre, niente parole dei
// nomi dei pazienti di quelle lettere, almeno N parole, presenti in almeno
// K lettere, non già tra le frasi fisse. Sono PROPOSTE: le copia una persona.
export type Lettera = { id: string; testo: string; nomi?: string[] };
export type FraseCandidata = { frase: string; lettere: number };

export function normaFrase(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[«»"'“”]/g, '').replace(/\s+/g, ' ').replace(/^[\s,.;:!?()-]+|[\s,.;:!?()-]+$/g, '').trim();
}

export function spezzaFrasi(testo: string): string[] {
  return String(testo ?? '').replace(/\r\n/g, '\n').split(/(?<=[.!?;])\s+|\n+/).map((f) => f.trim()).filter(Boolean);
}

export function frasiCandidate(lettere: Lettera[], gia: string[] = [], opz: { minLettere?: number; minParole?: number; max?: number } = {}): FraseCandidata[] {
  const minLettere = opz.minLettere ?? 3, minParole = opz.minParole ?? 6, max = opz.max ?? 30;
  const giaNorm = gia.map(normaFrase).filter(Boolean);
  const conta = new Map<string, { frase: string; ids: Set<string> }>();
  for (const l of lettere) {
    const nomi = new Set((l.nomi ?? []).flatMap((n) => normaFrase(n).split(' ')).filter((t) => t.length >= 3));
    for (const f of spezzaFrasi(l.testo)) {
      const n = normaFrase(f);
      if (!n || /\d/.test(n)) continue;
      const parole = n.split(' ');
      if (parole.length < minParole || parole.length > 40) continue;
      if (parole.some((p) => nomi.has(p))) continue;
      if (giaNorm.some((g) => g === n || n.includes(g) || g.includes(n))) continue;
      const v = conta.get(n) ?? { frase: f.replace(/[.;]+$/, '').trim(), ids: new Set<string>() };
      v.ids.add(l.id);
      conta.set(n, v);
    }
  }
  return [...conta.values()]
    .filter((v) => v.ids.size >= minLettere)
    .map((v) => ({ frase: v.frase, lettere: v.ids.size }))
    .sort((a, b) => b.lettere - a.lettere || a.frase.localeCompare(b.frase))
    .slice(0, max);
}
