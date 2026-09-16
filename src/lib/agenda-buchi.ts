// I buchi in agenda, e chi potrebbe riempirli (16.9.2026).
//
// L'agenda della Cassa dei Medici la leggiamo e basta: il robot non scrive
// nulla e non scriverà mai. Quello che possiamo fare è **vedere il vuoto** —
// il quarto d'ora fra due visite, l'ora che si apre quando qualcuno disdice —
// e dire a chi sta in segreteria *chi potrebbe entrarci*, con il motivo
// scritto accanto. Poi qualcuno prende il telefono: il sistema propone, la
// persona decide e prenota dove si prenota davvero.
//
// Qui dentro non c'è database e non c'è modello: solo aritmetica sulle ore e
// una regola di abbinamento che si può leggere e contestare. Il modello
// locale entra dopo, e scrive soltanto le frasi ([[Piattaforma/Richiami e buchi]]).

export type Appunt = {
  id: string;
  medico: string;      // nome del medico (vuoto se l'appuntamento non è di nessuno)
  giorno: string;      // «2026-09-17»
  inizio: number;      // minuti dalla mezzanotte
  fine: number;
};

export type Buco = {
  medico: string;
  giorno: string;
  dalle: number;
  alle: number;
  minuti: number;
  pausa: boolean;      // cade dentro la fascia del pranzo: si propone per ultimo
  prima: string | null; // id dell'appuntamento che lo precede
  dopo: string | null;  // id di quello che lo segue
};

export type Candidato = {
  id: string;
  tipo: 'richiamo' | 'da_prenotare' | 'disdetta';
  paziente: string;
  patientId: string | null;
  prestazione: string | null;
  durata: number;            // minuti che servono
  medico: string | null;     // il suo medico, se ne ha uno
  scadenza: string | null;   // «2026-08-01» per i richiami
  giorniDiRitardo: number;   // 0 se non è in ritardo
  quesito: string | null;
};

export type Proposta = {
  buco: Buco;
  candidato: Candidato;
  punteggio: number;
  perche: string[];
};

export const PRANZO_DA = 12 * 60;
export const PRANZO_A = 13 * 60 + 30;

/** Un buco è il vuoto FRA due visite dello stesso medico nello stesso giorno.
 *  Non lo è la fine della giornata: se un medico finisce alle 16 non ha un
 *  buco fino a sera, ha finito. E non lo è un vuoto enorme, che quasi sempre
 *  vuol dire «al pomeriggio non c'è» — per quello c'è `massimo`. */
export function buchi(app: Appunt[], opz: { minimo?: number; massimo?: number } = {}): Buco[] {
  const minimo = opz.minimo ?? 20;
  const massimo = opz.massimo ?? 180;
  const per = new Map<string, Appunt[]>();
  for (const a of app) {
    if (!a.medico) continue;                       // senza medico non c'è un'agenda in cui fare un buco
    if (!(a.fine > a.inizio)) continue;
    const k = `${a.giorno}|${a.medico}`;
    (per.get(k) ?? per.set(k, []).get(k)!).push(a);
  }
  const out: Buco[] = [];
  for (const [k, lista] of per) {
    const [giorno, medico] = k.split('|');
    lista.sort((x, y) => x.inizio - y.inizio);
    // La visita più lunga che si accavalla decide da dove riparte il tempo
    // libero: due visite sovrapposte non aprono un buco fra loro.
    let finePrec = lista[0].fine;
    let idPrec = lista[0].id;
    for (let i = 1; i < lista.length; i++) {
      const a = lista[i];
      const vuoto = a.inizio - finePrec;
      const pausa = finePrec < PRANZO_A && a.inizio > PRANZO_DA;
      // Un vuoto lungo che scavalca l'ora di pranzo non è un buco: è la
      // mattina che finisce e il pomeriggio che comincia. Proporre di
      // riempirlo vuol dire proporre di far saltare il pranzo a qualcuno.
      const pranzoIntero = pausa && vuoto > 90;
      if (vuoto >= minimo && vuoto <= massimo && !pranzoIntero) {
        out.push({ medico, giorno, dalle: finePrec, alle: a.inizio, minuti: vuoto, pausa, prima: idPrec, dopo: a.id });
      }
      if (a.fine > finePrec) { finePrec = a.fine; idPrec = a.id; }
    }
  }
  return out.sort((a, b) => `${a.giorno}${String(a.dalle).padStart(4, '0')}`.localeCompare(`${b.giorno}${String(b.dalle).padStart(4, '0')}`));
}

/** Quanto «vale» mettere questo paziente in questo buco, e perché.
 *  Punteggio alto = proposta migliore. Chi non ci sta dentro non è una
 *  proposta: è rumore, e viene scartato. */
