// Le spiegazioni (16.9.2026, §13).
//
// Ogni modifica porta un «perché» strutturato e una frase. La frase la scrive
// il codice, da frasi fisse, per i casi ordinari: una causa, un medico, dei
// minuti, delle mosse. Solo quando il diff è più articolato di così la frase
// la scrive il modello piccolo — dal perché strutturato, mai dallo stato
// intero, così non può inventare una causa che non c'è.

import { hm, livelloComunicazione, type Livello } from './orizzonte';
import type { Parametri } from './parametri';
import type { Pianificata } from './riparatore';

export type Cambio = {
  id: string; etichetta: string;
  tipo: 'ora' | 'stanza' | 'entrambi' | 'nuovo' | 'tolto';
  deltaMin: number; salaPrima: string | null; salaDopo: string | null;
  ingressoPrima: number | null; ingressoDopo: number | null;
  livello: Livello;
};

export function confronta(prima: Record<string, Pianificata>, dopo: Record<string, Pianificata>, etichetta: (id: string) => string, p: Parametri): Cambio[] {
  const fuori: Cambio[] = [];
  const ids = new Set([...Object.keys(prima), ...Object.keys(dopo)]);
  for (const id of ids) {
    const a = prima[id], b = dopo[id];
    if (a && !b) { fuori.push({ id, etichetta: etichetta(id), tipo: 'tolto', deltaMin: 0, salaPrima: a.sala, salaDopo: null, ingressoPrima: a.ingresso, ingressoDopo: null, livello: 'accoglienza' }); continue; }
    if (!a && b) { fuori.push({ id, etichetta: etichetta(id), tipo: 'nuovo', deltaMin: 0, salaPrima: null, salaDopo: b.sala, ingressoPrima: null, ingressoDopo: b.ingresso, livello: 'mappa' }); continue; }
    if (!a || !b) continue;
    const delta = b.ingresso - a.ingresso;
    const stanza = a.sala.toLowerCase() !== b.sala.toLowerCase();
    if (!delta && !stanza) continue;
    fuori.push({
      id, etichetta: etichetta(id),
      tipo: stanza && delta ? 'entrambi' : stanza ? 'stanza' : 'ora',
      deltaMin: delta, salaPrima: a.sala, salaDopo: b.sala, ingressoPrima: a.ingresso, ingressoDopo: b.ingresso,
      livello: livelloComunicazione(delta, stanza, p),
    });
  }
  return fuori.sort((x, y) => (x.ingressoDopo ?? x.ingressoPrima ?? 0) - (y.ingressoDopo ?? y.ingressoPrima ?? 0));
}

export type Causa = {
  tipo: 'visita_piu_lunga' | 'medico_in_ritardo' | 'paziente_in_ritardo' | 'paziente_assente' | 'sala_fuori_servizio' | 'urgenza' | 'comando' | 'mattino' | 'proposta' | 'altro';
  medico?: string; minuti?: number; sala?: string; paziente?: string;
  mosse?: string[];                 // 'cuscinetto' | 'stanza_alternativa:Sala 3' | 'riordino:P-21<>P-22' | 'preparazione_anticipata' | 'visita_breve' | 'sostituzione:Nome'
  restoInAttesa?: boolean;
};

const nomeCorto = (n: string) => { const p = String(n ?? '').replace(/\b(prof|dr|dott|med|ssa)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean); return p.length > 1 ? p[p.length - 1] : (p[0] || ''); };

const CAUSE: Record<Causa['tipo'], (c: Causa) => string> = {
  visita_piu_lunga: (c) => `la visita precedente di ${nomeCorto(c.medico ?? '')} sta durando più del previsto`,
  medico_in_ritardo: (c) => `${nomeCorto(c.medico ?? '')} è in ritardo di ${c.minuti ?? 0} minuti`,
  paziente_in_ritardo: (c) => `${c.paziente ?? 'il paziente'} ha avvisato che arriva più tardi`,
  paziente_assente: (c) => `${c.paziente ?? 'un paziente'} non è venuto`,
  sala_fuori_servizio: (c) => `la ${c.sala ?? 'stanza'} è fuori servizio`,
  urgenza: () => `è entrata un'urgenza`,
  comando: () => `una persona ha imposto un vincolo`,
  mattino: () => `è il piano del mattino`,
  proposta: () => `una proposta è stata accettata`,
  altro: () => `la situazione è cambiata`,
};

