// Il grafo dello studio (16.9.2026, [[Piattaforma/Orchestrazione sale]] §1).
//
// Dà contesto, non decide: chi può fare cosa, dove, con che cosa. Si
// costruisce da due pagine wiki lette a runtime — Medici/Sale (stanze e chi
// ci sta) e Medici/Prestazioni e sale (durate, preparazioni, compatibilità) —
// più le tabelle che una pagina non sa dire bene (distanze in secondi). Qui
// dentro solo logica pura: la lettura dei file sta in chi ci ha accesso.

import {
  agendeFuoriPiano, fuoriDalPiano, leggiSale, prestazioniFuoriPiano, soloIn, stanzaAmmessa,
  type PrestazioneFuori, type Sala, type SoloIn,
} from '../sale';

export type Preparazione = { nome: string; minuti: number; ruolo: string };

export type Prestazione = {
  nome: string;
  durata: number;
  breve: number;
  preparazione: Preparazione | null;
  ripristino: number;
  sale: string[] | 'tutte';
  eccezioni: { sala: string; chi: string }[];   // «Sala 1 (Vera Lucia Paiocchi)»: quella sala solo per lei
  apparecchi: string[];
  medici: string[] | null;                      // null = tutti
  senzaMedico: boolean;
  nota: string;
  stato: string;
};

const num = (s: string, alt: number) => { const n = parseInt(String(s).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : alt; };
const lista = (s: string) => String(s ?? '').split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);