export function valuta(b: Buco, c: Candidato, puoFare?: (medico: string, prestazione: string | null) => boolean): { punteggio: number; perche: string[] } | null {
  if (c.durata > b.minuti) return null;
  if (puoFare && c.prestazione && !puoFare(b.medico, c.prestazione)) return null;
  const perche: string[] = [];
  let p = 0;
  if (c.medico && stessoNome(c.medico, b.medico)) { p += 60; perche.push(`è un paziente di ${nomeCorto(b.medico)}`); }
  else if (c.medico) { p -= 15; perche.push(`di solito lo segue ${nomeCorto(c.medico)}`); }
  if (c.giorniDiRitardo > 0) {
    p += Math.min(c.giorniDiRitardo, 180) / 2;
    perche.push(c.giorniDiRitardo >= 30 ? `il richiamo è scaduto da ${Math.round(c.giorniDiRitardo / 30)} ${Math.round(c.giorniDiRitardo / 30) === 1 ? 'mese' : 'mesi'}` : `il richiamo è scaduto da ${c.giorniDiRitardo} giorni`);
  } else if (c.tipo === 'richiamo' && c.scadenza) perche.push(`va richiamato entro il ${giornoItaliano(c.scadenza)}`);
  if (c.tipo === 'da_prenotare') { p += 20; perche.push('è in attesa di un appuntamento'); }
  if (c.tipo === 'disdetta') { p += 25; perche.push('ha disdetto e va rimesso in agenda'); }
  // Meglio il buco che avanza meno: riempire 30 minuti con una visita da 30
  // vale più che sprecarne 20.
  const avanzo = b.minuti - c.durata;
  p += Math.max(0, 20 - avanzo) / 2;
  if (avanzo <= 5) perche.push(`la sua ${c.prestazione ? c.prestazione.toLowerCase() : 'visita'} riempie il buco quasi esatto`);
  if (b.pausa) { p -= 25; perche.push('è però l’ora di pranzo'); }
  return { punteggio: Math.round(p * 10) / 10, perche };
}

/** L'abbinamento: a ogni buco al massimo un paziente, a ogni paziente al
 *  massimo un buco. Si prende la coppia che vale di più, poi la successiva
 *  fra quelle rimaste. È «avido» e lo sa: non cerca l'ottimo globale, cerca
 *  qualcosa che una persona possa guardare e approvare in dieci secondi. */
export function abbina(b: Buco[], c: Candidato[], opz: { puoFare?: (medico: string, prestazione: string | null) => boolean; max?: number } = {}): Proposta[] {
  const tutte: Proposta[] = [];
  for (const buco of b) {
    for (const cand of c) {
      const v = valuta(buco, cand, opz.puoFare);
      if (v) tutte.push({ buco, candidato: cand, punteggio: v.punteggio, perche: v.perche });
    }
  }
  tutte.sort((x, y) => y.punteggio - x.punteggio || chiave(x.buco).localeCompare(chiave(y.buco)));
  const bucoPreso = new Set<string>(); const candPreso = new Set<string>();
  const out: Proposta[] = [];
  for (const p of tutte) {
    const kb = chiave(p.buco);
    if (bucoPreso.has(kb) || candPreso.has(p.candidato.id)) continue;
    bucoPreso.add(kb); candPreso.add(p.candidato.id);
    out.push(p);
    if (opz.max && out.length >= opz.max) break;
  }
  return out.sort((x, y) => chiave(x.buco).localeCompare(chiave(y.buco)));
}

/** Tutti i candidati che starebbero in un buco, in ordine di punteggio: serve
 *  al «chi altro?» quando la prima proposta non va bene. */
export function perQuestoBuco(b: Buco, c: Candidato[], puoFare?: (medico: string, prestazione: string | null) => boolean, max = 5): Proposta[] {
  const out: Proposta[] = [];
  for (const cand of c) {
    const v = valuta(b, cand, puoFare);
    if (v) out.push({ buco: b, candidato: cand, punteggio: v.punteggio, perche: v.perche });
  }
  return out.sort((x, y) => y.punteggio - x.punteggio).slice(0, max);
}

/** E il contrario: dato un paziente da richiamare, dove potrebbe entrare. */
export function perQuestoPaziente(c: Candidato, b: Buco[], puoFare?: (medico: string, prestazione: string | null) => boolean, max = 5): Proposta[] {
  const out: Proposta[] = [];
  for (const buco of b) {
    const v = valuta(buco, c, puoFare);
    if (v) out.push({ buco, candidato: c, punteggio: v.punteggio, perche: v.perche });
  }
  return out.sort((x, y) => y.punteggio - x.punteggio).slice(0, max);
}

/** La frase che la segretaria legge, scritta dal codice. Il modello locale
 *  può riscriverla meglio, ma se non c'è questa basta. */
export function frase(p: Proposta): string {
  const q = p.buco;
  return `${p.candidato.paziente} — ${giornoItaliano(q.giorno)} dalle ${hm(q.dalle)} alle ${hm(q.alle)} con ${nomeCorto(q.medico)}${p.candidato.prestazione ? ` (${p.candidato.prestazione.toLowerCase()}, ${p.candidato.durata} min)` : ''}: ${p.perche.join(', ')}.`;
}

export const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
const chiave = (b: Buco) => `${b.giorno}|${String(b.dalle).padStart(4, '0')}|${b.medico}`;
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function giornoItaliano(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}
export function nomeCorto(n: string): string {
  return String(n || '').replace(/^(Prof\.|Dr\.ssa|Dr\.|Dott\.ssa|Dott\.)\s*/i, '').replace(/^med\.\s*/i, '').trim() || n;
}
function stessoNome(a: string, b: string): boolean {
  const n = (s: string) => nomeCorto(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').trim();
  return !!a && !!b && n(a) === n(b);
}
