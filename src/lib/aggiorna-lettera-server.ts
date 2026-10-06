import 'server-only';
import mammoth from 'mammoth';
import { query } from './db';
import { getFile } from './storage';
import { nomePerConfronto } from './referti-allegati';
import { pazienteDelReferto } from './referti-inviante';
import { formatoPerBozza } from './referti-medici';
import { etichettaDocumento } from './referti-allegato-blocco';
import { aggiorna, eFemminile, pulisciScansione, richiestaAggiornamento, stampella, type Correzione, type Proposta } from './aggiorna-lettera';
import { cercaPagine, etichettaData, lettereNellePagine, rxDataPagina, type DataCercata } from './cerca-in-cartella';
import { registraTestoMacchina } from './audit/lineage';
import { applicaGrassetti, grassettiDelCorpo, stessoTesto, type Grassetto } from './forma-lettera';
import { formaDelPdf, grassettiDelDocx } from './forma-lettera-server';

// Aggiornamento della lettera vecchia, lato piattaforma (28.9.2026). Parte
// SOLO se il medico lo chiede nel dettato («riprendimi la lettera del …») o
// se chi rivede sceglie a mano la lettera. Trova la lettera, costruisce la
// proposta (aggiorna-lettera.ts), la applica o la annulla: mai da sola.
// Solo per i medici in REFERTI_AGGIORNA_LETTERA (profili, virgola; di serie
// Marco Moccetti e Moschovitis). Nei log solo id abbreviati e numeri.

const REGOLE = 'aggiornamento della lettera vecchia con regole (src/lib/aggiorna-lettera.ts)';

export function medicoAggiornaLettera(medicoId: string | null | undefined): boolean {
  const elenco = (process.env.REFERTI_AGGIORNA_LETTERA ?? 'moccetti,moschovitis').split(',').map((x) => x.trim()).filter(Boolean);
  return !!medicoId && elenco.includes(medicoId);
}

export type Fonte = { tipo: 'referto' | 'documento' | 'pagine'; id: string; etichetta: string; data: string; da?: number; a?: number };
type Trovata = { fonte: Fonte; testo: string; grassetti?: Grassetto[] };

// La FORMA della lettera scelta (6.10.2026, richiesta dello studio: grassetto
// e a capo come nella lettera vecchia). Da un referto confermato: il
// grassetto che aveva lui. Dal Word: com'è scritto. Dal PDF: la pagina
// riletta dall'immagine — grassetto dal tratto, righe vuote e a capo dalla
// geometria; il testo riletto sostituisce quello dell'OCR solo se è lo stesso
// testo (85% delle parole), se no resta com'era e si prende solo il grassetto.
async function conForma(studioId: string, t: Trovata): Promise<Trovata> {
  if (t.grassetti) return t;
  try {
    if (t.fonte.tipo === 'referto') {
      const [r] = await query<{ forma: any }>(`select payload->'forma_lettera' as forma from referti_bozze where id = $1 and studio_id = $2`, [t.fonte.id, studioId]);
      return { ...t, grassetti: !r?.forma?.spento && Array.isArray(r?.forma?.grassetti) ? grassettiDelCorpo(r.forma.grassetti, t.testo) : [] };
    }
    const [d] = await query<{ storage_key: string; filename: string }>('select storage_key, filename from patient_documents where id = $1 and studio_id = $2', [t.fonte.id, studioId]);
    if (!d) return { ...t, grassetti: [] };
    const n = d.filename.toLowerCase();
    if (!n.endsWith('.docx') && !n.endsWith('.pdf')) return { ...t, grassetti: [] };
    const { body } = await getFile(d.storage_key);
    if (n.endsWith('.docx')) return { ...t, grassetti: grassettiDelCorpo(await grassettiDelDocx(body), t.testo) };
    const f = await formaDelPdf(t.fonte.id, body, t.fonte.da ?? 1, t.fonte.a ?? 4);
    if (!f) return { ...t, grassetti: [] };
    const riletto = pulisciScansione(f.righe.join('\n'));
    const testo = riletto.trim().length >= 200 && stessoTesto(t.testo, riletto) >= 0.85 ? riletto : t.testo;
    return { ...t, testo, grassetti: grassettiDelCorpo(f.grassetti, testo) };
  } catch (e: any) {
    console.error(`[forma-lettera] ${t.fonte.id.slice(0, 8)}: ${e?.code ?? e?.name ?? 'errore'}`);
    return { ...t, grassetti: [] };
  }
}

