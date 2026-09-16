// Gli stati di paziente, sala e medico, e la rigidità (16.9.2026, §3 e §5.4).
//
// La macchina a stati è stretta apposta: una transizione non ammessa viene
// rifiutata e diventa un'anomalia, non si «aggiusta». L'unica freccia
// all'indietro — richiamare un paziente già chiamato — la può tirare solo
// una persona, mai il sistema.

import type { Parametri } from './parametri';

export const STATI_PAZIENTE = [
  'atteso', 'arrivato', 'in_attesa', 'chiamato', 'in_preparazione', 'pronto',
  'in_visita', 'visita_finita', 'dimesso', 'assente', 'annullato',
] as const;
export type StatoPaziente = typeof STATI_PAZIENTE[number];

export const STATI_SALA = ['libera', 'riservata', 'in_preparazione', 'occupata_pronto', 'occupata_visita', 'da_ripristinare', 'bloccata', 'fuori_servizio'] as const;
export type StatoSala = typeof STATI_SALA[number];

export const STATI_MEDICO = ['assente', 'disponibile', 'in_visita', 'in_spostamento', 'in_pausa', 'fermo_in_sala'] as const;
export type StatoMedico = typeof STATI_MEDICO[number];

// La rigidità che uno stato porta con sé (§3.1).
const RIGIDITA_STATO: Record<StatoPaziente, number> = {
  atteso: 0, arrivato: 0, in_attesa: 0, chiamato: 2, in_preparazione: 3, pronto: 3,
  in_visita: 3, visita_finita: 3, dimesso: 3, assente: 0, annullato: 0,
};
export function rigiditaDaStato(s: StatoPaziente): number { return RIGIDITA_STATO[s] ?? 0; }

// Da chi può venire una transizione: 'sistema' (il motore), 'persona'
// (tablet, pulsante, comando), 'robot' (MediOnline), 'dettato' (audio).
export type Fonte = 'sistema' | 'persona' | 'robot' | 'dettato';

const AMMESSE: Record<StatoPaziente, Partial<Record<StatoPaziente, Fonte[]>>> = {
  atteso:          { arrivato: ['persona', 'robot'], assente: ['persona', 'sistema'], annullato: ['robot', 'persona'], in_visita: ['robot'] },
  arrivato:        { in_attesa: ['persona'], chiamato: ['sistema', 'persona'], assente: ['persona'], in_visita: ['robot', 'persona'] },
  in_attesa:       { chiamato: ['sistema', 'persona'], assente: ['persona'], in_visita: ['robot', 'persona'] },
  chiamato:        { in_preparazione: ['persona'], pronto: ['persona'], in_visita: ['persona', 'robot'], in_attesa: ['persona'] },
  in_preparazione: { pronto: ['persona'], in_visita: ['persona', 'robot'] },
  pronto:          { in_visita: ['persona', 'robot'] },
  in_visita:       { visita_finita: ['persona', 'dettato', 'robot'], dimesso: ['persona', 'robot'] },
  visita_finita:   { dimesso: ['persona', 'robot'] },
  dimesso:         {},
  assente:         { arrivato: ['persona'] },
  annullato:       {},
};

export function transizioneAmmessa(da: StatoPaziente, a: StatoPaziente, fonte: Fonte): boolean {
  const f = AMMESSE[da]?.[a];
  return !!f && f.includes(fonte);
}

// La rigidità dal tempo che manca all'inizio stimato (§5.4).
export function rigiditaDalTempo(inizioStimato: number | null | undefined, adesso: number, p: Parametri): number {
  if (inizioStimato == null) return 0;
  const manca = inizioStimato - adesso;
  if (manca <= p.congela_entro_min) return 3;
  if (manca <= p.stanza_fissa_entro_min) return 2;
  if (manca <= p.costoso_entro_min) return 1;
  return 0;
}

export function rigidita(stato: StatoPaziente, inizioStimato: number | null | undefined, adesso: number, p: Parametri, imposta = 0): number {
  return Math.max(rigiditaDaStato(stato), rigiditaDalTempo(inizioStimato, adesso, p), imposta);
}

// Lo stato di una sala si RICAVA da chi c'è dentro, non si tiene a parte:
// così non può divergere.
export function statoSala(opz: {
  bloccata?: boolean; fuoriServizio?: boolean; daRipristinare?: boolean;
  dentro: { stato: StatoPaziente }[]; riservata?: boolean;
}): StatoSala {
  if (opz.fuoriServizio) return 'fuori_servizio';
  if (opz.bloccata) return 'bloccata';
  const s = opz.dentro.map((x) => x.stato);
  if (s.includes('in_visita')) return 'occupata_visita';
  if (s.includes('pronto') || s.includes('visita_finita')) return 'occupata_pronto';
  if (s.includes('in_preparazione') || s.includes('chiamato')) return 'in_preparazione';
  if (opz.daRipristinare) return 'da_ripristinare';
  if (opz.riservata) return 'riservata';
  return 'libera';
}

// Il tipo di evento e la transizione che produce (§7).
export type TipoEvento =
  | 'paziente_arrivato' | 'paziente_accolto' | 'paziente_in_ritardo' | 'paziente_assente' | 'paziente_chiamato' | 'paziente_richiamato'
  | 'preparazione_iniziata' | 'pronto' | 'visita_iniziata' | 'visita_quasi_finita' | 'visita_finita' | 'dimesso'
  | 'medico_in_ritardo' | 'sala_libera' | 'sala_occupata' | 'sala_fuori_servizio' | 'sala_ripristinata' | 'apparecchio_indisponibile'
  | 'urgenza' | 'appuntamento_aggiunto' | 'appuntamento_annullato' | 'anomalia';

export const TRANSIZIONE_DI_EVENTO: Partial<Record<TipoEvento, StatoPaziente>> = {
  paziente_arrivato: 'arrivato', paziente_accolto: 'in_attesa', paziente_assente: 'assente',
  paziente_chiamato: 'chiamato', paziente_richiamato: 'in_attesa',
  preparazione_iniziata: 'in_preparazione', pronto: 'pronto', visita_iniziata: 'in_visita',
  visita_finita: 'visita_finita', dimesso: 'dimesso', appuntamento_annullato: 'annullato',
};

// Gli eventi che fanno ripartire il solver (§7). Gli altri aggiornano lo
// stato e basta.
export const RIPIANIFICA: Set<TipoEvento> = new Set([
  'paziente_arrivato', 'paziente_in_ritardo', 'paziente_assente', 'visita_iniziata', 'visita_quasi_finita', 'visita_finita',
  'medico_in_ritardo', 'sala_libera', 'sala_occupata', 'sala_fuori_servizio', 'sala_ripristinata', 'apparecchio_indisponibile',
  'urgenza', 'appuntamento_aggiunto', 'appuntamento_annullato',
]);

// Il ritardo accumulato di un medico: quanto la visita in corso sta durando
// oltre la stima, più il residuo che si porta dietro dalle precedenti.
export function ritardoMedico(opz: { inVisita: boolean; inizioReale?: number | null; durataStimata?: number; residuo: number; adesso: number }): number {
  let r = Math.max(0, opz.residuo);
  if (opz.inVisita && opz.inizioReale != null && opz.durataStimata != null) {
    r += Math.max(0, opz.adesso - (opz.inizioReale + opz.durataStimata));
  }
  return r;
}
