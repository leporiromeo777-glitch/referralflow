import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { scadutiVia, svuotaSpool } from '@/lib/imaging-archivio';
import { riabbinaEsami } from '@/lib/imaging-catalogo';
import { filmatiVecchiVia } from '@/lib/imaging';
import { query } from '@/lib/db';

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

export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  // Lo spool lo svuota `svuotaSpool` (imaging-archivio.ts), un giro alla volta:
  // lo chiama anche il recupero dall'archivio appena l'esame è arrivato.
  let r;
  try { r = await svuotaSpool(); } catch { return NextResponse.json({ errore: 'nessuno studio' }, { status: 500 }); }
  // Le copie temporanee degli esami presi dall'archivio, scadute (6.10.2026).
  let scadute = 0;
  try { scadute = await scadutiVia(); } catch (e: any) { console.error(`[archivio] scadenze: ${e?.code ?? e?.name ?? 'errore'}`); }
  // Gli esami senza paziente (quelli catalogati dal NAS soprattutto) riprovano ad agganciarsi
  // alle cartelle nate nel frattempo (8.10.2026): stessa regola severa, solo conteggi nel registro.
  let riabbinati = 0;
  try {
    const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
    if (studio) riabbinati = await riabbinaEsami(studio.id);
    if (riabbinati) console.log(`[imaging] esami agganciati a una cartella nata dopo: ${riabbinati}`);
  } catch (e: any) { console.error(`[imaging] riabbinamento: ${e?.code ?? e?.name ?? 'errore'}`); }
  // I filmati preparati per la riproduzione che nessuno guarda da due settimane (9.10.2026).
  let filmati = 0;
  try { filmati = await filmatiVecchiVia(); } catch { /* la cache si pulisce al giro dopo */ }
  return NextResponse.json({ ok: true, ...r, scadute, riabbinati, filmati_tolti: filmati });
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