export function leggiPrestazioni(markdown: string): Prestazione[] {
  const fuori: Prestazione[] = [];
  let cur: Prestazione | null = null;
  for (const grezza of String(markdown ?? '').split('\n')) {
    const riga = grezza.trim();
    const t = /^##\s+(.+)$/.exec(riga);
    if (t) {
      cur = { nome: t[1].trim(), durata: 20, breve: 0, preparazione: null, ripristino: 0, sale: 'tutte', eccezioni: [], apparecchi: [], medici: null, senzaMedico: false, nota: '', stato: 'proposta' };
      fuori.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = /^[-*]\s*`?([^:`]+)`?\s*:\s*(.*)$/.exec(riga);
    if (!m) continue;
    const chiave = m[1].trim().toLowerCase(), valore = m[2].trim();
    switch (chiave) {
      case 'durata': cur.durata = num(valore, 20); break;
      case 'breve': cur.breve = num(valore, 0); break;
      case 'ripristino': cur.ripristino = num(valore, 0); break;
      case 'nota': cur.nota = valore; break;
      case 'stato': cur.stato = valore.toLowerCase(); break;
      case 'apparecchi': cur.apparecchi = /^nessun/i.test(valore) ? [] : lista(valore); break;
      case 'medici': cur.medici = /^tutti/i.test(valore) ? null : lista(valore); break;
      case 'medico': cur.senzaMedico = /non serve|nessuno/i.test(valore); break;
      case 'preparazione': {
        if (/^nessun/i.test(valore)) { cur.preparazione = null; break; }
        // «pressione e peso, 3 minuti, assistente»: il nome è tutto quel che
        // sta prima del pezzo coi minuti; il ruolo è l'ultimo pezzo.
        const pezzi = lista(valore);
        const iMin = pezzi.findIndex((x) => /\d+\s*min/i.test(x));
        const minuti = iMin >= 0 ? num(pezzi[iMin], 5) : 5;
        const nome = (iMin > 0 ? pezzi.slice(0, iMin) : pezzi.slice(0, 1)).join(', ');
        const ruolo = pezzi.length > iMin + 1 && iMin >= 0 ? pezzi[pezzi.length - 1] : 'assistente';
        cur.preparazione = { nome, minuti, ruolo: ruolo.toLowerCase() };
        break;
      }
      case 'sale': {
        if (/^tutte/i.test(valore)) { cur.sale = 'tutte'; break; }
        const sale: string[] = [];
        for (const voce of lista(valore)) {
          const e = /^(.+?)\s*\(\s*(.+?)\s*\)\s*$/.exec(voce);
          if (e) cur.eccezioni.push({ sala: e[1].trim(), chi: e[2].trim() });
          else sale.push(voce);
        }
        cur.sale = sale;
        break;
      }
    }
  }
  return fuori;
}

// Le stanze che una persona ha in esclusiva («Sempre e solo»): sue e di
// nessun altro. `soloIn` le mette insieme alle «Solo in»; qui servono
// separate, perché l'esclusiva toglie la stanza a tutti gli altri.
export function esclusive(markdownSale: string): SoloIn[] {
  const fuori: SoloIn[] = [];
  for (const grezza of String(markdownSale ?? '').split('\n')) {
    const riga = grezza.trim();
    if (riga.startsWith('## ')) break;
    const m = /^[-*]\s*sempre e solo\s*:\s*(.+)$/i.exec(riga);
    if (!m) continue;
    for (const voce of m[1].split(',')) {
      const v = /^(.+?)\s+in\s+(.+)$/i.exec(voce.trim());
      if (v) fuori.push({ chi: v[1].trim(), stanze: [v[2].trim()] });
    }
  }
  return fuori;
}

export type Grafo = {
  stanze: Sala[];
  prestazioni: Prestazione[];
  vincoli: SoloIn[];            // Solo in + Sempre e solo
  esclusive: SoloIn[];
  fuoriPersone: string[];
  fuoriAgende: string[];
  fuoriPrestazioni: PrestazioneFuori[];
  distanze: Record<string, number>;   // "Sala 1|Sala 2" → secondi
  distanzaDefault: number;
  sostituibili: { medico: string; sostituto: string; prestazioni: string[] }[];
};

export function costruisciGrafo(opz: {
  mdSale: string; mdPrestazioni: string;
  distanze?: { da: string; a: string; secondi: number }[]; distanzaDefault?: number;
  sostituibili?: { medico: string; sostituto: string; prestazioni: string[] }[];
}): Grafo {
  const distanze: Record<string, number> = {};
  for (const d of opz.distanze ?? []) { distanze[`${d.da}|${d.a}`] = d.secondi; distanze[`${d.a}|${d.da}`] = d.secondi; }
  return {
    stanze: leggiSale(opz.mdSale),
    prestazioni: leggiPrestazioni(opz.mdPrestazioni),
    vincoli: soloIn(opz.mdSale),
    esclusive: esclusive(opz.mdSale),
    fuoriPersone: fuoriDalPiano(opz.mdSale),
    fuoriAgende: agendeFuoriPiano(opz.mdSale),
    fuoriPrestazioni: prestazioniFuoriPiano(opz.mdSale),
    distanze,
    distanzaDefault: opz.distanzaDefault ?? 60,
    sostituibili: opz.sostituibili ?? [],
  };
}

// Confronto di nomi come nel resto del file sale.ts: senza titoli, senza
// accenti, nome e cognome in qualsiasi ordine, e un pezzo che contiene l'altro.
export function stessaPersona(a: string, b: string): boolean {
  const n = (x: string) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(dr|dr\.ssa|prof|med|ssa)\b\.?/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).sort().join(' ');
  const x = n(a), y = n(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function prestazioneDi(g: Grafo, nome: string): Prestazione | undefined {
  const n = String(nome ?? '').trim().toLowerCase();
  return g.prestazioni.find((p) => p.nome.toLowerCase() === n);
}

export function medicoAbilitato(g: Grafo, medico: string, prestazione: string): boolean {
  const p = prestazioneDi(g, prestazione);
  if (!p || !p.medici) return true;
  return p.medici.some((m) => stessaPersona(m, medico));
}

// Le stanze in cui QUESTO appuntamento può avvenire: quelle della
// prestazione, intersecate con quelle ammesse al medico, meno quelle che
// un altro ha in esclusiva. Vuoto = non si può collocare, e va detto.
export function salePossibili(g: Grafo, medico: string, prestazione: string): string[] {
  const tutte = g.stanze.map((s) => s.nome);
  const p = prestazioneDi(g, prestazione);
  let dellaPrestazione = tutte;
  if (p && p.sale !== 'tutte') {
    dellaPrestazione = [...p.sale];
    for (const e of p.eccezioni) if (stessaPersona(e.chi, medico)) dellaPrestazione.push(e.sala);
  }
  const escl = g.esclusive.find((x) => stessaPersona(x.chi, medico));
  const vincolo = g.vincoli.find((x) => stessaPersona(x.chi, medico));
  const altruiEsclusive = new Set(g.esclusive.filter((x) => !stessaPersona(x.chi, medico)).flatMap((x) => x.stanze.map((s) => s.toLowerCase())));
  return tutte.filter((s) => {
    if (!dellaPrestazione.some((x) => x.toLowerCase() === s.toLowerCase())) return false;
    if (escl) return escl.stanze.some((x) => x.toLowerCase() === s.toLowerCase());
    if (altruiEsclusive.has(s.toLowerCase())) return false;
    return stanzaAmmessa(s, vincolo);
  });
}

// La stanza «sua» per regola (riga `Di:` in Medici/Sale): nel nuovo motore
// non è un vincolo, è una PREFERENZA — il medico è mobile, ma se la sua
// stanza è libera si preferisce quella.
export function salaPreferita(g: Grafo, medico: string): string | null {
  const s = g.stanze.find((x) => x.di && x.di !== 'condivisa' && stessaPersona(x.di, medico));
  return s ? s.nome : null;
}

export function distanzaSecondi(g: Grafo, a: string | null | undefined, b: string): number {
  if (!a || a.toLowerCase() === b.toLowerCase()) return 0;
  return g.distanze[`${a}|${b}`] ?? g.distanze[`${b}|${a}`] ?? g.distanzaDefault;
}

// Un appuntamento entra nel piano? No se la persona, l'agenda o la
// prestazione sono fuori dal piano (stesse regole di oggi, stessa pagina).
export function entraNelPiano(g: Grafo, a: { medico: string; prestazione: string; agenda: string }): boolean {
  const ag = String(a.agenda ?? '').trim().toLowerCase();
  if (ag && g.fuoriAgende.some((x) => x.trim().toLowerCase() === ag)) return false;
  if (a.medico && g.fuoriPersone.some((x) => stessaPersona(x, a.medico))) return false;
  const pr = String(a.prestazione ?? '').trim().toLowerCase();
  if (pr) {
    for (const f of g.fuoriPrestazioni) {
      if (f.nome.trim().toLowerCase() !== pr) continue;
      if (!f.tranne.some((t) => stessaPersona(t, a.medico))) return false;
    }
  }
  return true;
}
