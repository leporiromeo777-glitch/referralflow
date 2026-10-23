import 'server-only';
import { pulisciScansione } from './aggiorna-lettera';
import { fmt, lettereDelPazienteScelto, testoDelFile } from './aggiorna-lettera-server';
import { lettereNellePagine } from './cerca-in-cartella';
import { etichettaDocumento } from './referti-allegato-blocco';
import { logDocumento } from './cartella';
import { query } from './db';
import { corpoDellaLettera, finoAlPiuLontano, letteraFinoA, NOME_PARTE, partiDellaLettera, salutoDellaLettera, type Comando, type ParteLettera } from './dittafono-comandi';

// I comandi a voce del dittafono, lato server (12.10.2026, [[Piattaforma/Dittafono]]): il pezzo chiesto, preso dalla
// lettera più recente del paziente — la stessa ricerca di «Aggiorna una lettera vecchia» (referti confermati, lettere
// in cartella, lettere dentro le cartelle scansionate), partendo dal paziente scelto. Tutto in studio: nessun modello,
// nessun fornitore. Nei log niente testo; la lettura di un documento della cartella va nel registro accessi.

// `apri`: la lettera da cui viene il pezzo, da mostrare ACCANTO al foglio (12.10.2026, richiesta dello studio): il PDF
// alle sue pagine se è una scansione, se no il testo della lettera intera.
// `docx` (15.10.2026, dallo studio: «mi apre un testo, non la lettera vera»): la lettera è un Word — per un referto della
// piattaforma quello con la carta intestata, lo stesso che si scarica — e la pagina lo disegna com'è.
export type DaAprire = { tipo: 'referto' | 'documento' | 'pagine'; id: string; pdf: boolean; docx: boolean; da: number | null; a: number | null; testo: string };
// `saluto`: il saluto in testa alla lettera, quando si prende dall'inizio (lettera intera, «fino a…»).
// `indice`/`totale` (21.10.2026): dove sta quella lettera fra le lettere del paziente, dalla più recente — per le frecce.
export type EsitoComando = { ok: true; testo: string; fonte: string; data: string; cosa: string; mancanti: string[]; apri: DaAprire | null; saluto?: string; indice?: number; totale?: number } | { errore: string };
const TETTO = 20000;

// `numero` (21.10.2026): «la lettera numero 2» — la seconda dalla più recente, come numerata accanto al foglio. Con il
// numero si usa solo QUELLA lettera: niente ricerca fra le ultime quattro.
// `ripiego` (22.10.2026): col «fino a…», le parti a cui fermarsi se nella lettera quella chiesta non c'è — il tasto «fino
// alle allergie e intolleranze» si ferma alle comorbidità quando le allergie non ci sono, e ai fattori di rischio quando
// non ci sono neanche le comorbidità. Si prende sempre fino alla più lontana di quelle che ci sono.
// LA LETTERA CHE IL MEDICO STA GUARDANDO (23.10.2026, dallo studio: «non avrebbe più senso che per i comandi prenda la
// lettera che sta guardando in quel momento?»). Accanto al foglio è aperto un documento qualunque — anche la cartella
// cartacea scansionata intera, con dentro lettere, ECG, laboratori — e il medico è alla pagina N: la lettera è quella che
// contiene la pagina N (dalla pagina con la data in testa fino alla prossima lettera), non «la più recente».
type Lettera = { testo: string; fonte: { tipo: 'referto' | 'documento' | 'pagine'; id: string; etichetta: string; data: string; da?: number; a?: number } };
export async function letteraAllaPagina(studioId: string, patientId: string, documentoId: string, pagina: number): Promise<Lettera | { errore: string }> {
  const [d] = await query<{ id: string; filename: string; nota: string | null; storage_key: string }>(
    `select id, filename, nota, storage_key from patient_documents where id = $1 and patient_id = $2 and studio_id = $3`, [documentoId, patientId, studioId]);
  if (!d) return { errore: 'Il documento aperto non è di questo paziente.' };
  const n = d.filename.toLowerCase();
  if (!/\.(pdf|docx|txt)$/.test(n)) return { errore: 'Da questo documento i comandi non leggono il testo (serve un PDF o un Word).' };
  let pagine: string[];
  try { pagine = await testoDelFile(d.storage_key, d.filename); } catch { return { errore: 'Il documento aperto non si legge.' }; }
  const nome = etichettaDocumento(d) || d.filename;
  if (!n.endsWith('.pdf')) return { testo: pagine.join('\n'), fonte: { tipo: 'documento', id: d.id, etichetta: nome, data: '' } };
  const p = Math.min(pagine.length, Math.max(1, Math.round(pagina) || 1));
  const tratto = lettereNellePagine(pagine).find((x) => x.pagina_da <= p && p <= x.pagina_a);
  const da = tratto?.pagina_da ?? p, a = tratto?.pagina_a ?? Math.min(pagine.length, p + 1);
  const testo = pulisciScansione(pagine.slice(da - 1, a).join('\n'));
  if (testo.replace(/\s+/g, '').length < 80) return { errore: `A pagina ${p} non trovo testo: se è una scansione, il Mac non l'ha ancora letta (OCR). Riprova più tardi, o apri una lettera numerata.` };
  return { testo, fonte: { tipo: 'pagine', id: d.id, etichetta: `${nome}, ${da === a ? `p. ${da}` : `pp. ${da}–${a}`}`, data: tratto?.data ? fmt(tratto.data) : '', da, a } };
}

