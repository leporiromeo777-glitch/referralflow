import 'server-only';
import mammoth from 'mammoth';
import { query } from './db';
import { getFile } from './storage';
import { nomePerConfronto } from './referti-allegati';
import { pazienteDelReferto } from './referti-inviante';
import { formatoPerBozza } from './referti-medici';
import { etichettaDocumento } from './referti-allegato-blocco';
import { aggiorna, eFemminile, richiestaAggiornamento, type Proposta } from './aggiorna-lettera';
import { cercaPagine, etichettaData, rxDataPagina, type DataCercata } from './cerca-in-cartella';

// Aggiornamento della lettera vecchia, lato piattaforma (28.9.2026). Parte
// SOLO se il medico lo chiede nel dettato («riprendimi la lettera del …») o
// se chi rivede sceglie a mano la lettera. Trova la lettera, costruisce la
// proposta (aggiorna-lettera.ts), la applica o la annulla: mai da sola.
// Solo per i medici in REFERTI_AGGIORNA_LETTERA (profili, virgola; di serie
// Marco Moccetti e Moschovitis). Nei log solo id abbreviati e numeri.

export function medicoAggiornaLettera(medicoId: string | null | undefined): boolean {
  const elenco = (process.env.REFERTI_AGGIORNA_LETTERA ?? 'moccetti,moschovitis').split(',').map((x) => x.trim()).filter(Boolean);
  return !!medicoId && elenco.includes(medicoId);
}

export type Fonte = { tipo: 'referto' | 'documento' | 'pagine'; id: string; etichetta: string; data: string; da?: number; a?: number };
type Trovata = { fonte: Fonte; testo: string };

const fmt = (d: Date | string) => new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
const stessaData = (quando: Date, d: DataCercata) => {
  const [g, m, a] = fmt(quando).split('.').map(Number);
  return a === d.a && (!d.m || m === d.m) && (!d.g || g === d.g);
};

async function testoDelFile(storageKey: string, filename: string): Promise<string[]> {
  const { body } = await getFile(storageKey);
  const n = filename.toLowerCase();
  if (n.endsWith('.txt')) return [body.toString('utf-8')];
  if (n.endsWith('.docx')) return [(await mammoth.extractRawText({ buffer: body })).value];
  const { PDFParse } = await import('pdf-parse');
  const p = new PDFParse({ data: body });
  const x: any = await p.getText();
  try { await p.destroy(); } catch { /* ignora */ }
  return Array.isArray(x?.pages) ? x.pages.map((q: any) => String(q?.text ?? '')) : [String(x?.text ?? '')];
}

