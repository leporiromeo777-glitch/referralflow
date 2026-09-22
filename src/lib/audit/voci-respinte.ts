// Voci del dizionario che la segreteria rimette com'erano (22.9.2026). La
// tappa «dizionario» allontana dal testo confermato più spesso di quanto
// avvicini (consolidatore, 6 referti contro 2); scomposta a mano: la
// punteggiatura dettata aiuta, sostituzioni e riparazioni fonetiche no —
// 13 sostituzioni su 26 e 4 riparazioni su 15 tornate alla forma dettata.
// PURO: le sostituzioni fatte si leggono dal confronto fra il testo prima
// della tappa e quello dopo (vale anche per i referti vecchi); poi si guarda
// quale forma c'è nel testo della catena e in quello della persona. Solo
// voci corte senza cifre e senza maiuscole (mai nomi): è vocabolario.
// Decide una persona: niente si toglie da solo.
import { confronta, parole } from './diff';

export type Referto = { prima: string; dopo: string; catena: string; persona: string };
export type EsitoVoce = {
  da: string; a: string; referti: number;
  tenuta: number;            // nel testo della persona c'è la forma corretta
  rimessa_persona: number;   // la persona ha rimesso la forma dettata
  rimessa_catena: number;    // l'ha già rimessa la catena dopo il dizionario (arbitro, correttore)
  sparita: number;           // nessuna delle due forme (frase riscritta o tolta)
};

const soloLettere = (s: string) => /^[\p{Ll}\s'’-]+$/u.test(s);

function conta(testo: string[], voce: string[]): number {
  if (!voce.length) return 0;
  let n = 0;
  for (let i = 0; i + voce.length <= testo.length; i++) {
    if (voce.every((w, k) => testo[i + k] === w)) n++;
  }
  return n;
}
const tok = (s: string) => parole(s).map((w) => w.toLowerCase()).filter((w) => /[\p{L}\p{N}]/u.test(w));

export function sostituzioniFatte(prima: string, dopo: string): { da: string; a: string }[] {
  const out: { da: string; a: string }[] = [];
  for (const op of confronta(prima, dopo).operazioni) {
    if (op.kind !== 'REPLACE') continue;
    const da = tok(op.from).join(' '), a = tok(op.to).join(' ');
    // La punteggiatura dettata («virgola» → «,») non è una voce: dopo resta vuoto.
    if (!da || !a || da === a) continue;
    if (!soloLettere(op.from.trim()) || /\d/.test(op.to)) continue;
    if (da.split(' ').length > 4 || a.split(' ').length > 4) continue;
    out.push({ da, a });
  }
  return out;
}

export function esitiVoci(referti: Referto[]): EsitoVoce[] {
  const acc = new Map<string, EsitoVoce>();
  for (const r of referti) {
    const catena = tok(r.catena), persona = tok(r.persona);
    const viste = new Set<string>();
    for (const { da, a } of sostituzioniFatte(r.prima, r.dopo)) {
      const k = `${da}\u0000${a}`;
      if (viste.has(k)) continue;
      viste.add(k);
      const e = acc.get(k) ?? { da, a, referti: 0, tenuta: 0, rimessa_persona: 0, rimessa_catena: 0, sparita: 0 };
      e.referti++;
      const dv = da.split(' '), av = a.split(' ');
      const pDa = conta(persona, dv), pA = conta(persona, av);
      if (pA > 0 && pDa === 0) e.tenuta++;
      else if (pDa > 0 && pA === 0) {
        if (conta(catena, dv) > 0 && conta(catena, av) === 0) e.rimessa_catena++;
        else e.rimessa_persona++;
      } else if (pA === 0 && pDa === 0) e.sparita++;
      else e.tenuta++; // entrambe presenti: la voce non ha fatto danno evidente
      acc.set(k, e);
    }
  }
  return [...acc.values()].sort((x, y) => (y.rimessa_persona + y.rimessa_catena) - (x.rimessa_persona + x.rimessa_catena) || y.referti - x.referti);
}

// Da proporre per la rimozione: rimesse (dalla persona) almeno quanto tenute.
export function vociDaRivedere(esiti: EsitoVoce[]): EsitoVoce[] {
  return esiti.filter((e) => e.rimessa_persona > 0 && e.rimessa_persona >= e.tenuta);
}