export async function eseguiComando(studioId: string, userId: string | null, patientId: string, comando: Comando, parti: ParteLettera[] = [], esclusa = false, numero: number | null = null, ripiego: ParteLettera[] = [], guardata: { documento: string; pagina: number } | null = null): Promise<EsitoComando> {
  const [p] = await query<{ cognome: string; nome: string }>('select cognome, nome from patients where id = $1 and studio_id = $2', [patientId, studioId]);
  if (!p) return { errore: 'Paziente non trovato.' };
  let lettere: Lettera[];
  if (guardata) {
    const l = await letteraAllaPagina(studioId, patientId, guardata.documento, guardata.pagina);
    if ('errore' in l) return l;
    lettere = [l]; numero = 1;
  } else lettere = await lettereDelPazienteScelto(studioId, patientId, `${p.cognome} ${p.nome}`.trim());
  if (!lettere.length) return { errore: 'Nella cartella di questo paziente non trovo lettere.' };
  if (numero !== null && !lettere[numero - 1]) return { errore: `Non c’è la lettera numero ${numero}: questo paziente ne ha ${lettere.length}${lettere.length === 1 ? '' : ' (da 1, la più recente, a ' + lettere.length + ')'}.` };
  const scelta = numero !== null ? lettere[numero - 1] : lettere[0];
  const quale = guardata ? 'la lettera che stai guardando' : numero !== null ? `la lettera numero ${numero}` : 'la lettera più recente';
  const letta = async (l: (typeof lettere)[number]) => {
    if (l.fonte.tipo !== 'referto') await logDocumento(l.fonte.id, 'lettura', { studioId, userId: userId ?? undefined, dettaglio: 'dittafono, comando a voce' }).catch(() => {});
  };
  const daAprire = async (l: (typeof lettere)[number]) => (guardata ? null : apriDi(studioId, l));
  const dove = (l: (typeof lettere)[number]) => (guardata ? {} : { indice: lettere.indexOf(l), totale: lettere.length });
  if (comando === 'lettera_recente') {
    const l = scelta;
    const testo = corpoDellaLettera(l.testo).slice(0, TETTO);
    if (!testo) return { errore: `${quale[0].toUpperCase()}${quale.slice(1)} è vuota.` };
    await letta(l);
    return { ok: true, testo, fonte: l.fonte.etichetta, data: l.fonte.data, cosa: 'la lettera', mancanti: [], apri: await daAprire(l), saluto: salutoDellaLettera(l.testo), ...dove(l) };
  }
  // «Fino a…»: dalla lettera più recente — «la lettera» è quella (15.10.2026: prenderne una più vecchia senza dirlo
  // confonde). Se lì quella parte non è una parte a sé (per esempio i fattori di rischio citati dentro il racconto),
  // lo dice: dove fermarsi non si indovina.
  if (comando === 'fino') {
    if (!parti[0]) return { errore: 'Non ho capito fino a quale parte della lettera.' };
    const l = scelta;
    // col ripiego si prende TUTTO fino alla più lontana delle parti che ci sono (allergie scritte prima delle comorbidità comprese)
    const fino = finoAlPiuLontano(l.testo, parti[0], ripiego, esclusa);
    const testo = fino.testo.slice(0, TETTO), parte = fino.parte;
    const cosa = `la lettera fino ${esclusa ? 'a prima di' : 'a'} ${NOME_PARTE[parte]}${esclusa ? '' : ' compresa'}${parte !== parti[0] && !letteraFinoA(l.testo, parti[0], esclusa) ? ` (${NOME_PARTE[parti[0]]} non c'è)` : ''}`;
    if (!testo) return { errore: `Nella${numero !== null ? ` lettera numero ${numero}` : ' lettera più recente'} (${l.fonte.data}) ${[parte, ...ripiego.filter((r) => r !== parte)].map((k) => NOME_PARTE[k]).join(', ')} non ${ripiego.length ? 'sono parti' : 'è una parte'} a sé${parte === 'frcv' || parte === 'comorbidita' ? ` (con «${NOME_PARTE[parte]}:» a inizio riga)` : ''}: non so dove fermarmi. Chiedi la lettera intera, o fino a un'altra parte.` };
    await letta(l);
    return { ok: true, testo, fonte: l.fonte.etichetta, data: l.fonte.data, cosa, mancanti: [], apri: await daAprire(l), saluto: esclusa && parte === 'anamnesi' ? '' : salutoDellaLettera(l.testo), ...dove(l) };
  }
  // Le parti chieste: dalla più recente fra le ultime quattro lettere che ne ha almeno una (un biglietto può non
  // averne nessuna). Tutte dalla STESSA lettera: quelle che lì non ci sono vengono dette, non cercate altrove.
  if (!parti.length) return { errore: 'Non ho capito quale parte della lettera.' };
  for (const l of numero !== null ? [scelta] : lettere.slice(0, 4)) {
    const sue = partiDellaLettera(l.testo);
    const trovate = parti.filter((k) => sue[k]);
    if (!trovate.length) continue;
    await letta(l);
    return {
      ok: true, testo: trovate.map((k) => sue[k]).join('\n\n').slice(0, TETTO), fonte: l.fonte.etichetta, data: l.fonte.data,
      cosa: trovate.map((k) => NOME_PARTE[k]).join(', '), mancanti: parti.filter((k) => !sue[k]).map((k) => NOME_PARTE[k]), apri: await daAprire(l), ...dove(l),
    };
  }
  return { errore: numero !== null ? `Nella lettera numero ${numero} (${scelta.fonte.data}) non trovo: ${parti.map((k) => NOME_PARTE[k]).join(', ')}.` : `Nelle ultime lettere di questo paziente non trovo: ${parti.map((k) => NOME_PARTE[k]).join(', ')}.` };
}

// La lettera da mostrare accanto, com'è: per un referto della piattaforma il Word, per un documento il suo file.
async function apriDi(studioId: string, l: { testo: string; fonte: { tipo: 'referto' | 'documento' | 'pagine'; id: string; da?: number; a?: number } }): Promise<DaAprire> {
  let pdf = l.fonte.tipo === 'pagine', docx = l.fonte.tipo === 'referto';
  if (l.fonte.tipo === 'documento') { const [f] = await query<{ filename: string }>('select filename from patient_documents where id = $1 and studio_id = $2', [l.fonte.id, studioId]); const n = (f?.filename ?? '').toLowerCase(); pdf = n.endsWith('.pdf'); docx = n.endsWith('.docx'); }
  return { tipo: l.fonte.tipo, id: l.fonte.id, pdf, docx, da: l.fonte.da ?? null, a: l.fonte.a ?? null, testo: l.testo.replace(/\r\n?/g, '\n').trim().slice(0, 40000) };
}

// Le lettere del paziente in ordine di data, dalla più recente (21.10.2026, dallo studio: «quando chiedo di vedere una
// lettera, delle frecce per spostarmi da una lettera all'altra in ordine di data»): la stessa ricerca dei comandi, così
// le frecce partono proprio dalla lettera aperta. Qui solo etichetta e data; il testo arriva aprendone una.
export async function lettereDelPaziente(studioId: string, patientId: string): Promise<{ indice: number; fonte: string; data: string; tipo: string }[] | null> {
  const [p] = await query<{ cognome: string; nome: string }>('select cognome, nome from patients where id = $1 and studio_id = $2', [patientId, studioId]);
  if (!p) return null;
  const lettere = await lettereDelPazienteScelto(studioId, patientId, `${p.cognome} ${p.nome}`.trim());
  return lettere.map((l, indice) => ({ indice, fonte: l.fonte.etichetta, data: l.fonte.data, tipo: l.fonte.tipo }));
}
export async function apriLettera(studioId: string, userId: string | null, patientId: string, indice: number): Promise<{ ok: true; apri: DaAprire; fonte: string; data: string; indice: number; totale: number } | { errore: string }> {
  const [p] = await query<{ cognome: string; nome: string }>('select cognome, nome from patients where id = $1 and studio_id = $2', [patientId, studioId]);
  if (!p) return { errore: 'Paziente non trovato.' };
  const lettere = await lettereDelPazienteScelto(studioId, patientId, `${p.cognome} ${p.nome}`.trim());
  const l = lettere[indice];
  if (!l) return { errore: lettere.length ? 'Non c’è un’altra lettera.' : 'Nella cartella di questo paziente non trovo lettere.' };
  if (l.fonte.tipo !== 'referto') await logDocumento(l.fonte.id, 'lettura', { studioId, userId: userId ?? undefined, dettaglio: 'dittafono, lettera aperta accanto' }).catch(() => {});
  return { ok: true, apri: await apriDi(studioId, l), fonte: l.fonte.etichetta, data: l.fonte.data, indice, totale: lettere.length };
}