// Le lettere vecchie possibili del paziente, dalla più recente: referti
// confermati, lettere della cartella (Word, testo, PDF). Con una data, solo
// quelle di quel giorno (o mese, o anno); se non c'è una lettera a sé, si
// cerca quella data dentro i PDF lunghi della cartella (la cartella
// cartacea scansionata intera) e si prendono le pagine della lettera.
export async function lettereVecchie(studioId: string, bozzaId: string, nomePaziente: string, data: DataCercata | null): Promise<Trovata[]> {
  const out: Trovata[] = [];
  const nome = nomePerConfronto(nomePaziente);
  if (nome && nome !== 'non indicato') {
    const referti = await query<{ id: string; testo_finale: string; quando: Date }>(
      `select id, testo_finale, coalesce((payload->>'dettato_il')::timestamptz, reviewed_at, created_at) as quando from referti_bozze
        where studio_id = $1 and id <> $2 and stato = 'confermata' and tipo = 'referto' and testo_finale is not null
          and coalesce((payload->>'ombra')::boolean, false) = false
          and regexp_replace(lower(trim(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', ''))), '[\\s,;.:]+', ' ', 'g') = $3
        order by quando desc limit 10`, [studioId, bozzaId, nome]);
    for (const r of referti) {
      if (r.testo_finale.trim().length < 200 || (data && !stessaData(r.quando, data))) continue;
      out.push({ fonte: { tipo: 'referto', id: r.id, etichetta: `referto confermato del ${fmt(r.quando)}`, data: fmt(r.quando) }, testo: r.testo_finale });
    }
  }
  const patientId = await pazienteDelReferto(studioId, bozzaId);
  if (!patientId) return out;
  const docs = await query<{ id: string; filename: string; nota: string | null; storage_key: string; uploaded_at: Date; ocr_stato: string | null; categoria: string | null }>(
    `select id, filename, nota, storage_key, uploaded_at, ocr_stato, categoria from patient_documents
      where patient_id = $1 and studio_id = $2 and (ocr_stato is null or ocr_stato <> 'da_fare')
        and (lower(filename) like '%.docx' or lower(filename) like '%.txt' or lower(filename) like '%.pdf')
      order by uploaded_at desc limit 20`, [patientId, studioId]);
  const rx = data ? rxDataPagina(data) : null;
  for (const d of docs.filter((x) => x.categoria === 'lettera')) {
    try {
      const testo = (await testoDelFile(d.storage_key, d.filename)).join('\n');
      if (testo.trim().length < 200) continue;
      if (rx && !rx.test(`${d.nota ?? ''} ${d.filename} ${testo.slice(0, 600)}`)) continue;
      out.push({ fonte: { tipo: 'documento', id: d.id, etichetta: `lettera in cartella: ${etichettaDocumento(d) || d.filename}`, data: fmt(d.uploaded_at) }, testo });
    } catch { /* file che non si legge */ }
  }
  if (data && !out.length) {
    for (const d of docs.filter((x) => x.categoria !== 'lettera' && x.filename.toLowerCase().endsWith('.pdf'))) {
      try {
        const pagine = await testoDelFile(d.storage_key, d.filename);
        if (pagine.length < 3) continue;
        const [p] = cercaPagine(pagine, { tipo: 'lettera', data, esplicita: true });
        if (!p) continue;
        const testo = pagine.slice(p.pagina_da - 1, p.pagina_a).join('\n');
        const pp = p.pagina_da === p.pagina_a ? `p. ${p.pagina_da}` : `pp. ${p.pagina_da}–${p.pagina_a}`;
        out.push({ fonte: { tipo: 'pagine', id: d.id, etichetta: `${etichettaDocumento(d) || d.filename}, ${pp}`, data: etichettaData(data), da: p.pagina_da, a: p.pagina_a }, testo });
      } catch { /* file che non si legge */ }
    }
  }
  return out;
}

// Solo l'elenco, senza aprire i file: per il tasto «Aggiorna una lettera
// vecchia…» quando il medico non l'ha chiesto.
export async function elencoLettere(studioId: string, bozzaId: string, nomePaziente: string): Promise<Fonte[]> {
  const out: Fonte[] = [];
  const nome = nomePerConfronto(nomePaziente);
  if (nome && nome !== 'non indicato') {
    const referti = await query<{ id: string; quando: Date }>(
      `select id, coalesce((payload->>'dettato_il')::timestamptz, reviewed_at, created_at) as quando from referti_bozze
        where studio_id = $1 and id <> $2 and stato = 'confermata' and tipo = 'referto' and length(coalesce(testo_finale, '')) >= 200
          and coalesce((payload->>'ombra')::boolean, false) = false
          and regexp_replace(lower(trim(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', ''))), '[\\s,;.:]+', ' ', 'g') = $3
        order by quando desc limit 10`, [studioId, bozzaId, nome]);
    for (const r of referti) out.push({ tipo: 'referto', id: r.id, etichetta: `referto confermato del ${fmt(r.quando)}`, data: fmt(r.quando) });
  }
  const patientId = await pazienteDelReferto(studioId, bozzaId);
  if (patientId) {
    const docs = await query<{ id: string; filename: string; nota: string | null; uploaded_at: Date }>(
      `select id, filename, nota, uploaded_at from patient_documents where patient_id = $1 and studio_id = $2 and categoria = 'lettera'
          and (lower(filename) like '%.docx' or lower(filename) like '%.txt' or lower(filename) like '%.pdf') order by uploaded_at desc limit 10`, [patientId, studioId]);
    for (const d of docs) out.push({ tipo: 'documento', id: d.id, etichetta: `lettera in cartella: ${etichettaDocumento(d) || d.filename}`, data: fmt(d.uploaded_at) });
  }
  return out;
}

