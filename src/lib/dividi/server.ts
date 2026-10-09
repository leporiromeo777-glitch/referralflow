import 'server-only';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { logDocumento } from '../cartella';
import { query } from '../db';
import { dopoCaricamento, valutaPdf } from '../documenti-ocr';
import { getFile, putFile } from '../storage';
import { abbinaPaziente } from '../imaging-ordina';
import { proponiAnagrafica } from '../pazienti-abbina-regole';
import { confronta, controllaPezzi, leggiPaziente, proponi, type Pezzo } from './tagli';

// Dividere una cartella completa (9.10.2026, [[Piattaforma/Dividi cartella]]) — il lato che tocca
// file e database. Le regole che propongono i tagli stanno in tagli.ts (pure). Qui: si legge il
// testo pagina per pagina (sul Mac, come sempre), si propone, e alla conferma `qpdf` copia le
// pagine tali e quali in tanti documenti nuovi della stessa cartella. L'originale non si tocca.
// Nei log e nel registro solo id abbreviati e conteggi: mai titoli, mai testo.
const QPDF = process.env.QPDF_BIN || '/opt/homebrew/bin/qpdf';
const ZIP = process.env.ZIP_BIN || '/usr/bin/zip';
const MAX_PAGINE = 1500;

function esegui(bin: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024, cwd }, (err, stdout) => {
      // qpdf: 3 = riuscito con avvisi (PDF un po' storti, frequenti negli scanner).
      if (err && !(bin === QPDF && (err as any).code === 3)) reject(Object.assign(new Error(path.basename(bin)), { code: (err as any).code ?? 'errore' }));
      else resolve(String(stdout));
    });
  });
}
async function inCartella<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-dividi-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => null); }
}

type Doc = { id: string; patient_id: string; filename: string; storage_key: string; ocr_stato: string | null; paziente: string };
async function documento(studioId: string, id: string): Promise<Doc | null> {
  const [d] = await query<Doc>(
    `select d.id, d.patient_id, d.filename, d.storage_key, d.ocr_stato, (p.cognome || ' ' || p.nome) as paziente
       from patient_documents d join patients p on p.id = d.patient_id where d.id = $1 and d.studio_id = $2`, [id, studioId]);
  return d && /\.pdf$/i.test(d.filename) ? d : null;
}

// Di chi è un PDF trascinato prima di scegliere il paziente: dal testo delle prime pagine (che manda il
// browser, già estratto: il file non si carica due volte) nome e data di nascita proposti, e la cartella
// che c'è già se combaciano con UNA persona. Del testo non resta niente: né nel database né nei log.
export async function chiE(studioId: string, testi: unknown) {
  const pagine = Array.isArray(testi) ? (testi as unknown[]).slice(0, 15).map((x) => String(x ?? '').slice(0, 8000)) : [];
  const letto = leggiPaziente(pagine);
  if (!letto) return { letto: null, trovato: null };
  const an = proponiAnagrafica(letto.nome);
  let trovato: { id: string; nome: string; nascita: string | null } | null = null;
  if (letto.nascita) {
    const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);
    const a = abbinaPaziente(letto.nome, letto.nascita, pazienti);
    const p = a.id ? pazienti.find((x) => x.id === a.id) : null;
    if (p) trovato = { id: p.id, nome: `${p.cognome} ${p.nome}`.trim(), nascita: p.data_nascita };
  }
  return { letto: { cognome: an.cognome, nome: an.nome, nascita: letto.nascita }, trovato };
}

// A che punto è la lettura (OCR) di una scansione: la pagina lo chiede ogni pochi secondi mentre aspetta,
// e per questo non apre il file e non scrive nel registro.
export async function statoLettura(studioId: string, id: string): Promise<{ ocr: string | null } | null> {
  const [d] = await query<{ ocr_stato: string | null }>(`select ocr_stato from patient_documents where id = $1 and studio_id = $2`, [id, studioId]);
  return d ? { ocr: d.ocr_stato } : null;
}

// I PDF di un paziente, per scegliere quale dividere.
export async function elencoPdf(studioId: string, patientId: string) {
  return query<{ id: string; filename: string; categoria: string; caricato: string; ocr_stato: string | null }>(
    `select id, filename, categoria, to_char(uploaded_at, 'YYYY-MM-DD') as caricato, ocr_stato from patient_documents
      where studio_id = $1 and patient_id = $2 and filename ilike '%.pdf' order by uploaded_at desc limit 200`, [studioId, patientId]);
}

// Il testo di ogni pagina, nell'ordine. Una pagina senza testo dà una stringa vuota.
async function testiPagine(dati: Buffer): Promise<string[] | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: dati });
    const r: any = await parser.getText();
    try { await parser.destroy(); } catch { /* ignora */ }
    const n: number = typeof r?.total === 'number' ? r.total : Array.isArray(r?.pages) ? r.pages.length : 0;
    if (!n) return null;
    const fuori: string[] = Array.from({ length: n }, () => '');
    for (const p of Array.isArray(r?.pages) ? r.pages : []) { const k = Number(p?.num ?? 0); if (k >= 1 && k <= n) fuori[k - 1] = String(p?.text ?? ''); }
    return fuori;
  } catch { return null; }
}