// Il grassetto salvato con la bozza e, fra quelle frasi, quali ci sono nel
// testo di adesso (la revisione mostra queste).
export type FormaBozza = { grassetti: Grassetto[]; presenti: string[]; spento: boolean; fonte: Fonte | null };
function formaSalvata(p: any, testo: string): FormaBozza | null {
  const f = p?.forma_lettera;
  if (!f || !Array.isArray(f.grassetti) || !f.grassetti.length) return null;
  const grassetti: Grassetto[] = f.grassetti.filter((g: any) => g && typeof g.testo === 'string');
  const presenti = grassetti.filter((g) => String(testo || '').split(/\n/).some((r) => applicaGrassetti(r, [g]).some((x) => x.b))).map((g) => g.testo);
  return { grassetti, presenti, spento: !!f.spento, fonte: f.fonte ?? null };
}

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
      const grezzo = (await testoDelFile(d.storage_key, d.filename)).join('\n');
      const testo = d.filename.toLowerCase().endsWith('.pdf') ? pulisciScansione(grezzo) : grezzo;
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
        const testo = pulisciScansione(pagine.slice(p.pagina_da - 1, p.pagina_a).join('\n'));
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
  applicato: { quando: string; fonte: Fonte; mesi: number; novita_aggiunte: number; automatico: boolean; novita: string[]; stampella?: boolean; correzioni?: Correzione[]; avviso?: string | null } | null;
  // La lettera chiesta non c'è: la più recente fa da aiuto (ortografia e impaginazione).
  stampella: { fonte: Fonte; testo: string; correzioni: Correzione[]; impaginata: boolean; grassetti: Grassetto[] } | null;
  // Il grassetto della lettera in gioco (proposta) e quello già salvato con la bozza.
  grassetti: Grassetto[];
  forma: FormaBozza | null;
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
  const vuoto: StatoAggiornamento = { abilitato: false, richiesta: null, applicato: null, fonte: null, proposta: null, errore: null, scelte: [], stampella: null, grassetti: [], forma: null };
  if (!medicoAggiornaLettera(p.medico?.id) || b.stato !== 'bozza') return vuoto;
  const base = { ...vuoto, abilitato: true, forma: formaSalvata(p, String(b.testo_finale ?? p.testo_corretto ?? '')) };
  const ag = p.aggiornamento_lettera;
  if (ag?.applicato_il) return { ...base, applicato: { quando: ag.applicato_il, fonte: ag.fonte, mesi: ag.mesi, novita_aggiunte: ag.novita_aggiunte ?? 0, automatico: !!ag.automatico, novita: Array.isArray(ag.novita) ? ag.novita : [], stampella: !!ag.stampella, correzioni: Array.isArray(ag.correzioni) ? ag.correzioni : [], avviso: ag.avviso ?? null } };

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
  const vecchia = trovate[0] ? await conForma(studioId, trovate[0]) : undefined;
  if (!vecchia) {
    const tutte = await elencoLettere(studioId, bozzaId, nome);
    const msg = !nome ? 'Manca il nome del paziente nei campi: senza, la lettera vecchia non si trova.'
      : data ? `Il medico chiede la lettera del ${etichettaData(data)}, ma non la trovo né tra i referti confermati né nella cartella.`
      : 'Nessuna lettera vecchia di questo paziente, né tra i referti confermati né nella cartella.';
    // Lettera chiesta che non c'è (1.10.2026, decisione dello studio): la più
    // recente del paziente fa da aiuto per ortografia e impaginazione; il
    // contenuto resta il dettato e l'avviso resta.
    const piu = !scelta && nome ? await letteraPiuRecente(studioId, bozzaId, nome) : null;
    if (piu) {
      const s = stampella({ lettera: piu.testo, dettato: String(b.testo_finale ?? grezzo), grassetti: piu.grassetti });
      return { ...base, richiesta, errore: msg, scelte: tutte, stampella: { fonte: piu.fonte, ...s, grassetti: piu.grassetti ?? [] } };
    }
    return { ...base, richiesta, errore: `${msg} Sceglila a mano.`, scelte: tutte };
  }
  const dettato = String(b.testo_finale ?? grezzo);
  let sesso: string | null = null;
  const patientId = await pazienteDelReferto(studioId, bozzaId);
  if (patientId) sesso = (await query<{ sesso: string | null }>('select sesso from patients where id = $1', [patientId]))[0]?.sesso ?? null;
  let formato: 'rapporto' | 'lettera' = 'lettera';
  try { formato = await formatoPerBozza(studioId, p.medico ?? null); } catch { /* lettera */ }
  // La data della visita vecchia, se la prima frase non la dice: quella del
  // referto confermato, o quella completa chiesta nel dettato.
  const dataLettera = vecchia.fonte.tipo === 'referto' ? vecchia.fonte.data : data?.g && data.m ? `${String(data.g).padStart(2, '0')}.${String(data.m).padStart(2, '0')}.${data.a}` : null;
  const r = aggiorna({ lettera: vecchia.testo, dettato, oggi: fmt(quando), femminile: eFemminile(sesso, dettato), unParagrafo: formato === 'lettera', dataLettera, grassetti: vecchia.grassetti });
  const scelte = trovate.length > 1 ? trovate.map((t) => t.fonte) : [];
  if ('errore' in r) return { ...base, richiesta, fonte: vecchia.fonte, errore: r.errore, scelte };
  return { ...base, richiesta, fonte: vecchia.fonte, proposta: r, scelte, grassetti: vecchia.grassetti ?? [] };
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
export async function applicaAggiornamento(studioId: string, bozzaId: string, utente: string | null, scelte: number[], automatico = false): Promise<{ ok: true } | { errore: string }> {
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
  // Le frasi nuove NON aggiunte restano scritte: dopo l'applicazione (anche
  // automatica) la revisione le mostra ancora, da aggiungere a mano.
  const traccia = { applicato_il: new Date().toISOString(), da: utente, automatico, fonte: s.fonte, mesi: p.mesi, novita_aggiunte: aggiunte.length, novita: p.novita.filter((f) => !aggiunte.includes(f)), vecchia: p.vecchia, somiglianza: p.somiglianza, prima };
  const [ok] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3,
            payload = jsonb_set(jsonb_set(payload, '{aggiornamento_lettera}', $4::jsonb), '{revisione_prototipo}', coalesce(payload->'revisione_prototipo', '{}'::jsonb) || '{"tolte": []}'::jsonb)
      where id = $1 and studio_id = $2 and stato = 'bozza' returning id`, [bozzaId, studioId, testo, JSON.stringify(traccia)]);
  if (!ok) return { errore: 'La bozza non è più aperta.' };
  await salvaForma(studioId, bozzaId, s.grassetti, s.fonte);
  await registraTestoMacchina({ studioId, bozzaId, nome: 'aggiornamento_lettera', modello: 'regole', regole: REGOLE, prima: prima ?? String(b?.payload?.testo_corretto ?? ''), dopo: testo, metadata: { automatico, somiglianza: p.somiglianza, novita_aggiunte: aggiunte.length } });
  console.log(`[aggiorna-lettera] ${bozzaId.slice(0, 8)}: applicato${automatico ? ' dalla catena' : ''} (${s.fonte.tipo}, somiglianza ${p.somiglianza}, ${aggiunte.length} frasi nuove, ${p.mesi} mesi)`);
  return { ok: true };
}

export async function annullaAggiornamento(studioId: string, bozzaId: string): Promise<{ ok: true } | { errore: string }> {
  const prima = (await bozza(studioId, bozzaId))?.testo_finale ?? null;
  const [ok] = await query<{ id: string; testo: string | null }>(
    `update referti_bozze set testo_finale = payload->'aggiornamento_lettera'->>'prima', payload = payload - 'aggiornamento_lettera' - 'forma_lettera'
      where id = $1 and studio_id = $2 and stato = 'bozza' and payload ? 'aggiornamento_lettera' returning id, coalesce(testo_finale, payload->>'testo_corretto') as testo`, [bozzaId, studioId]);
  if (!ok) return { errore: 'Niente da annullare.' };
  await registraTestoMacchina({ studioId, bozzaId, nome: 'aggiornamento_annullato', modello: 'regole', regole: REGOLE, prima, dopo: ok.testo ?? '' });
  console.log(`[aggiorna-lettera] ${bozzaId.slice(0, 8)}: annullato`);
  return { ok: true };
}

// Dentro la catena (28.9.2026, richiesta dello studio): appena la bozza
// arriva, se il medico ha chiesto di riprendere la lettera e la si trova, la
// lettera aggiornata diventa subito il testo della bozza — senza le frasi
// nuove, che restano da spuntare, e solo se le anamnesi si somigliano
// abbastanza (se no resta una proposta con l'avviso). «Annulla» torna al
// dettato. Best-effort: un intoppo qui non ferma la consegna.
export async function aggiornamentoAutomatico(studioId: string, bozzaId: string): Promise<'applicato' | 'proposta' | 'niente' | 'stampella'> {
  const s = await statoAggiornamento(studioId, bozzaId);
  if (s?.abilitato && s.richiesta && !s.proposta && s.stampella) {
    const r = await applicaStampella(studioId, bozzaId, null, true);
    return 'ok' in r ? 'stampella' : 'niente';
  }
  // Il medico non chiede nessuna lettera (5.10.2026, decisione dello studio):
  // la più recente del paziente fa lo stesso da aiuto per ortografia e
  // impaginazione, se c'è e se cambia qualcosa. Il contenuto resta il dettato.
  if (s?.abilitato && !s.richiesta && !s.applicato) {
    const r = await applicaStampella(studioId, bozzaId, null, true, true);
    return 'ok' in r ? 'stampella' : 'niente';
  }
  if (!s?.abilitato || !s.richiesta || !s.proposta) return 'niente';
  if (s.proposta.somiglianza < 0.35) return 'proposta';
  const r = await applicaAggiornamento(studioId, bozzaId, null, [], true);
  return 'ok' in r ? 'applicato' : 'proposta';
}

// Dopo l'applicazione: aggiungere le frasi nuove spuntate in fondo alla
// parte ripresa dalla lettera vecchia (se il testo è cambiato e quella parte
// non si trova più, si dice di aggiungerle a mano).
export async function aggiungiNovita(studioId: string, bozzaId: string, scelte: number[]): Promise<{ ok: true } | { errore: string }> {
  const b = await bozza(studioId, bozzaId);
  const ag = b?.payload?.aggiornamento_lettera;
  if (!b || b.stato !== 'bozza' || !ag?.applicato_il) return { errore: 'Niente da aggiungere.' };
  const novita: string[] = Array.isArray(ag.novita) ? ag.novita : [];
  const frasi = scelte.filter((i) => Number.isInteger(i) && i >= 0 && i < novita.length).map((i) => novita[i]);
  if (!frasi.length) return { errore: 'Scegli almeno una frase.' };
  const testo = String(b.testo_finale ?? '');
  const vecchia = String(ag.vecchia ?? '');
  const i = vecchia ? testo.indexOf(vecchia) : -1;
  if (i < 0) return { errore: 'Il testo è cambiato e non trovo più la parte ripresa dalla lettera vecchia: aggiungi la frase a mano.' };
  const fine = i + vecchia.length;
  const nuovo = `${testo.slice(0, fine)} ${frasi.join(' ')}${testo.slice(fine)}`;
  const resto = novita.filter((f) => !frasi.includes(f));
  const [ok] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3,
            payload = jsonb_set(jsonb_set(jsonb_set(payload, '{aggiornamento_lettera,novita}', $4::jsonb), '{aggiornamento_lettera,vecchia}', to_jsonb($5::text)),
                                '{aggiornamento_lettera,novita_aggiunte}', to_jsonb($6::int))
      where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
    [bozzaId, studioId, nuovo, JSON.stringify(resto), `${vecchia} ${frasi.join(' ')}`, (Number(ag.novita_aggiunte) || 0) + frasi.length]);
  return ok ? { ok: true } : { errore: 'La bozza non è più aperta.' };
}


// La lettera più recente del paziente, fra referti confermati, lettere in
// cartella e lettere dentro le cartelle scansionate (con la loro data, letta
// in testa alla lettera; se non c'è, la data del caricamento).
export async function letteraPiuRecente(studioId: string, bozzaId: string, nome: string): Promise<Trovata | null> {
  const cand: { t: Trovata; quando: number }[] = [];
  const conData = (d: Date | null, alt: Date) => (d ?? alt).getTime();
  for (const t of await lettereVecchie(studioId, bozzaId, nome, null)) {
    let quando = Number.NaN;
    if (t.fonte.tipo === 'referto') { const [g, m, a] = t.fonte.data.split('.').map(Number); quando = new Date(a, m - 1, g).getTime(); }
    else { const [l] = lettereNellePagine([t.testo]); const [g, m, a] = t.fonte.data.split('.').map(Number); quando = conData(l?.data ?? null, new Date(a, m - 1, g)); }
    if (!Number.isNaN(quando)) cand.push({ t: { ...t, fonte: { ...t.fonte, data: fmt(new Date(quando)) } }, quando });
  }
  const patientId = await pazienteDelReferto(studioId, bozzaId);
  if (patientId) {
    const docs = await query<{ id: string; filename: string; nota: string | null; storage_key: string; categoria: string | null }>(
      `select id, filename, nota, storage_key, categoria from patient_documents
        where patient_id = $1 and studio_id = $2 and (ocr_stato is null or ocr_stato <> 'da_fare') and lower(filename) like '%.pdf'
          and coalesce(categoria, '') <> 'lettera'
        order by uploaded_at desc limit 10`, [patientId, studioId]);
    for (const d of docs) {
      try {
        const pagine = await testoDelFile(d.storage_key, d.filename);
        if (pagine.length < 3) continue;
        for (const l of lettereNellePagine(pagine)) {
          if (!l.data) continue;
          const testo = pulisciScansione(pagine.slice(l.pagina_da - 1, l.pagina_a).join('\n'));
          if (testo.trim().length < 200) continue;
          const pp = l.pagina_da === l.pagina_a ? `p. ${l.pagina_da}` : `pp. ${l.pagina_da}–${l.pagina_a}`;
          cand.push({ t: { fonte: { tipo: 'pagine', id: d.id, etichetta: `${etichettaDocumento(d) || d.filename}, ${pp}`, data: fmt(l.data), da: l.pagina_da, a: l.pagina_a }, testo }, quando: l.data.getTime() });
        }
      } catch { /* file che non si legge */ }
    }
  }
  cand.sort((x, y) => y.quando - x.quando);
  return cand[0] ? conForma(studioId, cand[0].t) : null;
}

// Il grassetto della lettera vecchia salvato con la bozza: il Word e la
// revisione lo applicano dove le stesse frasi ricompaiono nel testo.
async function salvaForma(studioId: string, bozzaId: string, grassetti: Grassetto[] | undefined, fonte: Fonte): Promise<void> {
  if (!grassetti?.length) return;
  await query(`update referti_bozze set payload = jsonb_set(payload, '{forma_lettera}', $3::jsonb) where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [bozzaId, studioId, JSON.stringify({ grassetti: grassetti.slice(0, 80), fonte, quando: new Date().toISOString() })]);
}