type Bozza = { stato: string; testo_finale: string | null; payload: any; campi_confermati: any; created_at: Date };

async function bozza(studioId: string, id: string): Promise<Bozza | null> {
  const [b] = await query<Bozza>('select stato, testo_finale, payload, campi_confermati, created_at from referti_bozze where id = $1 and studio_id = $2', [id, studioId]);
  return b ?? null;
}

export type StatoAggiornamento = {
  abilitato: boolean;
  richiesta: { dal_dettato: boolean; data: string | null } | null;
  applicato: { quando: string; fonte: Fonte; mesi: number; novita_aggiunte: number } | null;
  fonte: Fonte | null;
  proposta: Proposta | null;
  errore: string | null;
  scelte: Fonte[];
};

// La regia sta in testa, a volte su due o tre frasi («Lettera al dottor
// Rossi. Riprendimi la lettera del 14 marzo.»).
function primaFrase(testo: string): string {
  return String(testo || '').replace(/\b(dr|dott|prof|med)\./gi, '$1 ').split(/(?<=[.!?])\s+|\n+/).slice(0, 3).join(' ');
}

export async function statoAggiornamento(studioId: string, bozzaId: string): Promise<StatoAggiornamento | null> {
  const b = await bozza(studioId, bozzaId);
  if (!b) return null;
  const p = b.payload ?? {};
  const vuoto: StatoAggiornamento = { abilitato: false, richiesta: null, applicato: null, fonte: null, proposta: null, errore: null, scelte: [] };
  if (!medicoAggiornaLettera(p.medico?.id) || b.stato !== 'bozza') return vuoto;
  const base = { ...vuoto, abilitato: true };
  const ag = p.aggiornamento_lettera;
  if (ag?.applicato_il) return { ...base, applicato: { quando: ag.applicato_il, fonte: ag.fonte, mesi: ag.mesi, novita_aggiunte: ag.novita_aggiunte ?? 0 } };

  const note = Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown): n is string => typeof n === 'string') : [];
  const quando = p.dettato_il && !Number.isNaN(Date.parse(p.dettato_il)) ? new Date(p.dettato_il) : new Date(b.created_at);
  const grezzo = String(p.testo_corretto ?? '');
  const dalDettato = richiestaAggiornamento(primaFrase(grezzo), note, quando);
  const scelta = p.aggiornamento_scelta && typeof p.aggiornamento_scelta === 'object' ? p.aggiornamento_scelta as { tipo: string; id: string; da?: number; a?: number } : null;
  const nome = String(b.campi_confermati?.nome_paziente ?? p.campi_estratti?.nome_paziente ?? '').trim();

  // Senza richiesta del medico né scelta a mano: solo l'elenco per il tasto
  // «Aggiorna una lettera vecchia…».
  if (!dalDettato && !scelta) return { ...base, scelte: await elencoLettere(studioId, bozzaId, nome) };
  const data = dalDettato?.data ?? null;
  const richiesta = { dal_dettato: !!dalDettato, data: data ? etichettaData(data) : null };
  let trovate = await lettereVecchie(studioId, bozzaId, nome, scelta ? null : data);
  if (scelta) trovate = trovate.filter((t) => t.fonte.tipo === scelta.tipo && t.fonte.id === scelta.id);
  const vecchia = trovate[0];
  if (!vecchia) {
    const tutte = await elencoLettere(studioId, bozzaId, nome);
    const msg = !nome ? 'Manca il nome del paziente nei campi: senza, la lettera vecchia non si trova.'
      : data ? `Il medico chiede la lettera del ${etichettaData(data)}, ma non la trovo né tra i referti confermati né nella cartella. Sceglila a mano.`
      : 'Nessuna lettera vecchia di questo paziente, né tra i referti confermati né nella cartella.';
    return { ...base, richiesta, errore: msg, scelte: tutte };
  }
  const dettato = String(b.testo_finale ?? grezzo);
  let sesso: string | null = null;
  const patientId = await pazienteDelReferto(studioId, bozzaId);
  if (patientId) sesso = (await query<{ sesso: string | null }>('select sesso from patients where id = $1', [patientId]))[0]?.sesso ?? null;
  let formato: 'rapporto' | 'lettera' = 'lettera';
  try { formato = await formatoPerBozza(studioId, p.medico ?? null); } catch { /* lettera */ }
  const r = aggiorna({ lettera: vecchia.testo, dettato, oggi: fmt(quando), femminile: eFemminile(sesso, dettato), unParagrafo: formato === 'lettera' });
  const scelte = trovate.length > 1 ? trovate.map((t) => t.fonte) : [];
  if ('errore' in r) return { ...base, richiesta, fonte: vecchia.fonte, errore: r.errore, scelte };
  return { ...base, richiesta, fonte: vecchia.fonte, proposta: r, scelte };
}

