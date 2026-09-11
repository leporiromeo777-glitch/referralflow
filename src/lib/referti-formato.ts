import 'server-only';
import { formatoPerBozza, profiloMedico, type FormatoReferto } from './referti-medici';
import { estraiTerapia, letteraPrecedente } from './referti-lettera';
import { dettatoConTerapia, fondiTerapia, terapiaInvariata, type TerapiaFusa } from './referti-terapia';
import type { OpzioniLettera } from './referto-struttura';

// Tutto ciò che serve al bottone «Riorganizza / Impagina come lettera» per
// una bozza: il formato del medico e, nella forma lettera, saluto e firma
// dal profilo più il blocco terapia dalla lettera precedente del paziente
// (solo se il dettato dice che la terapia è invariata: il medico non la
// ridetta, la segretaria la ricopiava dalla lettera prima).
export async function opzioniRiorganizzazione(
  studioId: string,
  bozzaId: string,
  payload: any,
  campiConfermati: Record<string, unknown> | null,
  testo: string
): Promise<{ formato: FormatoReferto; opzioni: OpzioniLettera; terapiaRipresa: boolean; terapia: TerapiaFusa | null }> {
  const medico = payload?.medico ?? null;
  const formato = await formatoPerBozza(studioId, medico);
  if (formato !== 'lettera') return { formato, opzioni: {}, terapiaRipresa: false, terapia: null };
  const profilo = await profiloMedico(studioId, medico?.id);
  const opzioni: OpzioniLettera = {
    chiusura: profilo?.chiusura || undefined,
    firma: profilo?.firma?.length ? profilo.firma : undefined,
  };
  // Terapia della lettera (11.9.2026, secondo tempo): la terapia STRUTTURATA
  // dal dettato (tappa «terapia» della catena) fusa con il blocco della
  // lettera precedente del paziente — il medico detta spesso solo le
  // modifiche. Senza dettato sulla terapia vale la regola di prima: si
  // riprende la precedente quando il dettato dice «invariata» o non
  // contiene farmaci con dosaggio. Fusione nel codice: `fondiTerapia`.
  const dettata = payload?.terapia && typeof payload.terapia === 'object' ? payload.terapia : null;
  const servePrecedente = !!dettata || terapiaInvariata(testo) || !dettatoConTerapia(testo);
  let precedenti: string[] = [];
  if (servePrecedente) {
    const campi = { ...(payload?.campi_estratti ?? {}), ...(campiConfermati ?? {}) } as Record<string, unknown>;
    const prec = await letteraPrecedente(studioId, bozzaId, campi);
    precedenti = prec ? estraiTerapia(prec.testo) : [];
  }
  const fusa = fondiTerapia(precedenti, dettata, testo);
  if (fusa.righe.length) opzioni.terapia = fusa.righe.map((r) => r.riga);
  const terapiaRipresa = fusa.righe.some((r) => r.fonte === 'precedente');
  return { formato, opzioni, terapiaRipresa, terapia: fusa.righe.length || fusa.sospese.length || fusa.avvisi.length ? fusa : null };
}
