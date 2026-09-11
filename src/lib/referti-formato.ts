import 'server-only';
import { query } from './db';
import { applicaPiano, pianoAnonimizzazione } from './anonimizza';
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
    // Lettera tipo e regole di forma dalla wiki Agenti/<medico> (2026-09-12),
    // pubblicate dal servizio col profilo. REFERTO_STRUTTURA_ESEMPI=0 spegne
    // anche queste.
    letteraTipo: process.env.REFERTO_STRUTTURA_ESEMPI !== '0' && profilo?.lettera_tipo ? profilo.lettera_tipo : undefined,
    regole: process.env.REFERTO_STRUTTURA_ESEMPI !== '0' && profilo?.regole_forma?.length ? profilo.regole_forma : undefined,
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
  // Esempi di forma (11.9.2026): le ultime due lettere confermate e già
  // impaginate dello STESSO medico (qualunque paziente), pseudonimizzate
  // dal piano locale e senza blocco terapia né firma. Il modello
  // dell'impaginazione gira in locale: nulla esce dal Mac. Best-effort,
  // REFERTO_STRUTTURA_ESEMPI=0 spegne.
  if (process.env.REFERTO_STRUTTURA_ESEMPI !== '0' && medico?.id) {
    try { opzioni.esempi = await esempiDiForma(studioId, bozzaId, String(medico.id), profilo?.chiusura); } catch { opzioni.esempi = undefined; }
  }
  return { formato, opzioni, terapiaRipresa, terapia: fusa.righe.length || fusa.sospese.length || fusa.avvisi.length ? fusa : null };
}

// Le ultime lettere confermate e impaginate dello stesso medico, ridotte
// alla forma: via il blocco «Terapia:» e le righe dopo la chiusura (la
// firma), poi pseudonimizzate col piano locale (gemma3:12b + regex), max
// 1800 caratteri l'una. Mai contenuti nei log.
export async function esempiDiForma(studioId: string, bozzaId: string, medicoId: string, chiusura?: string | null, quante = 2): Promise<string[]> {
  const righe = await query<{ testo_finale: string }>(
    `select testo_finale from referti_bozze
      where studio_id = $1 and id <> $2 and stato = 'confermata' and tipo = 'referto'
        and testo_finale is not null and coalesce((payload->>'ombra')::boolean, false) = false
        and payload->'medico'->>'id' = $3 and payload ? 'riorganizzazione'
      order by reviewed_at desc limit $4`,
    [studioId, bozzaId, medicoId, quante]
  );
  const fuori: string[] = [];
  for (const r of righe) {
    const t = soloForma(r.testo_finale, chiusura);
    if (!t) continue;
    const piano = await pianoAnonimizzazione(t);
    const [pseudo] = applicaPiano(t, piano);
    fuori.push(pseudo.slice(0, 1800));
  }
  return fuori;
}

export function soloForma(lettera: string, chiusura?: string | null): string {
  const righe = lettera.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inTerapia = false;
  for (const r of righe) {
    const t = r.trim();
    if (/^terapia(\s+domiciliare)?\s*:?\s*$/i.test(t)) { inTerapia = true; continue; }
    if (inTerapia) { if (!t) inTerapia = false; continue; }
    out.push(r);
    const chiusa = (chiusura && t.toLowerCase() === chiusura.trim().toLowerCase()) || /^(cordiali|con i migliori|distinti|un caro saluto)/i.test(t);
    if (chiusa) break;
  }
  return out.join('\n').trim();
}