// Scelta a mano della lettera vecchia (anche senza richiesta del medico).
export async function scegliLettera(studioId: string, bozzaId: string, fonte: { tipo: string; id: string } | null): Promise<void> {
  if (!fonte) {
    await query(`update referti_bozze set payload = payload - 'aggiornamento_scelta' where id = $1 and studio_id = $2 and stato = 'bozza'`, [bozzaId, studioId]);
    return;
  }
  await query(`update referti_bozze set payload = jsonb_set(payload, '{aggiornamento_scelta}', $3::jsonb) where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [bozzaId, studioId, JSON.stringify({ tipo: fonte.tipo, id: fonte.id })]);
}

// Applica: le frasi nuove scelte entrano in fondo alla parte ripresa dalla
// lettera vecchia (dopo anamnesi e rischi, prima della visita di oggi).
export async function applicaAggiornamento(studioId: string, bozzaId: string, utente: string, scelte: number[]): Promise<{ ok: true } | { errore: string }> {
  const s = await statoAggiornamento(studioId, bozzaId);
  if (!s?.abilitato) return { errore: 'Non previsto per questo referto.' };
  if (s.applicato) return { errore: 'Già applicato.' };
  if (!s.proposta || !s.fonte) return { errore: s.errore ?? 'Nessuna proposta.' };
  const p = s.proposta;
  const aggiunte = scelte.filter((i) => Number.isInteger(i) && i >= 0 && i < p.novita.length).map((i) => p.novita[i]);
  let testo = p.testo;
  if (aggiunte.length) {
    const i = testo.indexOf(p.vecchia);
    if (i >= 0) testo = `${testo.slice(0, i + p.vecchia.length)} ${aggiunte.join(' ')}${testo.slice(i + p.vecchia.length)}`;
  }
  const b = await bozza(studioId, bozzaId);
  const prima = b?.testo_finale ?? null;
  const traccia = { applicato_il: new Date().toISOString(), da: utente, fonte: s.fonte, mesi: p.mesi, novita_aggiunte: aggiunte.length, somiglianza: p.somiglianza, prima };
  const [ok] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3,
            payload = jsonb_set(jsonb_set(payload, '{aggiornamento_lettera}', $4::jsonb), '{revisione_prototipo}', coalesce(payload->'revisione_prototipo', '{}'::jsonb) || '{"tolte": []}'::jsonb)
      where id = $1 and studio_id = $2 and stato = 'bozza' returning id`, [bozzaId, studioId, testo, JSON.stringify(traccia)]);
  if (!ok) return { errore: 'La bozza non è più aperta.' };
  console.log(`[aggiorna-lettera] ${bozzaId.slice(0, 8)}: applicato (${s.fonte.tipo}, somiglianza ${p.somiglianza}, ${aggiunte.length} frasi nuove, ${p.mesi} mesi)`);
  return { ok: true };
}

export async function annullaAggiornamento(studioId: string, bozzaId: string): Promise<{ ok: true } | { errore: string }> {
  const [ok] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = payload->'aggiornamento_lettera'->>'prima', payload = payload - 'aggiornamento_lettera'
      where id = $1 and studio_id = $2 and stato = 'bozza' and payload ? 'aggiornamento_lettera' returning id`, [bozzaId, studioId]);
  if (!ok) return { errore: 'Niente da annullare.' };
  console.log(`[aggiorna-lettera] ${bozzaId.slice(0, 8)}: annullato`);
  return { ok: true };
}