const MOSSE: Record<string, (arg: string) => string> = {
  cuscinetto: () => 'consumando un tempo cuscinetto',
  stanza_alternativa: (s) => `usando la ${s}`,
  riordino: (s) => `invertendo ${s.replace('<>', ' e ')}`,
  preparazione_anticipata: () => 'preparando in anticipo il paziente successivo',
  visita_breve: () => 'con una visita breve, come deciso dalla segreteria',
  sostituzione: (s) => `con ${s} al posto del medico previsto`,
};

export function fraseMosse(mosse: string[] = []): string {
  const pezzi = mosse.map((m) => { const [k, arg = ''] = m.split(':'); return (MOSSE[k] ?? (() => m))(arg); });
  if (!pezzi.length) return '';
  if (pezzi.length === 1) return pezzi[0];
  return `${pezzi.slice(0, -1).join(', ')} e ${pezzi[pezzi.length - 1]}`;
}

// La frase per un cambiamento (§13).
export function frase(c: Cambio, causa: Causa): string {
  const perche = CAUSE[causa.tipo](causa);
  const mosse = fraseMosse(causa.mosse);
  if (c.tipo === 'tolto') return `${c.etichetta} non è più nel piano perché ${perche}.`;
  if (c.tipo === 'nuovo') return `${c.etichetta} è stato inserito in ${c.salaDopo} alle ${hm(c.ingressoDopo!)} perché ${perche}${mosse ? `, ${mosse}` : ''}.`;
  const dir = c.deltaMin > 0 ? 'posticipato' : 'anticipato';
  const quanto = `${Math.abs(c.deltaMin)} minut${Math.abs(c.deltaMin) === 1 ? 'o' : 'i'}`;
  let t = '';
  if (c.tipo === 'ora') t = `${c.etichetta} è stato ${dir} di ${quanto} (${hm(c.ingressoPrima!)} → ${hm(c.ingressoDopo!)}) perché ${perche}`;
  else if (c.tipo === 'stanza') t = `${c.etichetta} entra in ${c.salaDopo} invece che in ${c.salaPrima} perché ${perche}`;
  else t = `${c.etichetta} entra in ${c.salaDopo} alle ${hm(c.ingressoDopo!)} invece che in ${c.salaPrima} alle ${hm(c.ingressoPrima!)} perché ${perche}`;
  if (mosse) t += `, ${mosse}`;
  t += '.';
  if (causa.restoInAttesa) t += ` È rimasto in sala d'attesa per non occupare inutilmente la ${c.salaPrima ?? c.salaDopo}.`;
  return t;
}

// La frase per un ritardo assorbito (§8.5), senza un cambiamento specifico.
export function fraseAssorbito(medico: string, minuti: number, mosse: string[], altriSpostati: number): string {
  const m = fraseMosse(mosse);
  const coda = altriSpostati ? ` ${altriSpostati === 1 ? 'Un altro appuntamento si è mosso' : `${altriSpostati} altri appuntamenti si sono mossi`}.` : ' Nessun altro appuntamento si è mosso.';
  return `Il ritardo di ${minuti} minuti di ${nomeCorto(medico)} è stato assorbito${m ? ` ${m}` : ''}.${coda}`;
}

// L'avviso corto (§14 D): una riga.
export function avviso(c: Cambio): string {
  if (c.tipo === 'ora') return `${c.etichetta}: ingresso ${hm(c.ingressoPrima!)} → ${hm(c.ingressoDopo!)}`;
  if (c.tipo === 'stanza') return `${c.etichetta}: ${c.salaPrima} → ${c.salaDopo}`;
  if (c.tipo === 'entrambi') return `${c.etichetta}: ${c.salaPrima} ${hm(c.ingressoPrima!)} → ${c.salaDopo} ${hm(c.ingressoDopo!)}`;
  if (c.tipo === 'nuovo') return `${c.etichetta}: nuovo, ${c.salaDopo} ${hm(c.ingressoDopo!)}`;
  return `${c.etichetta}: tolto dal piano`;
}

export function avvisoRitardo(medico: string, minuti: number): string {
  return `${nomeCorto(medico)} ${minuti >= 0 ? '+' : ''}${minuti} min`;
}
