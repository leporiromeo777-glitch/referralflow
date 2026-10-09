import 'server-only';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { query } from './db';
import { deleteFile, getFile, putFile } from './storage';
import { catenaOccupata } from './esporta-grezze';

// OCR dei documenti della cartella (28.9.2026, richiesta dello studio). Un
// PDF caricato senza testo — una scansione senza OCR, un'esportazione
// DocuWare fatta solo di immagini — non si cerca, e né l'assistente né le
// regole (ECG, allegati citati) lo leggono. Il Mac lo passa da `ocrmypdf`
// (Tesseract, italiano, tedesco, francese, inglese), in locale: nulla esce.
// `--skip-text` lascia com'è ogni pagina che il testo lo ha già; le immagini
// non si toccano (`--optimize 1` è senza perdita), si aggiunge solo lo strato
// di testo invisibile. Le pagine scritte a mano restano immagini.
//
// Quando: solo a catena ferma, come la pseudonimizzazione — Tesseract prende
// tutti i processori che gli si danno e la catena ha la precedenza. Un
// documento alla volta; il giro lo avviano il caricamento e
// mac/automazioni.sh (/api/cron/ocr, ogni quarto d'ora). Nei log solo id
// abbreviati e numeri.

const OCRMYPDF = process.env.OCRMYPDF_BIN || '/opt/homebrew/bin/ocrmypdf';
const LINGUE = process.env.OCR_LINGUE || 'ita+deu+fra+eng';
const PROCESSI = process.env.OCR_PROCESSI || '4';
const TIMEOUT_MS = 45 * 60_000;

export type ValutaPdf = { pagine: number | undefined; pagineConTesto: number; senzaTesto: boolean };

// Quante pagine e quante con testo vero (più di 20 caratteri). Senza testo:
// meno di 20 caratteri a pagina in media.
export async function valutaPdf(dati: Buffer): Promise<ValutaPdf | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: dati });
    const r: any = await parser.getText();
    try { await parser.destroy(); } catch { /* ignora */ }
    const pagine: number | undefined = typeof r?.total === 'number' ? r.total : Array.isArray(r?.pages) ? r.pages.length : undefined;
    const per: number[] = Array.isArray(r?.pages) ? r.pages.map((p: any) => String(p?.text ?? '').replace(/\s+/g, '').length) : [];
    const totale = per.length ? per.reduce((a, b) => a + b, 0) : String(r?.text ?? '').replace(/\s+/g, '').replace(/--\d+of\d+--/g, '').length;
    return { pagine, pagineConTesto: per.filter((n) => n > 20).length, senzaTesto: totale < Math.max(50, 20 * (pagine ?? 1)) };
  } catch {
    return null;
  }
}

// Dopo un caricamento nella cartella: se è un PDF senza testo, in coda per
// l'OCR e giro avviato (parte solo se la catena è ferma).
export async function dopoCaricamento(docId: string, dati: Buffer, ext: string): Promise<{ pagine?: number; senza_testo?: boolean; ocr?: 'in_coda' }> {
  if (ext !== '.pdf') return {};
  const v = await valutaPdf(dati);
  if (!v) return {};
  if (!v.senzaTesto) return { pagine: v.pagine, senza_testo: false };
  await query(`update patient_documents set ocr_stato = 'da_fare' where id = $1`, [docId]);
  void giroOcr().catch((e: any) => console.error(`[ocr] giro: ${e?.code ?? e?.name ?? 'errore'}`));
  return { pagine: v.pagine, senza_testo: true, ocr: 'in_coda' };
}

