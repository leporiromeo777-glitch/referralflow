import 'server-only';
import { formatoPerBozza, profiloMedico, type FormatoReferto } from './referti-medici';
import { estraiTerapia, letteraPrecedente, terapiaInvariata } from './referti-lettera';
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
): Promise<{ formato: FormatoReferto; opzioni: OpzioniLettera; terapiaRipresa: boolean }> {
  const medico = payload?.medico ?? null;
  const formato = await formatoPerBozza(studioId, medico);
  if (formato !== 'lettera') return { formato, opzioni: {}, terapiaRipresa: false };
  const profilo = await profiloMedico(studioId, medico?.id);
  const opzioni: OpzioniLettera = {
    chiusura: profilo?.chiusura || undefined,
    firma: profilo?.firma?.length ? profilo.firma : undefined,
  };
  let terapiaRipresa = false;
  if (terapiaInvariata(testo)) {
    const campi = { ...(payload?.campi_estratti ?? {}), ...(campiConfermati ?? {}) } as Record<string, unknown>;
    const prec = await letteraPrecedente(studioId, bozzaId, campi);
    const terapia = prec ? estraiTerapia(prec.testo) : [];
    if (terapia.length) {
      opzioni.terapia = terapia;
      terapiaRipresa = true;
    }
  }
  return { formato, opzioni, terapiaRipresa };
}
