import 'server-only';
import { lettereDelPazienteScelto } from './aggiorna-lettera-server';
import { logDocumento } from './cartella';
import { query } from './db';
import { corpoDellaLettera, terapiaDellaLettera, type Comando } from './dittafono-comandi';

// I comandi a voce del dittafono, lato server (12.10.2026, [[Piattaforma/Dittafono]]): il pezzo chiesto, preso dalla
// lettera più recente del paziente — la stessa ricerca di «Aggiorna una lettera vecchia» (referti confermati, lettere
// in cartella, lettere dentro le cartelle scansionate), partendo dal paziente scelto. Tutto in studio: nessun modello,
// nessun fornitore. Nei log niente testo; la lettura di un documento della cartella va nel registro accessi.

export type EsitoComando = { ok: true; testo: string; fonte: string; data: string } | { errore: string };
const TETTO = 20000;

export async function eseguiComando(studioId: string, userId: string | null, patientId: string, comando: Comando): Promise<EsitoComando> {
  const [p] = await query<{ cognome: string; nome: string }>('select cognome, nome from patients where id = $1 and studio_id = $2', [patientId, studioId]);
  if (!p) return { errore: 'Paziente non trovato.' };
  const lettere = await lettereDelPazienteScelto(studioId, patientId, `${p.cognome} ${p.nome}`.trim());
  if (!lettere.length) return { errore: 'Nella cartella di questo paziente non trovo lettere.' };
  const letta = async (l: (typeof lettere)[number]) => {
    if (l.fonte.tipo !== 'referto') await logDocumento(l.fonte.id, 'lettura', { studioId, userId: userId ?? undefined, dettaglio: 'dittafono, comando a voce' }).catch(() => {});
  };
  if (comando === 'lettera_recente') {
    const l = lettere[0];
    const testo = corpoDellaLettera(l.testo).slice(0, TETTO);
    if (!testo) return { errore: 'La lettera più recente è vuota.' };
    await letta(l);
    return { ok: true, testo, fonte: l.fonte.etichetta, data: l.fonte.data };
  }
  // La terapia: la più recente fra le ultime quattro lettere che ne hanno una (un biglietto può non averla).
  for (const l of lettere.slice(0, 4)) {
    const testo = terapiaDellaLettera(l.testo);
    if (!testo) continue;
    await letta(l);
    return { ok: true, testo, fonte: l.fonte.etichetta, data: l.fonte.data };
  }
  return { errore: 'Nelle ultime lettere di questo paziente non trovo la terapia.' };
}
