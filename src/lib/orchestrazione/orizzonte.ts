// L'orizzonte mobile, il blocco, le soglie (16.9.2026, §8, §10, §12).
//
// Il sistema ripianifica solo il futuro vicino. Oltre, gli appuntamenti si
// spostano tutti insieme del ritardo residuo del loro medico, senza cambiare
// stanza né ordine: entrano nell'orizzonte a mano a mano che il tempo passa e
// lì vengono ripianificati davvero. È questo che impedisce di riscrivere la
// giornata a ogni evento.

import type { Parametri } from './parametri';
import type { Pianificata, Piano, VisitaDaPianificare } from './riparatore';

export function dentroOrizzonte(v: { inizio?: number | null; teorica: number; stato?: string }, adesso: number, p: Parametri): boolean {
  if (v.stato && ['dimesso', 'assente', 'annullato'].includes(v.stato)) return false;
  const t = v.inizio ?? v.teorica;
  return t <= adesso + p.orizzonte_min;
}

// Il ritardo che un medico si porta oltre l'orizzonte: quanto l'ultima sua
// visita dentro l'orizzonte comincia dopo l'ora teorica.
export function ritardoResiduo(piano: Piano, richieste: VisitaDaPianificare[], medico: string): number {
  const seq = piano.sequenze[medico] ?? [];
  const ultima = seq[seq.length - 1];
  if (!ultima) return 0;
  const r = richieste.find((v) => v.id === ultima.id);
  return r ? Math.max(0, ultima.inizio - r.teorica) : 0;
}

// Fuori dall'orizzonte: tutto slitta a blocco, stanza e ordine invariati.
export function spostaABlocco(fuori: Pianificata[], residuoPerMedico: Record<string, number>, medicoDi: (id: string) => string): Pianificata[] {
  return fuori.map((v) => {
    const d = residuoPerMedico[medicoDi(v.id)] ?? 0;
    if (!d) return v;
    return { ...v, ingresso: v.ingresso + d, inizio: v.inizio + d, fine: v.fine + d, perche: { ...v.perche, aBlocco: d } };
  });
}

// Quanto un cambiamento conta per le persone (§8.4).
export type Livello = 'silenzio' | 'mappa' | 'accoglienza';
export function livelloComunicazione(deltaMin: number, cambioStanza: boolean, p: Parametri): Livello {
  const d = Math.abs(deltaMin);
  if (cambioStanza || d > p.soglia_accoglienza_min) return 'accoglienza';
  if (d >= p.soglia_comunicazione_min) return 'mappa';
  return 'silenzio';
}

// L'ingresso intelligente (§10): si chiama il paziente quando il medico è a
// meno di `anticipo` minuti; se il medico è lontano più di `attesa_in_sala_max`
// il paziente resta in sala d'attesa e la stanza non si occupa.
export function decidiIngresso(opz: {
  arrivoMedico: number; adesso: number; prep: number; pazienteArrivato: boolean; stanzaLibera: boolean; assistenteLibero: boolean;
}, p: Parametri): { azione: 'chiama' | 'attendi' | 'non_ancora'; quando: number; perche: string } {
  const entra = opz.arrivoMedico - Math.max(p.anticipo_ingresso_min, opz.prep);
  const manca = opz.arrivoMedico - opz.adesso;
  if (manca > p.attesa_in_sala_max_min) return { azione: 'attendi', quando: entra, perche: `il medico arriva fra ${manca} minuti: resta in sala d'attesa, la stanza non si occupa` };
  if (!opz.pazienteArrivato) return { azione: 'non_ancora', quando: entra, perche: 'il paziente non è ancora arrivato' };
  if (!opz.stanzaLibera) return { azione: 'non_ancora', quando: entra, perche: 'la stanza non è ancora libera' };
  if (opz.prep > 0 && !opz.assistenteLibero) return { azione: 'non_ancora', quando: entra, perche: 'nessun assistente libero per la preparazione' };
  if (opz.adesso >= entra) return { azione: 'chiama', quando: opz.adesso, perche: `il medico arriva fra ${Math.max(0, manca)} minuti` };
  return { azione: 'non_ancora', quando: entra, perche: `si chiama alle ${hm(entra)}` };
}

export const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
export const min = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

// Serve davvero ripianificare per questo ritardo? Solo ogni `passo_ritardo`
// minuti: un solver che gira a ogni minuto di ritardo produce piani che
// cambiano di un minuto, e nessuno li vuole.
export function ritardoDaRipianificare(ritardo: number, ultimoRipianificatoA: number, p: Parametri): boolean {
  return ritardo - ultimoRipianificatoA >= p.passo_ritardo_min;
}
