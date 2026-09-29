// Riepilogo settimanale delle correzioni (29.9.2026), in forma di testo per
// il telefono: SOLO numeri. La parte pura (qui) si prova in
// prove-riepilogo-settimana.test.ts; le query stanno in
// riepilogo-settimana-server.ts.

export type DatiSettimana = {
  da: string; a: string;              // «22.9», «28.9»
  arrivate: number; confermate: number; word: number;
  misurati: number; mediana100: number | null; medianaPrima: number | null; senzaCorrezioni: number;
  perMedico: { medico: string; n: number; mediana100: number | null }[];
  wordSenzaCorrezioniQui: number;     // Word scaricati senza una correzione nella piattaforma
  aperteDaSettimana: number;          // bozze non confermate arrivate da più di 7 giorni
};

const num = (v: number | null) => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));

export function testoRiepilogo(d: DatiSettimana): string {
  const righe = [`Settimana ${d.da}–${d.a}`];
  righe.push(`Bozze arrivate ${d.arrivate} · Word scaricati ${d.word} · confermate ${d.confermate}`);
  if (d.misurati) {
    let r = `Correzioni ogni 100 parole (mediana): ${num(d.mediana100)}`;
    if (d.medianaPrima != null && d.mediana100 != null) {
      const diff = d.mediana100 - d.medianaPrima;
      r += Math.abs(diff) < 0.05 ? ' (come la settimana prima)' : ` (settimana prima ${num(d.medianaPrima)}, ${diff < 0 ? 'meglio' : 'peggio'})`;
    }
    righe.push(r);
    righe.push(`Referti misurati ${d.misurati}, senza correzioni ${d.senzaCorrezioni}`);
    const pm = d.perMedico.filter((m) => m.n > 0);
    if (pm.length > 1) righe.push(pm.map((m) => `${m.medico} ${num(m.mediana100)} (${m.n})`).join(' · '));
  } else {
    righe.push('Nessun referto misurato: nessuno è stato confermato o scaricato in Word.');
  }
  if (d.wordSenzaCorrezioniQui) {
    righe.push(`${d.wordSenzaCorrezioniQui} Word scaricati senza correzioni nella piattaforma: se poi si corregge in Word, la misura non lo vede.`);
  }
  if (d.aperteDaSettimana) righe.push(`Bozze aperte da più di 7 giorni: ${d.aperteDaSettimana}`);
  return righe.join('\n');
}