export type Analisi = { documento: { id: string; filename: string; patient_id: string; paziente: string }; pagine: number; con_testo: number; ocr: string | null; pezzi: Pezzo[] };
export async function analizza(studioId: string, userId: string, id: string): Promise<Analisi | { errore: string; stato: number }> {
  const d = await documento(studioId, id);
  if (!d) return { errore: 'Documento non trovato, o non è un PDF.', stato: 404 };
  let dati: Buffer;
  try { dati = (await getFile(d.storage_key)).body; } catch { return { errore: 'Il file non si trova più.', stato: 410 }; }
  const testi = await testiPagine(dati);
  if (!testi) return { errore: 'Il PDF non si legge.', stato: 422 };
  if (testi.length > MAX_PAGINE) return { errore: `Il PDF ha ${testi.length} pagine: se ne dividono al massimo ${MAX_PAGINE} per volta.`, stato: 413 };
  const pezzi = proponi(testi);
  const conTesto = testi.filter((t) => t.replace(/\s+/g, '').length > 20).length;
  await logDocumento(id, 'lettura', { studioId, userId, dettaglio: 'proposta di divisione' });
  console.log(`[dividi] ${id.slice(0, 8)}: ${testi.length} pagine, ${conTesto} con testo → ${pezzi.length} documenti proposti`);
  return { documento: { id: d.id, filename: d.filename, patient_id: d.patient_id, paziente: d.paziente }, pagine: testi.length, con_testo: conTesto, ocr: d.ocr_stato, pezzi };
}

export type Creato = { id: string; filename: string; pagine: number; categoria: string };
export async function crea(studioId: string, userId: string, id: string, grezzi: unknown, proposti: unknown): Promise<{ creati: Creato[] } | { errore: string; stato: number }> {
  const d = await documento(studioId, id);
  if (!d) return { errore: 'Documento non trovato, o non è un PDF.', stato: 404 };
  let dati: Buffer;
  try { dati = (await getFile(d.storage_key)).body; } catch { return { errore: 'Il file non si trova più.', stato: 410 }; }
  try {
    return await inCartella(async (dir) => {
      const ingresso = path.join(dir, 'ingresso.pdf');
      await fs.writeFile(ingresso, dati, { mode: 0o600 });
      const totale = Number((await esegui(QPDF, ['--show-npages', ingresso])).trim());
      const scelta = controllaPezzi(grezzi, totale);
      if ('errore' in scelta) return { errore: scelta.errore, stato: 400 };
      const creati: Creato[] = [];
      for (const [k, p] of scelta.pezzi.entries()) {
        const uscita = path.join(dir, `pezzo-${k}.pdf`);
        await esegui(QPDF, [ingresso, '--pages', '.', `${p.da}-${p.a}`, '--', uscita]);
        const pdf = await fs.readFile(uscita);
        const key = await putFile(pdf, 'application/pdf', '.pdf');
        const nome = `${p.titolo}.pdf`;
        const nota = `dalla cartella completa, ${p.da === p.a ? `pagina ${p.da}` : `pagine ${p.da}–${p.a}`}`;
        const [nuovo] = await query<{ id: string }>(
          `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`, [studioId, d.patient_id, nome, key, p.categoria, nota, userId]);
        await logDocumento(nuovo.id, 'caricamento', { studioId, userId, dettaglio: `diviso da ${id.slice(0, 8)}` });
        await dopoCaricamento(nuovo.id, pdf, '.pdf').catch(() => null);
        creati.push({ id: nuovo.id, filename: nome, pagine: p.a - p.da + 1, categoria: p.categoria });
        await fs.rm(uscita, { force: true });
      }
      // Quanto è servita la proposta: solo numeri (è la misura con cui si giudicano le regole).
      const prop = Array.isArray(proposti) ? (proposti as unknown[]).filter((x): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => Number.isInteger(n))) : [];
      const m = confronta(prop, scelta.pezzi);
      await logDocumento(id, 'lettura', { studioId, userId, dettaglio: `divisione: ${m.scelti} documenti, proposti ${m.proposti}, uguali ${m.uguali}` });
      console.log(`[dividi] ${id.slice(0, 8)}: creati ${m.scelti} documenti · proposti ${m.proposti} · rimasti uguali ${m.uguali}`);
      return { creati };
    });
  } catch { return { errore: 'Divisione non riuscita: il PDF non si legge.', stato: 422 }; }
}

// Tutti i documenti scelti in un file .zip, coi loro nomi (per chi li vuole fuori dalla piattaforma).
export async function zipDi(studioId: string, userId: string, ids: string[]): Promise<Buffer | { errore: string; stato: number }> {
  if (!ids.length || ids.length > 300) return { errore: 'Scegli da 1 a 300 documenti.', stato: 400 };
  const righe = await query<{ id: string; filename: string; storage_key: string }>(
    `select id, filename, storage_key from patient_documents where studio_id = $1 and id = any($2::uuid[])`, [studioId, ids]);
  if (righe.length !== new Set(ids).size) return { errore: 'Qualche documento non si trova.', stato: 404 };
  try {
    return await inCartella(async (dir) => {
      const visti = new Set<string>(); const nomi: string[] = [];
      for (const r of righe) {
        const pulito = r.filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'documento.pdf';
        let nome = pulito; for (let n = 2; visti.has(nome.toLowerCase()); n++) nome = pulito.replace(/(\.[^.]+)?$/, ` (${n})$1`);
        visti.add(nome.toLowerCase()); nomi.push(nome);
        await fs.writeFile(path.join(dir, nome), (await getFile(r.storage_key)).body, { mode: 0o600 });
        await logDocumento(r.id, 'lettura', { studioId, userId, dettaglio: 'scaricato in zip' });
      }
      await esegui(ZIP, ['-q', '-0', 'documenti.zip', ...nomi], dir);     // -0: i PDF sono già compressi
      return await fs.readFile(path.join(dir, 'documenti.zip'));
    });
  } catch { return { errore: 'Non riesco a preparare il file .zip.', stato: 500 }; }
}

export { valutaPdf };