function esegui(ingresso: string, uscita: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(OCRMYPDF, ['--skip-text', '-l', LINGUE, '--jobs', PROCESSI, '--output-type', 'pdf', '--optimize', '1', '--rotate-pages', '-q', ingresso, uscita],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}` } },
      // stderr di ocrmypdf può contenere pezzi di testo del documento: mai nei log.
      (err) => (err ? reject(Object.assign(new Error('ocrmypdf'), { code: (err as any).code ?? 'errore' })) : resolve()));
  });
}

export async function ocrDocumento(id: string): Promise<'fatto' | 'fallito' | 'sparito'> {
  const [d] = await query<{ storage_key: string }>(`select storage_key from patient_documents where id = $1 and ocr_stato = 'da_fare'`, [id]);
  if (!d) return 'sparito';
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-ocr-'));
  const t0 = Date.now();
  try {
    const f = await getFile(d.storage_key);
    const ingresso = path.join(dir, 'ingresso.pdf');
    const uscita = path.join(dir, 'uscita.pdf');
    await fs.writeFile(ingresso, f.body, { mode: 0o600 });
    await esegui(ingresso, uscita);
    const nuovo = await fs.readFile(uscita);
    const v = await valutaPdf(nuovo);
    const key = await putFile(nuovo, 'application/pdf', '.pdf');
    // Solo se il documento è ancora quello di prima (nessuno l'ha tolto o
    // sostituito nel frattempo); se no il file nuovo si butta.
    const [ok] = await query<{ id: string }>(
      `update patient_documents set storage_key = $2, ocr_stato = 'fatto', ocr_at = now(), ocr_pagine_testo = $4
        where id = $1 and storage_key = $3 returning id`, [id, key, d.storage_key, v?.pagineConTesto ?? null]);
    if (!ok) { await deleteFile(key).catch(() => null); return 'sparito'; }
    await deleteFile(d.storage_key).catch(() => null);
    console.log(`[ocr] documento ${id.slice(0, 8)}: ${v?.pagineConTesto ?? '?'} di ${v?.pagine ?? '?'} pagine con testo, ${Math.round((Date.now() - t0) / 1000)} s, ${Math.round(f.body.length / 1024)} → ${Math.round(nuovo.length / 1024)} KB`);
    return 'fatto';
  } catch (e: any) {
    await query(`update patient_documents set ocr_stato = 'fallito', ocr_at = now() where id = $1 and ocr_stato = 'da_fare'`, [id]);
    console.error(`[ocr] documento ${id.slice(0, 8)}: non riuscito (${e?.code ?? e?.name ?? 'errore'})`);
    return 'fallito';
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

let inCorso = false;
export async function giroOcr(massimo = 20): Promise<{ esito: 'occupata' | 'in_corso' | 'fatto'; fatti: number; restano: number }> {
  if (inCorso) return { esito: 'in_corso', fatti: 0, restano: 0 };
  if (await catenaOccupata()) return { esito: 'occupata', fatti: 0, restano: 0 };
  inCorso = true;
  let fatti = 0, restano = 0;
  try {
    // Il prossimo della coda a ogni passo: un documento caricato mentre il
    // giro lavora entra nello stesso giro (prima restava al quarto d'ora dopo).
    const visti = new Set<string>();
    for (;;) {
      const [x] = await query<{ id: string }>(`select id from patient_documents where ocr_stato = 'da_fare' and not (id = any($1::uuid[])) order by uploaded_at limit 1`, [[...visti]]);
      if (!x) break;
      if (fatti >= massimo || (await catenaOccupata())) {
        [{ n: restano }] = await query<{ n: number }>(`select count(*)::int as n from patient_documents where ocr_stato = 'da_fare'`);
        break;
      }
      visti.add(x.id);
      if ((await ocrDocumento(x.id)) === 'fatto') fatti++;
    }
  } finally {
    inCorso = false;
  }
  if (fatti || restano) console.log(`[ocr] giro: ${fatti} fatti, ${restano} rimandati`);
  // Una cartella completa appena letta passa all'analisi (separatori e modello locale) senza aspettare che qualcuno la apra.
  if (fatti) void import('./dividi/analisi').then((m) => m.giroAnalisi()).catch(() => null);
  return { esito: 'fatto', fatti, restano };
}
