import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { CATEGORIE, isUuid, logDocumento } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { getFile, putFile } from '@/lib/storage';
import { dopoCaricamento } from '@/lib/documenti-ocr';
import { intervalliPagine } from '@/lib/pagine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Estrai pagine» (28.9.2026, richiesta dello studio): una cartella cartacea
// scansionata in un PDF solo (lettere, ECG, esami…) non si può allegare a una
// mail. Da qui si tagliano le pagine che servono in un documento nuovo della
// stessa cartella, con categoria e descrizione; l'originale resta com'è. Il
// taglio lo fa qpdf sul Mac: le pagine sono copiate tali e quali, testo OCR
// compreso. Nei log solo id abbreviati e numeri.
//   GET  → { pagine }
//   POST { pagine: "12-15, 20", categoria, nota } → { id, pagine }
const QPDF = process.env.QPDF_BIN || '/opt/homebrew/bin/qpdf';

function qpdf(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(QPDF, args, { timeout: 5 * 60_000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      // 3 = riuscito con avvisi (PDF un po' storti, frequenti negli scanner).
      if (err && (err as any).code !== 3) reject(Object.assign(new Error('qpdf'), { code: (err as any).code ?? 'errore' }));
      else resolve(String(stdout));
    });
  });
}

async function documento(id: string) {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'patients');
  if (no) return { errore: no };
  if (!isUuid(id)) return { errore: NextResponse.json({ errore: 'non_trovato' }, { status: 404 }) };
  const [d] = await query<{ patient_id: string; filename: string; storage_key: string }>(
    'select patient_id, filename, storage_key from patient_documents where id = $1 and studio_id = $2', [id, session.studioId]);
  if (!d) return { errore: NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 }) };
  if (!/\.pdf$/i.test(d.filename)) return { errore: NextResponse.json({ errore: 'Si possono estrarre pagine solo da un PDF.' }, { status: 415 }) };
  return { session, d };
}

async function conPdf<T>(storageKey: string, fn: (dir: string, ingresso: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-estrai-'));
  try {
    const f = await getFile(storageKey);
    const ingresso = path.join(dir, 'ingresso.pdf');
    await fs.writeFile(ingresso, f.body, { mode: 0o600 });
    return await fn(dir, ingresso);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const r = await documento(params.id);
  if (r.errore) return r.errore;
  try {
    const n = await conPdf(r.d.storage_key, async (_dir, ingresso) => Number((await qpdf(['--show-npages', ingresso])).trim()));
    return NextResponse.json({ pagine: n }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ errore: 'Il PDF non si legge.' }, { status: 422 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const r = await documento(params.id);
  if (r.errore) return r.errore;
  const { session, d } = r;
  const c = await req.json().catch(() => null);
  const categoriaRaw = String(c?.categoria ?? '').trim();
  const categoria = categoriaRaw in CATEGORIE ? categoriaRaw : 'altro';
  const nota = String(c?.nota ?? '').trim().slice(0, 200) || null;
  try {
    const esito = await conPdf(d.storage_key, async (dir, ingresso) => {
      const totale = Number((await qpdf(['--show-npages', ingresso])).trim());
      const scelta = intervalliPagine(String(c?.pagine ?? ''), totale);
      if ('errore' in scelta) return scelta;
      const uscita = path.join(dir, 'uscita.pdf');
      await qpdf([ingresso, '--pages', '.', scelta.qpdf, '--', uscita]);
      return { dati: await fs.readFile(uscita), scelta };
    });
    if ('errore' in esito) return NextResponse.json({ errore: esito.errore }, { status: 400 });
    const base = d.filename.replace(/\.pdf$/i, '').slice(0, 120);
    const nome = `${base} – pp. ${esito.scelta.etichetta}.pdf`;
    const key = await putFile(esito.dati, 'application/pdf', '.pdf');
    const [nuovo] = await query<{ id: string }>(
      `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`, [session.studioId, d.patient_id, nome, key, categoria, nota, session.id]);
    await logDocumento(params.id, 'lettura', { studioId: session.studioId, userId: session.id, dettaglio: 'estrazione pagine' });
    await logDocumento(nuovo.id, 'caricamento', { studioId: session.studioId, userId: session.id, dettaglio: `estratto da ${params.id.slice(0, 8)}` });
    await dopoCaricamento(nuovo.id, esito.dati, '.pdf');
    console.log(`[cartella] estratte ${esito.scelta.quante} pagine da ${params.id.slice(0, 8)} → ${nuovo.id.slice(0, 8)}`);
    return NextResponse.json({ id: nuovo.id, pagine: esito.scelta.quante }, { status: 201 });
  } catch {
    return NextResponse.json({ errore: 'Estrazione non riuscita: il PDF non si legge.' }, { status: 422 });
  }
}
