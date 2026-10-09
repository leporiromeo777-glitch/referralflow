// Chi vede che cosa (23.9.2026). Decisione dello studio: ogni ruolo vede le
// sezioni del suo lavoro, e la home è diversa per ruolo. Il tecnico (chi tiene
// in piedi il sistema) vede tutto. UNA tabella sola: la usano il menu
// dell'interfaccia (arriva con /api/prototipo/dati) e le rotte del server,
// così una voce nascosta non resta raggiungibile scrivendo l'indirizzo.
// Puro: niente DB, niente sessione.
import { NextResponse } from 'next/server';

export const SEZIONI = [
  'agenda', 'visite', 'richiami', 'sale', 'prestazioni', 'invianti', 'patients', 'percorsi',
  'documents', 'dividi', 'moduli', 'imaging', 'monitoraggio', 'pressione', 'reports', 'dittafono', 'converti', 'anonymize', 'inbox', 'ai',
  'fatturazione', 'administration',
] as const;
export type Sezione = (typeof SEZIONI)[number];

// 'monitoraggio' (6.10.2026): la sezione la vede chi cura; dentro, quattro capacità
// distinte (consultare, prendere in carico, regole, dispositivi) in monitoraggio/catalogo.ts.
// 'pressione' (7.10.2026): il profilo pressorio delle 24 ore; chi fa che cosa dentro sta in pressione/archivio.ts (PUO_PA).
// 'dividi' (9.10.2026): da un PDF unico con tutta la cartella ai singoli documenti; la vede chi lavora sulle cartelle.
const CURA: Sezione[] = ['agenda', 'visite', 'richiami', 'sale', 'patients', 'percorsi', 'documents', 'dividi', 'moduli', 'imaging', 'monitoraggio', 'pressione', 'inbox', 'ai'];
const SEGRETERIA: Sezione[] = [...CURA, 'prestazioni', 'invianti', 'reports', 'converti', 'anonymize', 'fatturazione'];

// Ruoli del database (users.role).
export const SEZIONI_RUOLO: Record<string, readonly Sezione[]> = {
  medico: [...CURA, 'reports', 'dittafono'],
  assistente: [...CURA, 'dittafono'],
  segretaria: SEGRETERIA,
  admin: [...SEGRETERIA, 'administration'],
  tecnico: SEZIONI,
};

export function sezioniDi(ruolo: string | null | undefined): Sezione[] {
  const s = ruolo ? SEZIONI_RUOLO[ruolo] : undefined;
  // Ordine fisso (quello di SEZIONI), qualunque sia l'ordine nella tabella.
  return s ? SEZIONI.filter((x) => s.includes(x)) : [];
}

export function puo(ruolo: string | null | undefined, sezione: Sezione): boolean {
  return sezioniDi(ruolo).includes(sezione);
}

// Per le rotte: null se si può, altrimenti la risposta 403 da restituire.
export function vietato(ruolo: string | null | undefined, ...sezioni: Sezione[]): NextResponse | null {
  return sezioni.some((s) => puo(ruolo, s)) ? null : NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
}
