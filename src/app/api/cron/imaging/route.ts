import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query } from '@/lib/db';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { ingestaDicom } from '@/lib/imaging-ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Lo spool della ricezione DICOM → la cartella del paziente (18.9.2026).
//
// `imaging/ricevi-dicom.py` scrive i file che arrivano dagli apparecchi e poi
// chiama questa rotta. La chiama anche `mac/automazioni.sh` ogni quarto d'ora,
// perché un avviso può perdersi e un esame no: se l'app era ferma, al giro
// dopo i file sono ancora lì ed entrano lo stesso.
//
// I file si cancellano solo DOPO che l'esame è in cartella. Quelli che non si
// leggono finiscono in `scartati/`: non si buttano via, perché un file che
// l'apparecchio ci ha mandato è roba di un paziente.

const BASE = process.env.REFERTI_IMAGING_BASE ?? path.join(os.homedir(), 'referti-imaging');
const SPOOL = path.join(BASE, 'ingresso');
const SCARTATI = path.join(BASE, 'scartati');
const PER_GIRO = 400;

export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });

  let nomi: string[] = [];
  try {
    nomi = (await fs.readdir(SPOOL)).filter((n) => n.endsWith('.dcm')).sort().slice(0, PER_GIRO);
  } catch {
    return NextResponse.json({ ok: true, spool: 'assente', file: 0 });
  }
  if (!nomi.length) return NextResponse.json({ ok: true, file: 0 });

  // Un solo studio, oggi; il giorno che ce ne fossero due, l'apparecchio si
  // dichiara con l'AE Title e la scelta si farà da lì.
  const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
  if (!studio) return NextResponse.json({ errore: 'nessuno studio' }, { status: 500 });

  const file: Buffer[] = [];
  const letti: string[] = [];
  for (const n of nomi) {
    try {
      const b = await fs.readFile(path.join(SPOOL, n));
      file.push(b); letti.push(n);
    } catch { /* sparito mentre leggevamo: pazienza */ }
  }
  if (!file.length) return NextResponse.json({ ok: true, file: 0 });

  const r = await ingestaDicom(studio.id, file, { origine: 'rete', userId: null });

  // Cancellare solo ciò che è entrato davvero. Se non è entrato niente, i file
  // si mettono da parte: capirà una persona che cosa sono.
  if (r.esami.length) {
    for (const n of letti) { try { await fs.rm(path.join(SPOOL, n), { force: true }); } catch { /* al prossimo giro */ } }
  } else {
    await fs.mkdir(SCARTATI, { recursive: true }).catch(() => {});
    for (const n of letti) { try { await fs.rename(path.join(SPOOL, n), path.join(SCARTATI, n)); } catch { /* al prossimo giro */ } }
  }

  console.log(`[imaging] ricezione file=${letti.length} esami=${r.esami.length} nuovi=${r.nuovi} immagini=${r.immagini} scartati=${r.scartati}`);
  return NextResponse.json({ ok: true, file: letti.length, esami: r.esami.length, nuovi: r.nuovi, immagini: r.immagini, scartati: r.scartati });
}

// Il GET dice solo quanto c'è in coda: serve alla pagina Immagini.
export async function GET(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  try {
    const n = (await fs.readdir(SPOOL)).filter((x) => x.endsWith('.dcm')).length;
    return NextResponse.json({ ok: true, in_coda: n });
  } catch {
    return NextResponse.json({ ok: true, in_coda: 0, spool: 'assente' });
  }
}