// La revisione spegne o riaccende il grassetto, o toglie una frase.
export async function cambiaForma(studioId: string, bozzaId: string, c: { spento?: boolean; togli?: string }): Promise<{ ok: true } | { errore: string }> {
  const b = await bozza(studioId, bozzaId);
  const f = b?.payload?.forma_lettera;
  if (!b || b.stato !== 'bozza' || !f || !Array.isArray(f.grassetti)) return { errore: 'Niente grassetto da cambiare.' };
  const nuova = { ...f, ...(typeof c.spento === 'boolean' ? { spento: c.spento } : {}), ...(c.togli ? { grassetti: f.grassetti.filter((g: any) => g?.testo !== c.togli) } : {}) };
  await query(`update referti_bozze set payload = jsonb_set(payload, '{forma_lettera}', $3::jsonb) where id = $1 and studio_id = $2 and stato = 'bozza'`, [bozzaId, studioId, JSON.stringify(nuova)]);
  return { ok: true };
}

// Applica la lettera «stampella»: il dettato con l'ortografia e
// l'impaginazione della lettera più recente. «Annulla» torna al dettato.
// `forza`: chi rivede lo chiede anche se il dettato non indica una lettera
// (tasto «Usa la più recente come aiuto»).
export async function applicaStampella(studioId: string, bozzaId: string, utente: string | null, automatico = false, forza = false): Promise<{ ok: true } | { errore: string }> {
  const s = await statoAggiornamento(studioId, bozzaId);
  if (!s?.abilitato || s.applicato) return { errore: 'Non previsto per questo referto, o già applicato.' };
  const b = await bozza(studioId, bozzaId);
  let st = s.stampella;
  let avviso = s.errore;
  if (!st && forza && b) {
    const p = b.payload ?? {};
    const nome = String(b.campi_confermati?.nome_paziente ?? p.campi_estratti?.nome_paziente ?? '').trim();
    const piu = nome ? await letteraPiuRecente(studioId, bozzaId, nome) : null;
    if (!piu) return { errore: 'Nessuna lettera di questo paziente, né tra i referti confermati né nella cartella.' };
    st = { fonte: piu.fonte, ...stampella({ lettera: piu.testo, dettato: String(b.testo_finale ?? p.testo_corretto ?? ''), grassetti: piu.grassetti }), grassetti: piu.grassetti ?? [] };
    avviso = avviso ?? 'Il dettato non dice quale lettera riprendere: usata come aiuto la più recente.';
  }
  if (!st) return { errore: 'Nessuna lettera da usare come aiuto.' };
  const s2 = { ...s, stampella: st };
  const prima = b?.testo_finale ?? null;
  // Se la lettera non cambia niente (né una parola né l'impaginazione) non si
  // segna nulla: la bozza resta intatta.
  if (st.testo.trim() === String(prima ?? b?.payload?.testo_corretto ?? '').trim()) {
    // Il testo resta com'è, ma il grassetto della lettera vale lo stesso.
    if (!b?.payload?.forma_lettera) await salvaForma(studioId, bozzaId, st.grassetti.filter((g) => st!.testo.split(/\n/).some((r) => applicaGrassetti(r, [g]).some((x) => x.b))), st.fonte);
    return { errore: 'La lettera più recente non cambia niente in questo testo.' };
  }
  const traccia = {
    applicato_il: new Date().toISOString(), da: utente, automatico, stampella: true, fonte: st.fonte,
    correzioni: st.correzioni, impaginata: st.impaginata, avviso, prima, novita: [], novita_aggiunte: 0,
  };
  const [ok] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3, payload = jsonb_set(payload, '{aggiornamento_lettera}', $4::jsonb)
      where id = $1 and studio_id = $2 and stato = 'bozza' returning id`, [bozzaId, studioId, s2.stampella.testo, JSON.stringify(traccia)]);
  if (!ok) return { errore: 'La bozza non è più aperta.' };
  await salvaForma(studioId, bozzaId, st.grassetti, st.fonte);
  await registraTestoMacchina({ studioId, bozzaId, nome: 'aggiornamento_lettera', modello: 'regole', regole: `${REGOLE}: lettera più recente come aiuto (ortografia, impaginazione)`, prima: prima ?? String(b?.payload?.testo_corretto ?? ''), dopo: s2.stampella.testo, metadata: { automatico, stampella: true, correzioni: s2.stampella.correzioni.length } });
  console.log(`[aggiorna-lettera] ${bozzaId.slice(0, 8)}: lettera più recente come aiuto${automatico ? ' dalla catena' : ''} (${s2.stampella.fonte.tipo}, ${s2.stampella.correzioni.length} correzioni, impaginata ${s2.stampella.impaginata})`);
  return { ok: true };
}
