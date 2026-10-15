import 'server-only';
import { lettereDelPazienteScelto } from './aggiorna-lettera-server';
import { logDocumento } from './cartella';
import { query } from './db';
import { corpoDellaLettera, letteraFinoA, NOME_PARTE, partiDellaLettera, type Comando, type ParteLettera } from './dittafono-comandi';

// I comandi a voce del dittafono, lato server (12.10.2026, [[Piattaforma/Dittafono]]): il pezzo chiesto, preso dalla
// lettera più recente del paziente — la stessa ricerca di «Aggiorna una lettera vecchia» (referti confermati, lettere
// in cartella, lettere dentro le cartelle scansionate), partendo dal paziente scelto. Tutto in studio: nessun modello,
// nessun fornitore. Nei log niente testo; la lettura di un documento della cartella va nel registro accessi.

// `apri`: la lettera da cui viene il pezzo, da mostrare ACCANTO al foglio (12.10.2026, richiesta dello studio): il PDF
// alle sue pagine se è una scansione, se no il testo della lettera intera.
// `docx` (15.10.2026, dallo studio: «mi apre un testo, non la lettera vera»): la lettera è un Word — per un referto della
// piattaforma quello con la carta intestata, lo stesso che si scarica — e la pagina lo disegna com'è.
export type DaAprire = { tipo: 'referto' | 'documento' | 'pagine'; id: string; pdf: boolean; docx: boolean; da: number | null; a: number | null; testo: string };
export type EsitoComando = { ok: true; testo: string; fonte: string; data: string; cosa: string; mancanti: string[]; apri: DaAprire } | { errore: string };
const TETTO = 20000;

export async function eseguiComando(studioId: string, userId: string | null, patientId: string, comando: Comando, parti: ParteLettera[] = [], esclusa = false): Promise<EsitoComando> {
  const [p] = await query<{ cognome: string; nome: string }>('select cognome, nome from patients where id = $1 and studio_id = $2', [patientId, studioId]);
  if (!p) return { errore: 'Paziente non trovato.' };
  const lettere = await lettereDelPazienteScelto(studioId, patientId, `${p.cognome} ${p.nome}`.trim());
  if (!lettere.length) return { errore: 'Nella cartella di questo paziente non trovo lettere.' };
  const letta = async (l: (typeof lettere)[number]) => {
    if (l.fonte.tipo !== 'referto') await logDocumento(l.fonte.id, 'lettura', { studioId, userId: userId ?? undefined, dettaglio: 'dittafono, comando a voce' }).catch(() => {});
  };
  const daAprire = async (l: (typeof lettere)[number]): Promise<DaAprire> => {
    let pdf = l.fonte.tipo === 'pagine', docx = l.fonte.tipo === 'referto';
    if (l.fonte.tipo === 'documento') { const [f] = await query<{ filename: string }>('select filename from patient_documents where id = $1 and studio_id = $2', [l.fonte.id, studioId]); const n = (f?.filename ?? '').toLowerCase(); pdf = n.endsWith('.pdf'); docx = n.endsWith('.docx'); }
    return { tipo: l.fonte.tipo, id: l.fonte.id, pdf, docx, da: l.fonte.da ?? null, a: l.fonte.a ?? null, testo: l.testo.replace(/\r\n?/g, '\n').trim().slice(0, 40000) };
  };
  if (comando === 'lettera_recente') {
    const l = lettere[0];
    const testo = corpoDellaLettera(l.testo).slice(0, TETTO);
    if (!testo) return { errore: 'La lettera più recente è vuota.' };
    await letta(l);
    return { ok: true, testo, fonte: l.fonte.etichetta, data: l.fonte.data, cosa: 'la lettera', mancanti: [], apri: await daAprire(l) };
  }
  // «Fino a…»: dalla lettera più recente — «la lettera» è quella (15.10.2026: prenderne una più vecchia senza dirlo
  // confonde). Se lì quella parte non è una parte a sé (per esempio i fattori di rischio citati dentro il racconto),
  // lo dice: dove fermarsi non si indovina.
  if (comando === 'fino') {
    const parte = parti[0];
    if (!parte) return { errore: 'Non ho capito fino a quale parte della lettera.' };
    const cosa = `la lettera fino ${esclusa ? 'a prima di' : 'a'} ${NOME_PARTE[parte]}${esclusa ? '' : ' compresa'}`;
    const l = lettere[0];
    const testo = letteraFinoA(l.testo, parte, esclusa).slice(0, TETTO);
    if (!testo) return { errore: `Nella lettera più recente (${l.fonte.data}) ${NOME_PARTE[parte]} non è una parte a sé${parte === 'frcv' || parte === 'comorbidita' ? ` (con «${NOME_PARTE[parte]}:» a inizio riga)` : ''}: non so dove fermarmi. Chiedi la lettera intera, o fino a un'altra parte.` };
    await letta(l);
    return { ok: true, testo, fonte: l.fonte.etichetta, data: l.fonte.data, cosa, mancanti: [], apri: await daAprire(l) };
  }
  // Le parti chieste: dalla più recente fra le ultime quattro lettere che ne ha almeno una (un biglietto può non
  // averne nessuna). Tutte dalla STESSA lettera: quelle che lì non ci sono vengono dette, non cercate altrove.
  if (!parti.length) return { errore: 'Non ho capito quale parte della lettera.' };
  for (const l of lettere.slice(0, 4)) {
    const sue = partiDellaLettera(l.testo);
    const trovate = parti.filter((k) => sue[k]);
    if (!trovate.length) continue;
    await letta(l);
    return {
      ok: true, testo: trovate.map((k) => sue[k]).join('\n\n').slice(0, TETTO), fonte: l.fonte.etichetta, data: l.fonte.data,
      cosa: trovate.map((k) => NOME_PARTE[k]).join(', '), mancanti: parti.filter((k) => !sue[k]).map((k) => NOME_PARTE[k]), apri: await daAprire(l),
    };
  }
  return { errore: `Nelle ultime lettere di questo paziente non trovo: ${parti.map((k) => NOME_PARTE[k]).join(', ')}.` };
}
