// Pressione — la farmacocinetica di ogni farmaco, dai testi ufficiali (21.10.2026, richiesta dello studio: «tutti i
// farmaci correlati con la loro farmacocinetica — in quanto tempo agisce, quanto, quanta concentrazione c'è nel sangue
// dopo quanto tempo — perché l'algoritmo si deve basare sulla cinetica di ogni farmaco»). PURO.
//
// I dati stanno in `cinetica-fonti.json`: per ogni principio attivo, letti sulle informazioni ufficiali del prodotto
// (SmPC europee sezioni 5.1/5.2, etichette USA 12.2/12.3, Fachinformation; ogni numero con la sua fonte e una frase
// citata). Le informazioni svizzere (swissmedicinfo.ch, ch.oddb.org) non si lasciano leggere in automatico: il medico,
// confermando la riga, controlla i numeri sul testo svizzero. Da qui:
// - i QUATTRO NUMERI della finestra d'azione (inizio, picco, durata dell'effetto, emivita) presi dal testo dove il
//   testo li dà, e dalla bozza dove non li dà — per ogni numero è scritto da dove viene;
// - l'EFFETTO in mmHg del farmaco quando il testo dà un calo rispetto al placebo alla dose abituale;
// - la CURVA DELLA CONCENTRAZIONE nel sangue nelle 24 ore, calcolata da Tmax ed emivita.
// La regola di sempre resta: una riga vale (finestra, calcoli, proposte) solo dopo la conferma di un medico.

export type Intervallo = number | [number | null, number | null] | null;
export type Fonte = { url: string; documento: string; sezione?: string; data_testo?: string | null; citazione: string };
export type Cinetica = {
  principio: string; forma?: string; dose_usuale_mg?: string;
  tmax_h?: Intervallo; nota_tmax?: string;
  biodisponibilita_pct?: Intervallo; nota_biodisponibilita?: string;
  emivita_h?: Intervallo; nota_emivita?: string;
  steady_state_giorni?: Intervallo;
  inizio_effetto_h?: Intervallo; picco_effetto_h?: Intervallo; durata_effetto_h?: Intervallo; nota_effetto?: string;
  effetto_pa?: string | null;
  effetto_sis?: number | null; effetto_dia?: number | null;      // calo rispetto al placebo alla dose abituale, se il testo lo dà
  effetto_come?: string | null;                                   // a quale dose e come si è arrivati al numero
  nome?: string;                                                  // quando il nome mostrato non è la chiave (sacubitril/valsartan)
  // quando l'effetto passa da un metabolito attivo con tempi suoi (losartan → E-3174): la curva e la coda seguono lui
  molecola_attiva?: string; tmax_attivo_h?: Intervallo; emivita_attiva_h?: Intervallo;
  eliminazione?: string | null; cibo?: string | null;
  fonti: Fonte[]; affidabilita?: string; note?: string;
};
import FONTI from './cinetica-fonti.json';

// La versione dei testi letti: cambia quando si rileggono, e allora le righe non confermate si aggiornano.
export const VERSIONE_CINETICA: string = (FONTI as { versione: string }).versione;
const PER_PRINCIPIO = new Map<string, Cinetica>(((FONTI as unknown as { farmaci: Cinetica[] }).farmaci).map((c) => [c.principio, c]));
export const cineticaDi = (principio: string): Cinetica | null => PER_PRINCIPIO.get(principio) ?? null;
export const principiConCinetica = (): string[] => [...PER_PRINCIPIO.keys()];

export type Provenienza = 'testo' | 'bozza';
export type NumeriFinestra = { inizio_h: number; picco_h: number; durata_h: number; emivita_h: number; provenienza: Record<'inizio_h' | 'picco_h' | 'durata_h' | 'emivita_h', Provenienza> };

// Un intervallo diventa un numero: il punto di mezzo (o l'unico estremo dato: «entro 2 ore» → 2).
export function medio(x: Intervallo | undefined): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const [a, b] = x as [number | null, number | null];
  if (typeof a !== 'number') return typeof b === 'number' ? b : null;
  return typeof b === 'number' ? Math.round(((a + b) / 2) * 100) / 100 : a;
}
const primo = (x: Intervallo | undefined): number | null => (x === null || x === undefined ? null : typeof x === 'number' ? x : typeof x[0] === 'number' ? x[0] : null);

