// Abbinamento TOLLERANTE del nome dettato a una cartella (2.10.2026, decisione
// dello studio). La catena trascrive i nomi a orecchio: «Defendi» per
// «Deffendi», «Bomartini» per «Bommartini». Il confronto esatto
// (pazienti-abbina-regole.ts) li perdeva e la bozza restava senza cartella:
// niente lettera vecchia, niente allegati, niente storico.
// Qui il confronto «come suona», PURO. Resta prudente: si collega da solo solo
// con un segnale in più (una visita in agenda nei giorni del dettato, o la
// stessa data di nascita); altrimenti è una proposta da confermare.
import { chiaveNome, dataIso, type PazienteMinimo } from './pazienti-abbina-regole';

// Come suona una parola: senza doppie, h muta, k/j/y/w/ph come c/i/i/v/f.
export function suono(parola: string): string {
  return chiaveNome(parola)
    .replace(/ph/g, 'f').replace(/k/g, 'c').replace(/[jy]/g, 'i').replace(/w/g, 'v')
    .replace(/([^cg])h/g, '$1').replace(/^h/, '')
    .replace(/(.)\1+/g, '$1');
}

function distanza(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// Due parole «suonano uguali»: stesso suono, o una lettera diversa se la
// parola è lunga almeno 5 lettere (e mai la prima lettera).
export function parolaSimile(a: string, b: string): number | null {
  const x = suono(a), y = suono(b);
  if (!x || !y) return null;
  if (x === y) return chiaveNome(a) === chiaveNome(b) ? 0 : 1;
  if (x[0] !== y[0] || Math.min(x.length, y.length) < 5) return null;
  // Solo l'ultima lettera diversa (Mario/Maria, Paolo/Paola, Rossi/Rosso):
  // sono persone diverse, non un errore d'ascolto.
  if (x.length === y.length && x.slice(0, -1) === y.slice(0, -1)) return null;
  return distanza(x, y) <= 1 ? 2 : null;
}

const parole = (s: string) => chiaveNome(s).split(' ').filter((w) => w.length >= 2 && !/^(sig|sigra|signor|signora|dott|dr|prof)$/.test(w));

// Il nome dettato corrisponde alla cartella? Ogni parola del cognome e la
// prima del nome della cartella devono trovare una parola diversa del
// dettato che suona uguale. Restituisce la «distanza» (0 = identico) e le
// coppie parola dettata → parola della cartella, o null.
export function confrontaNomi(dettato: string, p: { cognome: string; nome: string }): { distanza: number; coppie: [string, string][] } | null {
  const d = parole(dettato);
  const cognome = parole(p.cognome);
  const nome = parole(p.nome).slice(0, 1);
  const servono = [...cognome, ...nome];
  if (!d.length || !servono.length) return null;
  const usate = new Set<number>();
  let tot = 0;
  const coppie: [string, string][] = [];
  for (const w of servono) {
    let migliore: { i: number; s: number } | null = null;
    d.forEach((x, i) => {
      if (usate.has(i)) return;
      const s = parolaSimile(x, w);
      if (s != null && (!migliore || s < migliore.s)) migliore = { i, s };
    });
    if (!migliore) return null;
    const m = migliore as { i: number; s: number };
    usate.add(m.i);
    tot += m.s;
    coppie.push([d[m.i], w]);
  }
  return { distanza: tot, coppie };
}

export type EsitoSimile =
  | { id: string; modo: 'simile_nascita' | 'simile_agenda'; coppie: [string, string][] }
  | { id: null; proposte: { id: string; agenda: boolean }[] };

// Fra le cartelle, quelle che suonano come il nome dettato. Collega da sola
// solo se UNA sola ha la stessa data di nascita dettata, o UNA sola ha una
// visita in agenda nei giorni del dettato (`inAgenda`). Altrimenti: proposte
// (al massimo 3, prima quelle in agenda), da confermare a mano.
export function abbinaSimile(nome: string, nascita: string | null | undefined, pazienti: PazienteMinimo[], inAgenda: Set<string>): EsitoSimile {
  const cand = pazienti
    .map((p) => ({ p, c: confrontaNomi(nome, p) }))
    .filter((x): x is { p: PazienteMinimo; c: { distanza: number; coppie: [string, string][] } } => x.c != null);
  if (!cand.length) return { id: null, proposte: [] };
  const n = dataIso(nascita);
  if (n) {
    const stessa = cand.filter((x) => dataIso(x.p.data_nascita) === n);
    if (stessa.length === 1) return { id: stessa[0].p.id, modo: 'simile_nascita', coppie: stessa[0].c.coppie };
  }
  // Con la data dettata, una cartella con una data diversa non è lei.
  const compatibili = n ? cand.filter((x) => !dataIso(x.p.data_nascita) || dataIso(x.p.data_nascita) === n) : cand;
  const inVisita = compatibili.filter((x) => inAgenda.has(x.p.id));
  if (inVisita.length === 1) return { id: inVisita[0].p.id, modo: 'simile_agenda', coppie: inVisita[0].c.coppie };
  return {
    id: null,
    proposte: compatibili
      .sort((a, b) => Number(inAgenda.has(b.p.id)) - Number(inAgenda.has(a.p.id)) || a.c.distanza - b.c.distanza)
      .slice(0, 3).map((x) => ({ id: x.p.id, agenda: inAgenda.has(x.p.id) })),
  };
}

// Il nome nel testo come in cartella: le parole dettate che suonano come
// quelle della cartella prendono la grafia della cartella (maiuscola
// iniziale come nel testo). Solo parole intere, solo quelle della coppia.
export function nomeComeInCartella(testo: string, coppie: [string, string][], cartella: { cognome: string; nome: string }): { testo: string; cambiate: number } {
  const grafia = new Map<string, string>();
  for (const w of `${cartella.cognome} ${cartella.nome}`.split(/\s+/)) if (w) grafia.set(chiaveNome(w), w);
  let cambiate = 0;
  let out = String(testo || '');
  for (const [dett, cart] of coppie) {
    if (dett === cart) continue;
    const scritta = grafia.get(cart) ?? cart;
    const rx = new RegExp(`(?<![\\p{L}])${dett.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu');
    out = out.replace(rx, (m) => {
      cambiate++;
      return m === m.toUpperCase() && m.length > 1 ? scritta.toUpperCase() : /^\p{Lu}/u.test(m) ? scritta[0].toUpperCase() + scritta.slice(1) : scritta.toLowerCase();
    });
  }
  return { testo: out, cambiate };
}