// Tmax ed emivita della molecola che agisce: il metabolito attivo quando il testo dice che l'effetto passa da lui.
export const tmaxAttivo = (c: Cinetica): number | null => medio(c.tmax_attivo_h ?? c.tmax_h);
export const emivitaAttiva = (c: Cinetica): number | null => medio(c.emivita_attiva_h ?? c.emivita_h);

// I quattro numeri della finestra: dal testo, se c'è; se no dalla bozza. Inizio dell'effetto = il primo istante dato
// («entro 30–60 minuti» → 0,5); picco e durata dell'effetto; emivita della molecola che agisce. Il picco nel sangue
// (Tmax) NON fa da picco dell'effetto: per i sartani e gli ACE-inibitori la pressione scende ore dopo il picco nel
// sangue, e il testo lo dice a parte. Se i numeri presi così non stanno in piedi (inizio > picco > durata), si torna
// alla bozza per quel numero: meglio un numero di bozza dichiarato che una finestra rovesciata.
export function numeriFinestra(c: Cinetica | null | undefined, bozza: { inizio_h: number; picco_h: number; durata_h: number; emivita_h: number }): NumeriFinestra {
  const n: NumeriFinestra = { ...bozza, provenienza: { inizio_h: 'bozza', picco_h: 'bozza', durata_h: 'bozza', emivita_h: 'bozza' } };
  if (!c) return n;
  const ini = primo(c.inizio_effetto_h), pic = medio(c.picco_effetto_h), dur = medio(c.durata_effetto_h), emi = emivitaAttiva(c);
  if (ini !== null && ini >= 0) { n.inizio_h = ini; n.provenienza.inizio_h = 'testo'; }
  if (pic !== null && pic > 0) { n.picco_h = pic; n.provenienza.picco_h = 'testo'; }
  if (dur !== null && dur > 0) { n.durata_h = dur; n.provenienza.durata_h = 'testo'; }
  if (emi !== null && emi > 0) { n.emivita_h = emi; n.provenienza.emivita_h = 'testo'; }
  // in piedi: inizio ≤ picco ≤ durata
  if (n.inizio_h > n.picco_h) { if (n.provenienza.inizio_h !== 'bozza' && bozza.inizio_h <= n.picco_h) { n.inizio_h = bozza.inizio_h; n.provenienza.inizio_h = 'bozza'; } else { n.inizio_h = Math.min(n.inizio_h, n.picco_h); } }
  if (n.picco_h > n.durata_h) n.durata_h = n.picco_h;
  return n;
}

// La concentrazione nel sangue nelle 24 ore, presa una volta al giorno alla stessa ora e allo stato stazionario: un
// compartimento con assorbimento del primo ordine (funzione di Bateman), con la costante di eliminazione dall'emivita e
// quella di assorbimento scelta perché il picco a regime cada a Tmax. Rende 25 punti (ore 0…24 dalla presa), in parti del
// massimo (0…1). È un DISEGNO dei due numeri del testo, non una misura sul paziente.
export function concentrazione24(tmax_h: number, emivita_h: number, intervallo_h = 24): number[] {
  if (!(tmax_h > 0) || !(emivita_h > 0)) return [];
  const ke = Math.LN2 / emivita_h, tau = intervallo_h;
  // ka > ke tale che il picco ALLO STATO STAZIONARIO cada a Tmax (a regime il picco arriva prima che dopo la prima
  // dose; la bisezione funziona perché l'istante del picco scende al crescere di ka)
  const tDi = (ka: number) => Math.log((ka * (1 - Math.exp(-ke * tau))) / (ke * (1 - Math.exp(-ka * tau)))) / (ka - ke);
  let lo = ke * 1.0001, hi = ke * 1e4;
  if (tDi(hi) > tmax_h) hi = 1e3;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tDi(m) > tmax_h) lo = m; else hi = m; }
  const ka = (lo + hi) / 2;
  // stato stazionario, in forma chiusa: la somma di tutte le prese precedenti
  const c = (t: number) => Math.exp(-ke * t) / (1 - Math.exp(-ke * tau)) - Math.exp(-ka * t) / (1 - Math.exp(-ka * tau));
  const v = Array.from({ length: 25 }, (_, h) => c(h));
  const max = Math.max(...v);
  return v.map((x) => Math.round((x / max) * 1000) / 1000);
}
// Quanto scende la concentrazione fra il picco e la presa dopo (valle/picco), allo stato stazionario.
export function valleSuPicco(curva: number[]): number | null {
  return curva.length ? Math.round(Math.min(curva[0], curva[curva.length - 1]) * 100) / 100 : null;
}
